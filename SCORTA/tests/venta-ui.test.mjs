// Interfaz de Nueva venta (BE-04, FE-06, FE-07, BE-18, BE-19, BE-36): SSR real con Vite y un
// arnés que ejecuta los manejadores reales de ClientWorkspace en Node (sin navegador).
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build,transformWithOxc} from 'vite';
import Papa from 'papaparse';
import {moneyAmount,roundMoney,sumMoney} from '../money.mjs';
import {money} from '../src/format.mjs';
import * as venta from '../sale-pricing.mjs';
import {matchScannedCode,UNSUPPORTED_SCANNER_MESSAGE} from '../src/barcode-scanner.mjs';
import {OFFLINE_SALE_MESSAGE} from '../src/connectivity.mjs';
import {formatDate,formatDateTime} from '../src/format.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
let directory,components,compiled;
before(async()=>{
  mkdirSync(join(root,'test-results'),{recursive:true});directory=mkdtempSync(join(root,'test-results','venta-ui-'));
  const entry=join(directory,'entry.mjs');
  writeFileSync(entry,`export {default as ClientWorkspace} from ${JSON.stringify(join(root,'src/ClientWorkspace.jsx'))};\nexport {default as AdminTools} from ${JSON.stringify(join(root,'src/AdminTools.jsx'))};\n`);
  const result=await build({root,logLevel:'silent',build:{ssr:entry,write:false,minify:false}});
  const chunk=(Array.isArray(result)?result[0]:result).output.find(item=>item.type==='chunk'&&item.isEntry);
  const modulePath=join(directory,'components.mjs');writeFileSync(modulePath,chunk.code);components=await import(pathToFileURL(modulePath).href);
  const source=readFileSync(join(root,'src/ClientWorkspace.jsx'),'utf8');
  compiled=(await transformWithOxc(source,'ClientWorkspace.jsx',{jsx:{runtime:'classic'}})).code.replace(/^import[^\n]*;\n/gm,'').replace(/export default function /g,'function ').replace(/export function /g,'function ')
  // El arnés no expande componentes: el campo de dinero se prueba como un input simple (MoneyInput tiene su propia prueba).
  .replace(/(?<![\w$])MoneyInput(?![\w$])/g,'"input"');
});
after(()=>{if(directory)rmSync(directory,{recursive:true,force:true})});

const company={id:'c1',name:'Moto Nueva'};
const product={id:'p1',nombre:'Pastillas de freno',referencia:'REP-01',categoria:'Frenos',stock:40,stock_minimo:3,precio_venta:10000,precios:{mostrador:10000,mecanico:8000}};
const baseState=(extra={})=>({prods:[structuredClone(product)],ventas:[],compras:[],servs:[],movimientos:[],mechanics:[],customers:[],vehicles:[],customerDirectory:[{id:'k1',nombre:'Taller El Pistón',telefono:'3005550101',tipo:'mecanico',tipoDocumento:'NIT',numeroDocumento:'900123456-1'}],...extra});
const ssr=(Component,props)=>renderToStaticMarkup(React.createElement(Component,props));

test('SSR Nueva venta: espera, pago dividido, atajos Alt+1..5 y búsqueda de ficha; opciones para el administrador',()=>{
  const props=role=>({session:{userId:'u1',username:'ana',name:'Ana',role,companyId:'c1',company},data:{revision:1,company,state:baseState()},onAction:async()=>({}),onRefresh:async()=>({})});
  const seller=ssr(components.ClientWorkspace,props('vendedor'));
  for(const text of ['Poner en espera','Dividir el pago entre varios medios','Alt+4 Nequi','Alt+5 Daviplata','Buscar cliente registrado','Número de documento','Correo del cliente','Nequi (Alt+4)','Daviplata (Alt+5)'])assert.ok(seller.includes(text),text);
  assert.ok(!seller.includes('Lista de precios del cliente'),'el vendedor no asigna listas de precios');
  assert.ok(!seller.includes('Opciones de venta (descuentos e IVA)'));
});

