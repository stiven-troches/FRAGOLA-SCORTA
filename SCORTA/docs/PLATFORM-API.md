# API de plataforma SCORTA

Motor universal `platform.mjs`: `await createPlatform({owner:{company,username,password,name?}, ownerContact?, legacyState?})` crea estado privado. `await platformRequest(state,{method,path,body?,token?},{now?,baseUrl?})` retorna `{state,status,body,token?}`. `now` admite fecha, timestamp o función. Nunca exponer el estado privado. `token` ausente conserva cookie; string establece sesión; null elimina cookie. PBKDF2/SHA-256, contraseñas 16–200 caracteres. `companyStatus(company, now?)`, `renewalProposal(company, now?)` y `dateBogota(now?)` son helpers exportados.

## Rutas

- GET `/api/v2/session` y `/api/v2/data`: mismo envelope.
- POST `/api/v2/login`: `{company,username,password}` -> envelope y token.
- POST `/api/v2/logout`: `{}` -> `{ok:true}` y token null.
- POST `/api/v2/password`: `{currentPassword,newPassword}` -> `{ok:true}`, invalida todas las sesiones del usuario.
- POST `/api/v2/action`: acción abajo -> envelope actualizado.
- GET `/api/v2/receipt/:token`: comprobante público con token opaco, expira a los 7 días; `{company,sale,expiresAt}`. Enlace navegable `/receipt/:token`.

Errores: `{error,code?}` con status HTTP. 401 sin sesión; 403 sin permiso o empresa suspendida (`COMPANY_DISABLED`, `CONTRACT_EXPIRED`, `CONTRACT_NOT_STARTED`); 409 revisión obsoleta. El error de suspensión incluye `company:{name,status,endDate}` y `ownerContact`. No divulgar credenciales.

## Envelope

`{session,revision,companies?,users?,payments?,state?}`

Session: `{userId,username,name,role:'owner'|'admin'|'vendedor',companyId,company,passwordChangedAt,support?}`. `company` es objeto de empresa completo sanitizado, o null para propietario sin soporte. `support` si aplica: `{companyId,reason,startedAt}`. `session.ownerContact` indica contacto del propietario.

Owner sin soporte: companies/users/payments y revision plataforma. Admin, vendedor o propietario en soporte: `state` de negocio y revision de ese negocio; propietario en soporte tiene role owner, companyId y support. El vendedor no obtiene compras, costos ni ventas/servicios ajenos. `companies/users/payments` no aparecen para clientes.

Empresa: `{id,name,slug,contact,email,whatsapp,logo,startDate,endDate,monthlyFee,enabled,createdAt,status,daysRemaining,url}`. `status`: `active`, `disabled`, `expired`, `scheduled`. URL usa `/c/:slug` del origen base, sin depender de comprar dominio. Logo y foto: dataURL PNG/JPEG/WebP/GIF hasta 500 KB, o cadena vacía; nunca HTML/SVG.

Usuario sanitizado: `{id,companyId,username,name,role,active,passwordChangedAt,createdAt}`. Pago: `{id,companyId,date,amount,startDate,endDate,previousEndDate,username}`.

State conserva legacy `prods,compras,ventas,servs,movimientos,auditoria,revision` y añade `customers,vehicles`. Producto puede incluir `foto`. Venta añade `telefono,placa,labor:[{descripcion,mecanico,importe}],subtotal_productos,subtotal_mano_obra,paymentMethod,customerId,receiptToken,receiptUrl,receiptExpiresAt`. Sus detalles mantienen `producto_id,nombre,cantidad,precio_unitario,devuelto`. Servicios vinculados tienen `venta_id`, cliente, telefono, placa, labor y cobro desglosado. Historial por cliente: `{id,nombre,telefono,placas,purchaseCount,totalSpent,lastVisit}`; por moto: `{placa,customerIds,visitCount,totalSpent,lastVisit}`. Los agregados descuentan devoluciones y excluyen anulaciones.

## Acciones

Todas pueden incluir `requestId` (el cliente debe generarlo una vez por intento) y `revision` del envelope actual. Reintentar el mismo requestId no duplica; reutilizar con otros datos falla. Revisiones de clientes son por empresa.

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
- `sale.create`: `form:{fecha,cliente,telefono,placa,paymentMethod:'efectivo'|'transferencia'|'tarjeta'},items:[{producto_id,cantidad,precio_unitario}],labor:[{descripcion,mecanico,importe}]`. Acepta items vacíos si hay labor; placa requerida al incluir labor, único dato de moto. Vendedor no cambia precio de productos. Valor de labor libre. Respuesta state.ventas[0] contiene recibo y servicio vinculado. Cliente/teléfono opcionales para venta anónima sin historial personal.
- `sale.reverse`: `id:venta.id,form:{motivo,parcial?:boolean},items?:[{index,cantidad}]`. Solo admin/soporte; su identidad constituye autorización. Parcial devuelve solo artículos seleccionados; anulación total revierte productos pendientes y mano de obra vinculada. Historial conserva motivo/usuario.

Leer envelope actualizado tras cada acción. Soporte conserva identidad propietaria y motivo en auditoría; `usuario` visible en operaciones incluye `· Soporte`.

- `sale.receipt`: `id:venta.id`, renueva el enlace compartible por 7 días para una venta autorizada; no modifica cobro ni existencias. Usar antes de compartir un comprobante antiguo.

## Revisión de experiencia 2

La sesión de plataforma tiene vigencia absoluta de 30 días (`PLATFORM_SESSION_TTL_MS`), con cookie HttpOnly/Secure en producción, y se conserva al reiniciar el proceso. Restaurar respaldos continúa revocando sesiones. Cada solicitud vuelve a validar usuario, rol y contrato. Los usuarios admiten `email` opcional y `emailVerified:false`; crear la empresa admite `adminEmail`. El bootstrap del propietario admite `SCORTA_OWNER_EMAIL`. Ninguno de estos campos envía correo ni acredita verificación: la recuperación automática, los avisos por WhatsApp y la aceptación contractual real siguen sin integrarse en esta revisión de interfaz.

## Borrador privado de venta

`GET /api/v2/draft` devuelve `{version,draft,updatedAt?,saleId?}` del usuario y empresa activos. `POST /api/v2/draft` acepta `{version,writeId,draft}`. `draft:null` vacía el borrador conservando versión creciente; `409 DRAFT_CONFLICT` impide sobrescribir cambios de otra pestaña/equipo. Repetir el mismo writeId con los mismos datos devuelve el guardado previo. La revisión de inventario no cambia al guardar. Requiere sesión vigente y empresa accesible; soporte tiene su propia copia.

El frontend guarda `pendingSale` con type sale.create, requestId y draftRequestId iguales y el payload de cobro. La acción correspondiente solo confirma ese borrador; confirma venta y limpia la copia de trabajo atómicamente. La respuesta de datos incluye draftVersion. La protección de requestId existente permite comprobar la operación después de una respuesta perdida. Borradores incompletos no reservan ni modifican existencias.
