import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import Papa from 'papaparse';
import {transformWithOxc} from 'vite';
import {moneyAmount,roundMoney,sumMoney} from '../money.mjs';
import {money} from '../src/format.mjs';
import * as venta from '../sale-pricing.mjs';
import {matchScannedCode,UNSUPPORTED_SCANNER_MESSAGE} from '../src/barcode-scanner.mjs';
import {OFFLINE_SALE_MESSAGE} from '../src/connectivity.mjs';
import {formatDate,formatDateTime} from '../src/format.mjs';

// This harness runs the actual JSX callbacks and effects in Node. It does not
// start a server, emulate a browser layout, or substitute a copy of the handlers.
let compiled;
before(async()=>{
 const source=readFileSync(new URL('../src/ClientWorkspace.jsx',import.meta.url),'utf8');
 compiled=(await transformWithOxc(source,'ClientWorkspace.jsx',{jsx:{runtime:'classic'}})).code
  .replace(/^import[^\n]*;\n/gm,'').replace(/export default function /g,'function ').replace(/export function /g,'function ')
  // El arnés no expande componentes: el campo de dinero se prueba como un input simple (MoneyInput tiene su propia prueba).
  .replace(/(?<![\w$])MoneyInput(?![\w$])/g,'"input"');
});
const prior={window:globalThis.window,document:globalThis.document};
const listeners=new Map();let confirmations=[],confirmResult=true;
before(()=>{
 const add=(name,handler)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(handler)};
 const remove=(name,handler)=>listeners.get(name)?.delete(handler);
 globalThis.window={addEventListener:add,removeEventListener:remove,confirm:text=>{confirmations.push(text);return confirmResult}};
 globalThis.document={addEventListener:add,removeEventListener:remove,activeElement:{focus(){}},visibilityState:'visible',body:{style:{overflow:''}}};
});
after(()=>{globalThis.window=prior.window;globalThis.document=prior.document;});
const fire=(name,event={})=>{for(const listener of [...(listeners.get(name)||[])])listener({preventDefault(){},stopPropagation(){},...event})};
const clone=value=>structuredClone(value);
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const product={id:'p1',nombre:'Pastillas de freno',referencia:'REP-01',categoria:'Frenos',stock:40,stock_minimo:3,precio_compra:5000,precio_venta:10000};
const baseForm=()=>({cliente:'',telefono:'',placa:'',fecha:'2026-11-20',paymentMethod:'efectivo'});
const draft=(overrides={})=>({cart:[{producto_id:'p1',nombre:product.nombre,cantidad:1,precio_unitario:product.precio_venta}],labor:[],laborDraft:{descripcion:'',mecanico:'',importe:''},saleForm:baseForm(),pendingSale:null,...overrides});
const baseData=(overrides={})=>({revision:7,state:{prods:[clone(product)],ventas:[],compras:[],servs:[],movimientos:[],mechanics:[{id:'m1',name:'Carlos',active:true}],customers:[],vehicles:[],...overrides}});

