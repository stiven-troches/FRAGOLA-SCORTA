# API de plataforma SCORTA

Motor universal `platform.mjs`: `await createPlatform({owner:{company,username,password,name?}, ownerContact?, legacyState?})` crea estado privado. `await platformRequest(state,{method,path,body?,token?,clientKey?,expectedCompanyId?,enforceContext?},{now?,baseUrl?})` retorna `{state,status,body,token?,outbox?}`. Opciones adicionales: `mailEnabled` y `resetBaseUrl` (SEG-13). `now` admite fecha, timestamp o función. Nunca exponer el estado privado. `token` ausente conserva cookie; string establece sesión; null elimina cookie. PBKDF2/SHA-256, contraseñas 8–200 caracteres, con número, mayúscula, minúscula y símbolo. `companyStatus(company, now?)`, `renewalProposal(company, now?)` y `dateBogota(now?)` son helpers exportados.

## Rutas

- GET `/api/v2/session` y `/api/v2/data`: mismo envelope.
- POST `/api/v2/login`: `{company,username,password}` -> envelope y token.
- POST `/api/v2/logout`: `{}` -> `{ok:true}` y token null.
- POST `/api/v2/password`: `{currentPassword,newPassword}` -> `{ok:true}`, invalida todas las sesiones del usuario.
- POST `/api/v2/action`: acción abajo -> envelope actualizado.
- GET `/api/v2/draft` y POST `/api/v2/draft`: borrador privado descrito abajo.
- GET `/api/v2/reports?from=YYYY-MM-DD&to=YYYY-MM-DD` y `/api/v2/overview?from=YYYY-MM-DD&to=YYYY-MM-DD`: reportes autorizados por período.
- GET `/api/v2/password/status` (pública): `{emailRecovery:boolean,message}`.
- POST `/api/v2/password/forgot` (pública): `{company,username}` -> siempre `200 {ok:true,message,emailRecovery}` (solo `429 RATE_LIMITED` por exceso desde una IP).
- POST `/api/v2/password/reset` (pública): `{token,newPassword}` -> `{ok:true,message,company,username}`; `400 RESET_INVALID` si el enlace no sirve; `400 INVALID_PASSWORD` si no cumple la política.
- GET `/api/v2/receipt/:token`: comprobante público con token opaco, expira a los 7 días; `{company,sale,expiresAt}`. Enlace navegable `/receipt/:token`.

Errores: `{error,code?,details?}` con status HTTP (403 `PLAN_LIMIT` cuando el plan de la empresa no lo permite). 401 sin sesión; 403 sin permiso o empresa suspendida (`COMPANY_DISABLED`, `CONTRACT_EXPIRED`, `CONTRACT_NOT_STARTED`); en el login, `ACCOUNT_DISABLED` solo si la contraseña es correcta y la cuenta está deshabilitada (con contraseña incorrecta siempre `401 INVALID_CREDENTIALS`, sin revelar si existe); `TWO_FACTOR_SETUP_REQUIRED` para el propietario sin 2FA cuando el servidor lo exige (`requireOwnerTwoFactor`, activo en producción; `session.twoFactorRequired` lo indica a la pantalla); 409 revisión obsoleta. El error de suspensión incluye `company:{name,status,endDate}` y `ownerContact`. No divulgar credenciales.

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
- `profile.email.update`: `form:{email,password}`. Cualquier usuario cambia su propio correo de recuperación confirmando su contraseña; un correo nuevo queda sin verificar e invalida enlaces pendientes.
- `profile.email.verify.request`: envía un código de 6 dígitos (vence en 10 min; uno por minuto, 5 por hora). `503 MAIL_DISABLED` sin correo configurado.
- `profile.email.verify.confirm`: `form:{code}` -> `session.emailVerified:true`. `400 EMAIL_CODE_INVALID` (el intento cuenta; 5 intentos invalidan el código) o `EMAIL_CODE_EXPIRED`.
- `support.start`: `companyId,form:{motivo}` -> envelope empresa con session.support.
- `support.end`: sin form -> envelope propietario.
- `business.change`: `payload:{kind,form,items?,id?}`. Legacy producto/compra/ajuste/importar/eliminar/estado/reversion; solo admin/soporte. Puede incluir foto de producto en form.foto. Payload revision/requestId los adapta el motor.
- `sale.create`: `form:{fecha,cliente,telefono,placa,paymentMethod:'efectivo'|'transferencia'|'tarjeta'},items:[{producto_id,cantidad,precio_unitario}],labor:[{descripcion,mecanicoId,importe}]`. Acepta items vacíos si hay labor; placa requerida al incluir labor, único dato de moto. Cada trabajo exige mecánico activo de esa empresa con porcentaje configurado; el servidor fija nombre y porcentaje históricos. Vendedor no cambia precio de productos. Valor de labor editable, sujeto a la validación de importes. Respuesta state.ventas[0] contiene recibo y servicio vinculado. Cliente/teléfono opcionales para venta anónima sin historial personal.
- `sale.reverse`: `id:venta.id,form:{motivo,parcial?:boolean},items?:[{index,cantidad}]`. Solo admin/soporte; su identidad constituye autorización. Parcial devuelve solo artículos seleccionados; anulación total revierte productos pendientes y mano de obra vinculada. Historial conserva motivo/usuario.

