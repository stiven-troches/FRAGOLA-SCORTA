# Cierre de implementación de la auditoría · 20 de noviembre de 2026

Antes de corregir se guardó en GitHub la instantánea e9d62018dc6233227dc6f9725b1744123019d609 con el informe y las asignaciones. La tabla usa la numeración de la lista presentada al usuario; conserva la auditoría original como antecedente sin reescribir sus resultados.

## Cobertura de los 27 puntos

| Punto | Responsable | Corrección implementada |
| --- | --- | --- |
| 1 | client_workspace | Cantidad numérica; 2 → 3 por ambas rutas. |
| 2 | admin_backend / coordinación | Contexto fijo de empresa en acciones, datos y borradores; rechazo con HTTP 428 o 409. |
| 3 | admin_backend | Acceso del propietario independiente del contrato cliente. |
| 4 | admin_subscription | Revisión capturada por formulario y recuperación explícita ante HTTP 409. |
| 5 | coordinación / admin_reports | Servicios legacy entregados independientes incluidos una sola vez; reparto desconocido explícito. |
| 6 | overview_data | Restauración consistente SQLite incluye WAL confirmado. |
| 7 | admin_backend | El handler conserva los parámetros de consulta; regresión HTTP por fechas. |
| 8 | admin_backend | DTO público y revocación de enlaces anteriores al renovar. |
| 9 | admin_backend | Límites por origen, TTL y cardinalidad acotada. |
| 10 | coordinación / overview_data / client_workspace | Costo omitido admite null y cero explícito válido; la importación rechaza campos de costo con solo espacios. |
| 11 | overview_data | Procedencia de costo y recuperación al anular compras. |
| 12 | coordinación | Importes nuevos con un máximo de 2 decimales, redondeo decimal común y reconciliación de caja y resumen. |
| 13 | coordinación / admin_tools_ui | Directorio ZIP coherente, CRC y tamaño real descomprimido acotado. |
| 14 | coordinación | Nombre de hoja válido después del truncado y normalización de comillas. |
| 15 | overview_data | HTTP 400 libera el borrador para corregir; se conserva el reintento si el resultado es incierto. |
| 16 | client_workspace / coordinación | CTA local usa retry global original sin remontar innecesariamente. |
| 17 | client_workspace | Escape consulta callback vigente y conserva confirmación. |
| 18 | client_workspace | Formulario bloqueado durante POST o resultado incierto. |
| 19 | client_workspace | Placa seleccionada visible, editable y eliminable. |
| 20 | admin_subscription | Un ticket con 500 entradas permite un único cierre adicional acotado. |
| 21 | backend | `INICIAR.cmd` utiliza `npm start` y carga `.env`. |
| 22 | client_ui | Suites actuales de HTTP y demo en 3 tamaños; ejecución automática configurada en CI. |
| 23 | backend | README, LEEME y contrato API actualizados. |
| 24 | client_workspace | No anuncia actualización cuando refresh devuelve null. |
| 25 | backend | uuid 11.1.1 y fflate 0.8.3; `npm audit` sin vulnerabilidades y `npm ci` reproducible. |
| 26 | client_ui | Original intacto y 6 variantes fieles; WebP de 320 px: −91,26 %. |
| 27 | backend | Workflow de GitHub con Node.js 24, pruebas, compilaciones, auditoría y recorridos de navegador. |

## Evidencia

La verificación integral local aprueba **237/237 pruebas, sin omisiones**, incluida la prueba privada JE suministrada solo por entorno/stdin oculto. Aplicación y demo compilan. Las nuevas regresiones verifican contexto multiempresa, colisiones del propietario, contratos concurrentes, costo histórico y anulación de compras, recuperación de borradores, restauración WAL, precisión monetaria, límites XLSX, callbacks de interfaz y activos.

La instalación limpia desde el lockfile se verificó de forma aislada; `npm audit` devuelve **0 vulnerabilidades conocidas**. El original del logo no se alteró; las variantes se compararon como RGBA contra un redimensionado proporcional de referencia. Excel continúa cargándose bajo demanda.

La suite de navegador actual contiene **33 casos de aplicación HTTP y 9 de demo**, distribuidos entre escritorio y móviles de 390 y 360 px de ancho. Este entorno no dispone de la herramienta de navegador indicada por Sites, por lo que no se inició preview ni se improvisó otro control local. El workflow versionado instala Chromium y ejecuta esas suites en GitHub; su resultado remoto se registra en Actions y en la propuesta de cambios. No se presenta una enumeración de casos como si fuera una ejecución interactiva.

La CI no recibe la contraseña privada de JE: utiliza cuentas ficticias y explica su única omisión deliberada de esa comprobación privada, ya verificada localmente. No contiene secretos del cliente.

## Contratos y compatibilidad

- HTTP autenticado operativo exige `X-SCORTA-Company` fijo para la pantalla: UUID de empresa o `@owner`. Bootstrap, login, logout y recibos públicos tienen sus excepciones documentadas. Los reintentos conservan el contexto y la revisión originales.
- Nuevos importes usan hasta dos decimales. Se conservan snapshots históricos; costos legacy con mayor precisión no se reescriben al editar otros campos. Costos desconocidos permanecen null; no se convierten en ganancias inventadas.
- Servicios independientes antiguos solo se reconocen financieramente cuando están entregados. Usan `fecha_entrega` cuando existe y mantienen el pago y el porcentaje como desconocidos si no se registraron; los espejos vinculados a ventas no se duplican.
- Restaurar consolida el origen mediante snapshot de SQLite; no copia únicamente su archivo principal. El destino activo sigue protegido y se conserva recuperación del destino anterior.
- ZIP admite formatos XLSX convencionales STORE/DEFLATE, hasta 5 MB comprimidos, 20 MB efectivos y 2000 entradas. Inconsistencias, cifrado y formatos no soportados se rechazan antes de ExcelJS.

Las validaciones de Windows nativo, impresora y dispositivos físicos requieren sus equipos. Dominio/servidor definitivo, respaldo externo y piloto, así como correo/WhatsApp automático y firma legal real, pertenecen a la fase de entrega previamente aplazada; no se confunden con los 27 hallazgos de esta corrección.
