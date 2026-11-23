import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createPlatform,platformRequest} from '../platform.mjs';
import {createPlatformHandler} from '../platform-server.mjs';

const clock='2026-11-20T15:00:00.000Z',password='Audit.Only.Fixture.2026';
async function fixture(){
 let state=await createPlatform({owner:{company:'AuditOwner',username:'owner',password}});const tokens={};
 const request=async(actor,method,path,body,options={})=>{const {now=clock,...extra}=options;const r=await platformRequest(state,{method,path,body,token:tokens[actor],...extra},{now,baseUrl:'https://scorta.example'});state=r.state;if(Object.hasOwn(r,'token'))tokens[actor]=r.token;return r};
 const act=(actor,body,options)=>request(actor,'POST','/api/v2/action',{requestId:crypto.randomUUID(),...body},options);
 const login=async(actor,company,username)=>{const r=await request(actor,'POST','/api/v2/login',{company,username,password});assert.equal(r.status,200,r.body.error);return r.body};
 await login('owner','AuditOwner','owner');
 for(const name of ['Empresa A','Empresa B']){const r=await act('owner',{type:'company.create',form:{name,username:'admin',password,startDate:'2026-01-01',endDate:'2030-12-31'}});assert.equal(r.status,200,r.body.error)}
 const [a,b]=state.companies;await login('adminA',a.name,'admin');await login('adminB',b.name,'admin');
 const productResult=await act('adminA',{type:'business.change',payload:{kind:'producto',form:{nombre:'Aceite',precio_compra:400,precio_venta:1000,stock:10}}});assert.equal(productResult.status,200);
 const product=productResult.body.state.prods[0];
 const sale=async()=>{const r=await act('adminA',{type:'sale.create',form:{fecha:'2026-11-19',cliente:'Cliente de prueba',paymentMethod:'efectivo'},items:[{producto_id:product.id,cantidad:1,precio_unitario:1000}],labor:[]});assert.equal(r.status,200,r.body.error);return r.body.state.ventas[0]};
 return {request,act,login,tokens,a,b,product,sale,get state(){return state},set state(value){state=value}};
}
const scoped=expectedCompanyId=>({expectedCompanyId,enforceContext:true});
async function http(handler,{path,method='GET',body,token,context,ip='198.51.100.50',forwarded,raw}={}){
 const headers={host:'scorta.example',origin:'https://scorta.example','content-type':'application/json',...(token?{cookie:'scorta_platform='+token}:{}),...(context!==undefined?{'x-scorta-company':context}:{}),...(forwarded?{'x-forwarded-for':forwarded}:{})};
 const req=Readable.from(method==='POST'?[raw??JSON.stringify(body||{})]:[]);Object.assign(req,{url:path,method,headers,socket:{remoteAddress:ip}});
 let source='';const res={headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v},writeHead(status,h){this.status=status;for(const [k,v]of Object.entries(h||{}))this.headers[k.toLowerCase()]=v},end(value){source+=value||''}};
 await handler(req,res);return {status:res.status,headers:res.headers,body:source?JSON.parse(source):null};
}

test('contexto: una pestaña antigua no puede leer, guardar borrador ni escribir sobre la empresa nueva',async()=>{
 const f=await fixture();
 const first=await f.act('owner',{type:'support.start',companyId:f.a.id,form:{motivo:'Atender A'}},scoped(null));assert.equal(first.status,200,first.body.error);
 const second=await f.act('owner',{type:'support.start',companyId:f.b.id,form:{motivo:'Atender B'}},scoped(f.a.id));assert.equal(second.status,200,second.body.error);
 const baseline=structuredClone(f.state);
 for(const path of ['/api/v2/data','/api/v2/draft','/api/v2/reports','/api/v2/overview','/api/v2/session']){
  const r=await f.request('owner','GET',path,undefined,scoped(f.a.id));assert.equal(r.status,409,path);assert.equal(r.body.code,'COMPANY_CONTEXT_CHANGED');assert.ok(!r.body.state&&!r.body.report);
 }
 let r=await f.request('owner','POST','/api/v2/draft',{version:0,writeId:'old-A',draft:null},scoped(f.a.id));assert.equal(r.status,409);
 r=await f.act('owner',{type:'business.change',revision:first.body.revision,payload:{kind:'producto',form:{nombre:'No debe llegar a B',precio_venta:1000,stock:2}}},scoped(f.a.id));assert.equal(r.status,409);
 assert.deepEqual(f.state,baseline);assert.equal(f.state.businesses[f.b.id].prods.length,0);
 const bootstrap=await f.request('owner','GET','/api/v2/session',undefined,{enforceContext:true});assert.equal(bootstrap.status,200);assert.equal(bootstrap.body.session.companyId,f.b.id);
});

