// BE-35: garantías y piezas en reclamo al proveedor. Reglas puras compartidas por el servidor,
// la demo local, la interfaz y los reportes. platform.mjs aplica permisos, plan, idempotencia,
// auditoría y transacción; las acciones mutan el negocio recibido (ya clonado).
//
// Decisiones (docs/PLATFORM-API.md › Garantías):
// - Recibir (vendedor o admin) registra la pieza defectuosa de una línea de venta. La unidad NO
//   vuelve al stock vendible: queda en `stock_garantia` del producto (movimiento
//   «garantia_recibida», cantidad 0 en el stock vendible).
// - Decidir es solo del administrador:
//   · cambio: se entrega otra unidad del stock vendible (movimiento «garantia_cambio», −n).
//   · reparación: la misma pieza se repara y se devuelve al cliente al cerrar.
//   · devolución: se devuelve el dinero de esas unidades como una devolución parcial de la venta
//     (`devuelto` de la línea y `reversiones[].reembolso`, igual que sale.reverse) pero sin volver
//     al stock vendible; el dinero sale de la caja del día en que se paga.
//   · rechazo: la pieza se devuelve al cliente y la garantía queda cerrada.
// - Reclamo al proveedor (admin): recibida → enviada → aprobada | rechazada → cerrada. Al cerrar,
//   la pieza sale de `stock_garantia` con un resultado: reposición del proveedor (entra al stock
//   vendible), nota crédito (se queda en el proveedor), baja (pieza dañada) o entregada al cliente
//   (reparación).
// - Plazo de garantía por producto (`garantia_dias`, opcional). Fuera de plazo se recibe con aviso
//   (`fueraDePlazo` y `warning` en la respuesta) y decide el administrador.
// - El vendedor solo recibe garantías de sus propias ventas (las únicas que ve).
import {roundMoney} from './money.mjs';
import {refundFor,cashMethod,businessDay} from './caja-credito.mjs';
import {addDays,nextNumber} from './cotizaciones.mjs';

const fail=(message,status=400,code)=>{throw Object.assign(Error(message),{status,...(code?{code}:{})})};
const array=value=>Array.isArray(value)?value:[];
const finite=value=>{const number=Number(value);return Number.isFinite(number)?number:0};
const optional=(value,max=500)=>value==null?'':String(value).trim().slice(0,max);
const text=(value,label,max=500)=>{if(typeof value!=='string'||!value.trim()||value.length>max)fail(label+': dato obligatorio o demasiado largo.');return value.trim()};
const isAdmin=actor=>actor.role==='admin'||actor.role==='owner';
const uuid=()=>crypto.randomUUID();

export const WARRANTY_DECISIONS=Object.freeze({cambio:'Cambio por otra unidad',reparacion:'Reparación',devolucion:'Devolución de dinero',rechazo:'Rechazada'});
export const WARRANTY_STATUS=Object.freeze({recibida:'Recibida del cliente',enviada:'Enviada al proveedor',aprobada:'Aprobada por el proveedor',rechazada:'Rechazada por el proveedor',cerrada:'Cerrada'});
export const WARRANTY_RESULTS=Object.freeze({reposicion:'Reposición del proveedor (entra al stock)',nota_credito:'Nota crédito del proveedor',baja:'Baja de la pieza',entregada_cliente:'Entregada al cliente',devuelta_cliente:'Devuelta al cliente (rechazo)'});
const NEXT={recibida:['enviada','cerrada'],enviada:['aprobada','rechazada'],aprobada:['cerrada'],rechazada:['cerrada'],cerrada:[]};