function harness({role='vendedor',initialDraft=null,onAction=async()=>baseData(),onRetryAction,onRefresh=async()=>baseData(),data=baseData(),kind='ClientWorkspace',props:extra={}}={}){
 let cursor=0,changed=true,tree,props={session:{userId:'u1',username:'juan',name:'Juan',role,companyId:'company-1',company:{id:'company-1',name:'Moto Norte'}},data,onAction,onRetryAction,onRefresh,...extra};
 const slots=[],pendingEffects=[],drafts=[];
 function useState(initial){const index=cursor++;if(!slots[index])slots[index]={value:typeof initial==='function'?initial():initial};return [slots[index].value,update=>{const next=typeof update==='function'?update(slots[index].value):update;if(!Object.is(next,slots[index].value)){slots[index].value=next;changed=true}}]}
 function useRef(initial){const index=cursor++;if(!slots[index])slots[index]={ref:{current:initial}};return slots[index].ref}
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 function useEffect(callback,deps){const index=cursor++;if(!slots[index]||!same(slots[index].deps,deps)){pendingEffects.push(()=>{slots[index]?.cleanup?.();slots[index]={deps,cleanup:callback()}})}}
 function useMemo(callback,deps){const index=cursor++;if(!slots[index]||!same(slots[index].deps,deps))slots[index]={value:callback(),deps};return slots[index].value}
 const useCallback=(callback,deps)=>useMemo(()=>callback,deps);
 class DraftSync{
  constructor({request,onStatus}){this.request=request;this.onStatus=onStatus;this.loaded=false;this.disposed=false;this.latest=clone(initialDraft);this.saved=JSON.stringify(this.latest);this.unsaved=false;this.writes=[];this.version=1;drafts.push(this)}
  async load(){this.loaded=true;this.onStatus({status:'saved',error:''});return {draft:clone(initialDraft),version:this.version}}
  update(value){if(this.disposed)return;this.latest=clone(value);this.unsaved=JSON.stringify(value)!==this.saved}
  async flush(){if(this.disposed)throw Error('disposed');this.writes.push(clone(this.latest));this.saved=JSON.stringify(this.latest);this.unsaved=false;return {version:++this.version,draft:clone(this.latest)}}
  acceptCompleted(value){this.completed=value;this.latest=null;this.saved='null';this.unsaved=false}
  dispose(){this.disposed=true}
 }
 const mockReact={...React,useId:()=>`field-${cursor++}`};
 const components=new Function('ProductPhotoInput','React','useCallback','useEffect','useMemo','useRef','useState','Papa','SaleDraftSync','draftRequest','OverviewPanel','AdminTools','PurchaseExcel','Receipt','moneyAmount','roundMoney','sumMoney','money','venta','BarcodeScanner','scannerSupport','matchScannedCode','UNSUPPORTED_SCANNER_MESSAGE','useOnline','OFFLINE_SALE_MESSAGE','formatDate','formatDateTime',compiled+';return {ClientWorkspace,Modal};')(()=>null,
  mockReact,useCallback,useEffect,useMemo,useRef,useState,Papa,DraftSync,async()=>({version:1,draft:null}),()=>null,()=>null,()=>null,()=>null,moneyAmount,roundMoney,sumMoney,money,venta,()=>null,()=>'none',matchScannedCode,UNSUPPORTED_SCANNER_MESSAGE,()=>true,OFFLINE_SALE_MESSAGE,formatDate,formatDateTime);
 function render(next){if(next)props={...props,...next};cursor=0;changed=false;tree=components[kind](props);while(pendingEffects.length)pendingEffects.shift()();return tree}
 async function settle(){for(let i=0;i<10;i++){await Promise.resolve();if(changed)render();await Promise.resolve()}return tree}
 function dispose(){for(const slot of slots)slot?.cleanup?.();}
 render();return {get tree(){return tree},get props(){return props},get sync(){return drafts.at(-1)},render,settle,dispose,components};
}
function nodes(root,predicate,result=[]){if(root==null||typeof root==='boolean')return result;if(Array.isArray(root)){root.forEach(item=>nodes(item,predicate,result));return result}if(typeof root!=='object')return result;if(predicate(root))result.push(root);nodes(root.props?.children,predicate,result);return result}
const text=node=>node==null||typeof node==='boolean'?'':Array.isArray(node)?node.map(text).join(''):typeof node==='object'?text(node.props?.children):String(node);
const named=(h,label)=>nodes(h.tree,node=>(node.type==='button'||node.type?.name==='Btn')&&(text(node)===label||node.props.title===label||node.props['aria-label']===label))[0];
const field=(h,label)=>nodes(h.tree,node=>node.type?.name==='Field'&&node.props.label===label)[0]?.props.children;
const modal=h=>nodes(h.tree,node=>node.type?.name==='Modal')[0];
const click=(h,label)=>{const node=named(h,label);assert.ok(node,`Control ${label}`);assert.ok(!node.props.disabled,`${label} no está deshabilitado`);return node.props.onClick?.({currentTarget:{closest:()=>({open:true})},preventDefault(){}})};
const edit=(h,label,value)=>{const node=field(h,label);assert.ok(node,`Campo ${label}`);return node.props.onChange({target:{value}})};
// Compras: escribe en el buscador y pulsa Enter (como un lector de códigos).
const pickProduct=async(h,value)=>{edit(h,'Buscar producto',value);await h.settle();field(h,'Buscar producto').props.onKeyDown({key:'Enter',preventDefault(){},currentTarget:{value}});await h.settle()};
const consent=(h,checked=true)=>{const node=field(h,'El cliente autorizó el tratamiento de sus datos');assert.ok(node,'Casilla de consentimiento');return node.props.onChange({target:{checked}})};
const submit=h=>{const form=nodes(h.tree,node=>node.type==='form').at(-1);assert.ok(form);return form.props.onSubmit({preventDefault(){}})};
// Estas pruebas recorren la fila de la tabla; la vista de tarjetas tiene su propia prueba.
async function openInventory(h){click(h,'Inventario');await h.settle();click(h,'Tabla');await h.settle()}
async function openProduct(h){await openInventory(h);click(h,'Nuevo producto');await h.settle()}
async function openPurchase(h){click(h,'Compras');await h.settle();click(h,'Ingresar mercancía');await h.settle()}
function successSale(action){return {...baseData(),revision:8,draftVersion:3,state:{...baseData().state,prods:[{...product,stock:product.stock-action.items.reduce((n,l)=>n+l.cantidad,0)}],ventas:[{id:'sale-1',fecha:action.form.fecha,cliente:action.form.cliente,telefono:action.form.telefono,placa:action.form.placa,usuario:'Juan',detalles:action.items,labor:action.labor,total:action.items.reduce((n,l)=>n+l.cantidad*l.precio_unitario,0)}]}}}