test('SSR administrador: opciones de venta, cierre por cinco medios y reportes con descuentos e IVA',()=>{
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const render=(view,state={})=>ssr(components.AdminTools,{view,data:{state},session:{role:'admin',companyId:'c1',company},onClose(){},onAction:async()=>({})});
  let html=render('settings',{settings:{maxSellerDiscountPct:15}});
  assert.match(html,/TOPE DE DESCUENTO DEL VENDEDOR/);assert.match(html,/value="15"/);assert.match(html,/Cobrar y desglosar IVA/);assert.doesNotMatch(html,/TARIFA GENERAL DE IVA/);
  html=render('settings',{settings:{vat:{enabled:true,defaultRate:5,pricesIncludeVat:false}}});
  assert.match(html,/TARIFA GENERAL DE IVA/);assert.match(html,/Al vender se suma el IVA/);
  const sale={id:'v1',fecha:date,total:30000,paymentMethod:'nequi',payments:[{method:'efectivo',amount:10000},{method:'nequi',amount:20000}],detalles:[{producto_id:'p1',nombre:'A',cantidad:1,precio_lista:33000,descuento:3000,precio_unitario:30000,tarifa_iva:19,costo_unitario:1}],iva:{tarifa_mano_obra:19}};
  html=render('cash',{ventas:[sale]});
  for(const label of ['Efectivo','Transferencia','Tarjeta','Nequi','Daviplata'])assert.ok(html.includes('Recibido por '+label.toLowerCase()),label);
  assert.ok(html.replace(/ /g,' ').includes('Esperado: $ 20.000'));
  html=render('reports',{ventas:[sale]}).replace(/ /g,' ');
  assert.match(html,/DESCUENTOS/);assert.ok(html.includes('$ 3.000'));assert.match(html,/IVA COBRADO/);assert.ok(html.includes('$ 4.789,92'));
});

