# Revisión 6 · herramientas del administrador

## Accesos

Dashboard → Administración: Cierre de caja, Reportes y exportaciones, Preparar reposición y Mecánicos. Inventario → Opciones también ofrece reportes y reposición. Taller ofrece Mecánicos junto al historial; Perfil contiene Mi suscripción. Los menús principales y la barra móvil conservan su estructura.

## Comportamiento

Cierre de caja: compara el neto actual de las ventas cuya fecha original es la seleccionada, por efectivo, transferencia y tarjeta, contra los importes realmente recibidos que introduce el administrador. Presenta diferencia por medio y total, fecha, autor, observación y confirmación antes de guardar. Solo un cierre por fecha/empresa; reintentar requestId no lo duplica. La copia queda inmutable. Si el neto de esa fecha cambia posteriormente, aparece un aviso por medio de pago aunque el total general siga igual. No cambia stock ni crea movimientos bancarios.

El alcance es conciliación de ventas, no un libro histórico de efectivo: devoluciones y anulaciones se aplican a la fecha original de venta; no se reconstruye el flujo por el día de devolución, ni se incluyen saldo inicial, gastos o retiros. Ventas con un medio de pago desconocido impiden cerrar hasta revisarlas. El UI lo explica y conserva el reporte para localizar los registros.

Reportes: período inclusivo por fecha en Bogotá; importe de productos, mano de obra, devoluciones, anulaciones, neto y margen de productos. El margen usa costo_unitario de la venta, nunca el costo actual del inventario. Si falta ese costo queda incompleto; la mano de obra no se presenta como utilidad porque no existen costos de servicio registrados. Compras anuladas no aumentan compras netas. Existencias/reorden muestran el estado actual, sin fingir un inventario histórico.

Mecánicos: catálogo por empresa con nombre y estado activo. El administrador gestiona; vendedor y administrador seleccionan el mecánico al agregar un servicio. La venta conserva ID y nombre del momento. Se admiten borradores anteriores de texto libre; si no hay catálogo activo puede registrarse el nombre. Desactivar no borra el historial. Los cobros se calculan solo desde ventas para no duplicar los registros reflejados en Taller. Los nombres antiguos no asociados se muestran en una sección plegable; una devolución entre varios mecánicos sin desglose no se reparte de forma inventada.

Reposición: stock menor o igual al mínimo, incluidos agotados. Sugerencia = mínimo + 1 − stock, para superar ese umbral; debe revisarse antes de comprar. Buscar filtra filas, totales y CSV de forma consistente. La descarga no registra una compra ni altera cantidades.

Suscripción: sección plegable solo del administrador con empresa, vigencia, estado, días restantes y mensualidad. Contacto se toma de session.ownerContact, nunca del WhatsApp de la empresa cliente. Si falta, se informa y se mantiene el acceso al ticket de soporte. No hay acciones de pago, renovación o edición de fechas.

Exportaciones CSV de ventas, compras, inventario y reposición: columnas explícitas, texto entrecomillado, BOM UTF-8 y protección ante fórmulas incluso precedidas por espacios/control. Valores negativos numéricos legítimos se conservan. Nunca se exportan sesiones, contraseñas, tokens de comprobante ni conversaciones.

## Evidencia y prueba conjunta

145/145 pruebas Node aprobadas, sin skips, incluida la cuenta privada de JE mediante secreto por stdin oculto. Se prueban permisos, aislamiento, cierre persistente e idempotente, selector/borrador/venta, históricos, fórmulas CSV, SSR y datos ausentes. Aplicación y demo compilan; diff limpio. Dockerfile copia admin-controls.mjs y admin-reports.mjs al compilar y ejecutar; no se ejecutó Docker.

El entorno Sites no dispone de cua_repl.js; no se declara QA visual ni se inició preview. Faltan pruebas conjuntas en los equipos y la impresora reales.

1. Entrar como administrador de JE, abrir Taller → Mecánicos y crear uno. Registrar una venta con producto y servicio usando el selector; comprobar el nombre en el ticket y el cobro por mecánico.
2. Abrir Dashboard → Administración → Reportes. Elegir un rango, comparar productos/servicios/devoluciones y descargar CSV. Revisar compras y existencias actuales.
3. En Reposición, buscar un producto en mínimo/agotado y comprobar que el CSV refleja solo las filas visibles; confirmar que el inventario no cambia.
4. En Cierre de caja, elegir el día, introducir recibido por los tres medios, revisar diferencias y confirmar. Recargar y comprobar el mismo registro. En una copia de prueba, registrar una venta tardía para esa fecha y verificar el aviso sin sobrescribir el cierre.
5. Revisar Mi suscripción desde Perfil: solo consulta. Entrar como vendedor y verificar ausencia de las herramientas administrativas, manteniendo selector activo y ventas.

La instalación definitiva, HTTPS, inventario real y piloto continúan en P05–P10. No se conectan nuevas APIs externas de correo/WhatsApp, banca o facturación electrónica.