test('contexto: HTTP exige alcance explícito y conserva consulta completa de reportes',async()=>{
 const f=await fixture();await f.sale();const captured=[];
 const handler=createPlatformHandler({production:true,publicUrl:'https://scorta.example',store:{request:async input=>{captured.push(input);return f.request('adminA',input.method,input.path,input.body,{...input,now:clock})}}});
 let r=await http(handler,{path:'/api/v2/data',token:f.tokens.adminA});assert.equal(r.status,428);assert.equal(r.body.code,'CONTEXT_REQUIRED');
 r=await http(handler,{path:'/api/v2/action',method:'POST',token:f.tokens.adminA,body:{type:'mechanic.create',form:{name:'Carlos',percentage:50}}});assert.equal(r.status,428);
 r=await http(handler,{path:'/api/v2/draft',token:f.tokens.adminA,context:f.b.id});assert.equal(r.status,409);
 r=await http(handler,{path:'/api/v2/reports?from=2026-11-19&to=2026-11-19',token:f.tokens.adminA,context:f.a.id});assert.equal(r.status,200,r.body.error);assert.equal(r.body.from,'2026-11-19');assert.equal(r.body.report.totals.net,1000);assert.equal(captured.at(-1).path,'/api/v2/reports?from=2026-11-19&to=2026-11-19');
 r=await http(handler,{path:'/api/v2/overview?from=2026-11-19&to=2026-11-19',token:f.tokens.adminA,context:f.a.id});assert.equal(r.status,200);assert.equal(r.body.from,'2026-11-19');assert.equal(r.body.to,'2026-11-19');
 r=await http(handler,{path:'/api/v2/reports?from=bad',token:f.tokens.adminA,context:f.a.id});assert.equal(r.status,400);
 r=await f.act('adminA',{type:'mechanic.create',expectedCompanyId:f.b.id,form:{name:'No debe crearse',percentage:50}},scoped(f.a.id));assert.equal(r.status,400);assert.equal(r.body.code,'INVALID_CONTEXT');
});

test('contexto: reintentar la misma transición confirmada es seguro, pero no tras cambiar a otra empresa',async()=>{
 const f=await fixture(),start={type:'support.start',requestId:'support-A-once',companyId:f.a.id,form:{motivo:'Respuesta perdida'}};
 let r=await f.act('owner',start,scoped(null));assert.equal(r.status,200,r.body.error);const auditCount=f.state.audit.length;
 r=await f.act('owner',start,scoped(null));assert.equal(r.status,200,r.body.error);assert.equal(r.body.session.companyId,f.a.id);assert.equal(f.state.audit.length,auditCount);
 const end={type:'support.end',requestId:'end-A-once'};r=await f.act('owner',end,scoped(f.a.id));assert.equal(r.status,200);
 r=await f.act('owner',end,scoped(f.a.id));assert.equal(r.status,200,r.body.error);assert.equal(r.body.session.companyId,null);
 await f.act('owner',{type:'support.start',companyId:f.b.id,form:{motivo:'Otra pestaña'}},scoped(null));
 r=await f.act('owner',start,scoped(null));assert.equal(r.status,409);assert.equal(r.body.code,'COMPANY_CONTEXT_CHANGED');
 r=await f.act('owner',end,scoped(f.a.id));assert.equal(r.status,409);
});

test('propietario: colisiones antiguas no imponen contrato cliente y los nuevos slugs se reservan',async()=>{
 const f=await fixture();let r=await f.act('owner',{type:'company.create',form:{name:'AuditOwner!',username:'clientowner',password,startDate:'2026-01-01',endDate:'2030-12-31'}},scoped(null));assert.equal(r.status,200,r.body.error);
 const tenant=f.state.companies.find(c=>c.name==='AuditOwner!');assert.notEqual(tenant.slug,'auditowner');
 tenant.slug='auditowner';tenant.enabled=false;tenant.endDate='2026-11-19';
 r=await f.request('freshOwner','POST','/api/v2/login',{company:'AuditOwner',username:'owner',password});assert.equal(r.status,200,r.body.error);assert.equal(r.body.session.role,'owner');assert.equal(r.body.session.companyId,null);
 r=await f.request('client','POST','/api/v2/login',{company:'AuditOwner!',username:'clientowner',password});assert.equal(r.status,403);assert.equal(r.body.code,'COMPANY_DISABLED');
 f.state.companies.find(c=>c.id===tenant.id).enabled=true;
 r=await f.request('anotherOwner','POST','/api/v2/login',{company:'AuditOwner',username:'owner',password});assert.equal(r.status,200,r.body.error);
 r=await f.request('client','POST','/api/v2/login',{company:'AuditOwner!',username:'clientowner',password});assert.equal(r.status,403);assert.equal(r.body.code,'CONTRACT_EXPIRED');
});

