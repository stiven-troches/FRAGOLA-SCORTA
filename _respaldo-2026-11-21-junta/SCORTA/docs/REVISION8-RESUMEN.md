# Revisión 8 · Resumen general simplificado

Esta revisión sustituye los filtros y bloques visibles descritos en revisión 7. Conserva los cálculos de ventas netas, mano de obra y ganancia histórica de productos.

## Uso

- FECHA despliega DESDE y HASTA, con FILTRAR y LIMPIAR. No hay atajos de fechas. El rango inicial sigue siendo el mes actual hasta hoy, en Bogotá.
- Las fechas se editan sin cambiar las cifras; FILTRAR aplica ambas juntas. Un rango incompleto, imposible o invertido muestra el error y conserva el período aplicado. Escape o clic exterior descarta cambios sin aplicar.
- LIMPIAR quita ambos límites y muestra todo el historial; el período lo indica explícitamente.
- Productos destacados incorpora SIN VENTAS del catálogo actual, diez filas y Ver más. No hay bloque aparte. No reconstruye el catálogo de fechas anteriores.
- Se retiran los cuatro textos indicados y la franja de ventas con ingreso neto, promedio, devoluciones y anulaciones. Los títulos y encabezados de tablas quedan en mayúsculas.

## Verificación

166/166 pruebas sin omisiones; aplicación y demo compilan. Se comprueban las transiciones del filtro, validación, historial completo, selección sin ventas, permisos, costos incompletos y cálculos financieros existentes. El aviso previo del tamaño del bundle del demo continúa sin impedir la compilación. Sin herramienta de navegador disponible, no se afirma QA visual.

## Revisión conjunta pendiente

1. Como administrador, abrir Resumen general: debe verse FECHA y los indicadores principales, sin los textos/bloques retirados.
2. Abrir FECHA, cambiar el rango y confirmar que las cifras cambian solo al pulsar FILTRAR. Revisar un rango invertido y cerrar con Escape/clic exterior.
3. Pulsar LIMPIAR: período Todo el historial y totales de todas las fechas.
4. Seleccionar SIN VENTAS y revisar Ver más; cambiar a los otros cuatro rankings.
5. Confirmar títulos/encabezados en mayúsculas, legibilidad en celular y PC y que Ver ventas abre el mismo rango.

Recargar conserva los datos existentes; no requiere Reiniciar demo. Servidor compartido definitivo, dispositivos/impresora reales y conexiones externas mantienen los pendientes previos.