test('H01: editar cantidad a 2 y sumar desde venta, tabla o tarjetas produce 3 numérico, nunca 21',async()=>{
 for(const via of ['sale','inventory','cards']){
  const h=harness({initialDraft:draft()});try{await h.settle();const input=nodes(h.tree,n=>n.type==='input'&&n.props['aria-label']===`Cantidad de ${product.nombre}`)[0];input.props.onChange({target:{value:'2'}});await h.settle();
   if(via==='sale')click(h,`Agregar una unidad de ${product.nombre}`);else if(via==='cards'){click(h,'Inventario');await h.settle();click(h,`Agregar ${product.nombre} al carrito`)}else{await openInventory(h);click(h,'Agregar al carrito')}
   await h.settle();assert.equal(h.sync.latest.cart[0].cantidad,3);assert.equal(typeof h.sync.latest.cart[0].cantidad,'number');
  }finally{h.dispose()}
 }
});

test('H01: incrementar una cantidad antigua almacenada como texto respeta stock disponible',async()=>{
 const h=harness({initialDraft:draft({cart:[{...draft().cart[0],cantidad:'2'}]}),data:baseData({prods:[{...product,stock:3}]})});try{await h.settle();click(h,`Agregar una unidad de ${product.nombre}`);await h.settle();click(h,`Agregar una unidad de ${product.nombre}`);await h.settle();assert.equal(h.sync.latest.cart[0].cantidad,3);assert.match(text(h.tree),/quedan 3 unidades/)}finally{h.dispose()}
});

test('H16: el reintento local comprueba la acción global original y limpia el borrador sin volver a cobrar',async()=>{
 let posts=0,retries=0,original;
 const h=harness({initialDraft:draft(),onAction:async action=>{posts++;original=clone(action);throw Object.assign(Error('Respuesta perdida'),{uncertain:true})},onRetryAction:async()=>{retries++;return successSale(original)}});
 try{await h.settle();await submit(h);await h.settle();assert.equal(posts,1);assert.equal(original.revision,7);assert.ok(h.sync.latest.pendingSale);h.render({data:{...baseData(),revision:99},pendingAction:original});await h.settle();await click(h,'Comprobar cobro pendiente');await h.settle();assert.equal(posts,1);assert.equal(retries,1);assert.equal(original.revision,7);assert.equal(h.sync.latest,null);assert.ok(modal(h));assert.equal(modal(h).props.title,'Detalle de venta')}finally{h.dispose()}
});

