# Simulación operativa de SCORTA

Fecha: 12 de noviembre de 2026. Se probaron la aplicación de `SCORTA/` y su servidor con bases SQLite y cuentas temporales. No se utilizaron datos del almacén ni servicios de producción.

## Jornada simulada

Se registraron tres productos ficticios desde la interfaz, se recibió una compra, se realizó una venta con cuatro líneas (el mismo casco a dos precios), se consumieron repuestos en taller y se registró una merma mediante un ajuste con motivo. Después se devolvió una unidad del casco, se anuló el resto de la venta, se canceló el servicio y se devolvió la compra al proveedor.

El conteo esperado se calculó de forma independiente y se comprobó después de cada operación, junto con la suma de movimientos, el saldo anterior/posterior y el autor.

| Producto | Inicial | Compra | Venta | Taller | Merma | Reingresos por devoluciones/anulaciones | Anulación de compra | Final comprobado |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Casco | 10 | +5 | −3 | 0 | 0 | +3 | −5 | **10** |
| Guantes | 20 | 0 | −2 | 0 | −3 | +2 | 0 | **17** |
| Aceite | 30 | +8 | −2 | −2 | 0 | +4 | −8 | **30** |

La devolución parcial del casco devolvió una unidad; la anulación posterior solo devolvió las dos pendientes. Los cuatro aceites reingresados corresponden a dos de la venta y dos del servicio. Al terminar, la única salida permanente fueron los tres pares de guantes por merma.

Se verificaron estos importes originales:

- Compra: 5 cascos × $80.000 + 8 aceites × $20.000 = **$560.000**.
- Venta: 2 cascos × $150.000 + 1 casco × $140.000 + 2 guantes × $50.000 + 2 aceites × $35.000 = **$610.000**.
- Servicio: 2 aceites × $35.000 + $25.000 de mano de obra = **$95.000**.

Las anulaciones se conservaron en los documentos y el historial. Estos importes no representan recaudo de caja ni facturación electrónica.

## Fallos encontrados y corregidos

1. **Identificación ambigua de productos.** El alta manual permitía repetir referencia o código de barras, y el CSV permitía códigos repetidos. El lector podía seleccionar el primer artículo coincidente. Se reprodujo sobre la versión anterior, en una copia temporal: quedaron dos artículos con la misma referencia, dos con el mismo código manual y dos con el mismo código importado. Ahora el servidor rechaza referencias y códigos repetidos al crear, editar o importar, ignorando espacios exteriores y diferencias de mayúsculas; los identificadores vacíos siguen permitidos. La edición de un producto conserva sus propios identificadores.
2. **Campos opcionales vaciados impedían guardar.** Borrar costo, existencias iniciales, mínimo o mano de obra enviaba una cadena vacía que el servidor rechazaba. Ahora se aplican los valores iniciales: costo, existencias iniciales y mano de obra a cero; mínimo de alerta a cinco. Un cero escrito expresamente se conserva. Nombre y precio de venta obligatorios continúan validándose. Se comprobó en navegador un producto con costo/mínimo borrados y un servicio gratuito tras borrar la mano de obra.
3. **Retiro de ficha con historial de merma.** Un producto con dos unidades, ajustado a cero por daño, podía retirarse porque solo se revisaban compras, ventas y servicios. Ahora se impide retirar productos con movimientos de existencias o ajustes, tanto en servidor como en la interfaz, y se mantiene accesible su ficha. Un alta accidental con apertura de cero y sin actividad puede seguir retirándose.

## Otras comprobaciones

- La misma venta reenviada con su identificador original no crea otra venta ni descuenta dos veces.
- Vender más unidades de las disponibles se rechaza sin cambios parciales.
- Anular una compra de cinco unidades cuando solo queda una se rechaza, conservando existencias y documento.
- Las líneas del mismo producto con precios diferentes mantienen su importe y descuentan la cantidad acumulada correcta.
- Una merma exige motivo y conserva su autor, cantidad y saldos.
- Un servicio sin repuestos y con mano de obra vacía puede guardarse con importe cero.
- La regresión existente volvió a comprobar permisos, sesiones interrumpidas, reintentos, devoluciones, restauración y navegación con teclado.

## Resultado final

| Comprobación | Resultado |
| --- | --- |
| `node tests/warehouse.test.mjs` | **5/5 aprobadas**: jornada conciliada, identificadores, opcionales, historial y compra consumida. |
| Recorridos nuevos `operacion.spec.mjs` | **4/4 aprobados**: dos escenarios en escritorio y en móvil. |
| `npm test` | **32/32 aprobadas**, sin fallos ni omisiones. |
| `CHROMIUM_PATH=/usr/bin/chromium npm run test:ui` | **Compilación correcta y 24/24 recorridos aprobados**, en aproximadamente 44 segundos. |
| `git diff --check` | Sin errores de espacios. |

Se utilizó Node.js 24 y Chromium, con escritorio de 1440 × 1000 y móvil emulado de 390 × 844. Los escenarios nuevos están en `tests/warehouse.test.mjs` y `browser-checks/operacion.spec.mjs`; se ejecutan con las suites habituales. Las bases temporales se eliminan al terminar. Las capturas previas regeneradas durante la regresión no se incluyen como cambios de esta prueba.

No se añadieron salidas directas nuevas: para merma o diferencias de conteo se usó el ajuste autorizado con motivo. Quedan fuera de esta simulación los equipos físicos, lectores de códigos reales, la revisión conjunta con el personal y un despliegue de producción.
