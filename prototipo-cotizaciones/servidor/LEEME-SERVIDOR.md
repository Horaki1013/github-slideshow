# Servidor local de la plataforma de cotizaciones

El servidor deja que todo el equipo trabaje a la vez sobre los mismos datos, con respaldos automáticos y sin nube pública. Corre en un equipo de la empresa, sea Windows Server o Linux, y los usuarios entran desde el navegador a `http://NOMBRE-DEL-SERVIDOR:8080`. Funciona en cualquier navegador, también en el celular.

## Qué hace

- **Base de datos SQLite.** Todo queda en un solo archivo, `datos/plataforma.sqlite`, guardado registro por registro. Hay una sola escritura a la vez, con un turno corto, así que decenas de usuarios pueden trabajar al mismo tiempo sin pisarse. Está probado con 15 sesiones escribiendo en simultáneo.
- **Respaldos automáticos.** Se generan cada 2 horas en horario laboral (10, 12, 14, 16 y 18 h) y cada noche (23 h). Se conservan 30 días y opcionalmente se copian a otro disco o carpeta. Administración, gerencia o jefatura pueden crearlos, descargarlos y restaurarlos desde la plataforma (menú de usuario → *Respaldos del servidor*).
- **Tipo de cambio del día.** Cada mañana el servidor baja el de SUNAT (Perú) y el del Banco Central de Chile (dólar y euro). Esto requiere salida a internet. Si no hay conexión, se usa el último disponible, y el vendedor puede editarlo en cada cotización.
- **Hojas de datos y anexos por link.** El servidor guarda una copia de cada PDF. Si un link cae, usa la copia y la plataforma avisa para actualizar el link. Además revisa todos los links una vez por semana.
- **Microsoft 365 (opcional):**
  - envía las cotizaciones desde el Outlook de cada vendedor, con copia al buzón común;
  - muestra y edita la agenda de Outlook de cada usuario;
  - envía cada mañana el resumen de pendientes y los reportes programados;
  - publica avisos en un canal de Teams.
- **Modo doble clic como respaldo.** Si el servidor se cae, el mismo HTML puede abrirse con doble clic y trabajar con la carpeta compartida, como antes.

## Instalación

1. Instalar **Node.js 22.13 o superior** (LTS) desde https://nodejs.org. Ya trae SQLite incorporado, así que no hace falta instalar nada más.
2. Copiar esta carpeta al servidor, por ejemplo `C:\Plataforma` o `/opt/plataforma-cotizaciones`, junto con el HTML de la plataforma.
3. Copiar `config.ejemplo.json` como `config.json` y ajustar:
   - `html`: nombre del archivo HTML de la plataforma.
   - `puerto`: por defecto 8080.
   - `copiaRespaldos`: otra carpeta o disco para la copia de los respaldos, por ejemplo `D:\\Respaldos-Cotizaciones`.
4. Probarlo con `iniciar-servidor.bat` (Windows) o `node servidor.js` (Linux). La consola muestra las direcciones para entrar desde la red.
5. Dejarlo como servicio:
   - **Windows Server:** en PowerShell como administrador, ejecutar `powershell -ExecutionPolicy Bypass -File instalar-servicio-windows.ps1`. Registra una tarea que arranca sola con el equipo, se reinicia si falla y abre el puerto en el firewall de la red interna.
   - **Linux:** copiar `plataforma-cotizaciones.service` a `/etc/systemd/system/`, ajustar las rutas y el usuario, y ejecutar `systemctl enable --now plataforma-cotizaciones`.

## Primera carga de datos

- **Servidor vacío.** El primer ingreso de gerencia, jefatura o administración carga los datos iniciales que trae el HTML.
- **Si el equipo ya trabajaba con la carpeta compartida.** Desde allí, menú de usuario → *Exportar respaldo (JSON)*. Luego, en el servidor, menú → *Restaurar respaldo…*. Otra opción, con el servidor detenido: `node servidor.js importar respaldo.json`.

Una vez que el servidor tiene datos, el HTML que entrega ya no incluye los datos iniciales.

## Comandos

| Comando | Para qué |
|---|---|
| `node servidor.js` | Inicia el servidor |
| `node servidor.js importar respaldo.json` | Carga un respaldo exportado desde la plataforma |
| `node servidor.js respaldo` | Crea un respaldo ahora |
| `node servidor.js restaurar archivo.sqlite` | Restaura un respaldo (con el servidor detenido) |
| `node servidor.js probar-m365 correo@empresa.com` | Prueba el envío por Microsoft 365 |

