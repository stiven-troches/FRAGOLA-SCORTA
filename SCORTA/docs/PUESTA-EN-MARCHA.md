# Condiciones para comenzar a usar SCORTA

Actualizado: 12 de noviembre de 2026 (America/Bogota).

La aplicación tiene una versión probada localmente. Para comenzar con datos del almacén todavía hay que cerrar las condiciones siguientes; la existencia de código, guiones o documentación no equivale a ejecutarlas en la instalación real.

| Condición | Qué falta | Responsable | Evidencia esperada |
| --- | --- | --- | --- |
| Forma de acceso | Elegir dónde y desde qué equipos se utilizará; confirmar recursos de alojamiento y dirección. | Usuario e infraestructura | Modalidad y recursos definidos; sin valores de ejemplo utilizados como configuración definitiva. |
| Instalación operativa | Preparar la infraestructura elegida, HTTPS y persistencia; probar un reinicio. | Infraestructura | Dirección definitiva accesible y datos conservados tras reinicio. HTTPS también corresponde a un equipo único o a una red local. |
| Personas y permisos | Definir quién administra y quién registra operaciones; crear y comprobar cuentas. | Responsable del almacén y seguridad | Personas designadas pueden trabajar con sus permisos; salida y cambio de contraseña verificados. |
| Uso claro y equipos válidos | Completar venta, recepción y devolución con el usuario, celular y lector que realmente se usarán. | Diseño, QA y personal del almacén | Recorridos comprensibles y sin incidencias que impidan operar; los cambios necesarios quedan corregidos. |
| Inventario inicial correcto | Recibir el archivo real, revisar identificadores y precios y conciliar cantidades con conteo físico. | Producto y personal del almacén | Inventario importado y conciliado, separado de los datos ficticios de prueba. |
| Recuperación de datos | Programar las copias, sacar una copia fuera del servidor y ensayar la recuperación en la infraestructura elegida. | Infraestructura | Respaldo automático verificable y restauración que recupera usuarios, operaciones e inventario. |
| Piloto aceptado | Usar un alcance controlado con las personas designadas; revisar resultados y acceso simultáneo si aplica. | Producto, QA y usuario | Operaciones y existencias conciliadas; responsable del almacén decide comenzar o corregir. |

La configuración de uso real no se sustituye activando el modo de desarrollo sin cuentas. Los guiones y procedimientos pueden prepararse ahora. La ejecución de estas condiciones requiere las decisiones, recursos, equipos y datos reales indicados. La revisión visual ya está aprobada y las pruebas automatizadas registradas dieron **32/32 servidor y 30/30 interfaz**; no sustituyen la aceptación del usuario ni un ensayo en producción.

No se requiere añadir todas las mejoras futuras para hacer el piloto: fotos, cámara, borradores persistentes y ampliaciones de cuentas siguen por priorizar. El producto actual tampoco amplía su alcance a caja, contabilidad ni facturación electrónica.

El seguimiento concreto de cada condición está en [PENDIENTES.md](PENDIENTES.md), con responsables, dependencias y criterios de cierre. El guion de aceptación está en [ACEPTACION-ALMACEN.md](ACEPTACION-ALMACEN.md); acceso y permisos en [seguridad.md](seguridad.md), y respaldo en [OPERACION.md](OPERACION.md).

## Preparación del archivo inicial

Producto deja definida esta cabecera compatible con la importación existente:

```csv
nombre,precio_venta,precio_compra,stock,stock_minimo,categoria,referencia,marca,modelo,compatibilidad,codigo_barras
```

El almacén debe aportar nombres, precios y cantidades contadas físicamente. Nombre y precio de venta son obligatorios; las cantidades son enteros no negativos. Los números se escriben sin separadores de miles. Antes de importar, revisar que nombres y referencias no estén repetidos, que cada código de barras identifique un solo producto y que los precios de compra y venta sean los que el negocio quiere utilizar. Los códigos y referencias deben conservarse como texto para no perder ceros iniciales.

Se prueba primero una copia en un entorno aislado y se compara por producto la cantidad importada con el conteo aprobado. Una importación técnicamente exitosa no cierra P09 sin esa conciliación del almacén.
