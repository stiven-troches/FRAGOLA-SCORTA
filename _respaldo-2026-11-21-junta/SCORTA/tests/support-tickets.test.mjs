import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createPlatform,platformRequest} from '../platform.mjs';
import {openPlatformStore} from '../platform-server.mjs';

const password='Support.Fixture.2026';
const clock='2026-11-20T15:00:00.000Z';
const owner={company:'Fragola',username:'owner',password};
async function fixture(){
 let state=await createPlatform({owner}),tokens={};
 const request=async(actor,method,path,body)=>{const r=await platformRequest(state,{method,path,body,token:tokens[actor]},{now:clock});state=r.state;if(Object.hasOwn(r,'token'))tokens[actor]=r.token;return r};
 const get=async actor=>{const r=await request(actor,'GET','/api/v2/data');assert.equal(r.status,200,r.body.error);return r.body};
 const act=(actor,action)=>request(actor,'POST','/api/v2/action',{requestId:crypto.randomUUID(),...action});
 const login=async(actor,company,username)=>{const r=await request(actor,'POST','/api/v2/login',{company,username,password});assert.equal(r.status,200,r.body.error);return r.body};
 await login('owner','Fragola','owner');
 const company=async name=>{const r=await act('owner',{type:'company.create',form:{name,username:'admin',password,startDate:'2026-01-01',endDate:'2030-12-31',nit:'900123456-7',address:'Calle de prueba 123'}});assert.equal(r.status,200,r.body.error);return r.body.companies.find(c=>c.name===name)};
 const a=await company('Moto Uno'),b=await company('Moto Dos');
 for(const username of ['seller1','seller2']){const r=await act('owner',{type:'user.create',companyId:a.id,form:{username,name:username==='seller1'?'Vendedor Uno':'Vendedor Dos',role:'vendedor',password}});assert.equal(r.status,200,r.body.error)}
 await login('adminA',a.name,'admin');await login('adminB',b.name,'admin');await login('seller1',a.name,'seller1');await login('seller2',a.name,'seller2');
 return {request,get,act,login,a,b,tokens,getState:()=>state};
}
async function createTicket(f,actor='seller1'){
 const r=await f.act(actor,{type:'ticket.create',form:{title:'No puedo registrar una venta',description:'Al finalizar aparece un mensaje y necesito ayuda.'}});assert.equal(r.status,200,r.body.error);return r.body.tickets[0];
}

test('tickets privados: vendedor ve los suyos, admin los de su empresa y propietario todas las empresas',async()=>{
 const f=await fixture(),t=await createTicket(f);
 assert.equal(t.creatorName,'Vendedor Uno');assert.equal(t.status,'open');assert.equal(t.companyId,f.a.id);assert.equal(t.unreadCount,0);
 assert.equal((await f.get('seller2')).tickets.length,0);assert.equal((await f.get('adminB')).tickets.length,0);
 assert.equal((await f.get('adminA')).tickets[0].id,t.id);assert.equal((await f.get('owner')).tickets[0].unreadCount,1);
 for(const actor of ['seller2','adminB'])for(const type of ['ticket.reply','ticket.read','ticket.status']){
  const denied=await f.act(actor,{type,id:t.id,form:{message:'Acceso no permitido',status:'resolved'}});assert.equal(denied.status,404);assert.equal(denied.body.code,'TICKET_NOT_FOUND');
 }
 const foreign=await createTicket(f,'adminB');assert.equal((await f.get('owner')).tickets.length,2);assert.equal((await f.get('adminA')).tickets.length,1);assert.equal(foreign.companyId,f.b.id);
 const serialized=JSON.stringify((await f.get('owner')).tickets);for(const secret of [password,'"readers"','"salt"','"digest"'])assert.ok(!serialized.includes(secret));
});

test('lectura y respuesta notifican por usuario sin depender de diferencias entre timestamps',async()=>{
 const f=await fixture(),t=await createTicket(f);
 let r=await f.act('owner',{type:'ticket.read',id:t.id});assert.equal(r.body.tickets[0].unreadCount,0);
 r=await f.act('owner',{type:'ticket.reply',id:t.id,form:{message:'Revisaremos el problema. Por favor indica el producto.'}});assert.equal(r.status,200);assert.equal(r.body.tickets[0].status,'in_progress');assert.equal(r.body.tickets[0].unreadCount,0);
 let ticket=(await f.get('seller1')).tickets[0];assert.equal(ticket.unreadCount,1);assert.equal(ticket.messages[0].role,'owner');assert.equal(ticket.messages[0].name,'owner');
 assert.equal(ticket.createdAt,ticket.messages[0].createdAt,'El reloj está fijado al mismo milisegundo');
 r=await f.act('seller1',{type:'ticket.read',id:t.id});assert.equal(r.body.tickets[0].unreadCount,0);assert.equal((await f.get('adminA')).tickets[0].unreadCount,2,'Leer como vendedor no marca la lectura del admin');
 r=await f.act('seller1',{type:'ticket.reply',id:t.id,form:{message:'El producto es aceite.'}});assert.equal(r.status,200);assert.equal((await f.get('owner')).tickets[0].unreadCount,1);
});