test('H16: un cobro restaurado se reenvía con su identificador y revisión, incluso si el stock ya cambió',async()=>{
 const original={type:'sale.create',requestId:'saved-sale',draftRequestId:'saved-sale',revision:2,form:baseForm(),items:draft().cart,labor:[]};let captured;
 const h=harness({initialDraft:draft({pendingSale:original}),data:baseData({prods:[{...product,stock:0}]}),onAction:async action=>{captured=clone(action);return successSale(action)}});
 try{await h.settle();await submit(h);await h.settle();assert.deepEqual(captured,original);assert.equal(h.sync.latest,null)}finally{h.dispose()}
});

test('H17: Escape usa el cierre vigente, pide confirmación tras editar y no cierra durante POST',async()=>{
 confirmations=[];confirmResult=false;const h=harness({role:'admin'});let mh;
 try{await h.settle();await openProduct(h);mh=harness({kind:'Modal',props:modal(h).props});await mh.settle();edit(h,'Nombre del producto','Producto nuevo');await h.settle();mh.render(modal(h).props);fire('keydown',{key:'Escape'});await h.settle();assert.equal(confirmations.length,1);assert.ok(modal(h));
  mh.render({...modal(h).props,busy:true});fire('keydown',{key:'Escape'});assert.equal(confirmations.length,1);assert.ok(modal(h));
  confirmResult=true;mh.render(modal(h).props);fire('keydown',{key:'Escape'});await h.settle();assert.equal(confirmations.length,2);assert.equal(modal(h),undefined);
 }finally{mh?.dispose();h.dispose();confirmResult=true}
});

test('H18: compra bloquea formulario entero durante POST y resultado incierto; recuperar no reenvía líneas editadas',async()=>{
 const gate=deferred();let posts=0,original,retries=0;
 const h=harness({role:'admin',onAction:async action=>{posts++;original=clone(action);return gate.promise},onRetryAction:async()=>{retries++;return baseData({compras:[{id:'purchase-1',detalles:original.payload.items,total:5000}]})}});
 try{await h.settle();await openPurchase(h);edit(h,'Proveedor','Proveedor A');await pickProduct(h,'REP-01');click(h,'Agregar a la compra');await h.settle();const pending=submit(h);await h.settle();assert.ok(modal(h).props.busy);
  edit(h,'Proveedor','Proveedor B');edit(h,'Buscar producto','pastillas');click(h,'Agregar a la compra');await h.settle();assert.equal(field(h,'Proveedor').props.value,'Proveedor A');assert.equal(original.payload.items.length,1);
  const mh=harness({kind:'Modal',props:modal(h).props});try{await mh.settle();assert.ok(nodes(mh.tree,n=>n.type==='fieldset'&&n.props.disabled).length)}finally{mh.dispose()}
  gate.reject(Object.assign(Error('Respuesta incierta'),{uncertain:true}));await pending;await h.settle();assert.ok(modal(h).props.busy);const status=modal(h).props.status;assert.match(text(status),/formulario conserva los datos/);const retry=nodes(status,n=>n.type?.name==='Btn')[0];await retry.props.onClick();await h.settle();assert.equal(posts,1);assert.equal(retries,1);assert.equal(modal(h),undefined);
 }finally{h.dispose()}
});

test('H18: validación definitiva conserva el producto y permite corregirlo, sin bloqueo pendiente',async()=>{
 const h=harness({role:'admin',onAction:async()=>{throw Object.assign(Error('Nombre duplicado'),{status:400})}});
 try{await h.settle();await openProduct(h);edit(h,'Nombre del producto','Duplicado');edit(h,'Precio de venta (COP)','10000');await h.settle();await submit(h);await h.settle();assert.ok(!modal(h).props.busy);assert.equal(field(h,'Nombre del producto').props.value,'Duplicado');edit(h,'Nombre del producto','Corregido');await h.settle();assert.equal(field(h,'Nombre del producto').props.value,'Corregido')}finally{h.dispose()}
});

