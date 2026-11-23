// BE-40: proveedores, órdenes de compra y cuentas por pagar. Reglas puras compartidas por el
// servidor, la demo local, la interfaz y los reportes. platform.mjs aplica permisos (solo
// administrador), plan, idempotencia, auditoría y transacción.
//
// Decisiones (docs/PLATFORM-API.md › Órdenes de compra y cuentas por pagar):
// - Orden de compra: borrador → enviada → parcial | recibida → cerrada; borrador o enviada →
//   anulada. Una orden con recepciones no se anula: se cierra con lo pendiente sin recibir.
// - «Recibir» crea la compra existente (aplicarCambio kind 'compra': stock y costo promedio
//   ponderado) solo por las cantidades recibidas, enlazada a la orden y al proveedor.
// - Cuenta por pagar = compra a crédito de un proveedor con ficha: `compra.credito =
//   {monto, saldo, pagado, plazoDias, vence}` (plazo del proveedor o el indicado).
// - payable.payment reparte el pago de la factura más antigua a la más nueva (o paga una compra
//   puntual). En efectivo registra además una salida de caja «pago_proveedor» del día (cuenta en
//   la fila Gastos del cierre); por otro medio no toca la caja del almacén.
import {aplicarCambio} from './inventory.mjs';
import {moneyAmount,roundMoney,sumMoney} from './money.mjs';
import {addDays,nextNumber} from './cotizaciones.mjs';
import {cashMethod,daysBetween} from './caja-credito.mjs';

const fail=(message,status=400,code)=>{throw Object.assign(Error(message),{status,...(code?{code}:{})})};
const array=value=>Array.isArray(value)?value:[];
const finite=value=>{const number=Number(value);return Number.isFinite(number)?number:0};
const optional=(value,max=500)=>value==null?'':String(value).trim().slice(0,max);
const text=(value,label,max=200)=>{if(typeof value!=='string'||!value.trim()||value.length>max)fail(label+': dato obligatorio o demasiado largo.');return value.trim()};
const amount=(value,label)=>{try{return moneyAmount(value,label)}catch(error){return fail(error.message)}};
const norm=value=>String(value??'').normalize('NFD').replace(/[̀-ͯ]/g,'').trim().toLowerCase();
const uuid=()=>crypto.randomUUID();
const phoneValue=value=>{const raw=optional(value,30);if(raw&&!/^\+?[0-9 ()-]{6,30}$/.test(raw))fail('Número de teléfono inválido');return raw.replace(/[ ()-]/g,'')};
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const dayValue=(value,label)=>{if(typeof value!=='string'||!DAY.test(value)||new Date(value).toISOString().slice(0,10)!==value)fail(label+': fecha inválida.');return value};

export const PO_STATUS=Object.freeze({borrador:'Borrador',enviada:'Enviada',parcial:'Recibida parcial',recibida:'Recibida',cerrada:'Cerrada',anulada:'Anulada'});

// ---------------------------------------------------------------- proveedores
const supplierFor=(business,id)=>{const supplier=array(business.suppliers).find(item=>item.id===id);if(!supplier)fail('Proveedor inexistente.',404,'SUPPLIER_NOT_FOUND');return supplier};
function supplierFields(form,old){
  const has=key=>Object.hasOwn(form,key);
  const nombre=has('nombre')||!old?text(form.nombre,'Nombre del proveedor'):old.nombre;
  const nit=has('nit')?optional(form.nit,40).toUpperCase().replace(/\s/g,''):old?.nit||'';
  if(nit&&!/^[0-9A-Z.-]{3,40}$/.test(nit))fail('NIT inválido: usa números, puntos o guion.');
  const correo=has('correo')?optional(form.correo,254).toLowerCase():old?.correo||'';
  if(correo&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo))fail('Correo del proveedor inválido');
  let plazoDias=old?.plazoDias??0;
  if(has('plazoDias')){const days=form.plazoDias===''||form.plazoDias==null?0:Number(form.plazoDias);if(!Number.isSafeInteger(days)||days<0||days>365)fail('Plazo de pago: usa de 0 (contado) a 365 días.');plazoDias=days}
  return {nombre,nit,contacto:has('contacto')?optional(form.contacto,200):old?.contacto||'',telefono:has('telefono')?phoneValue(form.telefono):old?.telefono||'',correo,
    direccion:has('direccion')?optional(form.direccion,300):old?.direccion||'',notas:has('notas')?optional(form.notas,500):old?.notas||'',plazoDias,activo:has('activo')?form.activo!==false:old?.activo!==false};
}
function uniqueSupplier(business,fields,exceptId){
  for(const item of array(business.suppliers)){if(item.id===exceptId)continue;if(norm(item.nombre)===norm(fields.nombre))fail('Ya existe un proveedor con ese nombre.');if(fields.nit&&item.nit===fields.nit)fail('Ya existe un proveedor con ese NIT.')}
}

