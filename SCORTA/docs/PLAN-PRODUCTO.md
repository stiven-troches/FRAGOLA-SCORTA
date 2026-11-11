# SCORTA: plan de experiencia de uso

## Propósito y alcance

SCORTA ayuda al personal de un almacén de accesorios y repuestos para motos a consultar existencias, recibir compras, registrar ventas y gestionar trabajos de taller. La mejora se centra en atender con menos pasos y entender el efecto de cada operación sobre el inventario.

Este documento conserva los objetivos y criterios de aceptación; no sustituye la evidencia de pruebas. [ENTREGA.md](ENTREGA.md) describe los cambios observados y los pendientes de la iteración. No se amplía el producto a caja, contabilidad, facturación electrónica o integración DIAN.

## Punto de partida verificado

La versión de `scorta-inventario/SCORTA` ya incluye búsqueda de inventario por nombre, categoría, referencia, marca, modelo, compatibilidad y código de barras; indicadores mensuales; alertas de existencias; compras, ventas, taller, ajustes, devoluciones, anulaciones, movimientos y roles. Las mejoras amplían estas capacidades: no deben presentarse como funciones ausentes en su totalidad.

## Prioridades

| Prioridad | Mejora | Resultado esperado |
| --- | --- | --- |
| 1 | Búsqueda y venta | Encontrar artículos mostrando precio y stock; corregir cantidades dentro de la venta; mantener total y confirmación accesibles. |
| 1 | Inventario | Filtrar por categoría, marca y disponibilidad; ordenar resultados; abrir la ficha y sus movimientos. |
| 1 | Formularios y mensajes | Datos indispensables primero, errores comprensibles y conservación de lo escrito si falla el guardado. |
| 1 | Acceso y permisos | Identificar al usuario, permitir salir y mostrar solo las acciones que su rol puede ejecutar, con control también en servidor. |
| 2 | Inicio y reposición | Acceder a tareas diarias y distinguir agotados de productos en el umbral mínimo. |
| 2 | Historial | Consultar compras, ventas y movimientos por criterios claros; reconocer documentos anulados y devoluciones. |
| 2 | Taller | Consultar y avanzar trabajos por sus cuatro estados sin perder datos de la moto o repuestos consumidos. |
| Transversal | Diseño y celular | Unificar controles, textos y estados; completar una venta a 390 px sin desplazamiento horizontal del formulario. |
| Transversal | Infraestructura y pruebas | Distinguir conexión y guardado; respaldar y recuperar datos completos; comprobar operaciones y permisos en un entorno aislado. |

## Criterios del inicio

1. La pantalla identifica el periodo de cada indicador y ofrece acceso a una nueva venta, a agotados, a existencias bajas y a servicios abiertos.
2. Los importes de venta excluyen documentos anulados y descuentan devoluciones del documento original. Se describen como ventas netas de devoluciones, nunca como recaudo de caja. Una devolución posterior afecta el periodo original del documento: no es un movimiento de dinero del día.
3. Las fechas operativas se interpretan en `America/Bogota`. Los indicadores de taller entregado usan la fecha de entrega registrada; los registros antiguos sin esa fecha no deben recibir una inventada.
4. Un listado vacío explica que no hay pendientes y no simula información. Si falla la conexión, el inicio indica que los últimos datos pueden estar desactualizados.

## Criterios de reposición

1. Se incluyen productos con `stock <= stock_minimo`; se distingue expresamente `stock = 0` como agotado.
2. Cada fila muestra producto, referencia cuando exista, existencias actuales y mínimo configurado. Los agotados aparecen primero; después se puede ordenar por déficit hasta el mínimo y nombre para desempatar.
3. Si se muestra `max(0, stock_minimo - stock)`, el texto es **Unidades para llegar al mínimo**. Es una diferencia matemática, no una recomendación de compra ni un nivel óptimo de inventario. Un producto exactamente en el mínimo sigue apareciendo como alerta y su diferencia es cero.
4. Consultar o exportar esta lista no cambia existencias ni crea compras. Las cantidades solo aumentan al registrar una compra o un ajuste autorizado.

## Criterios de venta

