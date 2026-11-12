# Pendientes asignados de SCORTA

Actualizado: 12 de noviembre de 2026 (America/Bogota).

Cada pendiente tiene un responsable principal, una condición para empezar y una evidencia de cierre. «Preparación» significa que puede avanzarse con la información disponible; las pruebas con el usuario, sus equipos o la instalación definitiva siguen abiertas hasta ejecutarse allí. La tabla no implica que todos los agentes estén trabajando simultáneamente.

## Entrega y validación con el usuario

| ID | Responsable principal y apoyo | Estado y dependencia | Resultado que permite cerrarlo |
| --- | --- | --- | --- |
| P01 · Sincronizar diseño y registro de tareas con GitHub | Coordinación | Completado en esta entrega. Diseño publicado y verificado en `b8f6076`; registro de asignaciones incluido en la propuesta existente. | Rama remota y propuesta de revisión actualizadas con el diseño y los documentos; comprobar el commit publicado. No incluye fusionar ni desplegar. |
| P02 · Revisar una venta de mostrador | Diseño UX/UI; usuario y coordinación | Espera la prueba conjunta. La revisión visual de dirección ya está aprobada. | El usuario recorre búsqueda, cantidad, total y confirmación, identifica las existencias restantes y deja observaciones de claridad y comodidad. |
| P03 · Revisar recepción, devolución y errores habituales | QA; diseño, producto y usuario | Guiones preparados; ejecución conjunta pendiente. Véanse [GUIA-PRUEBA-USUARIO.md](GUIA-PRUEBA-USUARIO.md) y [ACEPTACION-ALMACEN.md](ACEPTACION-ALMACEN.md). | Completar compra y devolución; probar stock insuficiente y referencia repetida; verificar mensajes comprensibles, conservación del formulario y cantidades. |
| P04 · Resolver problemas de la prueba conjunta | Frontend; diseño y QA. Backend si cambia una regla de datos | Condicionado a hallazgos concretos de P02/P03. No hay una nueva corrección aprobada todavía. | Registrar el problema, aplicar la corrección, repetir el caso afectado y confirmar que el usuario entiende el resultado. |

## Preparación del uso real

| ID | Responsable principal y apoyo | Estado y dependencia | Resultado que permite cerrarlo |
| --- | --- | --- | --- |
| P05 · Validar los equipos del almacén | QA; personal del almacén | Guion preparado. Espera celular, navegador y lector físicos que se utilizarán. | Ventas, compras, devoluciones y lectura de códigos completadas en esos equipos; registrar incidencias, accesibilidad básica y resultados. La emulación no cierra esta tarea. Guion: [ACEPTACION-ALMACEN.md](ACEPTACION-ALMACEN.md). |
| P06 · Preparar alojamiento y HTTPS | Infraestructura; usuario y coordinación | Preparación técnica entregada; configuración Compose validada sin desplegar. Espera definir acceso y servidor/dominio o infraestructura elegida. | Aplicación accesible por la dirección definitiva, HTTPS y almacenamiento persistente comprobados; instalación reiniciada sin perder datos. |
| P07 · Configurar cuentas y acceso real | Seguridad; infraestructura y responsable del almacén | Revisión de permisos y procedimiento entregada; pruebas dirigidas aprobadas. Cuentas definitivas pendientes de P06 y de la lista de personas/roles. El acceso real exige HTTPS también en un equipo único o en red local. | Administrador y operadores reales configurados; comprobar entrada, salida, cambio de contraseña y acciones permitidas desde la instalación definitiva. |
| P08 · Programar y ensayar respaldos definitivos | Infraestructura; seguridad y responsable del almacén | Comandos y restauración aislada ya existen. Configuración real pendiente de P06 y destino externo. | Copia automática, copia fuera del servidor y revisión de errores configuradas; restauración ensayada con cuentas, existencias e historial en un entorno aislado de esa instalación. |
| P09 · Preparar el inventario inicial real | Responsable de producto; personal del almacén y backend si hay problemas de importación | Cabecera CSV y criterios preparados en [PUESTA-EN-MARCHA.md](PUESTA-EN-MARCHA.md). Espera archivo real, conteo físico y revisión de referencias, códigos y precios. | Importación conciliada por producto con el conteo físico; referencias/códigos únicos, costos y precios revisados; ningún dato ficticio mezclado con los reales. |
| P10 · Ejecutar piloto y decidir el inicio | Responsable de producto; QA, usuario e infraestructura | Plan de piloto preparado en [ACEPTACION-ALMACEN.md](ACEPTACION-ALMACEN.md). Espera P02–P09 y resolución de incidencias que impidan trabajar. | Personas designadas completan una jornada controlada, incluido acceso simultáneo si lo usarán; conciliar operaciones y existencias, comprobar respaldo y registrar decisión de comenzar o corregir. |