test('recibo público: DTO explícito sin tokens, enlaces internos, IDs privados ni costos; renovar revoca el anterior',async()=>{
 const f=await fixture(),sale=await f.sale();const stored=f.state.businesses[f.a.id].ventas.find(s=>s.id===sale.id);stored.internalSecret='private';stored.detalles[0].costHistory=[{cost:50}];
 let r=await f.request('public','GET','/api/v2/receipt/'+sale.receiptToken,undefined,{token:null});assert.equal(r.status,200);assert.equal(r.body.sale.id,sale.id);assert.equal(r.body.sale.total,1000);assert.equal(r.body.sale.detalles[0].nombre,'Aceite');
 const encoded=JSON.stringify(r.body);for(const key of ['receiptToken','receiptUrl','userId','customerId','producto_id','costo_unitario','costHistory','internalSecret'])assert.ok(!encoded.includes('"'+key+'"'),key);
 const renew=await f.act('adminA',{type:'sale.receipt',id:sale.id},{...scoped(f.a.id),now:'2026-11-26T15:00:00Z'});assert.equal(renew.status,200,renew.body.error);const next=renew.body.state.ventas.find(s=>s.id===sale.id).receiptToken;assert.notEqual(next,sale.receiptToken);
 r=await f.request('public','GET','/api/v2/receipt/'+sale.receiptToken,undefined,{token:null,now:'2026-11-26T15:00:01Z'});assert.equal(r.status,404);
 r=await f.request('public','GET','/api/v2/receipt/'+next,undefined,{token:null,now:'2026-11-28T15:00:00Z'});assert.equal(r.status,200);assert.ok(!JSON.stringify(r.body).includes(next));
 assert.equal(Object.values(f.state.receipts).filter(ref=>ref.companyId===f.a.id&&ref.saleId===sale.id).length,1);
 r=await f.request('public','GET','/api/v2/receipt/'+next,undefined,{token:null,now:'2026-12-04T15:00:00Z'});assert.equal(r.status,404);
});

test('login: presupuesto por origen, límites de cardinalidad y TTL impiden crecimiento anónimo permanente',async()=>{
 const f=await fixture();let limited=0;
 for(let i=0;i<100;i++){const r=await f.request('public','POST','/api/v2/login',{company:'Missing '+i,username:'random',password:'wrong'},{token:null,clientKey:'203.0.113.10'});if(r.status===429)limited++;else assert.equal(r.status,401)}
 assert.ok(limited>=40);assert.ok(Object.keys(f.state.loginFailures).length<=60);
 const until=Date.parse(clock)+900000;for(let i=0;i<2100;i++)f.state.loginFailures['previous-'+i]={count:1,until:until+i};for(let i=0;i<1100;i++)f.state.loginOrigins['origin-'+i]={count:1,until:until+i};
 await f.request('public','POST','/api/v2/login',{company:'Missing next',username:'random',password:'wrong'},{token:null,clientKey:'203.0.113.11'});assert.ok(Object.keys(f.state.loginFailures).length<=2000);assert.ok(Object.keys(f.state.loginOrigins).length<=1000);
 await f.request('public','POST','/api/v2/logout',{}, {token:null,now:'2026-11-21T15:00:00Z'});assert.deepEqual(f.state.loginFailures,{});assert.deepEqual(f.state.loginOrigins,{});
 for(const body of [{company:'x'.repeat(201),username:'u',password:'x'},{company:'Missing',username:'u'.repeat(61),password:'x'},{company:'Missing',username:'u',password:'x'.repeat(201)}]){const r=await f.request('public','POST','/api/v2/login',body,{token:null,clientKey:'203.0.113.12'});assert.equal(r.status,401)}
 assert.deepEqual(f.state.loginFailures,{});
});

test('login HTTP: limita antes de tocar almacenamiento y no confía en X-Forwarded-For ni acepta cuerpos grandes',async()=>{
 let calls=0,time=Date.parse(clock);const handler=createPlatformHandler({production:true,publicUrl:'https://scorta.example',clock:()=>time,store:{request:async()=>{calls++;return {status:401,body:{error:'Incorrecto'}}}}});
 for(let i=0;i<120;i++){const r=await http(handler,{path:'/api/v2/login',method:'POST',body:{company:'random'+i,username:'x',password:'x'},forwarded:'203.0.113.'+i});assert.equal(r.status,401)}
 let r=await http(handler,{path:'/api/v2/login',method:'POST',body:{company:'random',username:'x',password:'x'},forwarded:'192.0.2.250'});assert.equal(r.status,429);assert.equal(calls,120);assert.ok(Number(r.headers['retry-after'])>0);
 time+=60001;r=await http(handler,{path:'/api/v2/login',method:'POST',body:{company:'random',username:'x',password:'x'}});assert.equal(r.status,401);assert.equal(calls,121);
 r=await http(handler,{path:'/api/v2/login',method:'POST',raw:JSON.stringify({company:'x'.repeat(9000)}),ip:'198.51.100.51'});assert.equal(r.status,413);assert.equal(calls,121);
});
