// BE-15 (cierre de caja completo), BE-16 (ventas a crédito y cartera) y BE-34 (separados).
// Reglas puras compartidas por el servidor, la demo local, la interfaz y los reportes.
// No guardan nada: platform.mjs aplica permisos de empresa, idempotencia (requestId),
// auditoría y transacción. Las acciones mutan el negocio recibido (ya clonado por el despachador).
//
// Decisiones documentadas (docs/PLATFORM-API.md › Caja, crédito y separados):
// - Caja: el esperado de un día por medio de pago = base + ventas cobradas ese día + abonos
//   + pagos de separados + ingresos − gastos − retiros − devoluciones PAGADAS ese día. Una
//   devolución se descuenta de la caja del día en que se entregó el dinero (fechaComercial),
//   aunque el reporte de ventas la siga imputando a la fecha de la venta original.
// - Crédito (causación): la venta a crédito cuenta como venta y utilidad el día en que se hace;
//   los abonos son cobros de cartera, entran a la caja de su día y no son ventas nuevas.
// - Separados: al crear el separado las unidades salen del stock disponible y pasan a
//   `stock_reservado` del producto (movimiento «separado»), así nadie más puede venderlas.
//   Al entregar se registra la venta del día de entrega pagada con «anticipo» (los abonos ya
//   entraron a caja). Al cancelar vuelven al stock disponible.
import {moneyAmount,roundMoney,sumMoney} from './money.mjs';
import {financialSales} from './financial-sales.mjs';
import {PAYMENT_KEYS,BASE_PAYMENT_KEYS,CREDIT_METHOD,LAYAWAY_METHOD,FAVOR_METHOD,paymentLabel,salePayments,allocatePayments,listPrice,productVatRate,saleSettings,saleVat,customerType} from './sale-pricing.mjs';

