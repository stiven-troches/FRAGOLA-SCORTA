import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPlatform,platformRequest,TERMS_VERSION,MAX_COMPANY_PHOTOS} from '../platform.mjs';
import {totpCode,totpCounter} from '../totp.mjs';

const password='Nucleo.Fixture.2026',start=Date.parse('2026-11-20T15:00:00.000Z');
async function fixture(options={}){
  let state=await createPlatform({owner:{company:'Fragola',username:'owner',password}}),tokens={},clock=start,active={};
  const request=async(actor,method,path,body,extra={})=>{const r=await platformRequest(state,{method,path,body,token:tokens[actor],clientKey:extra.clientKey||'10.0.0.1',...(extra.request||{})},{now:clock,...active,...(extra.options||{})});state=r.state;if(Object.hasOwn(r,'token'))tokens[actor]=r.token;return r};
  const act=(actor,action,extra)=>request(actor,'POST','/api/v2/action',{requestId:crypto.randomUUID(),...action},extra);
  const login=(actor,company,username,more={},extra)=>request(actor,'POST','/api/v2/login',{company,username,password,...more},extra);
  assert.equal((await login('owner','Fragola','owner')).status,200);
  const createCompany=async name=>{const r=await act('owner',{type:'company.create',form:{name,username:'admin',password,startDate:'2026-01-01',endDate:'2030-12-31',monthlyFee:100000}});assert.equal(r.status,200,r.body.error);return r.body.companies.find(c=>c.name===name)};
  const company=await createCompany('Taller Uno'),other=await createCompany('Taller Dos');
  assert.equal((await act('owner',{type:'user.create',companyId:company.id,form:{username:'seller',role:'vendedor',password}})).status,200);
  for(const [actor,c,u] of [['admin',company,'admin'],['other',other,'admin'],['seller',company,'seller']])assert.equal((await login(actor,c.name,u)).status,200);
  const created=await act('admin',{type:'business.change',payload:{kind:'producto',form:{nombre:'Aceite',stock:50,precio_compra:4000,precio_venta:10000}}});assert.equal(created.status,200,created.body.error);
  const product=created.body.state.prods[0];
  const sell=(actor='admin',form={},items=[{producto_id:product.id,cantidad:1,precio_unitario:10000}])=>act(actor,{type:'sale.create',form:{cliente:'Cliente',paymentMethod:'efectivo',...form},items,labor:[]});
  active=options;
  return {request,act,login,company,other,product,sell,get state(){return state},set state(v){state=v},tick:ms=>{clock+=ms},get now(){return clock}};
}

