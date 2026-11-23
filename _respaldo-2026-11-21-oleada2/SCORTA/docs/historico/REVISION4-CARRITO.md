# Revisión 4 · recuperación de venta y prueba guiada

## Alcance entregado

Carrito privado por empresa, persona y contexto de soporte. Productos, servicios, datos del cliente y trabajo aún sin agregar se recuperan desde servidor SQLite; el demo usa exclusivamente su base ficticia IndexedDB. La nueva ruta GET/POST /api/v2/draft exige sesión y acceso vigente. Usa una versión independiente del inventario para evitar conflictos al escribir y un identificador para reintentar guardados sin duplicarlos.

Antes de cobrar se persiste el payload y su requestId. Al confirmar, el mismo cambio que registra la venta limpia el borrador. Una recarga o respuesta perdida conserva la operación que corresponde comprobar; el motor no duplica ventas. Un rechazo conserva el borrador y las existencias. La versión impide que otra pestaña resucite un carrito vaciado o vendido.

Resumen sticky de productos, servicios e importe en todos los módulos. Confirmaciones para vaciar el carrito y retirar una línea; eliminaciones, devoluciones y anulaciones conservan sus autorizaciones previas. Errores próximos al campo, textos y cantidades además de colores. Formularios móviles con texto de 16 px y controles principales de 44 px.

Logo: PNG original con transparencia recibido en el ZIP del propietario; mismos bytes y alfa. Se conserva diseño, tipografía y colores. Solo escala proporcional por CSS.

## Prueba juntos (pendiente)

1. Entrar al demo como vendedor y buscar un aceite en Inventario. Agregar dos unidades; comprobar cantidad e importe del resumen.
2. Ir a Taller. Completar placa, trabajo, mecánico y valor libre. Agregarlo y comprobar el total compartido.
3. En Nueva venta registrar cliente y teléfono. Esperar «Venta pendiente guardada». Recargar y comprobar recuperación de todo el carrito.
4. Intentar una cantidad mayor al stock. Comprobar mensaje junto al producto, corregir y verificar que el carrito continúa intacto.
5. Retirar una línea y cancelar la confirmación. Repetir y confirmar. Probar «Vaciar carrito» cancelando para conservar la venta.
6. Registrar la venta. Comprobar un solo cobro, descuento de existencias y comprobante con producto y servicio. Recargar: no debe reaparecer la venta en el carrito. Consultarla en Mis ventas y servicios.
7. Repetir el recorrido en un celular real y PC; revisar logo, desplazamiento, teclado y lectura de importes.

## Límites de verificación

96/96 pruebas Node aprobadas. Las nueve nuevas cubren aislamiento, persistencia SQLite/IndexedDB, conflictos, reintentos, limpieza atómica, serialización y SSR. Compilaciones de aplicación y demo verificadas; PNG emitido idéntico al original. Dockerfile incluye el nuevo módulo tanto al compilar como en ejecución; no se construyó ni desplegó un contenedor. El entorno Sites no dispone de cua_repl.js; no se inició preview ni se declara QA visual o aceptación de dispositivos. La prueba juntos sigue abierta.

Una pérdida de red antes del guardado confirmado puede impedir recuperar los últimos cambios: el aviso de error permanece y permite reintentar. No se guarda información del negocio real en localStorage. No se conectan correo, WhatsApp automático ni firma legal; servidor definitivo/piloto continúan en P05–P10.
