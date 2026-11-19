# FRAGOLA SCORTA

Aplicación multiempresa de inventario, ventas y taller para almacenes de accesorios y repuestos de moto. Incluye un panel del propietario del software, administradores por empresa y vendedores con acceso limitado. La revisión 2 organiza el vendedor en Nueva venta, Inventario y Taller, y utiliza una paleta blanca, negra y amarilla.

El proyecto trabajado está en **[`SCORTA/`](SCORTA/)**. Los archivos de PRENOTA que permanecen en la raíz pertenecen a otro proyecto.

## Instalar la aplicación de servidor

Con Node.js 24:

```sh
cd SCORTA
npm ci
npm run build
```

Antes de `npm start`, configura las variables del propietario y una contraseña privada de entre 16 y 200 caracteres como explica [LEEME.md](SCORTA/LEEME.md). La credencial no se incluye en GitHub. La versión real utiliza SQLite en el servidor y comparte los datos de cada empresa entre sus equipos, respetando los permisos. La sesión dura hasta 30 días y se conserva al reiniciar el navegador y el servidor; el navegador real conserva únicamente una cookie de sesión segura, no la contraseña ni el inventario.

La guía incluye instalación con Docker/HTTPS, migración del inventario anterior y respaldo de la nueva base de plataforma. Las cuentas anteriores deben recrearse o restablecerse desde el propietario.

## Demo multiempresa con datos ficticios

```sh
cd SCORTA
npm ci
npm run build:demo
npm run preview:demo
```

Abre `http://127.0.0.1:4173`. La demo contiene dos empresas de ejemplo, un catálogo principal de 24 productos y accesos de propietario, administrador y vendedor. Sus botones y la sección **Datos de prueba** utilizan cuentas y contraseñas públicas exclusivamente ficticias.

Los datos se conservan en IndexedDB del navegador actual y se pueden reiniciar. Otro equipo o navegador tiene su propia copia. Los enlaces de comprobantes de esta demo sólo funcionan donde existen esos datos; el servidor real sí permite compartir el comprobante con el cliente por su enlace.

La dirección privada existente es [https://fragola-scorta-demo.safeturnip2.chatgpt.site](https://fragola-scorta-demo.safeturnip2.chatgpt.site). La primera entrega multiempresa fue publicada y confirmada. **Publicación de revisión 2 pendiente de confirmación.** Véase [DEMO.md](SCORTA/docs/DEMO.md).

## Validación y entrega

```sh
cd SCORTA
npm test
npm run build
npm run build:demo
```

La verificación inicial multiempresa se registra en [QA-PLATAFORMA.md](SCORTA/docs/QA-PLATAFORMA.md). La comprobación de esta revisión y su conteo final se registran en [QA-REVISION2.md](SCORTA/docs/QA-REVISION2.md); la ejecución final de revisión 2 aprobó **86/86 pruebas**, además de ambas compilaciones; las 72 pruebas históricas no son el conteo de la nueva ejecución. La ejecución visual en navegador y los dispositivos físicos siguen pendientes. Los recorridos y capturas de la interfaz anterior no acreditan la plataforma nueva.

Consulta la [entrega de revisión 2](SCORTA/docs/ENTREGA-REVISION2.md), la [entrega anterior](SCORTA/docs/ENTREGA.md), la [API de plataforma](SCORTA/docs/PLATFORM-API.md) y el [estado de los 32 ajustes](SCORTA/docs/PENDIENTES.md). El uso real todavía requiere alojamiento definitivo, HTTPS, cuentas privadas, respaldo externo probado, inventario real conciliado y piloto con el almacén.

No deben añadirse al repositorio `SCORTA/data/`, `.env` ni credenciales privadas. SCORTA genera comprobantes comerciales; no incluye caja, contabilidad, pasarela bancaria ni facturación electrónica DIAN.

## Alcance pendiente de conexión y marca

Los avisos automáticos por WhatsApp, la recuperación por correo y los documentos legales tienen pantallas de vista previa: no envían mensajes, no restablecen contraseñas mediante correo y no registran firmas o aceptaciones legales reales. La conexión de esos servicios y la revisión jurídica permanecen aplazadas. El envío manual opcional del comprobante por WhatsApp sí conserva el flujo existente.

El archivo original del logo oficial todavía no está disponible en el entorno; no se ha redibujado ni se afirma que esté incorporado. Mientras se recibe, Brand.jsx muestra el nombre SCORTA como identificación neutra. Véase [la indicación del archivo original](SCORTA/src/assets/LEEME-LOGO.md).
