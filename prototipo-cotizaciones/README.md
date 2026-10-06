# Prototipo: seguimiento de cotizaciones (Techvalue S.A.)

Prototipo navegable de la plataforma que reemplazará los Excel de follow-up (FUP). Lee cada cotización enviada, pide al vendedor solo lo mínimo (etapa, próximo contacto y fecha estimada de OC), le recuerda los seguimientos y muestra a jefatura y finanzas las metas, el funnel y la proyección de caja.

- **Archivo único:** `index.html` (HTML + CSS + JS). Se abre con doble clic en Chrome o Edge. No necesita servidor, build ni internet.
- **Sin dependencias externas:** los gráficos son SVG propios, sin librerías por CDN.
- **Data 100 % ficticia:** se genera al cargar con una semilla fija y fechas relativas al día de hoy, así la demo siempre parece vigente.
- **Sin persistencia:** los cambios viven en memoria durante la sesión. No se usa `localStorage` ni otro almacenamiento. El botón **Restablecer datos de demo** (menú de usuario) regenera todo.
- **Autoverificación:** al cargar, la consola muestra `Autoverificación de reglas de negocio: 7/7 OK`. También se puede ejecutar a mano con `SelfTest.run()`.

## Usuarios de demo

El login es **solo de apariencia: no es seguridad real**. La tabla de usuarios aparece en la misma pantalla de ingreso.

| Usuario | Clave | Rol | Perfil en la demo |
|---|---|---|---|
| `cm` | `demo` | Vendedor | Suele superar la meta |
| `js` | `demo` | Vendedor | Cerca de la meta |
| `lp` | `demo` | Vendedor | Cerca de la meta |
| `dh` | `demo` | Vendedor | Por debajo de la meta |
| `vc` | `demo` | Vendedor | Nuevo, con poco historial |
| `jefatura` | `demo` | Jefatura | Ve todo, filtra por vendedor y reasigna |
| `finanzas` | `demo` | Finanzas | Proyección y facturado, solo lectura |

| Rol | Pantallas | Puede editar |
|---|---|---|
| Vendedor | Mi día, Oportunidades (las suyas), Ficha, Nueva cotización, Mi proyección (con su fúnel), Ranking, Notificaciones | Solo lo suyo |
| Jefatura | Dashboard, Oportunidades (todas), Ficha, Proyección, Facturado, Notificaciones | Reasignar oportunidad o cliente |
| Finanzas | Proyección de facturación y cobranza, Facturado | Nada |

Los permisos se validan en `Rules.puede()` y `Rules.puedeRuta()`. Si un usuario entra por URL a una ruta o a una oportunidad que no le corresponde, el sistema lo redirige o le muestra "Sin acceso".

## Estructura del código (capas dentro de `index.html`)

| Capa | Objeto | Responsabilidad | En producción |
|---|---|---|---|
| 0 | `Config` | Catálogos y parámetros: etapas, probabilidades, motivos de pérdida, condiciones de pago, plazos, horizontes, feriados, meta | Tabla de parámetros administrable |
| 1 | `Util` | Fechas ISO, días hábiles con feriados de Perú, formatos `USD 12,345.67` y `dd/mm/aaaa`, aleatorio con semilla | Se mantiene |
| 2 | `DemoData` | Generador de la data ficticia | **Se elimina** |
| 3 | `Repo` | Única puerta de lectura y escritura. Todos sus métodos son `async`; cada uno indica en un comentario el endpoint REST sugerido | **Se reemplaza por llamadas HTTP** con la misma firma |
| 4 | `Rules` | Reglas de negocio puras: reciben la data y devuelven resultados | Se replica en el backend (la UI puede seguir usándolas para mostrar) |
| 5 | `SelfTest` | Casos de prueba de las reglas | Se convierte en pruebas unitarias |
| 6 | `UI` | Enrutador por hash, pantallas, modales y gráficos SVG | Se mantiene o se migra al framework elegido |

La UI nunca modifica la data directamente: lee con `Repo.snapshot()` y escribe con los métodos de `Repo` (`registrarContacto`, `cambiarEtapa`, `registrarCotizacion`, `actualizarPostventa`, `reasignarOpp`, `reasignarCliente`, etc.). El `Repo` vuelve a validar las reglas antes de guardar, como lo haría un backend.

## Dos caminos para registrar una cotización

