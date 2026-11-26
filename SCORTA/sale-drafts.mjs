// Private, per-user working copies. No stock is reserved until sale.create succeeds,
// including the sales on hold (FE-07): they only keep the cart for later.
import {MAX_HELD_SALES} from './sale-pricing.mjs';
const fail=(message,status=400,code='INVALID_DRAFT')=>{throw Object.assign(Error(message),{status,code})};
// FE-07: up to MAX_HELD carts on hold besides the current one. A full cart is ~150 KB at
// most, so 1 MB covers the usual counter while bounding the single JSON state.
export const MAX_DRAFT_CHARS=1000000,MAX_HELD=MAX_HELD_SALES;
export const draftKey=actor=>JSON.stringify([actor.companyId,actor.id,!!actor.support]);
export function readDraft(state,actor){
  if(!actor.companyId)fail('Entra a una empresa para recuperar una venta.',403,'FORBIDDEN');
  return structuredClone(state.saleDrafts?.[draftKey(actor)]||{version:0,draft:null});
}
// Key order never matters when comparing a saved payload with the one being charged.
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const array=(v,max)=>{if(!Array.isArray(v)||v.length>max)fail('Demasiadas líneas en la venta pendiente.');return v};
const str=(v,max=200)=>{if(typeof v!=='string'||v.length>max)fail('Hay un campo demasiado largo en la venta pendiente.');return v};
const amount=v=>{if(typeof v==='string'&&v.length<=30)return v;if(typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1e12)return v;fail('Valor inválido en la venta pendiente.')};
const object=v=>{if(!v||typeof v!=='object'||Array.isArray(v))fail('Dato inválido en la venta pendiente.');return v};
const discount=v=>v==null?null:(object(v),{tipo:str(v.tipo,20),valor:amount(v.valor)});
const labor=v=>({descripcion:str(v.descripcion,3000),mecanico:str(v.mecanico),importe:amount(v.importe),...(Object.hasOwn(v,'mecanicoId')?{mecanicoId:str(v.mecanicoId,100)}:{})});
// Optional fields are kept only when present, so older drafts round-trip unchanged.
const item=v=>{object(v);const next={producto_id:str(v.producto_id,100),nombre:str(v.nombre),cantidad:amount(v.cantidad),precio_unitario:amount(v.precio_unitario)};
  if(Object.hasOwn(v,'precio'))next.precio=amount(v.precio);
  if(Object.hasOwn(v,'descuento'))next.descuento=discount(v.descuento);
  if(Object.hasOwn(v,'precioEditado'))next.precioEditado=v.precioEditado===true;
  return next;};