test('H19: la placa recuperada en venta de productos queda visible y se puede corregir antes de cobrar',async()=>{
 let action;const oldSale={id:'old',fecha:'2026-11-19',cliente:'Ana Torres',telefono:'3001234567',placa:'OLD12D',detalles:[],total:1};
 const h=harness({initialDraft:draft({saleForm:{...baseForm(),cliente:'Ana'}}),data:baseData({ventas:[oldSale]}),onAction:async value=>{action=clone(value);return successSale(value)}});
 try{await h.settle();click(h,'Usar datos');await h.settle();assert.equal(field(h,'Placa asociada a esta venta').props.value,'OLD12D');edit(h,'Placa asociada a esta venta','NEW12D');await h.settle();consent(h);await h.settle();await submit(h);await h.settle();assert.equal(action.form.placa,'NEW12D');assert.equal(action.form.cliente,'Ana Torres')}finally{h.dispose()}
});

test('H19: al retirar la última mano de obra sigue visible la placa y puede quitarse explícitamente',async()=>{
 const work={key:'labor-1',descripcion:'Cambio de frenos',mecanico:'Carlos',mecanicoId:'m1',importe:30000};
 const h=harness({initialDraft:draft({labor:[work],saleForm:{...baseForm(),placa:'ABC12D'}})});
 try{await h.settle();click(h,'Retirar servicio Cambio de frenos');await h.settle();assert.equal(h.sync.latest.labor.length,0);assert.equal(field(h,'Placa asociada a esta venta').props.value,'ABC12D');click(h,'Quitar placa de esta venta');await h.settle();assert.equal(h.sync.latest.saleForm.placa,'');assert.equal(field(h,'Placa asociada a esta venta'),undefined)}finally{h.dispose()}
});

test('H24: refresco fallido/null no anuncia éxito; un resultado válido sí lo anuncia',async()=>{
 let ok=false;const h=harness({role:'admin',onRefresh:async()=>ok?baseData():null});
 try{await h.settle();click(h,'Movimientos');await h.settle();await click(h,'Actualizar');await h.settle();assert.match(text(h.tree),/No se pudieron actualizar/);assert.doesNotMatch(text(h.tree),/Datos actualizados/);ok=true;await click(h,'Actualizar');await h.settle();assert.match(text(h.tree),/Datos actualizados/);assert.doesNotMatch(text(h.tree),/No se pudieron actualizar/)}finally{h.dispose()}
});

test('costo de producto vacío sigue desconocido/null; cero explícito y centavos se conservan',async()=>{
 for(const cost of ['', '0', '12.35']){let captured;const h=harness({role:'admin',onAction:async action=>{captured=clone(action);return baseData()}});try{await h.settle();await openProduct(h);edit(h,'Nombre del producto','Nuevo');edit(h,'Precio de venta (COP)','20.55');edit(h,'Precio de compra (COP)',cost);await h.settle();await submit(h);await h.settle();assert.equal(captured.payload.form.precio_compra,cost===''?null:Number(cost));assert.equal(captured.payload.form.precio_venta,20.55)}finally{h.dispose()}}
});


test('costo legado de tres decimales se conserva al editar el nombre; un costo cambiado sí exige dos decimales',async()=>{
 let captured;const historical={...product,precio_compra:1.005,costKnown:true};
 const h=harness({role:'admin',data:baseData({prods:[historical]}),onAction:async action=>{captured=clone(action);return baseData({prods:[{...historical,...action.payload.form}]})}});
 try{await h.settle();await openInventory(h);const row=nodes(h.tree,n=>n.type==='button'&&n.props.className==='cw-product-link')[0];assert.ok(row);row.props.onClick();await h.settle();click(h,'Editar producto');await h.settle();assert.equal(field(h,'Precio de compra (COP)').props.step,'any');edit(h,'Nombre del producto','Pastillas renombradas');await h.settle();await submit(h);await h.settle();assert.equal(captured.payload.form.precio_compra,1.005);assert.equal(captured.payload.form.nombre,'Pastillas renombradas');
  await openInventory(h);const again=nodes(h.tree,n=>n.type==='button'&&n.props.className==='cw-product-link')[0];again.props.onClick();await h.settle();click(h,'Editar producto');await h.settle();captured=null;edit(h,'Precio de compra (COP)','1.006');await h.settle();await submit(h);await h.settle();assert.equal(captured,null);assert.match(text(h.tree),/hasta dos decimales/);
 }finally{h.dispose()}
});

