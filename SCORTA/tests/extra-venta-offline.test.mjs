// FE-18 y FE-19 en Nueva venta: arnés que ejecuta los manejadores reales de ClientWorkspace
// en Node (mismo enfoque que venta-ui.test.mjs), con conexión y cámara simuladas.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {transformWithOxc} from 'vite';
import Papa from 'papaparse';
import {moneyAmount,roundMoney,sumMoney} from '../money.mjs';
import {money} from '../src/format.mjs';
import * as venta from '../sale-pricing.mjs';
import {matchScannedCode,UNSUPPORTED_SCANNER_MESSAGE} from '../src/barcode-scanner.mjs';
import {OFFLINE_SALE_MESSAGE} from '../src/connectivity.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
let compiled;
const prior={window:globalThis.window,document:globalThis.document};
before(async()=>{
 const source=readFileSync(join(root,'src/ClientWorkspace.jsx'),'utf8');
 compiled=(await transformWithOxc(source,'ClientWorkspace.jsx',{jsx:{runtime:'classic'}})).code.replace(/^import[^\n]*;\n/gm,'').replace(/export default function /g,'function ').replace(/export function /g,'function ')
  // El arnés no expande componentes: el campo de dinero se prueba como un input simple (MoneyInput tiene su propia prueba).
  .replace(/(?<![\w$])MoneyInput(?![\w$])/g,'"input"');
 const noop=()=>{};
 globalThis.window={addEventListener:noop,removeEventListener:noop,confirm:()=>true};
 globalThis.document={addEventListener:noop,removeEventListener:noop,activeElement:{focus(){}},visibilityState:'visible',body:{style:{overflow:''}}};
});
after(()=>{globalThis.window=prior.window;globalThis.document=prior.document});
const clone=value=>structuredClone(value);
const company={id:'c1',name:'Moto Norte'};
const prods=()=>[{id:'p1',nombre:'Pastillas de freno',referencia:'REP-01',codigo_barras:'7701234567890',categoria:'Frenos',stock:2,stock_minimo:1,precio_venta:10000},{id:'p2',nombre:'Bujía',referencia:'BUJ-9',codigo_barras:'',stock:0,stock_minimo:1,precio_venta:8000}];
const baseState=()=>({prods:prods(),ventas:[],compras:[],servs:[],movimientos:[],mechanics:[]});
const draft=()=>({cart:[{producto_id:'p1',nombre:'Pastillas de freno',cantidad:1,precio_unitario:10000}],labor:[],laborDraft:{descripcion:'',mecanico:'',importe:''},saleForm:{cliente:'',telefono:'',placa:'',fecha:'2026-11-20',paymentMethod:'efectivo'},pendingSale:null});

