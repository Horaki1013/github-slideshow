/* =====================================================================
   Microsoft 365 (Outlook y Teams) para la plataforma de cotizaciones
   ---------------------------------------------------------------------
   - Usa una aplicación registrada en el Entra ID (Azure AD) de la propia
     empresa, con permisos de aplicación de Microsoft Graph:
       Mail.Send            enviar correos desde el buzón de cada usuario
       Calendars.ReadWrite  ver y administrar la agenda de cada usuario
     (recomendado: restringirla a los buzones del equipo con una
      "Application Access Policy" de Exchange Online)
   - Teams: avisos a un canal por un webhook (flujo de Workflows o conector).
   - Sin configurar, todo queda en modo vista previa: nada se envía.
   - Los envíos programados (resumen diario a las 8:00 y reportes guardados)
     se calculan aquí con las mismas reglas de la plataforma (Rules, Excel).
   ===================================================================== */
'use strict';
const vm = require('node:vm');

module.exports = function crearM365({ CONFIG, log, usuarios, todos, meta, db: dbFn }) {
  const C = Object.assign({ tenantId: '', clientId: '', clientSecret: '', buzonComun: '', remitente: '', teamsWebhook: '', resumenDiario: true, horaResumen: 8,
    loginUrl: 'https://login.microsoftonline.com', graphUrl: 'https://graph.microsoft.com/v1.0' }, CONFIG.microsoft365 || {});   // las URL solo cambian para pruebas
  const configurado = () => !!(C.tenantId && C.clientId && C.clientSecret);
  let token = null, vence = 0;
  async function obtenerToken() {
    if (token && Date.now() < vence - 60000) return token;
    const r = await fetch(`${C.loginUrl}/${encodeURIComponent(C.tenantId)}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: C.clientId, client_secret: C.clientSecret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }), signal: AbortSignal.timeout(20000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('Microsoft 365 rechazó la conexión: ' + (j.error_description || j.error || r.status));
    token = j.access_token; vence = Date.now() + (j.expires_in || 3600) * 1000;
    return token;
  }
  async function graph(metodo, ruta, cuerpo, extra) {
    if (!configurado()) { const e = new Error('Microsoft 365 no está configurado en el servidor (config.json → microsoft365).'); e.codigo = 503; throw e; }
    const r = await fetch(C.graphUrl + ruta, { method: metodo, headers: Object.assign({ Authorization: 'Bearer ' + await obtenerToken(), 'Content-Type': 'application/json' }, extra || {}),
      body: cuerpo === undefined ? undefined : typeof cuerpo === 'string' || cuerpo instanceof Uint8Array ? cuerpo : JSON.stringify(cuerpo), signal: AbortSignal.timeout(60000) });
    if (r.status === 202 || r.status === 204) return null;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error((j.error && j.error.message) || 'Microsoft Graph respondió ' + r.status); e.codigo = r.status === 404 ? 404 : 502; throw e; }
    return j;
  }
  const destinatarios = lista => String(lista || '').split(/[,;\s]+/).map(x => x.trim()).filter(x => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)).map(address => ({ emailAddress: { address } }));
  /** Envía un correo desde el buzón "de" (el del vendedor o el remitente de la plataforma). adjuntos: [{ nombre, tipo, bytes(Buffer) }] */
  async function enviarCorreo({ de, para, cc, asunto, html, adjuntos = [] }) {
    const total = adjuntos.reduce((a, x) => a + x.bytes.length, 0);
    const mensaje = { subject: asunto, body: { contentType: 'HTML', content: html }, toRecipients: destinatarios(para), ccRecipients: destinatarios(cc) };
    if (!mensaje.toRecipients.length) { const e = new Error('Indica al menos un destinatario con correo válido.'); e.codigo = 400; throw e; }
    if (total < 3 * 1024 * 1024) {
      mensaje.attachments = adjuntos.map(x => ({ '@odata.type': '#microsoft.graph.fileAttachment', name: x.nombre, contentType: x.tipo || 'application/pdf', contentBytes: x.bytes.toString('base64') }));
      await graph('POST', `/users/${encodeURIComponent(de)}/sendMail`, { message: mensaje, saveToSentItems: true });
    } else {   // adjuntos grandes (cotización con hojas de datos): borrador + sesión de carga por partes
      const borrador = await graph('POST', `/users/${encodeURIComponent(de)}/messages`, mensaje);
      for (const x of adjuntos) {
        const s = await graph('POST', `/users/${encodeURIComponent(de)}/messages/${borrador.id}/attachments/createUploadSession`, { AttachmentItem: { attachmentType: 'file', name: x.nombre, size: x.bytes.length, contentType: x.tipo || 'application/pdf' } });
        for (let i = 0; i < x.bytes.length; i += 3 * 1024 * 1024) {
          const parte = x.bytes.subarray(i, Math.min(i + 3 * 1024 * 1024, x.bytes.length));
          const r = await fetch(s.uploadUrl, { method: 'PUT', headers: { 'Content-Length': String(parte.length), 'Content-Range': `bytes ${i}-${i + parte.length - 1}/${x.bytes.length}` }, body: parte });
          if (!r.ok && r.status !== 201) throw new Error('No se pudo subir el adjunto (' + r.status + ')');
        }
      }
      await graph('POST', `/users/${encodeURIComponent(de)}/messages/${borrador.id}/send`);
    }
    registrar({ de, para, cc, asunto, estado: 'enviado' });
  }
  async function teams(texto, titulo) {
    if (!C.teamsWebhook) return false;
    const card = { type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: { $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', type: 'AdaptiveCard', version: '1.4',
      body: [titulo ? { type: 'TextBlock', text: titulo, weight: 'Bolder', wrap: true } : null, { type: 'TextBlock', text: texto, wrap: true }].filter(Boolean) } }] };
    const r = await fetch(C.teamsWebhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(card), signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error('Teams respondió ' + r.status);
    return true;
  }
  // Registro de envíos (para que administración vea qué salió y qué falló)
  function registrar(x) {
    try { dbFn().prepare('INSERT INTO envios (fecha, de, para, asunto, estado, error) VALUES (?, ?, ?, ?, ?, ?)').run(new Date().toISOString(), x.de || '', String(x.para || ''), x.asunto || '', x.estado, x.error || null); } catch (e) { /* sin registro */ }
  }

  /* ---------- Reglas de la plataforma (las mismas del navegador) para armar resúmenes y reportes ---------- */
  let motor = null, motorDe = '';
  function cargarMotor(html) {
    if (motor && motorDe === html.length + ':' + html.slice(-200)) return motor;
    const i0 = html.indexOf("'use strict';\n/* ====="), i1 = html.indexOf('\nconst Almacen = (() => {');
    if (i0 < 0 || i1 < 0) throw new Error('No se encontraron las reglas en el HTML de la plataforma.');
    const ctx = vm.createContext({ console, TextEncoder, TextDecoder, Blob, CompressionStream, DecompressionStream, Response, Intl, setTimeout, crypto: globalThis.crypto });
    motor = vm.runInContext(html.slice(i0, i1) + '\n;({ Config, Util, Rules, Excel })', ctx);
    motorDe = html.length + ':' + html.slice(-200);
    return motor;
  }
  /** Los datos como los ve el navegador (misma descomposición en registros) */
  function datos() {
    const out = {}, cols = {};
    for (const [c, id, d] of todos()) { if (c === '_') out[id] = JSON.parse(d); else (cols[c] = cols[c] || {})[id] = d; }
    for (const c of Object.keys(cols)) { const o = cols[c]['#orden']; if (o) out[c] = JSON.parse(o).filter(id => id in cols[c]).map(id => JSON.parse(cols[c][id])); }
    return out;
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  /** Resumen diario de un usuario (pendientes de hoy, atrasados, cotizaciones por vencer, leads) */
  function resumenDiario(M, db, u, hoy) {
    const V = M.Rules.vista(db, u), al = M.Rules.alertasUsuario(V, u, hoy).slice(0, 40);
    if (!al.length) return null;
    const cli = id => (V.clients.find(c => c.id === id) || {}).razonSocial || '';
    const filas = al.map(a => `<tr><td style="padding:4px 8px;border-bottom:1px solid #e5e7eb">${esc(a.opp ? cli(a.opp.clienteId) + ' · ' + a.opp.id : a.cliente ? a.cliente.razonSocial : a.lead ? 'Lead ' + (a.lead.empresa || a.lead.id) : '')}</td><td style="padding:4px 8px;border-bottom:1px solid #e5e7eb">${esc((a.alerta || a.aviso || a).texto || '')}</td></tr>`).join('');
    return { asunto: `Tu día: ${al.length} pendiente${al.length === 1 ? '' : 's'} (${M.Util.fmtDate(hoy)})`, html: `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px"><p>Hola ${esc(String(u.nombre || '').split(' ')[0])}, estos son tus pendientes de hoy:</p><table style="border-collapse:collapse">${filas}</table><p style="color:#6b7280;font-size:12px">Correo automático de la plataforma de cotizaciones. Puedes desactivarlo en "Mis datos".</p></div>` };
  }
  const COLS = [['fecha', 'Fecha'], ['numero', 'N° cotización'], ['cliente', 'Cliente'], ['proyecto', 'Proyecto'], ['usuarioFinal', 'Usuario final'], ['marca', 'Marca'], ['monto', 'Monto USD'], ['montoOriginal', 'Monto (moneda)'],
    ['etapa', 'Etapa'], ['prob', 'Prob.'], ['ponderado', 'Ponderado USD'], ['fechaOC', 'Fecha OC est.'], ['proxContacto', 'Próx. contacto'], ['ultimo', 'Último seguimiento'], ['cierre', 'Cierre'], ['origen', 'Origen'], ['motivo', 'Motivo de pérdida'], ['vendedor', 'Vendedor']];
  /** Reporte guardado (vista) en Excel, igual que el botón Excel de la pantalla de reportes */
  async function reporteExcel(M, db, u, vista) {
    const V = M.Rules.vista(db, u), cfg = Object.assign({}, vista.config, u.rol === 'vendedor' ? { vendedorId: u.id } : {}), R = M.Rules.reporteFollowup(V, cfg);
    const cols = COLS.filter(([k]) => (cfg.cols || []).includes(k)), nom = id => (V.users.find(x => x.id === id) || {}).nombre || id;
    const val = (r, k) => k === 'vendedor' ? nom(r.vendedorId) : k === 'origen' ? (r.origen ? M.Rules.origenNombre(V, { id: r.origen }) : '') : k === 'montoOriginal' ? r.montoOriginal : r[k] == null ? '' : r[k];
    const res = (t, gs, et) => [[t, 'N°', 'Monto USD', 'Ponderado USD'], ...gs.map(g => [et(g.clave), g.n, g.monto, g.ponderado]), ['Total', R.total.n, R.total.monto, R.total.ponderado], []];
    const blob = M.Excel.libro([{ nombre: 'Follow up', fija: true, anchos: cols.map(() => 16), filas: [cols.map(c => c[1]), ...R.filas.map(r => cols.map(([k]) => val(r, k)))] },
      { nombre: 'Resumen', anchos: [36, 10, 16, 16], filas: [...res('Por estado', R.porEstado, k => M.Rules.ESTADOS_REPORTE[k]), ...res('Por etapa', R.porEtapa, k => k), ...(u.rol !== 'vendedor' ? res('Por vendedor', R.porVendedor, nom) : [])] }]);
    return { bytes: Buffer.from(await blob.arrayBuffer()), total: R.total };
  }
  const fechaZona = (z, t) => { const p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: z, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date(t || Date.now())).forEach(x => { p[x.type] = x.value; }); return { fecha: `${p.year}-${p.month}-${p.day}`, hora: +p.hour, dia: p.weekday }; };
  /** Revisa cada pocos minutos: a las 8:00 de la oficina de cada persona salen su resumen diario y sus reportes programados */
  async function programados(paginaHtml) {
    if (!configurado() && !C.teamsWebhook) return;
    // Solo a la hora del resumen (en Lima o en Santiago) se leen los datos y las reglas
    if (!['America/Lima', 'America/Santiago'].some(z => fechaZona(z).hora === C.horaResumen)) return;
    let M, db;
    try { M = cargarMotor(paginaHtml()); db = datos(); } catch (e) { log('Envíos programados: ' + e.message); return; }
    await teamsDiario(M, db).catch(() => {});
    if (!configurado()) return;
    for (const u of (db.users || []).filter(x => x.activo !== false && x.correo)) {
      const z = (M.Config.OFICINA_DEF[u.oficina || 'PE'] || M.Config.OFICINA_DEF.PE).zona, ahora = fechaZona(z);
      if (ahora.hora !== C.horaResumen || ['Sat', 'Sun'].includes(ahora.dia)) continue;
      const pref = Object.assign({ resumenDiario: C.resumenDiario }, u.notificaciones || {});
      const clave = `envio:${u.id}:${ahora.fecha}`;
      if (!meta(clave + ':diario') && pref.resumenDiario) {
        meta(clave + ':diario', '1');
        try { const r = resumenDiario(M, db, u, ahora.fecha); if (r) await enviarCorreo({ de: C.remitente || u.correo, para: u.correo, asunto: r.asunto, html: r.html }); }
        catch (e) { registrar({ de: C.remitente, para: u.correo, asunto: 'Resumen diario', estado: 'error', error: e.message }); }
      }
      for (const v of (db.vistasReporte || []).filter(x => x.usuarioId === u.id && x.envio)) {
        const toca = v.envio.frecuencia === 'diario' || (v.envio.frecuencia === 'semanal' && ahora.dia === 'Mon') || (v.envio.frecuencia === 'mensual' && ahora.fecha.endsWith('-01'));
        if (!toca || meta(clave + ':' + v.id)) continue;
        meta(clave + ':' + v.id, '1');
        try {
          const x = await reporteExcel(M, db, u, v);
          await enviarCorreo({ de: C.remitente || u.correo, para: v.envio.para || u.correo, asunto: `Reporte: ${v.nombre} (${M.Util.fmtDate(ahora.fecha)})`,
            html: `<p>Reporte "${esc(v.nombre)}": ${x.total.n} oportunidades · monto USD ${M.Util.nf2.format(x.total.monto)} · ponderado USD ${M.Util.nf2.format(x.total.ponderado)}.</p><p>Se adjunta en Excel.</p>`,
            adjuntos: [{ nombre: `follow_up_${ahora.fecha}.xlsx`, tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes: x.bytes }] });
        } catch (e) { registrar({ de: C.remitente, para: v.envio.para || u.correo, asunto: 'Reporte ' + v.nombre, estado: 'error', error: e.message }); }
      }
    }
  }

  /** Aviso diario al canal de Teams: pendientes de cada vendedor (una vez al día, a la hora del resumen en Perú) */
  async function teamsDiario(M, db) {
    if (!C.teamsWebhook) return;
    const ahora = fechaZona(M.Config.OFICINA_DEF.PE.zona);
    if (ahora.hora !== C.horaResumen || ['Sat', 'Sun'].includes(ahora.dia) || meta('teams:' + ahora.fecha)) return;
    meta('teams:' + ahora.fecha, '1');
    const vs = M.Rules.vendedoresActivos(db), lineas = vs.map(v => `${v.nombre}: ${M.Rules.alertasUsuario(M.Rules.vista(db, v), v, ahora.fecha).length} pendientes`);
    try { await teams(lineas.join('\n'), `Pendientes del equipo · ${M.Util.fmtDate(ahora.fecha)}`); } catch (e) { registrar({ de: 'Teams', para: 'canal', asunto: 'Pendientes del equipo', estado: 'error', error: e.message }); }
  }
  const soloAdmin = s => { if (!['admin', 'jefatura'].includes(s.usuario.rol)) { const e = new Error('Solo administración o jefatura.'); e.codigo = 403; throw e; } };
  /* ---------- Rutas de la API ---------- */
  const correoDe = s => { if (!s.usuario.correo) { const e = new Error('Tu usuario no tiene correo registrado: agrégalo en "Mis datos" o pídelo a administración.'); e.codigo = 400; throw e; } return s.usuario.correo; };
  const rutas = {
    'GET m365': () => ({ configurado: configurado(), buzonComun: C.buzonComun || '', teams: !!C.teamsWebhook, remitente: C.remitente || '' }),
    /** Enviar una cotización (u otro correo) desde el buzón de quien está conectado, con copia al buzón común */
    'POST correo': async (req, res, q, cuerpo, s) => {
      const d = JSON.parse(cuerpo || '{}');
      const adjuntos = (d.adjuntos || []).map(a => ({ nombre: String(a.nombre || 'adjunto.pdf').slice(0, 150), tipo: a.tipo || 'application/pdf', bytes: Buffer.from(String(a.base64 || ''), 'base64') }));
      const cc = [d.cc, d.copiaBuzon !== false ? C.buzonComun : ''].filter(Boolean).join(',');
      await enviarCorreo({ de: correoDe(s), para: d.para, cc, asunto: String(d.asunto || '').slice(0, 250), html: String(d.html || ''), adjuntos });
      log('Correo enviado por', s.usuario.usuario, 'a', d.para);
      return { ok: true, cc };
    },
    'GET agenda': async (req, res, q, c, s) => {
      const desde = q.get('desde'), hasta = q.get('hasta');
      const r = await graph('GET', `/users/${encodeURIComponent(correoDe(s))}/calendarView?startDateTime=${encodeURIComponent(desde)}&endDateTime=${encodeURIComponent(hasta)}&$top=250&$orderby=start/dateTime&$select=id,subject,start,end,location,isAllDay,webLink,bodyPreview,categories`, undefined, { Prefer: 'outlook.timezone="UTC"' });
      return { eventos: (r.value || []).map(e => ({ id: e.id, asunto: e.subject, inicio: e.start.dateTime + 'Z', fin: e.end.dateTime + 'Z', lugar: (e.location || {}).displayName || '', todoElDia: e.isAllDay, enlace: e.webLink, nota: e.bodyPreview, categorias: e.categories || [] })) };
    },
    'POST evento': async (req, res, q, cuerpo, s) => {
      const d = JSON.parse(cuerpo || '{}');
      const ev = { subject: String(d.asunto || '').slice(0, 250), body: { contentType: 'Text', content: String(d.nota || '') }, start: { dateTime: d.inicio, timeZone: 'UTC' }, end: { dateTime: d.fin, timeZone: 'UTC' }, location: { displayName: String(d.lugar || '') }, categories: ['Plataforma de cotizaciones'] };
      const r = d.id ? await graph('PATCH', `/users/${encodeURIComponent(correoDe(s))}/events/${encodeURIComponent(d.id)}`, ev) : await graph('POST', `/users/${encodeURIComponent(correoDe(s))}/events`, ev);
      return { id: (r && r.id) || d.id };
    },
    'DELETE evento': async (req, res, q, c, s) => { await graph('DELETE', `/users/${encodeURIComponent(correoDe(s))}/events/${encodeURIComponent(q.get('id'))}`); return { ok: true }; },
    'POST teams': async (req, res, q, cuerpo, s) => { soloAdmin(s); const d = JSON.parse(cuerpo || '{}'); return { ok: await teams(String(d.texto || '').slice(0, 4000), d.titulo) }; },
    'GET envios': (req, res, q, c, s) => soloAdmin(s) || ({ envios: dbFn().prepare('SELECT * FROM envios ORDER BY id DESC LIMIT 200').all() }),
    'POST probar': async (req, res, q, c, s) => { await enviarCorreo({ de: C.remitente || correoDe(s), para: correoDe(s), asunto: 'Prueba de la plataforma de cotizaciones', html: '<p>La conexión con Microsoft 365 funciona.</p>' }); return { ok: true }; },
  };
  return { configurado, enviarCorreo, teams, programados, rutas, cargarMotor, datos, resumenDiario, reporteExcel };
};
