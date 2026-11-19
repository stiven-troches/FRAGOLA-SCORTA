import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPlatform,platformRequest} from '../platform.mjs';
const password='HardeningOwnerFixture12345';
async function fixture(){let state=await createPlatform({owner:{company:'Fragola',username:'Steven',password}}),token;const call=async(type,extra={})=>{const result=await platformRequest(state,{method:'POST',path:'/api/v2/action',token,body:{type,...extra}},{now:'2026-11-19T15:00:00Z',baseUrl:'https://scorta.example'});state=result.state;return result;};const signed=await platformRequest(state,{method:'POST',path:'/api/v2/login',body:{company:'Fragola',username:'Steven',password}},{now:'2026-11-19T15:00:00Z'});state=signed.state;token=signed.token;return {call,get state(){return state}};}
async function company(f,name){const result=await f.call('company.create',{form:{name,startDate:'2026-01-01',endDate:'2030-12-31',monthlyFee:100,username:'administrador',password:'HardeningClientFixture12345'}});assert.equal(result.status,200);return result.body.companies.find(c=>c.name===name);}

test('reutilizar un requestId en otra empresa durante soporte se rechaza y no informa éxito falso',async()=>{
 const f=await fixture(),a=await company(f,'Moto A'),b=await company(f,'Moto B');
 await f.call('support.start',{companyId:a.id,form:{motivo:'Solicitud de cliente A'}});
 const operation={requestId:'operacion-compartida',payload:{kind:'producto',form:{nombre:'Casco de soporte',precio_venta:100,stock:1}}};
 const first=await f.call('business.change',operation);assert.equal(first.status,200);
 await f.call('support.end');await f.call('support.start',{companyId:b.id,form:{motivo:'Solicitud de cliente B'}});
 const before=structuredClone(f.state),reused=await f.call('business.change',operation);
 assert.equal(reused.status,400);assert.match(reused.body.error,/identificador/);assert.deepEqual(f.state,before);assert.equal(f.state.businesses[b.id].prods.length,0);
});

test('el cambio de estado del taller conserva antes, después y motivo del soporte',async()=>{
 const f=await fixture(),c=await company(f,'Moto Auditoría');await f.call('support.start',{companyId:c.id,form:{motivo:'Entrega solicitada por cliente'}});
 const sale=await f.call('sale.create',{form:{fecha:'2026-11-19',placa:'ABC12D',paymentMethod:'efectivo'},items:[],labor:[{descripcion:'Revisión de frenos',mecanico:'Carlos',importe:30000}]});assert.equal(sale.status,200);
 const service=sale.body.state.servs[0];
 const changed=await f.call('business.change',{payload:{kind:'estado',id:service.id,form:{}}});assert.equal(changed.status,200);
 const audit=changed.body.state.auditoria[0];assert.equal(audit.antes.estado,'completado');assert.equal(audit.despues.estado,'entregado');assert.equal(audit.supportReason,'Entrega solicitada por cliente');assert.match(audit.usuario,/Steven · Soporte/);
});

test('las imágenes disfrazadas y mayores al límite no dejan una empresa parcialmente actualizada',async()=>{
 const f=await fixture(),c=await company(f,'Moto Imágenes'),before=structuredClone(f.state);
 const spoof='data:image/png;base64,'+btoa('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
 const result=await f.call('company.update',{companyId:c.id,form:{logo:spoof}});assert.equal(result.status,400);assert.deepEqual(f.state,before);
 const bytes=new Uint8Array(512001);bytes.set([137,80,78,71,13,10,26,10]);const chunks=[];for(let offset=0;offset<bytes.length;offset+=10000)chunks.push(String.fromCharCode(...bytes.slice(offset,offset+10000)));
 const big='data:image/png;base64,'+btoa(chunks.join(''));const oversized=await f.call('company.update',{companyId:c.id,form:{logo:big}});assert.equal(oversized.status,400);assert.deepEqual(f.state,before);
});
