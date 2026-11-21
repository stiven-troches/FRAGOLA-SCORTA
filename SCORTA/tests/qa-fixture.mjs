// Shared QA fixture (not a test file): drives the pure engine exactly as the HTTP
// adapter does, with fictitious credentials that exist only in memory.
import assert from 'node:assert/strict';
import {createPlatform,platformRequest} from '../platform.mjs';

export const OWNER_PASSWORD='QaOwnerOnly-2026!';
export const STAFF_PASSWORD='QaStaffOnly-2026!';
export const DAY_D='2026-11-19',DAY_D1='2026-11-20';
// 10:00 in Bogotá (UTC-5) for each day, far from midnight.
export const AT_D='2026-11-19T15:00:00.000Z',AT_D1='2026-11-20T15:00:00.000Z';
export const ok=response=>assert.equal(response.status,200,`HTTP ${response.status}: ${JSON.stringify(response.body)}`);

export async function qaPlatform({now=AT_D}={}){
 let state=await createPlatform({owner:{company:'Fragola',username:'owner',name:'Owner',password:OWNER_PASSWORD}});
 const tokens=new Map();let clock=now;
 const call=async(actor,path='/api/v2/data',body,extra={})=>{
  const result=await platformRequest(state,{method:body===undefined?'GET':'POST',path,body,token:actor?tokens.get(actor):undefined,...extra},{now:extra.now??clock,baseUrl:'https://scorta.example'});
  state=result.state;
  if(actor&&result.token!==undefined){if(result.token)tokens.set(actor,result.token);else tokens.delete(actor)}
  return result;
 };
 const login=async(actor,company,username,password=STAFF_PASSWORD)=>{const r=await call(actor,'/api/v2/login',{company,username,password});ok(r);return r.body};
 const act=async(actor,body)=>{const r=await call(actor,'/api/v2/action',{requestId:crypto.randomUUID(),...body});ok(r);return r.body};
 const data=async actor=>{const r=await call(actor);ok(r);return r.body};
 await login('owner','Fragola','owner',OWNER_PASSWORD);
 // Creates a company with admin + seller, one product, one mechanic, one ticket.
 const shop=async(name,{stock=5,price=34000}={})=>{
  const created=await act('owner',{type:'company.create',form:{name,contact:'QA',email:'qa@example.invalid',whatsapp:'+573001234567',startDate:'2026-11-01',endDate:'2026-12-31',monthlyFee:1000,username:'admin',password:STAFF_PASSWORD,adminName:'Admin '+name}});
  const company=created.companies.find(c=>c.name===name),key=name.replace(/\W+/g,'').toLowerCase();
  await act('owner',{type:'user.create',companyId:company.id,form:{username:'vendedor',name:'Vendedor '+name,role:'vendedor',password:STAFF_PASSWORD}});
  await act('owner',{type:'user.create',companyId:company.id,form:{username:'vendedor2',name:'Vendedor dos '+name,role:'vendedor',password:STAFF_PASSWORD}});
  const admin=key+':admin',seller=key+':seller',seller2=key+':seller2';
  await login(admin,company.slug,'admin');await login(seller,company.slug,'vendedor');await login(seller2,company.slug,'vendedor2');
  let body=await act(admin,{type:'business.change',payload:{kind:'producto',form:{nombre:'Producto '+name,referencia:'REF-'+key,categoria:'QA',stock,stock_minimo:1,precio_compra:20000,precio_venta:price}}});
  const product=body.state.prods[0];
  body=await act(admin,{type:'mechanic.create',form:{name:'Mecánico '+name,percentage:50}});
  const mechanic=body.state.mechanics[0];
  body=await act(admin,{type:'ticket.create',form:{title:'Ticket '+name,description:'Descripción ficticia'}});
  const ticket=body.tickets[0];
  return {company,product,mechanic,ticket,admin,seller,seller2};
 };
 const saleBody=(product,{cantidad=1,paymentMethod='efectivo',precio=product.precio_venta,...extra}={})=>({type:'sale.create',form:{cliente:'Cliente QA',paymentMethod},items:[{producto_id:product.id,cantidad,precio_unitario:precio}],labor:[],...extra});
 return {call,login,act,data,shop,saleBody,setNow(value){clock=value},get state(){return state},set state(value){state=value},tokens};
}
