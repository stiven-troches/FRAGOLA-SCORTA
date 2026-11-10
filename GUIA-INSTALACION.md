# Puesta en marcha

## 1. Elegir el proyecto de Supabase

La configuración recibida ya apuntaba a un proyecto. Confirma que tienes acceso a él o crea uno propio. No introduzcas datos reales hasta verificarlo.

En un proyecto **nuevo**, ejecuta `supabase/schema.sql` en el editor SQL. No lo ejecutes de nuevo sobre una base existente: crea tablas y políticas y no es una migración repetible. Haz primero una copia de seguridad si vas a intervenir una instalación existente. El archivo `parche-01-permisos.sql` es únicamente el ajuste de permisos para instalaciones anteriores, no un reemplazo del esquema.

## 2. Conectar

Edita `config.js`:

```js
window.__FRAGOLA_CLOUD={
  url:'https://TU-PROYECTO.supabase.co',
  anonKey:'TU-CLAVE-PUBLICA'
};
```

Usa solo la clave pública del proyecto. No pongas una clave secreta en archivos del navegador.

## 3. Publicar

Ejecuta `npm ci`, `npm test`, `npx playwright install chromium`, `npm run test:ui` y `npm run build`.

Puedes subir el contenido de `dist/` a un alojamiento estático con HTTPS. Para GitHub Pages, sube el proyecto a tu repositorio y selecciona GitHub Actions como origen de Pages. El workflow incluido publicará tras pasar las pruebas.

## 4. Autenticación

Configura el proveedor de correo y la confirmación de correo en Supabase. Ajusta Site URL y las URL de redirección a la dirección final completa de la app, incluido el subdirectorio del repositorio si existe. Verifica que la confirmación de cuenta y la recuperación de contraseña regresan a esa dirección.

La función «Mis citas» usa autenticación telefónica: requiere habilitar y configurar un proveedor SMS. Reservar no requiere SMS. Comprueba el envío real antes de anunciar esa función.

## 5. Configurar el negocio

Abre Administrador, crea y confirma tu cuenta, entra y crea el negocio. Agrega servicios, profesionales, horarios y WhatsApp. Revisa precios, duración, descansos, preparación y limpieza. Genera invitaciones individuales para los empleados y verifica su acceso.

Comparte el enlace `https://TU-SITIO/?n=tu-negocio`.

## 6. Aceptación antes de recibir clientes

- Realiza una reserva desde otro dispositivo y comprueba que aparece en administración.
- Intenta reservar la misma hora desde dos sesiones; confirma que se rechaza el cruce.
- Verifica el acceso del empleado y el aislamiento entre negocios.
- Prueba confirmación por correo, recuperación de contraseña, SMS, cancelación y reprogramación.
- Abre dos sesiones y verifica la actualización de la agenda. Comprueba la publicación Realtime de Supabase si necesitas cambios inmediatos; la app también recarga periódicamente.
- Prueba una interrupción de red y la recuperación del guardado antes de cerrar sesión.
- Conserva una copia de seguridad y comprueba que puedes restaurarla en un entorno de prueba.
- Completa el aviso de privacidad y las condiciones del negocio con asesoría adecuada.

Esta revisión valida la copia local y su SQL de prueba. No instala cambios en Supabase ni acredita que correo, SMS, Realtime y alojamiento funcionen en tu cuenta real. La publicación requiere definir el repositorio o alojamiento y tener acceso al proyecto.
