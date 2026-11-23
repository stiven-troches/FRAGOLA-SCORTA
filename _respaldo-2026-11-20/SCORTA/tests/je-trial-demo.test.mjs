import {test} from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {readFileSync} from 'node:fs';
import {createPlatformDemoSeed,createPlatformDemoStore,DEMO_ACCOUNTS} from '../src/platform-demo.mjs';
import {installJETrial,JE_TRIAL_MIGRATION,JE_TRIAL_PROFILE} from '../src/je-trial-demo.mjs';
import {JE_TRIAL_LOGO} from '../src/je-trial-logo.mjs';
import {platformRequest,companyStatus} from '../platform.mjs';

const now='2026-11-20T15:00:00.000Z';
function trial(state){return state.companies.find(company=>company.name===JE_TRIAL_PROFILE.name)}
async function oldDemo(){
 const state=await createPlatformDemoSeed({now:Date.parse(now)}),je=trial(state);
 state.companies=state.companies.filter(company=>company.id!==je.id);
 state.users=state.users.filter(user=>user.companyId!==je.id);delete state.businesses[je.id];delete state.demoMigrations;
 state.audit=state.audit.filter(entry=>entry.companyId!==je.id);
 return state;
}

test('JE: empresa y administrador preparados, catálogo vacío y 30 días inclusivos en Bogotá',async()=>{
 const state=await createPlatformDemoSeed({now:Date.parse(now)}),company=trial(state),user=state.users.find(user=>user.companyId===company.id);
 assert.equal(state.companies.length,3);assert.equal(company.contact,'Jhoan Monsalve');assert.equal(company.whatsapp,'+573205878749');assert.equal(company.monthlyFee,80000);
 assert.equal(company.startDate,'2026-11-20');assert.equal(company.endDate,'2026-12-19');assert.equal(company.email,'');assert.equal(company.nit??'','');assert.equal(company.address??'','');
 assert.equal(company.logo,JE_TRIAL_LOGO);assert.match(company.logo,/^data:image\/jpeg;base64,/);
 assert.equal(user.username,'joan');assert.equal(user.name,'Jhoan Monsalve');assert.equal(user.role,'admin');assert.equal(user.email,'');assert.equal(user.active,true);
 assert.equal(user.password.algorithm,'PBKDF2-SHA256');assert.equal(user.password.iterations,120000);assert.ok(user.password.salt&&user.password.digest);
 for(const collection of ['prods','ventas','compras','servs','movimientos'])assert.equal(state.businesses[company.id][collection].length,0,collection);
 assert.equal(companyStatus(company,'2026-12-20T04:59:59.999Z'),'active');assert.equal(companyStatus(company,'2026-12-20T05:00:00.000Z'),'expired');
 assert.ok(!Object.values(DEMO_ACCOUNTS).some(account=>account.username==='joan'));
});

test('JE: la migración agrega sin alterar negocios, sesiones, tickets ni borradores existentes',async()=>{
 const previous=await oldDemo();previous.saleDrafts={fixture:{version:5,draft:{fixture:'preservado'}}};previous.supportTickets=[{id:'existing-ticket',messages:[]}];previous.sessions.fixture={userId:previous.users[0].id,expires:9999999999999};
 const snapshot=structuredClone(previous),next=installJETrial(previous,{now});
 assert.deepEqual(previous,snapshot,'El estado de entrada no debe mutar');
 for(const [id,business]of Object.entries(snapshot.businesses))assert.deepEqual(next.businesses[id],business);
 for(const company of snapshot.companies)assert.deepEqual(next.companies.find(item=>item.id===company.id),company);
 for(const user of snapshot.users)assert.deepEqual(next.users.find(item=>item.id===user.id),user);
 for(const key of ['sessions','saleDrafts','supportTickets','payments','requests','receipts'])assert.deepEqual(next[key],snapshot[key],key);
 assert.equal(next.companies.length,snapshot.companies.length+1);assert.equal(next.demoMigrations[JE_TRIAL_MIGRATION].existing,false);
 assert.equal(installJETrial(next,{now:'2027-01-01T00:00:00Z'}),next,'Reabrir no renueva ni reinicia la prueba');
});

