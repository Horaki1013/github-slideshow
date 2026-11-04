#!/usr/bin/env node
/* =====================================================================
   Servidor local de la plataforma de cotizaciones Techvalue
   ---------------------------------------------------------------------
   - Corre en un servidor de la empresa (Windows Server o Linux). Sin nube.
   - Requiere solo Node.js 22.13 o superior (trae SQLite incorporado).
   - Guarda todo en datos/plataforma.sqlite (registro por registro) y los
     archivos (documentos, hojas de datos) en datos/archivos/.
   - Una escritura a la vez con bloqueo de corta duración: decenas de
     usuarios trabajan a la vez sin pisarse ni perder cambios.
   - Respaldos automáticos (cada 2 horas en horario laboral y cada noche),
     30 días, con copia opcional a otra carpeta o disco.
   - Tipo de cambio del día (SUNAT / Banco Central de Chile) y copia de las
     hojas de datos de los productos para anexarlas a las cotizaciones.

   Uso:
     node servidor.js                      inicia el servidor (config.json)
     node servidor.js importar datos.json  carga un respaldo (.json de la plataforma)
     node servidor.js respaldo             crea un respaldo ahora
     node servidor.js restaurar archivo    restaura un respaldo .sqlite (con el servidor detenido)
     node servidor.js probar-m365 correo   prueba el envío por Microsoft 365
   ===================================================================== */
'use strict';
process.removeAllListeners('warning');
process.on('warning', w => { if (w.name !== 'ExperimentalWarning') console.warn(w.message); });
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const BASE = __dirname;
const CONFIG_DEF = {
  puerto: 8080,
  html: 'Techvalue-Piloto.html',          // la plataforma (el mismo HTML que se abre con doble clic)
  datos: 'datos',                         // base de datos y archivos
  respaldos: 'respaldos',                 // respaldos automáticos
  copiaRespaldos: '',                     // otra carpeta o disco donde se copia cada respaldo (p. ej. D:\\Respaldos-Cotizaciones)
  diasRespaldo: 30,
  horasRespaldo: [10, 12, 14, 16, 18],    // respaldos en horario laboral (además del de la noche)
  horaNoche: 23,
  tipoCambio: true,                       // bajar el tipo de cambio del día (requiere salida a internet)
  hojasDeDatos: true,                     // descargar y guardar copia de las hojas de datos
  microsoft365: null,                     // { tenantId, clientId, clientSecret, buzonComun, remitente, teamsWebhook } (ver LEEME-SERVIDOR)
  demo: false,                            // permite inicializar con data simulada (modelo para el programador)
};
const CONFIG = (() => {
  let c = {};
  try { c = JSON.parse(fs.readFileSync(path.join(BASE, 'config.json'), 'utf8')); } catch (e) { /* sin config.json: valores por defecto */ }
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    const m = /^--(\w+)$/.exec(a[i]); if (!m) continue;
    const k = m[1], v = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
    c[k] = k === 'puerto' ? +v : v === 'true' ? true : v === 'false' ? false : v;
  }
  return Object.assign({}, CONFIG_DEF, c);
})();
const ruta = p => path.isAbsolute(p) ? p : path.join(BASE, p);
const DIR_DATOS = ruta(CONFIG.datos), DIR_ARCH = path.join(DIR_DATOS, 'archivos'), DIR_RESP = ruta(CONFIG.respaldos);
const ARCHIVO_DB = path.join(DIR_DATOS, 'plataforma.sqlite');
[DIR_DATOS, DIR_ARCH, DIR_RESP].forEach(d => fs.mkdirSync(d, { recursive: true }));
const log = (...m) => console.log(new Date().toLocaleString('es-PE'), '·', ...m);

