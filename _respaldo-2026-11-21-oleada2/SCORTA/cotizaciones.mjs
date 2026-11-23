// BE-17: cotizaciones. Reglas puras compartidas por el servidor, la demo local y la interfaz.
// No guardan nada: platform.mjs aplica permisos, plan, idempotencia (requestId), auditoría y
// transacción. Las acciones mutan el negocio recibido (ya clonado por el despachador).
//
// Decisiones (docs/PLATFORM-API.md › Cotizaciones):
// - Una cotización NO descuenta ni reserva stock. Se precia con exactamente las mismas reglas
//   que la venta (lista del cliente, descuentos con tope del vendedor, IVA): priceSaleItems.
// - Número consecutivo por empresa (COT-0001…) que nunca se reutiliza.
// - Vigencia en días (opción de la empresa, 15 por defecto; cada cotización puede cambiarla).
//   «Vencida» no se guarda: es una cotización vigente cuya fecha `vence` ya pasó.
// - Convertir crea la venta del día con el mismo código de sale.create. Si el stock no alcanza
//   responde 409 INSUFFICIENT_STOCK. Si el precio neto de alguna línea cambió responde 409
//   QUOTE_CHANGED con el detalle; con `form.aceptarCambios:true` se vende con los precios
//   actuales y la cotización guarda los cambios aceptados.
// - Solo productos: la mano de obra exige mecánico y placa, y se agrega en Nueva venta.
import {roundMoney,sumMoney} from './money.mjs';
import {CUSTOMER_TYPES,customerType,listPrice,normalizeDiscount,priceSaleItems,productVatRate,saleSettings,saleVat} from './sale-pricing.mjs';

const fail=(message,status=400,code,details)=>{throw Object.assign(Error(message),{status,...(code?{code}:{}),...(details?{details}:{})})};
const array=value=>Array.isArray(value)?value:[];
const optional=(value,max=500)=>value==null?'':String(value).trim().slice(0,max);
const text=(value,label,max=500)=>{if(typeof value!=='string'||!value.trim()||value.length>max)fail(label+': dato obligatorio o demasiado largo.');return value.trim()};
const isAdmin=actor=>actor.role==='admin'||actor.role==='owner';
const uuid=()=>crypto.randomUUID();
const pad=number=>String(number).padStart(4,'0');
const phoneValue=value=>{const raw=optional(value,30);if(raw&&!/^\+?[0-9 ()-]{6,30}$/.test(raw))fail('Número de teléfono inválido');return raw.replace(/[ ()-]/g,'')};
export const addDays=(day,days)=>{const date=new Date(day+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10)};
const CUSTOMER_TYPE_KEYS=CUSTOMER_TYPES.map(([key])=>key);

/** Consecutivo por empresa que no se reutiliza aunque se anulen documentos. */
export function nextNumber(business,key,prefix,list){
  const counters=business.secuencias??={};
  const used=Math.max(Number(counters[key])||0,array(list).length);
  counters[key]=used+1;
  return prefix+'-'+pad(used+1);
}

export const DEFAULT_QUOTE_SETTINGS=Object.freeze({validDays:15});
export function quoteSettings(business){
  const days=Number(business?.settings?.cotizaciones?.validDays);
  return {validDays:Number.isSafeInteger(days)&&days>=1&&days<=365?days:DEFAULT_QUOTE_SETTINGS.validDays};
}
export function cleanQuoteSettings(form={},business){
  if(!form||typeof form!=='object'||Array.isArray(form))fail('Opciones de cotización inválidas.');
  const current=quoteSettings(business);
  if(form.validDays==null||form.validDays==='')return current;
  const days=Number(form.validDays);
  if(!Number.isSafeInteger(days)||days<1||days>365)fail('Vigencia de las cotizaciones: usa de 1 a 365 días.');
  return {validDays:days};
}

