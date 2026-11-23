# API de plataforma SCORTA

Motor universal `platform.mjs`: `await createPlatform({owner:{company,username,password,name?}, ownerContact?, legacyState?})` crea estado privado. `await platformRequest(state,{method,path,body?,token?,clientKey?,expectedCompanyId?,enforceContext?},{now?,baseUrl?})` retorna `{state,status,body,token?}`. `now` admite fecha, timestamp o función. Nunca exponer el estado privado. `token` ausente conserva cookie; string establece sesión; null elimina cookie. PBKDF2/SHA-256, contraseñas 8–200 caracteres, con número, mayúscula, minúscula y símbolo. `companyStatus(company, now?)`, `renewalProposal(company, now?)` y `dateBogota(now?)` son helpers exportados.

## Rutas

- GET `/api/v2/session` y `/api/v2/data`: mismo envelope.
- POST `/api/v2/login`: `{company,username,password}` -> envelope y token.
- POST `/api/v2/logout`: `{}` -> `{ok:true}` y token null.
- POST `/api/v2/password`: `{currentPassword,newPassword}` -> `{ok:true}`, invalida todas las sesiones del usuario.
- POST `/api/v2/action`: acción abajo -> envelope actualizado.
- GET `/api/v2/draft` y POST `/api/v2/draft`: borrador privado descrito abajo.
- GET `/api/v2/reports?from=YYYY-MM-DD&to=YYYY-MM-DD` y `/api/v2/overview?from=YYYY-MM-DD&to=YYYY-MM-DD`: reportes autorizados por período.
- GET `/api/v2/receipt/:token`: comprobante público con token opaco, expira a los 7 días; `{company,sale,expiresAt}`. Enlace navegable `/receipt/:token`.

Errores: `{error,code?}` con status HTTP. 401 sin sesión; 403 sin permiso o empresa suspendida (`COMPANY_DISABLED`, `CONTRACT_EXPIRED`, `CONTRACT_NOT_STARTED`); 409 revisión obsoleta. El error de suspensión incluye `company:{name,status,endDate}` y `ownerContact`. No divulgar credenciales.

## Transporte HTTP y contexto de empresa

`platform-server.mjs` conserva la query del URL al llamar al motor. Las solicitudes que modifican datos requieren JSON y `Origin` igual al origen configurado. En producción se usa HTTPS; no se confía en un encabezado de proxy enviado por el cliente para seleccionar ese origen. La cookie `scorta_platform` es HttpOnly y SameSite Strict, con Secure en producción.

El primer `GET /api/v2/session` permite descubrir la sesión sin contexto previo. Después, cada lectura o cambio autenticado incluye **`X-SCORTA-Company`** con el `session.companyId` que la pantalla muestra, o **`@owner`** para el propietario fuera de soporte. Una acción también puede incluir `expectedCompanyId` en su cuerpo; si aparecen ambos deben coincidir. No se debe enviar el `companyId` de destino de una acción administrativa como si fuera el contexto actual del propietario.

El adaptador HTTP exige ese contexto: falta -> `428 CONTEXT_REQUIRED`; valores contradictorios o inválidos -> `400 INVALID_CONTEXT`; una empresa de pantalla diferente a la activa en la sesión compartida -> `409 COMPANY_CONTEXT_CHANGED`, sin aplicar el cambio. Login, logout y comprobantes públicos no exigen este contexto; `/api/v2/session` inicial queda exceptuado. El motor puro admite llamadas internas antiguas sin él, mientras los adaptadores de navegador lo exigen mediante `enforceContext:true`.

`support.start` envía el contexto anterior (`@owner` normalmente) y el `companyId` de destino; `support.end` envía la empresa de soporte actual. Una transición cuya respuesta se perdió sólo puede reconocerse como repetida si su `requestId`, contenido e identidad coinciden con el registro y la sesión continúa en el contexto resultante. Una pestaña obsoleta no puede escribir en la empresa que otra pestaña abrió: debe recargar para confirmar dónde está trabajando.

El login admite cuerpos de hasta 8 KB y campos acotados. El motor limita intentos a 60 por origen/minuto y 10 fallidos por empresa/usuario/origen durante 15 minutos; el adaptador HTTP añade una barrera de 120 por origen/minuto antes de abrir el estado. Se conserva un número acotado de registros y se podan los vencidos. Un límite devuelve `429 RATE_LIMITED`, `retryAfterSeconds` y, en HTTP, `Retry-After`. El origen de red procede del socket, no de encabezados enviados por el cliente.

## Envelope

`{session,revision,companies?,users?,payments?,state?}`

Session: `{userId,username,name,role:'owner'|'admin'|'vendedor',companyId,company,passwordChangedAt,support?}`. `company` es objeto de empresa completo sanitizado, o null para propietario sin soporte. `support` si aplica: `{companyId,reason,startedAt}`. `session.ownerContact` indica contacto del propietario.