// ---------------------------------------------------------------- órdenes
const orderFor=(business,id)=>{const order=array(business.purchaseOrders).find(item=>item.id===id);if(!order)fail('Orden de compra inexistente.',404,'NOT_FOUND');return order};
const orderSummary=order=>({numero:order.numero,proveedor:order.proveedor,estado:order.estado,total:order.total,unidades:array(order.items).reduce((s,i)=>s+i.cantidad,0),recibidas:array(order.items).reduce((s,i)=>s+finite(i.recibido),0)});
function orderSupplier(business,form,old){
  if(form.supplierId!=null&&form.supplierId!==''){const supplier=supplierFor(business,form.supplierId);if(supplier.activo===false)fail('El proveedor está inactivo.');return {supplierId:supplier.id,proveedor:supplier.nombre}}
  const name=optional(form.proveedor,200);
  if(name)return {supplierId:null,proveedor:name};
  if(old)return {supplierId:old.supplierId||null,proveedor:old.proveedor};
  fail('Selecciona el proveedor de la orden.');
}
function orderItems(business,items){
  if(!Array.isArray(items)||!items.length||items.length>300)fail('Agrega de 1 a 300 productos a la orden.');
  const seen=new Set();
  return items.map((item,index)=>{
    if(!item||typeof item!=='object')fail('Producto inválido en la línea '+(index+1));
    const product=array(business.prods).find(p=>p.id===item.producto_id);if(!product)fail('Producto inexistente en la línea '+(index+1));
    if(seen.has(product.id))fail(`${product.nombre} está repetido en la orden.`);seen.add(product.id);
    const cantidad=Number(item.cantidad);if(!Number.isSafeInteger(cantidad)||cantidad<1||cantidad>1000000)fail('Cantidad inválida en '+product.nombre);
    const costo=item.costo==null||item.costo===''?null:amount(item.costo,'Costo esperado de '+product.nombre);
    return {producto_id:product.id,nombre:product.nombre,...(product.referencia?{referencia:product.referencia}:{}),cantidad,costo,recibido:0};
  });
}
const orderTotal=items=>sumMoney(items.map(item=>item.costo==null?0:roundMoney(item.cantidad*item.costo)));
const log=(order,estado,actor,at,nota)=>{order.historial=[...array(order.historial),{estado,fecha:at.toISOString(),usuario:actor.label,userId:actor.id,...(nota?{nota}:{})}]};
/** Sugerencia para «Preparar reposición»: cantidad para llegar al doble del mínimo y costo actual. */
export function replenishmentOrderItems(prods=[]){
  return array(prods).filter(p=>finite(p.stock)<=finite(p.stock_minimo)).map(p=>({producto_id:p.id,nombre:p.nombre,cantidad:Math.max(1,finite(p.stock_minimo)*2-finite(p.stock)),costo:p.precio_compra??null}));
}

// ---------------------------------------------------------------- cuentas por pagar
/** Condiciones de crédito de una compra: plazo del proveedor o el indicado. */
export function purchaseCredit(total,supplier,{plazoDias,vence,fecha,today}={}){
  const from=fecha||today;let days=plazoDias==null||plazoDias===''?finite(supplier?.plazoDias):Number(plazoDias);
  if(vence){dayValue(vence,'Vencimiento');days=Math.max(0,daysBetween(from,vence))}
  else if(!Number.isSafeInteger(days)||days<0||days>365)fail('Plazo de pago: usa de 0 a 365 días.');
  return {monto:roundMoney(total),saldo:roundMoney(total),pagado:0,plazoDias:days,vence:vence||addDays(from,days)};
}
/**
 * Aplica proveedor, factura y crédito a una compra recién creada (Ingresar mercancía o
 * recepción de una orden). La compra a crédito exige la ficha del proveedor.
 */
