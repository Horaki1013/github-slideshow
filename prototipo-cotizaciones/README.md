# Prototipo: seguimiento de cotizaciones (Techvalue S.A.)

Prototipo navegable de la plataforma que reemplazará los Excel de follow-up (FUP). Lee cada cotización enviada, pide al vendedor solo lo mínimo (etapa, próximo contacto y fecha estimada de OC), le recuerda los seguimientos y muestra a jefatura y finanzas las metas, el funnel y la proyección de caja.

- **Archivo único:** `index.html` (HTML + CSS + JS). Se abre con doble clic en Chrome o Edge. No necesita servidor, build ni internet.
- **Sin dependencias externas:** los gráficos son SVG propios, sin librerías por CDN.
- **Data 100 % ficticia:** se genera al cargar con una semilla fija y fechas relativas al día de hoy, así la demo siempre parece vigente.
- **Sin persistencia en la demo:** los cambios viven en memoria durante la sesión. El botón **Restablecer datos de demo** (menú de usuario) regenera todo. El **modo piloto** (ver más abajo) sí guarda la información en el navegador.
- **Autoverificación:** al cargar, la consola muestra `Autoverificación de reglas de negocio: 11/11 OK`. También se puede ejecutar a mano con `SelfTest.run()`.

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
| `finanzas` | `demo` | Finanzas | Proyección y facturado (solo lectura); mantiene la lista de precios |
| `admin` | `demo` | Administración | Mantiene la lista de precios |

| Rol | Pantallas | Puede editar |
|---|---|---|
| Vendedor | Mi día, Oportunidades (las suyas), Ficha, Nueva cotización, Mis cuentas, Agenda de contactos, Lista de precios (consulta), Mi proyección (con su fúnel), Ranking, Notificaciones | Solo lo suyo; puede registrar cuentas nuevas (quedan asignadas a él) y contactos de sus cuentas |
| Gerencia / Jefatura | Dashboard, Oportunidades (todas), Ficha, Cuentas, Agenda de contactos, Lista de precios, Proyección, Facturado, Post-venta, Usuarios, Notificaciones | Todo: crear cuentas, asignar o reasignar cuentas y oportunidades entre Account Managers, editar contactos, mantener la lista de precios, marcar cualquier paso de post-venta, crear usuarios y restablecer contraseñas |
| Finanzas | Proyección de facturación y cobranza, Facturado, Post-venta, Lista de precios, Agenda de contactos | La lista de precios y, en el piloto, los pasos "Facturado" y "Cobrado" |
| Logística / Soporte (solo piloto) | Post-venta, Lista de precios (consulta), Agenda de contactos | En el piloto, los pasos físicos: pedido al proveedor, en tránsito, recibido y entregado |
| Administración del sistema | Usuarios, Lista de precios, Agenda de contactos | Usuarios (alta, rol, meta, activar o desactivar, contraseña temporal) y la lista de precios |

En la interfaz, el rol "Vendedor" se muestra como **Account Manager**.

Los permisos se validan en `Rules.puede()` y `Rules.puedeRuta()`. Si un usuario entra por URL a una ruta o a una oportunidad que no le corresponde, el sistema lo redirige o le muestra "Sin acceso".

## Modo piloto (uso interno de prueba)

El mismo `index.html` funciona en dos modos:

| | Demo (este repositorio) | Piloto (archivo privado, no se publica) |
|---|---|---|
| Data | Ficticia, generada al cargar | Inicial migrada de los FUP reales, inyectada en el HTML como `window.__PILOTO_SEED` |
| Persistencia | Ninguna (memoria) | **Carpeta compartida de red** (recurso compartido de Windows), común para todo el equipo. Sin carpeta, IndexedDB del navegador (`techvalue-piloto`). La sesión dura mientras la pestaña esté abierta |
| Login | Usuarios de demo con clave `demo` | Usuario y contraseña propios; la primera vez obliga a cambiar la contraseña temporal |
| Numeración de cotizaciones | Texto libre | Por Account Manager: `INICIALES-AAAA-0001` (p. ej. `NP-2026-0001`), reinicia cada año (`Rules.numeroAM`). Las `TV-AAAA-0001` anteriores se renumeran una vez al abrir la versión nueva (`Repo.migrar`) |
| Datos de la empresa en el PDF | Ficticios, sin logo | Los reales y el logo (vienen en la data inicial y en `window.__PILOTO_EXTRA`, no en el código) |
| Post-venta | La marca el vendedor dueño o jefatura | Por área: el vendedor registra la OC; logística, pedido → entregado; finanzas, facturado y cobrado; gerencia y jefatura, todo |
| Ejemplo simulado de PDF | Visible | Oculto (solo PDF reales) |

**Datos "a verificar por gerencia".** Una cuenta u oportunidad puede traer el campo `verificar` con un texto que explica qué confirmar. Se usa, por ejemplo, para los supuestos de una migración. El dashboard de gerencia muestra cuántas hay y enlaza a la lista filtrada ("A verificar por gerencia" en Cuentas y en Oportunidades). Cada ficha muestra el aviso, y gerencia o jefatura lo cierra con **Marcar como verificado**, con una nota opcional. Queda registrado quién lo verificó y cuándo (`verificado`).

**Versión nueva de datos iniciales.** Si se abre un HTML del piloto con datos iniciales distintos de los guardados en el navegador, la pantalla de ingreso lo avisa y ofrece **Usar la versión nueva**. Antes de reemplazar, descarga un respaldo de lo anterior. Nunca se pisa lo guardado sin confirmar.

### Carpeta compartida (sin servidor ni nube)

Durante el piloto, todos trabajan con los mismos datos guardados en una **carpeta de red de la empresa** (por ejemplo `Z:\Ventas\Piloto`). No hay servidor ni nube: cada navegador lee y escribe archivos en esa carpeta con la API de acceso a archivos de **Edge o Chrome** (`showDirectoryPicker`).

- **Conexión:** en la pantalla de ingreso, **Elegir carpeta…** (una vez por PC). El navegador recuerda la carpeta. En cada sesión basta **Conectar** (pide permiso) o se conecta sola si el permiso sigue vigente.
- **Carpeta vacía:** la primera PC la inicia con los datos iniciales o, si su navegador ya tenía registros propios, con esos datos. Si una PC con registros propios se conecta a una carpeta que ya tiene datos, se descarga un respaldo de lo suyo y pasa a usar los de la carpeta.
- **Archivos:**

  | Archivo | Contenido |
  |---|---|
  | `datos.json` | Todo, menos la lista de precios (unos 2 MB) |
  | `lista-precios.json` | La lista de precios (unos 4 MB); se reescribe solo cuando cambia |
  | `bloqueo.json` | Existe solo mientras una PC escribe |
  | `respaldos/datos-AAAA-MM-DD.json` | Una copia por día; se guardan los últimos 30 días |

- **Escrituras:** cada método de escritura del `Repo` sigue estos pasos:
  1. Toma el bloqueo.
  2. Lee lo último de la carpeta.
  3. Aplica el cambio.
  4. Guarda de inmediato y suelta el bloqueo.

  Así dos PC que guardan a la vez no se pisan. Si una PC se apaga a mitad, su bloqueo se toma a los 12 s. Si no se puede guardar, el cambio se descarta y se avisa, para no quedar distinto a los demás.
- **Lecturas:** cada 8 s, y al volver a la ventana, se revisa si otro usuario cambió algo. Si cambió, la pantalla se actualiza sola, salvo mientras el usuario edita un formulario o tiene un modal abierto.
- **Sin cambiar las reglas ni las pantallas:** todo vive en la capa `AlmacenCompartido` y en un envoltorio de los métodos de escritura al final del `Repo`. Para migrar al servidor local se reemplaza esa capa por llamadas HTTP con la misma firma.
- **Navegadores sin la API** (Firefox, Safari): la plataforma avisa y trabaja solo en ese navegador.