/** Plazo de garantía del producto en días (null = sin plazo definido). */
export function warrantyDaysOf(product){const days=Number(product?.garantia_dias);return Number.isSafeInteger(days)&&days>0?days:null}
/** Valida el campo garantia_dias del formulario de producto ('' o null lo quita). */
export function cleanWarrantyDays(value){
  if(value===''||value==null)return null;
  const days=Number(value);
  if(!Number.isSafeInteger(days)||days<0||days>3650)throw Error('Garantía: usa un número entero de días entre 0 y 3650.');
  return days||null;
}
/** Vencimiento de la garantía de una venta para un producto: {dias, vence, fueraDePlazo}. */
export function warrantyTerm(product,sale,today){
  const dias=warrantyDaysOf(product);if(!dias)return {dias:null,vence:null,fueraDePlazo:false};
  const vence=addDays(businessDay(sale.fecha),dias);
  return {dias,vence,fueraDePlazo:vence<today};
}
/** Unidades de una línea que todavía pueden reclamarse (vendidas − devueltas − en garantía).
 *  Una garantía resuelta con «devolución» ya está contada en `devuelto` de la línea: no se resta dos veces. */
export function claimableUnits(business,sale,index){
  const line=sale?.detalles?.[index];if(!line)return 0;
  const used=array(business.warranties).filter(item=>item.saleId===sale.id&&item.lineIndex===index&&!['rechazo','devolucion'].includes(item.decision?.tipo)).reduce((sum,item)=>sum+finite(item.cantidad),0);
  return Math.max(0,finite(line.cantidad)-finite(line.devuelto)-used);
}
const warrantyFor=(business,id)=>{const warranty=array(business.warranties).find(item=>item.id===id);if(!warranty)fail('Garantía inexistente.',404,'NOT_FOUND');return warranty};
const productFor=(business,id)=>{const product=array(business.prods).find(item=>item.id===id);if(!product)fail('El producto de la garantía ya no existe en el inventario.',409,'PRODUCT_NOT_FOUND');return product};
const summary=w=>({numero:w.numero,producto:w.nombre,cantidad:w.cantidad,estado:w.estado,decision:w.decision?.tipo||null,proveedor:w.proveedor||''});
function movement(business,product,before,tipo,warranty,actor,at,extra={}){
  business.movimientos??=[];
  business.movimientos.unshift({id:at.getTime()+'-'+product.id+'-'+business.movimientos.length+'-'+Math.random().toString(36).slice(2,6),fecha:at.toISOString(),producto_id:product.id,nombre:product.nombre,
    cantidad:finite(product.stock)-before,tipo,usuario:actor.label,userId:actor.id,stock_antes:before,stock_despues:finite(product.stock),tipo_documento:'garantia',documento:warranty.id,motivo:'',unidades:warranty.cantidad,
    stock_garantia:finite(product.stock_garantia),...extra});
}
const log=(warranty,estado,actor,at,nota)=>{warranty.historial=[...array(warranty.historial),{estado,fecha:at.toISOString(),usuario:actor.label,userId:actor.id,...(nota?{nota}:{})}]};
function supplierOf(business,form,fallback={}){
  if(form.supplierId!=null&&form.supplierId!==''){
    const supplier=array(business.suppliers).find(item=>item.id===form.supplierId);
    if(!supplier)fail('Proveedor inexistente.',404,'SUPPLIER_NOT_FOUND');
    return {supplierId:supplier.id,proveedor:supplier.nombre};
  }
  const name=optional(form.proveedor,200);
  return name?{supplierId:null,proveedor:name}:fallback;
}
/** Proveedor de la última compra del producto (sugerencia al recibir la garantía). */
export function lastSupplierFor(business,productId){
  const purchase=array(business.compras).find(item=>!item.anulada&&array(item.detalles).some(line=>line.producto_id===productId));
  return purchase?{supplierId:purchase.supplierId||null,proveedor:purchase.proveedor||''}:{supplierId:null,proveedor:''};
}
function releaseUnit(business,warranty,actor,at,resultado){
  const product=productFor(business,warranty.producto_id),before=finite(product.stock);
  product.stock_garantia=Math.max(0,finite(product.stock_garantia)-warranty.cantidad);
  if(resultado==='reposicion')product.stock=before+warranty.cantidad;
  movement(business,product,before,resultado==='reposicion'?'garantia_reposicion':'garantia_salida',warranty,actor,at,{motivo:WARRANTY_RESULTS[resultado]});
  warranty.enGarantia=0;warranty.resultado=resultado;
}