Owner sin soporte: companies/users/payments y revision plataforma. Admin, vendedor o propietario en soporte: `state` de negocio y revision de ese negocio; propietario en soporte tiene role owner, companyId y support. El vendedor no obtiene compras, costos ni ventas/servicios ajenos. `companies/users/payments` no aparecen para clientes.

Empresa: `{id,name,slug,contact,email,whatsapp,logo,startDate,endDate,monthlyFee,enabled,createdAt,status,daysRemaining,url}`. `status`: `active`, `disabled`, `expired`, `scheduled`. URL usa `/c/:slug` del origen base, sin depender de comprar dominio. Logo y foto: dataURL PNG/JPEG/WebP/GIF hasta 500 KB, o cadena vacía; nunca HTML/SVG.

Usuario sanitizado: `{id,companyId,username,name,role,active,passwordChangedAt,createdAt,email,emailVerified}`. Pago: `{id,companyId,date,amount,startDate,endDate,previousEndDate,username}`.

State conserva legacy `prods,compras,ventas,servs,movimientos,auditoria,revision` y añade `customers,vehicles,mechanics,cashClosures` según permisos. Producto puede incluir `foto`. Venta añade `telefono,placa,labor:[{descripcion,mecanicoId,mecanico,mecanicoPorcentaje,importe}],subtotal_productos,subtotal_mano_obra,paymentMethod,customerId,receiptToken,receiptUrl,receiptExpiresAt`. Sus detalles mantienen `producto_id,nombre,cantidad,precio_unitario,devuelto` y `costo_unitario` histórico para roles autorizados. Servicios vinculados tienen `venta_id`, cliente, telefono, placa, labor y cobro desglosado. Historial por cliente: `{id,nombre,telefono,placas,purchaseCount,totalSpent,lastVisit}`; por moto: `{placa,customerIds,visitCount,totalSpent,lastVisit}`. Los agregados descuentan devoluciones y excluyen anulaciones.

## Importes y costos

Los importes de entrada son números o cadenas numéricas no vacías, entre cero y `1e12`, con hasta dos decimales. Vacío, `null`, booleanos, valores negativos, no finitos y más de dos decimales se rechazan cuando el campo exige importe. Las cantidades de producto son enteros positivos. Los límites adicionales por documento o importación siguen aplicándose.

`money.mjs` comparte validación y redondeo decimal half-up a dos decimales. Las extensiones y los importes derivados utilizan esa misma frontera. El nuevo costo unitario ponderado de compra se redondea igualmente a dos decimales después de sumar las extensiones y dividir por la cantidad; los snapshots históricos existentes no se reescriben. Se presentan importes COP con precisión consistente, no un total entero distinto al cobro registrado.

`precio_compra:null` representa costo desconocido. Crear o importar con costo omitido o blanco conserva ese desconocimiento; un cero explícito es costo conocido. Al editar un producto, omitir la propiedad conserva su costo actual; enviarla explícitamente vacía o `null` lo marca desconocido. Las ventas fijan su costo histórico; corregir un producto posteriormente no reescribe ventas anteriores.

Los productos mantienen `costHistory:[{kind:'baseline'|'manual'|'purchase',costo_unitario:number|null,documentId?:string}]` para seleccionar la última fuente vigente. Anular una compra retira esa fuente y conserva fuentes posteriores; una compra histórica sin fuente verificable no permite inventar un costo previo: queda desconocido salvo que exista una fuente posterior conocida. Los reportes indican costos/repartos incompletos y no los convierten en ganancia calculada con cero.

## Acciones

Todas pueden incluir `requestId` (el cliente debe generarlo una vez por intento) y `revision` del envelope actual. Reintentar el mismo requestId no duplica; reutilizar con otros datos falla. Revisiones de clientes son por empresa.

El cliente captura la revisión al **abrir** un formulario administrativo y conserva esa revisión al enviarlo; no la sustituye por la revisión de un refresco posterior. Un `409 REVISION_CONFLICT` conserva el formulario y exige revisar expresamente los datos actuales antes de reenviar, evitando que una edición antigua anule una renovación registrada mientras el formulario estaba abierto. Las acciones de tickets no bloquean por revisión comercial; mantienen sus propios controles, idempotencia y visibilidad.

