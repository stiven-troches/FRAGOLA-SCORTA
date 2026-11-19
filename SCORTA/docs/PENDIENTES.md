# Pendientes asignados de SCORTA

Actualizado: 19 de noviembre de 2026 (UTC).

La demo con 24 productos ficticios está publicada en [https://fragola-scorta-demo.safeturnip2.chatgpt.site](https://fragola-scorta-demo.safeturnip2.chatgpt.site), con acceso privado y despliegue confirmado. La guía está en [DEMO.md](DEMO.md). La revisión visual de la demo alojada y la prueba conjunta con el usuario siguen pendientes. Esta demostración no es la instalación de producción del almacén.

Cada pendiente tiene un responsable principal, una condición para empezar y una evidencia de cierre. «Preparación» significa que puede avanzarse con la información disponible; las pruebas con el usuario, sus equipos o la instalación definitiva siguen abiertas hasta ejecutarse allí. La tabla no implica que todos los agentes estén trabajando simultáneamente.

## Ajustes acordados: interfaz, empresas y perfiles

Estado general: especificaciones y propuestas visuales acordadas; implementación pendiente. Esta actualización documenta tareas y responsables, sin iniciar desarrollo, pruebas, fusiones o despliegues. La implementación requiere la indicación de proceder del propietario. Los nombres de agentes identifican perfiles responsables planificados; no indican que estén activos o trabajando en segundo plano.

Toda la interfaz será en español. La referencia más reciente del login sustituye las propuestas anteriores: fondo oscuro con resplandor rojo discreto, tarjeta central, logo SCORTA, «Tu almacén, bajo control», Empresa, Usuario, Contraseña e Ingresar. Las maquetas anteriores en inglés son referencias de estructura; deben traducirse antes de aplicarlas.

| ID | Ajuste pendiente y criterio de cierre | Agente responsable | Apoyo |
| --- | --- | --- | --- |
| A01 | Consolidar el diseño en español, colores y estados; sustituir el login anterior por la referencia oscura aprobada. | `direccion_diseno` | `diseno_ux_ui` |
| A02 | Implementar el login adaptable con empresa, usuario, contraseña y control para mostrar/ocultar contraseña. Diferenciar el acceso del propietario y el de los empleados de una empresa. | `frontend` | `backend`, `diseno_ux_ui` |
| A03 | Crear el perfil «Propietario de SCORTA» para Fragola / Steven, separado de los administradores de empresa. Configurar la credencial inicial fuera del código y GitHub, almacenándola con hash; no incluir contraseñas de prueba como credenciales de producción. | `backend` | `infraestructura` |
| A04 | Panel del propietario con tarjetas: logo, nombre, URL, estado, vencimiento y días restantes; botón «Crear nueva empresa». Los datos de contacto se consultan al abrir la tarjeta. | `frontend` | `diseno_ux_ui`, `backend` |
| A05 | Formulario de empresa: nombre, persona de contacto directo, correo, WhatsApp con indicativo y logo opcional; acceso inicial del administrador; inicio, fin y valor mensual del contrato. Guardar y poder editar esos datos. | `frontend` | `backend`, `diseno_ux_ui` |
| A06 | Guardar empresas y logos, generar una URL única por empresa y resolverla contra su empresa correcta. Las URLs example.com de las maquetas son ficticias; el dominio y la configuración real dependen de P06. | `backend` | `infraestructura` |
| A07 | Detalle de empresa con editar, habilitar, inhabilitar y eliminar. La suspensión conserva datos y bloquea el acceso de sus usuarios; eliminar exige una confirmación clara sobre los datos afectados. | `backend` | `frontend` |
| A08 | Vigencia del contrato: respetar inicio y fin, incluir todo el día final y bloquear desde el día siguiente según America/Bogota. Aplicar el control en el servidor a las sesiones y solicitudes, además de mostrar el estado. | `backend` | `frontend` |
| A09 | «Registrar pago y renovar»: proponer un mes desde el vencimiento vigente si paga anticipadamente; si venció, permitir elegir el inicio del nuevo período, por defecto la fecha del pago. Mostrar y permitir ajustar la nueva fecha antes de confirmar. La renovación no retira un bloqueo manual. | `backend` | `frontend` |
| A10 | Historial manual de pagos y renovaciones: fecha, importe, período anterior/nuevo y responsable. Mostrar avisos de próximo vencimiento y una pantalla de acceso suspendido que explique cómo contactar al propietario. | `backend` | `frontend`, `diseno_ux_ui` |
| A11 | «Usuarios y permisos» dentro de cada empresa: solo el propietario crea y gestiona cuentas y asigna roles. Admitir dos o más administradores y varios vendedores, todos con usuario y contraseña individuales. | `backend` | `frontend` |
| A12 | Permisos: administradores acceden a todos los módulos de su empresa; vendedores solo a los módulos y acciones autorizados. Los administradores de empresa no crean usuarios ni gestionan roles, empresas o contratos. Definir la lista exacta permitida al vendedor antes de cerrar esta tarea; proteger interfaz y API. | `backend` | `frontend`, coordinación |
| A13 | «Mi perfil» al pulsar el nombre: nombre/usuario, empresa, rol y cambio de contraseña; cierre de sesión. En la tarjeta del propietario mostrar la fecha del cambio y la opción de restablecer, sin revelar contraseñas actuales. | `frontend` | `backend` |
| A14 | «Acceder como soporte» desde el propietario, para atender una solicitud del cliente: registrar motivo e identidad del propietario. Mostrar en Movimientos fecha/hora, «Steven · Soporte», acción, motivo y valores anteriores/nuevos cuando corresponda. No atribuir las intervenciones a un empleado del cliente. | `backend` | `frontend` |
| A15 | Separar completamente los datos de cada empresa y las facultades de propietario, administrador y vendedor; verificar el alcance de cada sesión, URL, documento, consulta y operación de soporte. | `backend` | `qa_piloto` |
| A16 | Inicio del cliente con logo/empresa/usuario, Nueva venta, Ver inventario, Ingresar mercancía, ventas del día, productos por reponer, agotados y últimas operaciones, usando solo datos de esa empresa. Mantener importes y unidades comprensibles y una pantalla despejada. | `frontend` | `diseno_ux_ui`, `backend` |
| A17 | Barra lateral negra permanente; al navegar cambia el contenido de la derecha. Orden exacto: Nueva venta, Taller, Inventario, Compras, Movimientos y Dashboard. «Mi perfil» se abre desde el nombre; las secciones exclusivas del propietario quedan en su propio panel. | `frontend` | `diseno_ux_ui` |
| A18 | Adaptación a celular, tableta, PC y monitores: navegación compacta siempre disponible en pantallas pequeñas, formularios/tarjetas/tablas adaptados, controles táctiles y texto legible, sin desplazamiento horizontal global. | `frontend` | `diseno_ux_ui`, `qa_piloto` |
| A19 | Revisar coherencia visual, claridad, navegación y formularios con el usuario; validar la versión en español y resolver los hallazgos observados. | `diseno_prueba_guiada` | `direccion_diseno`, `diseno_ux_ui` |
| A20 | Pruebas de empresas aisladas, múltiples usuarios, permisos, vigencia, renovación anticipada/vencida, bloqueo manual, contraseñas, soporte e historial; recorridos visuales y dispositivos reales. Registrar evidencias actuales sin reutilizar resultados anteriores como aprobación del nuevo alcance. | `qa_piloto` | `backend`, `frontend` |
| A21 | Integrar y documentar los cambios terminados, sincronizar GitHub y actualizar la demo para revisión cuando se autorice la ejecución/publicación correspondiente. La demo local ficticia no acredita funcionamiento de varias empresas en un servidor. | Coordinación (`/root`) | `demo_interfaz`, `infra_puesta_marcha` |

### Decisiones que deben respetar los agentes

- El propietario del software administra clientes, cuentas, roles y contratos; «administrador de empresa» se refiere exclusivamente a la operación de una empresa cliente.
- El administrador de empresa conserva acceso a los módulos de su negocio, con la gestión de usuarios y roles reservada al propietario. La lista exacta de módulos del vendedor sigue por definir, sin asumir permisos adicionales.
- Mantener separadas la suspensión por vencimiento y la suspensión manual. Habilitar manualmente una empresa no sustituye actualizar una vigencia vencida. Todas las fechas se interpretan con el calendario de Colombia.
- La contraseña vigente no se muestra al propietario. Se permite restablecerla, y el acceso de soporte utiliza la identidad del propietario y deja historial visible para el cliente.
- La interfaz de empresas/contratos es un alcance nuevo: las 44 pruebas y las compilaciones registradas previamente no lo validan. La instalación de producción y sus pendientes P05–P10 continúan abiertos.
- Faltan decisiones de operación antes del uso real: lista exacta de permisos de vendedores, dominio/URLs definitivos y contacto del propietario que aparecerá al suspender el acceso. No bloquean registrar o revisar esta especificación.

## Entrega y validación con el usuario

| ID | Responsable principal y apoyo | Estado y dependencia | Resultado que permite cerrarlo |
| --- | --- | --- | --- |
| P01 · Sincronizar diseño y registro de tareas con GitHub | Coordinación | Completado en esta entrega. Diseño publicado y verificado en `b8f6076`; registro de asignaciones incluido en la propuesta existente. | Rama remota y propuesta de revisión actualizadas con el diseño y los documentos; comprobar el commit publicado. No incluye fusionar ni desplegar. |
| P02 · Revisar una venta de mostrador | Diseño UX/UI; usuario y coordinación | Espera la prueba conjunta. La revisión visual de dirección ya está aprobada. | El usuario recorre búsqueda, cantidad, total y confirmación, identifica las existencias restantes y deja observaciones de claridad y comodidad. |
| P03 · Revisar recepción, devolución y errores habituales | QA; diseño, producto y usuario | Guiones preparados; ejecución conjunta pendiente. Véanse [GUIA-PRUEBA-USUARIO.md](GUIA-PRUEBA-USUARIO.md) y [ACEPTACION-ALMACEN.md](ACEPTACION-ALMACEN.md). | Completar compra y devolución; probar stock insuficiente y referencia repetida; verificar mensajes comprensibles, conservación del formulario y cantidades. |
| P04 · Resolver problemas de la prueba conjunta | Frontend; diseño y QA. Backend si cambia una regla de datos | Condicionado a hallazgos concretos de P02/P03. El nuevo alcance acordado de interfaz y empresas se registra por separado en A01–A21. | Registrar el problema, aplicar la corrección, repetir el caso afectado y confirmar que el usuario entiende el resultado. |

## Preparación del uso real

| ID | Responsable principal y apoyo | Estado y dependencia | Resultado que permite cerrarlo |
| --- | --- | --- | --- |
| P05 · Validar los equipos del almacén | QA; personal del almacén | Guion preparado. Espera celular, navegador y lector físicos que se utilizarán. | Ventas, compras, devoluciones y lectura de códigos completadas en esos equipos; registrar incidencias, accesibilidad básica y resultados. La emulación no cierra esta tarea. Guion: [ACEPTACION-ALMACEN.md](ACEPTACION-ALMACEN.md). |
| P06 · Preparar alojamiento y HTTPS | Infraestructura; usuario y coordinación | Acceso confirmado: varios equipos y desde fuera del almacén. Preparación técnica entregada; Compose validado sin desplegar. Espera servidor/proveedor y dominio definitivos. | Aplicación accesible por la dirección definitiva, HTTPS y almacenamiento persistente comprobados; instalación reiniciada sin perder datos. |
| P07 · Configurar cuentas y acceso real | Seguridad; infraestructura y responsable del almacén | Revisión de permisos y procedimiento entregada; pruebas dirigidas aprobadas. Cuentas definitivas pendientes de P06 y de la lista de personas/roles. El acceso real exige HTTPS también en un equipo único o en red local. | Administrador y operadores reales configurados; comprobar entrada, salida, cambio de contraseña y acciones permitidas desde la instalación definitiva. |
| P08 · Programar y ensayar respaldos definitivos | Infraestructura; seguridad y responsable del almacén | Comandos y restauración aislada ya existen. Configuración real pendiente de P06 y destino externo. | Copia automática, copia fuera del servidor y revisión de errores configuradas; restauración ensayada con cuentas, existencias e historial en un entorno aislado de esa instalación. |
| P09 · Preparar el inventario inicial real | Responsable de producto; personal del almacén y backend si hay problemas de importación | Cabecera CSV y criterios preparados en [PUESTA-EN-MARCHA.md](PUESTA-EN-MARCHA.md). Espera archivo real, conteo físico y revisión de referencias, códigos y precios. | Importación conciliada por producto con el conteo físico; referencias/códigos únicos, costos y precios revisados; ningún dato ficticio mezclado con los reales. |
| P10 · Ejecutar piloto y decidir el inicio | Responsable de producto; QA, usuario e infraestructura | Plan de piloto preparado en [ACEPTACION-ALMACEN.md](ACEPTACION-ALMACEN.md). Espera P02–P09 y resolución de incidencias que impidan trabajar. | Personas designadas completan una jornada controlada, incluido acceso simultáneo desde varios equipos; conciliar operaciones y existencias, comprobar respaldo y registrar decisión de comenzar o corregir. |

## Perfiles que recibieron la asignación

| Agente | Cargo | Trabajo entregado en esta asignación |
| --- | --- | --- |
| `producto_pendientes` | Responsable de producto | Registro P01–P10, responsables, condiciones de puesta en marcha y preparación del archivo inicial. |
| `diseno_prueba_guiada` | Diseño UX/UI | Guion de observación de claridad con el usuario; la aceptación sigue pendiente. |
| `qa_piloto` | QA | Recorridos de aceptación, dispositivos, permisos, concurrencia y registro de piloto. |
| `infra_puesta_marcha` | Infraestructura | Preparación de instalación, validación Compose y procedimiento de respaldos/recuperación. |
| `seguridad_puesta_marcha` | Seguridad | Preparación de cuentas y permisos y validación dirigida de sesiones, primera cuenta y respaldo. |
| Coordinación | Integración y GitHub | Sincronización del diseño, revisión de los entregables y actualización de la propuesta. |

Los especialistas terminaron la preparación anterior P01–P10; los pendientes humanos o del servidor no continúan ejecutándose en segundo plano. Las nuevas asignaciones A01–A21 son responsabilidades planificadas y no activan agentes. Frontend y backend también atienden las correcciones concretas de P04 cuando se indiquen.

## Responsabilidades de coordinación y diseño

La coordinación integra resultados, conserva el estado de esta lista y publica la versión revisable. La dirección de diseño cerró la revisión visual documentada en [REVISION-CLARIDAD.md](REVISION-CLARIDAD.md); intervendrá si la prueba conjunta exige cambios de jerarquía o interacción. Frontend y backend reciben problemas concretos, en lugar de volver a desarrollar funciones ya terminadas.

## Mejoras futuras: responsables de evaluación, sin aprobación de implementación

| ID | Propuesta | Responsable de evaluación | Estado |
| --- | --- | --- | --- |
| F01 | Recuperación automática de contraseña por correo | Seguridad y backend | Por priorizar. El restablecimiento por propietario y la gestión de acceso de empresas/cuentas ya forman parte de A07/A11/A13. |
| F02 | Conservar borradores al recargar o cerrar | Frontend y backend | Por priorizar; definir recuperación y reintentos antes de implementarlo. |
| F03 | Fotografías de productos | Diseño UX/UI, frontend y backend | Por priorizar; no confundir con el logo de empresa ya incluido en A05/A06. |
| F04 | Consultas paginadas en el listado general | Backend y frontend | Por priorizar según el volumen real. |
| F05 | Lectura de códigos por cámara | Frontend y QA; seguridad para permisos | Por priorizar si el lector físico no cubre la necesidad. |

Estas propuestas no forman parte de las condiciones ya acordadas para iniciar el piloto. Si una necesidad real las vuelve indispensables, producto debe actualizar el alcance y esta lista.

## Trabajo terminado y evidencia

La aplicación incluye compras, ventas, inventario, ajustes, devoluciones, taller, historial, sesiones, permisos y respaldo completo. El diseño simplificó filtros, listado y navegación móvil. La comprobación actual aprobó **44 pruebas de Node y ambas compilaciones**. Los 30 recorridos de interfaz aprobados corresponden a la revisión anterior; los recorridos de navegador de la nueva demo todavía no se ejecutaron. Detalle en [QA.md](QA.md).

La simulación operativa concilió entradas, salidas, devoluciones y anulaciones; corrigió tres fallos. El despliegue externo, las cuentas definitivas, el inventario real y la aceptación conjunta siguen sin completarse.

Evidencia: [entrega](ENTREGA.md), [prueba operativa](PRUEBA-OPERACION.md), [revisión de claridad](REVISION-CLARIDAD.md), [QA](QA.md) y [condiciones para comenzar](PUESTA-EN-MARCHA.md).
