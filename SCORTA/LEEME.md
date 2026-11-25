# SCORTA — empresas, inventario, ventas y taller

Esta carpeta contiene la aplicación multiempresa. Requiere **Node.js 24** y utiliza `/api/v2/`. El propietario gestiona empresas, vigencias y cuentas; cada empresa conserva su inventario y sus operaciones, con administradores y vendedores.

**Producción:** SCORTA se aloja en **Render** (EE. UU.), con respaldo cifrado cada hora hacia Cloudflare R2. Hoy corre en el plan gratuito, **sin disco**: solo sirve para pruebas con datos ficticios. La operación completa está en [docs/OPERACION.md](docs/OPERACION.md) y el índice de toda la documentación en [docs/README.md](docs/README.md).

### Cambios recientes (20–21 de noviembre de 2026)

- **Costo promedio:** cada compra recalcula el costo con promedio ponderado; anular una compra vuelve a la fuente anterior.
- **Sesión del propietario de 12 horas** y modo soporte que se cierra solo a las 2 horas (los demás usuarios: 30 días).
- **Buscador en Nueva venta:** escribir nombre, referencia o código y presionar Enter agrega el producto al carrito.
- **Paginación:** Inventario y las listas de ventas muestran 100 registros a la vez («Mostrar más»); la app no recarga datos con la pestaña oculta.
- **Render:** `/healthz` con versión, disco, latencia y último respaldo; modo mantenimiento (`SCORTA_MAINTENANCE=1`); respaldo local al arrancar; respaldo externo cifrado cada hora; IP real configurable para el límite de intentos.
- **Fecha de venta controlada por el servidor** y el vendedor ya no ve clientes de ventas ajenas.

## Instalar y abrir con Node

Desde `SCORTA`:

```sh
npm ci
npm run build
```

Copia `.env.example` a `.env` y completa `SCORTA_OWNER_COMPANY`, `SCORTA_OWNER_USER`, `SCORTA_OWNER_NAME` y `SCORTA_OWNER_PASSWORD`. La contraseña debe tener entre 8 y 200 caracteres, con número, mayúscula, minúscula y símbolo. `SCORTA_OWNER_CONTACT` y `SCORTA_OWNER_EMAIL` son opcionales; el correo se verifica desde «Mi perfil» y, si configuras `RESEND_API_KEY` y `SCORTA_MAIL_FROM` (ver `docs/OPERACION.md`), permite recuperar la contraseña por correo.

```sh
npm start
```

`npm start` carga `.env`. En Windows, `INICIAR.cmd` instala dependencias si faltan, compila y llama al mismo comando de inicio. No introduzcas secretos en comandos compartidos ni publiques `.env`. La contraseña inicial crea al propietario únicamente cuando la base es nueva; cambiar la variable no cambia una cuenta existente. «Mi perfil» permite cambiar su contraseña indicando la actual.

Por defecto se abre `http://localhost:3000` y se conservan las bases en `SCORTA/data/`. `DATA_DIR` selecciona otro directorio persistente. El servidor compartido de producción necesita HTTPS y `SCORTA_PUBLIC_URL` con su origen definitivo. Cada equipo accede al mismo servidor; no debe ejecutar una base local independiente para compartir inventario.

## Producción en Render

Render pone HTTPS y el proxy; Docker y Caddy no se usan allí. Resumen (detalle en [docs/OPERACION.md](docs/OPERACION.md)):

1. *Web Service* con Node 24, **plan pago con disco persistente** montado, por ejemplo, en `/var/data`.
2. Variables: `NODE_ENV=production`, `HOST=0.0.0.0`, `DATA_DIR=/var/data`, `SCORTA_PUBLIC_URL`, las del propietario, `SCORTA_CLIENT_IP_HEADER` y las del respaldo (`SCORTA_BACKUP_KEY`, `SCORTA_S3_*`, `SCORTA_BACKUP_PING_URL`).
3. *Health Check Path* = `/healthz`.
4. Tras el primer arranque, borra `SCORTA_OWNER_PASSWORD` de Render ([docs/SECRETOS.md](docs/SECRETOS.md)).
5. Después de cada deploy: `npm run smoke -- https://<dominio>`.

