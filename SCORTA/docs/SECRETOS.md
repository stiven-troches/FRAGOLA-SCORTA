# Inventario de secretos y llaves

Actualizado: 21 de noviembre de 2026. Este documento dice **qué** secretos existen, **dónde** viven y **quién** los tiene. **Nunca escribas aquí los valores.**

## Reglas

1. Los valores viven solo en el **gestor de contraseñas del dueño** (p. ej. Bitwarden o 1Password) y en las variables de Render. Nunca en GitHub, chats, correos, capturas ni en este documento.
2. Toda cuenta lleva **2FA** con app de autenticación (no SMS cuando se pueda) (US-09).
3. **Rotación anual** de todos los secretos, en la misma fecha (sugerido: la semana del ensayo de restauración de enero), y **de inmediato** si hay sospecha de filtración.
4. Cada llave tiene el **mínimo permiso** que necesita.
5. Al rotar, anota la fecha en la tabla del final.

## Inventario

| # | Secreto | Dónde vive | Quién lo tiene | Para qué | Rotación | Si se filtra |
|---|---|---|---|---|---|---|
| 1 | **Cuenta de Render** (usuario, contraseña, 2FA) | Gestor de contraseñas | Dueño | Controla el servidor, las variables y el disco. Es la llave más poderosa. | Contraseña anual; revisar sesiones activas | Cambiar contraseña, cerrar sesiones, revisar *Events* y variables, rotar **todas** las variables secretas (están a la vista en Render). |
| 2 | `SCORTA_OWNER_PASSWORD` | Render (solo hasta el primer arranque) y gestor | Dueño | Crea al propietario cuando la base es nueva. | — | Ver nota abajo. Si ya creó la cuenta, cambiar la contraseña del propietario en «Mi perfil». |
| 3 | **Contraseña del propietario** en SCORTA (+ 2FA cuando exista, SEG-01) | Gestor | Dueño | Entra a todas las empresas. | Anual | Cambiarla en «Mi perfil» (cierra sus sesiones), revisar auditoría de soporte en todas las empresas. |
| 4 | `SCORTA_BACKUP_KEY` | Render y gestor (**copia obligatoria fuera de Render**) | Dueño | Cifra los respaldos. Sin ella no se pueden restaurar. | Anual. **Conserva las llaves anteriores** en el gestor mientras existan respaldos cifrados con ellas (30 días). | Generar una nueva y ponerla en Render. Los respaldos ya subidos quedan expuestos solo si además se filtró el acceso al bucket: en ese caso, valorar borrarlos tras tener respaldos nuevos. |
| 5 | **Cuenta de Cloudflare** (incluye R2) | Gestor | Dueño | DNS, proxy, certificados y almacenamiento de respaldos. | Contraseña anual | Cambiar contraseña, revisar DNS y reglas, revocar tokens de API. |
| 6 | `SCORTA_S3_ACCESS_KEY_ID` y `SCORTA_S3_SECRET_ACCESS_KEY` (token de R2) | Render y gestor | Dueño | Subir respaldos. **Permiso: solo escritura en el bucket de respaldos.** | Anual | Revocar el token en Cloudflare → R2 → *Manage API tokens*, crear uno nuevo, actualizar las 2 variables en Render y confirmar el siguiente respaldo en Healthchecks. |
| 7 | **Token de lectura de R2** (para restaurar) | Solo en el gestor; se crea cuando se necesita | Dueño | Descargar respaldos. | Crear al usar y revocar después | Revocar en Cloudflare. |
| 7b | `SCORTA_MEDIA_S3_ACCESS_KEY_ID` y `SCORTA_MEDIA_S3_SECRET_ACCESS_KEY` (token de R2 para imágenes, BE-30) | Render y gestor | Dueño | Leer y guardar fotos de productos y logos. **Permiso: lectura y escritura solo en el bucket de imágenes** (nunca en el de respaldos). Quien lo tenga puede ver o reemplazar imágenes de todas las empresas. | Anual | Revocar el token en Cloudflare → R2 → *Manage API tokens*, crear uno nuevo con el mismo alcance, actualizar las 2 variables en Render y abrir un catálogo para comprobar que las fotos cargan. Mientras tanto las imágenes dan 500/404; los datos no se pierden. |
| 8 | `SCORTA_BACKUP_PING_URL` (Healthchecks.io) + cuenta | Render y gestor | Dueño | Aviso de respaldo. Quien la tenga puede enviar avisos falsos de «respaldo correcto». | Anual | En Healthchecks, regenerar la URL del *check* y actualizar Render. |
| 9 | **Cuenta de UptimeRobot** | Gestor | Dueño | Monitoreo de caídas. | Contraseña anual | Cambiar contraseña. |
| 10 | **Cuenta de GitHub** (+ tokens personales, si existen) | Gestor | Dueño | Código y CI. Quien la tenga puede desplegar código a Render. | Contraseña anual; tokens con vencimiento ≤ 1 año | Cambiar contraseña, revocar tokens y llaves SSH, revisar *commits* y *Actions* recientes. |
| 11 | `SCORTA_JE_TEST_PASSWORD` | Solo local del dueño (no en CI) | Dueño | Prueba privada del piloto JE. | Al terminar el piloto, eliminarla | Cambiar la contraseña de esa cuenta. |
| 12 | **Correo del dueño** | Gestor | Dueño | Recupera todas las demás cuentas. | Contraseña anual | Cambiar contraseña y 2FA **primero**, antes que todo lo demás. |
| 13 | **Proveedor de correo transaccional** (futuro, SEG-13) | Render y gestor | Dueño | Enviar correos de recuperación. | Anual | Revocar la llave de API y crear otra. |
| 14 | **WhatsApp Business del soporte** | Celular del soporte | Dueño | Canal con los almacenes. | — | Cerrar sesiones en otros equipos; avisar a los almacenes. |
| 15 | **Dominio** (registrador) | Gestor | Dueño | Si lo roban, pueden desviar el tráfico. | Contraseña anual; bloqueo de transferencia activo | Contactar al registrador. |
| 16 | Contraseñas de **administradores y vendedores** | Las personas de cada almacén | Cada almacén | Uso diario. | Las gestiona cada almacén | El propietario la restablece desde su panel. |

