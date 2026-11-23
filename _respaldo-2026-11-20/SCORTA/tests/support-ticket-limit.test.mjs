import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPlatform,platformRequest} from '../platform.mjs';

async function fixture(){
 const secret='Aa1!'+crypto.randomUUID(),owner={company:'Auditoría',username:'owner',password:secret};let state=await createPlatform({owner}),ownerToken,clientToken;
 const request=async(who,method,path,body)=>{const r=await platformRequest(state,{method,path,body,token:who==='owner'?ownerToken:clientToken},{now:'2026-11-20T15:00:00Z'});state=r.state;return r};
 let r=await request('owner','POST','/api/v2/login',owner);ownerToken=r.token;
 r=await request('owner','POST','/api/v2/action',{type:'company.create',form:{name:'Empresa tickets',username:'admin',password:secret,startDate:'2026-01-01',endDate:'2030-12-31'}});assert.equal(r.status,200);
 r=await request('client','POST','/api/v2/login',{company:'Empresa tickets',username:'admin',password:secret});clientToken=r.token;
 r=await request('client','POST','/api/v2/action',{type:'ticket.create',form:{title:'Historial completo',description:'Incidencia de prueba'}});assert.equal(r.status,200);const id=r.body.tickets[0].id,ticket=state.supportTickets[0];
 ticket.messages=Array.from({length:500},(_,index)=>({id:'message-'+index,userId:ticket.createdBy,name:'Cliente de prueba',role:'admin',message:'Entrada de prueba '+index,createdAt:'2026-11-20T15:00:00Z'}));
 ticket.readers[ticket.createdBy]=501;
 return {id,request,get state(){return state}};
}

test('un ticket con 500 entradas puede resolverse sin perder historia y notifica a su creador',async()=>{
 const f=await fixture(),history=structuredClone(f.state.supportTickets[0].messages);
 let r=await f.request('owner','POST','/api/v2/action',{type:'ticket.status',id:f.id,requestId:'final-resolution',form:{status:'resolved'}});assert.equal(r.status,200,r.body.error);assert.equal(r.body.tickets[0].status,'resolved');assert.equal(r.body.tickets[0].messages.length,501);assert.deepEqual(r.body.tickets[0].messages.slice(0,500),history);assert.match(r.body.tickets[0].messages[500].message,/Resuelto/);assert.equal(r.body.tickets[0].unreadCount,0);
 r=await f.request('client','GET','/api/v2/data');assert.equal(r.body.tickets[0].unreadCount,1);
 r=await f.request('client','POST','/api/v2/action',{type:'ticket.read',id:f.id});assert.equal(r.body.tickets[0].unreadCount,0);
 r=await f.request('owner','POST','/api/v2/action',{type:'ticket.status',id:f.id,requestId:'final-resolution',form:{status:'resolved'}});assert.equal(r.status,200);assert.equal(r.body.tickets[0].messages.length,501);
});

test('la reserva de cierre no permite respuestas ni crecimiento por cambios de estado ilimitados',async()=>{
 const f=await fixture();let r;
 for(const who of ['owner','client']){r=await f.request(who,'POST','/api/v2/action',{type:'ticket.reply',id:f.id,form:{message:'Mensaje adicional'}});assert.equal(r.status,400);assert.equal(f.state.supportTickets[0].messages.length,500)}
 r=await f.request('client','POST','/api/v2/action',{type:'ticket.status',id:f.id,form:{status:'resolved'}});assert.equal(r.status,403);
 r=await f.request('owner','POST','/api/v2/action',{type:'ticket.status',id:f.id,form:{status:'in_progress'}});assert.equal(r.status,400);assert.equal(f.state.supportTickets[0].status,'open');
 r=await f.request('owner','POST','/api/v2/action',{type:'ticket.status',id:f.id,form:{status:'resolved'}});assert.equal(r.status,200);
 const snapshot=structuredClone(f.state.supportTickets[0]);
 for(let i=0;i<5;i++){
  r=await f.request('owner','POST','/api/v2/action',{type:'ticket.status',id:f.id,form:{status:'open'}});assert.equal(r.status,400);
  r=await f.request('owner','POST','/api/v2/action',{type:'ticket.status',id:f.id,form:{status:'resolved'}});assert.equal(r.status,200);assert.equal(r.body.tickets[0].messages.length,501);
 }
 assert.deepEqual(f.state.supportTickets[0],snapshot);
});