test('INT-06: teléfono o placa exigen la casilla de consentimiento y la venta envía dataConsent y consentMedium',async()=>{
 let action=null;const h=harness({initialDraft:draft({saleForm:{...baseForm(),telefono:'3001234567'}}),onAction:async value=>{action=clone(value);return successSale(value)}});
 try{await h.settle();await submit(h);await h.settle();assert.equal(action,null,'sin casilla no se envía');assert.match(nodes(h.tree,n=>n.type?.name==='Field'&&n.props.label==='El cliente autorizó el tratamiento de sus datos')[0].props.error,/Confirma que el cliente autorizó/);
  consent(h);edit(h,'Medio de la autorización','escrito');await h.settle();await submit(h);await h.settle();assert.equal(action.form.dataConsent,true);assert.equal(action.form.consentMedium,'escrito');assert.equal(action.form.telefono,'3001234567');
 }finally{h.dispose()}
 const plain=harness({initialDraft:draft(),onAction:async value=>{action=clone(value);return successSale(value)}});
 try{await plain.settle();assert.equal(field(plain,'El cliente autorizó el tratamiento de sus datos'),undefined);await submit(plain);await plain.settle();assert.ok(!('dataConsent' in action.form),'sin datos personales no se envía consentimiento')}finally{plain.dispose()}
});

test('INT-07/09: el admin revoca el enlace del comprobante y corrige o borra los datos de un cliente',async()=>{
 const actions=[];confirmations=[];confirmResult=true;
 const sale={id:'sale-9',fecha:'2026-11-20',cliente:'Ana Torres',telefono:'3001234567',placa:'ABC12D',customerId:'c1',usuario:'admin',detalles:[],total:1000,receiptExpiresAt:new Date(Date.now()+86400000).toISOString()};
 const data=baseData({ventas:[sale],customers:[{id:'c1',nombre:'Ana Torres',telefono:'3001234567',placas:['ABC12D'],purchaseCount:1,totalSpent:1000}],customerRecords:[{id:'c1',nombre:'Ana Torres',telefono:'3001234567',consentAt:'2026-11-20T10:00:00Z',consentMedium:'verbal'}]});
 const h=harness({role:'admin',data,onAction:async action=>{actions.push(clone(action));return data}});
 try{
  await h.settle();click(h,'Nueva venta');await h.settle();click(h,'Consultar ventas');await h.settle();click(h,'Ver venta');await h.settle();assert.equal(modal(h).props.title,'Detalle de venta');
  await click(h,'Revocar enlace');await h.settle();assert.equal(actions.at(-1).type,'sale.receipt.revoke');assert.equal(actions.at(-1).id,'sale-9');assert.match(confirmations.at(-1),/Revocar el enlace/);
  h.render();await h.settle();click(h,'Buscar cliente o placa');await h.settle();edit(h,'Nombre o teléfono','Ana');await h.settle();
  click(h,'Corregir datos');await h.settle();assert.equal(modal(h).props.title,'Corregir datos del cliente');edit(h,'Nombre del cliente','Ana María Torres');await h.settle();await submit(h);await h.settle();
  assert.deepEqual({type:actions.at(-1).type,id:actions.at(-1).id,form:actions.at(-1).form},{type:'customer.update',id:'c1',form:{nombre:'Ana María Torres',telefono:'3001234567'}});
  await h.settle();edit(h,'Nombre o teléfono','Ana');await h.settle();await click(h,'Eliminar datos personales');await h.settle();assert.equal(actions.at(-1).type,'customer.erase');assert.match(confirmations.at(-1),/no se puede deshacer/);
 }finally{h.dispose()}
 const seller=harness({role:'vendedor',data});try{await seller.settle();click(seller,'Buscar cliente o placa');await seller.settle();edit(seller,'Nombre o teléfono','Ana');await seller.settle();assert.equal(named(seller,'Corregir datos'),undefined)}finally{seller.dispose()}
});

