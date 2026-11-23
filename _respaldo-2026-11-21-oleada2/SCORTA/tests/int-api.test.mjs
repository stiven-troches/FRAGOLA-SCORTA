import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPlatform,platformRequest,TERMS_VERSION} from '../platform.mjs';
import {openPlatformStore,createPlatformHandler} from '../platform-server.mjs';
import {totpCode,totpCounter} from '../totp.mjs';

const password='Integracion.Fixture.2026';

// Real HTTP adapter (platform-server.mjs) over a temporary SQLite store, production-like options.
async function httpFixture(t,{requireTerms=true,requireDataConsent=true}={}){
  const dir=mkdtempSync(join(tmpdir(),'scorta-int-api-'));
  const store=await openPlatformStore(join(dir,'platform.sqlite'),{owner:{company:'Fragola',username:'owner',password}});
  let origin='';
  const handler=createPlatformHandler({store,requireTerms,requireDataConsent});
  const server=createServer(async(req,res)=>{if(!await handler(req,res)){res.statusCode=404;res.end('{}')}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  origin='http://127.0.0.1:'+server.address().port;
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));store.close();rmSync(dir,{recursive:true,force:true})});
  const jars={},contexts={};
  const call=async(actor,method,path,body)=>{
    const headers={...(jars[actor]?{cookie:jars[actor]}:{}),...(body?{'Content-Type':'application/json',Origin:origin}:{}),...(Object.hasOwn(contexts,actor)?{'X-SCORTA-Company':contexts[actor]??'@owner'}:{})};
    const response=await fetch(origin+path,{method,headers,body:body?JSON.stringify(body):undefined});
    const cookie=response.headers.get('set-cookie');if(cookie)jars[actor]=cookie.split(';')[0];
    const json=await response.json();
    if(json?.session)contexts[actor]=json.session.companyId??null;
    return {status:response.status,body:json,headers:response.headers};
  };
  const login=(actor,company,username,extra={})=>call(actor,'POST','/api/v2/login',{company,username,password,...extra});
  const act=(actor,action)=>call(actor,'POST','/api/v2/action',{requestId:crypto.randomUUID(),...action});
  return {call,login,act,store,get origin(){return origin}};
}
async function companyWithUsers(f){
  assert.equal((await f.login('owner','Fragola','owner')).status,200);
  let r=await f.act('owner',{type:'company.create',form:{name:'Taller Integra',username:'admin',password,startDate:'2026-01-01',endDate:'2030-12-31',monthlyFee:90000}});
  assert.equal(r.status,200,r.body.error);const company=r.body.companies.find(c=>c.name==='Taller Integra');
  r=await f.act('owner',{type:'user.create',companyId:company.id,form:{username:'seller',role:'vendedor',password}});assert.equal(r.status,200,r.body.error);
  assert.equal((await f.login('admin','Taller Integra','admin')).status,200);
  assert.equal((await f.login('seller','Taller Integra','seller')).status,200);
  return company;
}

test('INT-01: login con 2FA de punta a punta con platformRequest y un TOTP calculado con totp.mjs',async()=>{
  let state=await createPlatform({owner:{company:'Fragola',username:'owner',password}}),now=Date.parse('2026-11-21T15:00:00Z'),token;
  const send=async(path,body,extra={})=>{const r=await platformRequest(state,{method:'POST',path,body,token:extra.token??token,clientKey:'198.51.100.7'},{now});state=r.state;if(Object.hasOwn(r,'token')&&!extra.keep)token=r.token;return r};
  assert.equal((await send('/api/v2/login',{company:'Fragola',username:'owner',password})).status,200);
  let r=await send('/api/v2/action',{type:'twofa.setup',requestId:'s1'});const {secret,uri}=r.body.twoFactorSetup;assert.match(uri,/^otpauth:\/\/totp\/SCORTA:/);
  r=await send('/api/v2/action',{type:'twofa.enable',requestId:'s2',form:{code:await totpCode(secret,totpCounter(now))}});assert.equal(r.status,200,r.body.error);assert.equal(r.body.session.twoFactorEnabled,true);
  now+=90000;
  r=await send('/api/v2/login',{company:'Fragola',username:'owner',password},{token:null,keep:true});assert.equal(r.status,401);assert.equal(r.body.code,'TOTP_REQUIRED');assert.ok(!r.token);
  r=await send('/api/v2/login',{company:'Fragola',username:'owner',password,totp:'000000'},{token:null,keep:true});assert.equal(r.body.code,'TOTP_INVALID');
  r=await send('/api/v2/login',{company:'Fragola',username:'owner',password,totp:await totpCode(secret,totpCounter(now))},{token:null});assert.equal(r.status,200,r.body.error);assert.ok(r.token);assert.equal(r.body.session.role,'owner');
});