/* ---------- Base de datos ---------- */
let db = null;
function abrir() {
  db = new DatabaseSync(ARCHIVO_DB);
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS registros (coleccion TEXT NOT NULL, id TEXT NOT NULL, datos TEXT, version INTEGER NOT NULL, borrado INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (coleccion, id));
    CREATE INDEX IF NOT EXISTS registros_version ON registros (version);
    CREATE TABLE IF NOT EXISTS meta (clave TEXT PRIMARY KEY, valor TEXT);
    CREATE TABLE IF NOT EXISTS operaciones (id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT NOT NULL, usuario TEXT, ip TEXT, registros INTEGER, borrados INTEGER, version INTEGER);
    CREATE TABLE IF NOT EXISTS sesiones (token TEXT PRIMARY KEY, usuario_id TEXT NOT NULL, nombre TEXT, creado TEXT NOT NULL, visto TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tipos_cambio (fecha TEXT NOT NULL, moneda TEXT NOT NULL, pais TEXT NOT NULL, valor REAL NOT NULL, fuente TEXT, PRIMARY KEY (fecha, moneda, pais));
    CREATE TABLE IF NOT EXISTS hojas (url TEXT PRIMARY KEY, archivo TEXT, tipo TEXT, bytes INTEGER, descargada TEXT, revisada TEXT, estado TEXT, error TEXT);
    CREATE TABLE IF NOT EXISTS envios (id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT NOT NULL, de TEXT, para TEXT, asunto TEXT, estado TEXT, error TEXT);`);
  if (!meta('epoca')) meta('epoca', crypto.randomUUID());
}
function meta(k, v) {
  if (v === undefined) { const r = db.prepare('SELECT valor FROM meta WHERE clave = ?').get(k); return r ? r.valor : null; }
  db.prepare('INSERT INTO meta (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor').run(k, String(v));
}
const versionActual = () => +(meta('version') || 0);
const vacia = () => !db.prepare('SELECT 1 FROM registros WHERE borrado = 0 LIMIT 1').get();
function transaccion(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { try { db.exec('ROLLBACK'); } catch (e2) { /* sin transacción */ } throw e; }
}
/** Aplica cambios [[coleccion, id, json], …] y borrados [[coleccion, id], …]; devuelve la versión nueva */
function aplicar(cambios, borrados, usuario, ip) {
  return transaccion(() => {
    const v = versionActual() + 1;
    const up = db.prepare('INSERT INTO registros (coleccion, id, datos, version, borrado) VALUES (?, ?, ?, ?, 0) ON CONFLICT(coleccion, id) DO UPDATE SET datos = excluded.datos, version = excluded.version, borrado = 0');
    const del = db.prepare('UPDATE registros SET datos = NULL, version = ?, borrado = 1 WHERE coleccion = ? AND id = ?');
    for (const [c, id, d] of cambios) { if (typeof d !== 'string') throw new Error('Registro inválido.'); JSON.parse(d); up.run(String(c), String(id), d, v); }
    for (const [c, id] of borrados) del.run(v, String(c), String(id));
    meta('version', v);
    db.prepare('INSERT INTO operaciones (fecha, usuario, ip, registros, borrados, version) VALUES (?, ?, ?, ?, ?, ?)').run(new Date().toISOString(), usuario || '', ip || '', cambios.length, borrados.length, v);
    return v;
  });
}
const registro = (c, id) => { const r = db.prepare('SELECT datos FROM registros WHERE coleccion = ? AND id = ? AND borrado = 0').get(c, id); return r ? JSON.parse(r.datos) : null; };
function usuarios() {
  const orden = registro('users', '#orden');
  if (orden) return db.prepare("SELECT datos FROM registros WHERE coleccion = 'users' AND id <> '#orden' AND borrado = 0").all().map(r => JSON.parse(r.datos));
  return registro('_', 'users') || [];
}

/* ---------- Sesiones ---------- */
const sha256 = t => crypto.createHash('sha256').update(t, 'utf8').digest('hex');
function claveOk(u, clave) { return !!u && (u.claveHash ? sha256((u.salt || '') + clave) === u.claveHash : u.clave === clave); }
function crearSesion(u) {
  const t = crypto.randomBytes(24).toString('hex'), ahora = new Date().toISOString();
  db.prepare('INSERT INTO sesiones (token, usuario_id, nombre, creado, visto) VALUES (?, ?, ?, ?, ?)').run(t, u.id, u.nombre || u.usuario, ahora, ahora);
  return t;
}
function sesion(req) {
  const t = req.headers['x-sesion']; if (!t) return null;
  const s = db.prepare('SELECT * FROM sesiones WHERE token = ?').get(String(t)); if (!s) return null;
  const u = usuarios().find(x => x.id === s.usuario_id);
  if (!u || u.activo === false) { db.prepare('DELETE FROM sesiones WHERE token = ?').run(s.token); return null; }
  if (Date.now() - Date.parse(s.visto) > 60000) db.prepare('UPDATE sesiones SET visto = ? WHERE token = ?').run(new Date().toISOString(), s.token);
  return { token: s.token, usuario: u };
}
setInterval(() => { try { db.prepare('DELETE FROM sesiones WHERE visto < ?').run(new Date(Date.now() - 14 * 864e5).toISOString()); } catch (e) { /* sin efecto */ } }, 3600e3).unref();

/* ---------- Bloqueo: una escritura a la vez (los demás esperan su turno) ---------- */
const BLOQUEO_MS = 30000;
let bloqueo = null;            // { token, quien, hasta }
const esperando = [];
function tomarBloqueo(token, quien, espera = 25000) {
  return new Promise((res, rej) => {
    const intentar = () => {
      if (!bloqueo || bloqueo.hasta < Date.now() || bloqueo.token === token) { bloqueo = { token, quien, hasta: Date.now() + BLOQUEO_MS }; res(true); return true; }
      return false;
    };
    if (intentar()) return;
    const item = { intentar, rej, t: setTimeout(() => { esperando.splice(esperando.indexOf(item), 1); rej(new Error(`El servidor está ocupado guardando cambios de ${bloqueo ? bloqueo.quien : 'otro usuario'}. Intenta de nuevo.`)); }, espera) };
    esperando.push(item);
  });
}
function soltarBloqueo(token) {
  if (bloqueo && bloqueo.token === token) bloqueo = null;
  while (esperando.length && !bloqueo) { const it = esperando.shift(); clearTimeout(it.t); it.intentar(); }
}
setInterval(() => { if (bloqueo && bloqueo.hasta < Date.now()) soltarBloqueo(bloqueo.token); }, 1000).unref();

/* ---------- Respaldos ---------- */
const sello = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
function copiarArchivos(origen, destino) {   // copia incremental: solo lo que falta
  if (!fs.existsSync(origen)) return 0; let n = 0;
  fs.mkdirSync(destino, { recursive: true });
  for (const e of fs.readdirSync(origen, { withFileTypes: true })) {
    const o = path.join(origen, e.name), d = path.join(destino, e.name);
    if (e.isDirectory()) n += copiarArchivos(o, d);
    else if (!fs.existsSync(d) || fs.statSync(d).size !== fs.statSync(o).size) { fs.copyFileSync(o, d); n++; }
  }
  return n;
}
function respaldar(motivo) {
  const nombre = `plataforma-${sello()}.sqlite`, destino = path.join(DIR_RESP, nombre);
  if (fs.existsSync(destino)) return nombre;
  db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
  copiarArchivos(DIR_ARCH, path.join(DIR_RESP, 'archivos'));
  if (CONFIG.copiaRespaldos) {
    try { const c = ruta(CONFIG.copiaRespaldos); fs.mkdirSync(c, { recursive: true }); fs.copyFileSync(destino, path.join(c, nombre)); copiarArchivos(DIR_ARCH, path.join(c, 'archivos')); }
    catch (e) { log('No se pudo copiar el respaldo a', CONFIG.copiaRespaldos, '·', e.message); }
  }
  // Se conservan los de los últimos N días (siempre al menos uno por día)
  const limite = Date.now() - CONFIG.diasRespaldo * 864e5;
  for (const f of listaRespaldos()) if (f.fecha < limite) { try { fs.unlinkSync(path.join(DIR_RESP, f.nombre)); } catch (e) { /* en uso */ } }
  meta('ultimoRespaldo', new Date().toISOString());
  log('Respaldo creado:', nombre, motivo ? '(' + motivo + ')' : '');
  return nombre;
}
function listaRespaldos() {
  return fs.readdirSync(DIR_RESP).filter(n => /^plataforma-.*\.sqlite$/.test(n))
    .map(n => { const s = fs.statSync(path.join(DIR_RESP, n)); return { nombre: n, bytes: s.size, fecha: s.mtimeMs }; }).sort((a, b) => b.fecha - a.fecha);
}
function restaurar(nombre) {
  const origen = path.isAbsolute(nombre) ? nombre : path.join(DIR_RESP, path.basename(nombre));
  if (!fs.existsSync(origen)) throw new Error('No existe el respaldo ' + nombre);
  try { respaldar('antes de restaurar'); } catch (e) { /* se restaura igual */ }
  const prueba = new DatabaseSync(origen, { readOnly: true }); prueba.prepare('SELECT count(*) n FROM registros').get(); prueba.close();
  const sesionesActivas = db.prepare('SELECT * FROM sesiones').all();   // nadie pierde su sesión al restaurar
  db.close();
  for (const s of ['-wal', '-shm']) { try { fs.unlinkSync(ARCHIVO_DB + s); } catch (e) { /* no había */ } }
  fs.copyFileSync(origen, ARCHIVO_DB);
  abrir();
  const ins = db.prepare('INSERT OR REPLACE INTO sesiones (token, usuario_id, nombre, creado, visto) VALUES (?, ?, ?, ?, ?)');
  sesionesActivas.forEach(s => ins.run(s.token, s.usuario_id, s.nombre, s.creado, s.visto));
  meta('epoca', crypto.randomUUID());      // los navegadores conectados vuelven a cargar todo
  meta('version', versionActual() + 1);
  log('Respaldo restaurado:', path.basename(origen));
}
let ultimaHora = null;
setInterval(() => {
  const d = new Date(), h = d.getHours(), clave = d.toDateString() + h;
  if (d.getMinutes() > 5 || clave === ultimaHora) return;
  const laboral = d.getDay() >= 1 && d.getDay() <= 6 && CONFIG.horasRespaldo.includes(h);
  if (laboral || h === CONFIG.horaNoche) { ultimaHora = clave; try { if (!vacia()) respaldar(h === CONFIG.horaNoche ? 'noche' : 'horario laboral'); } catch (e) { log('Error de respaldo:', e.message); } }
}, 60000).unref();

/* ---------- Tipo de cambio del día ---------- */
// Perú: SUNAT (venta) vía el servicio público de la SBS/SUNAT; Chile: Banco Central de Chile (dólar observado y euro).
// Si no hay internet, se usa el último disponible y el vendedor puede editarlo en cada cotización.
const FUENTES_TC = {
  PE: async () => {
    const r = await fetchJson('https://api.apis.net.pe/v1/tipo-cambio-sunat');
    const usd = +r.venta; if (!(usd > 0)) throw new Error('SUNAT sin dato');
    const eur = await fetchJson('https://api.frankfurter.app/latest?from=EUR&to=USD').then(x => +x.rates.USD).catch(() => null);
    const clp = await fetchJson('https://mindicador.cl/api/dolar').then(x => +x.serie[0].valor).catch(() => null);
    const out = [['USD', usd, 'SUNAT']];
    if (eur) out.push(['EUR', +(usd * eur).toFixed(4), 'SUNAT × BCE']);
    if (clp) out.push(['CLP', +(usd / clp).toFixed(6), 'SUNAT ÷ Banco Central de Chile']);
    return out;   // soles por unidad de la moneda
  },
  CL: async () => {
    const r = await fetchJson('https://mindicador.cl/api');
    const usd = +r.dolar.valor, eur = +r.euro.valor; if (!(usd > 0)) throw new Error('Banco Central sin dato');
    const pen = await fetchJson('https://api.apis.net.pe/v1/tipo-cambio-sunat').then(x => +x.venta).catch(() => null);
    const out = [['USD', usd, 'Banco Central de Chile (dólar observado)'], ['EUR', eur, 'Banco Central de Chile (euro)']];
    if (pen) out.push(['PEN', +(usd / pen).toFixed(4), 'Banco Central de Chile ÷ SUNAT']);
    return out;   // pesos por unidad de la moneda
  },
};
function fetchJson(url) {
  return fetch(url, { headers: { 'User-Agent': 'plataforma-cotizaciones' }, signal: AbortSignal.timeout(15000) }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
}
const hoyISO = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
async function actualizarTipoCambio() {
  if (!CONFIG.tipoCambio) return;
  for (const pais of Object.keys(FUENTES_TC)) {
    try {
      const filas = await FUENTES_TC[pais]();
      const st = db.prepare('INSERT INTO tipos_cambio (fecha, moneda, pais, valor, fuente) VALUES (?, ?, ?, ?, ?) ON CONFLICT(fecha, moneda, pais) DO UPDATE SET valor = excluded.valor, fuente = excluded.fuente');
      filas.forEach(([m, v, f]) => st.run(hoyISO(), m, pais, v, f));
      log(`Tipo de cambio ${pais}:`, filas.map(f => f[0] + ' ' + f[1]).join(' · '));
    } catch (e) { log(`Tipo de cambio ${pais}: no disponible (${e.message}); se usa el último guardado`); }
  }
}
function tiposCambio() {
  const out = {};
  for (const pais of ['PE', 'CL']) {
    const filas = db.prepare('SELECT moneda, valor, fecha, fuente FROM tipos_cambio t WHERE pais = ? AND fecha = (SELECT max(fecha) FROM tipos_cambio WHERE pais = t.pais AND moneda = t.moneda)').all(pais);
    out[pais] = Object.fromEntries(filas.map(f => [f.moneda, { valor: f.valor, fecha: f.fecha, fuente: f.fuente }]));
  }
  return out;
}
let ultimoTC = null;
setInterval(() => { const d = new Date(); if (d.getHours() >= 8 && ultimoTC !== hoyISO()) { ultimoTC = hoyISO(); actualizarTipoCambio(); } }, 10 * 60000).unref();

/* ---------- Hojas de datos y anexos por link: se guarda una copia ---------- */
const MAX_HOJA = 25 * 1024 * 1024;
async function descargarHoja(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (plataforma-cotizaciones)' }, redirect: 'follow', signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error('El link respondió ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > MAX_HOJA) throw new Error('El archivo supera 25 MB');
  if (buf.subarray(0, 5).toString() !== '%PDF-') throw new Error('El link no entrega un PDF (puede ser una página web)');
  return buf;
}
async function hoja(url, forzar) {
  if (!/^https?:\/\//i.test(url)) throw new Error('Link no válido');
  const fila = db.prepare('SELECT * FROM hojas WHERE url = ?').get(url);
  const fresca = fila && fila.archivo && fila.estado === 'ok' && Date.now() - Date.parse(fila.revisada) < 7 * 864e5;
  if (fresca && !forzar) return { fila, buf: fs.readFileSync(path.join(DIR_ARCH, 'hojas', fila.archivo)) };
  const ahora = new Date().toISOString();
  try {
    const buf = await descargarHoja(url), nombre = sha256(url).slice(0, 24) + '.pdf';
    fs.mkdirSync(path.join(DIR_ARCH, 'hojas'), { recursive: true });
    fs.writeFileSync(path.join(DIR_ARCH, 'hojas', nombre), buf);
    db.prepare('INSERT INTO hojas (url, archivo, tipo, bytes, descargada, revisada, estado, error) VALUES (?, ?, ?, ?, ?, ?, ?, NULL) ON CONFLICT(url) DO UPDATE SET archivo = excluded.archivo, bytes = excluded.bytes, descargada = excluded.descargada, revisada = excluded.revisada, estado = excluded.estado, error = NULL')
      .run(url, nombre, 'application/pdf', buf.length, ahora, ahora, 'ok');
    return { fila: db.prepare('SELECT * FROM hojas WHERE url = ?').get(url), buf };
  } catch (e) {
    db.prepare('INSERT INTO hojas (url, revisada, estado, error) VALUES (?, ?, ?, ?) ON CONFLICT(url) DO UPDATE SET revisada = excluded.revisada, estado = excluded.estado, error = excluded.error').run(url, ahora, 'caido', e.message);
    const f = db.prepare('SELECT * FROM hojas WHERE url = ?').get(url);
    if (f.archivo && fs.existsSync(path.join(DIR_ARCH, 'hojas', f.archivo))) return { fila: f, buf: fs.readFileSync(path.join(DIR_ARCH, 'hojas', f.archivo)), copia: true };
    const err = new Error(e.message); err.fila = f; throw err;
  }
}
// Revisión semanal de todos los links guardados (avisa los caídos en /api/hojas)
setInterval(async () => {
  if (!CONFIG.hojasDeDatos) return;
  const viejas = db.prepare('SELECT url FROM hojas WHERE revisada < ? LIMIT 20').all(new Date(Date.now() - 7 * 864e5).toISOString());
  for (const { url } of viejas) await hoja(url, true).catch(() => {});
}, 3600e3).unref();

/* ---------- HTML de la plataforma ---------- */
function paginaPrincipal() {
  const archivo = ruta(CONFIG.html);
  if (!fs.existsSync(archivo)) return null;
  let html = fs.readFileSync(archivo, 'utf8');
  const sinDatos = vacia();
  // Con datos en el servidor, la data inicial embebida en el HTML no se envía a los navegadores
  if (!sinDatos) html = html.replace(/<script>(\/\*[^*]*\*\/\s*)?window\.__PILOTO_SEED=[\s\S]*?;<\/script>/, '<script>window.__PILOTO_SEED={"id":"servidor"};</script>')
    .replace(/<script>window\.__LISTA_PRECIOS_PRIVADA=[\s\S]*?;<\/script>/, '');
  const info = { vacio: sinDatos, demo: !!CONFIG.demo, nombre: CONFIG.nombre || 'Servidor de la empresa' };
  return html.replace('<head>', `<head><script>window.__SERVIDOR=${JSON.stringify(info)};</script>`);
}

/* ---------- API ---------- */
function leerCuerpo(req, limite = 200 * 1024 * 1024) {
  return new Promise((res, rej) => {
    const partes = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limite) { rej(new Error('Demasiado grande')); req.destroy(); } else partes.push(c); });
    req.on('end', () => res(Buffer.concat(partes))); req.on('error', rej);
  });
}
const enviar = (res, codigo, obj) => { const b = Buffer.from(JSON.stringify(obj)); res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': b.length, 'Cache-Control': 'no-store' }); res.end(b); };
const seguro = s => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '_').slice(0, 180) || '_';
function todos() { return db.prepare('SELECT coleccion, id, datos FROM registros WHERE borrado = 0').all().map(r => [r.coleccion, r.id, r.datos]); }

const RUTAS = {
  'GET estado': (req) => ({ ok: true, vacio: vacia(), version: versionActual(), epoca: meta('epoca'), ahora: Date.now(), ultimoRespaldo: meta('ultimoRespaldo'), nombre: CONFIG.nombre || 'Servidor de la empresa' }),
  'POST login': async (req, res, q, cuerpo) => {
    const { usuario, clave } = JSON.parse(cuerpo || '{}');
    const u = usuarios().find(x => String(x.usuario || '').toLowerCase() === String(usuario || '').trim().toLowerCase());
    if (!claveOk(u, clave)) return [401, { error: 'Usuario o contraseña incorrectos.' }];
    if (u.activo === false) return [403, { error: 'Este usuario está desactivado. Consulta con el administrador.' }];
    log('Ingreso:', u.usuario, '·', req.socket.remoteAddress);
    return { token: crearSesion(u), usuarioId: u.id };
  },
  // Primera carga: el servidor está vacío y un usuario de jefatura o administración sube los datos iniciales
  'POST inicializar': async (req, res, q, cuerpo) => {
    if (!vacia()) return [409, { error: 'El servidor ya tiene datos.' }];
    const { registros, usuario, clave } = JSON.parse(cuerpo || '{}');
    const us = registros.filter(r => r[0] === 'users' && r[1] !== '#orden').map(r => JSON.parse(r[2]));
    const u = us.find(x => String(x.usuario || '').toLowerCase() === String(usuario || '').toLowerCase());
    if (!claveOk(u, clave) || !['jefatura', 'gerencia', 'admin'].includes(u.rol)) return [403, { error: 'Solo gerencia, jefatura o administración pueden cargar los datos iniciales del servidor.' }];
    const v = aplicar(registros, [], u.nombre, req.socket.remoteAddress);
    log('Servidor inicializado por', u.usuario, '·', registros.length, 'registros');
    respaldar('carga inicial');
    return { token: crearSesion(u), usuarioId: u.id, version: v, epoca: meta('epoca') };
  },
  'POST salir': (req, res, q, c, s) => { db.prepare('DELETE FROM sesiones WHERE token = ?').run(s.token); return { ok: true }; },
  'GET datos': () => ({ version: versionActual(), epoca: meta('epoca'), registros: todos() }),
  'GET cambios': (req, res, q) => {
    const v = versionActual(), ep = meta('epoca');
    if (q.get('epoca') !== ep) return { version: v, epoca: ep, completo: true, registros: todos() };
    const desde = +q.get('desde') || 0;
    if (desde >= v) return { version: v, epoca: ep, sinCambios: true };
    const filas = db.prepare('SELECT coleccion, id, datos, borrado FROM registros WHERE version > ?').all(desde);
    return { version: v, epoca: ep, registros: filas.filter(r => !r.borrado).map(r => [r.coleccion, r.id, r.datos]), borrados: filas.filter(r => r.borrado).map(r => [r.coleccion, r.id]) };
  },
  'POST bloqueo': async (req, res, q, cuerpo, s) => { await tomarBloqueo(s.token, s.usuario.nombre); return { ok: true, version: versionActual() }; },
  'POST liberar': (req, res, q, c, s) => { soltarBloqueo(s.token); return { ok: true }; },
  'POST escribir': async (req, res, q, cuerpo, s) => {
    const { version, cambios, borrados } = JSON.parse(cuerpo || '{}');
    if (!bloqueo || bloqueo.token !== s.token) return [409, { error: 'Tu turno de escritura venció. Intenta de nuevo.' }];
    if (+version !== versionActual()) return [409, { error: 'Otro usuario guardó cambios al mismo tiempo. Intenta de nuevo.' }];
    const v = aplicar(cambios || [], borrados || [], s.usuario.nombre, req.socket.remoteAddress);
    bloqueo.hasta = Date.now() + BLOQUEO_MS;
    return { version: v };
  },
  'PUT doc': async (req, res, q, cuerpo) => {
    const dir = path.join(DIR_ARCH, 'documentos', seguro(q.get('c')));
    fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, seguro(q.get('n'))), cuerpo);
    return { ok: true, bytes: cuerpo.length };
  },
  'GET doc': (req, res, q) => {
    const f = path.join(DIR_ARCH, 'documentos', seguro(q.get('c')), seguro(q.get('n')));
    if (!fs.existsSync(f)) return [404, { error: 'El archivo no está en el servidor.' }];
    const b = fs.readFileSync(f); res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': b.length }); res.end(b);
  },
  'DELETE doc': (req, res, q) => { try { fs.unlinkSync(path.join(DIR_ARCH, 'documentos', seguro(q.get('c')), seguro(q.get('n')))); } catch (e) { /* ya no estaba */ } return { ok: true }; },
  'GET respaldos': (req, res, q, c, s) => ({ respaldos: listaRespaldos(), ultimo: meta('ultimoRespaldo'), dias: CONFIG.diasRespaldo, copia: CONFIG.copiaRespaldos || '' }),
  'POST respaldos': (req, res, q, c, s) => { exigirAdmin(s); return { nombre: respaldar('a pedido de ' + s.usuario.nombre) }; },
  'POST restaurar': async (req, res, q, cuerpo, s) => {
    exigirAdmin(s);
    const { nombre } = JSON.parse(cuerpo || '{}');
    await tomarBloqueo(s.token, s.usuario.nombre);
    try { restaurar(nombre); } finally { soltarBloqueo(s.token); }
    return { ok: true };
  },
  'GET respaldo': (req, res, q, c, s) => {
    exigirAdmin(s);
    const f = path.join(DIR_RESP, path.basename(q.get('n') || ''));
    if (!/\.sqlite$/.test(f) || !fs.existsSync(f)) return [404, { error: 'No existe ese respaldo.' }];
    const b = fs.readFileSync(f); res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${path.basename(f)}"`, 'Content-Length': b.length }); res.end(b);
  },
  'GET tc': () => ({ tipos: tiposCambio(), hoy: hoyISO() }),
  'POST tc': async (req, res, q, c, s) => { await actualizarTipoCambio(); return { tipos: tiposCambio(), hoy: hoyISO() }; },
  'GET hoja': async (req, res, q) => {
    if (!CONFIG.hojasDeDatos) return [503, { error: 'La descarga de hojas de datos está desactivada en el servidor.' }];
    try {
      const { fila, buf, copia } = await hoja(String(q.get('url') || ''), q.get('forzar') === '1');
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': buf.length, 'X-Hoja-Estado': copia ? 'copia' : 'ok', 'X-Hoja-Fecha': fila.descargada || '', 'X-Hoja-Error': encodeURIComponent(fila.error || '') });
      res.end(buf);
    } catch (e) { return [502, { error: e.message }]; }
  },
  'GET hojas': () => ({ hojas: db.prepare('SELECT url, bytes, descargada, revisada, estado, error FROM hojas ORDER BY estado DESC, url').all() }),
};
function exigirAdmin(s) { if (!['admin', 'gerencia', 'jefatura'].includes(s.usuario.rol)) { const e = new Error('Solo administración, gerencia o jefatura gestionan los respaldos del servidor.'); e.codigo = 403; throw e; } }
const PUBLICAS = new Set(['GET estado', 'POST login', 'POST inicializar']);
/* ---------- Microsoft 365 (Outlook y Teams): correo, agenda, avisos y envíos programados ---------- */
const M365 = require('./m365.js')({ CONFIG, log, usuarios, todos, meta, db: () => db });
Object.assign(RUTAS, M365.rutas);
const htmlPlataforma = () => fs.readFileSync(ruta(CONFIG.html), 'utf8');
setInterval(() => { M365.programados(htmlPlataforma).catch(e => log('Envíos programados: ' + e.message)); }, 5 * 60000).unref();

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const h = paginaPrincipal();
      if (!h) { res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Falta el archivo de la plataforma: ' + CONFIG.html); }
      const b = Buffer.from(h); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': b.length, 'Cache-Control': 'no-store' }); return res.end(b);
    }
    const m = /^\/api\/([a-z0-9]+)$/.exec(url.pathname);
    const clave = m && req.method + ' ' + m[1], fn = clave && RUTAS[clave];
    if (!fn) return enviar(res, 404, { error: 'No encontrado' });
    const s = PUBLICAS.has(clave) ? null : sesion(req);
    if (!PUBLICAS.has(clave) && !s) return enviar(res, 401, { error: 'Tu sesión venció. Vuelve a ingresar.' });
    const cuerpo = ['POST', 'PUT'].includes(req.method) ? await leerCuerpo(req) : null;
    const r = await fn(req, res, url.searchParams, req.method === 'PUT' ? cuerpo : cuerpo && cuerpo.toString('utf8'), s);
    if (res.headersSent) return;
    if (Array.isArray(r)) return enviar(res, r[0], r[1]);
    enviar(res, 200, r);
  } catch (e) {
    if (!res.headersSent) enviar(res, e.codigo || 500, { error: e.message });
    if (!e.codigo) log('Error en', req.method, url.pathname, '·', e.message);
  }
});