// ---- Arnés interactivo: ejecuta los manejadores reales del componente. ----
const listeners=new Map();let confirmResult=true;
const prior={window:globalThis.window,document:globalThis.document};
before(()=>{
  const add=(name,handler)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(handler)};
  const remove=(name,handler)=>listeners.get(name)?.delete(handler);
  globalThis.window={addEventListener:add,removeEventListener:remove,confirm:()=>confirmResult};
  globalThis.document={addEventListener:add,removeEventListener:remove,activeElement:{focus(){}},visibilityState:'visible',body:{style:{overflow:''}}};
});
after(()=>{globalThis.window=prior.window;globalThis.document=prior.document});
const fire=(name,event={})=>{for(const listener of [...(listeners.get(name)||[])])listener({preventDefault(){},stopPropagation(){},...event})};
const clone=value=>structuredClone(value);
const baseForm=()=>({cliente:'',telefono:'',placa:'',fecha:'2026-11-20',paymentMethod:'efectivo'});
const draft=(extra={})=>({cart:[{producto_id:'p1',nombre:product.nombre,cantidad:1,precio_unitario:10000}],labor:[],laborDraft:{descripcion:'',mecanico:'',importe:''},saleForm:baseForm(),pendingSale:null,...extra});
const success=action=>({revision:8,draftVersion:3,state:{...baseState(),ventas:[{id:'sale-1',fecha:'2026-11-20',cliente:action.form.cliente,detalles:action.items,labor:[],total:sumMoney(action.items.map(l=>l.cantidad*l.precio_unitario)),payments:action.form.payments}]}});
function harness({role='vendedor',initialDraft=null,onAction=async action=>success(action),state=baseState()}={}){
  let cursor=0,changed=true,tree;const props={session:{userId:'u1',username:'juan',name:'Juan',role,companyId:'c1',company},data:{revision:7,state},onAction,onRefresh:async()=>({})};
  const slots=[],effects=[],drafts=[];
  function useState(initial){const index=cursor++;if(!slots[index])slots[index]={value:typeof initial==='function'?initial():initial};return [slots[index].value,update=>{const next=typeof update==='function'?update(slots[index].value):update;if(!Object.is(next,slots[index].value)){slots[index].value=next;changed=true}}]}
  function useRef(initial){const index=cursor++;if(!slots[index])slots[index]={ref:{current:initial}};return slots[index].ref}
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  function useEffect(callback,deps){const index=cursor++;if(!slots[index]||!same(slots[index].deps,deps))effects.push(()=>{slots[index]?.cleanup?.();slots[index]={deps,cleanup:callback()}})}
  function useMemo(callback,deps){const index=cursor++;if(!slots[index]||!same(slots[index].deps,deps))slots[index]={value:callback(),deps};return slots[index].value}
  class DraftSync{
    constructor(){this.loaded=false;this.disposed=false;this.latest=clone(initialDraft);this.saved=JSON.stringify(this.latest);this.unsaved=false;this.version=1;drafts.push(this)}
    async load(){this.loaded=true;return {draft:clone(initialDraft),version:this.version}}
    update(value){if(!this.disposed){this.latest=clone(value);this.unsaved=JSON.stringify(value)!==this.saved}}
    async flush(){this.saved=JSON.stringify(this.latest);this.unsaved=false;return {version:++this.version}}
    acceptCompleted(){this.latest=null;this.saved='null';this.unsaved=false}
    markConflict(){}
    dispose(){this.disposed=true}
  }
  const mockReact={...React,useId:()=>`field-${cursor++}`};
  const made=new Function('ProductPhotoInput','React','useCallback','useEffect','useMemo','useRef','useState','Papa','SaleDraftSync','draftRequest','OverviewPanel','AdminTools','PurchaseExcel','Receipt','moneyAmount','roundMoney','sumMoney','money','venta','BarcodeScanner','scannerSupport','matchScannedCode','UNSUPPORTED_SCANNER_MESSAGE','useOnline','OFFLINE_SALE_MESSAGE','formatDate','formatDateTime',compiled+';return {ClientWorkspace};')(()=>null,
    mockReact,(callback,deps)=>useMemo(()=>callback,deps),useEffect,useMemo,useRef,useState,Papa,DraftSync,async()=>({version:1,draft:null}),()=>null,()=>null,()=>null,()=>null,moneyAmount,roundMoney,sumMoney,money,venta,()=>null,()=>'none',matchScannedCode,UNSUPPORTED_SCANNER_MESSAGE,()=>true,OFFLINE_SALE_MESSAGE,formatDate,formatDateTime);
  function render(){cursor=0;changed=false;tree=made.ClientWorkspace(props);while(effects.length)effects.shift()();return tree}
  async function settle(){for(let i=0;i<10;i++){await Promise.resolve();if(changed)render();await Promise.resolve()}return tree}
  render();return {get tree(){return tree},get sync(){return drafts.at(-1)},settle,dispose(){for(const slot of slots)slot?.cleanup?.()}};
}
function nodes(rootNode,predicate,result=[]){if(rootNode==null||typeof rootNode==='boolean')return result;if(Array.isArray(rootNode)){rootNode.forEach(item=>nodes(item,predicate,result));return result}if(typeof rootNode!=='object')return result;if(predicate(rootNode))result.push(rootNode);nodes(rootNode.props?.children,predicate,result);return result}
const text=node=>node==null||typeof node==='boolean'?'':Array.isArray(node)?node.map(text).join(''):typeof node==='object'?text(node.props?.children):String(node);
const named=(h,label)=>nodes(h.tree,node=>(node.type==='button'||node.type?.name==='Btn')&&(text(node)===label||node.props['aria-label']===label))[0];
const field=(h,label)=>nodes(h.tree,node=>node.type?.name==='Field'&&node.props.label===label)[0]?.props.children;
const click=(h,label)=>{const node=named(h,label);assert.ok(node,'Control '+label);assert.ok(!node.props.disabled,label+' habilitado');return node.props.onClick?.({currentTarget:{closest:()=>({open:true})},preventDefault(){}})};
const edit=(h,label,value)=>{const node=field(h,label);assert.ok(node,'Campo '+label);return node.props.onChange({target:{value,checked:value}})};
const submit=h=>nodes(h.tree,node=>node.type==='form').at(-1).props.onSubmit({preventDefault(){}});
const alerts=h=>nodes(h.tree,node=>node.props?.role==='alert').map(text).join(' ');

test('UI FE-07: poner en espera abre un carrito nuevo; retomar y descartar sin tocar inventario',async()=>{
  confirmResult=true;const h=harness({initialDraft:draft()});
  try{
    await h.settle();click(h,'Poner en espera');await h.settle();
    assert.equal(h.sync.latest.cart.length,0);assert.equal(h.sync.latest.held.length,1);assert.equal(h.sync.latest.held[0].nombre,'Cliente 1');
    assert.match(text(h.tree),/Ventas en espera · 1/);assert.match(text(h.tree),/No reservan existencias/);
    click(h,'Retomar venta de Cliente 1');await h.settle();
    assert.equal(h.sync.latest.cart.length,1);assert.equal(h.sync.latest.held,undefined);
    edit(h,'Cliente','Ana');await h.settle();click(h,'Poner en espera');await h.settle();
    assert.equal(h.sync.latest.held[0].nombre,'Ana');
    click(h,'Descartar venta de Ana');await h.settle();assert.equal(h.sync.latest,null);
  }finally{h.dispose()}
});