function harness({initialDraft=null,online={value:true},camera='none',onAction=async()=>({revision:8,state:baseState()})}={}){
 let cursor=0,changed=true,tree;const props={session:{userId:'u1',username:'juan',name:'Juan',role:'vendedor',companyId:'c1',company},data:{revision:7,state:baseState()},onAction,onRefresh:async()=>({})};
 const slots=[],effects=[],drafts=[];
 function useState(initial){const index=cursor++;if(!slots[index])slots[index]={value:typeof initial==='function'?initial():initial};return [slots[index].value,update=>{const next=typeof update==='function'?update(slots[index].value):update;if(!Object.is(next,slots[index].value)){slots[index].value=next;changed=true}}]}
 function useRef(initial){const index=cursor++;if(!slots[index])slots[index]={ref:{current:initial}};return slots[index].ref}
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 function useEffect(callback,deps){const index=cursor++;if(!slots[index]||!same(slots[index].deps,deps))effects.push(()=>{slots[index]?.cleanup?.();slots[index]={deps,cleanup:callback()}})}
 function useMemo(callback,deps){const index=cursor++;if(!slots[index]||!same(slots[index].deps,deps))slots[index]={value:callback(),deps};return slots[index].value}
 class DraftSync{
  constructor(){this.loaded=false;this.disposed=false;this.latest=clone(initialDraft);this.saved=JSON.stringify(this.latest);this.unsaved=false;this.version=1;this.onlineCalls=[];drafts.push(this)}
  async load(){this.loaded=true;return {draft:clone(initialDraft),version:this.version}}
  update(value){if(!this.disposed){this.latest=clone(value);this.unsaved=JSON.stringify(value)!==this.saved}}
  setOnline(value){this.onlineCalls.push(value)}
  async flush(){this.saved=JSON.stringify(this.latest);this.unsaved=false;return {version:++this.version}}
  acceptCompleted(){this.latest=null;this.saved='null';this.unsaved=false}
  markConflict(){}
  dispose(){this.disposed=true}
 }
 const Scanner=()=>null;
 const made=new Function('ProductPhotoInput','React','useCallback','useEffect','useMemo','useRef','useState','Papa','SaleDraftSync','draftRequest','OverviewPanel','AdminTools','PurchaseExcel','Receipt','moneyAmount','roundMoney','sumMoney','money','venta','BarcodeScanner','scannerSupport','matchScannedCode','UNSUPPORTED_SCANNER_MESSAGE','useOnline','OFFLINE_SALE_MESSAGE',compiled+';return {ClientWorkspace};')(()=>null,
  {...React,useId:()=>`field-${cursor++}`},(callback,deps)=>useMemo(()=>callback,deps),useEffect,useMemo,useRef,useState,Papa,DraftSync,async()=>({version:1,draft:null}),()=>null,()=>null,()=>null,()=>null,moneyAmount,roundMoney,sumMoney,money,venta,Scanner,()=>camera,matchScannedCode,UNSUPPORTED_SCANNER_MESSAGE,()=>online.value,OFFLINE_SALE_MESSAGE);
 function render(){cursor=0;changed=false;tree=made.ClientWorkspace(props);while(effects.length)effects.shift()();return tree}
 async function settle(){for(let i=0;i<10;i++){await Promise.resolve();if(changed)render();await Promise.resolve()}return tree}
 render();return {get tree(){return tree},get sync(){return drafts.at(-1)},get scanner(){return nodes(tree,node=>node.type===Scanner)[0]?.props},render,settle,dispose(){for(const slot of slots)slot?.cleanup?.()}};
}
function nodes(rootNode,predicate,result=[]){if(rootNode==null||typeof rootNode==='boolean')return result;if(Array.isArray(rootNode)){rootNode.forEach(item=>nodes(item,predicate,result));return result}if(typeof rootNode!=='object')return result;if(predicate(rootNode))result.push(rootNode);nodes(rootNode.props?.children,predicate,result);return result}
const text=node=>node==null||typeof node==='boolean'?'':Array.isArray(node)?node.map(text).join(''):typeof node==='object'?text(node.props?.children):String(node);
const submitButton=h=>nodes(h.tree,node=>node.type==='button'&&node.props.type==='submit'&&/cw-submit/.test(node.props.className||''))[0];
const submit=h=>nodes(h.tree,node=>node.type==='form').at(-1).props.onSubmit({preventDefault(){}});
const cameraButton=h=>nodes(h.tree,node=>node.type==='button'&&node.props['aria-label']==='Leer código de barras con la cámara')[0];

test('FE-18: sin conexión se ve el aviso, el carrito sigue editable y el cobro no se envía',async()=>{
 const online={value:false};let actions=0;
 const h=harness({initialDraft:draft(),online,onAction:async()=>{actions++;return {revision:8,state:baseState()}}});
 try{
  await h.settle();
  assert.match(text(h.tree),/Sin conexión/);assert.match(text(h.tree),/Puedes seguir armando el carrito/);
  assert.deepEqual(h.sync.onlineCalls,[false],'el borrador queda en pausa');
  const button=submitButton(h);assert.ok(button.props.disabled);assert.equal(text(button),'Sin conexión para cobrar');
  await submit(h);await h.settle();
  assert.equal(actions,0,'no se envía el cobro');assert.ok(text(h.tree).includes(OFFLINE_SALE_MESSAGE));
  // Vuelve la conexión: el aviso desaparece, el borrador se reanuda y se puede cobrar.
  online.value=true;h.render();await h.settle();
  assert.doesNotMatch(text(h.tree),/Puedes seguir armando el carrito/);assert.deepEqual(h.sync.onlineCalls,[false,true]);
  assert.equal(submitButton(h).props.disabled,false);
  await submit(h);await h.settle();assert.equal(actions,1);
 }finally{h.dispose()}
});