export const QUOTE_STATUS={vigente:'Vigente',vencida:'Vencida',convertida:'Convertida',anulada:'Anulada'};
/** Estado mostrado: una cotización vigente con `vence` anterior a hoy está vencida. */
export const quoteStatus=(quote,today)=>quote?.estado==='vigente'&&quote.vence&&quote.vence<today?'vencida':quote?.estado||'vigente';
const summary=quote=>({numero:quote.numero,cliente:quote.cliente,total:quote.total,estado:quote.estado,vence:quote.vence});
const quoteFor=(business,id)=>{const quote=array(business.quotes).find(item=>item.id===id);if(!quote)fail('Cotización inexistente.',404,'NOT_FOUND');return quote};

function quoteCustomer(business,form,actor,requireDataConsent,at){
  if(form.customerId!=null&&form.customerId!==''){
    if(typeof form.customerId!=='string'||form.customerId.length>100)fail('Cliente inválido');
    const record=array(business.customerRecords).find(item=>item.id===form.customerId&&!item.erasedAt);
    if(!record)fail('El cliente seleccionado ya no existe. Búscalo de nuevo.',404,'CUSTOMER_NOT_FOUND');
    return {customerId:record.id,cliente:record.nombre,telefono:record.telefono||'',tipo:customerType(record.tipo),...(record.numeroDocumento?{tipoDocumento:record.tipoDocumento||'CC',numeroDocumento:record.numeroDocumento}:{})};
  }
  const cliente=optional(form.cliente,200)||'Cliente general',telefono=phoneValue(form.telefono);
  // La lista de precios de un cliente sin ficha solo la asigna el administrador (BE-36).
  const requested=form.tipoCliente;let tipo='mostrador';
  if(requested&&requested!=='mostrador'){
    if(!CUSTOMER_TYPE_KEYS.includes(requested))fail('Tipo de cliente inválido: usa mostrador, mecánico o mayorista.');
    if(!isAdmin(actor))fail('Solo el administrador asigna la lista de precios del cliente.',403,'FORBIDDEN');
    if(cliente==='Cliente general')fail('Escribe el nombre del cliente para asignarle una lista de precios.');
    tipo=requested;
  }
  if(telefono&&requireDataConsent&&form.dataConsent!==true)fail('Confirma que el cliente autorizó el tratamiento de su teléfono.',400,'DATA_CONSENT_REQUIRED');
  return {customerId:null,cliente,telefono,tipo,...(telefono&&form.dataConsent===true?{dataConsent:{consentAt:at.toISOString(),consentBy:actor.label,consentMedium:optional(form.consentMedium,60)||'verbal'}}:{})};
}
function cleanItems(items){
  if(!Array.isArray(items)||!items.length||items.length>200)fail('Agrega de 1 a 200 productos a la cotización.');
  return items.map((item,index)=>{
    if(!item||typeof item!=='object'||Array.isArray(item))fail('Producto inválido en la línea '+(index+1));
    const cantidad=Number(item.cantidad);if(!Number.isSafeInteger(cantidad)||cantidad<1||cantidad>100000)fail('Cantidad inválida en la línea '+(index+1));
    return {...structuredClone(item),cantidad};
  });
}

/**
 * quote.create · quote.cancel. quote.convert se resuelve en platform.mjs con
 * prepareQuoteConversion + la venta común + markQuoteConverted.
 * Devuelve {id, before, after, auditAction, document, warning?}.
 */