1. **Cotizar en la plataforma** (opción principal). El vendedor arma la cotización en la pantalla "Nueva cotización" y, al registrarla, la plataforma genera el PDF con la plantilla de Techvalue. Se elimina el doble registro.
   - **Número correlativo automático** en el formato de cada vendedor. En una revisión, toma el número base más el sufijo `-R1`, `-R2`…, y en una alternativa, `-ALT`. Se puede editar a mano.
   - **El código del producto completa** la marca, la descripción y el precio de lista, desde un catálogo ficticio (`db.catalogo`, `Repo.catalogo()`).
   - **"Vista previa PDF"** antes de registrar. Al registrar se abre el PDF generado, con los botones "Descargar PDF" (diálogo de impresión → "Guardar como PDF") y "Enviar por correo" (simulado).
   - **Cada cotización de la ficha tiene su botón "PDF"**, y la ficha permite **"Crear revisión desde la vigente"**: copia ítems y condiciones para ajustarlos y emitir la R siguiente.
   - **Datos de ejemplo en la plantilla:** el RUC, los datos bancarios, la dirección y la central de Techvalue son marcadores, no copias del archivo real.
2. **Leer un PDF ya enviado** (respaldo para quien siga usando el Excel): lectura simulada en el prototipo; con IA desde el correo en la versión final.

## Fúnel vertical

En el Dashboard (toda la empresa o por vendedor) y en "Mi proyección" de cada vendedor. El ancho de cada franja se puede ver por **cantidad** o por **monto**. Se agrupa así, de arriba abajo:

| Grupo | Etapas |
|---|---|
| Leads y propuestas | Oferta grande sin feedback, 1. Enviada, 2. En evaluación, 3. Bien recibida |
| Por cerrar | 4. En competencia, 5. Negociación, 6. OC comprometida |
| Cerradas | Ganadas en los últimos 30 días |

Cada franja muestra cantidad, monto y ponderado. Las pausas quedan fuera del fúnel.

## Modelo de datos

| Entidad | Campos |
|---|---|
| **Usuario** | `id`, `nombre`, `iniciales`, `correo`, `meta` (40,000 USD), `rol` (vendedor, jefatura o finanzas) |
| **Cliente** | `id`, `razonSocial`, `ruc` (11 dígitos), `vendedorId`, `ciudad`, `tipo`, `contactos[]` (nombre, correo, teléfono). El **segmento** T1, T2 o CO se calcula (`Rules.segmento`) |
| **Proyecto** | `id`, `nombre`, `usuarioFinal`, `tipo` (estatal, privado o directa). `PR-DIRECTA` = "Compra directa (sin proyecto)". Un proyecto puede tener oportunidades de varios integradores |
| **Oportunidad** | `id`, `clienteId`, `proyectoId`, `vendedorId`, `etapa` (la probabilidad se deriva), `fechaInicio`, `fechaOC` (estimada, la define el vendedor), `proxContacto`, `motivoPerdida`, `motivoOtro`, `fechaReactivacion`, `fechaCierre`, `postventa`, `origen` (correo, pdf o manual), `pendiente` (leída del correo y aún sin completar) |
| **Cotización** | `id`, `oppId`, `numero` (texto libre, como figura en el PDF), `revision` (R0, R1… o ALT), `tipo` (original, revision o alternativa), `fechaEmision`, `moneda` (USD o PEN), `tc` (tipo de cambio del día si es PEN), `condicionPago`, `validezDias`, `plazo`, `items[]`, `descuento`, `vigente`, `contacto`. La suma, el neto sin IGV, el IGV 18 % y el total se **calculan** (`Rules.totales`). Una oportunidad tiene una o más cotizaciones y solo una vigente |
| **Ítem** | `cant`, `unidad`, `codigo`, `marca`, `descripcion`, `valorUnit` (en la moneda de la cotización). El total se calcula |
| **Seguimiento** | `id`, `oppId`, `fecha`, `canal` (WhatsApp, Llamada, Correo, Visita, Reunión o "Sistema" para registros automáticos), `nota`, `proxContacto`, `usuarioId`, `auto` |
| **Post-venta** (en la oportunidad) | `oc`, `pedido`, `transito`, `recibido`, `entregado`, `facturado`, `facturaMonto` (USD sin IGV), `cobrado`, `adelantoCobrado` |
| **Tipo de cambio** | `fx[fecha]`: valor diario ficticio alrededor de 3.75 |
| **Histórico** | `historico[]`: facturación de los meses 7 a 12 hacia atrás, por cliente. Solo se usa para calcular el segmento |

