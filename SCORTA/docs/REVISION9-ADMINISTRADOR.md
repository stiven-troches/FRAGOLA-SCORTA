# Revisión 9 · administrador, porcentajes y Excel

Se ejecuta la lista aprobada de ajustes de interfaz y funciones. No se reinician datos existentes ni se asignan porcentajes inventados a servicios anteriores.

## Resumen general

- Títulos y encabezados en mayúsculas; bordes de cuadros, tablas y separadores más oscuros, con detalles amarillos conservados.
- Productos destacados y Qué vendimos muestran descripción sin referencia. El ranking SIN VENTAS y el filtro FECHA permanecen.
- Nueva tabla MANO DE OBRA: fecha, placa/cliente, servicio/mecánico, cobro neto, porcentaje histórico y reparto. Diez filas iniciales y Ver más.
- Las tres tablas descargan Excel real .xlsx. Se exportan todas las filas de la consulta, no solo la página visible; el ranking respeta la selección y cada archivo conserva el período. SIN VENTAS exporta todo su resultado.
- Retirado «excluye anulados». Las anulaciones siguen sin aumentar cobros o ganancias.
- Al final: GANANCIA EN PRODUCTOS, GANANCIA EN MANO DE OBRA (parte del negocio) y GANANCIA TOTAL GENERAL, suma de ambas. El margen mostrado corresponde a productos.
- Administración conserva cierre, reportes, reposición y mecánicos; se retiran Nueva venta, Ver inventario e Ingresar mercancía. La recepción se mantiene en Compras.

## Mecánicos

Crear/editar incluye porcentaje obligatorio para nuevas altas, entre 0 y 100 con hasta dos decimales; el complemento corresponde al negocio. Se mantienen activar/desactivar y filtro de fechas. La tabla separa cobro neto, parte del mecánico y parte del negocio. Ver trabajos abre los servicios del mecánico dentro del rango, con placa, descripción, importes y Excel.

Solo se permiten mecánicos registrados y activos, validado también en servidor. Si una cuenta existente tiene mecánicos sin porcentaje, el administrador debe configurarlo antes de nuevas ventas. Borradores antiguos sin un ID válido deben retirar/reagregar el servicio desde Taller.

Al confirmar una venta, el servidor toma nombre y porcentaje del catálogo y los guarda en cada línea. Ignora porcentajes/nombres aportados por el cliente. Cambios posteriores de nombre, porcentaje o estado no reescriben ventas previas. El vendedor y el comprobante público no reciben el porcentaje interno.

El cálculo toma las líneas de la venta, sin duplicar los registros de Taller. Una anulación o devolución completa deja cero reparto. Una devolución de una sola línea se calcula sobre el neto; si hay varias líneas y un reembolso sin distribución, se indica que falta desglose. Un servicio antiguo sin porcentaje histórico conserva su cobro y muestra reparto pendiente. En ambos casos se impide afirmar una ganancia general completa. No se usan porcentajes actuales para reconstruir el pasado.

Se quitan el texto explicativo solicitado y el bloque Históricos sin asociación. Los documentos históricos se conservan y siguen visibles en las consultas de ventas/mano de obra. Los importes de reparto se redondean a dos decimales y se muestran los centavos cuando existen; no representan pagos ya liquidados al mecánico.

## Reposición, reportes y movimientos

Reposición conserva la tabla de producto, estado, stock y mínimo. Se eliminan textos, buscador, cuadros de cantidades y compra/unidades sugeridas; solo queda DESCARGAR EXCEL encima de la tabla. El archivo tampoco incluye sugerencias y no crea compras.

Movimientos conserva el historial de entradas, salidas, ajustes, responsable, antes/después y documentos. Reportes pasa a balances y descargas Excel por fechas, con resumen por vendedor en ventas, sin repetir las listas de operaciones. Existencias sigue siendo una consulta actual, no un inventario histórico reconstruido.

## Compras manuales o por Excel

Compras → Ingresar mercancía acepta varias líneas en una sola compra. CARGAR COMPRA DESDE EXCEL permite descargar plantilla .xlsx del catálogo existente, rellenar cantidades/costos, abrir el archivo, revisar vista previa y pulsar USAR PRODUCTOS DEL EXCEL. Si ya hay líneas se pide confirmar su reemplazo. El proveedor/fecha y el total quedan en un único documento al pulsar Registrar compra; la lectura del archivo y la vista previa no cambian inventario.

La plantilla usa PRODUCTO ID, REFERENCIA, PRODUCTO, CANTIDAD y COSTO UNITARIO. Las filas sin cantidad se omiten; se valida un máximo de 1000 productos, identificación coincidente y no ambigua, duplicados, cantidades enteras positivas y costos no negativos. No crea productos desconocidos ni acepta fórmulas/enlaces en las filas importadas. Archivo .xlsx hasta 5 MB y contenido ZIP declarado hasta 20 MB. Cualquier error impide cargar parcialmente el archivo. Se mantiene la validación y confirmación atómica del servidor y sus reintentos idempotentes.

ExcelJS se carga solo al usar Excel; no se añaden servicios externos. Excel exporta números como números y texto como texto, sin convertir cadenas en fórmulas. El importador CSV de altas de productos en Inventario se conserva como función distinta.

## Validación y revisión conjunta

181/181 pruebas aprobadas sin omisiones. Incluyen reparto histórico y cambios posteriores, porcentajes 0/100 y decimales, devoluciones/anulaciones, costos faltantes, permisos/aislamiento, ocultación de porcentajes al vendedor/recibo público, ida/vuelta de .xlsx, validación de importación y compra múltiple atómica/idempotente. SSR cubre tablas, acceso a Excel, simplificación y detalle compacto. Compilaciones aplicación/demo correctas; aviso de chunks grandes sin error. Docker incluye los módulos nuevos; no se construyó ni desplegó un contenedor.

No se dispone de herramienta de navegador: no se declara QA visual ni descarga verificada en Excel de escritorio. Revisar juntos en celular/PC: mecánicos y porcentajes, veinte servicios y Ver más, una venta mixta, los tres totales, descargas y una compra de varios productos importada desde la plantilla. Recargar el demo conserva la información; no requiere Reiniciar demo.

El servidor compartido definitivo, dominio/HTTPS, copias externas y piloto siguen pendientes de la fase de entrega, al igual que correo/WhatsApp automático y firma legal real.