Leer envelope actualizado tras cada acción. Soporte conserva identidad propietaria y motivo en auditoría; `usuario` visible en operaciones incluye `· Soporte`.

- `sale.receipt`: `id:venta.id`, renueva el enlace compartible por 7 días para una venta autorizada y revoca todos los enlaces anteriores de esa misma venta; no modifica cobro ni existencias. Usar antes de compartir un comprobante antiguo. La respuesta pública utiliza campos comerciales permitidos y omite tokens/URLs de otros accesos, identificadores internos de productos/usuarios y costos.

## Sesiones y funciones externas

La sesión de plataforma tiene vigencia absoluta de 30 días (`PLATFORM_SESSION_TTL_MS`), con cookie HttpOnly/Secure en producción, y se conserva al reiniciar el proceso. Restaurar respaldos continúa revocando sesiones. Cada solicitud vuelve a validar usuario, rol y contrato. Los usuarios admiten `email` opcional y `emailVerified`; crear la empresa admite `adminEmail`. El bootstrap del propietario admite `SCORTA_OWNER_EMAIL`. Los avisos por WhatsApp siguen sin integrarse.

## Recuperación de contraseña por correo (SEG-13)

- `session.emailRecovery` indica si el servidor tiene correo configurado (proveedor en `ops/mailer.mjs` **y** `SCORTA_PUBLIC_URL`).
- `forgot`: si la cuenta existe, está activa, su empresa está vigente y su correo está **verificado**, genera un token aleatorio de 32 bytes (base64url, 43 caracteres) de un solo uso que vence en 1 hora (`PASSWORD_RESET_TTL_MS`). En el estado solo se guarda su SHA-256 (`passwordResets`), junto con el usuario y su `version`. Pedir otro enlace, cambiar el correo, el restablecimiento por el propietario o cualquier cambio de contraseña invalidan los anteriores. Límites: 10 solicitudes por IP (`clientKey`) y 3 enlaces por cuenta cada 15 minutos; el límite por cuenta es silencioso para no revelar nada.
- El enlace es `<SCORTA_PUBLIC_URL>/recuperar#<token>`; el token va en el fragmento (no llega a registros de servidores ni a `Referer`) y la pantalla lo quita de la barra de direcciones al abrirse.
- `reset`: aplica la política de contraseñas, sube `version`, borra todas las sesiones y enlaces del usuario, quita `mustChangePassword`, registra `password.reset` en la auditoría (`medio:'correo'`) y avisa por correo del cambio. 20 intentos por IP cada 15 minutos.
- **Envío:** el motor puro nunca envía: devuelve `outbox:[{to,subject,text}]` fuera del `body`. `platform-server.mjs` lo entrega con `mailer.sendAll` solo después de confirmar la escritura y sin esperar la respuesta (el tiempo no revela si la cuenta existe). La demo y las pruebas no envían correos. Plantillas de texto plano en español, sin más enlaces que el de recuperación.

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

## Caja, crédito y separados (BE-15, BE-16, BE-34)

