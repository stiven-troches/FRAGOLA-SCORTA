// PUNTO 7: ErrorBoundary. El renderizador de servidor no ejecuta límites de error, así que el
// ciclo de vida (getDerivedStateFromError / componentDidCatch / render) se ejercita directamente;
// el montaje real en el navegador lo cubre browser-checks/error-boundary.spec.mjs.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {compileSSR} from './ssr-build.mjs';
import {CHUNK_RELOAD_KEY} from '../src/chunk-reload.mjs';

let ErrorBoundary,cleanup;
before(async()=>{const compiled=await compileSSR('error-boundary',{ErrorBoundary:'src/ErrorBoundary.jsx'});ErrorBoundary=compiled.module.ErrorBoundary;cleanup=compiled.cleanup});
after(()=>cleanup?.());

const store=()=>{const data={};return {data,getItem:k=>k in data?data[k]:null,setItem:(k,v)=>{data[k]=String(v)}}};
/** Simula el ciclo de React: el hijo lanza -> getDerivedStateFromError -> componentDidCatch -> render. */
function crash(error,{storage=store()}={}){
 const prior={window:globalThis.window,sessionStorage:Object.getOwnPropertyDescriptor(globalThis,'sessionStorage'),error:console.error};
 let reloads=0;const logged=[];
 globalThis.window={location:{reload:()=>reloads++}};
 Object.defineProperty(globalThis,'sessionStorage',{value:storage,configurable:true,writable:true});
 console.error=(...args)=>logged.push(args);
 try{
  const boundary=new ErrorBoundary({children:React.createElement('p',null,'contenido normal')});
  boundary.setState=update=>{boundary.state={...boundary.state,...update}};
  assert.match(renderToStaticMarkup(boundary.render()),/contenido normal/,'sin error muestra a los hijos');
  boundary.state={...boundary.state,...ErrorBoundary.getDerivedStateFromError(error)};
  boundary.componentDidCatch(error,{componentStack:'\n    at Hijo'});
  return {html:renderToStaticMarkup(boundary.render()),get reloads(){return reloads},logged,storage,boundary};
 }finally{
  console.error=prior.error;globalThis.window=prior.window;
  if(prior.sessionStorage)Object.defineProperty(globalThis,'sessionStorage',prior.sessionStorage);else delete globalThis.sessionStorage;
 }
}

test('un hijo que lanza error muestra «Algo falló» y «Recargar», sin detalles técnicos y sin recargar solo',()=>{
 const secret='TypeError: Cannot read properties of undefined (reading "secreto-interno") en /src/Pantalla.jsx:42';
 const {html,reloads,logged}=crash(new TypeError(secret));
 assert.match(html,/Algo falló/);assert.match(html,/>Recargar</);assert.match(html,/role="alert"/);
 assert.doesNotMatch(html,/secreto-interno|TypeError|Pantalla\.jsx|at Hijo|stack/i);
 assert.doesNotMatch(html,/contenido normal/);
 assert.equal(reloads,0,'un error de render no recarga automáticamente');
 assert.ok(logged.length>=1,'el detalle técnico solo va a la consola');
});

test('un error de carga de chunk recarga UNA vez; si vuelve a fallar muestra el mensaje',()=>{
 const storage=store();
 const chunk=()=>new TypeError('Failed to fetch dynamically imported module: https://x.test/assets/AdminTools-9f8e7d.js');
 const first=crash(chunk(),{storage});
 assert.equal(first.reloads,1);assert.ok(storage.data[CHUNK_RELOAD_KEY],'deja la marca');
 assert.match(first.html,/Actualizando/);assert.doesNotMatch(first.html,/AdminTools|dynamically/);
 const second=crash(chunk(),{storage});
 assert.equal(second.reloads,0,'no hay bucle de recargas');
 assert.match(second.html,/Algo falló/);assert.match(second.html,/>Recargar</);assert.doesNotMatch(second.html,/AdminTools|dynamically/);
});

test('el botón Recargar recarga la página',()=>{
 const {boundary}=crash(new Error('boom'));let reloads=0;const prior=globalThis.window;
 globalThis.window={location:{reload:()=>reloads++}};
 try{
  const find=node=>{if(!node||typeof node!=='object')return null;if(node.type==='button')return node;for(const child of [].concat(node.props?.children??[])){const hit=find(child);if(hit)return hit}return null};
  const button=find(boundary.render());
  assert.ok(button,'hay botón');assert.equal(button.props.type,'button');button.props.onClick();assert.equal(reloads,1);
 }finally{globalThis.window=prior}
});

test('el montaje raíz, la demo y las vistas lazy están envueltos en ErrorBoundary y registran la recuperación de chunks',()=>{
 const read=file=>readFileSync(new URL('../src/'+file,import.meta.url),'utf8');
 assert.match(read('main.jsx'),/<ErrorBoundary><Suspense[\s\S]*<\/Suspense><\/ErrorBoundary>/);assert.match(read('main.jsx'),/installChunkErrorRecovery\(\)/);
 assert.match(read('platform-demo-main.jsx'),/<ErrorBoundary><Demo\/><\/ErrorBoundary>/);assert.match(read('platform-demo-main.jsx'),/installChunkErrorRecovery\(\)/);
 const lazy=read('lazy-views.jsx');
 for(const view of ['OwnerWorkspace','AdminTools','OverviewPanel','LegalDocuments'])assert.match(lazy,new RegExp(`export const ${view}=guarded\\(lazy\\(`),view);
 assert.match(lazy,/<ErrorBoundary>/);
});