## Reglas de negocio implementadas (`Rules`)

**Etapas y probabilidad.** Se usa la escala de CRITERIOS sin cambios:

| Etapa | Probabilidad |
|---|---|
| Oferta grande sin feedback | 1 % |
| 1. Enviada | 5 % |
| 2. En evaluación | 10 % |
| 3. Bien recibida | 15 % |
| 4. En competencia | 25 % |
| 5. Negociación | 50 % |
| 6. OC comprometida | 75 % |
| Ganada | 100 % |
| Perdida | 0 % |
| En pausa | Fuera del funnel |

El vendedor elige la etapa y el sistema asigna la probabilidad; no hay valores intermedios. Si el monto supera 200K USD, el formulario sugiere la etapa de 1 %.

**Validaciones.** Están en `validarCambioEtapa`, `validarOportunidad` y `validarCotizacion`:
- Perdida exige un motivo de la lista cerrada; "Otro" exige además el texto.
- En pausa exige una fecha de reactivación futura.
- Ganada exige la fecha de la OC.
- Ninguna oportunidad abierta queda sin próximo contacto. Al cambiar de etapa o registrar un contacto, el sistema lo pide.
- **Única excepción:** las cotizaciones leídas del correo quedan marcadas como `pendiente` hasta que el vendedor las completa.

**Varios integradores.** Cada integrador es una oportunidad independiente. Al marcar una como Ganada, el sistema ofrece cerrar las demás del proyecto con "Ganó otro integrador que también cotizamos". Ese motivo **no cuenta** como pérdida en la tasa de cierre.

**Revisiones.**
- Una cotización nueva con el mismo RUC y el mismo proyecto que una oportunidad abierta (o en pausa) del vendedor se propone como revisión: R(n+1), que pasa a ser la vigente.
- El vendedor confirma o elige registrarla como "alternativa con otra marca" o como oportunidad nueva.

**Número duplicado.** Si el número ya existe (sin distinguir mayúsculas ni espacios), se muestra una advertencia, pero se permite registrar.

**Alertas.** Están en `alertasOpp` y `alertasUsuario`:
- **Sin próximo contacto.**
- **Contactar hoy.**
- **Atrasado:** el próximo contacto ya pasó; se cuentan días hábiles con los feriados de Perú, incluidos Jueves y Viernes Santo. Más de 5 días hábiles se **escala a jefatura**.
- **Primer seguimiento pendiente:** pasaron 3 días hábiles desde el envío y no hay contacto manual.
- **Cotización por vencer:** emisión + validez; avisa el día anterior y el mismo día.
- **Fecha estimada de OC vencida sin OC.**
- **Pausa por reactivar.**

**Montos.**
- Todo se compara en USD sin IGV. Las cotizaciones en PEN se convierten con el tipo de cambio guardado del día de emisión.
- Ponderado = neto USD × probabilidad.

**Meta y cobertura** (`avanceMeta`):
- Facturado del mes sin IGV frente a 40K por vendedor. La meta de la empresa es la suma (5 × 40K).
- Cobertura = (ganadas por facturar con factura estimada en el mes + ponderado de abiertas con factura estimada en el mes) ÷ lo que falta.

**Tasa de cierre** (`tasaCierre`): ganadas ÷ (ganadas + perdidas) por cantidad y por monto. Excluye "ganó otro integrador" y las pausas.

**Segmento:** T1 si se facturaron más de 75K USD en los últimos 12 meses; T2 entre 10K y 75K; CO menos de 10K.

**Proyección** (`proyeccion`, `fechaFactura`, `eventosCobro`, `horizonte`):
- **Fecha estimada de factura** = fecha de OC + extremo mayor del plazo de entrega. Se asume que se factura al entregar.
- **Cobro por condición de pago:**
  - 100 % contra entrega y "Negociable con la OC": en la entrega.
  - Abono a cuenta bancaria: en la fecha de OC.
  - 50 % de adelanto: 50 % en la OC y 50 % en la entrega.
  - Factura o cheque diferido a 30 días: factura + 30 días.
- **Horizontes:**
  - Hasta fin de mes → "Este mes" (FACT 0).
  - Luego, días desde hoy: ≤ 30 → FACT 1, ≤ 60 → FACT 2, ≤ 90 → FACT 3, más de 90 → "120 días" (FACT 4).
  - Las fechas pasadas aún no facturadas o cobradas se muestran en "Este mes" marcadas como atrasadas.