test('SEG-01: 2FA TOTP del propietario (setup, enable, login, replay, disable) sin filtrar el secreto',async()=>{
  const f=await fixture();
  let r=await f.act('admin',{type:'twofa.setup'});assert.equal(r.status,403);
  r=await f.act('owner',{type:'twofa.setup'});assert.equal(r.status,200,r.body.error);
  const {secret,uri}=r.body.twoFactorSetup;assert.match(uri,/^otpauth:\/\/totp\//);assert.ok(uri.includes(secret));assert.equal(r.body.session.twoFactorEnabled,false);
  r=await f.act('owner',{type:'twofa.enable',form:{code:'000000'}});assert.equal(r.body.code,'TOTP_INVALID');
  r=await f.act('owner',{type:'twofa.enable',form:{code:await totpCode(secret,totpCounter(f.now))}});assert.equal(r.status,200,r.body.error);assert.equal(r.body.session.twoFactorEnabled,true);
  assert.ok(!JSON.stringify(r.body).includes(secret));
  f.tick(60000);
  r=await f.login('o2','Fragola','owner');assert.equal(r.status,401);assert.equal(r.body.code,'TOTP_REQUIRED');assert.ok(!r.token);
  r=await f.login('o2','Fragola','owner',{totp:'123456'});assert.equal(r.status,401);
  const code=await totpCode(secret,totpCounter(f.now-30000));// ventana -1
  r=await f.login('o2','Fragola','owner',{totp:code});assert.equal(r.status,200,r.body.error);assert.equal(r.body.session.twoFactorEnabled,true);
  r=await f.login('o3','Fragola','owner',{totp:code});assert.equal(r.status,401,'un código no puede reutilizarse');
  r=await f.act('owner',{type:'twofa.disable',form:{password:'mala',code:await totpCode(secret,totpCounter(f.now))}});assert.equal(r.status,400);
  r=await f.act('owner',{type:'twofa.disable',form:{password,code:await totpCode(secret,totpCounter(f.now))}});assert.equal(r.status,200,r.body.error);assert.equal(r.body.session.twoFactorEnabled,false);
  r=await f.login('o4','Fragola','owner');assert.equal(r.status,200);
});

test('SEG-03: comprobante sin token en claro, teléfono enmascarado, receiptLink y revocación',async()=>{
  const f=await fixture();
  let r=await f.sell('seller',{telefono:'+57 300 123 4567',dataConsent:true});assert.equal(r.status,200,r.body.error);
  const link=r.body.receiptLink,sale=r.body.state.ventas[0];assert.equal(link.saleId,sale.id);assert.equal(sale.receiptUrl,link.url);assert.ok(link.url.endsWith('/receipt/'+link.token));
  const stored=f.state.businesses[f.company.id].ventas.find(s=>s.id===sale.id);assert.ok(!('receiptToken' in stored)&&!('receiptUrl' in stored));assert.ok(stored.receiptHash);
  assert.ok(!JSON.stringify(f.state).includes(link.token));
  const data=await f.request('seller','GET','/api/v2/data');assert.ok(!JSON.stringify(data.body).includes(link.token));assert.ok(!JSON.stringify(data.body).includes('receiptHash'));
  r=await f.request(null,'GET','/api/v2/receipt/'+link.token);assert.equal(r.status,200);assert.equal(r.body.sale.telefono,'+********4567');
  r=await f.act('other',{type:'sale.receipt.revoke',id:sale.id});assert.equal(r.status,404,'otra empresa no ve la venta');
  r=await f.act('admin',{type:'sale.receipt.revoke',id:sale.id});assert.equal(r.status,200,r.body.error);assert.ok(!r.body.receiptLink);
  r=await f.request(null,'GET','/api/v2/receipt/'+link.token);assert.equal(r.status,404);
  r=await f.act('seller',{type:'sale.receipt',id:sale.id});assert.equal(r.status,200);assert.notEqual(r.body.receiptLink.token,link.token);
  r=await f.request(null,'GET','/api/v2/receipt/'+r.body.receiptLink.token);assert.equal(r.status,200);
});

test('SEG-03: migración elimina tokens heredados guardados en claro',async()=>{
  const f=await fixture();const r=await f.sell();const sale=f.state.businesses[f.company.id].ventas[0];
  const legacy=structuredClone(f.state);delete legacy.receiptSecretsDropped;Object.assign(legacy.businesses[f.company.id].ventas[0],{receiptToken:'SECRETO',receiptUrl:'https://x/receipt/SECRETO'});f.state=legacy;
  let d=await f.request('admin','GET','/api/v2/data');assert.ok(!JSON.stringify(d.body).includes('SECRETO'));
  await f.login('admin2','Taller Uno','admin');assert.ok(!JSON.stringify(f.state).includes('SECRETO'));assert.equal(r.status,200);assert.ok(sale);
});

test('SEG-06 y BE-33: usuario inexistente responde igual y 5 fallos generan un evento de seguridad',async()=>{
  const f=await fixture();
  for(let i=0;i<5;i++){const r=await f.request('x','POST','/api/v2/login',{company:'Taller Uno',username:'admin',password:'incorrecta'+i},{clientKey:'ip'+i});assert.equal(r.status,401);}
  const r=await f.request('x','POST','/api/v2/login',{company:'Taller Uno',username:'fantasma',password:'x'});assert.equal(r.status,401);assert.equal(r.body.code,'INVALID_CREDENTIALS');
  const owner=await f.request('owner','GET','/api/v2/data');const events=owner.body.securityEvents.filter(e=>e.tipo==='login_failures');
  assert.equal(events.length,1);assert.equal(events[0].companyId,f.company.id);assert.ok(!JSON.stringify(owner.body.securityEvents).includes('incorrecta'));
  let n=await f.login('o2','Fragola','owner',{},{clientKey:'203.0.113.9'});assert.equal(n.status,200);
  n=await f.act('owner',{type:'support.start',companyId:f.company.id,form:{motivo:'Revisión'}});
  assert.equal(n.status,200,n.body.error);const types=f.state.securityEvents.map(e=>e.tipo);assert.ok(types.includes('owner_new_origin'));assert.ok(types.includes('support_start'));
  const admin=await f.request('admin','GET','/api/v2/data');assert.ok(!('securityEvents' in admin.body));
});

test('SEG-07: cambio de contraseña limitado a 5 fallos en 15 minutos',async()=>{
  const f=await fixture();
  for(let i=0;i<5;i++){const r=await f.request('admin','POST','/api/v2/password',{currentPassword:'mala',newPassword:'Otra.Clave.2026x'});assert.equal(r.status,400);}
  let r=await f.request('admin','POST','/api/v2/password',{currentPassword:password,newPassword:'Otra.Clave.2026x'});assert.equal(r.status,429);assert.equal(r.body.code,'RATE_LIMITED');
  f.tick(15*60000+1);r=await f.request('admin','POST','/api/v2/password',{currentPassword:password,newPassword:'Otra.Clave.2026x'});assert.equal(r.status,200,r.body.error);
});

test('SEG-08: tras user.reset solo se permite sesión, cambio de contraseña y logout',async()=>{
  const f=await fixture();const data=await f.request('owner','GET','/api/v2/data');const seller=data.body.users.find(u=>u.username==='seller');
  let r=await f.act('owner',{type:'user.reset',userId:seller.id,form:{password:'Temporal.Clave.2026'}});assert.equal(r.status,200,r.body.error);
  r=await f.request('s','POST','/api/v2/login',{company:'Taller Uno',username:'seller',password:'Temporal.Clave.2026'});assert.equal(r.status,200);assert.equal(r.body.session.mustChangePassword,true);
  r=await f.sell('s');assert.equal(r.status,403);assert.equal(r.body.code,'PASSWORD_CHANGE_REQUIRED');
  r=await f.request('s','GET','/api/v2/draft');assert.equal(r.body.code,'PASSWORD_CHANGE_REQUIRED');
  r=await f.request('s','GET','/api/v2/session');assert.equal(r.status,200);
  r=await f.request('s','POST','/api/v2/password',{currentPassword:'Temporal.Clave.2026',newPassword:'Definitiva.Clave.2026'});assert.equal(r.status,200,r.body.error);
  r=await f.request('s','POST','/api/v2/login',{company:'Taller Uno',username:'seller',password:'Definitiva.Clave.2026'});assert.equal(r.body.session.mustChangePassword,false);
  r=await f.sell('s');assert.equal(r.status,200,r.body.error);
});

test('SEG-09: los usuarios de la empresa ven el soporte activo con motivo y hora, otras empresas no',async()=>{
  const f=await fixture();
  let r=await f.request('seller','GET','/api/v2/session');assert.equal(r.body.session.supportActive,false);
  await f.act('owner',{type:'support.start',companyId:f.company.id,form:{motivo:'Ajuste solicitado'}});
  r=await f.request('seller','GET','/api/v2/session');assert.equal(r.body.session.supportActive,true);assert.equal(r.body.session.supportReason,'Ajuste solicitado');assert.ok(r.body.session.supportStartedAt);
  r=await f.request('other','GET','/api/v2/session');assert.equal(r.body.session.supportActive,false);
  f.tick(2*60*60000+1);r=await f.request('seller','GET','/api/v2/session');assert.equal(r.body.session.supportActive,false);
});

test('BE-05: consentimiento de datos exigido con requireDataConsent y registrado en el cliente',async()=>{
  const f=await fixture({requireDataConsent:true});
  let r=await f.sell('seller',{telefono:'3001112233'});assert.equal(r.status,400);assert.equal(r.body.code,'DATA_CONSENT_REQUIRED');
  r=await f.sell('seller',{placa:'ABC12D'});assert.equal(r.body.code,'DATA_CONSENT_REQUIRED');
  r=await f.sell('seller');assert.equal(r.status,200,'sin datos personales no se exige');
  r=await f.sell('seller',{telefono:'3001112233',dataConsent:true,consentMedium:'escrito'});assert.equal(r.status,200,r.body.error);
  const record=f.state.businesses[f.company.id].customerRecords.find(c=>c.telefono==='3001112233');assert.equal(record.consentMedium,'escrito');assert.equal(record.consentBy,'seller');assert.ok(record.consentAt);
  r=await f.sell('seller',{telefono:'3001112233'});assert.equal(r.status,200,'consentimiento previo');
});

test('BE-06: tope de fotos por empresa',async()=>{
  const f=await fixture();const png='data:image/png;base64,'+btoa(String.fromCharCode(137,80,78,71,13,10,26,10,0,0));
  const b=f.state.businesses[f.company.id];for(let i=0;i<MAX_COMPANY_PHOTOS;i++)b.prods.push({id:'p'+i,nombre:'Foto '+i,categoria:'General',precio_compra:1,precio_venta:2,stock:0,stock_minimo:0,foto:png});
  let r=await f.act('admin',{type:'business.change',payload:{kind:'producto',form:{nombre:'Una más',precio_venta:10,foto:png}}});assert.equal(r.status,400);assert.equal(r.body.code,'PHOTO_LIMIT');assert.match(r.body.error,/límite de fotos/);
  r=await f.act('admin',{type:'business.change',payload:{kind:'producto',form:{nombre:'Sin foto',precio_venta:10}}});assert.equal(r.status,200,r.body.error);
  r=await f.act('other',{type:'business.change',payload:{kind:'producto',form:{nombre:'Otra empresa',precio_venta:10,foto:png}}});assert.equal(r.status,200,'el tope es por empresa');
});

test('BE-07: términos con requireTerms bloquean escrituras hasta que el admin acepta',async()=>{
  const f=await fixture({requireTerms:true});
  let r=await f.request('seller','GET','/api/v2/session');assert.equal(r.body.session.termsAccepted,false);assert.equal(r.body.session.termsVersion,TERMS_VERSION);
  r=await f.sell('seller');assert.equal(r.status,403);assert.equal(r.body.code,'TERMS_REQUIRED');
  r=await f.act('seller',{type:'terms.accept'});assert.equal(r.status,403);assert.equal(r.body.code,'FORBIDDEN');
  r=await f.act('admin',{type:'terms.accept',form:{version:TERMS_VERSION}});assert.equal(r.status,200,r.body.error);assert.equal(r.body.session.termsAccepted,true);
  r=await f.sell('seller');assert.equal(r.status,200,r.body.error);
  r=await f.act('other',{type:'business.change',payload:{kind:'producto',form:{nombre:'X',precio_venta:1}}});assert.equal(r.body.code,'TERMS_REQUIRED','la aceptación es por empresa');
  r=await f.act('owner',{type:'company.access',companyId:f.other.id,form:{enabled:true}});assert.equal(r.status,200,'el propietario no queda bloqueado');
});

test('BE-08 y BE-09: exportación sin secretos, corrección, borrado de cliente y purga certificada',async()=>{
  const f=await fixture();
  let r=await f.sell('admin',{cliente:'Ana Pérez',telefono:'3009998877',placa:'XYZ98A',dataConsent:true});assert.equal(r.status,200,r.body.error);
  const customer=f.state.businesses[f.company.id].customerRecords[0];
  r=await f.request('admin','GET','/api/v2/export');assert.equal(r.status,200,r.body.error);
  const text=JSON.stringify(r.body);for(const key of ['"digest"','"salt"','"password"','"totp"','receiptHash','"sessions"'])assert.ok(!text.includes(key),key);
  assert.ok(!text.includes('Taller Dos'));assert.equal(r.body.business.ventas.length,1);
  assert.equal((await f.request('seller','GET','/api/v2/export')).status,403);
  r=await f.act('seller',{type:'customer.update',id:customer.id,form:{nombre:'X'}});assert.equal(r.status,403);
  r=await f.act('other',{type:'customer.erase',id:customer.id});assert.equal(r.status,404);
  r=await f.act('admin',{type:'customer.update',id:customer.id,form:{nombre:'Ana María Pérez',telefono:'3009998800'}});assert.equal(r.status,200,r.body.error);assert.equal(r.body.state.ventas[0].cliente,'Ana María Pérez');
  r=await f.act('admin',{type:'customer.erase',id:customer.id});assert.equal(r.status,200,r.body.error);
  const sale=r.body.state.ventas[0];assert.equal(sale.cliente,'Cliente eliminado');assert.equal(sale.telefono,'');assert.equal(sale.placa,'');
  const business=JSON.stringify(f.state.businesses[f.company.id]);for(const value of ['Ana','3009998','XYZ98A'])assert.ok(!business.includes(value),value);
  assert.ok(f.state.audit.some(a=>a.accion==='customer.erase'));
  r=await f.act('owner',{type:'company.purge',companyId:f.company.id,form:{confirmation:'Taller Uno'}});assert.equal(r.body.code,'EXPORT_REQUIRED');
  r=await f.act('owner',{type:'company.export',companyId:f.company.id});assert.equal(r.status,200);assert.equal(r.body.export.company.id,f.company.id);
  r=await f.act('owner',{type:'company.purge',companyId:f.company.id,form:{confirmation:'Taller Uno'}});assert.equal(r.status,200,r.body.error);
  assert.ok(!f.state.businesses[f.company.id]);const cert=f.state.audit.find(a=>a.accion==='company.purge').certificado;assert.equal(cert.conteos.ventas,1);assert.equal(cert.borradoPor,'owner');
  assert.ok(f.state.businesses[f.other.id]);
});

test('BE-12: revocar sesiones por empresa o todas, sin cerrar la propia',async()=>{
  const f=await fixture();
  let r=await f.act('admin',{type:'sessions.revoke',scope:'all'});assert.equal(r.status,403);
  r=await f.act('owner',{type:'sessions.revoke',companyId:f.company.id});assert.equal(r.status,200,r.body.error);assert.equal(r.body.revoked,2);
  assert.equal((await f.request('admin','GET','/api/v2/session')).status,401);assert.equal((await f.request('other','GET','/api/v2/session')).status,200);
  r=await f.act('owner',{type:'sessions.revoke',scope:'all'});assert.equal(r.status,200);assert.equal((await f.request('other','GET','/api/v2/session')).status,401);
  assert.equal((await f.request('owner','GET','/api/v2/session')).status,200);assert.ok(f.state.audit.some(a=>a.accion==='sessions.revoke'&&a.revocadas===1));
});

test('BE-13: con enforceContext, ajuste/producto/company.update exigen revision',async()=>{
  const f=await fixture(),scoped={request:{enforceContext:true,expectedCompanyId:f.company.id}};
  let r=await f.act('admin',{type:'business.change',payload:{kind:'ajuste',id:f.product.id,form:{stock:3,motivo:'Conteo'}}},scoped);assert.equal(r.status,428);assert.equal(r.body.code,'REVISION_REQUIRED');
  const revision=(await f.request('admin','GET','/api/v2/session')).body.revision;
  r=await f.act('admin',{type:'business.change',revision,payload:{kind:'ajuste',id:f.product.id,form:{stock:3,motivo:'Conteo'}}},scoped);assert.equal(r.status,200,r.body.error);
  r=await f.act('owner',{type:'company.update',companyId:f.company.id,form:{contact:'Nuevo'}},{request:{enforceContext:true,expectedCompanyId:null}});assert.equal(r.body.code,'REVISION_REQUIRED');
});

test('BE-20 y BE-32: uso por empresa y métricas del propietario',async()=>{
  const f=await fixture();await f.sell();
  const r=await f.request('owner','GET','/api/v2/data'),c=r.body.companies.find(c=>c.id===f.company.id);
  assert.equal(c.usage.sales7d,1);assert.equal(c.usage.lastSaleAt,'2026-11-20');assert.ok(c.usage.lastLoginAt);
  assert.equal(r.body.companies.find(c=>c.id===f.other.id).usage.sales7d,0);
  assert.deepEqual({mrr:r.body.metrics.mrr,active:r.body.metrics.active,trial:r.body.metrics.trial},{mrr:200000,active:2,trial:0});
});

test('BE-14: devolución tras el cierre conserva la fecha original y marca afterClosure',async()=>{
  const f=await fixture();const sold=await f.sell();const sale=sold.body.state.ventas[0];
  let r=await f.act('admin',{type:'cash.close',form:{date:'2026-11-20',actual:{efectivo:10000,transferencia:0,tarjeta:0}}});assert.equal(r.status,200,r.body.error);
  f.tick(86400000);r=await f.act('admin',{type:'sale.reverse',id:sale.id,form:{motivo:'Cliente devolvió',parcial:false},items:[]});assert.equal(r.status,200,r.body.error);
  const updated=r.body.state.ventas.find(s=>s.id===sale.id),rev=updated.reversiones.at(-1);
  assert.equal(updated.fecha,'2026-11-20');assert.equal(rev.fechaComercial,'2026-11-21');assert.equal(rev.afterClosure,true);assert.equal(rev.fecha,new Date(f.now).toISOString(),'BE-21: hora inyectada');
  assert.equal(r.body.state.cashClosures[0].totals.actual,10000);
});