1. Se puede buscar y añadir por nombre, referencia o código; precio y stock aparecen antes de añadir. La ausencia de coincidencias tiene un mensaje útil.
2. Las cantidades son enteras positivas y se pueden corregir en las líneas seleccionadas. Los totales se recalculan y se comprueba la cantidad acumulada del mismo producto, aunque figure en líneas con precios diferentes.
3. La validación del navegador ayuda al operador; la del servidor decide con existencias vigentes. Una operación concurrente no permite vender cantidades negativas ni duplicar un descuento.
4. Durante el envío se muestra el estado y se evita doble envío. Un error conserva el formulario y explica cómo continuar. Si la respuesta se pierde, el reintento de la misma operación debe usar el mecanismo de idempotencia existente mientras el formulario permanezca abierto.
5. A 390 px se pueden seleccionar productos, corregir cantidades, leer el total y guardar. El flujo también funciona con teclado, con etiquetas visibles y foco reconocible.

## Guía breve de los flujos mejorados

La guía usa los controles presentes en esta iteración. La validación de los recorridos en navegador y con personal del almacén se registra por separado.

### Atender una venta

1. Abra **Nueva venta** desde el inicio o desde Ventas.
2. Busque el artículo por nombre o referencia, o introduzca el código con un lector que actúe como teclado. No se presupone lectura por cámara.
3. Compruebe precio y existencias; añada los artículos y corrija las cantidades en la lista.
4. Revise el total y confirme. Espere el mensaje de guardado antes de registrar otra venta.
5. Si aparece un error, conserve el formulario, revise el motivo y corrija o reintente según la indicación. No registre una segunda venta para resolver una respuesta incierta.

### Consultar y reponer mercancía

1. En **Inicio**, use **Ver agotados**, **Revisar existencias** o **Ver reposición**. También puede usar **Disponibilidad** en Inventario; **Limpiar filtros** vuelve al listado completo.
2. Revise producto, referencia, cantidad actual y mínimo. La diferencia hasta el mínimo es una ayuda de consulta; el responsable decide cuánto comprar.
3. Registre la compra cuando reciba mercancía. Guardarla incrementa las existencias.
4. Use un ajuste con motivo si necesita registrar una diferencia de conteo; no edite el stock como si fuera un dato descriptivo del producto.

### Revisar una operación o un trabajo

1. Consulte el documento y sus movimientos antes de devolver, anular o ajustar.
2. Compruebe el efecto sobre cantidades y registre el motivo cuando corresponda.
3. En Taller, avance un trabajo de pendiente a en proceso, completado y entregado. Los repuestos se descuentan al guardar el servicio, no al entregarlo.

### Consultar la ficha y sus movimientos

1. En Inventario, pulse **Ver** en el producto. Consulte referencia, compatibilidad, precio, existencias y mínimo; el costo de compra se presenta al administrador.
2. Revise el historial de existencias. **Cargar más movimientos** continúa las páginas disponibles; un dato histórico ausente se identifica como tal.
3. Use **Abrir documento** para consultar la compra, venta o servicio asociado cuando esté disponible. Para buscar por fechas, tipo o usuario, abra **Movimientos** desde el menú.

### Entrar, salir y respaldar

1. En una instalación con cuentas, entre con usuario y contraseña. El menú muestra su identidad y rol. El modo local sin cuentas es únicamente de desarrollo en el propio equipo.
2. **Cambiar contraseña** solicita la actual y la nueva confirmada; al completarlo debe volver a entrar. **Cerrar sesión** termina el acceso del navegador.
3. El administrador puede usar **Descargar respaldo** para obtener la copia completa SQLite. La programación, copia externa y restauración se explican en [OPERACION.md](OPERACION.md); descargar una copia no configura por sí solo esas tareas.

## Validación de la entrega

QA debe ejecutar pruebas de servidor, compilación y recorridos de navegador sobre datos aislados. La revisión del almacén debe incluir una venta con varios artículos, una compra recibida, un producto agotado, un ajuste por conteo y una devolución parcial seguida de anulación. Los cambios de acceso y respaldo requieren comprobar también cierre de sesión, permisos y una restauración aislada.

No se debe afirmar que un flujo fue validado en un móvil real, con un lector físico o en producción si la evidencia corresponde solo a navegador automatizado o ejecución local.