## Perfiles que recibieron la asignación

| Agente | Cargo | Trabajo entregado en esta asignación |
| --- | --- | --- |
| `producto_pendientes` | Responsable de producto | Registro P01–P10, responsables, condiciones de puesta en marcha y preparación del archivo inicial. |
| `diseno_prueba_guiada` | Diseño UX/UI | Guion de observación de claridad con el usuario; la aceptación sigue pendiente. |
| `qa_piloto` | QA | Recorridos de aceptación, dispositivos, permisos, concurrencia y registro de piloto. |
| `infra_puesta_marcha` | Infraestructura | Preparación de instalación, validación Compose y procedimiento de respaldos/recuperación. |
| `seguridad_puesta_marcha` | Seguridad | Preparación de cuentas y permisos y validación dirigida de sesiones, primera cuenta y respaldo. |
| Coordinación | Integración y GitHub | Sincronización del diseño, revisión de los entregables y actualización de la propuesta. |

Los especialistas terminaron esta preparación; los pendientes humanos o del servidor no continúan ejecutándose en segundo plano. Frontend y backend tienen asignadas las correcciones que se identifiquen en P04; se activan cuando exista un problema concreto. La dirección de diseño interviene si esos hallazgos requieren cambiar la interacción.

## Responsabilidades de coordinación y diseño

La coordinación integra resultados, conserva el estado de esta lista y publica la versión revisable. La dirección de diseño cerró la revisión visual documentada en [REVISION-CLARIDAD.md](REVISION-CLARIDAD.md); intervendrá si la prueba conjunta exige cambios de jerarquía o interacción. Frontend y backend reciben problemas concretos, en lugar de volver a desarrollar funciones ya terminadas.

## Mejoras futuras: responsables de evaluación, sin aprobación de implementación

| ID | Propuesta | Responsable de evaluación | Estado |
| --- | --- | --- | --- |
| F01 | Recuperación de contraseña y desactivación de cuentas | Seguridad y backend | Por priorizar según la operación y el soporte disponibles. |
| F02 | Conservar borradores al recargar o cerrar | Frontend y backend | Por priorizar; definir recuperación y reintentos antes de implementarlo. |
| F03 | Fotografías de productos | Diseño UX/UI, frontend y backend | Por priorizar; definir utilidad y almacenamiento. |
| F04 | Consultas paginadas en el listado general | Backend y frontend | Por priorizar según el volumen real. |
| F05 | Lectura de códigos por cámara | Frontend y QA; seguridad para permisos | Por priorizar si el lector físico no cubre la necesidad. |

Estas propuestas no forman parte de las condiciones ya acordadas para iniciar el piloto. Si una necesidad real las vuelve indispensables, producto debe actualizar el alcance y esta lista.

## Trabajo terminado y evidencia

La aplicación incluye compras, ventas, inventario, ajustes, devoluciones, taller, historial, sesiones, permisos y respaldo completo. El diseño simplificó filtros, listado y navegación móvil. La última comprobación registrada aprobó **32 pruebas de servidor y 30 recorridos de interfaz**, además de la compilación. No se repiten esas comprobaciones sin cambios, fallos o dudas nuevas.

La simulación operativa concilió entradas, salidas, devoluciones y anulaciones; corrigió tres fallos. El despliegue externo, las cuentas definitivas, el inventario real y la aceptación conjunta siguen sin completarse.

Evidencia: [entrega](ENTREGA.md), [prueba operativa](PRUEBA-OPERACION.md), [revisión de claridad](REVISION-CLARIDAD.md), [QA](QA.md) y [condiciones para comenzar](PUESTA-EN-MARCHA.md).
