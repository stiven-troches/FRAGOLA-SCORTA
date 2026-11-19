# QA de plataforma SCORTA

Actualización: 19 de noviembre de 2026 (UTC).

## Alcance de aceptación

La revisión cubre el nuevo alcance multiempresa A01–A32. Los resultados de la versión anterior no constituyen aprobación de esta plataforma.

Se verificó con datos ficticios y el motor compartido:

- Dos empresas y varios administradores/vendedores, con acceso estrictamente limitado por empresa y rol.
- Vigencia inclusiva del último día en Colombia, vencimiento de sesiones ya abiertas y bloqueo manual independiente de las renovaciones.
- Renovaciones anticipadas y vencidas, cambios de contraseña y restablecimiento sin exponer las credenciales.
- Ventas de productos, mano de obra y mixtas: stock, reintentos, rechazo de operaciones inválidas, cobros sin duplicados y reversión autorizada.
- Historial de cliente/placa, atribución de soporte, datos anteriores/nuevos y visibilidad para el administrador del cliente.
- Comprobantes y enlaces de acceso: sólo el alcance autorizado se expone al vendedor, se rechazan documentos inexistentes o tokens inválidos y no se revela configuración privada.
- Revisión estática de la integración de formularios, navegación y permisos en la interfaz.

## Ejecución

Resultados observados con Node.js 24:

| Comando | Resultado |
| --- | --- |
| `npm test` (integración final) | **72/72 aprobadas**, 0 fallos, sin omisiones; aproximadamente 6,4 segundos. Incluye las pruebas históricas, aceptación, demo, SSR, HTTP/SQLite y seguridad. |
| `npm run build` y `npm run build:demo` | Ambas compilaciones aprobadas. |
| `git diff --check` | Sin errores de espacios. |
| `node tests/platform-acceptance.test.mjs` | **11/11 aprobadas**, 0 fallos, sin omisiones; aproximadamente 1,4 segundos. |
| `node tests/platform-render.test.mjs` | **3/3 aprobadas**, 0 fallos, sin omisiones; aproximadamente 0,4 segundos. |

La batería de aceptación utiliza `createPlatform` y `platformRequest` con empresas y credenciales ficticias. Comprueba dos empresas, varios administradores y vendedores, intentos de acceso cruzado y operaciones prohibidas; el límite de contrato a las 05:00 UTC del día siguiente (medianoche de Colombia), renovación anticipada y vencida sin retirar suspensión manual; cierre de todas las sesiones después de restablecer o cambiar contraseña; una jornada con venta mixta de $113.000, mano de obra de $60.000 y productos de $34.000, con existencias e historiales netos conciliados después de reversiones; rollback, reintentos y revisión obsoleta; soporte con identidad y motivo; recibos sin costos, desconocidos y vencidos; ventas ajenas ocultas al vendedor; y normalización de teléfonos equivalentes.

Los renders estáticos construyen los componentes React con Vite en modo SSR (`write:false`) y `react-dom/server`, usando envelopes reales de la semilla demo. Verifican que el propietario vea empresas y URLs sin contraseñas, que el vendedor tenga únicamente Nueva venta e Inventario, y que el administrador tenga los seis módulos en el orden acordado. También comprueban que no exista un enlace duplicado Mi perfil junto al nombre. No se inicia servidor ni navegador y no se ejecutan interacciones o efectos del navegador.

## Hallazgos corregidos durante la revisión

- La ruta legacy de reversión de servicio permitía devolver existencias de un trabajo vinculado a una venta sin anular su cobro. El backend ahora rechaza esa ruta y exige revertir la venta vinculada. Se incorporó una prueba de regresión.
- Escribir un mismo teléfono con espacios o guiones generaba dos historiales de cliente. El backend normaliza esos separadores antes de relacionar las compras. Se incorporó una prueba de regresión.
- La revisión de integración del formulario de propietario detectó diferencias de nombres en contacto, motivo de soporte y fecha de pago frente al contrato API. El agente de interfaz corrigió los mapeos a `contact`, `motivo` y `date`.

La integración final incluye 44 pruebas históricas, 11 de aceptación de plataforma, 8 del adaptador demo, 3 renders SSR, 3 de HTTP/SQLite/respaldo y 3 de seguridad: 72 en total. No deben sumarse de nuevo como baterías independientes. Los reintentos entre empresas, la auditoría antes/después y las imágenes disfrazadas o mayores al límite están cubiertos por regresiones de seguridad. El export de la demo excluye también los enlaces que contienen tokens de recibos.

## Límite de navegador

Esta sesión utiliza el perfil Sites administrado y no dispone de `cua_repl.js`. La guía de Sites exige omitir la ejecución visual en estas condiciones: no se ejecutarán navegadores, servidores de vista previa ni automatización alternativa. La compilación y las comprobaciones Node no sustituyen la revisión visual con el cliente ni las pruebas con dispositivos reales.
