# Revisión de FRAGOLA PRENOTA 7.1

## Resultado

Copia organizada y corregida, preparada para publicación estática. No se han modificado los archivos originales en Temp ni se han realizado escrituras en el Supabase configurado. No está publicada todavía: falta identificar el repositorio o dominio del usuario y validar su infraestructura.

## Cambios

1. Se consolidó la app en un único `index.html`. Las versiones antiguas no se usan como entradas de producción; sus informes quedan como antecedentes en docs.
2. Se separó la configuración pública en `config.js`, conservando el destino recibido. `config.example.js` permite activar la demostración local. Se corrigió la documentación, que decía que los campos estaban vacíos aunque apuntaban a Supabase.
3. La sincronización registra las inserciones, actualizaciones y eliminaciones confirmadas después de cada operación. Ante un fallo posterior de red, el reintento no repite esas escrituras ya confirmadas. Esto no convierte el lote completo en una transacción: una caída de página tras una respuesta perdida sigue requiriendo comprobación del estado real.
4. Se corrigió la detección de ecos en tiempo real: los bloqueos ahora se comparan por contenido. Antes cualquier bloqueo ya conocido se ignoraba aunque otro usuario lo hubiera editado. Los avisos provocan recarga en vez de descartarse por tener un identificador conocido.
5. Cambiar de negocio o cerrar sesión se detiene si el guardado falla o sigue ocupado. Se añadió aviso del navegador al abandonar con cambios pendientes. Ese aviso no garantiza persistencia en un cierre forzado del dispositivo.
6. Se comprueba el error de recuperación de sesión durante el arranque.
7. El servidor local maneja URL malformadas y rutas inválidas, limita métodos a GET/HEAD y añade tipo de contenido, no-store y nosniff.
8. Se añadió una entrada npm en la raíz, construcción de dist y workflow de GitHub Pages con verificaciones previas. Solo se publican index.html y config.js.

## Verificaciones realizadas

- Sintaxis del JavaScript: correcta.
- SQL sobre PostgreSQL en PGlite: **69 casos correctos, cero fallos**. Incluyen permisos anónimos, aislamiento entre negocios, acceso de empleados, cruces, recursos, cancelación, reprogramación y datos del cliente.
- Sincronización: fallo de red después de un guardado parcial, conservación del progreso, reintento sin duplicados y bloqueo del cambio de contexto cuando falla el guardado.
- HTTP: **8 comprobaciones correctas**, incluidas peticiones malformadas, métodos, HEAD, cabeceras y archivos inexistentes.
- Interfaz en Microsoft Edge mediante Playwright: tamaños 1440×1000 y 390×844. Catálogo con datos ficticios, persistencia tras recarga, PIN incorrecto, acceso administrador, ausencia de errores JavaScript y de desbordamiento horizontal. Capturas en docs/capturas.
- Construcción de dist: correcta, dos archivos publicables.
- Instalación npm: auditoría sin vulnerabilidades reportadas en las dependencias instaladas. Esto no cubre la librería de Supabase cargada desde CDN.

Para ejecutar la interfaz con Edge instalado en Windows:

```powershell
$env:PLAYWRIGHT_CHANNEL='msedge'
npm run test:ui
```

El workflow usa Chromium. La descarga local de Chromium no se completó; las pruebas de esta revisión se ejecutaron con Edge. El workflow remoto no se ha ejecutado todavía.

## Pendientes para operar

- Confirmar que el proyecto Supabase configurado pertenece al usuario y que contiene el esquema esperado. No se ha verificado el servicio real en esta revisión.
- Definir el repositorio o alojamiento y su URL final, publicar y comprobar HTTPS y redirecciones.
- Verificar confirmación por correo, recuperación de contraseña, envío SMS y Realtime con cuentas reales de prueba. Las pruebas SQL no sustituyen estas integraciones.
- Completar una reserva de extremo a extremo desde un dispositivo externo y verificar una restauración de respaldo.
- La reserva pública sigue sin CAPTCHA ni verificación de propiedad del teléfono al crearla. El límite por número no evita reservas falsas con números distintos. Requiere diseñar y validar una protección del lado del servidor antes de una exposición que necesite control de abuso.
- La interfaz sigue concentrada en un archivo grande. Dividirla en módulos sería una fase posterior; se preservó la arquitectura para limitar regresiones.
- La eliminación de datos del cliente anonimiza citas y notas, pero el registro histórico inmutable puede conservar nombres en textos. No debe presentarse como eliminación integral de toda la información personal; requiere definir una política de retención y ajustar el diseño correspondiente.
- Las operaciones de administración se envían en varias solicitudes. No existe una transacción única para toda una importación ni una cola durable de cambios fuera de línea.
- Fotos en texto dentro de la base y consultas del catálogo requieren medición de rendimiento con el volumen real.

El material histórico afirma pruebas previas que no se reproducen todas aquí. Esta revisión acredita únicamente las comprobaciones descritas arriba.
