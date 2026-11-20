# Correcciones de auditoría · 20 de noviembre de 2026

El usuario autoriza ejecutar todos los hallazgos después de guardar en GitHub la fuente y la auditoría. Fuente auditada: 0e35e5eafae07cb82fa5f0865a0bcffaba76dbca. Informe íntegro: [informe.html](auditoria-2026-11-20/informe.html). Los números de la siguiente tabla corresponden a la lista presentada al usuario, no necesariamente al ID H del JSON.

| Responsable | Puntos | Alcance |
| --- | --- | --- |
| client_workspace | 1,16,17,18,19,24 | Cantidades, reintentos, Escape, bloqueo durante guardado, placa y mensajes |
| admin_backend | 2,3,8,9 | Contexto entre pestañas, propietario, recibos públicos y protección de acceso |
| admin_subscription | 4,20 | Concurrencia de contrato y cierre de tickets al límite |
| admin_reports / coordinación | 5,7,10,12 | Migración de servicios, fechas HTTP, costos desconocidos y precisión |
| overview_data / coordinación | 6,11,15 | Restauración WAL, costo tras anular compra y borradores inválidos |
| admin_tools_ui | 13,14 y subcaso10 | Límites XLSX, hojas y costos vacíos |
| client_ui | 22,26 | Pruebas de navegador y peso de recursos sin alterar marca |
| backend | 21,23,25,27 | Inicio Windows, documentación, dependencias y CI |
| coordinación | integración y revisión | Contratos entre módulos, regresiones, GitHub y demo |

Estado de esta instantánea: auditoría y asignaciones guardadas; correcciones todavía no iniciadas. La ejecución y sus pruebas se documentarán en un cierre posterior, distinguiendo los resultados comprobados de las limitaciones del entorno.