Menú de usuario en el piloto: **Exportar respaldo** (JSON con toda la información), **Restaurar respaldo**, **Cambiar contraseña** y, para gerencia y administración, **Reiniciar con los datos iniciales**.

Limitaciones del piloto, aceptadas por el negocio:

- **Carpeta compartida, no servidor.** Funciona bien para un equipo chico (un guardado tarda menos de un segundo en la red local), pero cada guardado reescribe `datos.json` completo. Con más usuarios o más datos conviene el **servidor local de la empresa** (sin nube): se reemplaza `AlmacenCompartido` por una API interna, y `Repo` y la UI no cambian.
- Quien tenga acceso a la carpeta puede leer los archivos. Los permisos de la carpeta de red son la protección real durante el piloto.
- Las contraseñas se validan en el navegador. Sirven para separar perfiles, pero no son seguridad real mientras no haya servidor.
- El contador de inactividad de cuentas (60 días) empieza a correr desde el inicio del piloto (`inicioSeguimiento`), para no marcar como inactivas todas las cuentas migradas el primer día.

El HTML del piloto se arma fuera del repositorio con scripts privados: migración de los FUP a JSON y armado del HTML con usuarios y contraseñas temporales. Ni la data ni esos archivos se suben aquí; `.gitignore` bloquea `*PRIVADO*` y los `.xlsx`.

## Estructura del código (capas dentro de `index.html`)

| Capa | Objeto | Responsabilidad | En producción |
|---|---|---|---|
| 0 | `Config` | Catálogos y parámetros: etapas, probabilidades, motivos de pérdida, condiciones de pago, plazos, horizontes, feriados, meta | Tabla de parámetros administrable |
| 1b | `LectorPDF`, `LecturaCotizacion` | Extraen el texto de un PDF (objetos, flujos Flate/ASCII85/Hex, fuentes WinAnsi y ToUnicode, posiciones) e interpretan la plantilla de cotización | Lectura en el servidor desde el correo (IA + librería PDF) |
| 1 | `Util` | Fechas ISO, días hábiles con feriados de Perú, formatos `USD 12,345.67` y `dd/mm/aaaa`, aleatorio con semilla | Se mantiene |
| 2 | `DemoData` | Generador de la data ficticia | **Se elimina** |
| 3a | `Almacen` | Guarda y lee el estado del piloto en IndexedDB (no actúa en la demo) y recuerda la carpeta compartida | Se mantiene como caché local |
| 3b | `AlmacenCompartido` | Lee y escribe `datos.json`, `lista-precios.json`, el bloqueo y los respaldos en la carpeta de red | **Se reemplaza por la API del servidor local** |
| 3 | `Repo` | Única puerta de lectura y escritura. Todos sus métodos son `async`; cada uno indica en un comentario el endpoint REST sugerido | **Se reemplaza por llamadas HTTP** con la misma firma |
| 4 | `Rules` | Reglas de negocio puras: reciben la data y devuelven resultados | Se replica en el backend (la UI puede seguir usándolas para mostrar) |
| 5 | `SelfTest` | Casos de prueba de las reglas | Se convierte en pruebas unitarias |
| 6 | `UI` | Enrutador por hash, pantallas, modales y gráficos SVG | Se mantiene o se migra al framework elegido |

La UI nunca modifica la data directamente: lee con `Repo.snapshot()` y escribe con los métodos de `Repo` (`registrarContacto`, `cambiarEtapa`, `registrarCotizacion`, `actualizarPostventa`, `reasignarOpp`, `reasignarCliente`, etc.). El `Repo` vuelve a validar las reglas antes de guardar, como lo haría un backend.

## Dos caminos para registrar una cotización

