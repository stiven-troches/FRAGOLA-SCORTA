# Prueba de aceptación y piloto del almacén

Preparado el 12 de noviembre de 2026 (America/Bogota). Responsable de la comprobación: QA, con una persona que atienda el almacén. Producto coordina la decisión de comenzar el piloto.

**Estado: preparado; pendiente de ejecutar con el personal y los equipos reales.** Las 32 pruebas de servidor y 30 recorridos de interfaz ya registrados en [QA.md](QA.md) son automatizados. No acreditan el lector físico, los celulares del almacén, la aceptación del usuario ni el servidor definitivo.

## Antes de comenzar

- Usar una copia de ensayo identificada, separada del inventario real. Anotar versión, dirección y dispositivo en el registro de abajo.
- Preparar una cuenta administradora y una operadora propias del ensayo. Las contraseñas se entregan por el medio privado acordado; no se anotan en este documento ni en el chat.
- Si se prueba desde varios equipos, utilizar el acceso HTTPS preparado por infraestructura. Comprobar entrada y salida de sesión antes de registrar operaciones.
- Preparar este producto ficticio, sin otras operaciones pendientes:

| Campo | Valor de ensayo |
| --- | --- |
| Producto | Casco integral de prueba |
| Referencia | CAS-001 |
| Marca / categoría | LS2 / Cascos |
| Existencias iniciales | 10 |
| Precio de compra | $120.000 |
| Precio de venta | $180.000 |
| Mínimo de alerta | 3 |

Esta es la secuencia acordada con diseño. Si se repite, partir de una copia limpia con esas diez unidades: no volver a introducir operaciones sobre el resultado anterior. Para observar claridad y lenguaje, usar además [GUIA-PRUEBA-USUARIO.md](GUIA-PRUEBA-USUARIO.md).

## Recorrido de mostrador

La persona del almacén realiza los pasos. QA observa sin indicar cada clic y anota dónde necesita ayuda.

| Paso | Qué hacer | Resultado que debe verse |
| --- | --- | --- |
| 1. Consultar | Buscar CAS-001 en Inventario y abrir la ficha. | Se identifica el casco, precio $180.000 y diez unidades. Costo y mínimo están en la ficha del administrador. No hace falta desplegar filtros para encontrarlo. |
| 2. Vender | Abrir **Nueva venta**, buscar el casco y agregar dos unidades. Corregir la cantidad de 1 a 2 si se quiere comprobar la edición. Revisar y guardar una sola vez. | Total **$360.000**, una venta registrada y existencias **8**. El historial registra salida de dos unidades y su autor. |
| 3. Recibir mercancía | Como administrador, abrir Compras, registrar cinco cascos a $120.000 cada uno con proveedor ficticio y guardar. | Compra **$600.000**, entrada de cinco unidades y existencias **13**. |
| 4. Devolver | Localizar la venta anterior, pulsar **Devolución**, devolver una de sus dos unidades y escribir un motivo de prueba. Confirmar el efecto mostrado. | Reingresa una unidad: existencias **14**. La venta original conserva sus dos unidades, muestra una devuelta e importe neto **$180.000**. No aparece una segunda venta. |
| 5. Corregir un error | Intentar vender quince unidades del mismo casco. Leer el mensaje y corregir la cantidad o cancelar el formulario. | Explica que solo hay catorce; no guarda una venta ni altera existencias. Los datos se pueden corregir sin empezar otra operación. Al cancelar, siguen **14** unidades. |
| 6. Conciliar | Abrir la ficha y **Historial de movimientos**; revisar los documentos de compra, venta y devolución. | Saldo independiente: **10 − 2 + 5 + 1 = 14**. Compra $600.000; venta original $360.000, devolución $180.000 e importe neto $180.000. Motivo y autores corresponden a lo realizado. |

Los importes anteriores describen documentos de la aplicación; no acreditan recaudo, caja ni facturación electrónica.

## Comprobaciones del equipo real

Estas pruebas se ejecutan después del recorrido anterior y se registran por separado.

