// Shared synchronous inventory rules for SQLite production and browser-only demo.
// Storage, permissions, request idempotency and transactions belong to each adapter.
import {moneyAmount,roundMoney,sumMoney} from './money.mjs';
export function estadoVacio() {
  return {revision: 0, prods: [], compras: [], ventas: [], servs: [], movimientos: []};
}

 const num=(v,integer=false)=>{const n=Number(v);if(v===''||v==null||!Number.isFinite(n)||n<0||n>1e12||(integer&&!Number.isSafeInteger(n)))throw Error('Valor numérico inválido');return n};
 const optionalNum=(v,fallback=0,integer=false)=>num(v===''||v==null?fallback:v,integer);
 const blank=v=>v==null||(typeof v==='string'&&!v.trim());
 const optionalCost=v=>blank(v)?null:moneyAmount(v,'Costo');
 const historyFor=p=>p.costHistory??=[{kind:'baseline',costo_unitario:blank(p.precio_compra)?null:p.precio_compra}];
 const cancelPurchaseCost=(p,documentId)=>{
   const history=historyFor(p),tracked=history.some(entry=>entry.kind==='purchase'&&entry.documentId===documentId);
   // An old purchase cannot establish what preceded its current legacy cost.
   // Invalidate that baseline even when a later, known source still takes priority.
   p.costHistory=history.filter(entry=>entry.kind!=='purchase'||entry.documentId!==documentId)
     .map(entry=>!tracked&&entry.kind==='baseline'?{...entry,costo_unitario:null}:entry);
   p.precio_compra=p.costHistory.at(-1)?.costo_unitario??null;
 };
 const text=(v,max=200)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('Texto obligatorio o demasiado largo');return v.trim()};