const fail=(message,status=400,code)=>{throw Object.assign(Error(message),{status,...(code?{code}:{})})};
const finite=value=>{const number=Number(value);return Number.isFinite(number)?number:0};
const array=value=>Array.isArray(value)?value:[];
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const bogota=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'});
/** Día comercial (Bogotá) de una fecha YYYY-MM-DD o de una marca de tiempo. */
export const businessDay=value=>{if(typeof value==='string'&&DAY.test(value))return value;if(!value)return '';const date=new Date(value);return Number.isFinite(date.getTime())?bogota.format(date):''};
export const addDays=(day,days)=>{const date=new Date(day+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10)};
export const daysBetween=(from,to)=>Math.round((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000);
const amount=(value,label)=>{try{return moneyAmount(value,label)}catch(error){return fail(error.message)}};
const positive=(value,label)=>{const number=amount(value,label);if(number<=0)fail(label+': indica un valor mayor que cero.');return number};
const text=(value,label,max=500)=>{if(typeof value!=='string'||!value.trim()||value.length>max)fail(label+': dato obligatorio o demasiado largo.');return value.trim()};
const optional=(value,max=500)=>value==null?'':String(value).trim().slice(0,max);
const isAdmin=actor=>actor.role==='admin'||actor.role==='owner';
const uuid=()=>crypto.randomUUID();
const pad=number=>String(number).padStart(4,'0');
/** Medio de pago que mueve dinero (efectivo, transferencia, tarjeta, Nequi o Daviplata). */
export function cashMethod(value,fallback='efectivo'){
  const method=value==null||value===''?fallback:value;
  if(!PAYMENT_KEYS.includes(method))fail('Selecciona efectivo, transferencia, tarjeta, Nequi o Daviplata.',400,'INVALID_PAYMENT_METHOD');
  return method;
}
const phoneValue=value=>{const raw=optional(value,30);if(raw&&!/^\+?[0-9 ()-]{6,30}$/.test(raw))fail('Número de teléfono inválido');return raw.replace(/[ ()-]/g,'')};

// ---------------------------------------------------------------- opciones
export const DEFAULT_CASH_SETTINGS=Object.freeze({maxSellerExpense:50000,creditDays:30,layawayDays:30});
const intIn=(value,fallback,min,max)=>value!=null&&value!==''&&Number.isSafeInteger(Number(value))&&Number(value)>=min&&Number(value)<=max?Number(value):fallback;
/** Opciones de caja de la empresa: tope de gastos del vendedor, plazo de crédito y vencimiento de separados. */
export function cashSettings(business){
  const raw=business?.settings?.caja||{},limit=raw.maxSellerExpense;
  return {maxSellerExpense:limit!=null&&limit!==''&&Number.isFinite(Number(limit))&&Number(limit)>=0?roundMoney(Number(limit)):DEFAULT_CASH_SETTINGS.maxSellerExpense,
    creditDays:intIn(raw.creditDays,DEFAULT_CASH_SETTINGS.creditDays,1,365),layawayDays:intIn(raw.layawayDays,DEFAULT_CASH_SETTINGS.layawayDays,1,365)};
}
export function cleanCashSettings(form={},business){
  const current=cashSettings(business),days=(value,label,fallback)=>{if(value==null||value==='')return fallback;const number=Number(value);if(!Number.isSafeInteger(number)||number<1||number>365)fail(label+': usa un número entero de días entre 1 y 365.');return number};
  return {maxSellerExpense:form.maxSellerExpense==null||form.maxSellerExpense===''?current.maxSellerExpense:amount(form.maxSellerExpense,'Tope de gastos del vendedor'),
    creditDays:days(form.creditDays,'Plazo de crédito',current.creditDays),layawayDays:days(form.layawayDays,'Vencimiento de separados',current.layawayDays)};
}
/** Cupo y plazo de la ficha del cliente (solo los asigna el administrador). */
export function creditFields(form={}){
  const result={};
  if(Object.hasOwn(form,'creditLimit')){result.creditLimit=form.creditLimit===''||form.creditLimit==null?0:amount(form.creditLimit,'Cupo de crédito')}
  if(Object.hasOwn(form,'creditDays')){if(form.creditDays===''||form.creditDays==null)result.creditDays=null;else{const number=Number(form.creditDays);if(!Number.isSafeInteger(number)||number<1||number>365)fail('Plazo de crédito: usa un número entero de días entre 1 y 365.');result.creditDays=number}}
  return result;
}

// ---------------------------------------------------------------- devoluciones
const lineValue=(line,quantity)=>roundMoney(finite(quantity)*finite(line?.precio_unitario));
/** Valor vigente de una venta (descuenta devoluciones; anulada = 0). */
export function saleNet(sale){
  if(!sale||sale.anulada)return 0;
  const returned=sumMoney(array(sale.detalles).map(line=>lineValue(line,line.devuelto)));
  return Math.max(0,roundMoney(finite(sale.total)-returned-finite(sale.laborRefund??sale.devolucion_mano_obra)));
}
/** Pagos de la venta que movieron dinero (sin crédito, anticipo ni saldo a favor). */
export const cashPayments=sale=>salePayments(sale).filter(payment=>PAYMENT_KEYS.includes(payment.method));
function spread(payments,value){
  const total=roundMoney(Math.max(0,finite(value)));if(!total)return [];
  const allocation=payments.length?allocatePayments({payments,total:sumMoney(payments.map(p=>p.amount))},total):{};
  const rows=Object.entries(allocation).filter(([,v])=>v>0).map(([method,amount])=>({method,amount}));
  return rows.length?rows:[{method:'efectivo',amount:total}];
}
/**
 * Reembolso de una reversión: primero reduce el saldo a crédito de la venta y el resto se
 * entrega por el medio elegido o, si no se elige, en proporción a lo cobrado.
 * Muta after.credito.saldo. Devuelve {total, credito, pagos:[{method,amount}]}.
 */
export function refundFor(before,after,{method}={}){
  const total=roundMoney(Math.max(0,saleNet(before)-saleNet(after)));
  const saldo=finite(after?.credito?.saldo),credito=roundMoney(Math.min(total,saldo));
  if(credito>0)after.credito.saldo=roundMoney(saldo-credito);
  const rest=roundMoney(total-credito);
  const pagos=rest<=0?[]:method?[{method:cashMethod(method),amount:rest}]:spread(cashPayments(after),rest);
  return {total,credito,pagos};
}
/** Reembolsos de una venta con su día de pago. Las reversiones antiguas se reconstruyen. */
export function saleRefunds(sale){
  let running=roundMoney(finite(sale?.total)-finite(sale?.laborRefund??sale?.devolucion_mano_obra));const result=[];
  for(const reversal of array(sale?.reversiones)){
    const fecha=reversal.fechaComercial||businessDay(reversal.fecha);
    if(reversal.reembolso){result.push({reversalId:reversal.id,fecha,total:finite(reversal.reembolso.total),credito:finite(reversal.reembolso.credito),pagos:array(reversal.reembolso.pagos)});running=roundMoney(running-finite(reversal.reembolso.total));continue}
    const value=reversal.parcial?sumMoney(array(reversal.detalles).map(item=>lineValue(sale.detalles?.[item.index],item.cantidad))):Math.max(0,running);
    running=roundMoney(running-value);
    result.push({reversalId:reversal.id,fecha,total:value,credito:0,pagos:spread(cashPayments(sale),value),legacy:true});
  }
  return result;
}

// ---------------------------------------------------------------- caja
export const CASH_ROW_KEYS=['base','ventas','abonos','separados','ingresos','gastos','retiros','devoluciones'];
export const CASH_ROW_LABELS={base:'Base inicial',ventas:'Ventas cobradas',abonos:'Abonos de cartera',separados:'Abonos de separados',ingresos:'Ingresos',gastos:'Gastos',retiros:'Retiros',devoluciones:'Devoluciones pagadas'};
export const CASH_MOVEMENT_LABELS={base:'Apertura (base)',gasto:'Gasto',retiro:'Retiro del dueño',ingreso:'Ingreso',pago_proveedor:'Pago a proveedor'};
// BE-40: los pagos a proveedores en efectivo salen de la caja y se suman a la fila «Gastos».
export const CASH_OUT_TYPES=['gasto','retiro','pago_proveedor'];
const emptyRow=()=>Object.fromEntries(CASH_ROW_KEYS.map(key=>[key,0]));
export const rowExpected=row=>roundMoney(finite(row.base)+finite(row.ventas)+finite(row.abonos)+finite(row.separados)+finite(row.ingresos)-finite(row.gastos)-finite(row.retiros)-finite(row.devoluciones));
/**
 * Libro de caja de un día: filas por medio de pago y esperado. Los medios básicos siempre
 * aparecen; Nequi y Daviplata solo si tuvieron movimiento.
 */
export function cashBook(business={},date){
  const rows={},row=method=>rows[method]??=emptyRow();
  for(const key of BASE_PAYMENT_KEYS)row(key);
  const add=(method,key,value)=>{const number=roundMoney(finite(value));if(!PAYMENT_KEYS.includes(method)||!number)return;const target=row(method);target[key]=roundMoney(target[key]+number)};
  let creditSales=0,layawaySales=0,favorSales=0;
  for(const sale of financialSales(business)){
    const day=businessDay(sale.fecha),reversals=array(sale.reversiones);
    // Servicios históricos y ventas antiguas devueltas sin registro de reversión: regla anterior (valor neto en su fecha).
    if(sale.legacyService||!reversals.length&&(sale.anulada||array(sale.detalles).some(line=>finite(line.devuelto)>0))){
      if(day===date)for(const [method,value]of Object.entries(allocatePayments(sale,saleNet(sale))))add(method,'ventas',value);
      continue;
    }
    if(day===date)for(const payment of salePayments(sale)){
      if(payment.method===CREDIT_METHOD)creditSales+=payment.amount;else if(payment.method===LAYAWAY_METHOD)layawaySales+=payment.amount;else if(payment.method===FAVOR_METHOD)favorSales+=payment.amount;else add(payment.method,'ventas',payment.amount);
    }
    for(const refund of saleRefunds(sale))if(refund.fecha===date)for(const payment of refund.pagos)add(payment.method,'devoluciones',payment.amount);
  }
  for(const payment of array(business.creditPayments))if(payment.fecha===date)add(payment.method,'abonos',payment.amount);
  for(const layaway of array(business.layaways)){
    for(const payment of array(layaway.abonos))if(payment.fecha===date)add(payment.method,'separados',payment.amount);
    const cancel=layaway.cancelacion;if(cancel?.fecha===date&&finite(cancel.reembolso)>0)add(cancel.method,'devoluciones',cancel.reembolso);
  }
  const movements=array(business.cashMovements).filter(item=>item.fecha===date);
  for(const item of movements)add(item.method||'efectivo',{base:'base',gasto:'gastos',retiro:'retiros',ingreso:'ingresos',pago_proveedor:'gastos'}[item.tipo],item.amount);
  const methods=PAYMENT_KEYS.filter(key=>Object.hasOwn(rows,key));
  const ordered=Object.fromEntries(methods.map(key=>[key,rows[key]]));
  return {date,rows:ordered,expected:Object.fromEntries(methods.map(key=>[key,rowExpected(rows[key])])),opening:movements.find(item=>item.tipo==='base')||null,
    movements,creditSales:roundMoney(creditSales),layawaySales:roundMoney(layawaySales),favorSales:roundMoney(favorSales)};
}

// ---------------------------------------------------------------- crédito
export const AGING_BUCKETS=['0-30','31-60','61-90','+90'];
const bucket=days=>days<=30?'0-30':days<=60?'31-60':days<=90?'61-90':'+90';
/** Saldo a crédito de un cliente (suma de las facturas pendientes). */
export function creditBalance(business,customerId){return roundMoney(array(business.ventas).filter(sale=>sale.customerId===customerId&&!sale.anulada&&sale.credito).reduce((sum,sale)=>sum+finite(sale.credito.saldo),0))}
/** Cuentas por cliente: facturas a crédito, abonos, saldo, vencido y antigüedad (días desde la factura). */
export function creditAccounts(business={},today=businessDay(Date.now())){
  const accounts=new Map(),records=array(business.customerRecords).filter(record=>!record.erasedAt);
  const account=(id,fallback={})=>{let item=accounts.get(id);if(!item){const record=records.find(r=>r.id===id)||{};item={customerId:id,nombre:record.nombre||fallback.cliente||'Cliente',telefono:record.telefono||fallback.telefono||'',numeroDocumento:record.numeroDocumento||'',tipoDocumento:record.tipoDocumento||'',
    creditLimit:finite(record.creditLimit),creditDays:record.creditDays??null,saldoAFavor:finite(record.saldoAFavor),saldo:0,vencido:0,disponible:0,antiguedad:Object.fromEntries(AGING_BUCKETS.map(key=>[key,0])),facturas:[],abonos:[]};accounts.set(id,item)}return item};
  for(const record of records)if(finite(record.creditLimit)>0||finite(record.saldoAFavor)>0)account(record.id);
  // Las ventas se guardan de la más nueva a la más antigua: se recorren al revés para listar en orden de creación.
  for(const sale of [...array(business.ventas)].reverse()){
    if(!sale.credito||!sale.customerId)continue;
    const item=account(sale.customerId,sale),saldo=sale.anulada?0:roundMoney(finite(sale.credito.saldo)),fecha=businessDay(sale.fecha),dias=Math.max(0,daysBetween(fecha,today));
    const vencida=saldo>0&&sale.credito.vence<today;
    item.facturas.push({saleId:sale.id,fecha,vence:sale.credito.vence,monto:finite(sale.credito.monto),saldo,pagado:roundMoney(finite(sale.credito.monto)-saldo),total:finite(sale.total),anulada:!!sale.anulada,dias,vencida,diasVencida:vencida?daysBetween(sale.credito.vence,today):0});
    if(saldo>0){item.saldo=roundMoney(item.saldo+saldo);item.antiguedad[bucket(dias)]=roundMoney(item.antiguedad[bucket(dias)]+saldo);if(vencida)item.vencido=roundMoney(item.vencido+saldo)}
  }
  for(const payment of array(business.creditPayments))if(payment.customerId)account(payment.customerId,payment).abonos.push({id:payment.id,numero:payment.numero,fecha:payment.fecha,method:payment.method,amount:finite(payment.amount),usuario:payment.usuario});
  for(const item of accounts.values()){item.facturas.sort((a,b)=>a.fecha.localeCompare(b.fecha));item.abonos.sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)));item.disponible=Math.max(0,roundMoney(item.creditLimit-item.saldo))}
  return [...accounts.values()].sort((a,b)=>b.saldo-a.saldo||a.nombre.localeCompare(b.nombre,'es'));
}
export function portfolioSummary(accounts=[]){
  const withBalance=accounts.filter(account=>account.saldo>0);
  return {clientes:withBalance.length,saldo:sumMoney(withBalance.map(a=>a.saldo)),vencido:sumMoney(withBalance.map(a=>a.vencido)),
    antiguedad:Object.fromEntries(AGING_BUCKETS.map(key=>[key,sumMoney(withBalance.map(a=>a.antiguedad[key]))])),clientesVencidos:withBalance.filter(a=>a.vencido>0).length};
}
export const creditPaymentsIn=(business,range={})=>array(business.creditPayments).filter(p=>(!range.from||p.fecha>=range.from)&&(!range.to||p.fecha<=range.to));
/**
 * Comprueba el cupo para una venta a crédito. Devuelve {limit, used, next, exceeds}.
 * El vendedor no puede superar el cupo; el administrador recibe una advertencia.
 */