| Prueba | Acción | Se aprueba cuando |
| --- | --- | --- |
| Permisos | Entrar como operador, consultar un producto y comenzar una venta; revisar los menús. Cerrar sesión y volver como administrador. | El operador puede vender y trabajar en taller; no encuentra creación de productos, compras, ajustes, devoluciones, anulaciones, usuarios ni respaldo. QA confirma también el rechazo del servidor a una acción administrativa invocada directamente con ese usuario. Al salir no se puede consultar información sin volver a entrar. |
| Referencia repetida | Como administrador, intentar crear otro producto con referencia CAS-001 y un nombre distinto. | Se rechaza la referencia repetida con un mensaje comprensible; el formulario conserva lo escrito y no se crea otro producto. Cancelar el alta de ensayo. |
| Lector físico | Asignar al producto de ensayo el código de una etiqueta de prueba y verificar que sea único. Escanearlo en el buscador de productos y en Nueva venta. | El lector introduce el código completo, selecciona el casco correcto y el personal puede agregarlo sin buscar otro artículo. Comprobar cómo envía Enter y la lectura consecutiva de dos etiquetas. Cancelar la venta de ensayo sin guardar. Anotar modelo y configuración del lector. |
| Celular del almacén | Repetir consulta y preparación de venta desde su navegador, sin guardar otra operación. Abrir Menú, Filtros, ficha y Opciones; volver a la venta y cancelar. | Precio, existencias, total y botones se leen y se alcanzan con el teclado del teléfono abierto; no hay desplazamiento horizontal de toda la página. Se entiende qué filtros están activos y cómo quitarlos. Anotar teléfono y navegador. |
| Teclado / accesibilidad | Recorrer búsqueda, resultados, cantidades y guardado con Tab; abrir y cerrar la ventana con teclado. Usar las ayudas de accesibilidad habituales de la persona, si las utiliza. | Etiquetas y foco son identificables, no se pierde el foco fuera de la ventana y se puede completar la tarea. Anotar cualquier control inaccesible. La emulación anterior no sustituye esta comprobación. |
| Dos operadores | En el entorno definitivo de ensayo, crear otro producto único **QA-ULTIMA-01**, precio $10.000 y stock 1. Dos operadores en equipos distintos intentan vender esa única unidad. | Solo una venta queda guardada y el producto termina en **0**, nunca negativo. El otro operador recibe un mensaje comprensible y puede actualizar/corregir su formulario. No repetir el intento como una venta nueva sin revisar antes su resultado. Este caso no modifica CAS-001. |

Si una respuesta de guardado queda incierta, conservar el formulario y usar **Reintentar operación** para confirmar el mismo registro. No recargar ni crear otra venta como solución. La conservación no es durable después de cerrar o recargar la página.

## Registro de aceptación

Completar en el ensayo; todas las filas comienzan pendientes.

Versión o commit: __________ · Dirección de ensayo: __________

Fecha y hora (Bogotá): __________ · QA: __________ · Persona del almacén: __________

| Caso | Estado (pendiente / pasa / falla) | Resultado observado y evidencia | Incidencia / responsable |
| --- | --- | --- | --- |
| Venta, compra y devolución conciliadas | Pendiente | | |
| Error de cantidad corregible | Pendiente | | |
| Permisos y salida de sesión | Pendiente | | |
| Referencia repetida | Pendiente | | |
| Lector físico | Pendiente | | |
| Celular y navegador habituales | Pendiente | | |
| Teclado y accesibilidad habitual | Pendiente | | |
| Dos operadores, última unidad | Pendiente | | |

Si algo falla, registrar el paso, lo esperado, lo observado y cómo repetirlo. Frontend y diseño corrigen la interacción; backend corrige reglas o datos; infraestructura atiende acceso y recuperación. QA vuelve a comprobar el caso y los flujos que pueda afectar. No marcar un caso como aprobado solo porque el personal recibió una explicación.

## Piloto antes de ampliar el uso

Producto y el responsable del almacén fijan personas, productos, horario y responsable de soporte del piloto. Antes de introducir datos reales deben estar listos el acceso definitivo con cuentas, el inventario inicial conciliado y el respaldo automático externo con restauración comprobada por infraestructura.

Durante el piloto, registrar cada incidencia y cerrar la jornada comparando conteo físico, existencias y operaciones del día. Acordar cuál es el registro de trabajo para evitar introducir una operación dos veces. Conservar los documentos y motivos de cualquier ajuste necesario.

| Fecha / turno | Personas y equipos | Saldo inicial y final conciliado | Incidencias | Responsable y resultado |
| --- | --- | --- | --- | --- |
| Pendiente de definir | | | | |

**Se puede ampliar el piloto** cuando los recorridos anteriores pasan, la persona realiza las tareas sin ayuda continua, los saldos coinciden y los incidentes que afecten stock, duplicación, acceso o recuperación están resueltos. **Se detiene la ampliación** si aparece un saldo inexplicable, una operación duplicada, acceso indebido o una copia que no se puede recuperar; se conserva la evidencia y se asigna la corrección antes de continuar.

La decisión y su evidencia se registran por producto y el responsable del almacén. Este documento deja la prueba preparada; no declara esa decisión tomada.