test('estado solo del propietario, historial visible y nueva respuesta reabre un ticket resuelto',async()=>{
 const f=await fixture(),t=await createTicket(f);
 for(const actor of ['seller1','adminA'])assert.equal((await f.act(actor,{type:'ticket.status',id:t.id,form:{status:'resolved'}})).status,403);
 let r=await f.act('owner',{type:'ticket.status',id:t.id,form:{status:'unknown'}});assert.equal(r.status,400);
 r=await f.act('owner',{type:'ticket.status',id:t.id,form:{status:'resolved'}});assert.equal(r.body.tickets[0].status,'resolved');
 const ticket=(await f.get('seller1')).tickets[0];assert.equal(ticket.unreadCount,1);assert.match(ticket.messages[0].message,/Resuelto/);
 r=await f.act('seller1',{type:'ticket.reply',id:t.id,form:{message:'Volvió a ocurrir, adjunto la descripción.'}});assert.equal(r.body.tickets[0].status,'open');
});

test('validación e idempotencia no duplican tickets ni alteran existencias, revisión o borradores',async()=>{
 const f=await fixture();
 const before=structuredClone(f.getState().businesses[f.a.id]);
 for(const form of [{title:' ',description:'Detalle'},{title:'Asunto',description:''},{title:'a'.repeat(161),description:'Detalle'}]){
  const r=await f.act('seller1',{type:'ticket.create',form});assert.equal(r.status,400);
 }
 assert.equal((await f.act('owner',{type:'ticket.create',form:{title:'Asunto',description:'Detalle'}})).status,403);
 const body={type:'ticket.create',requestId:'ticket-same-id',revision:-99,form:{title:'Asunto',description:'Detalle'}};
 let r=await f.act('seller1',body);assert.equal(r.status,200,'La revisión de existencias no bloquea un ticket');const id=r.body.tickets[0].id;
 r=await f.act('seller1',body);assert.equal(r.body.tickets.length,1);assert.equal(r.body.tickets[0].id,id);
 assert.deepEqual(f.getState().businesses[f.a.id],before);assert.equal(f.getState().saleDrafts,undefined);
 const conflict=await f.act('seller1',{...body,form:{title:'Otro',description:'Detalle'}});assert.equal(conflict.status,400);
 const initial=await f.get('owner');assert.ok(initial.audit.some(a=>a.accion==='ticket.create'&&a.documento===id));
 const cloned=structuredClone(initial.tickets);initial.tickets[0].messages.push({message:'Mutación externa'});assert.deepEqual((await f.get('owner')).tickets,cloned);
});

test('suspensión impide solicitudes del cliente y eliminar empresa retira sus tickets',async()=>{
 const f=await fixture(),t=await createTicket(f);
 let r=await f.act('owner',{type:'company.access',companyId:f.a.id,form:{enabled:false}});assert.equal(r.status,200);
 r=await f.act('seller1',{type:'ticket.read',id:t.id});assert.equal(r.status,403);assert.equal(r.body.code,'COMPANY_DISABLED');
 r=await f.act('owner',{type:'ticket.reply',id:t.id,form:{message:'Podemos revisar el reporte durante la suspensión.'}});assert.equal(r.status,200);
 r=await f.act('owner',{type:'company.delete',companyId:f.a.id,form:{confirmation:f.a.name}});assert.equal(r.status,200);assert.equal(r.body.tickets.length,0);assert.equal(f.getState().supportTickets.length,0);
});

test('tickets y lecturas persisten al cerrar y reabrir SQLite; datos fiscales se conservan',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'scorta-tickets-')),file=join(directory,'platform.sqlite');let store;
 try{
  store=await openPlatformStore(file,{owner});
  let r=await store.request({method:'POST',path:'/api/v2/login',body:owner},{now:clock});const ownerToken=r.token;
  r=await store.request({method:'POST',path:'/api/v2/action',token:ownerToken,body:{type:'company.create',form:{name:'Empresa persistente',username:'admin',password,startDate:'2026-01-01',endDate:'2030-12-31',nit:'900123456-7',address:'Calle 123'}}},{now:clock});assert.equal(r.status,200,r.body.error);
  const companyId=r.body.companies[0].id;
  r=await store.request({method:'POST',path:'/api/v2/login',body:{company:'Empresa persistente',username:'admin',password}},{now:clock});const clientToken=r.token;
  r=await store.request({method:'POST',path:'/api/v2/action',token:clientToken,body:{type:'ticket.create',form:{title:'Solicitud persistente',description:'Detalle de una incidencia'}}},{now:clock});assert.equal(r.status,200,r.body.error);const id=r.body.tickets[0].id;
  r=await store.request({method:'POST',path:'/api/v2/action',token:ownerToken,body:{type:'ticket.read',id}},{now:clock});assert.equal(r.body.tickets[0].unreadCount,0);
  store.close();store=await openPlatformStore(file);
  r=await store.request({method:'GET',path:'/api/v2/data',token:ownerToken},{now:clock});assert.equal(r.body.tickets[0].id,id);assert.equal(r.body.tickets[0].unreadCount,0);
  assert.equal(r.body.companies.find(c=>c.id===companyId).nit,'900123456-7');assert.equal(r.body.companies.find(c=>c.id===companyId).address,'Calle 123');
 }finally{store?.close();rmSync(directory,{recursive:true,force:true})}
});