export function creditCheck(business,record,value){
  const limit=finite(record?.creditLimit),used=creditBalance(business,record.id),next=roundMoney(used+finite(value));
  return {limit,used,next,exceeds:next>limit};
}
export function creditTerms(business,record,fecha){
  const days=record?.creditDays??cashSettings(business).creditDays;
  return {plazoDias:days,vence:addDays(fecha,days)};
}

// ---------------------------------------------------------------- separados
export const LAYAWAY_STATUS={activo:'Activo',entregado:'Entregado',cancelado:'Cancelado'};
export const layawayExpired=(layaway,today)=>layaway.estado==='activo'&&!!layaway.vence&&layaway.vence<today;
function movement(business,product,before,tipo,documento,actor,at,extra={}){
  business.movimientos??=[];
  business.movimientos.unshift({id:at.getTime()+'-'+product.id+'-'+business.movimientos.length+'-'+Math.random().toString(36).slice(2,6),fecha:at.toISOString(),producto_id:product.id,nombre:product.nombre,
    cantidad:product.stock-before,tipo,usuario:actor.label,userId:actor.id,stock_antes:before,stock_despues:product.stock,tipo_documento:'separado',documento,motivo:'',...extra});
}
const layawayFor=(business,id)=>{const layaway=array(business.layaways).find(item=>item.id===id);if(!layaway)fail('Separado inexistente.',404,'NOT_FOUND');return layaway};
const summary=layaway=>({numero:layaway.numero,cliente:layaway.cliente,total:layaway.total,pagado:layaway.pagado,saldo:layaway.saldo,estado:layaway.estado,vence:layaway.vence});
function payLayaway(layaway,form,actor,today,at){
  if(layaway.estado!=='activo')fail('El separado ya no está activo.',409,'LAYAWAY_CLOSED');
  const value=positive(form.amount,'Abono'),method=cashMethod(form.method);
  if(value>layaway.saldo)fail(`El abono supera el saldo del separado (${layaway.saldo}).`,400,'PAYMENT_EXCEEDS_BALANCE');
  const payment={id:uuid(),numero:layaway.numero+'-'+(array(layaway.abonos).length+1),fecha:today,createdAt:at.toISOString(),method,amount:value,saldoAntes:layaway.saldo,saldoDespues:roundMoney(layaway.saldo-value),usuario:actor.label,userId:actor.id};
  layaway.abonos=[...array(layaway.abonos),payment];layaway.pagado=roundMoney(finite(layaway.pagado)+value);layaway.saldo=payment.saldoDespues;
  return payment;
}