1. **Cotizar en la plataforma** (opción principal). El vendedor arma la cotización en la pantalla "Nueva cotización" y, al registrarla, la plataforma genera el PDF con la plantilla de Techvalue. Se elimina el doble registro.
   - **Número correlativo automático** en el formato de cada vendedor. En una revisión, toma el número base más el sufijo `-R1`, `-R2`…, y en una alternativa, `-ALT`. Se puede editar a mano.
   - **El código del producto completa** la marca, la descripción y el precio de lista, desde un catálogo ficticio (`db.catalogo`, `Repo.catalogo()`).
   - **"Vista previa PDF"** antes de registrar. Al registrar se abre la cotización con los botones "Descargar PDF" y "Enviar por correo" (simulado).
   - **PDF real con descarga directa** (`PdfDoc`, sin librerías y sin el diálogo de impresión, así que no salen la fecha, el título ni la ruta del navegador):
     - Diseño de la plantilla oficial: logo (en el piloto), franja del número, datos en dos columnas, tabla con encabezado azul, descripción sombreada, totales y condiciones comerciales.
     - Enlaces al correo del vendedor y al procedimiento de atención.
     - Varias páginas con encabezado repetido y "1 de 2".
     - Archivo `COT_<número>.pdf`.
   - **Opcionales** (fuentes, accesorios): botón "Agregar opcional" o flecha ↓ en un ítem para pasarlo a la tabla de opcionales (↑ lo devuelve). En el PDF van en una tabla aparte con su subtotal y **no suman** al total ni al monto de la oportunidad (`Rules.principales`).
   - **Dónde lo piden:** dirección, ciudad y país en cada cotización (`q.clienteDireccion`, `q.clienteCiudad`, `q.clientePais`), así un mismo cliente puede tener cotizaciones para lugares distintos, incluso en otro país.
     - En una cotización ya registrada, el botón **"Datos del cliente"** corrige dirección, ciudad, país y contacto sin hacer una revisión. Lo pueden usar el AM de la oportunidad y gerencia, y el cambio queda en el historial.
   - **Mis datos:** cada usuario actualiza su teléfono, correo y cargo desde su menú. Rol, meta e iniciales los cambian gerencia y administración en "Usuarios".
   - **Contactos:** los editan el AM de la cuenta, gerencia/jefatura, finanzas y administración. Logística solo los consulta.
   - **Referencia:** texto libre por cotización (`q.referencia`) que sale en el PDF; si queda vacía, sale el proyecto. También se corrige en una cotización ya registrada.
   - **Formulario ordenado:** grilla de 12 columnas. El cliente se divide en Empresa, Dónde lo piden y Contacto, y los opcionales van en su propia tabla.
   - **Condición comercial especial:** texto libre que el Account Manager redacta antes de emitir. Sale en el PDF dentro de "Condiciones comerciales".
   - **Datos de la empresa** (pantalla nueva; la editan gerencia/jefatura, finanzas y administración; `Rules.puede('editar_empresa')`):
     - Qué se edita: razón social, RUC, dirección, central, web, área, forma de pago (cuentas bancarias), entrega, despacho, términos de venta y su enlace.
     - Queda un historial de quién cambió qué.
     - Cada cotización guarda una copia de las condiciones al emitirse (`q.condiciones`), así que un cambio posterior no altera las ya enviadas.
   - **Datos del contacto en la cotización:** correo, teléfono y dirección de la empresa. Se guardan en la cotización, en la cuenta y en la agenda de contactos.
   - **Cada cotización de la ficha tiene su botón "PDF"**, y la ficha permite **"Crear revisión desde la vigente"**: copia ítems y condiciones para ajustarlos y emitir la R siguiente.
   - **Datos de ejemplo en la plantilla:** el RUC, los datos bancarios, la dirección y la central de Techvalue son marcadores, no copias del archivo real.