test('UI FE-06: pago dividido con Nequi, efectivo recibido y vueltas; Alt+5 elige Daviplata',async()=>{
  let action=null;const h=harness({initialDraft:draft(),onAction:async value=>{action=clone(value);return success(value)}});
  try{
    await h.settle();fire('keydown',{key:'5',code:'Digit5',altKey:true,target:{}});await h.settle();
    assert.equal(field(h,'Medio de pago').props.value,'daviplata');
    click(h,'Dividir el pago entre varios medios');await h.settle();
    edit(h,'Valor del pago 1','4000');edit(h,'Medio del pago 1','efectivo');await h.settle();
    edit(h,'Medio del pago 2','nequi');edit(h,'Valor del pago 2','5000');await h.settle();
    assert.match(text(h.tree),/Falta asignar/);
    await submit(h);await h.settle();assert.equal(action,null,'no cobra si los pagos no suman el total');assert.match(alerts(h),/Los pagos suman/);
    edit(h,'Valor del pago 2','6000');await h.settle();
    edit(h,'Efectivo recibido','5000');await h.settle();assert.match(text(h.tree),/Vueltas/);
    await submit(h);await h.settle();
    assert.deepEqual(action.form.payments,[{method:'efectivo',amount:4000},{method:'nequi',amount:6000}]);
    assert.equal(action.form.paymentMethod,'nequi');assert.equal(action.form.efectivo_recibido,5000);
  }finally{h.dispose()}
});

test('UI BE-04: el vendedor no supera el tope; dentro del tope envía precio, descuento y neto',async()=>{
  let action=null;const h=harness({initialDraft:draft(),onAction:async value=>{action=clone(value);return success(value)}});
  try{
    await h.settle();assert.equal(field(h,'Precio por unidad de Pastillas de freno'),undefined,'el vendedor no edita el precio');
    edit(h,'Tipo de descuento de Pastillas de freno','porcentaje');edit(h,'Descuento por unidad de Pastillas de freno','20');await h.settle();
    await submit(h);await h.settle();assert.equal(action,null);assert.match(alerts(h),/supera el tope de 10 %/);
    edit(h,'Descuento por unidad de Pastillas de freno','10');await h.settle();
    await submit(h);await h.settle();
    assert.deepEqual(action.items[0],{producto_id:'p1',nombre:'Pastillas de freno',cantidad:1,precio_unitario:9000,precio:10000,descuento:{tipo:'porcentaje',valor:10}});
  }finally{h.dispose()}
});

test('UI BE-04: el administrador cambia el precio y aplica descuento al total',async()=>{
  let action=null;const h=harness({role:'admin',initialDraft:draft({cart:[{producto_id:'p1',nombre:product.nombre,cantidad:2,precio_unitario:10000}]}),onAction:async value=>{action=clone(value);return success(value)}});
  try{
    await h.settle();assert.ok(named(h,'Opciones de venta (descuentos e IVA)'),'acceso a las opciones de venta');
    assert.ok(field(h,'Lista de precios del cliente'),'el administrador asigna la lista de precios');
    edit(h,'Precio por unidad de Pastillas de freno','12000');await h.settle();
    edit(h,'Descuento al total de productos','4000');edit(h,'Tipo de descuento al total','valor');await h.settle();
    assert.match(text(h.tree),/Descuentos/);
    await submit(h);await h.settle();
    assert.deepEqual(action.form.descuento,{tipo:'valor',valor:4000});assert.equal(action.items[0].precio,12000);assert.equal(action.items[0].precio_unitario,10000);
  }finally{h.dispose()}
});

test('UI BE-19/BE-36: buscar la ficha por documento aplica el precio de mecánico y envía customerId',async()=>{
  let action=null;const h=harness({initialDraft:draft(),onAction:async value=>{action=clone(value);return success(value)}});
  try{
    await h.settle();edit(h,'Buscar cliente registrado','900123');await h.settle();
    click(h,'Usar ficha de Taller El Pistón');await h.settle();
    assert.equal(h.sync.latest.cart[0].precio_unitario,8000);assert.match(text(h.tree),/Precio mecánico/);
    edit(h,'El cliente autorizó el tratamiento de sus datos',true);await h.settle();
    await submit(h);await h.settle();
    assert.equal(action.form.customerId,'k1');assert.equal(action.form.numeroDocumento,'900123456-1');assert.equal(action.form.tipoCliente,undefined);
    assert.equal(action.items[0].precio,8000);assert.equal(action.items[0].precio_unitario,8000);
  }finally{h.dispose()}
});