Reglas puras en `caja-credito.mjs`, compartidas por servidor, demo, interfaz y reportes. Todas las acciones usan `requestId` (idempotencia del despachador), quedan en `auditoria` de la empresa y en la auditoría global, y operan solo sobre el negocio de la sesión (un id de otra empresa responde 404).

| Acción | Quién | Datos | Efecto |
|---|---|---|---|
| `cash.open` | admin | `form.amount` (base en efectivo) | Una apertura por día (409 `CASH_ALREADY_OPEN`). |
| `cash.expense` | vendedor hasta el tope, admin sin tope | `form.amount`, `form.method`, `form.motivo` | Gasto. Por encima de `settings.caja.maxSellerExpense` el vendedor recibe 403 `EXPENSE_LIMIT`. |
| `cash.withdrawal` / `cash.deposit` | admin | igual que el gasto | Retiro del dueño / ingreso que no es venta. |
| `credit.payment` | vendedor y admin | `form.customerId`, `form.amount`, `form.method` (o `saldo_favor`) | Reparte el abono de la factura más antigua a la más nueva; no puede superar el saldo. |
| `layaway.create` | vendedor y admin | `form.customerId` o `form.cliente`/`telefono`, `form.items[{producto_id,cantidad}]`, `form.deposit{amount,method}`, `form.dias` | Separado con precio de lista del cliente; reserva el stock. |
| `layaway.payment` | vendedor y admin | `id`, `form.amount`, `form.method` | Abono al separado activo. |
| `layaway.deliver` | vendedor y admin | `id`, `form.payment` opcional | Con saldo 0 crea la venta del día de entrega pagada con `anticipo` y devuelve `receiptLink`. |
| `layaway.cancel` | admin | `id`, `form.motivo`, `form.destino` (`reembolso` con `form.method`, o `saldo_a_favor`) | La mercancía vuelve al stock disponible. |

La respuesta de estas acciones incluye `document: {kind,id}` para imprimir el comprobante. `settings.update` acepta `form.caja: {maxSellerExpense, creditDays, layawayDays}` (por defecto 50.000, 30 y 30 días). `customer.create`/`customer.update` (solo admin) aceptan `creditLimit` (cupo, 0 = sin crédito) y `creditDays` (plazo propio).

**Cierre de caja.** Esperado por medio de pago = base + ventas cobradas ese día + abonos de cartera + abonos de separados + ingresos − gastos − retiros − devoluciones pagadas ese día. Una devolución se descuenta de la caja del día en que se entregó el dinero (`reversiones[].fechaComercial`), aunque el reporte de ventas la siga imputando a la fecha de la venta original; un cierre confirmado nunca cambia (corrige H-2026-11-21-01). Cada reversión nueva guarda `reembolso: {total, credito, pagos:[{method,amount}]}`; `sale.reverse` acepta `form.refundMethod` (por defecto, en proporción a lo cobrado). Las reversiones antiguas sin `reembolso` se reconstruyen con la misma regla; las ventas muy antiguas anuladas o devueltas sin registro de reversión conservan la regla anterior (neto en su fecha). Si no hubo apertura, `cash.close` acepta `form.base`. Los cierres nuevos guardan `version: 2`, `base`, `baseSource`, `breakdown` por medio y `creditSales`; los anteriores se muestran igual que antes.

**Crédito (fiado).** `payments` admite `credito` y `saldo_favor` (también como `paymentMethod`), solo con `form.customerId` de una ficha (400 `CUSTOMER_REQUIRED`). Si el saldo del cliente más la nueva venta supera `creditLimit`, el vendedor recibe 403 `CREDIT_LIMIT` y el administrador puede continuar: la respuesta trae `warning` y la auditoría `credito_sobre_cupo`. La venta guarda `credito: {monto, saldo, pagado, plazoDias, vence}`. Una devolución reduce primero el saldo a crédito de la venta y solo el resto se reembolsa. `state.creditAccounts` (todas las cuentas, también para el vendedor) trae saldo, vencido, antigüedad por días desde la factura (0-30, 31-60, 61-90, +90), facturas y abonos. El vendedor solo recibe sus propios `cashMovements` y `creditPayments`.

