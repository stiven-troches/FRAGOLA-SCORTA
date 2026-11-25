# Documentación de SCORTA — índice

Actualizado: 21 de noviembre de 2026. Empieza por [LEEME.md](../LEEME.md) (instalación y uso). La lista maestra de tareas está en `PENDIENTES-SCORTA.md`, en la carpeta raíz del proyecto.

## Operación y seguridad

| Documento | Para qué |
|---|---|
| [OPERACION.md](OPERACION.md) | Render: arquitectura, variables, respaldos, restauración, RPO/RTO, runbook de incidentes, monitoreo, despliegues. Anexo de instalación propia (Docker/Caddy). |
| [SALIDA-DE-RENDER.md](SALIDA-DE-RENDER.md) | Plan para mover SCORTA de Render a Fly.io, Railway o un VPS en menos de un día, con corte de DNS y rollback. |
| [seguridad.md](seguridad.md) | Estado actual de la seguridad: roles, sesiones, soporte, límites, cabeceras. |
| [INCIDENTES-SEGURIDAD.md](INCIDENTES-SEGURIDAD.md) | Plan de respuesta a incidentes de seguridad, simulacro y ejercicio de mesa (contraseña del propietario filtrada). |
| [SECRETOS.md](SECRETOS.md) | Inventario de secretos y llaves, rotación y qué hacer si se filtran. |
| [LICENCIAS.md](LICENCIAS.md) | Licencias de las dependencias y titularidad del código. |

## Producto y técnica

| Documento | Para qué |
|---|---|
| [PLATFORM-API.md](PLATFORM-API.md) | Contrato de la API `/api/v2`. |
| [PLAN-PRODUCTO.md](PLAN-PRODUCTO.md) | Objetivos de experiencia y criterios de aceptación. |
| [DISENO.md](DISENO.md) | Sistema visual. |
| [DEMO.md](DEMO.md) | Demo pública con datos ficticios. |
| [capturas/](capturas/) | Capturas de pantalla (de una versión anterior de la interfaz; FE-24). |

## Calidad y piloto

| Documento | Para qué |
|---|---|
| [qa/CRITERIOS-LANZAMIENTO.md](qa/CRITERIOS-LANZAMIENTO.md) | Qué debe cumplirse para vender. |
| [qa/REGRESION-DESPLIEGUE.md](qa/REGRESION-DESPLIEGUE.md) | Lista antes de cada despliegue. |
| [qa/GUIONES-PILOTO.md](qa/GUIONES-PILOTO.md) | Guiones del piloto con el almacén. |
| [qa/HALLAZGOS-PILOTO.md](qa/HALLAZGOS-PILOTO.md) | Registro de hallazgos del piloto. |
| [qa/USABILIDAD-MOSTRADOR.md](qa/USABILIDAD-MOSTRADOR.md) | Prueba de usabilidad en mostrador. |
| [qa/REVISION-DEMO.md](qa/REVISION-DEMO.md) | Revisión de la demo tras cada versión. |
| [ACEPTACION-ALMACEN.md](ACEPTACION-ALMACEN.md) | Prueba de aceptación con el almacén. |
| [GUIA-PRUEBA-USUARIO.md](GUIA-PRUEBA-USUARIO.md) | Prueba de claridad con quien atiende. |

## Documentos del negocio (fuera del código)

Los documentos comerciales y legales del dueño están en la carpeta `NEGOCIO/` de la raíz del proyecto, fuera de `SCORTA/`: subencargados, habeas data, registro de tratamiento, borradores de contrato, política, aviso y términos, guion de venta, guion de demo, guiones de video, alta de clientes y preguntas frecuentes.

## Histórico

Informes de entregas, revisiones y auditorías anteriores. **No describen el estado actual**; se conservan como antecedente.

| Documento | Contenido |
|---|---|
| [historico/ENTREGA.md](historico/ENTREGA.md) | Entrega de la plataforma multiempresa (19/11/2026) |
| [historico/ENTREGA-REVISION2.md](historico/ENTREGA-REVISION2.md) | Entrega de la revisión 2 |
| [historico/QA.md](historico/QA.md) · [historico/QA-PLATAFORMA.md](historico/QA-PLATAFORMA.md) · [historico/QA-REVISION2.md](historico/QA-REVISION2.md) | Informes de QA anteriores |
| [historico/REVISION-CLARIDAD.md](historico/REVISION-CLARIDAD.md) | Revisión de claridad visual |
| [historico/REVISION4-CARRITO.md](historico/REVISION4-CARRITO.md) … [historico/REVISION9-ADMINISTRADOR.md](historico/REVISION9-ADMINISTRADOR.md) | Revisiones 4 a 9 (carrito, entrega, administrador, resumen) |
| [historico/PENDIENTES.md](historico/PENDIENTES.md) | Lista de pendientes anterior (reemplazada por `PENDIENTES-SCORTA.md`) |
| [historico/PUESTA-EN-MARCHA.md](historico/PUESTA-EN-MARCHA.md) · [historico/PRUEBA-OPERACION.md](historico/PRUEBA-OPERACION.md) | Condiciones de arranque y simulación operativa (12/11/2026) |
| [historico/PLAN-CORRECCIONES-AUDITORIA.md](historico/PLAN-CORRECCIONES-AUDITORIA.md) · [historico/CIERRE-CORRECCIONES-AUDITORIA.md](historico/CIERRE-CORRECCIONES-AUDITORIA.md) | Plan y cierre de la auditoría del 20/11/2026 |
| [historico/auditoria-2026-11-20/](historico/auditoria-2026-11-20/) | Informe completo de esa auditoría |
