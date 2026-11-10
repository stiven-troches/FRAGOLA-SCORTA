# SCORTA — inventario, ventas y taller

## Probar en este computador

Instala Node.js 24. Ejecuta `npm ci`, `npm run build` y `npm start`, o abre `INICIAR.cmd`. Entra a http://localhost:3000. La copia local sin usuarios permite acceso de administrador en el propio equipo: úsala solo para pruebas. Los datos están en `data/motoshop.sqlite`.

## Preparar acceso por internet

Se requiere un servidor Linux con Docker Compose y un dominio apuntando a su IP. Esta versión aún no está desplegada ni se ha validado en una instalación real.

1. Copia `.env.example` a `.env`; define `DOMAIN` y `SCORTA_ADMIN_PASSWORD`, con al menos 16 caracteres. Conserva esta contraseña de forma segura; el usuario inicial es `admin`.
2. Ejecuta `docker compose up -d --build` y abre el dominio con HTTPS. Caddy necesita acceso a los puertos 80 y 443 para emitir el certificado. Mantén el volumen `inventory`; no ejecutes `docker compose down -v` porque elimina los datos.
3. En Usuarios, crea cuentas de administrador u operador. El operador puede registrar ventas y servicios y avanzar estados; el administrador gestiona el resto. Se registra el usuario de operaciones nuevas. Cierra el navegador para cambiar de usuario si la sesión HTTP sigue recordada.

El acceso emplea autenticación HTTP Basic y debe utilizarse únicamente mediante HTTPS en internet. La contraseña inicial solo se usa para crear la primera cuenta: cambiar la variable después no modifica esa cuenta. Las cuentas todavía no tienen interfaz de desactivación, recuperación o cambio de contraseña. No publiques el archivo `.env`.

## Inventario y operaciones

La importación CSV acepta hasta 1000 filas, con encabezados `nombre,precio_venta,precio_compra,stock,stock_minimo,categoria,referencia,marca,modelo,compatibilidad,codigo_barras`. Nombre y precio de venta son obligatorios. Usa valores numéricos sin separador de miles; las cantidades deben ser enteras. Una referencia o nombre duplicado rechaza toda la importación. El código de barras se puede escribir o introducir mediante un lector que actúe como teclado; no hay cámara integrada.

Las compras aumentan existencias. Ventas y servicios las descuentan al guardar. Una devolución parcial de venta devuelve las cantidades seleccionadas; la anulación revierte las cantidades que todavía no se hayan devuelto. Una compra no puede anularse si faltan existencias para revertirla. Los productos con historial no se pueden retirar. Las anulaciones y devoluciones registran motivo y usuario. No se registran movimientos de dinero ni se emiten notas crédito electrónicas.

La fecha de entrega se registra al pasar un servicio a entregado. Los servicios entregados antes de esta actualización no tienen esa fecha y no se contabilizan en el indicador mensual. Los importes de ventas descuentan devoluciones del documento original dentro del mes original, no representan recaudo de caja ni contabilidad.

## Respaldo

Descarga periódicamente el respaldo JSON y guárdalo fuera del servidor. Para restaurar, detén el servicio y ejecuta `node restore.mjs archivo.json` con `DATA_DIR` apuntando al directorio de la base. La recuperación crea copia del SQLite anterior. El JSON contiene inventario y operaciones, pero **no contiene las cuentas de usuario ni los identificadores de reintento**, por lo que debe respaldarse además el volumen completo con SQLite detenido. Prueba la restauración en una instalación aislada antes de depender del sistema.

## Validación y límites

`npm test` comprueba inventario, importación atómica, reintentos repetidos, devoluciones y permisos del servidor; `npm run build` verifica la compilación. Se comprobó en navegador de escritorio la creación de un producto. Falta validar el proceso completo con el equipo del almacén, navegadores móviles, lectores de pantalla, restauración en servidor y acceso simultáneo a través de la infraestructura definitiva. La reanudación de un reintento pendiente solo se mantiene mientras el formulario y la página permanecen abiertos. El flujo actual no incluye facturación electrónica, caja ni integración DIAN.
