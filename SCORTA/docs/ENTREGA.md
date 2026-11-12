# SCORTA: entrega de mejoras de experiencia

Esta iteración modifica la aplicación de inventario de `SCORTA/`, basada en la rama `scorta-inventario`. Los archivos de PRENOTA que permanecen en la raíz no son el producto trabajado.

La relación siguiente describe la implementación verificada en esta entrega. Las pruebas se ejecutaron con datos temporales, sin modificar una instalación del almacén.

## Cambios implementados

| Área | Comportamiento incorporado |
| --- | --- |
| Inicio | Ventas netas de hoy, agotados, existencias bajas, trabajos abiertos, últimas ventas y accesos a venta, inventario y taller. Se mantienen importes mensuales y se aclara que ventas no equivale a caja. |
| Reposición | Lista de productos en el mínimo o por debajo, con agotados primero, existencias, mínimo y diferencia hasta ese mínimo. El administrador puede iniciar una compra desde un producto. |
| Inventario | Búsqueda sin distinguir acentos, filtros de categoría, marca y disponibilidad, orden por nombre, existencias o precio, y limpieza de filtros. |
| Venta y compras | Selector con búsqueda que muestra precio y stock; selección con teclado o código introducido por un lector tipo teclado; edición de cantidades en la lista; total y acciones en el pie del formulario. |
| Ficha del producto | Referencia, clasificación, compatibilidad, código, precio y existencias en una vista; costo para administrador; historial paginado y apertura del documento relacionado. |
| Formularios | Datos adicionales del producto agrupados en un desplegable; advertencia de cambios sin guardar; mensajes de error persistentes y conservación del formulario cuando falla una operación. |
| Operaciones pendientes | Guardado con bloqueo de doble envío y reintento explícito de una respuesta incierta, reutilizando la solicitud original para evitar duplicarla. |
| Historial | Filtros de documentos por texto y fechas; filtros de movimientos por texto, fecha, tipo y usuario. Los movimientos nuevos incluyen autor y stock antes/después; la información histórica ausente no se inventa. |
| Devoluciones y anulaciones | Detalles con importe original, unidades devueltas o revertidas y neto de venta; consulta de motivo, fecha y autor de las reversiones. La confirmación informa del documento y el efecto en cantidades. |
| Taller | Trabajos organizados por pendiente, en proceso, completado, entregado y anulado; consulta de placa y trabajo, con avance explícito al siguiente estado. |
| Diseño y celular | Controles, superficies y estados visuales compartidos; adaptación de tablas, formularios y navegación; foco visible y controles de tamaño táctil. La experiencia en un dispositivo físico requiere validación propia. |
| Acceso | Entrada propia con cookie de sesión, cierre de sesión, cambio de contraseña y usuario/rol visibles. Las acciones administrativas se ocultan al operador y se verifican también en servidor. |
| Consultas del servidor | Endpoints filtrables y paginados para productos y movimientos, con prioridad de referencia o código exactos y comprobación de revisión al continuar páginas. La interfaz general todavía carga el estado completo. |
| Respaldo | Descarga y comando de copia SQLite completa, validación del archivo, retención configurable y restauración aislada documentada. Incluye cuentas y registros de reintentos. |

## Uso y documentación

- [PLAN-PRODUCTO.md](PLAN-PRODUCTO.md): criterios de aceptación y guía breve de ventas, reposición, ficha y sesión.
- [DISENO.md](DISENO.md): decisiones de diseño e interacción.
- [OPERACION.md](OPERACION.md): respaldo programado, copia externa y restauración.
- [seguridad.md](seguridad.md): sesión, permisos y controles de acceso.
- [LEEME.md](../LEEME.md): preparación y límites operativos.

## Límites y pendientes reales