- `company.create`: `form:{name,contact,email,whatsapp,logo,startDate,endDate,monthlyFee,username,password,adminName?}`. Crea primer admin.
- `company.update`: `companyId,form:{name?,contact?,email?,whatsapp?,logo?,startDate?,endDate?,monthlyFee?}`.
- `company.access`: `companyId,form:{enabled:boolean}`. Suspensión manual independiente de contrato.
- `company.delete`: `companyId,form:{confirmation:company.name}`. Borra empresa, usuarios, pagos y datos.
- `company.renew`: `companyId,form:{startDate?,endDate,amount,date?}`. Default start hoy si venció; período previo si activa. EndDate confirmada debe ampliar la vigencia. `renewalProposal` -> `{startDate,endDate,amount}`; mes calendario conservando días prepagados. No elimina suspensión manual.
- `user.create`: `companyId,form:{username,password,name,role:'admin'|'vendedor'}`.
- `user.update`: `userId,form:{name?,role?,active?}`. Preserva al menos un admin activo.
- `user.reset`: `userId,form:{password}`. Invalida sesiones.
- `support.start`: `companyId,form:{motivo}` -> envelope empresa con session.support.
- `support.end`: sin form -> envelope propietario.
- `business.change`: `payload:{kind,form,items?,id?}`. Legacy producto/compra/ajuste/importar/eliminar/estado/reversion; solo admin/soporte. Puede incluir foto de producto en form.foto. Payload revision/requestId los adapta el motor.
- `sale.create`: `form:{fecha,cliente,telefono,placa,paymentMethod:'efectivo'|'transferencia'|'tarjeta'},items:[{producto_id,cantidad,precio_unitario}],labor:[{descripcion,mecanicoId,importe}]`. Acepta items vacíos si hay labor; placa requerida al incluir labor, único dato de moto. Cada trabajo exige mecánico activo de esa empresa con porcentaje configurado; el servidor fija nombre y porcentaje históricos. Vendedor no cambia precio de productos. Valor de labor editable, sujeto a la validación de importes. Respuesta state.ventas[0] contiene recibo y servicio vinculado. Cliente/teléfono opcionales para venta anónima sin historial personal.
- `sale.reverse`: `id:venta.id,form:{motivo,parcial?:boolean},items?:[{index,cantidad}]`. Solo admin/soporte; su identidad constituye autorización. Parcial devuelve solo artículos seleccionados; anulación total revierte productos pendientes y mano de obra vinculada. Historial conserva motivo/usuario.

Leer envelope actualizado tras cada acción. Soporte conserva identidad propietaria y motivo en auditoría; `usuario` visible en operaciones incluye `· Soporte`.

- `sale.receipt`: `id:venta.id`, renueva el enlace compartible por 7 días para una venta autorizada y revoca todos los enlaces anteriores de esa misma venta; no modifica cobro ni existencias. Usar antes de compartir un comprobante antiguo. La respuesta pública utiliza campos comerciales permitidos y omite tokens/URLs de otros accesos, identificadores internos de productos/usuarios y costos.

## Sesiones y funciones externas

La sesión de plataforma tiene vigencia absoluta de 30 días (`PLATFORM_SESSION_TTL_MS`), con cookie HttpOnly/Secure en producción, y se conserva al reiniciar el proceso. Restaurar respaldos continúa revocando sesiones. Cada solicitud vuelve a validar usuario, rol y contrato. Los usuarios admiten `email` opcional y `emailVerified:false`; crear la empresa admite `adminEmail`. El bootstrap del propietario admite `SCORTA_OWNER_EMAIL`. Ninguno de estos campos envía correo ni acredita verificación: la recuperación automática, los avisos por WhatsApp y la aceptación contractual real siguen sin integrarse en esta revisión de interfaz.

## Borrador privado de venta

`GET /api/v2/draft` devuelve `{version,draft,updatedAt?,saleId?}` del usuario y empresa activos. `POST /api/v2/draft` acepta `{version,writeId,draft}`. `draft:null` vacía el borrador conservando versión creciente; `409 DRAFT_CONFLICT` impide sobrescribir cambios de otra pestaña/equipo. Repetir el mismo writeId con los mismos datos devuelve el guardado previo. La revisión de inventario no cambia al guardar. Requiere sesión vigente y empresa accesible; soporte tiene su propia copia.

El frontend guarda `pendingSale` con type sale.create, requestId y draftRequestId iguales y el payload de cobro. La acción correspondiente solo confirma ese borrador; confirma venta y limpia la copia de trabajo atómicamente. La respuesta de datos incluye draftVersion. La protección de requestId existente permite comprobar la operación después de una respuesta perdida. Borradores incompletos no reservan ni modifican existencias.

## Tickets de soporte

Los envelopes incluyen `tickets` con visibilidad por actor: owner todas las empresas, admin su empresa, vendedor solo su creador. Ticket: id, companyId, createdBy, creatorName, title, description, status, createdAt, updatedAt, messages y unreadCount por lector; no se expone el registro privado de lectores.

