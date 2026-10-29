# Plataforma de cotizaciones Techvalue: modelo para cotizar el desarrollo

> **IMPORTANTE: TODA LA DATA DE ESTA VERSIÓN ES SIMULADA.**
> Clientes, RUC, contactos, correos, teléfonos, vendedores, montos, números de cotización, productos, precios, stock, leads y comentarios son ficticios. Se generan al abrir el archivo con una semilla fija y fechas relativas al día de hoy. Cualquier parecido con empresas o personas reales es casual. No hay ni debe haber datos reales de Techvalue en este paquete.

Este paquete describe una plataforma que ya existe como **prototipo funcional** y que hoy se usa en un piloto interno. El objetivo es que nos cotices **desarrollarla e integrarla en producción** en la empresa.

## Contenido del paquete

| Archivo | Qué es |
|---|---|
| `Techvalue-Plataforma-Modelo-DATOS-SIMULADOS.html` | El prototipo completo (un solo archivo HTML + CSS + JS, sin dependencias). Es el mismo `index.html` del repositorio |
| `LEEME-PROGRAMADOR.md` | Este documento: alcance, arquitectura, integraciones y preguntas para la cotización |
| `README-TECNICO.md` | Documentación detallada de cada módulo, el modelo de datos y las reglas de negocio |

## Cómo abrirlo

1. Doble clic en el `.html`. Funciona en **Chrome o Edge** (escritorio). No necesita servidor, internet ni instalación.
2. Ingresar con cualquiera de estos usuarios (clave `demo` para todos). El login es solo de apariencia.

| Usuario | Rol | Para ver |
|---|---|---|
| `cm`, `js`, `lp`, `dh`, `vc` | Account Manager (vendedor) | Mi día, oportunidades, nueva cotización y su PDF, cuentas, leads, proyección, ranking |
| `jefatura` | Gerencia / Jefatura | Dashboard, todo el equipo, asignaciones, leads, usuarios, datos de la empresa |
| `finanzas` | Finanzas | Proyección de facturación y cobranza, facturado, post-venta, lista de precios |
| `gestion` | Gestión / Administración local | Stock del almacén de Perú, movimientos, post-venta |
| `admin` | Administración del sistema | Usuarios, lista de precios, post-venta |

3. Los cambios viven en memoria: al recargar vuelve la data simulada inicial (menú de usuario → **Restablecer datos de demo**).
4. Para revisar las reglas: la consola del navegador muestra `Autoverificación de reglas de negocio: 19/19 OK` (también `SelfTest.run()`).

## Qué hace la plataforma (resumen funcional)

- **Cotizaciones:** el vendedor arma la cotización (lista de precios con autocompletado, descuentos, moneda USD o PEN, IGV) y descarga el PDF con la plantilla de la empresa. Numeración `INICIALES-AAMMDD-NNNN` (correlativo por vendedor y por año). Revisiones (R1, R2…) y alternativas. También registra PDF ya enviados (los lee en el navegador).
- **Oportunidades y fúnel:** etapas con probabilidad, fecha estimada de OC, próximo contacto, seguimientos, motivos de pérdida, pausa y reactivación. Proyectos con varios integradores.
- **Mi día y agenda:** pendientes del vendedor, alertas de oportunidades sin seguimiento y de cuentas que no responden.
- **Cuentas (clientes):** asignación por jefatura, "Mis clientes", estado automático (activo / no responde / sin contacto), segmento calculado (T1, T2, CO), gestiones de cuenta, directorio y plantilla Excel de carga.
- **Leads:** registro manual, desde correos de fabricante (clasificación por reglas) o importados de HubSpot; asignación sugerida; indicadores y alerta de leads sin atender en 48 horas hábiles.
- **Post-venta:** OC, pedido, tránsito, recibido, entregado, facturado (con facturas anexas) y cobrado, con pasos por área. Documentos por oportunidad (con detección de duplicados por huella SHA-256). Visor de cotizaciones de solo lectura para las áreas de post-venta.
- **Proyección y facturado:** proyección de facturación y cobranza por horizonte (fin de mes, 30, 60, 90, 120 días), metas, ranking y comisiones.
- **Stock:** almacenes de Perú y Chile, movimientos (ingreso, salida, transferencia con tránsito, recepción, ajuste, devolución, cambio de estado: libre, demo, préstamo, malogrado), reservas para clientes, pedidos a fábrica, mínimos, costos y valorización, plazo sugerido para la cotización, carga desde Excel.
- **Lista de precios:** importación desde Excel (reemplazar o completar), historial de cambios, consulta para vendedores.
- **Usuarios y empresa:** alta, roles, metas, oficina (PE / CL), datos de la empresa y condiciones comerciales que salen en el PDF.
- **Notificaciones:** vista previa de los correos de resumen diario y semanal y de los eventos de Outlook (no se envía nada).
- **Historial:** todo cambio de datos (stock, leads, asignaciones, precios, post-venta) queda registrado con usuario y fecha.

## Arquitectura del prototipo

Todo está en un archivo, separado en capas que deberían mapear a la solución real:

| Capa | Rol en el prototipo | En producción |
|---|---|---|
| `Config` | Constantes: roles, etapas, orígenes, umbrales | Configuración en la base de datos / panel de administración |
| `Rules` | Reglas de negocio puras (permisos, totales, numeración, segmento, stock, proyección, leads) | Mismas reglas en el servidor (y, si se quiere, compartidas con el front) |
| `Repo` | Única puerta de escritura y lectura de datos; cada método tiene comentado el endpoint REST equivalente | **La API a construir** |
| `Almacen` / `AlmacenCompartido` | Persistencia en IndexedDB y, en el piloto, en una carpeta de red compartida | Base de datos en el servidor |
| `DemoData` | Generador de la data simulada | Migración de los Excel actuales (FUP, stock, lista de precios) |
| `Excel`, `LectorPDF`, `PdfDoc` | Plantillas .xlsx, lectura de PDF y generación de la cotización en PDF | Servicios del servidor |
| UI (`PAGES`, `ACTIONS`) | Pantallas y acciones; solo leen el *snapshot* y escriben vía `Repo` | Front-end (puede reutilizarse o rehacerse) |