- La ficha no añade fotografía de producto ni carga de imágenes. El escaneo por cámara tampoco está incluido; el código se escribe o llega mediante un lector que actúa como teclado.
- La cantidad hasta el mínimo es informativa; no calcula demanda, un inventario objetivo o pedidos automáticos. Un producto justo en el mínimo sigue en la alerta aunque su diferencia sea cero.
- La búsqueda y los filtros generales de la interfaz operan sobre `/api/state`; los nuevos endpoints paginados preparan consultas específicas, pero no eliminan todavía la carga completa del estado.
- El historial de una ficha carga páginas y permite abrir documentos. Los filtros detallados de fecha, tipo y usuario están en la pantalla Movimientos, no dentro de la ficha.
- Las cantidades tienen validación junto al campo y atributos accesibles; los demás errores se muestran de forma persistente en el formulario. No todos los campos tienen validación específica adicional a la del navegador y servidor.
- Los borradores y solicitudes pendientes no se guardan de forma durable tras cerrar o recargar la página. Antes de salir se advierte de cambios; debe resolverse una operación incierta mediante su reintento mientras la página permanece abierta. El reinicio del servidor cierra las sesiones.
- No se añade recuperación de contraseña ni una interfaz de desactivación de cuentas. El control de intentos y las sesiones viven en el proceso del servidor.
- El comando y el procedimiento de respaldos quedan disponibles; la programación real, vigilancia y copia fuera del servidor requieren configurar la instalación definitiva. El respaldo JSON antiguo no sustituye al SQLite completo.
- No se ha desplegado esta iteración en un servidor externo desde este trabajo. HTTPS, acceso simultáneo y recuperación deben comprobarse en la infraestructura de destino.
- La evaluación con personal del almacén, celulares físicos, lectores de códigos físicos y lectores de pantalla es un paso de validación posterior; una ejecución automatizada de navegador no los sustituye.
- No se incorpora caja, contabilidad, facturación electrónica ni integración DIAN. Las devoluciones descuentan el importe del documento original en su periodo original; no representan movimientos de efectivo del día.

## Evidencia de validación

La [revisión de claridad](REVISION-CLARIDAD.md) simplifica la vista diaria: un buscador, filtros plegables con etiquetas activas y cuatro columnas. Edición, ajustes y retiro quedan en la ficha. La navegación móvil se recoge en Menú y las herramientas ocasionales en Opciones. Se comprobaron **32/32 pruebas de servidor y 30/30 recorridos de interfaz**, más las [capturas de escritorio](capturas/inventario-claro-escritorio.png) y [móvil](capturas/inventario-claro-movil.png).

La [prueba operativa posterior del almacén](PRUEBA-OPERACION.md), realizada el 12 de noviembre de 2026, amplía la validación a **32/32 pruebas de servidor y 24/24 recorridos de interfaz**, con compilación aprobada. Incluye una jornada de compras, ventas, taller, mermas, devoluciones y anulaciones con conteo independiente, además de tres correcciones de inventario documentadas en el informe.

Verificación local realizada el 11 de noviembre de 2026, con Node.js 24 y Chromium 156:

| Comando | Resultado |
| --- | --- |
| `npm test` | **27/27 pruebas aprobadas**, sin fallos ni omisiones. |
| `CHROMIUM_PATH=/usr/bin/chromium npm run test:ui` | **Compilación correcta y 20/20 recorridos aprobados**: 10 en escritorio (1440 × 1000) y 10 en móvil emulado (390 × 844). |
| `git diff --check` | Sin errores de espacios. |

Se comprobó una venta con tres artículos y cantidades corregidas; una respuesta perdida después del guardado; la recuperación de esa operación tanto al detectar la sesión vencida como al recibir un 401 al reintentar; y el descuento único del inventario. También se verificaron permisos, taller hasta entrega, cambio de contraseña, navegación con teclado y recuperación de un respaldo completo.

Consulta la [matriz de QA](QA.md) y estas capturas de la ejecución final:

- [Inventario en escritorio](capturas/inventario-escritorio.png).
- [Venta con tres productos](capturas/venta-multiple-escritorio.png).
- [Venta en móvil de 390 px](capturas/venta-movil.png).
- [Inicio en móvil](capturas/inicio-movil.png).

La compilación y los recorridos automatizados validan esta copia local. El despliegue, el respaldo programado externo y la comprobación con el personal del almacén quedan para la instalación definitiva.