### Borrar `SCORTA_OWNER_PASSWORD` de Render después del primer arranque

Esta variable **solo** se usa cuando `platform.sqlite` no existe. Después de que el servicio arranque por primera vez con disco y puedas entrar como propietario:

1. Entra a SCORTA como propietario y cambia la contraseña en «Mi perfil» por una nueva del gestor.
2. Render → servicio → *Environment* → borra `SCORTA_OWNER_PASSWORD` → *Save*.
3. Comprueba que el servicio arranca y que entras con la contraseña nueva.

Así, quien vea las variables de Render no obtiene la contraseña del propietario. Si alguna vez restauras sobre un disco vacío, vuelve a definirla solo durante ese arranque.

### Cómo crear una llave de respaldo nueva

```sh
node -e "console.log(crypto.randomBytes(32).toString('base64'))"
```

Guárdala primero en el gestor (con la fecha en el nombre, p. ej. «SCORTA backup key 2027-01»), luego en Render.

## Qué no es secreto

`SCORTA_PUBLIC_URL`, `SCORTA_S3_ENDPOINT`, `SCORTA_S3_BUCKET`, `SCORTA_S3_REGION`, `SCORTA_S3_PREFIX`, `SCORTA_MEDIA_S3_ENDPOINT`, `SCORTA_MEDIA_S3_BUCKET`, `SCORTA_MEDIA_S3_REGION`, `SCORTA_MEDIA_S3_PREFIX`, `SCORTA_CLIENT_IP_HEADER` y los nombres de usuario no son secretos, pero no hace falta publicarlos.

## Registro de rotaciones

| Fecha | Secreto | Motivo (anual / sospecha) | Quién | Comprobado (sí/no) |
|---|---|---|---|---|
| | | | | |
