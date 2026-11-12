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

**Inventario:** la tarea principal es encontrar un producto y comprobar su precio y existencias. La pantalla inicial presenta el título, “Nuevo producto”, el buscador, “Filtros” y el listado. La tabla se limita a producto/referencia, precio de venta, existencias y apertura de la ficha. Costo, mínimo, edición, ajuste y retirada se consultan en la ficha existente. Cada celda tiene `data-label` para convertirse en un registro legible en celular.

**Filtros resumidos:** categoría, marca, existencias y orden se agrupan en un panel plegable cerrado inicialmente. El panel ocupa el ancho disponible al abrirse; no cubre las filas del inventario. El número de criterios activos y sus etiquetas permanecen visibles al cerrarlo. Las etiquetas permiten quitar un criterio con teclado o toque. La búsqueda ya está visible y no se cuenta de nuevo como filtro.

“Restablecer filtros” elimina categoría, marca, existencias y orden especial, conservando la búsqueda. En un listado sin resultados, “Mostrar todos” sí elimina búsqueda y filtros. Los accesos desde Inicio conservan el criterio visible, por ejemplo “Agotados”. No se debe llamar “Con existencias” a un criterio que solo incluya productos por encima del mínimo: ese criterio se llama “Sobre el mínimo”.

**Opciones ocasionales:** importar, actualizar y descargar respaldos se agrupan en un único menú “Opciones”, respetando los permisos. La conexión normal aparece como un estado discreto; los fallos y operaciones pendientes siguen siendo visibles. La retirada del producto se guarda en un desplegable de opciones dentro de su ficha, con explicación y confirmación; no aparece como un botón rojo repetido en todas las filas.

**Compras, ventas y movimientos:** la búsqueda queda visible; fechas y criterios adicionales se despliegan bajo “Filtros”, con el mismo resumen activo que el inventario.

**Navegación:** el menú lateral permanece abierto en escritorio. En celular se recoge en “Menú · [sección actual]”; el usuario y las acciones de sesión permanecen fuera del menú plegable. El cambio de tamaño debe mantener accesible la sección actual sin reiniciar los filtros.

**Inicio y reposición:** los indicadores deben declarar su periodo. Las ventas netas no se presentan como caja. La cantidad calculada para reponer hasta el mínimo se llama “Unidades para llegar al mínimo”; no constituye una recomendación de compra.

**Taller:** columnas por estado, con tarjetas que priorizan placa, descripción y próxima acción. En celular las columnas se apilan, evitando arrastrar como única manera de avanzar un servicio.

**Acceso:** tarjeta de entrada consistente con el panel, usuario identificable y acciones explícitas para sesión y contraseña.

## Contrato de clases

`App.jsx` usa `app-shell`, `app-sidebar`, `app-main`, `page-heading`, `toolbar`, `btn` y variantes `btn-primary`, `btn-secondary`, `btn-danger`; `table-card`, `data-table` con `td[data-label]`; `form-grid`, `field-advanced`, `field-error`; `sale-layout`, `item-picker`, `item-results`, `item-result`, `item-list`, `sticky-total`; `inventory-filters`, `empty-state`, `detail-grid`, `dashboard-grid`, `metric-card`; `kanban-board`, `kanban-column`, `service-card`; `modal-panel`, `modal-heading`, `modal-body`, `modal-footer`.

`SessionGate.jsx` usa `session-gate`, `session-card`, `session-brand`, `session-actions`, `session-user`, `session-error`, `session-help` y `session-overlay`.

La revisión de claridad añade `page-actions`, `secondary-options`, `secondary-options-body`, `connection-bar` (`is-offline`/`is-pending`), `catalog-tools`, `search-field`, `filter-panel`, `filter-panel-body`, `filter-count`, `active-filters`, `filter-chip`, `results-count`, `product-open` y `mobile-navigation`. Los desplegables usan elementos nativos `details`/`summary` para conservar su operación por teclado. Los filtros activos nunca dependen solamente de un color o de un panel abierto.

Algunos componentes anteriores conservan estilos inline; las clases compartidas los sustituyen solo donde hace falta. Las tablas se transforman a tarjetas a 760 px. Búsqueda, filtros y venta se apilan antes de comprimir sus controles. El tablero de taller pasa de cuatro a dos columnas y después a una.

## Accesibilidad y validación

Conservar etiquetas visibles, foco de teclado, cierre y captura de foco en modales, errores asociados al campo y anuncios de resultados. Respetar la preferencia de movimiento reducido. La adaptación con CSS no equivale por sí sola a una auditoría de accesibilidad.

Verificar en la interfaz integrada: venta de tres artículos, cambio de cantidad, error de existencias, consulta de ficha y filtros a 390 px; repetir navegación por teclado en escritorio. No debe existir desplazamiento horizontal en inventario ni en el formulario de venta. La compilación comprueba integración de estilos, pero no sustituye las verificaciones de navegador, lector de pantalla o pruebas con el personal del almacén.

Se ejecutó `npm run build` con resultado correcto después de integrar las clases de interfaz y sesión. Se inspeccionaron las capturas de QA de inicio y venta en escritorio, e inicio, inventario y venta a 390 px. La revisión ajustó el contraste y los controles de sesión, compactó la navegación móvil y conservó el total y las acciones de la venta visibles. Las comprobaciones funcionales corresponden al informe de QA; queda pendiente una evaluación con lectores de pantalla y personal del almacén.

La revisión posterior de claridad parte de una captura real del inventario con todos los filtros y acciones desplegados. Sus criterios de comprobación son: buscar sin abrir paneles, distinguir inmediatamente filtros activos, abrir la ficha sin acciones destructivas permanentes y recuperar el listado completo cuando no hay resultados. Las capturas y pruebas anteriores no sustituyen la verificación de esta revisión integrada.
