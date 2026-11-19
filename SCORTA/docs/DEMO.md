# Demo multiempresa de SCORTA

Actualización: 19 de noviembre de 2026 (UTC).

Esta demo utiliza la interfaz nueva y el mismo motor de plataforma que el servidor. Incluye dos empresas ficticias: **Moto Norte**, con 24 productos y operaciones de ejemplo, y **Moto Sur**, con un catálogo pequeño separado. Hay productos disponibles, con pocas unidades y agotados, además de ventas y servicios de taller. Los importes están expresados en COP.

La dirección privada existente es [https://fragola-scorta-demo.safeturnip2.chatgpt.site](https://fragola-scorta-demo.safeturnip2.chatgpt.site). **La publicación de la nueva versión multiempresa de esta entrega está pendiente de confirmación.** La versión anterior publicada y sus pruebas históricas no constituyen una validación de esta actualización.

## Abrir una copia local

Con Node.js 24, desde `SCORTA/`:

```sh
npm ci
npm run build:demo
npm run preview:demo
```

Abrir `http://127.0.0.1:4173` y mantener el comando activo mientras se utiliza la demo. La compilación estática queda en `dist-demo/index.html` y sus recursos; no debe abrirse el HTML directamente como archivo.

## Accesos de prueba

La franja **Demo · Datos ficticios** ofrece **Propietario**, **Administrador** y **Vendedor**. La sección **Datos de prueba** muestra empresa, usuario y contraseña de cada cuenta ficticia para probar también el login manual.

Estas contraseñas son públicas y exclusivas de la demostración. No son la contraseña privada solicitada por el propietario ni deben reutilizarse en una instalación real. El servidor real crea su primer propietario desde `SCORTA_OWNER_COMPANY`, `SCORTA_OWNER_USER` y una `SCORTA_OWNER_PASSWORD` privada de 16–200 caracteres; consultar [LEEME.md](../LEEME.md).

## Recorridos sugeridos

1. **Propietario:** consultar las tarjetas, abrir una empresa, revisar contacto/contrato/usuarios, crear un vendedor o un segundo administrador y probar una renovación. La suspensión manual se mantiene después de registrar un pago.
2. **Vendedor:** abre directamente Nueva venta. Agregar productos desde búsqueda o Inventario, cambiar de pestaña y comprobar que se conserva el carrito. Consultar sus propias ventas desde Nueva venta.
3. **Mano de obra:** registrar placa, trabajo, mecánico e importe; completar una venta sólo de servicio y otra con repuestos. El único dato de moto es la placa y sólo los repuestos descuentan existencias.
4. **Cliente y placa:** registrar nombre/teléfono del cliente en campos separados y consultar frecuencia, cobros e historial por cliente o moto. Las anulaciones y devoluciones se reflejan en los netos.
5. **Administrador:** consultar Taller y su venta vinculada, ingresar mercancía, crear/editar un producto con foto y ajustar existencias con motivo. Autorizar una devolución desde la venta original.
6. **Soporte:** desde el propietario ingresar con un motivo a la empresa y realizar un ajuste. El administrador de esa empresa puede ver la atribución de Soporte en Movimientos.
7. **Comprobante:** descargarlo o usar Imprimir/PDF. El envío por WhatsApp es opcional; abre un mensaje para que el vendedor lo confirme. Cancelar u omitir el envío no revierte la venta guardada.
8. **Persistencia y reinicio:** recargar conserva los datos de prueba. Reiniciar demo requiere confirmación y restaura los datos ficticios iniciales. Los cambios de perfil deben resolverse después de guardar o descartar el trabajo en curso.

## Almacenamiento y límites de la demo

- IndexedDB guarda los datos en este navegador y perfil. Otro navegador o equipo tiene otra copia: la demo no es una instalación compartida del almacén.
- Borrar los datos del sitio elimina las pruebas realizadas. El reinicio sólo afecta a la base de esta demo y cierra las sesiones de prueba anteriores.
- Exportar datos ficticios produce JSON sin contraseñas, hashes, sesiones ni tokens privados. No es el respaldo SQLite de producción.
- Los comprobantes de la demo usan enlaces con fragmento (`#/receipt/...`) y se resuelven desde el almacenamiento local. **Un cliente que abra ese enlace en otro equipo no tendrá el comprobante.** El servidor real utiliza un enlace con token opaco, atendido desde su base central y con vencimiento.
- Las imágenes de producto pueden cargarse con los formatos y límite indicados por la aplicación. No introducir información, contraseñas ni inventario reales en la demostración.
- El envío prepara WhatsApp para confirmación humana; no es mensajería automática por WhatsApp Business ni facturación electrónica DIAN.

## Verificación

```sh
npm test
npm run build
npm run build:demo
```

La demo tiene pruebas Node con el motor compartido, IndexedDB simulado, persistencia, concurrencia, aislamiento, sesiones, reinicio y exportación sin secretos. Los resultados finales de esta iteración se registran en [QA-PLATAFORMA.md](QA-PLATAFORMA.md).

No se ha ejecutado una revisión visual de esta interfaz en la sesión actual: el entorno administrado de Sites no dispone de la herramienta de navegador requerida. Los antiguos comandos y escenarios en `browser-demo-checks/` corresponden a la demo anterior. Quedan pendientes la revisión conjunta de la nueva demo, los recorridos de navegador y la comprobación con celulares y equipos físicos.