**Utilidad por causación.** La venta a crédito cuenta como venta y utilidad el día en que se hace, igual que una venta de contado; los abonos son cobros de cartera: entran a la caja de su día y no son ventas nuevas. `salesReport` agrega `credit: {sales, payments, portfolio}`; `portfolioReport` y `creditPaymentReport` tienen Excel. Los medios `credito`, `anticipo` y `saldo_favor` aparecen en `paymentTotals` del reporte, pero no en el esperado de caja.

**Separados y stock reservado.** Decisión: al crear el separado las unidades salen de `stock` (disponible) y pasan a `stock_reservado` del producto, con un movimiento `separado` en el kardex; así ninguna venta ni otro separado puede tomarlas. Al entregar, `stock_reservado` baja y se registra la venta (movimiento `entrega_separado`, cantidad 0). Al cancelar, vuelven a `stock` (movimiento `separado_cancelado`). El reporte de existencias muestra la columna «Separadas» y valora `stock + stock_reservado`. Un producto con unidades separadas no se puede retirar, y editarlo conserva la reserva. Los abonos de separados entran a la caja de su día; la venta entregada (pagada con `anticipo`) no vuelve a sumar dinero, y su utilidad cuenta el día de la entrega. Vencido = activo con `vence` anterior a hoy; lo decide el administrador (cancelar o recibir el pago).

## Cotizaciones (BE-17)

Reglas puras en `cotizaciones.mjs`, compartidas por servidor, demo e interfaz. Todas usan `requestId`, dejan `auditoria` en la empresa y en la auditoría global, y operan solo sobre el negocio de la sesión (un id de otra empresa responde 404). `state.quotes` llega a vendedor y administrador (todas las del almacén; no tienen costos).

| Acción | Quién | Datos | Efecto |
|---|---|---|---|
| `quote.create` | vendedor y admin | `form.customerId` o `form.cliente`/`telefono` (+ `dataConsent`), `form.items[{producto_id,cantidad,precio?,descuento?,precio_unitario?}]`, `form.descuento` (al total), `form.dias`, `form.nota` | Cotización `COT-0001…` (consecutivo por empresa que no se reutiliza). **No descuenta ni reserva stock.** |
| `quote.convert` | vendedor y admin | `id`, `form.paymentMethod` (o `payments`), `form.efectivo_recibido?`, `form.aceptarCambios?` | Crea la venta de hoy con el mismo código de `sale.create` y devuelve `receiptLink` y `document:{kind:'venta',id,quoteId}`. |
| `quote.cancel` | admin; vendedor solo las suyas | `id`, `form.motivo` | Estado `anulada` con motivo. |

- **Precios.** `priceSaleItems` (sale-pricing.mjs) precia la cotización y la venta: lista del cliente (ficha mecánico/mayorista; sin ficha solo el admin asigna `tipoCliente`), descuentos por línea y al total con el tope del vendedor (403 `DISCOUNT_LIMIT`), el vendedor no cambia el precio de lista, e IVA (`iva.tarifas`) si la empresa lo usa. Cada línea guarda `precio_lista`, `precio_modificado?`, `descuentoLinea?`, `descuento` y `precio_unitario`.
- **Vigencia.** `vence = fecha + dias`; por defecto `settings.cotizaciones.validDays` (15; `settings.update` acepta `form.cotizaciones:{validDays}` de 1 a 365). Estados guardados: `vigente`, `convertida`, `anulada`; **vencida** se calcula (`quoteStatus`): vigente con `vence` anterior a hoy. Una vencida se puede convertir con los precios del día.
- **Conversión.** Valida que los productos existan (409 `PRODUCT_NOT_FOUND`) y el stock (409 `INSUFFICIENT_STOCK`, `details.stock`). Recalcula con los precios vigentes; si algún neto cambió responde 409 `QUOTE_CHANGED` con `details:{changes:[{nombre,cantidad,antes,ahora}],totalAntes,totalAhora}` sin tocar nada. Con `form.aceptarCambios:true` vende con los precios actuales, la cotización guarda `cambiosAceptados` y la respuesta trae `warning`. Una línea con precio especial del administrador solo la convierte un administrador (403). La venta lleva `cotizacionId` y `cotizacionNumero`; la cotización, `saleId`. Convertir dos veces responde 409 `QUOTE_CLOSED`. Las cotizaciones son solo de productos: la mano de obra se cobra en Nueva venta.
- **Errores con detalle.** Desde esta versión los errores pueden incluir `details` (objeto) además de `{error,code}`.
- **Interfaz.** Nueva venta → «Guardar como cotización» (mismos precios y descuentos del carrito). Vista «Cotizaciones» con filtros vigente/vencida/convertida/anulada, comprobante imprimible/PDF (`quoteMarkup`), WhatsApp (al teléfono del cliente o para elegir el chat) y diálogo de conversión con vista previa de precios y stock.

