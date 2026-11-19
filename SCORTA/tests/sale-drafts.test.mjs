import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPlatformDemoSeed,DEMO_ACCOUNTS} from '../src/platform-demo.mjs';
import {platformRequest} from '../platform.mjs';
import {openPlatformStore} from '../platform-server.mjs';
import {SaleDraftSync} from '../src/sale-draft-client.mjs';
import {IDBFactory} from 'fake-indexeddb';
import {createPlatformDemoStore} from '../src/platform-demo.mjs';

async function fixture(){
 let state=await createPlatformDemoSeed(),token;
 const request=async(method,path,body)=>{const r=await platformRequest(state,{method,path,body,token});state=r.state;if(r.token)token=r.token;return r};
 const login=async role=>{const r=await request('POST','/api/v2/login',DEMO_ACCOUNTS[role]);assert.equal(r.status,200);return r.body};
 const data=await login('vendedor'),p=data.state.prods.find(p=>p.stock>3);
 const draft={cart:[{producto_id:p.id,nombre:p.nombre,cantidad:1,precio_unitario:p.precio_venta}],labor:[],laborDraft:{descripcion:'',mecanico:'',importe:''},saleForm:{cliente:'Prueba de recuperación',telefono:'',placa:'',fecha:new Date().toLocaleDateString('en-CA',{timeZone:'America/Bogota'}),paymentMethod:'efectivo'},pendingSale:null};
 return {request,login,draft,p,getState:()=>state};
}
const save=(request,version,draft,writeId=crypto.randomUUID())=>request('POST','/api/v2/draft',{version,draft,writeId});

test('borrador se recupera tras volver a entrar y es privado por usuario y empresa',async()=>{
 const {request,login,draft,getState}=await fixture();
 const revision=getState().revision;
 let r=await save(request,0,draft);assert.equal(r.status,200);assert.equal(r.body.version,1);
 assert.equal(getState().revision,revision,'Guardar no altera la revisión de inventario');
 await login('admin');r=await request('GET','/api/v2/draft');assert.equal(r.body.draft,null);
 r=await request('GET','/api/v2/data');assert.ok(!JSON.stringify(r.body).includes('Prueba de recuperación'));
 await login('owner');r=await request('GET','/api/v2/draft');assert.equal(r.status,403);
 await login('vendedor');r=await request('GET','/api/v2/draft');assert.deepEqual(r.body.draft,draft);
});

test('borrador rechaza sobrescritura de otra pestaña y conserva reintentos del guardado',async()=>{
 const {request,draft}=await fixture();
 const writeId=crypto.randomUUID();const a=await save(request,0,draft,writeId);assert.equal(a.status,200);
 const retry=await save(request,0,draft,writeId);assert.deepEqual(retry.body,a.body);
 const conflict=await save(request,0,{...draft,labor:[]});assert.equal(conflict.status,409);assert.equal(conflict.body.code,'DRAFT_CONFLICT');
 const cleared=await save(request,1,null);assert.equal(cleared.status,200);assert.equal(cleared.body.version,2);
 assert.equal((await save(request,1,draft)).status,409,'Una pestaña vieja no resucita el carrito vaciado');
});

test('venta y borrador se confirman atómicamente; el reintento tras recargar no duplica el cobro',async()=>{
 const {request,draft,p}=await fixture(),requestId=crypto.randomUUID();
 const action={type:'sale.create',requestId,draftRequestId:requestId,form:draft.saleForm,items:draft.cart,labor:[]};
 draft.pendingSale=action;assert.equal((await save(request,0,draft)).status,200);
 const before=(await request('GET','/api/v2/data')).body;
 let r=await request('POST','/api/v2/action',{...action,revision:before.revision});assert.equal(r.status,200,r.body.error);
 const count=r.body.state.ventas.length;assert.equal(r.body.state.prods.find(x=>x.id===p.id).stock,p.stock-1);
 const saved=await request('GET','/api/v2/draft');assert.equal(saved.body.draft,null);assert.ok(saved.body.saleId);assert.equal(saved.body.version,r.body.draftVersion);
 r=await request('POST','/api/v2/action',{...action,revision:before.revision});assert.equal(r.status,200);assert.equal(r.body.state.ventas.length,count);
 assert.equal((await save(request,1,draft)).status,409);
});

test('venta rechazada conserva productos y borrador; vaciarlo impide cobrar una copia vieja',async()=>{
 const {request,draft,p}=await fixture(),requestId=crypto.randomUUID();
 draft.cart[0].cantidad=p.stock+1;
 const action={type:'sale.create',requestId,draftRequestId:requestId,form:draft.saleForm,items:draft.cart,labor:[]};draft.pendingSale=action;
 assert.equal((await save(request,0,draft)).status,200);
 const before=(await request('GET','/api/v2/data')).body;
 let r=await request('POST','/api/v2/action',{...action,revision:before.revision});assert.equal(r.status,400);
 assert.ok((await request('GET','/api/v2/draft')).body.draft);
 assert.equal((await request('GET','/api/v2/data')).body.state.prods.find(x=>x.id===p.id).stock,p.stock);
 await save(request,1,null);r=await request('POST','/api/v2/action',action);assert.equal(r.status,409);assert.equal(r.body.code,'DRAFT_CONFLICT');
});