test('INT-01b: el adaptador HTTP entrega el cuerpo completo del login (incluido totp) a platformRequest',async t=>{
  const seen=[];const store={request:async(payload,options)=>{seen.push({payload,options});return {status:401,body:{error:'x',code:'TOTP_REQUIRED'}}}};
  const handler=createPlatformHandler({store,requireTerms:true,requireDataConsent:true});
  const server=createServer(async(req,res)=>{await handler(req,res)});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port;
  const response=await fetch(base+'/api/v2/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({company:'Fragola',username:'owner',password:'x',totp:'123456'})});
  assert.equal(response.status,401);assert.equal((await response.json()).code,'TOTP_REQUIRED');
  assert.deepEqual(seen[0].payload.body,{company:'Fragola',username:'owner',password:'x',totp:'123456'});
  assert.equal(seen[0].options.requireTerms,true);assert.equal(seen[0].options.requireDataConsent,true);
});

test('INT-02/03: términos bloquean la empresa hasta que el admin acepta; soporte del propietario no queda bloqueado',async t=>{
  const f=await httpFixture(t);const company=await companyWithUsers(f);
  let r=await f.call('admin','GET','/api/v2/session');assert.equal(r.body.session.termsAccepted,false);assert.equal(r.body.session.termsVersion,TERMS_VERSION);
  r=await f.act('admin',{type:'business.change',payload:{kind:'producto',form:{nombre:'Aceite',stock:10,precio_compra:1000,precio_venta:5000}},revision:r.body.revision});assert.equal(r.status,403);assert.equal(r.body.code,'TERMS_REQUIRED');
  r=await f.act('seller',{type:'terms.accept',form:{version:TERMS_VERSION}});assert.equal(r.status,403,'el vendedor no acepta en nombre de la empresa');
  // The owner in support is never blocked by the pending terms.
  r=await f.act('owner',{type:'support.start',companyId:company.id,form:{motivo:'Carga inicial del inventario'}});assert.equal(r.status,200,r.body.error);assert.equal(r.body.session.termsAccepted,true);
  r=await f.act('owner',{type:'business.change',payload:{kind:'producto',form:{nombre:'Aceite',stock:10,precio_compra:1000,precio_venta:5000}},revision:r.body.revision});assert.equal(r.status,200,r.body.error);
  // INT-05: company users see the active support banner data.
  r=await f.call('admin','GET','/api/v2/data');assert.equal(r.body.session.supportActive,true);assert.equal(r.body.session.supportReason,'Carga inicial del inventario');assert.ok(Date.parse(r.body.session.supportStartedAt));
  assert.equal((await f.act('owner',{type:'support.end'})).status,200);
  r=await f.act('admin',{type:'terms.accept',form:{version:TERMS_VERSION}});assert.equal(r.status,200,r.body.error);assert.equal(r.body.session.termsAccepted,true);
  r=await f.call('seller','GET','/api/v2/session');assert.equal(r.body.session.termsAccepted,true);assert.equal(r.body.session.supportActive,false);
});

test('INT-04: cambio de contraseña obligatorio tras restablecer; solo sesión, datos, contraseña y salida',async t=>{
  const f=await httpFixture(t);const company=await companyWithUsers(f);
  const seller=(await f.call('owner','GET','/api/v2/data')).body.users.find(u=>u.username==='seller');
  let r=await f.act('owner',{type:'user.reset',companyId:company.id,userId:seller.id,form:{password:'Temporal.Clave.2026'}});assert.equal(r.status,200,r.body.error);
  r=await f.call('seller2','POST','/api/v2/login',{company:'Taller Integra',username:'seller',password:'Temporal.Clave.2026'});assert.equal(r.status,200);assert.equal(r.body.session.mustChangePassword,true);
  r=await f.act('seller2',{type:'ticket.create',form:{subject:'x',message:'y'}});assert.equal(r.status,403);assert.equal(r.body.code,'PASSWORD_CHANGE_REQUIRED');
  assert.equal((await f.call('seller2','GET','/api/v2/data')).status,200);
  r=await f.call('seller2','POST','/api/v2/password',{currentPassword:'Temporal.Clave.2026',newPassword:'Nueva.Clave.Segura.2026'});assert.equal(r.status,200,r.body.error);
  r=await f.call('seller3','POST','/api/v2/login',{company:'Taller Integra',username:'seller',password:'Nueva.Clave.Segura.2026'});assert.equal(r.status,200);assert.equal(r.body.session.mustChangePassword,false);
});

test('INT-06/07: consentimiento obligatorio, receiptLink de una vez, renovación y revocación del enlace',async t=>{
  const f=await httpFixture(t);await companyWithUsers(f);
  let r=await f.act('admin',{type:'terms.accept',form:{}});assert.equal(r.status,200);
  r=await f.act('admin',{type:'business.change',revision:r.body.revision,payload:{kind:'producto',form:{nombre:'Bujía',stock:10,precio_compra:1000,precio_venta:8000}}});assert.equal(r.status,200,r.body.error);
  const product=r.body.state.prods[0],items=[{producto_id:product.id,cantidad:1,precio_unitario:8000}];
  r=await f.act('seller',{type:'sale.create',form:{cliente:'Ana',telefono:'3001234567',paymentMethod:'efectivo'},items,labor:[]});assert.equal(r.status,400);assert.equal(r.body.code,'DATA_CONSENT_REQUIRED');
  r=await f.act('seller',{type:'sale.create',form:{cliente:'Ana',telefono:'3001234567',placa:'ABC12D',paymentMethod:'efectivo',dataConsent:true,consentMedium:'escrito'},items,labor:[]});assert.equal(r.status,200,r.body.error);
  const link=r.body.receiptLink,sale=r.body.state.ventas.find(s=>s.id===link.saleId);
  assert.ok(link.url.startsWith(f.origin+'/receipt/'));assert.equal(sale.receiptUrl,link.url);assert.equal(sale.dataConsent.consentMedium,'escrito');
  r=await f.call('seller','GET','/api/v2/data');assert.ok(!r.body.state.ventas.some(s=>s.receiptUrl),'la URL no se vuelve a entregar');
  r=await f.call('public','GET','/api/v2/receipt/'+link.token);assert.equal(r.status,200);assert.equal(r.body.sale.telefono,'******4567');
  r=await f.act('seller',{type:'sale.receipt',id:sale.id});assert.equal(r.status,200);const renewed=r.body.receiptLink;assert.notEqual(renewed.token,link.token);
  assert.equal((await f.call('public','GET','/api/v2/receipt/'+link.token)).status,404,'el enlace anterior deja de funcionar');
  r=await f.act('admin',{type:'sale.receipt.revoke',id:sale.id});assert.equal(r.status,200);assert.equal((await f.call('public','GET','/api/v2/receipt/'+renewed.token)).status,404);
  // The same customer already authorized: a later sale with only the phone still needs the checkbox in the UI, the server accepts the stored consent.
  r=await f.act('seller',{type:'sale.create',form:{cliente:'Ana',telefono:'3001234567',paymentMethod:'efectivo'},items,labor:[]});assert.equal(r.status,200,r.body.error);
});

test('INT-08: panel del propietario — métricas, uso, eventos, revocar sesiones, exportar y borrado con exportación previa',async t=>{
  const f=await httpFixture(t,{requireTerms:false});const company=await companyWithUsers(f);
  for(let i=0;i<5;i++)await f.login('bad'+i,'Taller Integra','admin',{password:'Mala.Clave.0000'});
  let r=await f.call('owner','GET','/api/v2/data');
  assert.deepEqual(Object.keys(r.body.metrics).sort(),['active','churn30d','disabled','expired','mrr','scheduled','trial']);assert.equal(r.body.metrics.active,1);assert.equal(r.body.metrics.mrr,90000);
  const usage=r.body.companies.find(c=>c.id===company.id).usage;assert.equal(usage.sales7d,0);assert.ok(Date.parse(usage.lastLoginAt));assert.equal(usage.lastSaleAt,null);
  assert.ok(r.body.securityEvents.some(e=>e.tipo==='login_failures'));
  r=await f.act('owner',{type:'sessions.revoke',companyId:company.id});assert.equal(r.status,200);assert.equal(r.body.revoked,2);
  assert.equal((await f.call('admin','GET','/api/v2/session')).status,401);
  r=await f.act('owner',{type:'company.purge',companyId:company.id,form:{confirmation:'Taller Integra'}});assert.equal(r.status,409);assert.equal(r.body.code,'EXPORT_REQUIRED');
  r=await f.act('owner',{type:'company.export',companyId:company.id});assert.equal(r.status,200);assert.equal(r.body.export.company.name,'Taller Integra');assert.ok(!JSON.stringify(r.body.export).includes('"digest"'));
  r=await f.act('owner',{type:'company.purge',companyId:company.id,form:{confirmation:'Otro nombre'}});assert.equal(r.status,400);
  r=await f.act('owner',{type:'company.purge',companyId:company.id,form:{confirmation:'Taller Integra'}});assert.equal(r.status,200,r.body.error);assert.ok(!r.body.companies.some(c=>c.id===company.id));
  r=await f.act('owner',{type:'sessions.revoke',scope:'all'});assert.equal(r.status,200);assert.equal((await f.call('owner','GET','/api/v2/session')).status,200,'la sesión propia sobrevive');
});

test('INT-09: el admin corrige y borra datos de un cliente y exporta todo por GET /api/v2/export',async t=>{
  const f=await httpFixture(t,{requireTerms:false});await companyWithUsers(f);
  let r=await f.act('admin',{type:'business.change',revision:(await f.call('admin','GET','/api/v2/data')).body.revision,payload:{kind:'producto',form:{nombre:'Filtro',stock:5,precio_compra:1000,precio_venta:3000}}});
  assert.equal(r.status,200,r.body.error);const product=r.body.state.prods[0];
  r=await f.act('admin',{type:'sale.create',form:{cliente:'Luis',telefono:'3110000000',placa:'XYZ98A',paymentMethod:'efectivo',dataConsent:true},items:[{producto_id:product.id,cantidad:1,precio_unitario:3000}],labor:[]});assert.equal(r.status,200,r.body.error);
  const record=r.body.state.customerRecords[0];
  r=await f.act('seller',{type:'customer.update',id:record.id,form:{nombre:'Luis Pérez'}});assert.equal(r.status,403);
  r=await f.act('admin',{type:'customer.update',id:record.id,form:{nombre:'Luis Pérez',telefono:'3110000001'}});assert.equal(r.status,200,r.body.error);
  assert.equal(r.body.state.ventas[0].cliente,'Luis Pérez');assert.equal(r.body.state.customers[0].telefono,'3110000001');
  r=await f.call('admin','GET','/api/v2/export');assert.equal(r.status,200);assert.equal(r.body.format,'scorta-company-export');assert.equal(r.body.company.name,'Taller Integra');assert.ok(!JSON.stringify(r.body).includes('receiptHash'));
  assert.equal((await f.call('seller','GET','/api/v2/export')).status,403);
  r=await f.act('admin',{type:'customer.erase',id:record.id});assert.equal(r.status,200,r.body.error);
  const sale=r.body.state.ventas[0];assert.equal(sale.cliente,'Cliente eliminado');assert.equal(sale.telefono,'');assert.equal(sale.placa,'');
  assert.ok(r.body.state.customerRecords.find(c=>c.id===record.id).erasedAt);
  assert.equal((await f.act('admin',{type:'customer.erase',id:record.id})).status,404);
});