// ---------------------------------------------------------------- acciones
/**
 * cash.open · cash.expense · cash.withdrawal · cash.deposit · credit.payment ·
 * layaway.create · layaway.payment · layaway.deliver · layaway.cancel
 * Devuelve {id, before, after, auditAction, warning?, sale?, document?}.
 */
export function applyCashCreditAction(business,actor,action,{now=Date.now(),today=businessDay(now),requireDataConsent=false}={}){
  if(!actor.companyId)fail('Ingresa como soporte para operar en una empresa',403,'FORBIDDEN');
  const form=action.form||{},at=new Date(now),admin=isAdmin(actor),settings=cashSettings(business);
  const closedToday=array(business.cashClosures).some(record=>record.date===today);
  if(action.type.startsWith('cash.')){
    const kinds={'cash.open':'base','cash.expense':'gasto','cash.withdrawal':'retiro','cash.deposit':'ingreso'},tipo=kinds[action.type];
    if(!tipo)fail('Operación de caja desconocida.',404,'NOT_FOUND');
    if(tipo!=='gasto'&&!admin)fail('Solo el administrador registra '+(tipo==='base'?'la apertura de caja':tipo==='retiro'?'retiros':'ingresos')+'.',403,'FORBIDDEN');
    if(closedToday)fail('La caja de hoy ya está cerrada. Registra el movimiento mañana o consulta al administrador.',409,'CASH_ALREADY_CLOSED');
    const movements=business.cashMovements??=[];
    if(tipo==='base'&&movements.some(item=>item.tipo==='base'&&item.fecha===today))fail('La caja de hoy ya tiene apertura registrada.',409,'CASH_ALREADY_OPEN');
    const value=tipo==='base'?amount(form.amount,'Base inicial'):positive(form.amount,'Valor');
    const method=tipo==='base'?'efectivo':cashMethod(form.method);
    if(tipo==='gasto'&&!admin&&value>settings.maxSellerExpense)fail(`El gasto supera el tope de ${settings.maxSellerExpense} que puede registrar el vendedor. Pide al administrador que lo registre.`,403,'EXPENSE_LIMIT');
    const motivo=tipo==='base'?optional(form.motivo,300)||'Base inicial del día':text(form.motivo,'Motivo',300);
    const record={id:uuid(),tipo,fecha:today,createdAt:at.toISOString(),method,amount:value,motivo,categoria:optional(form.categoria,60),usuario:actor.label,userId:actor.id};
    movements.unshift(record);business.revision++;
    return {id:record.id,before:null,after:structuredClone(record),auditAction:{base:'caja_apertura',gasto:'caja_gasto',retiro:'caja_retiro',ingreso:'caja_ingreso'}[tipo],document:{kind:'caja',id:record.id}};
  }
  if(action.type==='credit.payment'){
    const id=form.customerId;if(typeof id!=='string'||!id||id.length>100)fail('Selecciona el cliente.');
    const record=array(business.customerRecords).find(item=>item.id===id&&!item.erasedAt);if(!record)fail('Cliente inexistente.',404,'CUSTOMER_NOT_FOUND');
    const method=form.method===FAVOR_METHOD?FAVOR_METHOD:cashMethod(form.method),value=positive(form.amount,'Abono');
    const pending=array(business.ventas).map((sale,index)=>({sale,index})).filter(({sale})=>sale.customerId===id&&!sale.anulada&&finite(sale.credito?.saldo)>0)
      .sort((a,b)=>businessDay(a.sale.fecha).localeCompare(businessDay(b.sale.fecha))||b.index-a.index).map(({sale})=>sale);
    const saldo=sumMoney(pending.map(sale=>sale.credito.saldo));
    if(!pending.length)fail('El cliente no tiene saldo pendiente.',409,'NO_BALANCE');
    if(value>saldo)fail(`El abono supera el saldo pendiente (${saldo}).`,400,'PAYMENT_EXCEEDS_BALANCE');
    if(method===FAVOR_METHOD){if(value>finite(record.saldoAFavor))fail(`El cliente tiene ${finite(record.saldoAFavor)} de saldo a favor.`,400,'FAVOR_INSUFFICIENT');record.saldoAFavor=roundMoney(finite(record.saldoAFavor)-value)}
    let rest=value;const aplicado=[];
    for(const sale of pending){if(rest<=0)break;const portion=roundMoney(Math.min(rest,sale.credito.saldo)),before=sale.credito.saldo;sale.credito.saldo=roundMoney(before-portion);sale.credito.pagado=roundMoney(finite(sale.credito.pagado)+portion);rest=roundMoney(rest-portion);aplicado.push({saleId:sale.id,fecha:businessDay(sale.fecha),amount:portion,saldoAntes:before,saldoDespues:sale.credito.saldo})}
    const payments=business.creditPayments??=[];
    const payment={id:uuid(),numero:'AB-'+pad(payments.length+1),fecha:today,createdAt:at.toISOString(),customerId:id,cliente:record.nombre,telefono:record.telefono||'',method,amount:value,aplicado,saldoAntes:saldo,saldoDespues:roundMoney(saldo-value),nota:optional(form.nota,300),usuario:actor.label,userId:actor.id};
    payments.unshift(payment);business.revision++;
    return {id:payment.id,before:{saldo},after:{saldo:payment.saldoDespues,abono:value,medio:method,facturas:aplicado.length},auditAction:'abono_credito',document:{kind:'abono',id:payment.id}};
  }
  if(action.type==='layaway.create'){
    const items=action.items??form.items;
    if(!Array.isArray(items)||!items.length||items.length>100)fail('Agrega de 1 a 100 productos al separado.');
    const records=business.customerRecords??=[];let record=null;
    if(form.customerId!=null&&form.customerId!==''){record=records.find(item=>item.id===form.customerId&&!item.erasedAt);if(!record)fail('El cliente seleccionado ya no existe. Búscalo de nuevo.',404,'CUSTOMER_NOT_FOUND')}
    const cliente=record?record.nombre:text(form.cliente,'Nombre del cliente',200),telefono=record?record.telefono||'':phoneValue(form.telefono);
    if(!record&&cliente.toLowerCase()==='cliente general')fail('Escribe el nombre de quien separa la mercancía.');
    if(telefono&&!record?.consentAt&&requireDataConsent&&form.dataConsent!==true)fail('Confirma que el cliente autorizó el tratamiento de sus datos (teléfono).',400,'DATA_CONSENT_REQUIRED');
    const sale=saleSettings(business),tipo=record?customerType(record.tipo):'mostrador',quantities=new Map();
    for(const [index,item] of items.entries()){
      if(!item||typeof item!=='object')fail('Producto inválido en la línea '+(index+1));
      const quantity=Number(item.cantidad);if(!Number.isSafeInteger(quantity)||quantity<1)fail('Cantidad inválida en la línea '+(index+1));
      if(!array(business.prods).some(p=>p.id===item.producto_id))fail('Producto inexistente');
      quantities.set(item.producto_id,(quantities.get(item.producto_id)||0)+quantity);
    }
    const detalles=[];
    for(const [productId,quantity] of quantities){
      const product=business.prods.find(p=>p.id===productId);
      if(finite(product.stock)<quantity)fail(`Stock insuficiente para ${product.nombre}: quedan ${product.stock} unidades disponibles y solicitaste ${quantity}.`,409,'INSUFFICIENT_STOCK');
      const price=listPrice(product,tipo,sale),rate=productVatRate(product,sale);
      detalles.push({producto_id:product.id,nombre:product.nombre,cantidad:quantity,precio_unitario:price,precio_lista:price,costo_unitario:product.precio_compra??null,...(rate!=null?{tarifa_iva:rate}:{})});
    }
    const total=sumMoney(detalles.map(line=>lineValue(line,line.cantidad)));
    const days=form.dias==null||form.dias===''?settings.layawayDays:Number(form.dias);if(!Number.isSafeInteger(days)||days<1||days>365)fail('Vencimiento: usa de 1 a 365 días.');
    const list=business.layaways??=[];
    const layaway={id:uuid(),numero:'SEP-'+pad(list.length+1),fecha:today,createdAt:at.toISOString(),vence:addDays(today,days),dias:days,customerId:record?.id||null,cliente,telefono,...(tipo!=='mostrador'?{tipoCliente:tipo}:{}),
      detalles,total,pagado:0,saldo:total,abonos:[],estado:'activo',nota:optional(form.nota,300),usuario:actor.label,userId:actor.id,...(sale.vat.enabled?{iva:{incluido:true,preciosCatalogoConIva:sale.vat.pricesIncludeVat,tarifa_mano_obra:sale.vat.defaultRate}}:{}),
      ...(telefono&&form.dataConsent===true?{dataConsent:{consentAt:at.toISOString(),consentBy:actor.label,consentMedium:optional(form.consentMedium,60)||'verbal'}}:{})};
    for(const line of detalles){const product=business.prods.find(p=>p.id===line.producto_id),before=product.stock;product.stock=before-line.cantidad;product.stock_reservado=finite(product.stock_reservado)+line.cantidad;movement(business,product,before,'separado',layaway.id,actor,at)}
    const deposit=form.deposit??(form.abono!=null&&form.abono!==''?{amount:form.abono,method:form.method}:null);
    if(deposit&&finite(deposit.amount)>0)payLayaway(layaway,deposit,actor,today,at);
    list.unshift(layaway);business.revision++;
    return {id:layaway.id,before:null,after:summary(layaway),auditAction:'separado_creado',document:{kind:'separado',id:layaway.id}};
  }
  if(action.type==='layaway.payment'){
    const layaway=layawayFor(business,action.id??form.id),before=summary(layaway),payment=payLayaway(layaway,form,actor,today,at);business.revision++;
    return {id:layaway.id,before,after:summary(layaway),auditAction:'separado_abono',document:{kind:'separado-abono',id:layaway.id,paymentId:payment.id}};
  }
  if(action.type==='layaway.deliver'){
    const layaway=layawayFor(business,action.id??form.id),before=summary(layaway);
    if(layaway.estado!=='activo')fail('El separado ya no está activo.',409,'LAYAWAY_CLOSED');
    if(form.payment&&finite(form.payment.amount)>0)payLayaway(layaway,form.payment,actor,today,at);
    if(layaway.saldo>0)fail(`Falta pagar ${layaway.saldo} para entregar el separado.`,409,'LAYAWAY_BALANCE');
    const sale={id:uuid(),fecha:today,usuario:actor.label,userId:actor.id,cliente:layaway.cliente,telefono:layaway.telefono||'',customerId:layaway.customerId||null,placa:'',
      detalles:layaway.detalles.map(line=>structuredClone(line)),labor:[],subtotal_productos:layaway.total,subtotal_mano_obra:0,total:layaway.total,
      paymentMethod:LAYAWAY_METHOD,payments:[{method:LAYAWAY_METHOD,amount:layaway.total}],separadoId:layaway.id,separadoNumero:layaway.numero,...(layaway.tipoCliente?{tipoCliente:layaway.tipoCliente}:{}),...(layaway.dataConsent?{dataConsent:structuredClone(layaway.dataConsent)}:{})};
    const record=layaway.customerId&&array(business.customerRecords).find(item=>item.id===layaway.customerId);
    if(record?.numeroDocumento){sale.tipoDocumento=record.tipoDocumento;sale.numeroDocumento=record.numeroDocumento}
    if(layaway.iva){sale.iva=structuredClone(layaway.iva);const vat=saleVat(sale);sale.iva.tarifas=vat.rows;sale.iva.total=vat.iva}
    for(const line of layaway.detalles){const product=array(business.prods).find(p=>p.id===line.producto_id);if(!product)continue;product.stock_reservado=Math.max(0,finite(product.stock_reservado)-line.cantidad);movement(business,product,product.stock,'entrega_separado',layaway.id,actor,at,{venta:sale.id,unidades:line.cantidad})}
    business.ventas??=[];business.ventas.unshift(sale);
    Object.assign(layaway,{estado:'entregado',entregadoEn:at.toISOString(),fechaEntrega:today,saleId:sale.id,entregadoPor:actor.label});business.revision++;
    return {id:layaway.id,before,after:{...summary(layaway),venta:sale.id},auditAction:'separado_entregado',sale,document:{kind:'separado',id:layaway.id}};
  }
  if(action.type==='layaway.cancel'){
    if(!admin)fail('Solo el administrador puede cancelar un separado.',403,'FORBIDDEN');
    const layaway=layawayFor(business,action.id??form.id),before=summary(layaway);
    if(layaway.estado!=='activo')fail('El separado ya no está activo.',409,'LAYAWAY_CLOSED');
    const motivo=text(form.motivo,'Motivo',500),destino=layaway.pagado>0?form.destino:'ninguno';
    if(layaway.pagado>0&&!['reembolso','saldo_a_favor'].includes(destino))fail('Elige si devuelves el dinero o lo dejas como saldo a favor del cliente.');
    const cancel={fecha:today,createdAt:at.toISOString(),motivo,destino,usuario:actor.label,userId:actor.id};
    if(destino==='reembolso'){cancel.method=cashMethod(form.method);cancel.reembolso=layaway.pagado}
    if(destino==='saldo_a_favor'){
      const record=layaway.customerId&&array(business.customerRecords).find(item=>item.id===layaway.customerId&&!item.erasedAt);
      if(!record)fail('El separado no tiene ficha de cliente: elige devolver el dinero.',400,'CUSTOMER_REQUIRED');
      record.saldoAFavor=roundMoney(finite(record.saldoAFavor)+layaway.pagado);cancel.saldoAFavor=layaway.pagado;
    }
    for(const line of layaway.detalles){const product=array(business.prods).find(p=>p.id===line.producto_id);if(!product)fail('Un producto del separado ya no existe; no se puede devolver al inventario.');const prior=product.stock;product.stock=prior+line.cantidad;product.stock_reservado=Math.max(0,finite(product.stock_reservado)-line.cantidad);movement(business,product,prior,'separado_cancelado',layaway.id,actor,at,{motivo})}
    Object.assign(layaway,{estado:'cancelado',cancelacion:cancel});business.revision++;
    return {id:layaway.id,before,after:{...summary(layaway),destino,valor:layaway.pagado},auditAction:'separado_cancelado',motivo,document:{kind:'separado',id:layaway.id}};
  }
  fail('Acción desconocida',404,'NOT_FOUND');
}

/** Enlace de WhatsApp para recordar un cobro (número colombiano de 10 dígitos o con indicativo). */
export function whatsappLink(phone,message){
  let digits=String(phone||'').replace(/\D/g,'');
  if(digits.length===10&&digits.startsWith('3'))digits='57'+digits;
  return digits.length>=11&&digits.length<=15?'https://wa.me/'+digits+'?text='+encodeURIComponent(message):'';
}
export {paymentLabel};
