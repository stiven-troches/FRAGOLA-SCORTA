# Fragola Prenota v7: Fase 4 (servidor con Supabase)

Archivos: `index.html` (= `fragola-prenota-v7.html`), `supabase/schema.sql`, `GUIA-INSTALACION.md`. Incluye todo lo de v6.4. Las versiones v6.3 y v6.4 no se modificaron.

## Qué se construyó

### Base de datos (`supabase/schema.sql`)
- **12 tablas**: negocios, miembros, invitaciones, servicios, profesionales, datos privados de profesionales, recursos, bloqueos, citas, notas de clientes, avisos y registro de cambios.
- **Varios negocios aislados**: la seguridad por filas (RLS) solo deja ver y cambiar lo del negocio propio.
- **Cero citas cruzadas**: una restricción de exclusión impide que se cruzen dos citas activas del mismo profesional, contando preparación y limpieza. Funciona aunque dos personas reserven al mismo tiempo.
- **Reserva pública segura (`book`)**: valida en el servidor el horario por versión, los descansos, las ausencias, los días cerrados, la anticipación mínima y máxima, la grilla de horas, el límite de citas por celular, los recursos y la autorización de datos. Asigna profesional cuando se elige «cualquiera».
- **Catálogo público (`public_catalog`)**: servicios, perfiles y horas ocupadas, **sin nombres ni celulares** de otros clientes, y sin documento ni teléfono de empleados.
- **Clientes con código por SMS**: ven, cancelan (respetando el plazo mínimo) y reprograman **solo sus** citas. También pueden corregir o **borrar sus datos** (Ley 1581).
- **Empleados**: entran con invitación. Solo ven sus citas y solo pueden cambiarles el **estado**, en orden lógico y sin cerrar citas de días futuros. Pueden crear y quitar sus bloqueos, pero no vacaciones. Lo controla un disparador en la base de datos.
- **Registro de cambios** que no se puede editar ni borrar, firmado con el usuario real.
- Datos privados de empleados (documento y celular) en una tabla aparte que solo ve el administrador.

### App (`index.html`)
- **Modo local** (como v6.4) si `CLOUD_CFG` está vacío. **Modo servidor** si tiene URL y clave.
- **Acceso** con correo y contraseña: crear cuenta, entrar, «Olvidé mi contraseña», crear el negocio con su dirección corta. Las confirmaciones sensibles piden la contraseña, ya no un PIN.
- **Enlace público** `?n=negocio` con botón para copiarlo. El cliente reserva sin cuenta.
- **Sincronización**: cada cambio del panel se envía al servidor comparando con la última copia. Solo viajan las columnas que cambiaron, así no se pisan cambios de otra persona. Si el servidor rechaza algo (un cruce, un permiso), la app avisa el motivo y vuelve a cargar el dato real. Sin conexión, reintenta.
- **Tiempo real**: la agenda se actualiza cuando otra persona cambia citas, bloqueos o avisos. Además hay una recarga de respaldo cada 90 s.
- **Invitaciones**: código para empleados (perfil → Estado) y para otros administradores (Negocio → Cuenta y seguridad).
- **Importar** una copia de la versión local al servidor.
- **Seguridad del navegador**: la política de contenido permite solo la librería de Supabase desde jsDelivr, con huella SRI fija (versión 2.45.4), y conexiones a `*.supabase.co`. Todo lo demás sigue bloqueado.
- Los identificadores nuevos son aleatorios, para que dos equipos no choquen. Los bloqueos con id decimal de v6.3 se convierten al importar.

## Pruebas
| Suite | Cómo | Resultado |
|---|---|---|
| Base de datos: reglas y seguridad | PostgreSQL 17 real (PGlite) con roles `anon`/`authenticated` como en Supabase: `pruebas/test-sql.mjs` | **64/64** |
| App en modo servidor, de punta a punta | Chromium + la app real + PostgreSQL en el navegador con el mismo esquema y RLS (`pruebas/mock-supabase.js`) | **27/29** en la primera pasada; las 2 fallas corregidas y verificadas (abajo) |
| Retroceso tras cruce, cita desde el formulario, permisos del empleado | Misma configuración | **6/6** |
| Política de seguridad de producción + librería real de Supabase desde el CDN | Chromium, proyecto inventado | **6/6** |
| Regresión del modo local | Chromium | **7/7** |

Las 2 fallas de la primera pasada:
1. «Registro enviado (2)»: la prueba esperaba 3 entradas y lo correcto eran 2. La expectativa era errónea; la app estaba bien.
2. «Vuelve al dato real»: la prueba leyó el dato antes de que terminara la recarga. Agregué un indicador de recarga y, con él, la prueba enfocada pasó.

Flujos probados de punta a punta:
- La dueña crea su cuenta y su negocio, carga 371 citas de demostración y cambia un precio.
- Se fuerza un cruce y el servidor lo rechaza.
- Se recarga la página y se conservan la sesión y los datos.
- Se genera una invitación y el empleado entra con ella. Solo ve sus citas, bloquea su horario, completa una cita de hoy y se le rechaza cambiar un precio.
- Un cliente usa el enlace público, hace dos reservas, entra con código SMS (el código equivocado se rechaza), reprograma una y cancela la otra.
- La dueña ve todo con sus avisos y su registro, rechaza una contraseña equivocada e importa una copia local.

## Verificación contra el proyecto real (`nnjcbjqoplypmbegmzfl`)
Solo con consultas anónimas, sin crear cuentas ni datos:
- El esquema está instalado.
- Un visitante no puede leer citas ni datos privados, ni escribir en las tablas.
- Las funciones internas no están expuestas.
- La reserva valida en el servidor.
- La app real carga la librería, se conecta y responde sin violar la política de seguridad.

**Hallazgo**: Supabase concede a `anon` permiso explícito de ejecutar funciones, y por eso un visitante podía *llamar* a funciones que exigen sesión. Las funciones mismas lo frenaban, así que no se expuso nada, pero se corrigió:
- en `schema.sql`;
- en las pruebas, que ahora imitan esos permisos de fábrica (**69/69**);
- con `supabase/parche-01-permisos.sql` para tu proyecto, que ya tenía instalado el esquema anterior.

## Límites (léelos)
- **No se probó contra un proyecto real de Supabase**: no tengo cuenta. Se probó con el mismo PostgreSQL, el mismo esquema y las mismas reglas, y con una imitación del cliente de Supabase. Pueden aparecer diferencias menores con el servicio real, en especial en el **tiempo real**, la **confirmación por correo** y el **envío de SMS**, que la imitación no reproduce.
- **SMS**: requiere contratar un proveedor (por ejemplo Twilio) y tiene costo por mensaje. Sin él, los clientes reservan igual, pero no pueden entrar a «Mis citas».
- **Abuso de la reserva pública**: hay límite de citas activas por celular, pero no CAPTCHA. Alguien podría hacer reservas falsas cambiando de número. Siguiente mejora sugerida: Cloudflare Turnstile, que Supabase soporta.
- **Fotos** guardadas como texto en la base de datos (máx. ~150 KB cada una). Para muchas fotos convendría Supabase Storage.
- **Validación de citas del administrador**: la base de datos impide los cruces, pero el resto de reglas (horario, descansos) solo las revisa la app. El administrador puede forzar una cita fuera de horario a propósito; las reservas de clientes, no.
- Solo se probó en Chromium. No se probó en celulares reales, Safari ni Firefox.
- Temas legales (Ley 1581, transferencia internacional, RNBD): ver la guía, paso 6. Los debe revisar un abogado.
