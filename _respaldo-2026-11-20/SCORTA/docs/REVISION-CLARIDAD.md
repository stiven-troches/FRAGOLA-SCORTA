# Revisión de claridad de SCORTA

Fecha: 12 de noviembre de 2026, zona horaria America/Bogota.

## Encargo

La persona que atiende el almacén necesita encontrar un artículo, entender su precio y existencias y continuar con la tarea sin interpretar una pantalla llena de opciones. Esta revisión responde al pedido de reducir filtros y saturación, conservando las funciones ya probadas.

## Lo observado antes del ajuste

Se revisaron la captura de la prueba guiada con un producto y el código de `src/App.jsx` y `src/style.css` en la versión `c7f3025`.

Antes del listado aparecían el estado de actualización, un botón de actualización, el respaldo, la importación, el buscador y cuatro selectores con un botón para limpiar. Cada producto presentaba siete columnas y cuatro acciones, incluyendo operaciones administrativas poco frecuentes. El problema era la cantidad de decisiones simultáneas, aunque hubiera espacio vacío debajo.

## Decisiones acordadas entre diseño y dirección

- La tarea principal de Inventario es consultar productos. Buscar y abrir una ficha deben ser evidentes desde la vista inicial.
- `Nuevo producto` es la única acción primaria de esa pantalla para el administrador. Las herramientas ocasionales se reúnen en un único desplegable contextual `Opciones`, con textos explícitos.
- La consulta inicial muestra un buscador y un botón `Filtros`. Categoría, marca, existencias y orden aparecen únicamente al abrir el panel.
- Cerrar el panel no debe ocultar el efecto de los criterios elegidos: se mantienen un resumen, el número de resultados y controles para quitar cada criterio.
- `Restablecer filtros` conserva lo escrito en el buscador. Cuando no haya coincidencias, una acción distinta `Mostrar todos` puede borrar búsqueda y filtros para recuperar el listado.
- El listado principal se concentra en producto/referencia, precio de venta, existencias y acceso a la ficha. Costo, mínimo de alerta y acciones administrativas se consultan dentro de la ficha.
- El estado normal de conexión es discreto. Una desconexión, un error o una operación pendiente conservan visibilidad y explicación; no se esconden en un desplegable.
- La navegación de escritorio mantiene sus módulos y la sección activa. En celular se recoge en `Menú`, sin ocultar quién está usando la aplicación ni impedir cerrar sesión.

## Criterios de aceptación

1. **Vista inicial despejada.** Sin filtros activos, el inventario muestra búsqueda, `Filtros` y `Nuevo producto` como controles principales; no hay selectores de filtros ni un botón de restablecer a la vista. El listado usa cuatro columnas legibles.
2. **Filtros breves y comprensibles.** El panel agrupa categoría, marca, existencias y orden. El contador incluye los criterios no predeterminados y excluye el texto del buscador, que ya permanece visible. Las etiquetas describen el significado real: `Con existencias` requiere cantidad mayor que cero, mientras `Sobre el mínimo` no se presenta como sinónimo.
3. **Contexto conservado.** Al cerrar el panel se puede saber qué criterios siguen aplicados y quitarlos individualmente. Llegar desde una alerta del Inicio muestra el criterio correspondiente. Restablecer filtros conserva la búsqueda y devuelve el orden A–Z.
4. **Acciones encontrables y seguras.** La ficha permite editar o ajustar al administrador y conserva las restricciones de retiro por existencias o historial. El operador solo encuentra sus acciones autorizadas. Ninguna acción destructiva adquiere énfasis por el cambio visual.
5. **Escritorio y celular utilizables.** A 390 px no se produce desplazamiento horizontal de la página; Menú, Filtros y Opciones funcionan con teclado y foco visible, indican su estado abierto/cerrado y no esconden errores. La sesión sigue accesible y el precio y las existencias se leen sin abrir filtros.

## Estado de la revisión

Se revisaron las capturas nuevas de Inventario en escritorio, en móvil de 390 px y con dos filtros activos, sobre el mismo producto ficticio de la prueba guiada.

| Aspecto revisado | Observación visual |
| --- | --- |
| Consulta inicial | El buscador y Filtros ocupan una sola fila. Ya no se muestran cuatro selectores, importación y respaldo antes de consultar el listado. |
| Jerarquía | Nuevo producto mantiene el único botón principal; Opciones agrupa las herramientas ocasionales. El estado normal de actualización aparece como texto discreto. |
| Listado | Producto/referencia, precio de venta, existencias y ficha se identifican sin abrir filtros. Se retiraron los botones de administración repetidos en cada fila. |
| Filtros aplicados | Categoría y marca permanecen visibles como etiquetas con opción de quitarlas aunque el panel esté cerrado; el contador coincide con los dos criterios aplicados. |
| Móvil | Menú está recogido y conserva el nombre de la sección; la identidad y el modo local siguen separados y legibles. Producto, precio, existencias y Abrir ficha aparecen en la captura de 390 px sin recortes horizontales. |

Durante la revisión se detectaron y corrigieron dos detalles de presentación: Restablecer filtros parecía un botón nativo que competía visualmente con las etiquetas; el modo local quedaba pegado al texto del rol y moneda. Ahora el primero es un control secundario discreto con foco visible, y el segundo tiene una línea y separación propias.

La captura inicial mostró transitoriamente el resaltado de la sección anterior al cambiar a Inventario. Se eliminó la transición visual de la selección del menú y se repitió la captura con Inventario como única sección activa. Las imágenes finales de escritorio y móvil fueron revisadas de nuevo después de ese ajuste.

## Dictamen de dirección de diseño

**Aprobado para retomar la prueba guiada con el usuario.** La consulta inicial es más breve, las opciones ocasionales no compiten con la tarea principal y los filtros activos conservan contexto sin mantener todos sus campos abiertos. En móvil se distinguen el producto, su precio y las existencias sin desplegar el menú ni los filtros. No quedan bloqueantes visuales de los señalados durante esta revisión.

Evidencia visual final:

- [Inventario de escritorio](capturas/inventario-claro-escritorio.png).
- [Inventario móvil](capturas/inventario-claro-movil.png).
- Se revisó además la captura con categoría y marca activas y el panel cerrado.

La coordinación confirmó **32/32 pruebas del servidor, 30/30 recorridos de interfaz y compilación aprobados**. La dirección de diseño inspeccionó las imágenes y el código; no atribuye esos recorridos a una prueba personal con operadores del almacén.

La comprobación conjunta con quien va a utilizar SCORTA sigue siendo necesaria para validar lenguaje, comodidad y rapidez en sus tareas reales. Esta aprobación no sustituye esa evaluación.
