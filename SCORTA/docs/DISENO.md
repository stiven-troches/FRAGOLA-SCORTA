# Diseño de FRAGOLA SCORTA

Esta revisión facilita las tareas de mostrador: localizar un accesorio, comprobar disponibilidad, registrar una venta y detectar mercancía que necesita reposición. Se aplica exclusivamente a `SCORTA/`.

## Sistema visual

- Azul marino `#152743`: navegación y acción principal. Rojo fresa `#bd243e`: identidad, errores y acciones destructivas. Los estados conservan texto además del color.
- Fondo gris claro `#f4f6f9`, superficies blancas y bordes discretos `#dce3ec` para separar información sin recargarla.
- Tipografía del sistema, sin dependencias externas. Texto de campos de al menos 16 px en celular para evitar zoom automático; acciones principales con una altura mínima de 44 px.
- Espaciado de 8, 12, 16, 20 y 24 px. Contenedores con esquinas de 8 a 12 px.
- Un botón principal por grupo; acciones secundarias con borde y fondo blanco. Las operaciones destructivas deben mostrar su efecto y conservar la confirmación de negocio.

## Flujos

**Venta:** buscar producto por texto o lector que emule teclado, revisar precio y existencias, agregar, corregir cantidades, revisar total y guardar. La búsqueda y el pedido comparten espacio en escritorio y se apilan en celular. El total usa una superficie visible al pie del pedido. Cliente y fecha permanecen etiquetados.

**Inventario:** búsqueda y filtros antes del listado. Cada celda tiene `data-label` para convertirse en un registro legible en celular. La ficha agrupa información del producto e historial; los filtros permiten ir de una alerta de inicio al conjunto correspondiente.

**Inicio y reposición:** los indicadores deben declarar su periodo. Las ventas netas no se presentan como caja. La cantidad calculada para reponer hasta el mínimo se llama “Unidades para llegar al mínimo”; no constituye una recomendación de compra.

**Taller:** columnas por estado, con tarjetas que priorizan placa, descripción y próxima acción. En celular las columnas se apilan, evitando arrastrar como única manera de avanzar un servicio.

**Acceso:** tarjeta de entrada consistente con el panel, usuario identificable y acciones explícitas para sesión y contraseña.

## Contrato de clases

`App.jsx` usa `app-shell`, `app-sidebar`, `app-main`, `page-heading`, `toolbar`, `btn` y variantes `btn-primary`, `btn-secondary`, `btn-danger`; `table-card`, `data-table` con `td[data-label]`; `form-grid`, `field-advanced`, `field-error`; `sale-layout`, `item-picker`, `item-results`, `item-result`, `item-list`, `sticky-total`; `inventory-filters`, `empty-state`, `detail-grid`, `dashboard-grid`, `metric-card`; `kanban-board`, `kanban-column`, `service-card`; `modal-panel`, `modal-heading`, `modal-body`, `modal-footer`.

`SessionGate.jsx` usa `session-gate`, `session-card`, `session-brand`, `session-actions`, `session-user`, `session-error`, `session-help` y `session-overlay`.

Algunos componentes anteriores conservan estilos inline; las clases compartidas los sustituyen solo donde hace falta. Las tablas se transforman a tarjetas a 760 px. Búsqueda, filtros y venta se apilan antes de comprimir sus controles. El tablero de taller pasa de cuatro a dos columnas y después a una.

## Accesibilidad y validación

Conservar etiquetas visibles, foco de teclado, cierre y captura de foco en modales, errores asociados al campo y anuncios de resultados. Respetar la preferencia de movimiento reducido. La adaptación con CSS no equivale por sí sola a una auditoría de accesibilidad.

Verificar en la interfaz integrada: venta de tres artículos, cambio de cantidad, error de existencias, consulta de ficha y filtros a 390 px; repetir navegación por teclado en escritorio. No debe existir desplazamiento horizontal en inventario ni en el formulario de venta. La compilación comprueba integración de estilos, pero no sustituye las verificaciones de navegador, lector de pantalla o pruebas con el personal del almacén.

Se ejecutó `npm run build` con resultado correcto después de integrar las clases de interfaz y sesión. Se inspeccionaron las capturas de QA de inicio y venta en escritorio, e inicio, inventario y venta a 390 px. La revisión ajustó el contraste y los controles de sesión, compactó la navegación móvil y conservó el total y las acciones de la venta visibles. Las comprobaciones funcionales corresponden al informe de QA; queda pendiente una evaluación con lectores de pantalla y personal del almacén.