export function aplicarCambio(state, a, actor = 'local') {
  const s = structuredClone(state);
  a = structuredClone(a);
  if (a.revision !== s.revision) throw Error('Otro usuario modificó los datos. Recarga y vuelve a intentar.');
  const id = Date.now().toString() + Math.random().toString(36).slice(2, 8);
  const f = a.form || {};
 const movement=(p,before,tipo,extra={})=>s.movimientos.unshift({id:id+'-'+p.id+'-'+s.movimientos.length,fecha:new Date().toISOString(),producto_id:p.id,nombre:p.nombre,cantidad:p.stock-before,tipo,usuario:actor,stock_antes:before,stock_despues:p.stock,tipo_documento:null,...extra});
 const checkIdentifiers=p=>{for(const [key,label] of [['referencia','referencia'],['codigo_barras','código de barras']]){const value=String(p[key]||'').trim().toLowerCase();if(value&&s.prods.some(x=>x.id!==p.id&&String(x[key]||'').trim().toLowerCase()===value))throw Error('Ya existe un producto con '+(key==='referencia'?'esa referencia':'ese '+label));}};
 if(a.kind==='producto'){
 const old=s.prods.find(p=>p.id===f.id);
 const suppliedCost=Object.hasOwn(f,'precio_compra');
 const unchangedCost=old&&suppliedCost&&!blank(f.precio_compra)&&Number(f.precio_compra)===old.precio_compra;
 const cost=old&&(!suppliedCost||unchangedCost)?old.precio_compra??null:optionalCost(f.precio_compra);
 const costHistory=old?historyFor(old):[{kind:'baseline',costo_unitario:cost}];
 if(old&&suppliedCost&&!unchangedCost)costHistory.push({kind:'manual',costo_unitario:cost});
 const p={id:old?.id||id,nombre:text(f.nombre),categoria:text(f.categoria||'General'),referencia:String(f.referencia||'').trim().slice(0,100),marca:String(f.marca||'').trim().slice(0,100),modelo:String(f.modelo||'').trim().slice(0,100),compatibilidad:String(f.compatibilidad||'').trim().slice(0,300),codigo_barras:String(f.codigo_barras||'').trim().slice(0,100),precio_compra:cost,costHistory,precio_venta:moneyAmount(f.precio_venta,'Precio de venta'),stock:old?old.stock:optionalNum(f.stock,0,true),stock_minimo:optionalNum(f.stock_minimo,5,true)};
 if(s.prods.some(x=>x.id!==p.id&&x.nombre.toLowerCase()===p.nombre.toLowerCase()))throw Error('Ya existe un producto con ese nombre');
 checkIdentifiers(p);
 if(old)s.prods[s.prods.indexOf(old)]=p;else{s.prods.push(p);movement(p,0,'apertura');}
  }else if(a.kind==='ajuste'){
 const p=s.prods.find(x=>x.id===a.id);if(!p)throw Error('Producto inexistente');historyFor(p);const stock=num(f.stock,true),motivo=text(f.motivo,500);const before=p.stock;p.stock=stock;movement(p,before,'ajuste',{motivo});
 }else if(a.kind==='eliminar'){
 const p=s.prods.find(x=>x.id===a.id);if(!p)throw Error('Producto inexistente');if(p.stock!==0)throw Error('Solo se pueden retirar productos sin existencias');if(s.movimientos.some(m=>m.producto_id===p.id&&(m.tipo!=='apertura'||m.cantidad!==0))||[...s.compras,...s.ventas,...s.servs].some(doc=>doc.detalles.some(d=>d.producto_id===p.id)))throw Error('El producto tiene historial y no puede retirarse');s.prods=s.prods.filter(x=>x.id!==a.id);
 }else if(a.kind==='estado'){
 const p=s.servs.find(x=>x.id===a.id),states=['pendiente','en_proceso','completado','entregado'];if(!p||p.anulada||!states.includes(p.estado)||p.estado==='entregado')throw Error('Estado inválido');p.estado=states[states.indexOf(p.estado)+1];if(p.estado==='entregado')p.fecha_entrega=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 }else if(a.kind==='importar'){
 if(!Array.isArray(a.items)||!a.items.length||a.items.length>1000)throw Error('Importa de 1 a 1000 productos');
 for(const [index,row] of a.items.entries()){const nombre=text(row.nombre),referencia=String(row.referencia||'').trim();if(s.prods.some(p=>p.nombre.toLowerCase()===nombre.toLowerCase()||(referencia&&p.referencia?.toLowerCase()===referencia.toLowerCase())))throw Error('Producto o referencia duplicado en fila '+(index+2));const cost=optionalCost(row.precio_compra);const p={id:id+'-'+index,nombre,categoria:String(row.categoria||'General').trim(),referencia,marca:String(row.marca||'').trim(),modelo:String(row.modelo||'').trim(),compatibilidad:String(row.compatibilidad||'').trim(),codigo_barras:String(row.codigo_barras||'').trim(),precio_compra:cost,costHistory:[{kind:'baseline',costo_unitario:cost}],precio_venta:moneyAmount(row.precio_venta,'Precio de venta'),stock:num(row.stock||0,true),stock_minimo:num(row.stock_minimo||0,true)};checkIdentifiers(p);s.prods.push(p);movement(p,0,'apertura');}
 }else if(a.kind==='reversion'){
 const maps={compra:'compras',venta:'ventas',servicio:'servs'};const collection=maps[f.tipo];if(!collection)throw Error('Tipo inválido');const rec=s[collection].find(x=>x.id===a.id);if(!rec||rec.anulada)throw Error('Documento inexistente o anulado');const motivo=text(f.motivo,500);const partial=f.parcial===true;
 if(partial&&f.tipo!=='venta')throw Error('Solo las ventas admiten devolución parcial');
 if(partial&&(!Array.isArray(a.items)||a.items.length===0))throw Error('Selecciona productos a devolver');
 const selected=partial?a.items:rec.detalles.map((d,index)=>({index,cantidad:d.cantidad-(d.devuelto||0)})).filter(d=>d.cantidad>0);
 const seen=new Set();for(const line of selected){const index=num(line.index,true),q=num(line.cantidad,true);if(seen.has(index)||q<1)throw Error('Cantidad o línea inválida');seen.add(index);const d=rec.detalles[index];if(!d||q>d.cantidad-(d.devuelto||0))throw Error('Cantidad superior a la pendiente');const p=s.prods.find(x=>x.id===d.producto_id);if(!p)throw Error('Producto retirado: no se puede revertir');const delta=f.tipo==='compra'?-q:q;if(p.stock+delta<0)throw Error('Stock insuficiente para revertir compra: '+p.nombre);const before=p.stock;p.stock+=delta;d.devuelto=(d.devuelto||0)+q;movement(p,before,partial?'devolución':'anulación',{motivo,documento:rec.id,tipo_documento:f.tipo});}
 if(f.tipo==='compra')for(const productId of new Set(rec.detalles.map(detail=>detail.producto_id))){const p=s.prods.find(product=>product.id===productId);if(p)cancelPurchaseCost(p,rec.id);}
 rec.reversiones??=[];rec.reversiones.push({id,fecha:new Date().toISOString(),usuario:actor,motivo,parcial:partial,detalles:selected});if(!partial){rec.anulada=true;rec.estado_anterior=rec.estado;if(f.tipo==='servicio')rec.estado='anulado';}
 }else if(['compra','venta','servicio'].includes(a.kind)){
 const date=text(f.fecha,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date).toISOString().slice(0,10)!==date)throw Error('Fecha inválida');
 if(!Array.isArray(a.items)||(!a.items.length&&a.kind!=='servicio'))throw Error('Agrega productos');
 const quantities=new Map();const detalles=a.items.map(it=>{const p=s.prods.find(x=>x.id===it.producto_id);if(!p)throw Error('Producto inexistente');historyFor(p);const cantidad=num(it.cantidad,true);if(cantidad<1)throw Error('Cantidad inválida');quantities.set(p.id,(quantities.get(p.id)||0)+cantidad);return {producto_id:p.id,nombre:p.nombre,cantidad,precio_unitario:moneyAmount(it.precio_unitario,'Precio unitario'),costo_unitario:p.precio_compra??null}});
 for(const [pid,qty] of quantities){const p=s.prods.find(x=>x.id===pid);if(a.kind!=='compra'&&p.stock<qty)throw Error('Stock insuficiente para '+p.nombre+': quedan '+p.stock+' unidades y solicitaste '+qty);const before=p.stock;p.stock+=(a.kind==='compra'?qty:-qty);if(a.kind==='compra'){const lines=detalles.filter(x=>x.producto_id===pid),purchaseTotal=sumMoney(lines.map(x=>roundMoney(x.cantidad*x.precio_unitario))),unitCost=roundMoney(purchaseTotal/qty);
 // Weighted average cost: existing units keep their known cost. With unknown
 // prior cost or no prior stock the purchase cost is the only verifiable source.
 const prior=p.precio_compra;p.precio_compra=prior==null||before<=0?unitCost:roundMoney((before*prior+purchaseTotal)/(before+qty));
 p.costHistory.push({kind:'purchase',documentId:id,costo_unitario:p.precio_compra,costo_compra:unitCost});}movement(p,before,a.kind,{documento:id,tipo_documento:a.kind});}
 const record={id,fecha:date,usuario:actor,detalles,total:sumMoney(detalles.map(x=>roundMoney(x.cantidad*x.precio_unitario)))};
 if(a.kind==='compra'){record.proveedor=text(f.proveedor||'Sin especificar');s.compras.unshift(record)}
 if(a.kind==='venta'){record.cliente=text(f.cliente||'Cliente general');s.ventas.unshift(record)}
 if(a.kind==='servicio'){Object.assign(record,{placa:text(f.placa).toUpperCase(),marca_moto:text(f.marca_moto||'Sin especificar'),descripcion_trabajo:text(f.descripcion_trabajo,3000),costo_mano_obra:blank(f.costo_mano_obra)?0:moneyAmount(f.costo_mano_obra,'Mano de obra'),estado:'pendiente'});record.total=sumMoney([record.total,record.costo_mano_obra]);s.servs.unshift(record)}
 }else throw Error('Operación desconocida');
 s.auditoria??=[];s.auditoria.unshift({id,fecha:new Date().toISOString(),usuario:actor,accion:a.kind,documento:a.id||id});s.revision++;
  return s;
}
