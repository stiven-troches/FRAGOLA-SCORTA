# QA de la segunda revisión de SCORTA

19 de noviembre de 2026, America/Bogota.

## Alcance

Esta revisión verifica los ajustes surgidos de la prueba de la demo: sesión recordada, separación de Venta/Inventario/Taller para vendedor, carrito común, recuperación/condiciones en la interfaz, botón único de renovación, vistas previas de comunicaciones y paleta blanco/negro/amarillo.

El logo oficial debe conservar sus píxeles, tipografía, colores y proporciones. La incorporación del archivo original y su revisión visual deben registrarse por separado: compilar un componente de marca no acredita que sea el archivo autorizado.

No se conectan proveedores de WhatsApp, correo o firma. Una vista previa no es un envío, un correo escrito en una cuenta no está verificado automáticamente, y los documentos legales provisionales no constituyen revisión profesional ni contrato definitivo.

## Pruebas de esta revisión

| Batería | Qué demuestra | Estado |
| --- | --- | --- |
| `node tests/review2-acceptance.test.mjs` | Una sesión recordada queda bloqueada por vencimiento; el pago tardío reactiva el acceso hasta el nuevo día de corte; una renovación no retira bloqueo manual; una cuenta desactivada/reactivada o restablecida no recupera la sesión revocada. | 2/2 aprobadas. |
| `tests/platform-server.test.mjs` | SQLite conserva la sesión al reiniciar y la cookie protege el token opaco durante 30 días. Restaurar un respaldo continúa eliminando sesiones, y cerrar sesión sigue invalidando el acceso. | 3/3 pruebas de HTTP/SQLite/restauración aprobadas en la suite completa. |
| `node tests/platform-render.test.mjs` | Render de propietario y roles, navegación de vendedor con Nueva venta/Inventario/Taller, administrador con seis módulos; el checkout no muestra buscador de productos ni formulario de mano de obra. Helpers de avisos comprueban recordatorio único tres días antes y supresión del período anterior tras renovar. Recuperación y documentos legales indican que son vistas previas; las dos casillas legales comienzan sin marcar y continuar está inhabilitado. | 7/7 aprobadas: roles, checkout, avisos, recuperación y documentos legales en HTML SSR. El componente Brand está integrado; el archivo original del logo sigue pendiente de incorporación/verificación. |
| `tests/persistent-session.test.mjs` y `tests/review2-demo.test.mjs` | TTL y token persistente, cierre y revocación, recuperación de acceso entre reinicios de almacenamiento de demo sin guardar contraseñas o negocio en localStorage. | 4/4 de sesión persistente y 4/4 de demo aprobadas en ejecución independiente. |
| `node tests/platform-demo.test.mjs` | Mantiene pruebas previas de aislamiento, CAS, reintentos, reset, export sin credenciales y recibos de demo. Los casos sin almacenamiento de token inyectado conservan su aislamiento de prueba en memoria. | 8/8 aprobadas en ejecución independiente. |

La ejecución completa de integración aprobó **86/86 pruebas**, sin fallos ni omisiones. `npm run build` y `npm run build:demo` compilaron correctamente. No sumar las baterías anteriores de nuevo: están incluidas en ese total.

## Reglas verificadas del contrato

- Con corte actual el 19, pagar el 15 amplía la vigencia al 19 del mes siguiente.
- Pagar el 25 después de vencer amplía hasta el 25 del mes siguiente.
- El día final se incluye completo en Colombia; el bloqueo comienza al día siguiente.
- Mantener la sesión iniciada no omite vigencia, permisos, suspensión ni revocación.
- El recordatorio corresponde a la vigencia actual: renovar antes impide mostrar el aviso del período anterior.
- La interfaz debe indicar que los envíos automáticos y la recuperación por correo no están conectados mientras no exista proveedor.

## Límite de la comprobación visual

El perfil de Sites administrado no dispone de Cua. No se ejecutó navegador, servidor de vista previa ni control alternativo. SSR renderiza HTML estático y no ejecuta efectos, clics, carga de archivos o medición de dispositivos. No sustituye la revisión conjunta en celular/PC ni prueba que correo/WhatsApp hayan enviado un mensaje.