2. **Registrar un PDF ya enviado** (para cotizaciones hechas con la plantilla Excel). El PDF **se lee de verdad en el navegador**, sin internet y sin subirlo a ningún lado (`LectorPDF` + `LecturaCotizacion`), y llena el formulario para revisar y confirmar.
   - **Lee:** número, cliente y RUC, contacto con correo y teléfono, referencia (se propone como proyecto), fecha, moneda, ítems (cantidad, unidad, código, marca, descripción en varias líneas, valor unitario), suma, IGV, total, condición de pago, validez y plazo.
   - **Descuento:** la plantilla oculta la fila de descuento, así que se deduce de la suma y el IGV. El formulario compara el total del PDF con el calculado y avisa si no coinciden.
   - **Varios PDF a la vez:** se registran uno por uno, con "PDF 2 de 5" y "Saltar este PDF".
   - **Cliente:** se busca por RUC (o por razón social si la cuenta no tenía RUC, y lo completa). Si no existe, se propone como cliente nuevo. Si está sin asignar, pasa a la cartera del vendedor. Si es de otro vendedor, queda el aviso "A verificar por gerencia".
   - **Revisión:** solo se propone si el número del PDF es el mismo base con `-REV1`, `-R1` o `-ALT`. Otra cotización para el mismo cliente es una oportunidad nueva.
   - **Probado con PDF exportados desde Excel, LibreOffice, Chrome y ReportLab**, de una y de varias páginas. Un PDF escaneado (solo imagen) o protegido muestra un mensaje claro y la opción "Ingresar a mano".
   - En la demo sigue el botón "Usar un PDF de ejemplo (simulado)". En la versión final, la cotización se leerá directamente del correo enviado.

## Fúnel vertical

En el Dashboard (toda la empresa o por vendedor) y en "Mi proyección" de cada vendedor. El ancho de cada franja se puede ver por **cantidad** o por **monto**. Se agrupa así, de arriba abajo:

| Grupo | Etapas |
|---|---|
| Leads y propuestas | Oferta grande sin feedback, 1. Enviada, 2. En evaluación, 3. Bien recibida |
| Por cerrar | 4. En competencia, 5. Negociación, 6. OC comprometida |
| Cerradas | Ganadas en los últimos 30 días |

Cada franja muestra cantidad, monto y ponderado. Las pausas quedan fuera del fúnel.

## Cuentas, estado automático y agenda de contactos

- **Cuentas** (vendedor: "Mis cuentas"; jefatura: todas). Muestra el estado, la última cotización, el último contacto, las oportunidades abiertas y los contactos de cada cuenta.
  - **Jefatura asigna** cada cuenta a un vendedor desde la tabla o desde la ficha de la cuenta. Hay cuentas "Sin asignar" para repartir. Reasignar mueve también las oportunidades abiertas y en pausa.
  - **El vendedor registra cuentas nuevas** que consigue por su cuenta; quedan asignadas a él. Jefatura también puede crearlas y asignarlas o dejarlas sin asignar. Se valida el RUC (11 dígitos y que no exista ya).
- **Estado de la cuenta** (`Rules.cuentas`), recalculado automáticamente cada día:

| Estado | Regla |
|---|---|
| Activo | Cotizada en los últimos 60 días, o respondió a un contacto en ese período |
| No responde | Más de 60 días sin cotizar; hubo intentos de contacto y ninguno tuvo respuesta |
| Sin contacto | Más de 60 días sin cotizar y sin intentos de contacto en ese período |

  - Los contactos que cuentan son los seguimientos de sus oportunidades y las **gestiones de cuenta** (contactos sin cotización). Ambos registran si el cliente **respondió o no**.
  - Una cuenta que nunca se cotizó cuenta los días desde su fecha de alta.
  - El umbral está en `Config.CUENTA_INACTIVA_DIAS` (60).
