# FRAGOLA SCORTA

Aplicación multiempresa para almacenes de accesorios y repuestos de moto: inventario, compras, ventas, taller, clientes, reportes y cierres por medio de pago. El propietario administra empresas y contratos; cada empresa tiene administradores y vendedores con permisos propios.

**El proyecto está en [`SCORTA/`](SCORTA/).** Ejecuta los comandos desde `SCORTA`, como hace la integración continua. PRENOTA vive en su propio repositorio (`FRAGOLA-PRENOTA`).

## Instalar el servidor

Requiere Node.js 24:

```sh
cd SCORTA
npm ci
npm run build
```

Copia `.env.example` a `.env` y configura el propietario según [SCORTA/LEEME.md](SCORTA/LEEME.md). La contraseña inicial debe tener entre 8 y 200 caracteres, con número, mayúscula, minúscula y símbolo. No guardes contraseñas en GitHub. Después ejecuta:

```sh
npm start
```

`npm start` carga `.env`; `SCORTA/INICIAR.cmd` usa el mismo comando en Windows. La instalación compartida conserva los datos comerciales en SQLite del servidor y admite varios equipos por empresa. En producción requiere HTTPS y `SCORTA_PUBLIC_URL` con el origen definitivo. La sesión de plataforma dura hasta 30 días (12 horas para el propietario) y se conserva al reiniciar el servidor; cada petición verifica de nuevo cuenta, permisos y contrato.

La [guía de instalación](SCORTA/LEEME.md) resume la puesta en Render, la migración de datos anteriores y el respaldo/restauración de `platform.sqlite`. La operación en Render (variables, respaldo cifrado cada hora, restauración, incidentes y monitoreo) está en [OPERACION.md](SCORTA/docs/OPERACION.md); el índice de toda la documentación, en [SCORTA/docs/README.md](SCORTA/docs/README.md).

Los documentos comerciales y legales del dueño (borradores para el abogado, guion de venta, alta de clientes, preguntas frecuentes) están en `NEGOCIO/`, fuera de `SCORTA/`.

## Demo con datos ficticios

```sh
cd SCORTA
npm ci
npm run build:demo
npm run preview:demo
```

Abre `http://127.0.0.1:4173`. La demo usa IndexedDB del navegador y cuentas públicas de prueba para propietario, administrador y vendedor. Otro equipo o navegador tiene su propia copia. Los enlaces de comprobantes de la demo funcionan donde existen esos datos; la instalación de servidor permite compartir el enlace con el cliente.

La [demo publicada](https://fragola-scorta-demo.safeturnip2.chatgpt.site) y su procedencia se documentan en [DEMO.md](SCORTA/docs/DEMO.md). Un cambio local o un control de CI aprobado no publica automáticamente esa demo ni despliega un servidor.

El logo original está incorporado en `SCORTA/src/assets/`; su procedencia se documenta en [LEEME-LOGO.md](SCORTA/src/assets/LEEME-LOGO.md).

## Comprobaciones

```sh
cd SCORTA
npm ci
npm audit --audit-level=moderate
npm test
npm run build
npm run build:demo
```

La [integración continua](.github/workflows/scorta-ci.yml) ejecuta estas comprobaciones en Node.js 24 y las suites Playwright actuales de aplicación y demo, con Chromium de escritorio y móvil. Instala el navegador en el runner de GitHub y conserva trazas y capturas si falla. No despliega ni recibe la credencial privada de JE: esa prueba se omite expresamente cuando falta `SCORTA_JE_TEST_PASSWORD`. Las demás pruebas utilizan datos ficticios.

Consulta el contrato actual en [PLATFORM-API.md](SCORTA/docs/PLATFORM-API.md). Los informes históricos de QA describen sus respectivas revisiones; sus conteos no sustituyen una ejecución del código actual. CI tampoco acredita pruebas en dispositivos físicos ni un piloto con el personal del almacén.

## Límites de la entrega

SCORTA registra operaciones, medios de pago y cierres; no procesa pagos bancarios ni sustituye contabilidad o facturación electrónica DIAN. El comprobante puede imprimirse o compartirse mediante un enlace; el envío manual abre WhatsApp y requiere confirmación de quien lo utiliza.

Los avisos automáticos por WhatsApp, la recuperación automática por correo y la aceptación contractual continúan como vistas previas: no envían mensajes ni registran firmas o aceptaciones reales. El uso operativo requiere alojamiento definitivo, HTTPS, respaldos externos probados, inventario conciliado y piloto con el almacén.

No subas `.env`, `SCORTA/data/`, bases SQLite, respaldos ni credenciales privadas al repositorio.