function decide(business,warranty,actor,form,at,today){
  if(!isAdmin(actor))fail('Solo el administrador decide la garantía.',403,'FORBIDDEN');
  if(warranty.decision)fail('La garantía ya tiene una decisión.',409,'WARRANTY_DECIDED');
  if(warranty.estado==='cerrada')fail('La garantía ya está cerrada.',409,'WARRANTY_CLOSED');
  const tipo=form.decision;if(!Object.hasOwn(WARRANTY_DECISIONS,tipo))fail('Decisión inválida: usa cambio, reparacion, devolucion o rechazo.');
  const nota=optional(form.nota??form.motivoDecision,500),decision={tipo,fecha:today,createdAt:at.toISOString(),usuario:actor.label,userId:actor.id,...(nota?{nota}:{})};
  let warning='';
  if(tipo==='cambio'){
    const product=productFor(business,warranty.producto_id),before=finite(product.stock);
    if(before<warranty.cantidad)fail(`No hay stock para el cambio de ${product.nombre}: quedan ${before} unidades disponibles.`,409,'INSUFFICIENT_STOCK');
    product.stock=before-warranty.cantidad;movement(business,product,before,'garantia_cambio',warranty,actor,at,{motivo:'Cambio por garantía '+warranty.numero});
  }
  if(tipo==='devolucion'){
    const sale=array(business.ventas).find(item=>item.id===warranty.saleId);if(!sale||sale.anulada)fail('La venta de la garantía no existe o está anulada.',409,'SALE_NOT_FOUND');
    const line=sale.detalles?.[warranty.lineIndex];if(!line||finite(line.cantidad)-finite(line.devuelto)<warranty.cantidad)fail('Esas unidades ya fueron devueltas en la venta.',409,'ALREADY_RETURNED');
    const original=structuredClone(sale),method=form.refundMethod==null||form.refundMethod===''?null:cashMethod(form.refundMethod);
    line.devuelto=finite(line.devuelto)+warranty.cantidad;
    const reversal={id:uuid(),fecha:at.toISOString(),fechaComercial:today,usuario:actor.label,motivo:'Garantía '+warranty.numero+': '+warranty.motivo,parcial:true,detalles:[{index:warranty.lineIndex,cantidad:warranty.cantidad}],garantiaId:warranty.id};
    if(array(business.cashClosures).some(c=>c.date===businessDay(sale.fecha)))reversal.afterClosure=true;
    reversal.reembolso=refundFor(original,sale,{method});
    sale.reversiones=[...array(sale.reversiones),reversal];
    const service=array(business.servs).find(item=>item.venta_id===sale.id);if(service){service.detalles=structuredClone(sale.detalles);service.reversiones=structuredClone(sale.reversiones)}
    decision.reembolso=reversal.reembolso;
    if(reversal.reembolso.credito>0)warning=`Se descontaron ${reversal.reembolso.credito} del saldo a crédito de la venta.`;
  }
  warranty.decision=decision;log(warranty,warranty.estado,actor,at,'Decisión: '+WARRANTY_DECISIONS[tipo]+(nota?' · '+nota:''));
  if(tipo==='rechazo'){releaseUnit(business,warranty,actor,at,'devuelta_cliente');warranty.estado='cerrada';warranty.cerradaEn=at.toISOString();log(warranty,'cerrada',actor,at,'Pieza devuelta al cliente')}
  return warning;
}

/**
 * warranty.create · warranty.decide · warranty.status
 * Devuelve {id, before, after, auditAction, document, warning?}.
 */
