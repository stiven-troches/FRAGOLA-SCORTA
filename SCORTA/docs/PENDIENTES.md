# Pendientes asignados de SCORTA

Actualizado: 19 de noviembre de 2026 (America/Bogota).

La primera demo multiempresa está publicada en [https://fragola-scorta-demo.safeturnip2.chatgpt.site](https://fragola-scorta-demo.safeturnip2.chatgpt.site), con acceso privado. Sites confirmó esa publicación el 19 de noviembre de 2026. **Revisión 2 publicada y confirmada por Sites el 19 de noviembre de 2026.** La guía está en [DEMO.md](DEMO.md). La revisión visual, la prueba conjunta y el uso real del almacén siguen pendientes; la demo guarda datos ficticios en el navegador.

Cada pendiente tiene un responsable principal, una condición para empezar y una evidencia de cierre. «Preparación» significa que puede avanzarse con la información disponible; las pruebas con el usuario, sus equipos o la instalación definitiva siguen abiertas hasta ejecutarse allí. La tabla no implica que todos los agentes estén trabajando simultáneamente.

## Revisión 2: lista nueva y responsables

Ejecución autorizada después de la revisión de la demo. El foco es interfaz y experiencia; las conexiones externas y la formalización legal real continúan aplazadas. Los agentes asignados ejecutaron las partes indicadas; los estados siguientes no afirman envíos ni firmas reales. El logo original se recibió e incorporó posteriormente, como indica R10.

| ID | Ajuste | Responsable | Estado y límite |
| --- | --- | --- | --- |
| R01 | Recordar la sesión entre días y reinicios, sin guardar contraseña. | `review2_sessions` | Código implementado: 30 días absolutos desde login, cookie HttpOnly/Secure en producción, sesiones conservadas en SQLite al reiniciar. Logout, restablecimiento, revocación y vigencia siguen controlando acceso. Revisión visual pendiente. |
| R02 | Conservar información comercial en servidor real. | `review2_sessions` y coordinación | La aplicación real usa SQLite central. La demo sigue siendo una excepción de datos ficticios en IndexedDB por navegador; localStorage recuerda solo su token opaco. No se ha desplegado el servidor de uso real. |
| R03 | Quitar el botón duplicado Registrar pago y renovar. | `review2_owner` | Implementado: acción única dentro de Pagos y renovaciones. |
| R04 | Avisar por WhatsApp tres días antes y confirmar pago/nueva vigencia; omitir aviso obsoleto si renueva. | `review2_owner` | Vistas previas y reglas de fechas implementadas. No se envían mensajes. Conexión WhatsApp Business y control efectivo de entrega/duplicados pendientes para la fase interna. |
| R05 | Pago anticipado conserva días; pago tardío concede un mes desde la fecha de pago. | `review2_owner` y `review2_sessions` | Flujo y propuesta de período implementados; bloqueo manual sigue independiente y se incluye todo el último día en Colombia. |
| R06 | Contrato, términos, privacidad y constancia de aceptación de persona autorizada. | `review2_legal_ui` y coordinación | Solo borradores/vista previa y constancia de ejemplo. No hay firma, persistencia de aceptación ni bloqueo legal real del primer acceso. Pendientes textos finales, revisión jurídica y registro central de versión/fecha/persona. |
| R07 | Recuperar contraseña por correo, enlace de 30 minutos y un solo uso. | Coordinación y `review2_sessions` | Pantallas del flujo y campos de correo por cuenta implementados. Correo guardado queda sin verificar. Envío, verificación, token de recuperación real e invalidación por ese flujo siguen pendientes; la vista previa no cambia contraseñas. El restablecimiento administrativo existente se conserva. |
| R08 | Vendedor con Nueva venta, Inventario y Taller. | `review2_seller` | Implementado: Inventario organiza productos por categorías/búsqueda y los agrega; Taller carga placa/trabajo/mecánico/valor; Nueva venta solo resume y cobra. Administradores conservan sus seis módulos. |
| R09 | Carrito compartido de productos y servicios. | `review2_seller` | Implementado entre pestañas, sin descontar existencias antes de registrar. No se amplía a recuperación automática de borradores tras cerrar/recargar (F02). |
| R10 | Incorporar logo oficial sin alterar diseño, tipografía o colores. | Coordinación | Implementado con el PNG original recibido en SCORTA.7z. Brand.jsx lo carga en login y paneles sin modificar sus bytes. Revisión visual pendiente. |
| R11 | Paleta blanca, negra y amarilla. | `review2_seller`, `review2_owner` y coordinación | Código de interfaz actualizado; botones amarillos con texto negro y barra negra. Revisión visual/dispositivos pendiente. |

Validación transversal: la ejecución final aprobó **86/86 pruebas** y ambas compilaciones. `review2_qa` mantiene pruebas de sesión, restablecimiento/restauración, permisos, tres pestañas, recordatorios calculados y borradores. Los resultados observados, sin atribuir QA visual a SSR, se registran en [QA-REVISION2.md](QA-REVISION2.md). Coordinación integra código, GitHub y publicación; la publicación de revisión 2 está confirmada.

## Ajustes acordados: interfaz, empresas y perfiles

Estado de la primera entrega multiempresa: código integrado, 72 pruebas y ambas compilaciones aprobadas y publicación confirmada. La revisión 2 posterior tiene su propia matriz R01–R11 y resultados en QA-REVISION2.md; el conteo anterior no acredita la nueva ejecución. «Código implementado» no significa aceptación visual ni instalación real. Los resultados observados se registran en [QA-PLATAFORMA.md](QA-PLATAFORMA.md), sin reutilizar como evidencia de cierre los resultados de la interfaz anterior.

Toda la interfaz será en español. La referencia más reciente del login sustituye las propuestas anteriores: fondo oscuro con resplandor amarillo discreto, tarjeta central, logo SCORTA, «Tu negocio, bajo control», Empresa, Usuario, Contraseña e Ingresar. Las maquetas anteriores en inglés son referencias de estructura; deben traducirse antes de aplicarlas.

| ID | Ajuste y criterio de cierre | Agente responsable | Apoyo | Estado de esta entrega |
| --- | --- | --- | --- | --- |
| A01 | Consolidar el diseño en español, colores y estados; sustituir el login anterior por la referencia oscura aprobada. | `direccion_diseno` | `diseno_ux_ui` | Código implementado; revisión visual pendiente. |
| A02 | Implementar el login adaptable con empresa, usuario, contraseña y control para mostrar/ocultar contraseña. Diferenciar el acceso del propietario y el de los empleados de una empresa. | `frontend` | `backend`, `diseno_ux_ui` | Código implementado; revisión visual pendiente. |
| A03 | Crear el perfil «Propietario de SCORTA» para Fragola / Steven, separado de los administradores de empresa. Configurar la credencial inicial fuera del código y GitHub, almacenándola con hash; no incluir contraseñas de prueba como credenciales de producción. | `backend` | `infraestructura` | Código implementado; pruebas automáticas aprobadas. Revisión de uso real pendiente. |
| A04 | Panel del propietario con tarjetas: logo, nombre, URL, estado, vencimiento y días restantes; botón «Crear nueva empresa». Los datos de contacto se consultan al abrir la tarjeta. | `frontend` | `diseno_ux_ui`, `backend` | Código implementado; revisión visual pendiente. |
| A05 | Formulario de empresa: nombre, persona de contacto directo, correo, WhatsApp con indicativo y logo opcional; acceso inicial del administrador; inicio, fin y valor mensual del contrato. Guardar y poder editar esos datos. | `frontend` | `backend`, `diseno_ux_ui` | Código implementado; revisión visual pendiente. |
| A06 | Guardar empresas y logos, generar una URL única por empresa y resolverla contra su empresa correcta. Las URLs example.com de las maquetas son ficticias; el dominio y la configuración real dependen de P06. | `backend` | `infraestructura` | Código implementado; pruebas automáticas aprobadas. Revisión de uso real pendiente. |
| A07 | Detalle de empresa con editar, habilitar, inhabilitar y eliminar. La suspensión conserva datos y bloquea el acceso de sus usuarios; eliminar exige una confirmación clara sobre los datos afectados. | `backend` | `frontend` | Código implementado; pruebas automáticas aprobadas. Revisión de uso real pendiente. |
| A08 | Vigencia del contrato: respetar inicio y fin, incluir todo el día final y bloquear desde el día siguiente según America/Bogota. Aplicar el control en el servidor a las sesiones y solicitudes, además de mostrar el estado. | `backend` | `frontend` | Código implementado; pruebas automáticas aprobadas. Revisión de uso real pendiente. |
| A09 | «Registrar pago y renovar»: proponer un mes desde el vencimiento vigente si paga anticipadamente; si venció, permitir elegir el inicio del nuevo período, por defecto la fecha del pago. Mostrar y permitir ajustar la nueva fecha antes de confirmar. La renovación no retira un bloqueo manual. | `backend` | `frontend` | Código implementado; pruebas automáticas aprobadas. Revisión de uso real pendiente. |
| A10 | Historial manual de pagos y renovaciones: fecha, importe, período anterior/nuevo y responsable. Mostrar avisos de próximo vencimiento y una pantalla de acceso suspendido que explique cómo contactar al propietario. | `backend` | `frontend`, `diseno_ux_ui` | Código implementado; pruebas automáticas aprobadas. Revisión de uso real pendiente. |
| A11 | «Usuarios y permisos» dentro de cada empresa: solo el propietario crea y gestiona cuentas y asigna roles. Admitir dos o más administradores y varios vendedores, todos con usuario y contraseña individuales. | `backend` | `frontend` | Código implementado; pruebas automáticas aprobadas. Revisión de uso real pendiente. |
| A12 | Permisos: administradores acceden a todos los módulos de su empresa; vendedores solo a los módulos y acciones autorizados. Los administradores de empresa no crean usuarios ni gestionan roles, empresas o contratos. En revisión 2 se habilitan Nueva venta, Inventario de consulta y Taller para registrar mano de obra; puede vender productos y mano de obra, agregar al carrito y consultar sus propias ventas/servicios. Anulaciones y devoluciones requieren autorización del administrador. Proteger interfaz y API. | `backend` | `frontend`, coordinación | Código implementado; pruebas automáticas aprobadas. Revisión de uso real pendiente. |
| A13 | «Mi perfil» al pulsar el nombre: nombre/usuario, empresa, rol y cambio de contraseña; cierre de sesión. El nombre es el único acceso al perfil: eliminar el enlace duplicado «Mi perfil». En la tarjeta del propietario mostrar la fecha del cambio y la opción de restablecer, sin revelar contraseñas actuales. | `frontend` | `backend` | Código implementado; revisión visual pendiente. |
| A14 | «Acceder como soporte» desde el propietario, para atender una solicitud del cliente: registrar motivo e identidad del propietario. Mostrar en Movimientos fecha/hora, «Steven · Soporte», acción, motivo y valores anteriores/nuevos cuando corresponda. No atribuir las intervenciones a un empleado del cliente. | `backend` | `frontend` | Código implementado; pruebas automáticas aprobadas. Revisión de uso real pendiente. |
| A15 | Separar completamente los datos de cada empresa y las facultades de propietario, administrador y vendedor; verificar el alcance de cada sesión, URL, documento, consulta y operación de soporte. | `backend` | `qa_piloto` | Código implementado; pruebas automáticas aprobadas. Revisión de uso real pendiente. |
| A16 | Inicio/Dashboard del administrador de empresa con logo/empresa/usuario, Nueva venta, Ver inventario, Ingresar mercancía, ventas del día, productos por reponer, agotados y últimas operaciones, usando solo datos de esa empresa. El vendedor inicia directamente en Nueva venta, según A22. Mantener importes y unidades comprensibles y una pantalla despejada. | `frontend` | `diseno_ux_ui`, `backend` | Código implementado; revisión visual pendiente. |
| A17 | Barra lateral negra permanente; al navegar cambia el contenido de la derecha. Orden para el administrador: Nueva venta, Taller, Inventario, Compras, Movimientos y Dashboard. En revisión 2 el vendedor ve Nueva venta, Inventario y Taller de registro; el seguimiento administrativo completo del taller queda reservado al administrador. «Mi perfil» se abre desde el nombre; las secciones exclusivas del propietario quedan en su propio panel. | `frontend` | `diseno_ux_ui` | Código implementado; revisión visual pendiente. |
| A18 | Adaptación a celular, tableta, PC y monitores: navegación compacta siempre disponible en pantallas pequeñas, formularios/tarjetas/tablas adaptados, controles táctiles y texto legible, sin desplazamiento horizontal global. | `frontend` | `diseno_ux_ui`, `qa_piloto` | Código adaptable implementado; navegador y dispositivos físicos pendientes. |
| A19 | Revisar coherencia visual, claridad, navegación y formularios con el usuario; validar la versión en español y resolver los hallazgos observados. | `diseno_prueba_guiada` | `direccion_diseno`, `diseno_ux_ui` | Pendiente de revisión visual y prueba conjunta con el usuario. |
| A20 | Pruebas de empresas aisladas, múltiples usuarios, permisos, vigencia, renovación anticipada/vencida, bloqueo manual, contraseñas, soporte e historial; incluir A22–A32: ventas de productos, mano de obra y mixtas, carrito entre pestañas, placa/cliente, fotos/búsqueda, pagos, devoluciones, comprobante y WhatsApp opcional, en celular y PC. Verificar envío omitido o fallido sin duplicar ni revertir la venta; recorridos visuales y dispositivos reales. Registrar evidencias actuales sin reutilizar resultados anteriores como aprobación del nuevo alcance. | `qa_piloto` | `backend`, `frontend` | 72 pruebas Node/SSR aprobadas y ambas compilaciones correctas; navegador y dispositivos reales pendientes. |
| A21 | Integrar y documentar los cambios terminados, sincronizar GitHub y actualizar la demo para revisión cuando se autorice la ejecución/publicación correspondiente. La demo local ficticia no acredita funcionamiento de varias empresas en un servidor. | Coordinación (`/root`) | `demo_interfaz`, `infra_puesta_marcha` | Integración y sincronización GitHub completadas; demo multiempresa publicada y confirmada. Aceptación visual pendiente. |

### Ajustes aprobados del vendedor, taller y ventas

Estas tareas amplían A12/A13/A17/A20 y ya cuentan con implementación de código. Sus pruebas automáticas y ambas compilaciones están aprobadas; los recorridos visuales y en dispositivos reales siguen pendientes.

| ID | Ajuste y criterio de cierre | Agente responsable | Apoyo | Estado de esta entrega |
| --- | --- | --- | --- | --- |
| A22 | Pantalla inicial del vendedor: abrir Nueva venta; barra lateral negra permanente con Nueva venta, Inventario y Taller de registro. El nombre abre Mi perfil y no se repite como otro enlace. Mantener la interfaz adaptable y consultar sus ventas desde Nueva venta. | `frontend` | `diseno_ux_ui`, `backend` | Código implementado; revisión visual pendiente. |
| A23 | Inventario del vendedor: foto del producto, nombre, referencia, existencias y precio de venta; búsqueda por palabras clave, nombre, marca, referencia o código; filtros compactos plegados; acción Agregar al carrito. Solo el administrador edita productos y carga/cambia fotos. El vendedor no ajusta existencias ni consulta costos de compra. | `frontend` | `backend`, `diseno_ux_ui` | Código implementado; revisión visual pendiente. |
| A24 | Carrito único entre Inventario y Nueva venta: conservar artículos al navegar, agregar y retirar productos y editar cantidades. No descontar existencias al agregar al carrito; comprobar stock y descontarlo únicamente al registrar la venta, sin duplicados por reintento. Conservar al cambiar de pestaña no amplía por sí solo el alcance a recuperar borradores después de cerrar/recargar (F02). | `frontend` | `backend` | Código implementado; pruebas automáticas aprobadas. Revisión de uso real pendiente. |
| A25 | Nueva venta admite productos, solo mano de obra o ambos en un mismo cobro. En revisión 2, agregar desde Taller la mano de obra con placa, trabajo realizado, mecánico y valor editable por servicio; permitir varios servicios. De la moto se registra únicamente la placa: no marca ni modelo. Mostrar repuestos, mano de obra y total por separado; solo los repuestos afectan inventario. Venta y servicio deben quedar vinculados para no duplicar el cobro ni los totales. | `backend` | `frontend`, `diseno_ux_ui` | Código implementado; pruebas automáticas aprobadas. Revisión de uso real pendiente. |
| A26 | Registrar cliente del almacén con nombre/teléfono y moto con placa en campos separados. Buscar por placa, nombre o teléfono y recuperar datos para confirmar el cliente. Historial por placa: visitas, fechas, servicios, mecánico, repuestos y cobros; historial por cliente: motos vinculadas, compras y gasto total. Un cliente puede tener varias motos; la placa no sustituye al cliente. Contabilizar compras/servicios sin duplicar la misma venta, excluir anulaciones y descontar devoluciones. | `backend` | `frontend` | Código implementado; pruebas automáticas aprobadas. Revisión de uso real pendiente. |
| A27 | Taller para administrador de empresa: consultar trabajos y estado, placa y cliente asociados, mecánico responsable, repuestos utilizados y cobro desglosado de productos/mano de obra; acceder al historial de la moto o cliente y a la venta vinculada. Registrar un servicio desde Nueva venta no genera un segundo cobro independiente en Taller. | `frontend` | `backend`, `diseno_ux_ui` | Código implementado; pruebas automáticas aprobadas. Revisión de uso real pendiente. |
| A28 | Registrar el medio de pago al finalizar la venta: efectivo, transferencia o tarjeta. Conservarlo en el detalle y en el comprobante. Es un registro de la operación; no implica procesar cobros con un banco o una pasarela. | `backend` | `frontend` | Código implementado; pruebas automáticas aprobadas. Revisión de uso real pendiente. |
| A29 | Consulta del vendedor de sus propias ventas y servicios, con detalle de productos, mano de obra, cliente/placa, importes y medio de pago; acceso desde Nueva venta, sin habilitar módulos administrativos ni datos de otros vendedores. | `frontend` | `backend` | Código implementado; pruebas automáticas aprobadas. Revisión de uso real pendiente. |
| A30 | Anulaciones y devoluciones con autorización del administrador de la empresa. Vincular la reversión a la venta original, registrar motivo, responsable y autorización; conciliar existencias y montos y reflejarla en los historiales y comprobantes correspondientes. El vendedor no puede autoautorizarla. | `backend` | `frontend` | Código implementado; pruebas automáticas aprobadas. Revisión de uso real pendiente. |
| A31 | Comprobante de venta descargable y compartible: empresa, número/fecha, vendedor, cliente/placa cuando se hayan registrado, productos, servicios, cantidades, importes, total y medio de pago. Generarlo después de guardar la operación. Es un comprobante comercial; la facturación electrónica DIAN no está incluida y requiere una integración aparte. | `backend` | `frontend` | Código implementado; pruebas automáticas aprobadas. Revisión de uso real pendiente. |
| A32 | Después de registrar la venta, opción Enviar comprobante por WhatsApp al número del cliente del almacén registrado. Si falta, permitir agregarlo u omitir envío. Abrir WhatsApp con un mensaje y enlace al comprobante para que el vendedor confirme; proteger el acceso al documento de cada empresa. Omitir, cancelar o fallar el envío no cancela ni duplica la venta guardada. Esta tarea no incluye mensajería automática por API de WhatsApp Business. | `frontend` | `backend`, `infraestructura` | Código implementado; pruebas automáticas aprobadas. Revisión de uso real pendiente. |

### Decisiones que deben respetar los agentes

- El propietario del software administra clientes, cuentas, roles y contratos; «administrador de empresa» se refiere exclusivamente a la operación de una empresa cliente.
- El administrador de empresa conserva acceso a los módulos de su negocio, con la gestión de usuarios y roles reservada al propietario. En revisión 2 los módulos del vendedor son Nueva venta, Inventario de consulta y Taller de registro; sus ventas y servicios se consultan dentro de Nueva venta. La gestión del taller y demás módulos administrativos corresponde a los administradores.
- Mantener separadas la suspensión por vencimiento y la suspensión manual. Habilitar manualmente una empresa no sustituye actualizar una vigencia vencida. Todas las fechas se interpretan con el calendario de Colombia.
- La contraseña vigente no se muestra al propietario. Se permite restablecerla, y el acceso de soporte utiliza la identidad del propietario y deja historial visible para el cliente.
- La interfaz de empresas/contratos es un alcance nuevo: sus resultados actuales se registran en QA-PLATAFORMA.md. Las 44 pruebas y las compilaciones anteriores no lo validan por sí solas. La instalación de producción y sus pendientes P05–P10 continúan abiertos.
- Faltan decisiones de operación antes del uso real: dominio/URLs definitivos y contacto del propietario que aparecerá al suspender el acceso. No bloquean registrar o revisar esta especificación.

## Entrega y validación con el usuario

| ID | Responsable principal y apoyo | Estado y dependencia | Resultado que permite cerrarlo |
| --- | --- | --- | --- |
| P01 · Sincronizar diseño y registro de tareas con GitHub | Coordinación | Sincronización anterior terminada y documentada en `b8f6076`. La actualización de código, documentación y demo de la plataforma nueva se sigue en A21. | Rama remota y propuesta de revisión actualizadas con el diseño y los documentos; comprobar el commit publicado. No incluye fusionar ni desplegar. |
| P02 · Revisar una venta de mostrador | Diseño UX/UI; usuario y coordinación | Espera la prueba conjunta de la plataforma nueva. La revisión visual histórica de la versión anterior no cierra esta aceptación. | El usuario recorre búsqueda, cantidad, total y confirmación, identifica las existencias restantes y deja observaciones de claridad y comodidad. |
| P03 · Revisar recepción, devolución y errores habituales | QA; diseño, producto y usuario | Guiones preparados; ejecución conjunta pendiente. Véanse [GUIA-PRUEBA-USUARIO.md](GUIA-PRUEBA-USUARIO.md) y [ACEPTACION-ALMACEN.md](ACEPTACION-ALMACEN.md). | Completar compra y devolución; probar stock insuficiente y referencia repetida; verificar mensajes comprensibles, conservación del formulario y cantidades. |
| P04 · Resolver problemas de la prueba conjunta | Frontend; diseño y QA. Backend si cambia una regla de datos | Condicionado a hallazgos concretos de P02/P03. El nuevo alcance acordado de interfaz y empresas se registra por separado en A01–A32. | Registrar el problema, aplicar la corrección, repetir el caso afectado y confirmar que el usuario entiende el resultado. |

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

| Agente | Cargo | Trabajo entregado en esta asignación | Código implementado; pruebas automáticas aprobadas. Revisión de uso real pendiente. |
| --- | --- | --- |
| `producto_pendientes` | Responsable de producto | Registro P01–P10, responsables, condiciones de puesta en marcha y preparación del archivo inicial. |
| `diseno_prueba_guiada` | Diseño UX/UI | Guion de observación de claridad con el usuario; la aceptación sigue pendiente. |
| `qa_piloto` | QA | Recorridos de aceptación, dispositivos, permisos, concurrencia y registro de piloto. |
| `infra_puesta_marcha` | Infraestructura | Preparación de instalación, validación Compose y procedimiento de respaldos/recuperación. |
| `seguridad_puesta_marcha` | Seguridad | Preparación de cuentas y permisos y validación dirigida de sesiones, primera cuenta y respaldo. |
| Coordinación | Integración y GitHub | Sincronización del diseño, revisión de los entregables y actualización de la propuesta. |

La ejecución de A01–A32 fue autorizada y se distribuyó entre platform_backend (motor/servidor), owner_workspace (panel propietario), client_workspace (cliente/vendedor), platform_demo (demo) y platform_qa (validación), con integración de Coordinación. Los nombres funcionales de las tablas conservan el responsable de cada área. Los pendientes humanos, dispositivos reales y servidor definitivo P05–P10 siguen abiertos.

## Responsabilidades de coordinación y diseño

La coordinación integra resultados, conserva el estado de esta lista y publica la versión revisable. La revisión visual de [REVISION-CLARIDAD.md](REVISION-CLARIDAD.md) corresponde a la interfaz anterior. La nueva plataforma requiere su propia revisión conjunta y comprobación en dispositivos; no se declara cerrada por reutilizar aquellas capturas.

## Mejoras y conexiones pendientes de fase posterior

| ID | Propuesta | Responsable de evaluación | Estado |
| --- | --- | --- | --- |
| F01 | Conexión de recuperación automática por correo | Coordinación y seguridad/backend | Flujo de interfaz aprobado en R07. Verificación y envío real aplazados. El restablecimiento por propietario ya existe en A13. |
| F02 | Conservar borradores al recargar o cerrar | Frontend y backend | Implementado en revisión 4: copia privada por usuario y empresa, autosave, control de conflictos y cobro idempotente. |
| F04 | Consultas paginadas en el listado general | Backend y frontend | Por priorizar según el volumen real. |
| F05 | Lectura de códigos por cámara | Frontend y QA; seguridad para permisos | Por priorizar si el lector físico no cubre la necesidad. |

F03 (fotografías de productos) fue aprobado y trasladado a A23. Los logos de empresa permanecen en A05/A06.

Estas propuestas restantes no forman parte de las condiciones ya acordadas para iniciar el piloto. Si una necesidad real las vuelve indispensables, producto debe actualizar el alcance y esta lista.

## Trabajo terminado y evidencia

La nueva plataforma incorpora empresas, contratos, perfiles, soporte trazable, venta mixta, clientes/placas y comprobantes, además de conservar inventario y operaciones previas. La compilación de aplicación y demo se verifica en esta iteración; el conteo final de pruebas se consolida en [QA-PLATAFORMA.md](QA-PLATAFORMA.md). La ejecución visual y los equipos reales siguen pendientes. Los 44 casos y 30 recorridos históricos documentados en [QA.md](QA.md) corresponden al alcance anterior y no se presentan como aceptación de esta plataforma.

La simulación operativa concilió entradas, salidas, devoluciones y anulaciones; corrigió tres fallos. El despliegue externo, las cuentas definitivas, el inventario real y la aceptación conjunta siguen sin completarse.

Evidencia actual: [entrega](ENTREGA.md), [API](PLATFORM-API.md), [QA de plataforma](QA-PLATAFORMA.md) y [demo](DEMO.md). Antecedentes: [prueba operativa](PRUEBA-OPERACION.md), [revisión de claridad](REVISION-CLARIDAD.md) y [QA anterior](QA.md). [Condiciones para comenzar](PUESTA-EN-MARCHA.md).

## Ajustes de revisión 3 · 19 de noviembre de 2026

Ejecución autorizada por el propietario. Responsable de implementación e integración: Coordinación (frontend). No se conectan APIs nuevas en esta revisión.

| Ajuste | Estado |
| --- | --- |
| Logo oficial en login, cabecera del propietario y barras laterales de administrador y vendedor | Implementado con el PNG original extraído de SCORTA.7z el 19 de noviembre de 2026. Mismos bytes, tipografía y colores; solo tamaño proporcional por pantalla. Ver src/assets/LEEME-LOGO.md. |
| Cabecera del propietario fija al desplazar | Implementado con posición sticky; conserva el espacio de la cabecera y permite superponer los diálogos. Revisión manual del desplazamiento pendiente. |
| Login: «Tu negocio, bajo control.» | Implementado. |
| Taller: quitar los dos textos auxiliares indicados | Implementado; se conserva el formulario y el registro de servicios. |
| Inventario: mínimo en amarillo y agotados en rojo | Implementado. Cero tiene prioridad sobre el mínimo. Se conservan cantidades y «Agotado» para identificar el estado sin depender del color. |

Validación: 87/87 pruebas aprobadas, incluidas las SSR de existencias cero, iguales al mínimo, por debajo y por encima del mínimo. Compilaciones de aplicación y demo aprobadas; git diff --check sin errores. No se declara QA visual: el entorno no dispone del control de navegador requerido por Sites.

Demo actualizada y publicación confirmada el 19 de noviembre de 2026, 12:42 (Colombia): https://fragola-scorta-demo.safeturnip2.chatgpt.site. Fuente de aplicación: `ca386cb52214fdc683f9dc3a579ce243dcd6e7e5`. Fuente de Site: `87453a3921298fe0b7b218ef4ca9170ec05c024a`. Despliegue: `appgdep_6aff34ea8a8081919f1e6cb5389996cc`, resultado `succeeded`. Se conserva acceso privado del propietario.

### Incorporación del logo original

Archivo recibido y extraído correctamente de `SCORTA.7z`. Incorporado en las cuatro ubicaciones compartidas por Brand: login, propietario, administrador y vendedor. Se verifica integridad del PNG original y su inclusión en las compilaciones de aplicación y demo. La recepción del archivo resuelve el bloqueo de marca descrito históricamente en la revisión 2. Revisión visual de la interfaz pendiente.

## Revisión 4 · carrito persistente y logo transparente

Aprobada por el propietario. Implementación e integración: Coordinación (frontend/backend). No se activan conexiones externas.

| Ajuste | Estado |
| --- | --- |
| Recuperar la venta al recargar o volver a entrar | Implementado. Productos, servicios, servicio sin agregar y datos del cliente guardados por usuario/empresa. En uso real se almacenan en SQLite del servidor; en el demo ficticio en IndexedDB. El navegador real solo conserva la sesión. |
| Cantidad y total visibles al navegar | Implementado: resumen sticky con productos, servicios, total y acceso a Nueva venta. |
| Confirmaciones | Implementado: vaciar venta y retirar productos/servicios; se conservan las confirmaciones existentes de eliminación y anulación. |
| Errores corregibles | Implementado: errores de cantidad/existencias/precio junto al producto y errores de teléfono, placa y campos del servicio. El carrito se conserva tras un rechazo. |
| Adaptación móvil | CSS ajustado: resumen compacto, formularios legibles, botones de al menos 44 px y logo proporcional sin fondo. Revisión visual/dispositivos pendiente. |
| Prueba completa juntos | Guion listo en REVISION4-CARRITO.md. Pendiente de realizar con el propietario; las pruebas automáticas no la sustituyen. |
| Logo transparente original | PNG RGBA 1122×1402 recibido en ZIP; sustituido íntegro sin redibujar, cambiar colores ni tipografía. Es raster con transparencia, no SVG. |

Las últimas ediciones se guardan tras 400 ms de pausa. «Venta pendiente guardada» confirma la persistencia. Al ocultar/cerrar la página se intenta completar el guardado; sin conexión se avisa y se debe reintentar antes de cerrar. Los borradores no reservan existencias. Dos pestañas no se sobrescriben: ante un conflicto hay que cargar expresamente la versión guardada. El cobro guarda primero su identificador de reintento; venta y limpieza de borrador se confirman juntas.

## Regla de contraseñas · actualización aprobada

Mínimo 8 y máximo 200 caracteres, con al menos un número, una mayúscula, una minúscula y un símbolo. Implementado en creación de empresas/usuarios, restablecimiento por propietario y cambio de clave propio; formularios, ayuda y backend comparten la regla. El login verifica los hashes existentes sin exigir retroactivamente la nueva composición. El cifrado/hash, límites de intentos y revocación de sesiones se conservan.

Estado histórico de la actualización de contraseñas: JE estaba pendiente de una clave válida. Resuelto en revisión 5: el propietario proporcionó una clave que cumple la regla y la cuenta se preparó solo en el demo, con hash y sin publicar su contraseña.

Los cambios de marca de empresa, Nueva venta, operación compartida y ticket estaban anotados en esa actualización. Se ejecutaron posteriormente, junto con soporte y navegación móvil, en la revisión 5 descrita abajo.

Validación de la regla: 99/99 pruebas Node aprobadas, incluidas longitud/composición, creación/restablecimiento/cambio y acceso con hash anterior. Compilaciones de aplicación y demo aprobadas. Revisión visual pendiente.

## Revisión 5 · ajustes autorizados y ejecutados

| Ajuste | Responsable | Resultado |
| --- | --- | --- |
| Identidad de cada cliente | client_ui; coordinación | Logo y nombre de empresa predominan en su panel. SCORTA queda como texto discreto; login y propietario conservan la marca grande. |
| Nueva venta sencilla | client_ui | Carrito y cobro sin total superior duplicado; cliente opcional plegable; consultas y vaciado en Más opciones. Borradores y reintentos se conservan. |
| Navegación móvil | client_ui | Barra inferior fija Venta, Inventario, Taller y Más. Módulos adicionales por permisos; computador conserva su barra lateral. |
| Operación compartida | client_ui | Administrador y vendedor usan el mismo carrito, inventario y registro de mano de obra. El administrador mantiene herramientas y seguimiento adicionales. |
| Ticket de venta | receipts | Formatos térmicos 80/58 mm, logo y datos reales de empresa, productos/servicios/pago. Imprimir/PDF, descarga HTML y WhatsApp manual por enlace. |
| Soporte desde perfil | support_backend; owner_support_ui | Crear ticket, campana por empresa, conversación, respuesta y notificación por usuario; abierto/en atención/resuelto, con permisos y lectura persistente. |
| JE Accesorios y Repuestos | je_trial; coordinación | Empresa en el demo, usuario joan, Jhoan Monsalve, +573205878749, mensualidad 80.000 COP, 30 días inclusivos desde primera preparación e inventario vacío. Logo JPEG original. Email/NIT/dirección vacíos hasta recibirlos. Solo hash de la contraseña; no se imprime ni incluye en accesos públicos. |
| Datos del ticket | support_backend; owner_support_ui | Campos NIT y dirección opcionales en creación/edición de empresa; se muestran en el ticket cuando existen. |

**Validación:** 122/122 pruebas aprobadas, sin omisiones, incluida la prueba del acceso de JE con la clave entregada por entrada oculta. Compilaciones de aplicación y demo aprobadas; git diff --check limpio. No se declara revisión visual, prueba de impresora térmica ni aceptación de celular real: el entorno no tiene cua_repl.js. El aviso de tamaño del chunk del demo no impide compilar.

La migración del demo agrega JE sin borrar empresas, sesiones, inventario, borradores o tickets existentes y sin restablecer contraseñas. Una JE ya creada se conserva; una eliminación manual no se deshace al recargar. El demo sigue siendo una copia por navegador. No se creó una instalación compartida real ni se conectaron WhatsApp automático/correo/firma. Quedan revisión conjunta de administrador, pruebas en dispositivos/impresora y P05–P10. Guion: [REVISION5-ENTREGA.md](REVISION5-ENTREGA.md).

## Revisión 6 · administración del negocio

Se ejecutaron los seis ajustes aprobados sin agregar pestañas principales. Dashboard → Administración abre herramientas; Taller → Mecánicos da acceso al catálogo; Perfil → Mi suscripción es de solo lectura.

| Ajuste | Responsables | Entrega |
| --- | --- | --- |
| Cierre de caja | admin_backend, admin_tools_ui, coordinación | Conciliación de ventas netas de una fecha por efectivo/transferencia/tarjeta, recibido real y diferencias. Autor, hora y observación. Registro único e inmutable, con confirmación previa e idempotencia. |
| Resumen por fechas | admin_reports, admin_tools_ui | Productos, mano de obra, devoluciones, anulaciones, ventas netas y margen de productos con costo histórico. Costos incompletos no generan utilidad ficticia. |
| Mecánicos | admin_backend, admin_tools_ui, coordinación | Crear/editar/desactivar/reactivar; selector en Taller para ambos roles. Nombre histórico conservado y cobros/trabajos del período; históricos sin asociación visibles aparte. |
| Reposición | admin_reports, admin_tools_ui | Agotados y productos en mínimo, búsqueda, sugerencia para superar mínimo y CSV de filas visibles. No crea compras ni modifica existencias. |
| Mi suscripción | admin_subscription | Estado, vigencia, días, mensualidad y contacto del propietario si fue configurado. Acceso a soporte; sin modificar contratos o pagos. |
| Exportar reportes | admin_reports, admin_tools_ui | Ventas/compras por período y existencias actuales en CSV, con columnas explícitas y protección frente a fórmulas. |

**Validación:** 145/145 pruebas, sin omisiones, y compilaciones de aplicación/demo aprobadas. Se conserva el acceso probado de JE por entrada oculta. Dockerfile incluye los dos módulos nuevos en ambas etapas; no se desplegó un servidor real ni un contenedor.

El cierre es una conciliación de ventas: devoluciones/anulaciones se atribuyen a la fecha original de venta, según su estado actual. No reconstruye flujos históricos por fecha de devolución ni agrega saldo inicial, gastos o retiros. Un cierre guardado no se recalcula; si las ventas de esa fecha cambian, se avisa al compararlo con el estado actual. Si hay cobros con medio de pago desconocido, se pide revisarlos antes de cerrar.

Las nuevas consultas y mutaciones requieren administrador; el vendedor recibe solo el catálogo activo de mecánicos y no recibe cierres. Continúan revisión conjunta, dispositivos/impresora reales y P05–P10. Guion: [REVISION6-ADMINISTRADOR.md](REVISION6-ADMINISTRADOR.md).

## Revisión 7 · Resumen general por período

Ejecutado lo aprobado: Dashboard pasa a llamarse **Resumen general** en PC y menú Más del celular. Responsables: overview_data (cálculos), overview_ui (interfaz), coordinación (integración/API/verificación/publicación).

- Rango Desde/Hasta obligatorio, inclusivo en Bogotá; atajos Hoy, Ayer, Esta semana (lunes) y Este mes. Abre con el mes actual hasta hoy.
- Ventas netas totales, venta de productos, mano de obra facturada y servicios registrados. Cantidad de ventas con ingreso neto, venta promedio, devoluciones y anulaciones.
- Qué vendimos: unidades netas, importes y ganancia de cada producto; diez filas iniciales y Ver más, calculando los totales sobre todos los registros.
- Ranking seleccionable: cinco más/menos vendidos entre los de unidades netas positivas y cinco con mayor/menor ganancia en dinero entre los de costo completo. Las pérdidas son valores válidos; los productos sin costo no se ordenan como si tuvieran ganancia cero.
- Lista plegable del catálogo actual sin ventas netas en el rango. No afirma qué catálogo existía históricamente. Los productos retirados que se vendieron conservan su detalle, sin enlazar una ficha inexistente.
- Bloque final **Ganancia total de productos del período**, importe y porcentaje agregado. Usa costos históricos de las líneas, no costo actual ni promedio de márgenes individuales. Si faltan costos, el total queda incompleto; sin venta neta de productos el porcentaje no tiene base y muestra —.
- Mano de obra separada como ingreso, sin inventar su ganancia porque sus costos no están registrados. Correcciones se atribuyen a la fecha original de venta y al estado neto actual, igual que los reportes existentes.

**Verificación:** 161/161 pruebas aprobadas sin omisiones, incluidas seis de cálculo, tres de API y siete de SSR. Compilaciones aplicación/demo correctas; diff limpio. GET /api/v2/overview exige administrador de su empresa o propietario en soporte y no modifica datos. Se conserva la consulta /api/v2/reports. Los accesos de Administración y Ver ventas permanecen; este último abre el mismo rango seleccionado.

Pendientes: revisión conjunta en dispositivos/impresora reales y P05–P10. El entorno no tiene cua_repl.js, por lo que no se declara QA visual. Guion: [REVISION7-RESUMEN.md](REVISION7-RESUMEN.md).

## Revisión 8 · simplificación de Resumen general

Ejecutados los ajustes solicitados. Sustituye los controles y bloques de interfaz descritos en revisión 7. Responsable: coordinación, implementación y verificación.

- FECHA abre Desde/Hasta con FILTRAR y LIMPIAR; eliminados Hoy, Ayer, Esta semana y Este mes. Las ediciones son borrador hasta filtrar; fechas incompletas, imposibles o invertidas conservan el período aplicado y muestran un error. Escape/clic exterior cierran sin aplicar.
- Inicio conserva mes actual hasta hoy. LIMPIAR elimina ambos límites y muestra todo el historial.
- SIN VENTAS en Productos destacados, diez resultados iniciales y Ver más; eliminada la lista plegable aparte.
- Retirados los cuatro textos indicados y toda la franja de ventas con ingreso neto, venta promedio, devoluciones y anulaciones.
- Títulos y encabezados de tabla en mayúsculas, incluidas etiquetas del detalle móvil.
- Cálculos financieros, permisos y correcciones históricas conservados.

**Verificación:** 166/166 pruebas aprobadas sin omisiones; aplicación y demo compilan; diff sin errores. Incluye pruebas de borrador/aplicación/validación/limpieza, rango histórico y selección sin ventas. No hay herramienta de navegador disponible para QA visual. Pendientes: revisión conjunta en dispositivos/impresora reales y P05–P10; APIs externas y servidor definitivo conservan su alcance previo. Guion: [REVISION8-RESUMEN.md](REVISION8-RESUMEN.md).

## Revisión 9 · ajustes aprobados de administrador y Excel

Lista ejecutada por coordinación; sustituye la presentación y funciones anteriores donde corresponda. Detalle y guion: [REVISION9-ADMINISTRADOR.md](REVISION9-ADMINISTRADOR.md).

- Mayúsculas en títulos/encabezados y bordes más oscuros; descripción sin referencia en destacados/Qué vendimos; retirado «excluye anulados».
- Tabla de mano de obra, Excel .xlsx de las tres tablas del resumen y reparto de mano de obra en la ganancia final, con suma general.
- Mecánicos registrados/activos obligatorios, porcentaje editable, nombre/porcentaje histórico fijado en cada venta, valores del mecánico/negocio y Ver trabajos con placa/servicio/Excel por fechas.
- Texto largo e Históricos sin asociación retirados sin borrar ventas. Sin porcentajes históricos o desglose de devolución no se inventan totales.
- Menú Administración sin Nueva venta, Ver inventario ni Ingresar mercancía; recepción solo desde Compras.
- Reposición con solo Excel y tabla de estado/stock/mínimo, sin buscador, textos, cuadros o compra sugerida. Reportes enfocados en balances/Excel y Movimientos en historial de operaciones.
- Compra manual o Excel con plantilla, vista previa, validación completa y varias líneas en una compra atómica/idempotente. El importador de productos CSV de Inventario se conserva separado.

181/181 pruebas aprobadas, sin omisiones. Aplicación/demo compilan. Pendiente revisión conjunta visual, Excel de escritorio y equipos/impresora reales; P05–P10 y conexiones externas mantienen su alcance previo. Configurar porcentajes en mecánicos ya existentes antes de nuevos servicios; no se modifica retroactivamente el reparto de ventas antiguas.
