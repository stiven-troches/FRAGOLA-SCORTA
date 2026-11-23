import {test} from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createPlatformDemoStore} from '../src/platform-demo.mjs';

function memoryStorage(){const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),entries:()=>[...values.entries()]}}
async function fixture(run){const indexedDBFactory=new IDBFactory(),tokenStorage=memoryStorage(),name='remember-demo-'+crypto.randomUUID();const open=()=>createPlatformDemoStore({indexedDBFactory,tokenStorage,name,lockManager:null});const store=await open();try{await run({store,open,tokenStorage})}finally{store.close()}}
const session=store=>store.request({method:'GET',path:'/api/v2/session'});

test('la demo recuerda solo un token opaco al cerrar y volver a abrir el navegador',()=>fixture(async({store,open,tokenStorage})=>{
 await store.loginAs('vendedor');const items=tokenStorage.entries();assert.equal(items.length,1);assert.match(items[0][1],/^[A-Za-z0-9_-]{43}$/);assert.ok(!/Steven|vendedor|password|Moto Norte/.test(items[0][1]));store.close();const reopened=await open();try{const r=await session(reopened);assert.equal(r.status,200);assert.equal(r.body.session.role,'vendedor');assert.equal(tokenStorage.entries().length,1)}finally{reopened.close()}
}));

test('cerrar sesión y reiniciar demo quitan el acceso recordado',()=>fixture(async({store,open,tokenStorage})=>{
 await store.loginAs('admin');assert.equal(tokenStorage.entries().length,1);await store.request({method:'POST',path:'/api/v2/logout',body:{}});assert.equal(tokenStorage.entries().length,0);const blank=await open();try{assert.equal((await session(blank)).status,401)}finally{blank.close()}
 await store.loginAs('owner');await store.reset();assert.equal(tokenStorage.entries().length,0);const reset=await open();try{assert.equal((await session(reset)).status,401)}finally{reset.close()}
}));

test('una pestaña con sesión vieja no borra el acceso más nuevo guardado en otra',()=>fixture(async({store,open,tokenStorage})=>{
 await store.loginAs('admin');const stale=await open();try{await store.loginAs('vendedor');const current=tokenStorage.entries()[0][1];assert.equal((await session(stale)).status,401);assert.equal(tokenStorage.entries()[0][1],current);const reopened=await open();try{const r=await session(reopened);assert.equal(r.status,200);assert.equal(r.body.session.role,'vendedor')}finally{reopened.close()}}finally{stale.close()}
}));

test('cuando el navegador impide recordar el token, el acceso sigue solo en memoria y se informa',async()=>{
 const indexedDBFactory=new IDBFactory(),name='storage-denied-'+crypto.randomUUID(),warnings=[];
 const tokenStorage={getItem(){throw Error('Denied')},setItem(){throw Error('Denied')},removeItem(){throw Error('Denied')}};
 const store=await createPlatformDemoStore({indexedDBFactory,name,tokenStorage,lockManager:null,onStorageError:message=>warnings.push(message)});
 try{await store.loginAs('admin');assert.equal((await session(store)).status,200);assert.ok(warnings.length>0);store.close();const reopened=await createPlatformDemoStore({indexedDBFactory,name,tokenStorage,lockManager:null});try{assert.equal((await session(reopened)).status,401)}finally{reopened.close()}}finally{store.close()}
});
