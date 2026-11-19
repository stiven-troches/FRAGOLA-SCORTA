# SCORTA: entrega de plataforma multiempresa

Actualización: 19 de noviembre de 2026 (UTC).

Esta iteración implementa el alcance A01–A32 en `SCORTA/`. Los archivos de PRENOTA que permanecen en la raíz no forman parte del producto trabajado. La fuente incorpora la plataforma y las interfaces nuevas; la aceptación visual y la instalación real requieren comprobaciones posteriores.

## Comportamiento implementado

| Área | Comportamiento de esta versión |
| --- | --- |
| Login | Pantalla oscura en español, tarjeta central, empresa/usuario/contraseña y control para mostrarla. Acceso distinto para propietario, administrador y vendedor. |
| Propietario | Tarjetas de empresas con logo, URL, estado y vigencia; creación y edición de contacto, correo, WhatsApp, logo, mensualidad y contrato; suspensión y eliminación confirmada. |
| Cuentas | El propietario crea varios administradores o vendedores por empresa, asigna roles y restablece contraseñas. Los administradores del cliente no crean cuentas ni gestionan contratos. |
| Vigencia | El último día del contrato se incluye según Colombia. Las solicitudes del cliente se bloquean antes del inicio, tras el vencimiento o por suspensión manual. |
| Renovación | Registro manual de pago y revisión de nueva vigencia; anticipar un pago conserva días prepagados y la suspensión manual se mantiene hasta retirarla expresamente. |
| Perfil y soporte | El nombre abre Mi perfil, con cambio de contraseña y cierre de sesión. El propietario entra como soporte con motivo; el historial lo atribuye a su identidad. No se muestran contraseñas actuales. |
| Permisos | Datos separados por empresa en servidor. Vendedores acceden a Nueva venta, Inventario de consulta y sus propias operaciones; no reciben costos de compra, compras ni ventas ajenas. |
| Interfaz de cliente | Barra lateral negra permanente; orden del administrador: Nueva venta, Taller, Inventario, Compras, Movimientos y Dashboard. En pantallas pequeñas se utiliza navegación compacta. |
| Inventario | Fotos, búsqueda por palabras/referencia/código, filtros plegados y agregado al carrito. La edición, recepción de mercancía y ajustes pertenecen al administrador. |
| Venta | Carrito conservado al navegar, productos, sólo mano de obra o venta mixta; cliente/teléfono separados de placa, varios trabajos con mecánico e importe editable y método de pago registrado. |
| Taller e historial | Venta y trabajo vinculados para no duplicar el cobro. Consulta por cliente o placa y totales netos que excluyen anulaciones y descuentan devoluciones. La moto sólo utiliza placa. |
| Reversiones | Anulaciones y devoluciones autorizadas por administrador, con motivo, responsable, reversión de existencias y reflejo en los documentos vinculados. |
| Comprobante | Documento comercial descargable, impresión/PDF y enlace opaco con vencimiento en el servidor. WhatsApp es opcional y requiere confirmación del vendedor; el envío no altera la venta guardada. |
| Datos y recuperación | Plataforma SQLite persistente, credenciales protegidas con hash, cookies de sesión y controles de origen; CLI separada para respaldar/restaurar la plataforma completa. |
| Demo | Mismo motor e interfaces con empresas ficticias y perfiles de prueba; IndexedDB guarda los cambios en el navegador y permite reiniciar y exportar datos sin secretos. |

## Dos destinos de ejecución

**Servidor real:** `platform.mjs` y `platform-server.mjs` utilizan la base `platform.sqlite` en `DATA_DIR`. Los usuarios de una empresa comparten su información mediante ese servidor. Su primer propietario se configura con variables privadas y una contraseña de 16–200 caracteres. Las rutas anteriores quedan bloqueadas cuando se activa la plataforma para evitar saltarse el aislamiento.

La preparación preserva `motoshop.sqlite` y copia el inventario anterior a Almacén principal si corresponde. Las cuentas anteriores deben recrearse o restablecerse desde el propietario. Los comandos de copia/restauración anteriores no equivalen al respaldo de todas las nuevas empresas; utilizar `platform-backup.mjs` como indica la guía.

**Demo de navegador:** `platform-demo.mjs` usa el mismo motor con datos ficticios de Moto Norte y Moto Sur, almacenados en IndexedDB. Las cuentas visibles en Datos de prueba son públicas y exclusivas de la demo. No contiene la contraseña privada del propietario ni se presenta como un servidor real multiempresa.

La dirección privada existente es [https://fragola-scorta-demo.safeturnip2.chatgpt.site](https://fragola-scorta-demo.safeturnip2.chatgpt.site). **La publicación de la nueva versión multiempresa de esta entrega está pendiente de confirmación.**

## Verificación y límites

Los resultados de las pruebas de motor, servidor, demo e integración se consolidan en [QA-PLATAFORMA.md](QA-PLATAFORMA.md). Las compilaciones de aplicación y demo forman parte de esta entrega. El conteo final de pruebas se actualizará allí después de la ejecución completa.

No se ha realizado revisión visual en navegador de la plataforma nueva: el entorno administrado de Sites no tiene disponible la herramienta de navegador requerida. Renderizar componentes en Node/SSR y compilar no demuestra su comportamiento visual ni una interacción completa. La aceptación conjunta y las pruebas en celular/PC siguen pendientes, especialmente A18–A20 y P02/P03/P05.

Los resultados y capturas históricos de [QA.md](QA.md), [REVISION-CLARIDAD.md](REVISION-CLARIDAD.md) y [PRUEBA-OPERACION.md](PRUEBA-OPERACION.md) corresponden a la interfaz anterior. Se conservan como antecedentes; no acreditan la plataforma de esta entrega.

Los comprobantes compartidos desde la demo sólo se resuelven en el navegador que conserva sus datos. Para recibirlos en otro equipo se necesita el servidor real. Los comprobantes son comerciales: no se incluye facturación electrónica DIAN, contabilidad, caja ni integración de cobro bancario.

El carrito conserva su contenido al navegar dentro de la aplicación, pero los borradores no se recuperan automáticamente después de cerrar o recargar la página. El escaneo por cámara y la recuperación automática de contraseña por correo permanecen fuera de este alcance.

## Uso real pendiente

Se mantienen abiertos P05–P10: equipos del almacén, alojamiento/dominio/HTTPS, cuentas y credenciales definitivas, copias externas y restauración en destino, importación y conteo del inventario real y piloto de aceptación. No se han creado ni cargado datos reales del cliente con esta entrega.

Documentación: [instalación](../LEEME.md), [API](PLATFORM-API.md), [demo](DEMO.md), [QA actual](QA-PLATAFORMA.md), [matriz de pendientes](PENDIENTES.md) y [condiciones de puesta en marcha](PUESTA-EN-MARCHA.md).
