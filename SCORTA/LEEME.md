# SCORTA — empresas, inventario, ventas y taller

La aplicación está en esta carpeta. Requiere Node.js 24. La interfaz nueva utiliza `/api/v2/` y separa propietario, administradores y vendedores de cada empresa.

## Demostración

La demo publicada utiliza datos ficticios guardados en el navegador. Sus botones permiten probar los tres perfiles. Las contraseñas visibles en «Datos de prueba» pertenecen exclusivamente a esa demostración. No son credenciales de una instalación real.

Para compilar y abrir una copia de la demo:

```sh
npm ci
npm run build:demo
npm run preview:demo
```

Abrir `http://127.0.0.1:4173`. El enlace al comprobante de la demo solo funciona en el navegador donde existen sus datos; una instalación real sirve sus comprobantes desde el servidor.

## Instalación Node

Instalar dependencias y compilar:

```sh
npm ci
npm run build
```

Copiar `.env.example` a `.env` y completar `SCORTA_OWNER_COMPANY`, `SCORTA_OWNER_USER`, `SCORTA_OWNER_NAME`, `SCORTA_OWNER_PASSWORD` y opcionalmente `SCORTA_OWNER_CONTACT`. `npm start` carga ese archivo privado; también se pueden configurar las variables en el entorno del proceso. La contraseña debe tener entre 16 y 200 caracteres. No escribirla en comandos compartidos, código ni GitHub. `SCORTA_PUBLIC_URL` debe contener el origen HTTPS definitivo en producción. `DATA_DIR` indica el directorio persistente.

Después ejecutar `npm start`. Desde el ingreso, utilizar la empresa y usuario configurados. La credencial inicial solo crea al propietario en una base nueva: cambiar la variable no reemplaza su contraseña existente. «Mi perfil» permite cambiarla indicando la actual.

## Instalación con Docker y HTTPS

1. Copiar `.env.example` a `.env`, completar `DOMAIN` y la contraseña privada del propietario; agregar un contacto real de soporte. No publicar `.env`.
2. Apuntar el dominio al servidor y permitir los puertos 80 y 443.
3. Ejecutar `docker compose up -d --build`. Caddy emite el certificado HTTPS.
4. Comprobar persistencia, cuentas y recuperación antes de usar datos reales. Conservar el volumen `inventory`; `docker compose down -v` borraría la información.

## Propietario y empresas

El propietario crea empresas, define contacto/correo/WhatsApp/logo, vigencia y mensualidad, y crea las cuentas de sus administradores y vendedores. Las URLs `/c/codigo-de-empresa` preseleccionan la empresa en el ingreso y no conceden acceso por sí mismas. Solo el propietario administra cuentas y roles.

La vigencia incluye todo el día final en Colombia. El servidor impide operar antes del inicio, después del vencimiento y durante una suspensión manual. Registrar un pago permite confirmar la nueva fecha: una renovación anticipada conserva los días pagados y una vencida propone comenzar hoy. La suspensión manual se mantiene hasta retirarla expresamente.

El propietario puede acceder como soporte dejando motivo; los cambios se identifican con su identidad y «Soporte» en el historial del cliente. No se revelan contraseñas. Restablecer o cambiar una contraseña revoca las sesiones anteriores.

## Vendedor y administrador de empresa

El vendedor abre Nueva venta y puede consultar Inventario, agregar productos al carrito y consultar sus propias ventas. No accede a costos, compras ni ventas ajenas. El administrador gestiona todos los módulos de su empresa, sin crear usuarios o cambiar roles.

Nueva venta admite productos, solo mano de obra o ambos. La mano de obra registra placa, trabajo, mecánico e importe editable. Cliente y teléfono son campos distintos; de la moto solo se registra la placa. El carrito conserva los datos al navegar y las existencias se descuentan únicamente al guardar. La venta y el trabajo de taller se vinculan para evitar un cobro duplicado. Los historiales por cliente y placa descuentan devoluciones y excluyen anulaciones.

Los medios de pago son efectivo, transferencia y tarjeta; se registra el método, sin procesar pagos bancarios. El comprobante se puede imprimir o guardar en PDF. El envío opcional abre WhatsApp con el número y el enlace; el vendedor confirma el envío. Omitirlo o cancelarlo no revierte la venta. Los enlaces reales del comprobante son opacos y vencen. No es facturación electrónica DIAN.

Las fotos de producto y logos permiten archivos PNG/JPEG/WebP/GIF hasta 500 KB. Los vendedores solo consultan las fotos. Los filtros permanecen plegados para mantener la pantalla simple.

## Datos existentes y respaldo

La base de plataforma se almacena en `DATA_DIR`, separada de la base anterior `motoshop.sqlite`. La preparación de la plataforma conserva la base anterior y copia sus datos comerciales a «Almacén principal». Las cuentas anteriores deben recrearse o restablecerse desde el propietario; no se convierte su contraseña a texto ni se mezclan algoritmos de contraseñas.

Para respaldar la base de plataforma completa:

```sh
node platform-backup.mjs save /ruta/data/platform.sqlite /ruta/respaldos
```

Para restaurar, detener primero el servidor y ejecutar:

```sh
node platform-backup.mjs restore /ruta/respaldo.sqlite /ruta/data/platform.sqlite --offline
```

La restauración conserva una copia anterior y elimina las sesiones del respaldo. El comando se niega a restaurar mientras la instancia esté abierta. Consultar [la guía de plataforma](docs/PLATFORM-API.md). Los comandos antiguos `backup.mjs` y `restore.mjs` siguen correspondiendo a la base anterior: no deben usarse para afirmar un respaldo de todas las nuevas empresas. Programar una copia externa y ensayar la restauración en una instalación aislada antes del uso real.

## Validación

```sh
npm test
npm run build
npm run build:demo
```

Las pruebas usan datos temporales. La revisión visual y en dispositivos físicos se documenta por separado; una compilación correcta no la sustituye. Los antiguos recorridos de interfaz bajo `browser-checks/` corresponden a la interfaz anterior y no acreditan la nueva plataforma. Ver [QA-PLATAFORMA.md](docs/QA-PLATAFORMA.md).

El despliegue definitivo, dominio, HTTPS, copia externa, inventario inicial conciliado y piloto con el personal continúan en [PENDIENTES.md](docs/PENDIENTES.md). Los borradores no se recuperan automáticamente después de cerrar o recargar la página.
