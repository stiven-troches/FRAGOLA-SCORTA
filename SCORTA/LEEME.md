# SCORTA — inventario, ventas y taller

## Probar en este computador

Instala Node.js 24. Ejecuta `npm ci`, `npm run build` y `npm start`, o abre `INICIAR.cmd`. Entra a http://localhost:3000. La copia local sin usuarios permite acceso de administrador en el propio equipo: úsala solo para pruebas. Los datos están en `data/motoshop.sqlite`.

## Preparar acceso por internet

Se requiere un servidor Linux con Docker Compose y un dominio apuntando a su IP. Esta versión aún no está desplegada ni se ha validado en una instalación real.

1. Copia `.env.example` a `.env`; define `DOMAIN` y `SCORTA_ADMIN_PASSWORD`, con al menos 16 caracteres. Conserva esta contraseña de forma segura; el usuario inicial es `admin`.
2. Ejecuta `docker compose up -d --build` y abre el dominio con HTTPS. Caddy necesita acceso a los puertos 80 y 443 para emitir el certificado. Mantén el volumen `inventory`; no ejecutes `docker compose down -v` porque elimina los datos.
3. En Usuarios, crea cuentas de administrador u operador. El operador puede registrar ventas y servicios y avanzar estados; el administrador gestiona el resto. Se registra el usuario de operaciones nuevas. Usa «Cerrar sesión» para cambiar de usuario.

El acceso utiliza una pantalla de inicio de sesión y una cookie HttpOnly con SameSite Strict; en producción la cookie exige HTTPS. La sesión dura hasta ocho horas y se cierra al reiniciar el servidor. Puedes cambiar tu contraseña indicando la actual; el cambio cierra todas tus sesiones y exige volver a entrar. La contraseña inicial solo crea la primera cuenta: cambiar la variable después no modifica esa cuenta. Todavía no hay recuperación de contraseña ni desactivación de usuarios. No publiques el archivo `.env`. El acceso local sin cuentas solo se permite en desarrollo y desde el propio equipo.

## Inventario y operaciones

La importación CSV acepta hasta 1000 filas, con encabezados `nombre,precio_venta,precio_compra,stock,stock_minimo,categoria,referencia,marca,modelo,compatibilidad,codigo_barras`. Nombre y precio de venta son obligatorios. Usa valores numéricos sin separador de miles; las cantidades deben ser enteras. Una referencia o nombre duplicado rechaza toda la importación. El código de barras se puede escribir o introducir mediante un lector que actúe como teclado; no hay cámara integrada.

Las compras aumentan existencias. Ventas y servicios las descuentan al guardar. Una devolución parcial de venta devuelve las cantidades seleccionadas; la anulación revierte las cantidades que todavía no se hayan devuelto. Una compra no puede anularse si faltan existencias para revertirla. Los productos con historial no se pueden retirar. Las anulaciones y devoluciones registran motivo y usuario. No se registran movimientos de dinero ni se emiten notas crédito electrónicas.

La fecha de entrega se registra al pasar un servicio a entregado. Los servicios entregados antes de esta actualización no tienen esa fecha y no se contabilizan en el indicador mensual. Los importes de ventas descuentan devoluciones del documento original dentro del mes original, no representan recaudo de caja ni contabilidad.

## Respaldo

El administrador puede **descargar el respaldo completo SQLite**. Incluye inventario, compras, ventas, servicios, auditoría, cuentas de usuario y claves de reintento. Se obtiene una copia consistente mediante la API de respaldo de SQLite, incluso con la aplicación abierta. Los archivos contienen datos privados y hashes de contraseñas: guárdalos con acceso restringido y una copia fuera del servidor.

Para automatizarlo en una instalación Node:

```sh
DATA_DIR=/srv/scorta/data node /srv/scorta/backup.mjs /srv/scorta/backups --keep 30
```

El comando conserva las últimas 30 copias generadas por él; no elimina archivos manuales y no aplica retención si falla el nuevo respaldo. Con una ejecución diaria, esto equivale aproximadamente a 30 días. Consulta [operación y recuperación](docs/OPERACION.md) para cron, Docker y el ensayo de restauración.

Para recuperar, **detén SCORTA** y ejecuta:

```sh
DATA_DIR=/srv/scorta/data node /srv/scorta/restore.mjs /ruta/respaldo.sqlite --offline
```

La recuperación valida integridad y estructura antes de reemplazar la base, conserva una copia anterior `.bak` y rechaza la presencia de WAL/SHM. `--offline` confirma que has detenido el servicio; no detiene procesos por ti. Nunca borres un WAL para forzar la recuperación. Después inicia SCORTA y verifica acceso, existencias e historial.

Los respaldos antiguos JSON siguen admitidos con el mismo comando y son **parciales**: recuperan datos del negocio, no cuentas ni identificadores de reintento. Si ya existen usuarios, se conservan; las claves de reintento antiguas se eliminan para no confundir operaciones previas con la información recuperada. En una base nueva se deberán configurar las cuentas otra vez. Para recuperación completa utiliza SQLite.

## Validación y límites

Desde la carpeta `SCORTA`, ejecuta:

```sh
npm test
npm run build
npx playwright install chromium
npm run test:ui
```

Si tienes Chromium instalado en el sistema, puedes utilizar `CHROMIUM_PATH=/usr/bin/chromium npm run test:ui` en lugar de descargar otro navegador. Las pruebas de interfaz arrancan un servidor y una base temporales; no utilizan el inventario del almacén.

`npm test` comprueba inventario, importación atómica, reintentos, devoluciones, sesiones, permisos, consultas y primera cuenta administradora. Las pruebas de respaldo verifican copia con WAL abierto, restauración aislada, preservación de cuentas y claves de reintento, rechazo de recuperación con base abierta y retención. Las pruebas de interfaz recorren ventas, inventario, taller y acceso en escritorio y en una pantalla de 390 px. Consulta los resultados y capturas en [la entrega](docs/ENTREGA.md).

Falta validar el proceso completo con el equipo del almacén, celulares físicos, lectores de pantalla y la infraestructura definitiva. Los borradores y reintentos no sobreviven a una recarga o cierre de la página. El flujo actual no incluye facturación electrónica, caja ni integración DIAN.