test('JE: empresa preexistente conserva contrato, datos y credenciales; una eliminación manual no se revierte',async()=>{
 const state=await createPlatformDemoSeed({now:Date.parse(now)}),company=trial(state),user=state.users.find(item=>item.companyId===company.id);
 delete state.demoMigrations;company.contact='Contacto editado';company.endDate='2027-03-12';company.monthlyFee=91000;user.password=structuredClone(state.users[0].password);
 const savedCompany=structuredClone(company),savedUser=structuredClone(user),migrated=installJETrial(state,{now:'2026-11-23T18:00:00Z'});
 assert.deepEqual(trial(migrated),savedCompany);assert.deepEqual(migrated.users.find(item=>item.id===user.id),savedUser);assert.equal(migrated.demoMigrations[JE_TRIAL_MIGRATION].existing,true);
 migrated.companies=migrated.companies.filter(item=>item.id!==company.id);migrated.users=migrated.users.filter(item=>item.companyId!==company.id);delete migrated.businesses[company.id];
 assert.equal(installJETrial(migrated),migrated);assert.equal(trial(migrated),undefined);
});

test('JE: dos aperturas IndexedDB migran una sola vez y preservan un acceso recordado',async()=>{
 const indexedDBFactory=new IDBFactory(),name='je-migration-'+crypto.randomUUID(),data=new Map(),tokenStorage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
 const initial=await oldDemo(),signed=await platformRequest(initial,{method:'POST',path:'/api/v2/login',body:DEMO_ACCOUNTS.owner},{now});
 // Install a genuine previous-version record, without calling the upgraded store first.
 const db=await new Promise((resolve,reject)=>{const request=indexedDBFactory.open(name,1);request.onupgradeneeded=()=>request.result.createObjectStore('records');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
 await new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').put({storageVersion:4,state:signed.state},'platform');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();
 data.set('scorta:demo-session:'+name,signed.token);
 const stores=await Promise.all([createPlatformDemoStore({indexedDBFactory,name,tokenStorage,lockManager:null}),createPlatformDemoStore({indexedDBFactory,name,tokenStorage,lockManager:null})]);
 try{
  for(const store of stores){const result=await store.request({method:'GET',path:'/api/v2/data'},{now});assert.equal(result.status,200);assert.equal(result.body.session.username,DEMO_ACCOUNTS.owner.username);assert.equal(result.body.companies.filter(company=>company.name===JE_TRIAL_PROFILE.name).length,1);assert.equal(result.body.companies.length,3)}
  const account=await stores[0].request({method:'GET',path:'/api/v2/data'},{now}),company=account.body.companies.find(company=>company.name===JE_TRIAL_PROFILE.name);
  const deleted=await stores[0].request({method:'POST',path:'/api/v2/action',body:{type:'company.delete',companyId:company.id,form:{confirmation:company.name},requestId:'delete-je-trial',revision:account.body.revision}},{now});assert.equal(deleted.status,200,deleted.body.error);
  const reopened=await createPlatformDemoStore({indexedDBFactory,name,tokenStorage,lockManager:null});
  try{const r=await reopened.request({method:'GET',path:'/api/v2/data'},{now});assert.equal(r.status,200);assert.equal(r.body.companies.some(company=>company.name===JE_TRIAL_PROFILE.name),false)}finally{reopened.close()}
 }finally{for(const store of stores)store.close()}
});

test('JE: la credencial indicada inicia sesión solo en su empresa (secreto por entorno, no en GitHub)',{skip:!process.env.SCORTA_JE_TEST_PASSWORD},async()=>{
 const state=await createPlatformDemoSeed({now:Date.parse(now)}),secret=process.env.SCORTA_JE_TEST_PASSWORD;
 const r=await platformRequest(state,{method:'POST',path:'/api/v2/login',body:{company:JE_TRIAL_PROFILE.name,username:JE_TRIAL_PROFILE.username,password:secret}},{now});
 assert.equal(r.status,200,'La credencial privada debe abrir la cuenta preparada');assert.equal(r.body.session.role,'admin');assert.equal(r.body.session.company.name,JE_TRIAL_PROFILE.name);assert.equal(r.body.state.prods.length,0);
 const serialized=JSON.stringify(r.body);assert.equal(serialized.includes(secret),false,'La respuesta no incluye la contraseña');assert.ok(!serialized.includes('"digest"'));
 const expired=await platformRequest(r.state,{method:'GET',path:'/api/v2/data',token:r.token},{now:'2026-12-20T05:00:00.000Z'});assert.equal(expired.status,403);assert.equal(expired.body.code,'CONTRACT_EXPIRED');
 for(const path of ['../src/je-trial-demo.mjs','../src/platform-demo.mjs','../src/platform-demo-main.jsx'])assert.equal(readFileSync(new URL(path,import.meta.url),'utf8').includes(secret),false,'El código del demo no contiene la contraseña del cliente');
});