export function attachPurchaseTerms(business,purchase,form={},today){
  if(form.supplierId!=null&&form.supplierId!==''){const supplier=supplierFor(business,form.supplierId);purchase.supplierId=supplier.id;purchase.proveedor=supplier.nombre}
  const factura=optional(form.factura,60);if(factura)purchase.factura=factura;
  if(form.credito===true){
    if(!purchase.supplierId)fail('Selecciona la ficha del proveedor para registrar la compra a crédito.',400,'SUPPLIER_REQUIRED');
    purchase.credito=purchaseCredit(purchase.total,supplierFor(business,purchase.supplierId),{plazoDias:form.plazoDias,vence:form.vence,fecha:purchase.fecha,today});
  }
  return purchase;
}
/** Saldo por proveedor: facturas a crédito pendientes, vencidas y pagos. */
export function payableAccounts(business={},today){
  const accounts=new Map(),suppliers=array(business.suppliers);
  const account=(id,fallback='')=>{let item=accounts.get(id);if(!item){const supplier=suppliers.find(s=>s.id===id)||{};item={supplierId:id,nombre:supplier.nombre||fallback||'Proveedor',nit:supplier.nit||'',telefono:supplier.telefono||'',plazoDias:supplier.plazoDias??0,saldo:0,vencido:0,facturas:[],pagos:[]};accounts.set(id,item)}return item};
  for(const purchase of [...array(business.compras)].reverse()){
    if(!purchase.credito||!purchase.supplierId)continue;
    const item=account(purchase.supplierId,purchase.proveedor),saldo=purchase.anulada?0:roundMoney(finite(purchase.credito.saldo)),vencida=saldo>0&&purchase.credito.vence<today;
    item.facturas.push({compraId:purchase.id,fecha:purchase.fecha,factura:purchase.factura||'',orden:purchase.ordenCompraNumero||'',vence:purchase.credito.vence,monto:finite(purchase.credito.monto),saldo,pagado:roundMoney(finite(purchase.credito.monto)-saldo),anulada:!!purchase.anulada,vencida,diasVencida:vencida?daysBetween(purchase.credito.vence,today):0});
    if(saldo>0){item.saldo=roundMoney(item.saldo+saldo);if(vencida)item.vencido=roundMoney(item.vencido+saldo)}
  }
  for(const payment of array(business.supplierPayments))account(payment.supplierId,payment.proveedor).pagos.push({id:payment.id,numero:payment.numero,fecha:payment.fecha,method:payment.method,amount:finite(payment.amount),usuario:payment.usuario});
  return [...accounts.values()].sort((a,b)=>b.saldo-a.saldo||a.nombre.localeCompare(b.nombre,'es'));
}
export function payablesSummary(accounts=[]){const open=accounts.filter(a=>a.saldo>0);return {proveedores:open.length,saldo:sumMoney(open.map(a=>a.saldo)),vencido:sumMoney(open.map(a=>a.vencido)),proveedoresVencidos:open.filter(a=>a.vencido>0).length}}
/** Filas para Excel: facturas pendientes por proveedor. */
export function payablesReport(business={},today){
  const accounts=payableAccounts(business,today),rows=[];
  for(const account of accounts)for(const invoice of account.facturas)if(invoice.saldo>0)rows.push({supplier:account.nombre,nit:account.nit,purchase:invoice.compraId,invoice:invoice.factura,order:invoice.orden,date:invoice.fecha,due:invoice.vence,amount:invoice.monto,paid:invoice.pagado,balance:invoice.saldo,overdueDays:invoice.diasVencida});
  return {kind:'payables',rows,totals:payablesSummary(accounts)};
}
export const PAYABLE_COLUMNS=[['supplier','Proveedor'],['nit','NIT'],['invoice','Factura'],['order','Orden'],['date','Fecha'],['due','Vence'],['amount','Valor a crédito'],['paid','Pagado'],['balance','Saldo'],['overdueDays','Días vencida']];

// ---------------------------------------------------------------- acciones
/**
 * supplier.create · supplier.update · po.create · po.update · po.send · po.receive · po.close ·
 * po.cancel · payable.payment. Todas exigen administrador.
 * Devuelve {id, before, after, auditAction, document, business?} (business = negocio nuevo
 * cuando la acción crea una compra con aplicarCambio).
 */