## Garantías (BE-35)

Reglas puras en `garantias.mjs`. `state.warranties` llega a vendedor y administrador.

| Acción | Quién | Datos | Efecto |
|---|---|---|---|
| `warranty.create` | vendedor (solo sus ventas) y admin | `form.saleId`, `form.lineIndex`, `form.cantidad` (1), `form.motivo`, `form.supplierId` o `form.proveedor`, y solo admin `form.decision` (+ `refundMethod`) | Garantía `GAR-0001…` en estado `recibida`. La pieza pasa a `stock_garantia` del producto (movimiento `garantia_recibida`, cantidad 0 en el stock vendible). |
| `warranty.decide` | admin | `id`, `form.decision`: `cambio` · `reparacion` · `devolucion` (+ `refundMethod`) · `rechazo`, `form.nota` | Una sola decisión por garantía (409 `WARRANTY_DECIDED`). |
| `warranty.status` | admin | `id`, `form.estado`: `enviada` (con proveedor) · `aprobada` · `rechazada` · `cerrada` (+ `form.resultado`), `form.nota` | Reclamo al proveedor: recibida → enviada → aprobada/rechazada → cerrada (409 `WARRANTY_STATUS` si salta estados). |

- **Inventario.** La unidad defectuosa nunca vuelve al stock vendible mientras está en garantía. `cambio` entrega otra unidad del stock (movimiento `garantia_cambio`, −n; 409 `INSUFFICIENT_STOCK` si no hay). `devolucion` registra una devolución parcial de la venta (`detalles[].devuelto`, `reversiones[]` con `garantiaId` y `reembolso` como `sale.reverse`: primero baja el saldo a crédito y el resto sale de la caja del día en que se paga) **sin** devolver la pieza al stock. `reparacion` deja la pieza hasta cerrar. `rechazo` devuelve la pieza al cliente y cierra.
- **Cierre.** Exige decisión (409 `WARRANTY_UNDECIDED`). Resultado: `entregada_cliente` (reparación), y para cambio/devolución `reposicion` (el proveedor repone: entra al stock vendible, movimiento `garantia_reposicion`), `nota_credito` (solo si el proveedor aprobó) o `baja`. Siempre baja `stock_garantia`.
- **Plazo.** `producto.garantia_dias` (opcional, 0–3650; vacío lo quita) en el formulario del producto. Fuera de plazo (`fecha de la venta + días < hoy`) la garantía se recibe con `fueraDePlazo:true` y `warning`; decide el administrador. Unidades reclamables = vendidas − devueltas − en garantías no rechazadas (409 `WARRANTY_QUANTITY`).
- **Proveedor sugerido.** Si no se indica, el de la última compra del producto.
- **Reportes.** `warrantyReport(business,{from,to})` → `rows`, `byProduct`, `bySupplier`, `totals` (en la vista Garantías › Reporte y en Reportes, con Excel `reportColumns('warranties')`). El reporte de existencias agrega la columna «En garantía». Un producto con unidades en garantía no se puede retirar y editarlo las conserva.
- **Comprobante.** `warrantyMarkup` (recepción de garantía para el cliente).

## Órdenes de compra y cuentas por pagar (BE-40)

Reglas puras en `compras-proveedores.mjs`. **Todas las acciones son solo del administrador.** El vendedor no recibe `suppliers`, `purchaseOrders`, `supplierPayments` ni `payableAccounts`.

