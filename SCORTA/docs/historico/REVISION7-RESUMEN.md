# Revisión 7 · cómo nos fue en estas fechas

La antigua pestaña Dashboard se llama Resumen general. Es la pantalla inicial del administrador y está en Más desde celular. Conserva el acceso a Administración para cierres, mecánicos, reportes y reposición.

## Qué muestra

Rango inclusivo Desde/Hasta con Hoy, Ayer, Esta semana y Este mes; zona America/Bogota y semana desde lunes. El período inicial es el mes actual hasta hoy. Todas las cifras, productos y rankings usan ese mismo rango; si falta una fecha o el rango es inválido, se ocultan las cifras anteriores y aparece el error.

Tres cifras principales: ventas netas totales, productos netos y mano de obra neta facturada. Se añaden unidades, servicios registrados excluyendo ventas anuladas, cantidad de ventas con importe neto positivo, venta promedio, devoluciones y anulaciones. La venta promedio divide el neto total entre las ventas no anuladas con neto positivo; una venta totalmente devuelta no cuenta como venta con ingreso. Los servicios registrados cuentan líneas de trabajo, sin pretender inferir que un reembolso haya deshecho un trabajo.

Qué vendimos lista productos, unidades netas, venta neta y ganancia histórica. Muestra diez inicialmente para reducir saturación, con Ver más. Los cálculos totales y rankings no se limitan a las filas visibles. Los productos retirados del catálogo conservan sus líneas históricas y no abren una ficha inexistente.

Un selector cambia el ranking entre más vendidos, menos vendidos, mayor ganancia y menor ganancia. Son cinco resultados: unidades netas positivas para ventas y costo histórico completo para ganancias en dinero. Pérdidas negativas permanecen; empates se ordenan por nombre/ID para estabilidad. Los costos faltantes siguen visibles en detalle y no se clasifican como cero ganancia. Una lista separada y plegable muestra el catálogo actual con cero unidades netas en el período, incluidas ventas totalmente devueltas. No reconstruye disponibilidad histórica del catálogo.

## Ganancia final

Ganancia total de productos del período = venta neta de productos − costo de las unidades retenidas, usando costo_unitario capturado al vender. Margen agregado = ganancia / venta neta de productos × 100; no es un promedio de porcentajes por producto. Sin base de ventas el porcentaje muestra —. Si falta el costo histórico de unidades no devueltas, la ganancia total y el margen quedan incompletos, no se inventan ceros ni se reconstruyen con el precio de compra actual.

La mano de obra se informa como ingreso separado porque sus costos no están registrados. El bloque no representa una utilidad neta de toda la empresa con gastos. Devoluciones/anulaciones siguen el estado actual atribuido a la fecha original de venta, según los reportes existentes; no se construye un flujo de caja por fecha efectiva de reembolso.

## Verificación y guion

161/161 pruebas aprobadas sin skips: límites/calendario Bogotá, costos y ponderaciones históricas, devoluciones/anulaciones, productos retirados, rankings, permisos/aislamiento y SSR. Aplicación y demo compilan; diff limpio. Docker copia overview-report.mjs en compilación y runtime; no se construyó ni desplegó un contenedor. El demo conserva el aviso previo de chunk grande sin error de compilación. No se dispone de cua_repl.js; no se inició preview ni se afirma revisión visual.

1. Entrar como administrador y abrir Resumen general. Seleccionar Ayer y comparar ventas, productos, servicios y total de ganancia con operaciones conocidas.
2. Elegir un rango personalizado; comprobar que Ver ventas abre ese mismo período.
3. Cambiar los cuatro rankings. Comparar unidades netas, ganancias en dinero, pérdidas y la lista separada sin ventas netas.
4. Verificar una devolución parcial y una anulación: cantidades, neto y costo retenido deben conciliar una sola vez.
5. Revisar una venta sin costo histórico y otra solo de mano de obra: no debe aparecer una ganancia total inventada o un porcentaje sin base.
6. Repetir en celular y PC; comprobar más filas, fechas y acceso a Administración. La validación en equipos reales y la instalación definitiva siguen pendientes.