- **Alerta de cuenta sin cotizar:** cuando el estado es "No responde" o "Sin contacto", la alerta llega **al vendedor asignado y a jefatura**. Aparece en la campana, en Mi día ("Cuentas sin cotizar (2+ meses)"), en el correo diario del vendedor y en el resumen semanal de jefatura. Desde la alerta se puede **registrar una gestión** o **cotizar** con el cliente ya elegido.
- **Agenda de contactos común:** todos consultan los contactos de todas las cuentas, con búsqueda y accesos a WhatsApp, llamada y correo.
  - Registrar contactos es **opcional**. Solo el nombre es obligatorio; cargo, correo y teléfono son opcionales.
  - Los agrega o edita el vendedor de la cuenta o jefatura. Finanzas solo consulta.
- **Dashboard:** la tarjeta "Cartera de cuentas" muestra, por vendedor, cuentas activas, que no responden, sin contacto y sin asignar.

## Lista de precios (confidencial)

**Pantalla "Lista de precios".** Todos la consultan; **solo jefatura, finanzas y administración** la modifican:
- Agregar, editar o quitar productos.
- Importar la lista completa.
- Exportarla a CSV.
- Ver el historial de cambios: quién actualizó qué y cuándo.

El `Repo` vuelve a validar el rol en cada cambio, como lo haría el backend.

**Al cotizar:**
- El vendedor escribe el código o parte de la descripción y elige de la lista desplegable (flechas y Enter, o clic).
- También puede abrir **"Buscar en la lista de precios"** para explorar por marca.
- Se completan marca, descripción y precio de lista (en PEN se convierte con el tipo de cambio).
- El vendedor puede **modificar la descripción y el precio solo para su cotización**: la lista no cambia. Si edita el precio, el formulario y la ficha lo marcan como "editado vs lista" y el ítem guarda el precio de lista (`listaUSD`) para control.

**Importación** (`ListaPrecios`, en el navegador; el archivo no se sube a ningún servidor):
- **Formatos:** Excel `.xlsx` con una hoja por marca, o CSV con columna Marca. El CSV que exporta la propia pantalla es reimportable.
- **Qué interpreta:**
  - Encabezados en distintas filas.
  - Varias columnas de código: usa la que tiene más datos.
  - Precio en "Lista 1" o "L1".
  - Comas o puntos decimales.
  - Filas de sección y celdas con error (`#N/A`), que se omiten y se reportan como "sin precio".
- **Dos modos:**
  - **Reemplazar las marcas del archivo:** cada marca queda exactamente como en el archivo.
  - **Solo agregar y actualizar precios:** no quita nada.
- **Las cotizaciones ya emitidas no cambian:** guardan el precio con el que se cotizaron.

**Confidencialidad:**
- **Este repositorio es público.** El `index.html` versionado solo trae una lista **ficticia** de unos 60 productos.
- **La lista real no se versiona.** Se entrega aparte una copia privada del HTML (`index-PRIVADO-con-lista-de-precios.html`) que la trae embebida (`window.__LISTA_PRECIOS_PRIVADA`) y que `Repo.init` carga en lugar de la ficticia.
- **Barrera en el repositorio:** el `.gitignore` bloquea los archivos `*PRIVADO*`, los `.xlsx` y los CSV de listas de precios dentro de esta carpeta.
- **Producción:** la lista vive en la base de datos y la API la entrega solo a usuarios autenticados. Las búsquedas se hacen en el servidor, de modo que el navegador no recibe la lista completa.

## Comisiones de vendedores

- **Regla** (`Rules.comision`): comisión del mes = (facturado del mes sin IGV − meta mensual) × 2 %, **solo si se supera la meta**. Ejemplo: 41K facturados con meta de 40K → (41,000 − 40,000) × 2 % = **USD 20**.
- **Parámetro:** el porcentaje está en `Config.COMISION_PCT` (0.02).
- **Cálculo por mes:** no es acumulativa entre meses; no hay tope; se calcula sobre lo **facturado**, no sobre lo cobrado.
- **Dónde se ve:**
  - **Vendedor:**
    - En Mi día: su comisión del mes, cuánto le falta para empezar a comisionar y una **estimación** si se facturan las ganadas y el ponderado del mes (`Rules.comisionProyectada`).
    - En "Mi proyección": su historial de 6 meses.
  - **Jefatura:** columna "Comisión del mes" en el ranking del Dashboard.
  - **Jefatura y finanzas:** tabla "Comisiones de vendedores" en Facturado, con 6 meses por vendedor y totales.
  - **El ranking visible para todo el equipo no muestra comisiones:** cada vendedor solo ve la suya.