export function applyQuoteAction(business,actor,action,{now=Date.now(),today,requireDataConsent=false}={}){
  const form=action.form||{},at=new Date(now);
  if(action.type==='quote.create'){
    const items=cleanItems(action.items??form.items),customer=quoteCustomer(business,form,actor,requireDataConsent,at);
    const settings=saleSettings(business),seller=actor.role==='vendedor';
    const saleDiscount=normalizeDiscount(form.descuento,'Descuento al total');
    const {lines,priced}=priceSaleItems(business.prods,items,{tipo:customer.tipo,settings,seller,saleDiscount});
    const detalles=lines.map((line,index)=>{
      const rate=productVatRate(line.product,settings),discount=normalizeDiscount(line.descuento,'Descuento de '+line.product.nombre);
      return {producto_id:line.product.id,nombre:line.product.nombre,...(line.product.referencia?{referencia:line.product.referencia}:{}),cantidad:line.sent.cantidad,precio_lista:line.lista,
        ...(line.precio!==line.lista?{precio_modificado:line.precio}:{}),...(discount?{descuentoLinea:discount}:{}),descuento:priced.lines[index].descuento,precio_unitario:priced.lines[index].precio_unitario,...(rate!=null?{tarifa_iva:rate}:{})};
    });
    const days=form.dias==null||form.dias===''?quoteSettings(business).validDays:Number(form.dias);
    if(!Number.isSafeInteger(days)||days<1||days>365)fail('Vigencia: usa de 1 a 365 días.');
    const list=business.quotes??=[];
    const quote={id:uuid(),numero:nextNumber(business,'cotizacion','COT',list),fecha:today,createdAt:at.toISOString(),dias:days,vence:addDays(today,days),estado:'vigente',
      customerId:customer.customerId,cliente:customer.cliente,telefono:customer.telefono,...(customer.tipo!=='mostrador'?{tipoCliente:customer.tipo}:{}),
      ...(customer.numeroDocumento?{tipoDocumento:customer.tipoDocumento,numeroDocumento:customer.numeroDocumento}:{}),...(customer.dataConsent?{dataConsent:customer.dataConsent}:{}),
      detalles,...(saleDiscount?{descuentoVenta:saleDiscount}:{}),bruto:priced.bruto,descuentos:priced.descuentos,total:priced.subtotal,nota:optional(form.nota,500),usuario:actor.label,userId:actor.id};
    if(settings.vat.enabled){quote.iva={incluido:true,preciosCatalogoConIva:settings.vat.pricesIncludeVat,tarifa_mano_obra:settings.vat.defaultRate};const vat=saleVat(quote);quote.iva.tarifas=vat.rows;quote.iva.total=vat.iva}
    list.unshift(quote);business.revision++;
    return {id:quote.id,before:null,after:summary(quote),auditAction:'cotizacion_creada',document:{kind:'cotizacion',id:quote.id}};
  }
  if(action.type==='quote.cancel'){
    const quote=quoteFor(business,action.id??form.id),before=summary(quote);
    if(quote.estado!=='vigente')fail('La cotización ya fue '+(quote.estado==='convertida'?'convertida en venta':'anulada')+'.',409,'QUOTE_CLOSED');
    if(!isAdmin(actor)&&quote.userId!==actor.id)fail('Solo puedes anular tus propias cotizaciones. Pide al administrador que la anule.',403,'FORBIDDEN');
    const motivo=text(form.motivo,'Motivo',500);
    Object.assign(quote,{estado:'anulada',anulacion:{fecha:today,createdAt:at.toISOString(),motivo,usuario:actor.label,userId:actor.id}});business.revision++;
    return {id:quote.id,before,after:summary(quote),auditAction:'cotizacion_anulada',motivo,document:{kind:'cotizacion',id:quote.id}};
  }
  fail('Acción desconocida',404,'NOT_FOUND');
}

/**
 * Valida una conversión y arma la acción sale.create equivalente con los precios vigentes.
 * Lanza 409 INSUFFICIENT_STOCK o 409 QUOTE_CHANGED (con details) según corresponda.
 * Devuelve {quote, action, changes}.
 */