- Las ganadas entran al 100 % y las abiertas ponderadas. La facturación va sin IGV; la cobranza, con IGV.
- En las ganadas con abono o 50 % de adelanto, el adelanto se considera cobrado al registrar la OC.

## Qué está simulado en el prototipo

- **PDF de la plataforma:** se genera en el navegador como vista imprimible; en producción, en el servidor (HTML → PDF), guardado en SharePoint y adjuntado al correo.
- **Lectura del PDF con IA:** la pantalla "Subir PDF" no lee el archivo. Muestra "Leyendo cotización…" durante 1.5 s y luego datos ficticios coherentes con la cartera del vendedor (incluye un caso que dispara la detección de revisión).
- **Cotizaciones leídas del correo:** aparecen en la data como oportunidades `pendiente` ("Completar").
- **Correo de resumen diario** (vendedor), **resumen semanal** (jefatura) y **eventos de Outlook:** solo vista previa en **Notificaciones**. No se envía nada.
- **Tipo de cambio diario:** ficticio.
- **Login:** simulado.
- **Acciones rápidas "+3 días" y "+1 semana":** registran un contacto hoy, con el canal del último contacto (o WhatsApp), y fijan el próximo en 3 días hábiles o en 7 días (llevado al siguiente día hábil). Permiten **Deshacer**.

## Qué falta para producción (fuera del alcance de este prototipo)

1. **Lectura real de cotizaciones con IA** desde el correo enviado. Ojo: no todos copian siempre al buzón común, así que conviene leer también la carpeta de enviados de cada vendedor. Hay que extraer cliente, RUC, contacto, número (desde el contenido, no del nombre del archivo), fecha, moneda, ítems, condición, validez, plazo y el campo **Referencia** de la plantilla, que se sugiere usar para el proyecto y el usuario final.
2. **Conexión al correo con Microsoft Graph**, más **envío real de correos** y **creación y actualización de eventos de Outlook**.
3. **Orquestación** (por ejemplo, n8n o colas) para la ingesta y las alertas programadas: resumen diario a las 8:00 a. m. y semanal los lunes.
4. **Base de datos y API** que implemente `Repo` con las mismas reglas de `Rules`, más la auditoría de cambios.
5. **Login corporativo** (Microsoft 365 / Entra ID) y permisos en el servidor.
6. **Persistencia** de toda la información.
7. **Importación de los FUP actuales**, con mapeo de columnas que varían entre vendedores. Hay que normalizar las probabilidades intermedias a la etapa más cercana y convertir el motivo de pérdida de texto libre a la lista cerrada.
8. **Generación del PDF en el servidor**, envío desde el Outlook del vendedor con copia al buzón común, catálogo y lista de precios reales, y aprobación de descuentos especiales o de registro con la marca.
9. **Facturación parcial** (varias facturas por oportunidad). El prototipo asume una sola factura.
10. **Tipo de cambio real** (por ejemplo, SBS o SUNAT) y su histórico.
11. Parametrización de metas por vendedor y mes, administración de usuarios, catálogo de productos y feriados móviles.

## Decisiones tomadas con el negocio para el prototipo

- Horizontes: antes de fin de mes, 30, 60, 90 y 120 días.
- Tasa de cierre sin "ganó otro integrador" ni pausas.
- Segmento calculado con 12 meses de facturación, aunque los gráficos muestran 6 meses.
- Días hábiles de lunes a viernes, menos los feriados de Perú.
- Reasignar un cliente mueve también sus oportunidades abiertas y en pausa.
- Una sola factura por oportunidad.
- Proyecto obligatorio, con la opción "Compra directa".
- **Excepción en la data de demo:** hay una oferta de unos 236K USD para mostrar la etapa "Oferta grande sin feedback". El resto de montos va de 200 a 120,000 USD.

## Notas técnicas

- Fuente: Century Gothic, con alternativas sans-serif si no está instalada. Color principal `#015088`.
- Los campos de fecha usan el selector nativo del navegador, que muestra el formato según el idioma del sistema (dd/mm/aaaa en un Windows o Chrome configurado en español de Perú). En todo el texto de la interfaz las fechas se muestran como dd/mm/aaaa.
- El CSV exportado usa `;` como separador y UTF-8 con BOM, para que Excel lo abra directamente.
- Probado en Chromium headless a 1366 px y 375 px de ancho con los tres roles: sin errores en la consola, sin desborde horizontal y con los flujos principales verificados.