## Descuentos

El descuento de una cotización puede ingresarse **en porcentaje o en monto**. En porcentaje se aplica sobre la suma (`descuentoTipo`, `descuentoPct`), y la ficha y el PDF muestran "Descuento (x%)".

## Modelo de datos

| Entidad | Campos |
|---|---|
| **Usuario** | `id`, `nombre`, `iniciales`, `correo`, `meta` (40,000 USD), `rol` (vendedor, jefatura, finanzas, logistica o admin), `activo`. En el piloto, además: `usuario`, `salt`, `claveHash` (SHA-256 de sal + contraseña) y `debeCambiar` |
| **Cliente** | `id`, `razonSocial`, `ruc` (11 dígitos), `vendedorId`, `ciudad`, `tipo`, `fechaAlta`, `registradoPor`, `contactos[]` (id, nombre, cargo, correo, teléfono; todo opcional salvo el nombre). El **segmento** (T1, T2 o CO) y el **estado** (activo, no responde o sin contacto) se calculan (`Rules.segmento`, `Rules.cuentas`). `vendedorId` puede ser nulo (sin asignar) |
| **Proyecto** | `id`, `nombre`, `usuarioFinal`, `tipo` (estatal, privado o directa). `PR-DIRECTA` = "Compra directa (sin proyecto)". Un proyecto puede tener oportunidades de varios integradores |
| **Oportunidad** | `id`, `clienteId`, `proyectoId`, `vendedorId`, `etapa` (la probabilidad se deriva), `fechaInicio`, `fechaOC` (estimada, la define el vendedor), `proxContacto`, `motivoPerdida`, `motivoOtro`, `fechaReactivacion`, `fechaCierre`, `postventa`, `origen` (correo, pdf o manual), `pendiente` (leída del correo y aún sin completar) |
| **Cotización** | `id`, `oppId`, `numero` (texto libre, como figura en el PDF), `revision` (R0, R1… o ALT), `tipo` (original, revision o alternativa), `fechaEmision`, `moneda` (USD o PEN), `tc` (tipo de cambio del día si es PEN), `condicionPago`, `validezDias`, `plazo`, `items[]`, `descuentoTipo` (pct o monto), `descuentoPct`, `descuento` (monto resultante), `vigente`, `contacto`. La suma, el neto sin IGV, el IGV 18 % y el total se **calculan** (`Rules.totales`). Una oportunidad tiene una o más cotizaciones y solo una vigente |
| **Ítem** | `cant`, `unidad`, `codigo`, `marca`, `descripcion`, `valorUnit` (en la moneda de la cotización), `listaUSD` (precio de lista al momento de cotizar, si vino de la lista). El total se calcula |
| **Seguimiento** | `id`, `oppId`, `fecha`, `canal` (WhatsApp, Llamada, Correo, Visita, Reunión o "Sistema" para registros automáticos), `nota`, `resultado` (respondió o sin respuesta), `proxContacto`, `usuarioId`, `auto` |
| **Producto (lista de precios)** | `id`, `marca`, `codigo`, `descripcion`, `precio` (USD, precio de lista sin IGV), `actualizado`, `actualizadoPor`. Más `catalogoInfo` (fecha, autor y origen de la última actualización) y `catalogoLog` (historial de cambios) |
| **Gestión de cuenta** | `id`, `clienteId`, `fecha`, `canal`, `resultado` (respondió o sin respuesta), `nota`, `usuarioId`. Es un contacto con la cuenta sin oportunidad de por medio |
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
- **Lectura desde el correo:** no existe. El vendedor elige los PDF en "Registrar PDF ya enviado" y se leen en el navegador. Solo el botón "Usar un PDF de ejemplo (simulado)" de la demo muestra datos ficticios.
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
6. **Persistencia en el servidor local de la empresa.** El piloto comparte los datos con una carpeta de red, sin servidor.
7. **Importación de los FUP actuales**, con mapeo de columnas que varían entre vendedores. Hay que normalizar las probabilidades intermedias a la etapa más cercana y convertir el motivo de pérdida de texto libre a la lista cerrada.
8. **Generación del PDF en el servidor**, envío desde el Outlook del vendedor con copia al buzón común, catálogo y lista de precios reales, y aprobación de descuentos especiales o de registro con la marca.
9. **Comisiones:** confirmar si se calculan sobre lo facturado o lo cobrado, si hay tope o escalas, y cómo tratar notas de crédito o anulaciones; luego integrar con planillas.
10. **Lista de precios en el servidor:** búsqueda en la API, permisos por rol, historial de precios por producto, varias listas (Lista 1, 2…) y aprobación de precios por debajo de un margen.
11. **Facturación parcial** (varias facturas por oportunidad). El prototipo asume una sola factura.
12. **Tipo de cambio real** (por ejemplo, SBS o SUNAT) y su histórico.
13. Parametrización de metas por vendedor y mes y de feriados móviles. La administración de usuarios ya existe en el piloto, pero sin seguridad de servidor.