export function applyWarrantyAction(business,actor,action,{now=Date.now(),today}={}){
  const form=action.form||{},at=new Date(now);
  if(action.type==='warranty.create'){
    const sale=array(business.ventas).find(item=>item.id===form.saleId);
    if(!sale)fail('Venta inexistente.',404,'NOT_FOUND');
    if(sale.anulada)fail('La venta está anulada; no admite garantía.',409,'SALE_CANCELLED');
    if(!isAdmin(actor)&&sale.userId!==actor.id)fail('Solo puedes recibir garantías de tus propias ventas. Pide al administrador que la reciba.',403,'FORBIDDEN');
    const index=Number(form.lineIndex);if(!Number.isSafeInteger(index)||!sale.detalles?.[index])fail('Selecciona el producto de la venta.');
    const line=sale.detalles[index],quantity=form.cantidad==null||form.cantidad===''?1:Number(form.cantidad);
    if(!Number.isSafeInteger(quantity)||quantity<1)fail('Cantidad inválida.');
    const available=claimableUnits(business,sale,index);
    if(quantity>available)fail(`Solo ${available===1?'queda 1 unidad':'quedan '+available+' unidades'} de ${line.nombre} por reclamar en esta venta.`,409,'WARRANTY_QUANTITY');
    const product=productFor(business,line.producto_id),motivo=text(form.motivo,'Motivo del reclamo',500),term=warrantyTerm(product,sale,today);
    const supplier=supplierOf(business,form,lastSupplierFor(business,product.id));
    const list=business.warranties??=[];
    const warranty={id:uuid(),numero:nextNumber(business,'garantia','GAR',list),fecha:today,createdAt:at.toISOString(),saleId:sale.id,saleFecha:businessDay(sale.fecha),lineIndex:index,
      producto_id:product.id,nombre:line.nombre,cantidad:quantity,precio_unitario:finite(line.precio_unitario),cliente:sale.cliente||'Cliente general',telefono:sale.telefono||'',customerId:sale.customerId||null,
      motivo,supplierId:supplier.supplierId||null,proveedor:supplier.proveedor||'',garantiaDias:term.dias,venceGarantia:term.vence,fueraDePlazo:term.fueraDePlazo,
      estado:'recibida',enGarantia:quantity,decision:null,historial:[],nota:optional(form.nota,500),usuario:actor.label,userId:actor.id};
    const before=finite(product.stock);product.stock_garantia=finite(product.stock_garantia)+quantity;
    movement(business,product,before,'garantia_recibida',warranty,actor,at,{motivo});
    log(warranty,'recibida',actor,at,motivo);
    list.unshift(warranty);
    let warning=term.fueraDePlazo?`La venta está fuera del plazo de garantía de ${term.dias} días (venció el ${term.vence}). El administrador decide si la acepta.`:'';
    if(form.decision!=null&&form.decision!==''){const extra=decide(business,warranty,actor,form,at,today);if(extra)warning=[warning,extra].filter(Boolean).join(' ')}
    business.revision++;
    return {id:warranty.id,before:null,after:summary(warranty),auditAction:'garantia_recibida',document:{kind:'garantia',id:warranty.id},...(warning?{warning}:{})};
  }
  if(action.type==='warranty.decide'){
    const warranty=warrantyFor(business,action.id??form.id),before=summary(warranty),warning=decide(business,warranty,actor,form,at,today);business.revision++;
    return {id:warranty.id,before,after:summary(warranty),auditAction:'garantia_decision',document:{kind:'garantia',id:warranty.id},...(warning?{warning}:{})};
  }
  if(action.type==='warranty.status'){
    if(!isAdmin(actor))fail('Solo el administrador gestiona el reclamo al proveedor.',403,'FORBIDDEN');
    const warranty=warrantyFor(business,action.id??form.id),before=summary(warranty),estado=form.estado;
    if(!Object.hasOwn(WARRANTY_STATUS,estado)||estado==='recibida')fail('Estado inválido: usa enviada, aprobada, rechazada o cerrada.');
    if(!NEXT[warranty.estado]?.includes(estado))fail(`La garantía está «${WARRANTY_STATUS[warranty.estado]}» y no puede pasar a «${WARRANTY_STATUS[estado]}».`,409,'WARRANTY_STATUS');
    const nota=optional(form.nota,500);
    if(estado==='enviada'){
      if(warranty.decision?.tipo==='rechazo')fail('La garantía fue rechazada al cliente; no se reclama al proveedor.',409,'WARRANTY_STATUS');
      const supplier=supplierOf(business,form,{supplierId:warranty.supplierId,proveedor:warranty.proveedor});
      if(!supplier.proveedor)fail('Indica el proveedor al que envías la pieza.');
      Object.assign(warranty,{supplierId:supplier.supplierId||null,proveedor:supplier.proveedor,enviadaEn:today});
    }
    if(['aprobada','rechazada'].includes(estado))warranty.respuestaProveedor={estado,fecha:today,...(nota?{nota}:{})};
    if(estado==='cerrada'){
      if(!warranty.decision)fail('Decide primero la garantía con el cliente (cambio, reparación, devolución o rechazo).',409,'WARRANTY_UNDECIDED');
      const allowed=warranty.decision.tipo==='reparacion'?['entregada_cliente']:warranty.estado==='aprobada'?['reposicion','nota_credito','baja']:['baja','reposicion'];
      const resultado=form.resultado||allowed[0];
      if(!allowed.includes(resultado))fail('Resultado inválido para esta garantía: usa '+allowed.join(', ')+'.');
      releaseUnit(business,warranty,actor,at,resultado);warranty.cerradaEn=at.toISOString();
    }
    warranty.estado=estado;log(warranty,estado,actor,at,nota);business.revision++;
    return {id:warranty.id,before,after:summary(warranty),auditAction:'garantia_'+estado,document:{kind:'garantia',id:warranty.id}};
  }
  fail('Acción desconocida',404,'NOT_FOUND');
}