| Acción | Datos | Efecto |
|---|---|---|
| `supplier.create` / `supplier.update` | `form:{nombre,nit,contacto,telefono,correo,direccion,plazoDias(0 = contado, hasta 365),notas,activo}` (`update` con `id`) | Ficha de proveedor; nombre y NIT únicos. |
| `po.create` / `po.update` | `form.supplierId` o `form.proveedor`, `form.items[{producto_id,cantidad,costo?}]`, `form.nota`, `form.fechaEntrega`, `form.enviar?`, `form.origen:'reposicion'?` | Orden `OC-0001…` en `borrador` (o `enviada`). `update` solo en borrador. No toca el stock. |
| `po.send` | `id` | borrador → enviada. |
| `po.receive` | `id`, `form.items[{producto_id,cantidad,costo?}]`, `form.fecha?`, `form.factura?`, `form.credito?`, `form.plazoDias?` / `form.vence?` | Crea la **compra existente** (`aplicarCambio` kind `compra`: stock y costo promedio ponderado) por lo recibido, enlazada (`ordenCompraId`, `ordenCompraNumero`, `supplierId`). Estado `parcial` o `recibida`. No se recibe más de lo pendiente (409 `PO_OVER_RECEIPT`). |
| `po.close` | `id`, `form.nota?` | parcial/recibida → cerrada (lo pendiente ya no se recibe). |
| `po.cancel` | `id`, `form.motivo` | borrador/enviada → anulada. Con recepciones no se anula (409 `PO_STATUS`): se cierra. |
| `payable.payment` | `form.supplierId` (o `form.compraId`), `form.amount`, `form.method`, `form.nota?` | Pago `PP-0001…` de la compra más antigua a la más nueva; no supera el saldo (400 `PAYMENT_EXCEEDS_BALANCE`). |

- **Cuentas por pagar.** Una compra a crédito exige la ficha del proveedor (400 `SUPPLIER_REQUIRED`) y guarda `credito:{monto,saldo,pagado,plazoDias,vence}` (plazo del proveedor o el indicado). También «Ingresar mercancía» (`business.change` kind `compra`) acepta `form.supplierId`, `form.factura`, `form.credito`, `form.plazoDias`/`form.vence`. `state.payableAccounts` (admin): saldo, vencido, facturas y pagos por proveedor; `payablesReport` tiene Excel (`reportColumns('payables')`).
- **Caja.** Un pago en **efectivo** crea un movimiento de caja `pago_proveedor` del día (se resta en la fila «Gastos» del cierre; 409 `CASH_ALREADY_CLOSED` si la caja de hoy ya cerró). Por transferencia, tarjeta, Nequi o Daviplata no toca la caja del almacén.
- **Anulaciones.** Una compra con pagos al proveedor no se anula (409 `PURCHASE_HAS_PAYMENTS`); sin pagos su saldo queda en cero. Anular una compra recibida desde una orden devuelve esas unidades a «pendientes» (la recepción queda `anulada:true`).
- **Reposición.** `replenishmentOrderItems(prods)` sugiere los productos en o bajo el mínimo (cantidad para llegar al doble del mínimo, costo actual). «Preparar reposición» y la vista Proveedores generan la orden en borrador.
- **Comprobantes.** `purchaseOrderMarkup` (imprimir/PDF y WhatsApp al proveedor) y `supplierPaymentMarkup`.

## Límites por plan (BE-37)

Reglas puras en `plan-limits.mjs`. `company.plan = {maxUsers, maxProducts, maxPhotos, features:[...]}`; `null` es «sin límite». **Una empresa sin plan (todas las existentes) no tiene límites y tiene todas las funciones.** `publicCompany` incluye siempre el plan normalizado (`session.company.plan` y `companies[].plan`), y `companies[].usage` agrega `users` (activos), `products` y `photos`.