## Decisiones tomadas con el negocio para el prototipo

- Horizontes: antes de fin de mes, 30, 60, 90 y 120 días.
- Tasa de cierre sin "ganó otro integrador" ni pausas.
- Segmento calculado con 12 meses de facturación, aunque los gráficos muestran 6 meses.
- Días hábiles de lunes a viernes, menos los feriados de Perú.
- Reasignar un cliente mueve también sus oportunidades abiertas y en pausa.
- Una sola factura por oportunidad.
- Proyecto obligatorio, con la opción "Compra directa".
- Descuento en porcentaje o en monto.
- Comisión del 2 % sobre lo facturado (sin IGV) por encima de la meta mensual; mensual, sin tope, sobre lo facturado.
- Jefatura asigna cuentas; los vendedores registran cuentas nuevas, que quedan asignadas a ellos.
- Estado de la cuenta automático con umbral de 60 días. Alerta al vendedor y a jefatura cuando el estado es "No responde" o "Sin contacto".
- Agenda de contactos común y opcional.
- Lista de precios confidencial: la mantienen jefatura, finanzas y administración; los vendedores la consultan y ajustan precio y descripción solo en sus cotizaciones. Se toma la columna "Lista 1" o "L1" como precio en USD, y los productos sin precio en el archivo no se cargan.
- **Excepción en la data de demo:** hay una oferta de unos 236K USD para mostrar la etapa "Oferta grande sin feedback". El resto de montos va de 200 a 120,000 USD.

## Notas técnicas

- Fuente: Century Gothic, con alternativas sans-serif si no está instalada. Color principal `#015088`.
- Los campos de fecha usan el selector nativo del navegador, que muestra el formato según el idioma del sistema (dd/mm/aaaa en un Windows o Chrome configurado en español de Perú). En todo el texto de la interfaz las fechas se muestran como dd/mm/aaaa.
- El CSV exportado usa `;` como separador y UTF-8 con BOM, para que Excel lo abra directamente.
- Probado en Chromium headless a 1366 px y 375 px de ancho con todos los roles, en modo demo y en modo piloto (login, cambio de contraseña, persistencia tras recargar, respaldo, numeración general y post-venta por área): sin errores en la consola, sin desborde horizontal y con los flujos principales verificados.