La instalación propia con Docker Compose y Caddy está en el [anexo de OPERACION.md](docs/OPERACION.md#anexo-instalación-propia-docker-y-caddy). **`docker compose down -v` elimina los volúmenes con los datos.**

## Uso diario

- **Propietario:** crea empresas y sus cuentas, define contacto, mensualidad y contrato, registra pagos/renovaciones y atiende tickets. Puede entrar a una empresa como soporte dejando un motivo, con su identidad en auditoría.
- **Administrador:** administra productos, referencias/códigos, compras, existencias, ventas, devoluciones, taller, mecánicos, reportes y cierres. No crea cuentas ni modifica contratos.
- **Vendedor:** trabaja en Nueva venta, Inventario y Taller. Consulta existencias y sus propias ventas; no recibe compras, costos ni operaciones ajenas.

Las compras agregan unidades; las ventas y los repuestos del taller las descuentan al confirmar el cobro. Un carrito no reserva inventario. Una devolución parcial devuelve los artículos seleccionados; anular revierte lo pendiente, sin duplicar unidades previamente devueltas. Los ajustes registran cantidad y motivo. Las operaciones conservan usuario e historial.

En Nueva venta, el buscador «Nombre, referencia o código y Enter» agrega al carrito el primer producto con existencias que coincida; si hay varios, se elige en la lista de resultados. Inventario y las listas de ventas muestran 100 registros a la vez con «Mostrar más».

Nueva venta admite productos, mano de obra o ambos. El trabajo de taller se agrega al carrito con placa, descripción y mecánico activo; el servidor fija su nombre y porcentaje en ese momento. Los servicios y la venta están vinculados para evitar un cobro doble. Cliente y teléfono son opcionales para venta anónima; una venta con mano de obra requiere placa.

Inventario permite búsqueda y filtros; las fichas reúnen referencias, compatibilidad, existencias e historial. Las importaciones Excel/CSV requieren vista previa y validación antes de confirmar; comprueba correspondencias, unidades y precios. El documento se aplica completo o se rechaza sin cambios parciales.

## Venta pendiente, sesión y soporte

La venta pendiente se guarda por usuario y empresa en el servidor; la demo utiliza IndexedDB ficticio. Espera **«Venta pendiente guardada»** antes de cerrar. Si se pierde una respuesta de cobro, utiliza el reintento de esa misma operación; no registres otra venta para comprobarla. Los identificadores conservados evitan confirmar dos veces el mismo cobro.

Si otra pestaña cambia un borrador, se informa el conflicto: carga la copia guardada o revisa las diferencias antes de continuar. Los formularios administrativos aún sin confirmar no equivalen a una venta pendiente guardada. Los cambios de contrato o inventario concurrentes deben revisarse con los datos actualizados, sin sobrescribir silenciosamente lo que guardó otra persona.

La sesión de plataforma vence 30 días después del login (12 horas para el propietario; su modo soporte termina solo a las 2 horas) y se conserva al reiniciar navegador y servidor. El navegador de la instalación real conserva una cookie HttpOnly —Secure en producción—; contraseñas con hash y datos comerciales permanecen en el servidor. Cada solicitud comprueba nuevamente cuenta, permisos y contrato. Cambiar/restablecer contraseña, cerrar sesión, revocar una cuenta o restaurar un respaldo invalida los accesos correspondientes.

La vigencia incluye todo el día final de Colombia; el acceso se bloquea al día siguiente. Una renovación anticipada conserva los días pagados; una vencida propone un período desde la fecha de pago elegida. Una suspensión manual se conserva hasta retirarla expresamente. La URL `/c/codigo-de-empresa` preselecciona la empresa; no concede acceso.

Desde Perfil se crean y consultan tickets. El propietario los responde y cambia su estado; las lecturas y avisos son independientes por usuario. Las conversaciones de una empresa no son públicas. El soporte mantiene la identidad del propietario y el motivo de intervención.

Si el propietario cambia la empresa de soporte en otra pestaña, una pantalla anterior debe recargar la sesión antes de continuar. El servidor rechaza acciones enviadas con una empresa distinta a la que esa pantalla había confirmado; no las aplica silenciosamente a la empresa nueva.

## Reportes, importes y comprobantes

Resumen general permite consultar fechas, ventas netas, productos, mano de obra, rankings y utilidad. Los reportes usan costos históricos y, para mano de obra, el reparto fijado en cada venta. Un costo o porcentaje histórico ausente se indica como incompleto; no se supone cero para inventar una ganancia.

Los importes admiten hasta dos decimales y se muestran en COP con esa precisión cuando corresponde. Cobros, comprobantes, repartos y reportes comparten redondeo decimal. Dejar el costo de compra vacío significa «desconocido»; escribir cero significa costo conocido de cero. Cada compra actualiza el costo con promedio ponderado entre las unidades existentes y las compradas. Anular una compra recalcula el costo vigente desde sus fuentes verificables sin reescribir las ventas anteriores.

Las devoluciones corrigen el documento en su fecha original de venta. Cierre de caja concilia ventas netas de ese día por efectivo, transferencia y tarjeta con los valores registrados; no incluye saldo inicial, gastos o retiros ni reconstruye el día efectivo del movimiento de dinero de cada devolución. El cierre confirmado es inmutable y avisa si las ventas que lo sustentan cambian después.

El comprobante comercial admite impresión/PDF desde el navegador y HTML imprimible de 80/58 mm, con logo y datos del negocio. WhatsApp abre un enlace para envío manual; quien atiende confirma el mensaje. Omitir ese envío no revierte la venta. Los enlaces del servidor son opacos y vencen; se pueden renovar desde una venta autorizada. No se procesan pagos bancarios ni se emite facturación electrónica DIAN.

## Respaldo y restauración

La plataforma guarda empresas, cuentas, sesiones y operaciones en **`DATA_DIR/platform.sqlite`**. Si en `DATA_DIR` todavía existe la base del modo antiguo (`motoshop.sqlite`), la primera preparación de la plataforma la lee una sola vez, sin modificarla, y copia sus datos comerciales a «Almacén principal». Las cuentas anteriores no se migran: créalas desde el propietario. El modo antiguo ya no tiene rutas ni inicio de sesión propios (BE-38).

Para crear un respaldo completo y consistente:

```sh
node platform-backup.mjs save /ruta/data/platform.sqlite /ruta/respaldos
```

Además, el servidor hace solo:

- **Al arrancar** (cada deploy): una copia en `DATA_DIR/backups/startup-*.sqlite` (conserva las 5 últimas).
- **Cada hora:** una copia comprimida y **cifrada** con `SCORTA_BACKUP_KEY`, subida al bucket S3/R2 configurado (`SCORTA_S3_*`), con aviso a Healthchecks.io (`SCORTA_BACKUP_PING_URL`). Si falta alguna variable, este respaldo queda apagado y el log lo indica.

Para abrir un respaldo cifrado:

```sh
node platform-backup.mjs decrypt respaldo.sqlite.enc salida.sqlite   # usa SCORTA_BACKUP_KEY
```

Para restaurar con el servicio detenido (en Render: con `SCORTA_MAINTENANCE=1`, ver [docs/OPERACION.md](docs/OPERACION.md#5-restauración-paso-a-paso-en-render)):

```sh
node platform-backup.mjs restore /ruta/respaldo.sqlite /ruta/data/platform.sqlite --offline
```

La restauración valida el respaldo, conserva una copia anterior y elimina las sesiones y las ventas pendientes recuperadas. No restaures sobre una instancia en uso. Ensaya la recuperación y comprueba cuentas, empresas y operaciones antes de depender del sistema.

## Demo y marca

```sh
npm run build:demo
npm run preview:demo
```

Abre `http://127.0.0.1:4173`. Los accesos públicos de demostración son ficticios; IndexedDB conserva datos separados por navegador. Los enlaces de comprobantes de la demo funcionan donde existen esos datos, no en el navegador de un cliente externo. Las cuentas privadas de ensayo no forman parte de los accesos públicos de «Datos de prueba».

El logo original con transparencia está incorporado; ver [procedencia del archivo](src/assets/LEEME-LOGO.md). Los informes anteriores de revisión describen entregas históricas y no sustituyen el comportamiento o las comprobaciones actuales.

## Comprobaciones y CI

```sh
npm ci
npm audit --audit-level=moderate
npm test
npm run build
npm run build:demo
```

La [configuración de GitHub Actions](../.github/workflows/scorta-ci.yml) ejecuta estos comandos desde `SCORTA` con Node.js 24 y las suites actuales de aplicación (`npm run test:ui`) y demo (`npm run test:demo:ui`). El runner instala Chromium, prueba escritorio/móvil y conserva diagnósticos de fallos. El workflow no despliega.

La prueba de la credencial privada JE se omite explícitamente cuando no existe `SCORTA_JE_TEST_PASSWORD`; CI no recibe esa contraseña. El resto de los casos utiliza datos ficticios. Compilaciones, pruebas Node y listado de casos Playwright no acreditan por sí solos una ejecución de navegador; CI tampoco sustituye dispositivos físicos, impresión real, lectores ni piloto con el almacén.

ExcelJS se conserva en 4.4.0; su dependencia `uuid` se fija mediante override en 11.1.1, compatible con su uso CommonJS de `v4`. `fflate` se fija en 0.8.3 para validar ZIP sin incorporar el aviso conocido de ZIP64 de 0.8.2. La auditoría npm debe repetirse: ausencia de avisos conocidos no equivale a garantía de seguridad y las advertencias de deprecación transitiva son una categoría distinta.

Contrato técnico: [PLATFORM-API.md](docs/PLATFORM-API.md). Seguridad: [seguridad.md](docs/seguridad.md). Licencias: [LICENCIAS.md](docs/LICENCIAS.md). La recuperación por correo funciona solo con un proveedor configurado (Resend o webhook). WhatsApp automático, firma/aceptación legal real y facturación electrónica continúan sin conectar. Las pantallas de vista previa no realizan esas operaciones. El plan pago de Render con disco, el primer ensayo de restauración y la aceptación del almacén siguen pendientes (ver `PENDIENTES-SCORTA.md` en la raíz).