/** Reporte de garantías del período (fecha de recepción) por producto y por proveedor. */
export function warrantyReport(business={},{from,to}={}){
  const rows=array(business.warranties).filter(item=>(!from||item.fecha>=from)&&(!to||item.fecha<=to)).map(item=>({id:item.numero,date:item.fecha,product:item.nombre,quantity:finite(item.cantidad),customer:item.cliente,supplier:item.proveedor||'Sin proveedor',
    reason:item.motivo,decision:item.decision?WARRANTY_DECISIONS[item.decision.tipo]:'Pendiente',status:WARRANTY_STATUS[item.estado]||item.estado,result:item.resultado?WARRANTY_RESULTS[item.resultado]:'',outOfTerm:item.fueraDePlazo?'Sí':'No',
    refund:roundMoney(finite(item.decision?.reembolso?.total)),value:roundMoney(finite(item.cantidad)*finite(item.precio_unitario))}));
  const group=key=>{const map=new Map();for(const row of rows){const item=map.get(row[key])||{name:row[key],count:0,units:0,value:0,pending:0,approved:0,rejected:0};item.count++;item.units+=row.quantity;item.value=roundMoney(item.value+row.value);
    const source=array(business.warranties).find(w=>w.numero===row.id);if(source?.estado==='aprobada'||source?.respuestaProveedor?.estado==='aprobada')item.approved++;if(source?.estado==='rechazada'||source?.respuestaProveedor?.estado==='rechazada')item.rejected++;if(source&&source.estado!=='cerrada')item.pending++;map.set(row[key],item)}
    return [...map.values()].sort((a,b)=>b.units-a.units||a.name.localeCompare(b.name,'es'))};
  return {kind:'warranties',rows,byProduct:group('product'),bySupplier:group('supplier'),totals:{count:rows.length,units:rows.reduce((sum,row)=>sum+row.quantity,0),open:array(business.warranties).filter(item=>item.estado!=='cerrada').length,inWarranty:array(business.prods).reduce((sum,p)=>sum+finite(p.stock_garantia),0)}};
}
export const WARRANTY_COLUMNS=[['id','Garantía'],['date','Fecha'],['product','Producto'],['quantity','Unidades'],['customer','Cliente'],['supplier','Proveedor'],['reason','Motivo'],['decision','Decisión'],['status','Estado'],['result','Resultado'],['outOfTerm','Fuera de plazo'],['refund','Dinero devuelto'],['value','Valor de venta']];