En POST /api/v2/action: `ticket.create` con form.title/description; `ticket.reply` con id y form.message; `ticket.read` con id; `ticket.status` con id/form.status (open|in_progress|resolved), exclusivo del propietario. Las lecturas son independientes por usuario y los cambios son idempotentes mediante requestId. Las operaciones de soporte no modifican la revisión del negocio, inventario o borradores; la persistencia global mantiene CAS. Al eliminar empresa se retiran sus tickets.

Un ticket admite 500 entradas normales. Al alcanzar ese límite se permite únicamente un evento adicional de cierre a `resolved`, con `kind:'final_resolution'` y el mismo resto de campos de mensaje; el máximo es 501 entradas. El cierre repetido es una operación vacía. No se admiten respuestas ni reaperturas en ese estado; para continuar la conversación se crea otro ticket. Se conservan el historial y las lecturas individuales. Los rechazos usan `400 INVALID_TICKET` o `403 FORBIDDEN`, según corresponda.

La empresa acepta `nit` y `address` opcionales; la respuesta pública del comprobante incluye ambos si existen. No sustituye facturación electrónica.

## Herramientas administrativas

`GET /api/v2/reports?from=YYYY-MM-DD&to=YYYY-MM-DD` exige administrador con empresa o propietario en soporte. Sin fechas usa el día actual de Bogotá; valida rango y devuelve salesReport del negocio del actor. No acepta sustituir companyId por parámetros.

Acciones administrativas en `/api/v2/action`: `mechanic.create` (form.name y form.percentage), `mechanic.update` (id y form.name/active/percentage), `mechanic.archive` (id), `cash.close` (form.date, form.actual con efectivo/transferencia/tarjeta, form.note opcional). El porcentaje es de 0 a 100 con hasta dos decimales. Mantienen revisión, auditoría e idempotencia. Cierres únicos por fecha/empresa, inmutables, snapshot del cobro esperado y registrado. No modifican stock. `state.mechanics` es completo para administrador y limitado a id/name activos para vendedor; `state.cashClosures` no se entrega al vendedor.

Las ventas nuevas de mano de obra requieren `mecanicoId`: se verifica actividad/pertenencia y se fija nombre y porcentaje de ese momento. Borradores y pendingSale conservan el campo. Los históricos anteriores se conservan, pero no habilitan nuevas ventas con mecánico en texto libre o sin reparto configurado. Los reportes y exports usan cálculos compartidos de `admin-reports.mjs`, `overview-report.mjs` y `labor-report.mjs`, con costos históricos y columnas permitidas.

## Resumen general por período

`GET /api/v2/overview?from=YYYY-MM-DD&to=YYYY-MM-DD` es de solo lectura, exige administrador o propietario en soporte y consulta únicamente el negocio del actor. Fechas omitidas usan el día de Bogotá. La interfaz exige un rango completo y utiliza el mismo cálculo compartido sobre los datos autorizados. Devuelve `{from,to,report}` calculado con `overviewReport` en overview-report.mjs, compartido con la vista.

report incluye totals, products, rankings, noSales, bases de conteo, costos incompletos y medios de pago. Ganancia de productos = venta neta de productos menos costo_unitario histórico retenido. productMarginPercent es agregado por venta neta; null sin base o con costo incompleto. La utilidad total suma la ganancia de productos y la parte del negocio de la mano de obra cuando ambas bases están completas; no confunde ingreso bruto de servicios con ganancia. Los porcentajes faltantes se muestran explícitamente como incompletos. No se exponen sesiones, tokens de comprobantes ni credenciales. No altera inventario, ventas, revisiones, borradores o cierres; /api/v2/reports sigue disponible.

## Excel y persistencia operativa

La importación de compras valida `.xlsx` antes de cargar ExcelJS: hasta 5 MB comprimidos, 20 MB efectivos expandidos y 2000 entradas ZIP, sin ZIP64 ni cifrado. Comprueba directorio, cabeceras, ubicaciones, tamaños y CRC; limita la salida real de descompresión aunque el archivo declare tamaños falsos. La primera hoja admite hasta 1000 filas de producto y 20 columnas. La plantilla exige cantidad y costo unitario, más identificación por ID, referencia o nombre; no se aceptan identificadores contradictorios, fórmulas, enlaces, costos vacíos o productos repetidos. La vista previa no confirma la compra; confirmar aplica el documento completo o lo rechaza íntegramente.

`platform.sqlite` contiene el estado privado multiempresa. `platform-backup.mjs save` crea una copia consistente con SQLite. `restore` exige destino fuera de servicio, crea una instantánea independiente del origen que incluye transacciones WAL confirmadas, valida antes del reemplazo y conserva una copia anterior; no modifica el origen. Restaurar revoca sesiones. Las herramientas antiguas para `motoshop.sqlite` no equivalen a respaldo de esta plataforma. La programación y copia externa deben configurarse y probarse en el destino operativo.
