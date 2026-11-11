# Acceso y sesiones de SCORTA

La aplicación presenta su propio formulario de entrada. Las API requieren una
sesión válida; los archivos de la interfaz son públicos para poder mostrar ese
formulario. Ya no se utiliza autenticación HTTP Basic.

La sesión usa un identificador aleatorio de 256 bits. El servidor mantiene su
huella en memoria y el navegador recibe únicamente una cookie `HttpOnly`,
`SameSite=Strict`, con duración máxima de ocho horas. En producción también se
marca `Secure`: el acceso debe pasar por HTTPS. No se guardan contraseñas ni
tokens en localStorage. Reiniciar el servidor cierra todas las sesiones.

Entrar utiliza `POST /api/login`; salir, `POST /api/logout`. Cerrar sesión
invalida la cookie en el servidor. `POST /api/password` exige la contraseña
actual y una nueva de entre 16 y 200 caracteres, y cierra todas las sesiones
de ese usuario. La aplicación solicita entrar de nuevo tras cambiarla.

Si vence la sesión durante una operación o un formulario sin guardar, la
aplicación conserva ese trabajo solamente en memoria, con su identificador de
reintento. Lo oculta, desactiva sus controles y pausa sus consultas hasta volver
a entrar con la misma cuenta. Así se puede confirmar el resultado sin repetir
una venta ya registrada. No permite trasladar el borrador a otra cuenta. Cerrar
o recargar la página pierde ese estado; no se almacena en el navegador. El modo
local de pruebas queda excluido de la retención al crear su primera cuenta.

Las solicitudes que cambian datos deben enviar JSON y un encabezado `Origin`
que coincida con el protocolo y Host de la aplicación. En producción se espera
`https://<Host>`; el proxy debe conservar el Host público. Las lecturas de las
API también requieren sesión. Los permisos se verifican en el servidor y el rol
se consulta de nuevo en cada solicitud.

Diez accesos fallidos bloquean temporalmente la combinación de dirección de red
y nombre de usuario durante quince minutos. Este control es local al proceso;
no sustituye los controles de tráfico de una instalación pública. Tras un proxy,
la dirección observada es la del proxy. El servidor no confía en una dirección
de origen enviada por el cliente mediante encabezados.

Sin cuentas, el modo de pruebas permite al usuario `local` actuar como
administrador solamente en desarrollo y desde la interfaz de loopback. No se
habilita este acceso en producción ni desde una dirección de red externa.

El administrador puede crear usuarios. Esta iteración no añade recuperación de
contraseña ni administración de desactivaciones. Los usuarios y sus contraseñas
derivadas pertenecen al SQLite: el respaldo JSON de operaciones no los incluye.
La copia y recuperación del volumen completo se documenta en `LEEME.md`.

Verificación: `node tests/auth.test.mjs` cubre expiración, cambios de rol,
cuentas inactivas, alcance del modo local, límite de intentos, cookie de
producción, origen y cierre de sesiones al reiniciar. `tests/http.test.mjs`
verifica el flujo HTTP integrado, permisos, salida y cambio de contraseña.