## Conexión con Microsoft 365 (Outlook y Teams)

1. En el **Entra ID** de la empresa (portal de Azure → *Registros de aplicaciones*), crear una aplicación, por ejemplo "Plataforma de cotizaciones".
2. En *Permisos de API → Microsoft Graph → Permisos de aplicación*, agregar `Mail.Send` y `Calendars.ReadWrite`. Luego un administrador debe *Conceder consentimiento*.
3. En *Certificados y secretos*, crear un secreto de cliente.
4. **Recomendado:** limitar la aplicación a los buzones del equipo con una *Application Access Policy* de Exchange Online (`New-ApplicationAccessPolicy`).
5. Completar en `config.json`:

```json
"microsoft365": {
  "tenantId": "id del inquilino (directorio)",
  "clientId": "id de la aplicación",
  "clientSecret": "secreto creado en el paso 3",
  "buzonComun": "ventas@empresa.com",
  "remitente": "plataforma@empresa.com",
  "teamsWebhook": "",
  "resumenDiario": true,
  "horaResumen": 8
}
```

- `buzonComun` va en copia de cada cotización enviada.
- `remitente` es el buzón desde el que salen los resúmenes y reportes automáticos.
- `teamsWebhook` es opcional. Para obtenerlo, crea en Teams un flujo de *Workflows* del tipo "Publicar en un canal cuando se reciba una solicitud de webhook" y pega aquí su URL. Así el canal recibe cada mañana los pendientes del equipo.

6. Reiniciar el servidor y probarlo: desde la plataforma, *Empresa y plantilla → Microsoft 365 → Enviarme un correo de prueba*, o por consola con `node servidor.js probar-m365 tu-correo@empresa.com`.

Cada usuario necesita su correo registrado en *Mis datos*. Ahí también edita su **speech predeterminado** para enviar cotizaciones y decide si recibe el resumen diario.

Sin Microsoft 365 configurado, todo sigue funcionando así:

- las cotizaciones se envían con un **borrador de correo `.eml`**, que Outlook abre listo para enviar con el PDF adjunto;
- los seguimientos se agregan al calendario con un archivo **`.ics`**.

## Seguridad

- **Acceso:** la API exige sesión, que se obtiene al ingresar con usuario y contraseña. Las contraseñas se guardan con salt y SHA-256.
- **Intentos de contraseña:** tras 5 intentos fallidos del mismo usuario desde el mismo equipo, el ingreso queda frenado 5 minutos (también con la contraseña correcta). Los demás usuarios no se ven afectados.
- **Usuarios protegidos:** solo gerencia, jefatura, administración (o quien tenga el permiso de gestionar usuarios) crean, cambian o eliminan usuarios. Nadie cambia su propio rol, oficina, alcance ni permisos. Si una escritura trae un cambio de usuarios no permitido, el servidor descarta solo ese cambio, guarda el resto y lo anota en el registro ("Cambios de usuarios descartados de…"). Cada uno sí cambia su contraseña y sus preferencias (por ejemplo, el speech).
- **Rutas de administración:** el registro de envíos de correo y la publicación en Teams son solo para administración y jefatura.
- **Hojas de datos:** el servidor no descarga links que apunten a la red interna (localhost, 10.x, 172.16–31.x, 192.168.x, nombres sin dominio), para que un link no sirva para leer equipos de la empresa. Si un fabricante publica sus hojas en un servidor interno, activar `"hojasRedLocal": true`.
- **Compresión:** las respuestas grandes (la plataforma y los datos) viajan comprimidas con gzip si el navegador lo acepta, unas 3 a 5 veces más livianas por la red.
- **Alcance de red:** el servidor está pensado para la red interna, así que no hay que publicarlo en internet. Para acceso remoto, usar la VPN de la empresa.
- **Respaldos:** `datos/` y `respaldos/` contienen información confidencial. Restringir el acceso a esas carpetas a TI.

## Pendiente para producción (lo implementa el proveedor)

- Validar en el servidor los permisos de cada escritura. Hoy el servidor ya protege a los usuarios (roles, permisos, altas y bajas) y las rutas de administración; el resto de las reglas (por ejemplo, quién borra una cotización) las aplica el navegador.
- Ingreso con Microsoft 365 (inicio de sesión único).
- HTTPS con un certificado interno.