test('FE-19: el botón de cámara abre el lector y un código leído agrega el producto exacto',async()=>{
 const h=harness({initialDraft:null,camera:'camera'});
 try{
  await h.settle();const button=cameraButton(h);assert.ok(button,'botón de cámara junto al buscador');
  button.props.onClick();await h.settle();
  assert.ok(h.scanner,'se abre el lector');
  const first=h.scanner.onDetected('7701234567890');await h.settle();
  assert.equal(first.ok,true);assert.match(first.message,/Pastillas de freno agregado/);
  assert.deepEqual(h.sync.latest.cart.map(l=>[l.producto_id,l.cantidad]),[['p1',1]]);
  const byReference=h.scanner.onDetected('rep-01');await h.settle();assert.equal(byReference.ok,true);
  assert.equal(h.sync.latest.cart[0].cantidad,2);
  const full=h.scanner.onDetected('7701234567890');assert.equal(full.ok,false);assert.match(full.message,/no quedan existencias/);
  const empty=h.scanner.onDetected('BUJ-9');assert.equal(empty.ok,false);
  const unknown=h.scanner.onDetected('999');assert.equal(unknown.ok,false);assert.match(unknown.message,/«999»/);
  h.scanner.onClose();await h.settle();assert.equal(h.scanner,undefined,'al cerrar se desmonta el lector');
 }finally{h.dispose()}
});

test('FE-19: sin BarcodeDetector el botón explica la limitación y sin cámara no aparece',async()=>{
 const safari=harness({camera:'unsupported'});
 try{await safari.settle();cameraButton(safari).props.onClick();await safari.settle();assert.ok(text(safari.tree).includes(UNSUPPORTED_SCANNER_MESSAGE));assert.equal(safari.scanner,undefined);}finally{safari.dispose()}
 const desktop=harness({camera:'none'});
 try{await desktop.settle();assert.equal(cameraButton(desktop),undefined);}finally{desktop.dispose()}
});

test('Enter en el buscador: exige coincidencia exacta o única y nunca agrega otro producto parecido',async()=>{
 const h=harness({initialDraft:null});
 const search=()=>nodes(h.tree,node=>node.type==='input'&&node.props['aria-label']==='Buscar producto para agregar al carrito')[0];
 const enter=async value=>{search().props.onChange({target:{value}});await h.settle();search().props.onKeyDown({key:'Enter',preventDefault(){}});await h.settle()};
 const cart=()=>(h.sync.latest?.cart||[]).map(l=>[l.producto_id,l.cantidad]);
 try{
  await h.settle();
  // Código exacto agotado: antes agregaba otro producto con existencias; ahora avisa y no toca el carrito.
  await enter('BUJ-9');assert.deepEqual(cart(),[]);assert.match(text(h.tree),/Bujía: no quedan existencias/);assert.equal(search().props.value,'BUJ-9','el texto queda para corregirlo');
  // Código inexistente: aviso claro.
  await enter('000999');assert.deepEqual(cart(),[]);assert.match(text(h.tree),/«000999»/);
  // Código de barras exacto: agrega y limpia el buscador.
  await enter('7701234567890');assert.deepEqual(cart(),[['p1',1]]);assert.equal(search().props.value,'');assert.doesNotMatch(text(h.tree),/«000999»/);
  // Texto con una sola coincidencia: la agrega.
  await enter('pastillas');assert.deepEqual(cart(),[['p1',2]]);
  // Sin existencias restantes en el carrito: avisa.
  await enter('pastillas');assert.deepEqual(cart(),[['p1',2]]);assert.match(text(h.tree),/no quedan existencias/);
 }finally{h.dispose()}
});
