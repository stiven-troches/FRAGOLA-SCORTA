# Demo multiempresa de SCORTA

Actualización: 19 de noviembre de 2026 (America/Bogota).

Esta demo utiliza la interfaz nueva y el mismo motor de plataforma que el servidor. Incluye **Moto Norte**, con 24 productos y operaciones de ejemplo, **Moto Sur**, con un catálogo pequeño separado, y **JE Accesorios y Repuestos**, preparada para las pruebas del primer cliente con inventario vacío. Hay productos disponibles, con pocas unidades y agotados, además de ventas y servicios de taller. Los importes están expresados en COP.

La dirección privada existente es [https://fragola-scorta-demo.safeturnip2.chatgpt.site](https://fragola-scorta-demo.safeturnip2.chatgpt.site). La primera versión multiempresa fue publicada y confirmada. **Revisión 2 publicada y confirmada por Sites el 19 de noviembre de 2026.** La versión anterior publicada y sus pruebas históricas no constituyen una validación de esta actualización.

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

Estas contraseñas son públicas y exclusivas de la demostración. No son la contraseña privada solicitada por el propietario ni deben reutilizarse en una instalación real. El servidor real crea su primer propietario desde `SCORTA_OWNER_COMPANY`, `SCORTA_OWNER_USER` y una `SCORTA_OWNER_PASSWORD` privada de 8–200 caracteres, con número, mayúscula, minúscula y símbolo; consultar [LEEME.md](../LEEME.md).

## Recorridos sugeridos

1. **Propietario:** consultar las tarjetas, abrir una empresa, revisar contacto/contrato/usuarios, crear un vendedor o un segundo administrador y probar una renovación. La suspensión manual se mantiene después de registrar un pago.
2. **Vendedor:** abre directamente Nueva venta, dedicada al resumen y cobro. Ir a Inventario para buscar por palabras clave o categorías y agregar productos; pasar a Taller para agregar servicios; volver a Nueva venta y comprobar que se conserva el carrito. Consultar sus propias ventas desde Nueva venta.
3. **Mano de obra:** desde Taller registrar placa, trabajo, mecánico e importe; completar una venta sólo de servicio y otra con repuestos. El único dato de moto es la placa y sólo los repuestos descuentan existencias.
4. **Cliente y placa:** registrar nombre/teléfono del cliente en campos separados y consultar frecuencia, cobros e historial por cliente o moto. Las anulaciones y devoluciones se reflejan en los netos.
5. **Administrador:** consultar Taller y su venta vinculada, ingresar mercancía, crear/editar un producto con foto y ajustar existencias con motivo. Autorizar una devolución desde la venta original.
6. **Soporte:** desde el propietario ingresar con un motivo a la empresa y realizar un ajuste. El administrador de esa empresa puede ver la atribución de Soporte en Movimientos.
7. **Comprobante:** descargarlo o usar Imprimir/PDF. El envío por WhatsApp es opcional; abre un mensaje para que el vendedor lo confirme. Cancelar u omitir el envío no revierte la venta guardada.
8. **Persistencia y reinicio:** recargar conserva los datos de prueba y el token opaco permite retomar una sesión autorizada durante un máximo de 30 días desde el login. Reiniciar demo requiere confirmación y restaura los datos ficticios iniciales. Los cambios de perfil deben resolverse después de guardar o descartar el trabajo en curso.

9. **Pagos y avisos:** abrir Pagos y renovaciones. El botón de registrar pago aparece una sola vez. Revisar las vistas previas de recordatorio/confirmación; no se envían mensajes automáticos reales.
10. **Recuperación y legales:** abrir ¿Olvidaste tu contraseña? y Términos y privacidad desde el login/perfil. Los flujos indican que son vistas previas: no envían correos, no cambian contraseñas por correo y no registran firmas.
11. **Marca:** comprobar la paleta blanca, negra y amarilla. El PNG oficial FRAGOLA SCORTA se conserva en login y propietario. En las empresas predominan su logo/nombre y SCORTA queda como texto discreto.

## Almacenamiento y límites de la demo

- IndexedDB guarda los datos en este navegador y perfil. Otro navegador o equipo tiene otra copia: la demo no es una instalación compartida del almacén.
- localStorage recuerda únicamente un token opaco de sesión de prueba; no guarda su contraseña. La sesión expira a los 30 días desde el login y siguen aplicándose bloqueos y vigencia. El inventario ficticio permanece separado en IndexedDB.
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

La demo tiene pruebas Node con el motor compartido, IndexedDB simulado, persistencia, concurrencia, aislamiento, sesiones, reinicio y exportación sin secretos. La ejecución final aprobó **86/86 pruebas** y ambas compilaciones. Los comandos y límites se registran en [QA-REVISION2.md](QA-REVISION2.md). La entrega previa está documentada en [QA-PLATAFORMA.md](QA-PLATAFORMA.md).

No se ha ejecutado una revisión visual de esta interfaz en la sesión actual: el entorno administrado de Sites no dispone de la herramienta de navegador requerida. Los antiguos comandos y escenarios en `browser-demo-checks/` corresponden a la demo anterior. Quedan pendientes la revisión conjunta de la nueva demo, los recorridos de navegador y la comprobación con celulares y equipos físicos.

## Revisión 4

Logo oficial original con transparencia. El carrito comparte cantidades e importe entre Inventario, Taller y Nueva venta y recupera su copia ficticia al reabrir el demo. Espera «Venta pendiente guardada» antes de cerrar. Guion y límites: [REVISION4-CARRITO.md](REVISION4-CARRITO.md).

## Revisión 5

El celular usa Venta, Inventario, Taller y Más en una barra inferior fija. La venta se simplifica y mantiene borradores. El administrador puede registrar mano de obra desde el mismo formulario del vendedor, además de revisar su historial. El ticket de venta usa el logo del negocio y formato 80/58 mm para imprimir o guardar PDF; WhatsApp abre un enlace para envío humano, no adjunta un PDF automáticamente.

En el perfil se pueden crear tickets de soporte. El propietario los abre en la campana de cada empresa, responde y cambia el estado. Las respuestas generan un contador sin leer en el perfil del cliente. Los vendedores solo ven sus propios tickets y los administradores los de su empresa.

JE aparece automáticamente en la primera apertura de esta actualización, conservando la copia anterior del navegador. Acceso manual: empresa **JE Accesorios y Repuestos**, usuario **joan**, contraseña comunicada por el propietario; no se publica en Datos de prueba. La prueba dura 30 días inclusivos desde su preparación y no se renueva al recargar. Su perfil de administrador inicia con inventario vacío y el logo original proporcionado. Correo, NIT y dirección no se han inventado.

JE es todavía una cuenta de demostración por navegador: no representa una base compartida real entre equipos. El stock real del almacén y la instalación definitiva siguen pendientes. Revisión y guion: [REVISION5-ENTREGA.md](REVISION5-ENTREGA.md).

## Revisión 6 · administrador

Dashboard → Administración reúne Cierre de caja, Reportes y exportaciones, Preparar reposición y Mecánicos. Taller permite seleccionar mecánico; el administrador gestiona su lista e históricos. Perfil → Mi suscripción muestra la vigencia y el contacto disponible, sin habilitar pagos o cambios de contrato. El demo conserva empresas, credenciales y datos; no requiere reinicio.

Los cierres concilian ventas netas por la fecha original de venta y el medio de pago, sin reconstruir flujos de devoluciones por día ni contabilizar saldos iniciales/gastos/retiros. El registro confirmado se conserva. Exportaciones CSV y reportes distinguen datos actuales de inventario y período de ventas/compras. Guion y límites: [REVISION6-ADMINISTRADOR.md](REVISION6-ADMINISTRADOR.md).

## Revisión 7 · Resumen general

Dashboard se renombra a **Resumen general**. Abre con el mes actual. FECHA despliega Desde/Hasta; FILTRAR aplica el rango y LIMPIAR muestra todo el historial, sin atajos. Muestra ventas/productos/mano de obra, qué se vendió, rankings y ganancia total de productos al final, con costos históricos y devoluciones. SIN VENTAS se consulta en el selector de Productos destacados y corresponde al catálogo actual, sin un bloque separado. Las herramientas previas están en Resumen general → Administración. Ver ventas usa el mismo rango. No se necesita Reiniciar demo. Guion y límites: [REVISION7-RESUMEN.md](REVISION7-RESUMEN.md).

## Revisión 8 · pantalla simplificada

Títulos y encabezados en mayúsculas. Se retiran los cuatro textos explicativos indicados y la franja de ventas con ingreso neto, promedio, devoluciones y anulaciones. Los cálculos históricos y el tratamiento de correcciones se conservan. 166/166 pruebas aprobadas sin omisiones; aplicación y demo compilan. Ver [REVISION8-RESUMEN.md](REVISION8-RESUMEN.md). Recargar el demo conserva los datos; no usar Reiniciar demo.