test('SQLite conserva el borrador tras reiniciar el servidor',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'scorta-draft-')),file=join(dir,'platform.sqlite');let store;
 try{
  store=await openPlatformStore(file,{owner:{company:'Fragola',username:'owner',password:'Contraseña.Prueba.2026'}});
  const login=await store.request({method:'POST',path:'/api/v2/login',body:{company:'Fragola',username:'owner',password:'Contraseña.Prueba.2026'}}),token=login.token;
  let r=await store.request({method:'POST',path:'/api/v2/action',token,body:{type:'company.create',form:{name:'Moto Test',username:'admin',password:'Contraseña.Prueba.2026',startDate:'2026-01-01',endDate:'2030-12-31'}}});assert.equal(r.status,200,r.body.error);
  const customer=await store.request({method:'POST',path:'/api/v2/login',body:{company:'Moto Test',username:'admin',password:'Contraseña.Prueba.2026'}});
  const draft={cart:[],labor:[],laborDraft:{descripcion:'Cambio de frenos',mecanico:'Ana',importe:'35000'},saleForm:{cliente:'Cliente',telefono:'',placa:'ABC12D',fecha:'2026-11-19',paymentMethod:'efectivo'},pendingSale:null};
  r=await store.request({method:'POST',path:'/api/v2/draft',token:customer.token,body:{version:0,draft,writeId:'save-1'}});assert.equal(r.status,200,r.body.error);
  store.close();store=await openPlatformStore(file);
  r=await store.request({method:'GET',path:'/api/v2/draft',token:customer.token});assert.deepEqual(r.body.draft,draft);
 }finally{store?.close();rmSync(dir,{recursive:true,force:true})}
});

test('sincronizador serializa ediciones durante un guardado y reutiliza el ID tras respuesta perdida',async()=>{
 let version=0,stored=null,lost=true;const ids=[],statuses=[];
 const sync=new SaleDraftSync({onStatus:s=>statuses.push(s.status),request:async(method,body)=>{
  if(!method)return {version,draft:stored};ids.push(body.writeId);
  if(stored?.value!==body.draft?.value){assert.equal(body.version,version);stored=body.draft;version++}
  if(lost){lost=false;throw Error('Respuesta perdida')}
  return {version,draft:stored};
 }});
 await sync.load();sync.update({value:1});await assert.rejects(sync.flush());assert.ok(sync.unsaved);
 sync.update({value:2});await sync.flush();assert.equal(ids[0],ids[1]);assert.equal(stored.value,2);assert.equal(sync.unsaved,false);assert.equal(statuses.at(-1),'saved');sync.dispose();
});

test('sincronizador bloquea guardado tras conflicto sin sobrescribir la copia remota',async()=>{
 let writes=0;const sync=new SaleDraftSync({request:async(method)=>{if(!method)return {version:0,draft:null};writes++;throw Object.assign(Error('Otro equipo cambió el borrador'),{code:'DRAFT_CONFLICT'})}});
 await sync.load();sync.update({value:1});await assert.rejects(sync.flush());sync.update({value:2});await assert.rejects(sync.flush());assert.equal(writes,1);sync.dispose();
});

test('demo recupera productos, servicio sin agregar y cliente desde IndexedDB al reabrir',async()=>{
 const indexedDBFactory=new IDBFactory(),name='draft-'+crypto.randomUUID(),options={indexedDBFactory,name,lockManager:null};let store;
 try{
  store=await createPlatformDemoStore(options);await store.loginAs('vendedor');
  const {draft}=await fixture();draft.cart=[];draft.laborDraft={descripcion:'Cambio de frenos',mecanico:'Ana',importe:'45000'};
  let r=await store.request({method:'POST',path:'/api/v2/draft',body:{version:0,draft,writeId:'browser-draft'}});assert.equal(r.status,200);
  store.close();store=await createPlatformDemoStore(options);await store.loginAs('vendedor');
  r=await store.request({method:'GET',path:'/api/v2/draft'});assert.deepEqual(r.body.draft,draft);
 }finally{store?.close()}
});

test('ediciones que llegan durante el guardado se serializan y no se pierden',async()=>{
 let release,announce;const gate=new Promise(r=>{release=r}),started=new Promise(r=>{announce=r});const writes=[];
 const sync=new SaleDraftSync({request:async(method,body)=>{if(!method)return {version:0,draft:null};writes.push(body);if(writes.length===1){announce();await gate}return {version:writes.length,draft:body.draft}}});
 await sync.load();sync.update({value:1});const saving=sync.flush();await started;sync.update({value:2});release();await saving;
 assert.deepEqual(writes.map(x=>x.draft.value),[1,2]);assert.deepEqual(writes.map(x=>x.version),[0,1]);assert.equal(sync.unsaved,false);sync.dispose();
});
