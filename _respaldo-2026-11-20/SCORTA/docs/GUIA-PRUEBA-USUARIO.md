# Prueba de claridad con quien atenderá el almacén

Estado: **pendiente de realizar con el usuario**. Preparado el 12 de noviembre de 2026 (America/Bogota).

El diseño visual está aprobado para esta prueba y hay comprobaciones automatizadas registradas. Todavía falta observar si una persona del almacén comprende las tareas y puede completarlas con comodidad. Esta guía no da esa evaluación por terminada.

## Preparar la sesión

Duración orientativa: 5–8 minutos, sin usarla como límite ni como criterio de aprobación. Emplear una copia de ensayo con datos ficticios. La secuencia y los saldos se acuerdan con la [aceptación operativa](ACEPTACION-ALMACEN.md); no repetirla encima de operaciones anteriores.

Punto de partida: **Casco integral de prueba**, referencia **CAS-001**, marca LS2, categoría Cascos; 10 unidades, costo de compra $120.000, precio de venta $180.000 y mínimo de alerta de 3. No hay compras ni ventas de esta sesión. Si el estado inicial es distinto, QA debe conciliarlo o preparar otra copia antes de comenzar.

La persona que atiende debe manejar el equipo cuando sea posible. El facilitador lee una tarea cada vez y observa, sin indicar inicialmente qué botón pulsar. Decir: «Estamos revisando la aplicación; si algo no se entiende, cuéntanos qué esperabas encontrar».

Si solo se dispone de capturas, el facilitador puede hacer los clics siguiendo las decisiones del usuario. Se registra como **prueba asistida por capturas**: sirve para revisar textos y distribución, pero no demuestra que la persona pueda navegar sola, usar el lector o trabajar desde su celular.

## Tareas y observaciones

| Consigna que se lee a la persona | Qué observa diseño |
| --- | --- |
| «Encuentra CAS-001 y dime el precio de venta y cuántas unidades quedan». | Si reconoce el buscador y distingue precio y existencias sin abrir filtros o herramientas administrativas. |
| «Comprueba qué filtros puedes usar. Selecciona la marca LS2, cierra los filtros y vuelve a la consulta sin ese criterio». | Si encuentra Filtros, nota la etiqueta activa con el panel cerrado y sabe quitarla. Restablecer filtros conserva el texto buscado; no debe interpretarse como borrar la búsqueda. |
| «Vende dos cascos. Antes de guardar, revisa la cantidad y el total». | Si encuentra Nueva venta, agrega el artículo, puede corregir la cantidad y entiende cuándo quedó guardada la operación. Resultado operativo: $360.000 y 8 unidades. |
| «Llegaron cinco cascos del proveedor, a $120.000 cada uno. Registra su recepción». | Si distingue una compra recibida de una venta o un ajuste de conteo. Resultado: compra de $600.000 y 13 unidades. |
| «El cliente devuelve uno de los cascos de la venta anterior. Regístralo y explica qué cambió». | Si distingue devolución parcial de anular toda la venta y entiende las unidades e importe afectados. Resultado: 14 unidades e importe neto de esa venta de $180.000; no equivale a registrar dinero de caja. |
| «Intenta vender 15 cascos y dime cómo resolverías el mensaje». | Si el error explica la falta de existencias y la persona encuentra cómo corregir la cantidad sin perder el formulario. QA comprueba que no se guarde la venta y sigan quedando 14 unidades. |

No hace falta enseñar todos los módulos durante esta sesión. Si hay dificultad, preguntar primero: «¿Qué esperabas que ocurriera?». Si se necesita ayuda para continuar, darla y anotarla; completar una tarea con ayuda no se registra como éxito autónomo.

## Registro breve

Participante/rol: ______ · Equipo y navegador: ______ · Fecha: ______

Modalidad: manejo directo / asistida por capturas. Quien observa: ______

| Tarea | Sin ayuda / con ayuda / no completada | Duda, retroceso o palabra confusa | Cambio solicitado |
| --- | --- | --- | --- |
| Buscar y consultar | Pendiente | | |
| Usar y quitar filtros | Pendiente | | |
| Vender | Pendiente | | |
| Recibir mercancía | Pendiente | | |
| Devolver una unidad | Pendiente | | |
| Entender y corregir el error | Pendiente | | |

Al terminar, preguntar: «¿Qué fue lo menos claro?» y «¿Qué paso te sobró o te hizo dudar?». Conservar las palabras de la persona antes de proponer otra pantalla.

## Cierre y responsables

- Diseño registra problemas de lenguaje, ubicación y exceso de pasos; producto decide su prioridad con el usuario.
- Frontend recibe correcciones concretas de interacción. Backend participa si el problema afecta reglas, saldos o permisos. QA verifica las correcciones y los resultados operativos.
- Una acción que la persona confunda con otra y cambie la operación o las existencias impide cerrar la aceptación hasta corregirla y volver a probarla. También queda abierta si necesita que el facilitador indique repetidamente dónde continuar.
- Un resultado automático correcto no demuestra por sí solo una experiencia clara. La aprobación conjunta se registra después de esta sesión y de la prueba en los equipos reales.

Dependencias humanas pendientes: participación de quien atenderá el almacén, manejo del equipo habitual y lector físico si se utilizará, comentarios del usuario y validación de los ajustes que surjan. No se han realizado ni aprobado mediante este documento.