### Endpoints sugeridos (tomados de los comentarios de `Repo`)

```
POST   /auth/login                       GET    /snapshot
GET    /catalogo                         POST   /catalogo/importar          DELETE /catalogo/:id
POST   /clientes                         PATCH  /clientes/:id               PATCH  /clientes/:id/vendedor
POST   /clientes/:id/gestiones           POST   /clientes/importar
POST   /cotizaciones                     PATCH  /cotizaciones/:id/cliente   PATCH  /cotizaciones/:id/vigente
PATCH  /oportunidades/:id                PATCH  /oportunidades/:id/etapa    PATCH  /oportunidades/:id/vendedor
PATCH  /oportunidades/:id/origen         PATCH  /oportunidades/:id/postventa
POST   /oportunidades/:id/seguimientos   POST   /oportunidades/:id/completar
DELETE /seguimientos/:id                 POST   /proyectos/:id/cerrar-otros
POST   /leads                            PATCH  /leads/:id                  PATCH  /leads/:id/vendedor
POST   /leads/:id/contactos              POST   /leads/:id/descartar        POST   /leads/importar
PUT    /config/leads                     PUT    /empresa                    PATCH  /usuarios/yo
PUT    /almacenes                        POST   /stock/cargas               POST   /stock/movimientos
POST   /stock/reservas                   PATCH  /stock/minimos              PATCH  /productos/:codigo/costo
POST   /verificaciones
```

El modelo de datos completo (usuarios, clientes, proyectos, oportunidades, cotizaciones, ítems, seguimientos, leads, almacenes, movimientos, reservas, documentos, historial) y todas las reglas de negocio están en `README-TECNICO.md`.

## Qué está simulado y qué hay que construir

| Hoy en el prototipo | Lo que se necesita en producción |
|---|---|
| Datos en el navegador (IndexedDB) o en una carpeta de red compartida | **Servidor propio con base de datos y API** (la empresa prefiere **no usar nube pública**; confirmar opción on-premise o servidor local) |
| Login de apariencia | Login corporativo con **Microsoft 365 / Entra ID** y permisos validados en el servidor |
| PDF generado en el navegador | Generación en el servidor, guardado en el repositorio documental (OneDrive / SharePoint o carpeta del servidor) y envío desde el Outlook del vendedor con copia al buzón común |
| Lectura de PDF en el navegador; "cotizaciones leídas del correo" simuladas | **Lectura automática con IA** de las cotizaciones enviadas (buzón común y carpeta de enviados de cada vendedor) vía **Microsoft Graph** |
| Correos de resumen y eventos de Outlook solo en vista previa | Envío real de correos (resumen diario 8:00 a. m., semanal los lunes) y creación de eventos en el calendario de Outlook |
| Leads importados desde un archivo de HubSpot; correos de fabricante pegados a mano | Integración con la **API de HubSpot** y lectura del buzón de leads; orquestación (por ejemplo **n8n** o colas) |
| Tipo de cambio ficticio | Tipo de cambio diario real (SBS / SUNAT) con histórico |
| Carpeta de cotizaciones local del vendedor | Guardado automático en el repositorio documental |
| Data simulada | Migración de los Excel actuales (FUP por vendedor, stock, lista de precios, clientes) con limpieza y mapeo |

## Requisitos no funcionales

- Interfaz en español (Perú); fechas `dd/mm/aaaa`; días hábiles lunes a viernes menos feriados de Perú; moneda USD y PEN, IGV 18 %.
- Dos oficinas: Perú y Chile (usuarios y almacenes por oficina).
- Uso en escritorio (Chrome y Edge) y consulta desde el celular (la UI ya es adaptable a 375 px).
- Auditoría: todo cambio de datos queda en un historial (quién, cuándo, antes y después).
- Respaldos y restauración.
- La lista de precios y los costos son confidenciales: acceso por rol.
- Cantidad de usuarios: a confirmar por Techvalue (Account Managers de Perú y Chile, jefatura, finanzas, logística y administración).

## Lo que pedimos que incluya la cotización

1. Arquitectura propuesta (tecnologías, hosting on-premise o servidor local, base de datos) y por qué.
2. Fases y plazos (por ejemplo: núcleo de cotizaciones + oportunidades → post-venta y stock → integraciones de correo, IA, HubSpot).
3. Costo por fase, y si conviene reutilizar el front del prototipo o rehacerlo.
4. Costo de la lectura con IA (por documento o mensual) y de licencias o servicios de terceros.
5. Migración de datos actuales.
6. Pruebas, capacitación, documentación y entrega del código fuente.
7. Soporte y mantenimiento posterior (horas incluidas, tarifa, tiempos de respuesta).
8. Seguridad: manejo de credenciales, permisos, respaldos y recuperación.

## Preguntas abiertas que el proveedor debería responder

- ¿Qué servidor o infraestructura local necesita y quién la administra?
- ¿Cómo se conecta a Microsoft 365 (Graph) sin exponer la información fuera de la empresa?
- ¿Cómo garantiza que la IA que lee las cotizaciones no envíe datos a terceros, o qué opciones hay (modelo local o proveedor con acuerdo de confidencialidad)?
- ¿Cómo se versionan y despliegan los cambios futuros?