export function applyPurchasingAction(business,actor,action,{now=Date.now(),today}={}){
  if(!(actor.role==='admin'||actor.role==='owner'))fail('Solo el administrador gestiona proveedores, órdenes de compra y pagos a proveedores.',403,'FORBIDDEN');
  const form=action.form||{},at=new Date(now);
  if(action.type==='supplier.create'||action.type==='supplier.update'){
    const old=action.type==='supplier.update'?supplierFor(business,action.id??form.id):null,before=old?structuredClone(old):null;
    const fields=supplierFields(form,old);uniqueSupplier(business,fields,old?.id);
    let record;
    if(old){Object.assign(old,fields,{updatedAt:at.toISOString()});record=old;
      // El nombre nuevo se refleja en las órdenes abiertas y en las compras con saldo.
      for(const order of array(business.purchaseOrders))if(order.supplierId===old.id&&['borrador','enviada','parcial'].includes(order.estado))order.proveedor=old.nombre;}
    else{record={id:uuid(),...fields,createdAt:at.toISOString(),usuario:actor.label};(business.suppliers??=[]).push(record)}
    business.revision++;
    return {id:record.id,before,after:structuredClone(record),auditAction:old?'proveedor_actualizado':'proveedor_creado',document:{kind:'proveedor',id:record.id}};
  }
  if(action.type==='po.create'||action.type==='po.update'){
    const old=action.type==='po.update'?orderFor(business,action.id??form.id):null;
    if(old&&old.estado!=='borrador')fail('Solo se edita una orden en borrador.',409,'PO_STATUS');
    const before=old?orderSummary(old):null,supplier=orderSupplier(business,form,old);
    const items=Object.hasOwn(form,'items')||!old?orderItems(business,form.items??action.items):old.items;
    const fechaEntrega=form.fechaEntrega?dayValue(form.fechaEntrega,'Fecha esperada de entrega'):old?.fechaEntrega||'';
    let order;
    if(old){Object.assign(old,supplier,{items,total:orderTotal(items),nota:Object.hasOwn(form,'nota')?optional(form.nota,500):old.nota,fechaEntrega});order=old;log(order,'borrador',actor,at,'Orden editada')}
    else{
      const list=business.purchaseOrders??=[];
      order={id:uuid(),numero:nextNumber(business,'ordenCompra','OC',list),fecha:today,createdAt:at.toISOString(),...supplier,items,total:orderTotal(items),estado:form.enviar===true?'enviada':'borrador',
        nota:optional(form.nota,500),fechaEntrega,...(form.origen==='reposicion'?{origen:'reposicion'}:{}),recepciones:[],historial:[],usuario:actor.label,userId:actor.id,...(form.enviar===true?{enviadaEn:today}:{})};
      log(order,order.estado,actor,at,form.origen==='reposicion'?'Creada desde Preparar reposición':'');list.unshift(order);
    }
    business.revision++;
    return {id:order.id,before,after:orderSummary(order),auditAction:old?'orden_compra_editada':'orden_compra_creada',document:{kind:'orden-compra',id:order.id}};
  }
  if(['po.send','po.close','po.cancel'].includes(action.type)){
    const order=orderFor(business,action.id??form.id),before=orderSummary(order),nota=optional(form.nota??form.motivo,500);
    const rules={'po.send':[['borrador'],'enviada'],'po.close':[['parcial','recibida'],'cerrada'],'po.cancel':[['borrador','enviada'],'anulada']}[action.type];
    if(!rules[0].includes(order.estado))fail(`La orden está «${PO_STATUS[order.estado]}» y no puede pasar a «${PO_STATUS[rules[1]]}».${action.type==='po.cancel'&&order.estado==='parcial'?' Ciérrala con lo pendiente sin recibir.':''}`,409,'PO_STATUS');
    if(action.type==='po.cancel'&&!nota)fail('Motivo: dato obligatorio.');
    order.estado=rules[1];if(rules[1]==='enviada')order.enviadaEn=today;if(rules[1]==='cerrada')order.cerradaEn=today;if(rules[1]==='anulada')order.anulacion={fecha:today,motivo:nota,usuario:actor.label};
    log(order,order.estado,actor,at,nota);business.revision++;
    return {id:order.id,before,after:orderSummary(order),auditAction:{'po.send':'orden_compra_enviada','po.close':'orden_compra_cerrada','po.cancel':'orden_compra_anulada'}[action.type],...(action.type==='po.cancel'?{motivo:nota}:{}),document:{kind:'orden-compra',id:order.id}};
  }
  if(action.type==='po.receive'){
    const order=orderFor(business,action.id??form.id);
    if(!['borrador','enviada','parcial'].includes(order.estado))fail(`La orden está «${PO_STATUS[order.estado]}»; no admite recepciones.`,409,'PO_STATUS');
    const before=orderSummary(order),received=form.items??action.items;
    if(!Array.isArray(received)||!received.length)fail('Indica las cantidades recibidas.');
    const lines=[];
    for(const [index,item] of received.entries()){
      const line=order.items.find(entry=>entry.producto_id===item?.producto_id);if(!line)fail('El producto de la línea '+(index+1)+' no está en la orden.');
      const cantidad=Number(item.cantidad);if(item.cantidad===''||item.cantidad==null||cantidad===0)continue;
      if(!Number.isSafeInteger(cantidad)||cantidad<0)fail('Cantidad recibida inválida en '+line.nombre);
      const pending=line.cantidad-finite(line.recibido);if(cantidad>pending)fail(`${line.nombre}: llegan ${cantidad} pero solo faltan ${pending} por recibir.`,409,'PO_OVER_RECEIPT');
      const costo=item.costo==null||item.costo===''?line.costo:amount(item.costo,'Costo de '+line.nombre);
      if(costo==null)fail('Indica el costo de compra de '+line.nombre+'.');
      if(lines.some(entry=>entry.line===line))fail(`${line.nombre} está repetido en la recepción.`);
      lines.push({line,cantidad,costo});
    }
    if(!lines.length)fail('Indica al menos una cantidad recibida.');
    const fecha=form.fecha?dayValue(form.fecha,'Fecha de recepción'):today;if(fecha>today)fail('La fecha de recepción no puede ser posterior a hoy.');
    let next;
    try{next=aplicarCambio(business,{kind:'compra',revision:business.revision,form:{fecha,proveedor:order.proveedor||'Sin especificar'},items:lines.map(entry=>({producto_id:entry.line.producto_id,cantidad:entry.cantidad,precio_unitario:entry.costo}))},actor.label,at.getTime())}catch(error){fail(error.message)}
    const purchase=next.compras[0];
    Object.assign(purchase,{userId:actor.id,ordenCompraId:order.id,ordenCompraNumero:order.numero});
    if(order.supplierId)purchase.supplierId=order.supplierId;
    attachPurchaseTerms(next,purchase,{...form,supplierId:order.supplierId||form.supplierId},today);
    const nextOrder=next.purchaseOrders.find(item=>item.id===order.id);
    for(const entry of lines){const line=nextOrder.items.find(item=>item.producto_id===entry.line.producto_id);line.recibido=finite(line.recibido)+entry.cantidad}
    nextOrder.recepciones=[...array(nextOrder.recepciones),{id:uuid(),fecha,createdAt:at.toISOString(),compraId:purchase.id,total:purchase.total,items:lines.map(entry=>({producto_id:entry.line.producto_id,nombre:entry.line.nombre,cantidad:entry.cantidad,costo:entry.costo})),usuario:actor.label,...(purchase.credito?{credito:true}:{})}];
    nextOrder.estado=nextOrder.items.every(item=>finite(item.recibido)>=item.cantidad)?'recibida':'parcial';
    log(nextOrder,nextOrder.estado,actor,at,`Recepción de ${lines.reduce((s,e)=>s+e.cantidad,0)} unidades`);
    for(const movement of next.movimientos)if(movement.documento===purchase.id&&!movement.userId)movement.userId=actor.id;
    const audit=next.auditoria?.[0];if(audit&&audit.documento===purchase.id){audit.userId=actor.id;audit.despues={orden:order.numero,total:purchase.total}}
    return {id:order.id,before,after:{...orderSummary(nextOrder),compra:purchase.id,total:purchase.total,credito:!!purchase.credito},auditAction:'orden_compra_recibida',document:{kind:'orden-compra',id:order.id,compraId:purchase.id},business:next};
  }
  if(action.type==='payable.payment'){
    const method=cashMethod(form.method),value=amount(form.amount,'Pago');if(value<=0)fail('Pago: indica un valor mayor que cero.');
    let pending;
    if(form.compraId){const purchase=array(business.compras).find(item=>item.id===form.compraId);if(!purchase||!purchase.credito||purchase.anulada)fail('Compra a crédito inexistente.',404,'NOT_FOUND');pending=[purchase]}
    else{const supplier=supplierFor(business,form.supplierId);pending=array(business.compras).map((purchase,index)=>({purchase,index})).filter(({purchase})=>purchase.supplierId===supplier.id&&!purchase.anulada&&finite(purchase.credito?.saldo)>0).sort((a,b)=>String(a.purchase.fecha).localeCompare(String(b.purchase.fecha))||b.index-a.index).map(({purchase})=>purchase)}
    pending=pending.filter(purchase=>finite(purchase.credito?.saldo)>0);
    if(!pending.length)fail('No hay saldo pendiente con este proveedor.',409,'NO_BALANCE');
    const supplier=supplierFor(business,pending[0].supplierId),saldo=sumMoney(pending.map(p=>p.credito.saldo));
    if(value>saldo)fail(`El pago supera el saldo pendiente (${saldo}).`,400,'PAYMENT_EXCEEDS_BALANCE');
    if(method==='efectivo'&&array(business.cashClosures).some(record=>record.date===today))fail('La caja de hoy ya está cerrada. Registra el pago en efectivo mañana o elige otro medio.',409,'CASH_ALREADY_CLOSED');
    let rest=value;const aplicado=[];
    for(const purchase of pending){if(rest<=0)break;const portion=roundMoney(Math.min(rest,purchase.credito.saldo)),before=purchase.credito.saldo;purchase.credito.saldo=roundMoney(before-portion);purchase.credito.pagado=roundMoney(finite(purchase.credito.pagado)+portion);rest=roundMoney(rest-portion);aplicado.push({compraId:purchase.id,fecha:purchase.fecha,factura:purchase.factura||'',amount:portion,saldoAntes:before,saldoDespues:purchase.credito.saldo})}
    const list=business.supplierPayments??=[];
    const payment={id:uuid(),numero:nextNumber(business,'pagoProveedor','PP',list),fecha:today,createdAt:at.toISOString(),supplierId:supplier.id,proveedor:supplier.nombre,method,amount:value,aplicado,saldoAntes:saldo,saldoDespues:roundMoney(saldo-value),nota:optional(form.nota,300),usuario:actor.label,userId:actor.id};
    if(method==='efectivo'){
      const movement={id:uuid(),tipo:'pago_proveedor',fecha:today,createdAt:at.toISOString(),method:'efectivo',amount:value,motivo:'Pago a proveedor '+supplier.nombre+' ('+payment.numero+')',categoria:'proveedor',pagoProveedorId:payment.id,usuario:actor.label,userId:actor.id};
      (business.cashMovements??=[]).unshift(movement);payment.cashMovementId=movement.id;
    }
    list.unshift(payment);business.revision++;
    return {id:payment.id,before:{saldo},after:{saldo:payment.saldoDespues,pago:value,medio:method,facturas:aplicado.length},auditAction:'pago_proveedor',document:{kind:'pago-proveedor',id:payment.id}};
  }
  fail('Acción desconocida',404,'NOT_FOUND');
}
/** Anular una compra: con pagos a crédito no se permite; sin pagos su saldo queda en cero. */
export function assertPurchaseCancellable(purchase){
  if(finite(purchase?.credito?.pagado)>0)fail('La compra tiene pagos registrados al proveedor. No se puede anular.',409,'PURCHASE_HAS_PAYMENTS');
}
/** Tras anular una compra enlazada a una orden, las unidades vuelven a quedar pendientes. */
export function afterPurchaseCancelled(business,purchaseId){
  const purchase=array(business.compras).find(item=>item.id===purchaseId);if(!purchase)return;
  if(purchase.credito)purchase.credito.saldo=0;
  const order=purchase.ordenCompraId&&array(business.purchaseOrders).find(item=>item.id===purchase.ordenCompraId);if(!order)return;
  const reception=array(order.recepciones).find(item=>item.compraId===purchaseId);if(!reception||reception.anulada)return;
  reception.anulada=true;
  for(const item of reception.items){const line=order.items.find(entry=>entry.producto_id===item.producto_id);if(line)line.recibido=Math.max(0,finite(line.recibido)-item.cantidad)}
  if(['parcial','recibida'].includes(order.estado))order.estado=order.items.some(item=>finite(item.recibido)>0)?'parcial':'enviada';
}