test('Compras: el producto se busca por nombre, referencia o código y Enter elige la coincidencia exacta o única',async()=>{
 const other={...product,id:'p2',nombre:'Pastillas traseras',referencia:'REP-02',codigo_barras:'7700000000022',precio_compra:4000};
 const h=harness({role:'admin',data:baseData({prods:[clone(product),other]})});
 try{await h.settle();await openPurchase(h);
  assert.equal(nodes(h.tree,n=>n.type==='select'&&nodes(n,c=>c.type==='option'&&/Pastillas/.test(text(c))).length).length,0,'ya no hay una lista desplegable con todo el inventario');
  edit(h,'Buscar producto','pastillas');await h.settle();
  assert.equal(nodes(h.tree,n=>n.type==='button'&&/^Elegir /.test(n.props['aria-label']||'')).length,2);
  field(h,'Buscar producto').props.onKeyDown({key:'Enter',preventDefault(){},currentTarget:{value:'pastillas'}});await h.settle();
  assert.match(text(h.tree),/Hay 2 productos que coinciden/);
  await pickProduct(h,'7700000000022');assert.match(text(h.tree),/Producto: Pastillas traseras/);
  click(h,'Cambiar');await h.settle();edit(h,'Buscar producto','delanteras no');await h.settle();assert.match(text(h.tree),/Ningún producto coincide/);
  edit(h,'Buscar producto','pastillas');await h.settle();click(h,'Elegir Pastillas de freno');await h.settle();
  assert.match(text(h.tree),/Producto: Pastillas de freno/);click(h,'Agregar a la compra');await h.settle();
  assert.match(text(h.tree),/1 × Pastillas de freno/);
 }finally{h.dispose()}
});

test('BE-28: con catálogo grande, inventario y Nueva venta buscan en el servidor por páginas',async()=>{
 const many=Array.from({length:1600},(_,i)=>({...product,id:'p'+i,nombre:'Producto '+String(i).padStart(4,'0'),referencia:'R'+i}));
 const calls=[],original=globalThis.fetch,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 globalThis.fetch=async(url,init)=>{calls.push({url,init});const params=new URL(url,'http://x').searchParams,offset=Number(params.get('offset')),limit=Number(params.get('limit'));
  const rows=params.get('q')==='r7'?[{id:'p7',nombre:'Servidor 7',stock:40}]:many.slice(0,1234).map(p=>({id:p.id,nombre:'Servidor '+p.id,stock:p.stock}));
  return {ok:true,json:async()=>({items:rows.slice(offset,offset+limit),total:rows.length,offset,limit,nextOffset:offset+limit<rows.length?offset+limit:null})}};
 const h=harness({data:baseData({prods:many})});
 try{
  await h.settle();
  const sale=()=>nodes(h.tree,n=>n.type==='input'&&n.props['aria-label']==='Buscar producto para agregar al carrito')[0];
  sale().props.onChange({target:{value:'r7'}});await h.settle();await wait(200);await h.settle();
  assert.ok(calls.some(c=>c.url==='/api/v2/search/products?q=r7&offset=0&limit=8'&&c.init.headers['X-SCORTA-Company']==='company-1'));
  assert.match(text(h.tree),/Producto 0007/,'muestra la copia local del producto encontrado');
  calls.length=0;click(h,'Inventario');await h.settle();await wait(300);await h.settle();
  assert.equal(calls[0].url,'/api/v2/search/products?offset=0&limit=100');
  assert.match(text(h.tree),/1234 de 1600 productos/);assert.match(text(h.tree),/1134 restantes/);
  calls.length=0;click(h,'Mostrar más (1134 restantes)');await h.settle();await wait(50);await h.settle();
  assert.deepEqual(calls.map(c=>c.url),['/api/v2/search/products?offset=100&limit=100'],'solo pide la página que falta');
  assert.match(text(h.tree),/1034 restantes/);
 }finally{h.dispose();globalThis.fetch=original}
});
