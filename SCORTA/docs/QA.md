# Validación de la experiencia de SCORTA

La batería utiliza bases de datos temporales y cuentas de prueba; no consulta ni modifica una instalación real del almacén.

## Revisión de claridad del 12 de noviembre de 2026

`npm test`: **32/32 pruebas aprobadas**. `CHROMIUM_PATH=/usr/bin/chromium npm run test:ui`: **compilación correcta y 30/30 recorridos aprobados**, 15 escenarios por tamaño (1440 × 1000 y 390 × 844).

Los recorridos adicionales de `claridad.spec.mjs` comprueban filtros cerrados al entrar, contador y etiquetas persistentes, restablecer sin borrar la búsqueda, recuperación de todos los resultados, ficha con acciones accesibles, menú móvil y errores de conexión siempre visibles. Se adaptaron las pruebas operativas a la navegación y a las acciones dentro de la ficha, conservando los controles de inventario y reintentos.

Se revisaron las capturas finales con la dirección de diseño: [escritorio](capturas/inventario-claro-escritorio.png) y [móvil](capturas/inventario-claro-movil.png). Tras eliminar la transición de selección de sección, la compilación y las capturas confirmaron el resaltado inmediato de Inventario. Dictamen en [REVISION-CLARIDAD.md](REVISION-CLARIDAD.md).

## Resultado de la revisión del 11 de noviembre de 2026

Entorno: Node.js 24.22.1 y Chromium 156.0.8078.79 en Linux.

| Comprobación | Resultado real |
| --- | --- |
| `npm test` | 27 pruebas aprobadas, 0 fallos; 3,1 segundos. |
| `CHROMIUM_PATH=/usr/bin/chromium npm run test:ui` | Compilación aprobada y 20 recorridos aprobados, 0 fallos; navegador: 30,4 segundos. |
| Evidencia visual | Ocho PNG de inicio, inventario, venta y venta con tres productos, en escritorio y móvil. |

Los 20 recorridos corresponden a diez escenarios en dos tamaños. El último escenario se ejecuta en dos variantes: detección de sesión expirada al recuperar foco y respuesta 401 al reintentar la venta. Ambos conservan un único registro y el descuento original de existencias.

## Repetir las comprobaciones

Desde `SCORTA/`, con Node.js 24:

```sh
npm ci
npm test
npx playwright install chromium
npm run test:ui
```

Si el equipo ya tiene Chromium instalado, puede elegirse sin descargar otro navegador:

```sh
CHROMIUM_PATH=/usr/bin/chromium npm run test:ui
```

`test:ui` compila la aplicación y abre un servidor temporal en `127.0.0.1:19420`. El puerto debe estar libre. `browser-checks/serve.mjs` elimina su base al terminar. Las pruebas HTTP usan un servidor temporal en el puerto 19382. En entornos aislados que impidan abrir puertos locales, estos comandos necesitan ejecutarse con el permiso correspondiente.

## Qué se comprueba en el navegador

Cada recorrido se ejecuta en Chromium con escritorio de 1440 × 1000 y móvil emulado de 390 × 844:

| Recorrido | Resultado comprobado |
| --- | --- |
| Acceso y producto | Mensaje de credenciales incorrectas, creación de producto con existencias y cierre efectivo de sesión. |
| Inventario | Búsqueda por código y sin tildes, ausencia de resultados, filtros y ficha con historial. |
| Venta y conexión | Cantidad inválida señalada, datos conservados y reintento único después de perder una respuesta que el servidor ya había confirmado internamente. |
| Permisos | Operador sin acciones administrativas visibles y con acceso al formulario de venta. |
| Taller | Registro de repuesto y mano de obra; avance hasta entrega, descuento único y fecha de entrega. |
| Teclado | Foco atrapado dentro de la ventana, cierre con Escape y devolución del foco al botón que la abrió. |
| Contraseña | Error al confirmar valores distintos, cierre de sesión después del cambio y rechazo de la contraseña anterior. |
| Venta con tres productos | Edición de cantidad y agregado repetido sin concatenación de números; total de $100.000 y existencias finales exactas. |
| Sesión interrumpida | Trabajo incierto oculto durante la autenticación y recuperación por la misma cuenta, conservando el identificador del reintento. Se verifica tanto al detectar la expiración por foco como al recibir un 401 durante el reintento. |

También se comprueba que las pantallas recorridas no provoquen desplazamiento horizontal de toda la página. Las capturas reproducibles de inicio, inventario y venta se guardan en `docs/capturas/`. Los trazados de fallos se guardan en `test-results/`, excluido del repositorio.

## Alcance de la validación

La batería de servidor cubre sesiones, origen y formato de solicitudes, permisos, stock, reintentos, conflictos de revisión, devoluciones, anulaciones, importación, consultas, trazabilidad y respaldo/restauración.

La emulación móvil no sustituye la comprobación con celulares físicos, Safari, lectores de pantalla o lectores de códigos del almacén. Tampoco se ha medido carga de muchos usuarios ni validado un despliegue público con dominio y TLS reales. La revisión con quienes atienden el negocio sigue siendo necesaria para evaluar tiempos y comodidad de uso.