export function prepareQuoteConversion(business,actor,id,form={},{today}={}){
  const quote=quoteFor(business,id);
  if(quote.estado!=='vigente')fail('La cotización ya fue '+(quote.estado==='convertida'?'convertida en venta':'anulada')+'.',409,'QUOTE_CLOSED');
  const seller=actor.role==='vendedor';
  if(seller&&quote.detalles.some(line=>line.precio_modificado!=null))fail('Esta cotización tiene un precio especial autorizado por el administrador. Pide al administrador que la convierta en venta.',403,'FORBIDDEN');
  const prods=array(business.prods),missing=[],short=[],needed=new Map();
  for(const line of quote.detalles){if(!prods.some(p=>p.id===line.producto_id))missing.push(line.nombre);needed.set(line.producto_id,(needed.get(line.producto_id)||0)+line.cantidad)}
  if(missing.length)fail('Ya no existen en el inventario: '+missing.join(', ')+'. Crea una cotización nueva.',409,'PRODUCT_NOT_FOUND',{missing});
  for(const [productId,quantity] of needed){const product=prods.find(p=>p.id===productId);if(Number(product.stock)<quantity)short.push({producto_id:productId,nombre:product.nombre,disponible:Number(product.stock)||0,solicitado:quantity})}
  if(short.length)fail('No hay stock suficiente: '+short.map(item=>`${item.nombre} (disponibles ${item.disponible}, cotizados ${item.solicitado})`).join('; ')+'.',409,'INSUFFICIENT_STOCK',{stock:short});
  const record=quote.customerId?array(business.customerRecords).find(item=>item.id===quote.customerId&&!item.erasedAt):null;
  if(quote.customerId&&!record)fail('La ficha del cliente de esta cotización ya no existe.',409,'CUSTOMER_NOT_FOUND');
  const tipo=record?customerType(record.tipo):isAdmin(actor)?customerType(quote.tipoCliente):'mostrador';
  const settings=saleSettings(business);
  // Precio vigente de la lista del cliente (o el precio especial que autorizó el administrador).
  const items=quote.detalles.map(line=>{const product=prods.find(p=>p.id===line.producto_id);return {producto_id:line.producto_id,cantidad:line.cantidad,precio:line.precio_modificado??listPrice(product,tipo,settings),descuento:line.descuentoLinea||null}});
  const {priced}=priceSaleItems(prods,items,{tipo,settings,seller,saleDiscount:quote.descuentoVenta||null});
  const changes=quote.detalles.map((line,index)=>({nombre:line.nombre,cantidad:line.cantidad,antes:line.precio_unitario,ahora:priced.lines[index].precio_unitario})).filter(item=>item.antes!==item.ahora);
  const totalAhora=priced.subtotal;
  if(changes.length&&form.aceptarCambios!==true)fail(`Los precios cambiaron desde la cotización (total ${quote.total} → ${totalAhora}). Revisa y acepta los precios actuales para vender.`,409,'QUOTE_CHANGED',{changes,totalAntes:quote.total,totalAhora});
  const saleForm={fecha:today,placa:'',cliente:quote.cliente,telefono:quote.telefono||'',...(record?{customerId:record.id}:{}),...(!record&&tipo!=='mostrador'?{tipoCliente:tipo}:{}),
    ...(quote.descuentoVenta?{descuento:quote.descuentoVenta}:{}),...(quote.dataConsent||form.dataConsent===true?{dataConsent:true,consentMedium:quote.dataConsent?.consentMedium||optional(form.consentMedium,60)||'verbal'}:{})};
  for(const key of ['paymentMethod','payments','efectivo_recibido'])if(Object.hasOwn(form,key))saleForm[key]=structuredClone(form[key]);
  const saleItems=items.map((item,index)=>({...item,precio_unitario:priced.lines[index].precio_unitario}));
  return {quote,changes,totalAhora,action:{type:'sale.create',form:saleForm,items:saleItems,labor:[]}};
}
/** Marca la cotización como convertida y enlaza la venta (en el negocio ya actualizado). */
export function markQuoteConverted(business,quoteId,sale,actor,at,changes=[]){
  const quote=quoteFor(business,quoteId),before=summary(quote);
  Object.assign(quote,{estado:'convertida',saleId:sale.id,convertidaEn:at.toISOString(),convertidaPor:actor.label,...(changes.length?{cambiosAceptados:changes}:{})});
  sale.cotizacionId=quote.id;sale.cotizacionNumero=quote.numero;
  return {before,after:{...summary(quote),venta:sale.id,total:sale.total}};
}
/** Resumen por estado para la vista y los reportes. */
export function quoteCounts(quotes=[],today){
  const counts={vigente:0,vencida:0,convertida:0,anulada:0};
  for(const quote of array(quotes))counts[quoteStatus(quote,today)]++;
  return counts;
}
export const quoteValue=quotes=>sumMoney(array(quotes).map(quote=>roundMoney(Number(quote.total)||0)));
