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

## Asignación para el uso real

Revisión de preparación: 12 de noviembre de 2026 (America/Bogota). Las cuentas
y la base utilizadas en las pruebas son temporales. Esta revisión no crea
cuentas del almacén ni acredita un despliegue de producción.

| Pendiente | Responsable principal | Estado y criterio de cierre |
| --- | --- | --- |
| Definir la dirección de acceso y HTTPS | Infraestructura, con decisión del propietario | Pendiente de definir alojamiento y URL. La aplicación debe abrirse por su dirección HTTPS definitiva, con certificado aceptado por los equipos que se usarán. |
| Preparar la primera cuenta administradora | Seguridad y propietario del almacén | Código preparado y primera cuenta administradora comprobada. Falta identificar al custodio y crear la cuenta en la instalación definitiva mediante la configuración protegida de esa instalación. |
| Crear las cuentas del personal | Administrador del almacén, con apoyo de seguridad | Pendiente de nombres y responsabilidades reales. Los operadores registran ventas y servicios; el administrador gestiona inventario, compras, ajustes, anulaciones y cuentas. |
| Comprobar acceso y permisos en el destino | Seguridad y QA | Las pruebas locales cubren sesión, permisos, salida y cambio de contraseña. Falta repetir entrada, salida, rechazo de acceso sin sesión y restricciones del operador a través del dominio y proxy definitivos. |
| Comprobar recuperación de cuentas desde respaldo | Infraestructura, con apoyo de seguridad | La recuperación SQLite se probó en un directorio aislado y conserva cuentas y reintentos. Falta ensayarla en la instalación definitiva y acordar quién custodia y recupera la copia. |

La primera contraseña se proporciona fuera del código y del chat, usando la
configuración del servidor. `SCORTA_ADMIN_PASSWORD` solo crea la primera cuenta
cuando no existen usuarios; cambiar esa variable después no cambia la
contraseña de una cuenta existente. El administrador puede cambiar su propia
contraseña dentro de la aplicación.

El modo de producción exige `Origin: https://<Host>` y emite la cookie con
`Secure`. El `Caddyfile` preparado envía las solicitudes a `app:3000`; el proxy
debe conservar el Host público. La compatibilidad se revisó por código; no se
probó aquí un certificado ni un dominio reales. La validación de destino debe
comprobar ambos sin publicar el puerto interno de la aplicación.

Estas condiciones también se deben resolver si se elige un solo computador o
una red interna. La configuración actual de producción no ofrece un acceso
por HTTP sin TLS. El modo `development` sin cuentas sirve para demostraciones
locales y no cierra el pendiente de acceso real.

Una recuperación completa devuelve las contraseñas que existían en la fecha
del respaldo. El reinicio obliga a entrar de nuevo; después de recuperar se
debe comprobar el acceso de una cuenta administradora y de un operador en la
copia de ensayo antes de volver a atender al almacén. El JSON de operaciones
no sustituye ese respaldo completo.

Validación dirigida de esta revisión:
`node --test tests/auth.test.mjs tests/bootstrap.test.mjs tests/backup.test.mjs`
terminó correctamente: **3/3 archivos de pruebas aprobados**, sin fallos. No se
repitió la batería completa ni se modificó código de autenticación. La
recuperación de contraseña y la interfaz de desactivación de cuentas siguen
como mejoras futuras por priorizar, no como trabajo terminado.