const OPTIONAL_TEXT=[['consentMedium',20],['efectivo_recibido',30],['customerId',100],['tipoDocumento',10],['numeroDocumento',30],['correo',254],['tipoCliente',20]];
function saleForm(form){
  object(form);
  const next={cliente:str(form.cliente),telefono:str(form.telefono,30),placa:str(form.placa,12),fecha:str(form.fecha,10),paymentMethod:str(form.paymentMethod,20)};
  if(Object.hasOwn(form,'dataConsent'))next.dataConsent=form.dataConsent===true;
  for(const [key,max]of OPTIONAL_TEXT)if(Object.hasOwn(form,key)&&form[key]!=null)next[key]=typeof form[key]==='number'?amount(form[key]):str(form[key],max);
  if(Object.hasOwn(form,'descuento'))next.descuento=discount(form.descuento);
  if(Object.hasOwn(form,'payments'))next.payments=array(form.payments,5).map(p=>(object(p),{method:str(p.method,20),amount:amount(p.amount)}));
  return next;
}
function cart(value){
  return {cart:array(value.cart,1000).map(item),labor:array(value.labor,100).map(v=>({...labor(v),key:str(v.key,100)})),saleForm:saleForm(value.saleForm||{})};
}
function cleanDraft(value){
  if(value===null)return null;
  if(!value||typeof value!=='object'||Array.isArray(value))fail('El borrador no es válido.');
  if(JSON.stringify(value).length>MAX_DRAFT_CHARS)fail('Las ventas pendientes y en espera ocupan demasiado. Cobra o descarta alguna venta en espera.',400,'DRAFT_TOO_LARGE');
  const current=cart(value);
  const next={cart:current.cart,labor:current.labor,laborDraft:labor(value.laborDraft||{}),saleForm:current.saleForm,pendingSale:null};
  if(Object.hasOwn(value,'held')){
    if(!Array.isArray(value.held)||value.held.length>MAX_HELD)fail(`Puedes tener hasta ${MAX_HELD} ventas en espera. Cobra o descarta alguna antes de agregar otra.`,400,'TOO_MANY_HELD');
    next.held=value.held.map(entry=>{object(entry);return {id:str(entry.id,100),nombre:str(entry.nombre,200),createdAt:str(entry.createdAt,40),...cart(entry)}});
  }
  if(value.pendingSale){
    const a=value.pendingSale;
    if(a.type!=='sale.create'||a.requestId!==a.draftRequestId)fail('Operación pendiente inválida.');
    str(a.requestId,150);
    if(Object.hasOwn(a,'revision')&&(!Number.isSafeInteger(a.revision)||a.revision<0))fail('La revisión del cobro pendiente debe ser un entero válido no negativo.');
    // Keep the exact payload for a safe retry, while admitting only the sale fields.
    next.pendingSale={type:'sale.create',requestId:a.requestId,draftRequestId:a.draftRequestId,...(Object.hasOwn(a,'revision')?{revision:a.revision}:{}),form:saleForm(a.form||next.saleForm),
      items:array(a.items,1000).map(item),labor:array(a.labor,100).map(labor)};
    next.pendingSale.form.placa=next.pendingSale.form.placa.trim().toUpperCase();
  }
  return next;
}
export function writeDraft(state,actor,body,now){
  const prior=readDraft(state,actor);
  if(typeof body.writeId!=='string'||!body.writeId||body.writeId.length>150)fail('Identificador de guardado inválido.');
  if(prior.writeId===body.writeId){if(!same(prior.draft,cleanDraft(body.draft)))fail('El identificador de guardado ya fue usado con otros datos.');return prior;}
  if(!Number.isSafeInteger(body.version)||body.version!==prior.version)fail('Esta venta pendiente cambió en otra pestaña o equipo. Recarga el borrador guardado antes de continuar.',409,'DRAFT_CONFLICT');
  const next={version:prior.version+1,draft:cleanDraft(body.draft),writeId:body.writeId,updatedAt:new Date(now??Date.now()).toISOString()};
  state.saleDrafts??={};state.saleDrafts[draftKey(actor)]=next;
  return structuredClone(next);
}
export function assertDraftSale(state,actor,action){
  if(!action.draftRequestId)return;
  const saved=readDraft(state,actor).draft?.pendingSale;
  if(!saved||saved.requestId!==action.requestId||saved.draftRequestId!==action.draftRequestId)fail('La venta pendiente cambió. Recupera la versión guardada antes de cobrar.',409,'DRAFT_CONFLICT');
  let charged;
  try{charged={form:saleForm(action.form||{}),items:array(action.items||[],1000).map(item),labor:array(action.labor||[],100).map(labor)};charged.form.placa=charged.form.placa.trim().toUpperCase()}
  catch{fail('La venta no coincide con el cobro pendiente. Comprueba la operación guardada.',409,'DRAFT_CONFLICT')}
  for(const key of ['form','items','labor'])if(!same(saved[key],charged[key]))fail('La venta no coincide con el cobro pendiente. Comprueba la operación guardada.',409,'DRAFT_CONFLICT');
}
// Ley 1581: corrige o borra los datos de un cliente en los borradores y ventas en espera de la empresa
// (formularios de venta actual, de cada venta en espera y del cobro pendiente). `matches(form)` decide si
// el formulario es de ese cliente; `apply(form)` lo reescribe; `heldName` reemplaza el nombre de una venta
// en espera cuando era el nombre escrito del cliente. Si algo cambió, la versión del borrador sube para que
// ninguna pestaña con la copia anterior vuelva a guardar los datos viejos. Devuelve cuántos borradores cambiaron.
export function rewriteCustomerDrafts(state,companyId,{matches,apply,heldName},now){
  let changed=0;
  for(const [key,entry] of Object.entries(state.saleDrafts||{})){
    let scope;try{scope=JSON.parse(key)}catch{continue}
    const draft=entry?.draft;if(scope[0]!==companyId||!draft||typeof draft!=='object')continue;
    let touched=false;
    const rewrite=form=>{if(!form||typeof form!=='object'||!matches(form))return null;const was=String(form.cliente??'').trim().toLowerCase();apply(form);touched=true;return was;};
    rewrite(draft.saleForm);
    for(const held of Array.isArray(draft.held)?draft.held:[]){const was=rewrite(held?.saleForm);if(was!==null&&was&&String(held.nombre??'').trim().toLowerCase()===was)held.nombre=heldName;}
    rewrite(draft.pendingSale?.form);
    if(touched){entry.version=(Number(entry.version)||0)+1;entry.updatedAt=new Date(now??Date.now()).toISOString();changed++;}
  }
  return changed;
}
export function finishDraftSale(state,actor,action,saleId,now){
  if(!action.draftRequestId)return;
  const prior=readDraft(state,actor),held=prior.draft?.held;
  // The charged cart is cleared; carts on hold stay for later (FE-07).
  const draft=held?.length?{cart:[],labor:[],laborDraft:{descripcion:'',mecanico:'',importe:''},saleForm:{cliente:'',telefono:'',placa:'',fecha:'',paymentMethod:'efectivo'},pendingSale:null,held}:null;
  state.saleDrafts[draftKey(actor)]={version:prior.version+1,draft,saleId,updatedAt:new Date(now??Date.now()).toISOString()};
}