/* ---------- Comandos ---------- */
function registrosDe(datos) {   // misma descomposición que el navegador (AlmacenServidor)
  const out = [];
  for (const k of Object.keys(datos)) {
    if (k === '_v' || k === 'respaldo' || datos[k] === undefined) continue;
    const v = datos[k];
    const ids = Array.isArray(v) && v.length > 0 && v.every(e => e && typeof e === 'object' && (typeof e.id === 'string' || typeof e.id === 'number')) && new Set(v.map(e => String(e.id))).size === v.length;
    if (ids) { v.forEach(e => out.push([k, String(e.id), JSON.stringify(e)])); out.push([k, '#orden', JSON.stringify(v.map(e => String(e.id)))]); }
    else out.push(['_', k, JSON.stringify(v)]);
  }
  return out;
}
const [cmd, arg] = process.argv.slice(2).filter(x => !x.startsWith('--') && !/^\d+$/.test(x));
abrir();
if (cmd === 'importar') {
  if (!arg) { console.error('Indica el archivo: node servidor.js importar respaldo.json'); process.exit(1); }
  const datos = JSON.parse(fs.readFileSync(arg, 'utf8'));
  if (!Array.isArray(datos.users) || !Array.isArray(datos.opps)) { console.error('El archivo no es un respaldo de la plataforma.'); process.exit(1); }
  if (!vacia()) respaldar('antes de importar');
  const actuales = db.prepare('SELECT coleccion, id FROM registros WHERE borrado = 0').all().map(r => [r.coleccion, r.id]);
  transaccion(() => { db.prepare('DELETE FROM registros').run(); });
  const regs = registrosDe(datos);
  aplicar(regs, [], 'importación', 'consola');
  meta('epoca', crypto.randomUUID());
  console.log(`Importados ${regs.length} registros (${actuales.length} anteriores reemplazados).`);
  process.exit(0);
} else if (cmd === 'respaldo') { console.log('Respaldo:', respaldar('manual')); process.exit(0); }
else if (cmd === 'restaurar') { restaurar(arg); console.log('Listo.'); process.exit(0); }
else if (cmd === 'probar-m365') {
  if (!M365.configurado()) { console.error('Falta configurar microsoft365 en config.json (tenantId, clientId, clientSecret).'); process.exit(1); }
  M365.enviarCorreo({ de: (CONFIG.microsoft365 || {}).remitente || arg, para: arg, asunto: 'Prueba de la plataforma de cotizaciones', html: '<p>La conexión con Microsoft 365 funciona.</p>' })
    .then(() => { console.log('Correo de prueba enviado a', arg); process.exit(0); }).catch(e => { console.error(e.message); process.exit(1); });
}
else {
  servidor.listen(CONFIG.puerto, () => {
    const ips = Object.values(require('node:os').networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
    log(`Plataforma de cotizaciones en http://localhost:${CONFIG.puerto}` + (ips.length ? ' · en la red: ' + ips.map(ip => `http://${ip}:${CONFIG.puerto}`).join(' · ') : ''));
    log('Datos:', ARCHIVO_DB, '· Respaldos:', DIR_RESP, vacia() ? '· (sin datos: el primer ingreso de jefatura o administración carga los datos iniciales)' : '');
    if (CONFIG.tipoCambio) setTimeout(() => { ultimoTC = hoyISO(); actualizarTipoCambio(); }, 3000).unref();
  });
  const cerrar = () => { log('Deteniendo…'); servidor.close(); try { db.close(); } catch (e) { /* ya cerrada */ } process.exit(0); };
  process.on('SIGINT', cerrar); process.on('SIGTERM', cerrar);
}
module.exports = { registrosDe };
