// Private, per-user working copies. No stock is reserved until sale.create succeeds.
const fail=(message,status=400,code='INVALID_DRAFT')=>{throw Object.assign(Error(message),{status,code})};
export const draftKey=actor=>JSON.stringify([actor.companyId,actor.id,!!actor.support]);
export function readDraft(state,actor){
  if(!actor.companyId)fail('Entra a una empresa para recuperar una venta.',403,'FORBIDDEN');
  return structuredClone(state.saleDrafts?.[draftKey(actor)]||{version:0,draft:null});
}
function cleanDraft(value){
  if(value===null)return null;
  if(!value||typeof value!=='object'||Array.isArray(value)||JSON.stringify(value).length>200000)fail('El borrador es demasiado grande o no es válido.');
  const array=(v,max)=>{if(!Array.isArray(v)||v.length>max)fail('Demasiadas líneas en la venta pendiente.');return v};
  const str=(v,max=200)=>{if(typeof v!=='string'||v.length>max)fail('Hay un campo demasiado largo en la venta pendiente.');return v};
  const amount=v=>{if(typeof v==='string'&&v.length<=30)return v;if(typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1e12)return v;fail('Valor inválido en la venta pendiente.')};
  const labor=v=>({descripcion:str(v.descripcion,3000),mecanico:str(v.mecanico),importe:amount(v.importe),...(Object.hasOwn(v,'mecanicoId')?{mecanicoId:str(v.mecanicoId,100)}:{})});
  const form=value.saleForm||{};
  const next={cart:array(value.cart,1000).map(v=>({producto_id:str(v.producto_id,100),nombre:str(v.nombre),cantidad:amount(v.cantidad),precio_unitario:amount(v.precio_unitario)})),
    labor:array(value.labor,100).map(v=>({...labor(v),key:str(v.key,100)})),laborDraft:labor(value.laborDraft||{}),
    saleForm:{cliente:str(form.cliente),telefono:str(form.telefono,30),placa:str(form.placa,12),fecha:str(form.fecha,10),paymentMethod:str(form.paymentMethod,20)},pendingSale:null};
  if(value.pendingSale){
    const a=value.pendingSale;
    if(a.type!=='sale.create'||a.requestId!==a.draftRequestId)fail('Operación pendiente inválida.');
    str(a.requestId,150);
    if(Object.hasOwn(a,'revision')&&(!Number.isSafeInteger(a.revision)||a.revision<0))fail('La revisión del cobro pendiente debe ser un entero válido no negativo.');
    // Keep the exact payload for a safe retry, while admitting only the sale fields.
    next.pendingSale={type:'sale.create',requestId:a.requestId,draftRequestId:a.draftRequestId,...(Object.hasOwn(a,'revision')?{revision:a.revision}:{}),form:structuredClone(next.saleForm),
      items:array(a.items,1000).map(v=>({producto_id:str(v.producto_id,100),nombre:str(v.nombre),cantidad:amount(v.cantidad),precio_unitario:amount(v.precio_unitario)})),
      labor:array(a.labor,100).map(labor)};
    next.pendingSale.form.placa=next.pendingSale.form.placa.trim().toUpperCase();
  }
  return next;
}
export function writeDraft(state,actor,body,now){
  const prior=readDraft(state,actor);
  if(typeof body.writeId!=='string'||!body.writeId||body.writeId.length>150)fail('Identificador de guardado inválido.');
  if(prior.writeId===body.writeId){if(JSON.stringify(prior.draft)!==JSON.stringify(cleanDraft(body.draft)))fail('El identificador de guardado ya fue usado con otros datos.');return prior;}
  if(!Number.isSafeInteger(body.version)||body.version!==prior.version)fail('Esta venta pendiente cambió en otra pestaña o equipo. Recarga el borrador guardado antes de continuar.',409,'DRAFT_CONFLICT');
  const next={version:prior.version+1,draft:cleanDraft(body.draft),writeId:body.writeId,updatedAt:new Date(now??Date.now()).toISOString()};
  state.saleDrafts??={};state.saleDrafts[draftKey(actor)]=next;
  return structuredClone(next);
}
export function assertDraftSale(state,actor,action){
  if(!action.draftRequestId)return;
  const saved=readDraft(state,actor).draft?.pendingSale;
  if(!saved||saved.requestId!==action.requestId||saved.draftRequestId!==action.draftRequestId)fail('La venta pendiente cambió. Recupera la versión guardada antes de cobrar.',409,'DRAFT_CONFLICT');
  for(const key of ['form','items','labor'])if(JSON.stringify(saved[key])!==JSON.stringify(action[key]))fail('La venta no coincide con el cobro pendiente. Comprueba la operación guardada.',409,'DRAFT_CONFLICT');
}
export function finishDraftSale(state,actor,action,saleId,now){
  if(!action.draftRequestId)return;
  const prior=readDraft(state,actor);
  state.saleDrafts[draftKey(actor)]={version:prior.version+1,draft:null,saleId,updatedAt:new Date(now??Date.now()).toISOString()};
}