- `company.plan` (solo propietario): `companyId`, `form:{maxUsers,maxProducts,maxPhotos,features}`. También `company.create`/`company.update` aceptan `form.plan`. Queda en la auditoría global (`plan:{antes,despues}`) y en la de la empresa (`plan_actualizado`).
- **Límites.** Crear o reactivar un usuario, crear o importar productos y agregar fotos por encima del límite responde **403 `PLAN_LIMIT`** con un mensaje claro. Solo se revisa al crecer: una empresa que ya está por encima conserva lo que tiene y puede editarlo. El tope técnico de fotos (BE-06) sigue aplicando.
- **Funciones opcionales** (`credito`, `cotizaciones`, `garantias`, `ordenes_compra`, `iva`). Desactivadas responden 403 `PLAN_LIMIT` al crear documentos nuevos: venta a crédito o asignar cupo; `quote.create`/`quote.convert`; `warranty.create`; `po.create` o compra a crédito; activar el IVA en `settings.update`. Lo que ya está en curso se puede terminar (abonos de cartera, anular cotizaciones, decidir y cerrar garantías, recibir órdenes y pagar proveedores). Quitar `iva` del plan apaga el IVA de la empresa.
- **Interfaz.** El propietario edita el plan en la ficha de la empresa («Plan y límites», con el uso actual). El espacio de la empresa oculta los módulos y opciones desactivados (Cotizaciones, Garantías, «Guardar como cotización», medio Crédito, órdenes nuevas, compra a crédito, IVA y vigencia de cotizaciones en Opciones de venta).

## Resumen general por período

`GET /api/v2/overview?from=YYYY-MM-DD&to=YYYY-MM-DD` es de solo lectura, exige administrador o propietario en soporte y consulta únicamente el negocio del actor. Fechas omitidas usan el día de Bogotá. La interfaz exige un rango completo y utiliza el mismo cálculo compartido sobre los datos autorizados. Devuelve `{from,to,report}` calculado con `overviewReport` en overview-report.mjs, compartido con la vista.

report incluye totals, products, rankings, noSales, bases de conteo, costos incompletos y medios de pago. Ganancia de productos = venta neta de productos menos costo_unitario histórico retenido. productMarginPercent es agregado por venta neta; null sin base o con costo incompleto. La utilidad total suma la ganancia de productos y la parte del negocio de la mano de obra cuando ambas bases están completas; no confunde ingreso bruto de servicios con ganancia. Los porcentajes faltantes se muestran explícitamente como incompletos. No se exponen sesiones, tokens de comprobantes ni credenciales. No altera inventario, ventas, revisiones, borradores o cierres; /api/v2/reports sigue disponible.

## Excel y persistencia operativa

La importación de compras valida `.xlsx` antes de cargar ExcelJS: hasta 5 MB comprimidos, 20 MB efectivos expandidos y 2000 entradas ZIP, sin ZIP64 ni cifrado. Comprueba directorio, cabeceras, ubicaciones, tamaños y CRC; limita la salida real de descompresión aunque el archivo declare tamaños falsos. La primera hoja admite hasta 1000 filas de producto y 20 columnas. La plantilla exige cantidad y costo unitario, más identificación por ID, referencia o nombre; no se aceptan identificadores contradictorios, fórmulas, enlaces, costos vacíos o productos repetidos. La vista previa no confirma la compra; confirmar aplica el documento completo o lo rechaza íntegramente.

`platform.sqlite` contiene el estado privado multiempresa. `platform-backup.mjs save` crea una copia consistente con SQLite. `restore` exige destino fuera de servicio, crea una instantánea independiente del origen que incluye transacciones WAL confirmadas, valida antes del reemplazo y conserva una copia anterior; no modifica el origen. Restaurar revoca sesiones. Las herramientas antiguas para `motoshop.sqlite` no equivalen a respaldo de esta plataforma. La programación y copia externa deben configurarse y probarse en el destino operativo.

## Uso sin conexión y lector de códigos (FE-18, FE-19)

- Sin conexión (eventos `online`/`offline`, `src/connectivity.mjs`) la app muestra «Sin conexión», deja armar el carrito y consultar el inventario ya cargado, pero no cobra ni envía acciones (`OFFLINE_ACTION_MESSAGE`): el stock lo confirma el servidor. El borrador no se envía mientras tanto; al volver la conexión se recargan los datos y se guarda el borrador con el mismo control de versión (un cambio de otro equipo muestra el conflicto). El service worker sigue sin cachear `/api/`.
- Lector de códigos en Nueva venta (`src/BarcodeScanner.jsx`): `BarcodeDetector` nativo + `getUserMedia` (cámara trasera). Coincidencia exacta con `codigo_barras` y luego `referencia` (`matchScannedCode`), sin acentos ni mayúsculas. La cámara se apaga al cerrar, al salir de la vista o al ocultar la pestaña. El servidor envía `Permissions-Policy: camera=(self), …`.
