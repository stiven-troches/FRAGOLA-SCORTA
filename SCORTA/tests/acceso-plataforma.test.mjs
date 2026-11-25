import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPlatform,platformRequest,PASSWORD_RESET_TTL_MS} from '../platform.mjs';
import {totpCode,totpCounter} from '../totp.mjs';

// Sistema de acceso multiempresa: ingreso por rol, aislamiento, registro cerrado,
// estados de cuenta/empresa, recuperación, segundo factor obligatorio y cierre de sesión.
const T0=Date.parse('2026-11-24T15:00:00Z');
const OWNER='Propietario.Acceso.2026',ADMIN='Administrador.Acceso.2026',SELLER='Vendedor.Acceso.2026';
const MAIL={mailEnabled:true,baseUrl:'https://app.scorta.test'};

async function fixture(options={}){
  const current={options};let state=await createPlatform({owner:{company:'Fragola',username:'Steven',password:OWNER,email:'dueno@example.com'}});
  const call=async(method,path,body,{token,now=T0,clientKey='10.0.0.1',opts=current.options}={})=>{const r=await platformRequest(state,{method,path,body,token,clientKey},{now,...opts});state=r.state;return r;};
  const act=(token,action,extra={})=>call('POST','/api/v2/action',{requestId:crypto.randomUUID(),...action},{token,...extra});
  const login=(company,username,password,extra={})=>call('POST','/api/v2/login',{company,username,password,...(extra.totp?{totp:extra.totp}:{})},extra);
  return {call,act,login,get state(){return state},setOptions(value){current.options=value}};
}
async function withCompanies(options){
  const f=await fixture(options);
  const owner=(await f.login('Fragola','Steven',OWNER)).token;
  for(const [name,admin] of [['Moto Norte','laura'],['Taller Sur','pedro']]){
    const r=await f.act(owner,{type:'company.create',form:{name,startDate:'2026-01-01',endDate:'2030-12-31',monthlyFee:50000,username:admin,password:ADMIN,adminEmail:admin+'@example.com'}});
    assert.equal(r.status,200,r.body.error);
  }
  const north=f.state.companies.find(c=>c.name==='Moto Norte'),south=f.state.companies.find(c=>c.name==='Taller Sur');
  const r=await f.act(owner,{type:'user.create',companyId:north.id,form:{username:'caja1',password:SELLER,name:'Caja',role:'vendedor'}});assert.equal(r.status,200,r.body.error);
  return {...f,owner,north,south};
}

test('ingreso por nombre o código de empresa, con el rol correcto en cada caso',async()=>{
  const f=await withCompanies();
  let r=await f.login('Moto Norte','laura',ADMIN);assert.equal(r.status,200);assert.equal(r.body.session.role,'admin');assert.equal(r.body.session.company.name,'Moto Norte');
  r=await f.login(f.north.slug,'LAURA',ADMIN);assert.equal(r.status,200,'el código (slug) y el usuario sin distinguir mayúsculas también sirven');
  r=await f.login('moto norte','caja1',SELLER);assert.equal(r.status,200);assert.equal(r.body.session.role,'vendedor');
  r=await f.login('Fragola','Steven',OWNER);assert.equal(r.status,200);assert.equal(r.body.session.role,'owner');assert.equal(r.body.session.company,null);
  // The same username in another company is a different account.
  r=await f.login('Taller Sur','laura',ADMIN);assert.equal(r.status,401);assert.equal(r.body.code,'INVALID_CREDENTIALS');
  // Contraseñas nunca salen en las respuestas.
  assert.ok(!JSON.stringify(r.body).includes('password'));
  const ownerView=await f.call('GET','/api/v2/data',undefined,{token:f.owner});
  for(const u of ownerView.body.users){assert.equal(u.password,undefined);assert.equal(u.totp,undefined);}
});

test('solo el propietario crea empresas y cuentas; no hay registro público',async()=>{
  const f=await withCompanies();
  const admin=(await f.login('Moto Norte','laura',ADMIN)).token,seller=(await f.login('Moto Norte','caja1',SELLER)).token;
  for(const token of [admin,seller]){
    let r=await f.act(token,{type:'company.create',form:{name:'Pirata',startDate:'2026-01-01',endDate:'2030-12-31',monthlyFee:1,username:'x',password:ADMIN}});assert.equal(r.status,403);
    r=await f.act(token,{type:'user.create',companyId:f.north.id,form:{username:'intruso',password:ADMIN,role:'admin'}});assert.equal(r.status,403);
    r=await f.act(token,{type:'user.reset',userId:f.state.users.find(u=>u.username==='pedro').id,form:{password:ADMIN}});assert.equal(r.status,403);
  }
  // Sin sesión: ninguna acción ni ruta de registro.
  let r=await f.act(undefined,{type:'company.create',form:{name:'Anon',username:'a',password:ADMIN}});assert.equal(r.status,401);
  for(const path of ['/api/v2/register','/api/v2/signup','/api/v2/users'])assert.ok([401,404].includes((await f.call('POST',path,{company:'X',username:'y',password:ADMIN})).status),path);
  assert.equal(f.state.companies.length,2);assert.equal(f.state.users.length,4);
});

test('aislamiento entre empresas y permisos del vendedor validados en el servidor',async()=>{
  const f=await withCompanies();
  const north=(await f.login('Moto Norte','laura',ADMIN)).token,south=(await f.login('Taller Sur','pedro',ADMIN)).token,seller=(await f.login('Moto Norte','caja1',SELLER)).token;
  let r=await f.act(north,{type:'business.change',payload:{kind:'producto',form:{nombre:'Llanta Norte',stock:3,precio_compra:1000,precio_venta:2000}}});assert.equal(r.status,200,r.body.error);
  const productId=r.body.state.prods[0].id;
  r=await f.call('GET','/api/v2/data',undefined,{token:south});
  assert.equal(r.body.state.prods.length,0,'Taller Sur no ve productos de Moto Norte');assert.equal(r.body.companies,undefined);assert.equal(r.body.users,undefined);
  // Vender un producto de otra empresa no es posible.
  r=await f.act(south,{type:'sale.create',form:{paymentMethod:'efectivo'},items:[{producto_id:productId,cantidad:1,precio_unitario:2000}],labor:[]});assert.notEqual(r.status,200);
  r=await f.call('GET','/api/v2/data',undefined,{token:north});assert.equal(r.body.state.prods.find(p=>p.id===productId).stock,3,'el inventario de Moto Norte no cambió');
  // Contexto de empresa forzado por el navegador.
  r=await platformRequest(f.state,{method:'GET',path:'/api/v2/data',token:north,expectedCompanyId:f.south.id,enforceContext:true},{now:T0});assert.notEqual(r.status,200);
  // El vendedor no modifica inventario ni ve costos.
  r=await f.act(seller,{type:'business.change',payload:{kind:'producto',form:{nombre:'X',stock:1,precio_venta:1}}});assert.equal(r.status,403);
  r=await f.call('GET','/api/v2/data',undefined,{token:seller});assert.equal(r.body.state.prods[0].precio_compra,undefined);
  r=await f.call('GET','/api/v2/reports',undefined,{token:seller});assert.equal(r.status,403);
});

test('cuenta deshabilitada, empresa suspendida, vencida y pendiente de inicio tienen mensajes distintos',async()=>{
  const f=await withCompanies();
  const caja=f.state.users.find(u=>u.username==='caja1');
  let r=await f.act(f.owner,{type:'user.update',userId:caja.id,form:{active:false}});assert.equal(r.status,200,r.body.error);
  r=await f.login('Moto Norte','caja1','Clave.Equivocada.1');assert.equal(r.status,401);assert.equal(r.body.code,'INVALID_CREDENTIALS','sin la contraseña correcta no se revela que existe');
  r=await f.login('Moto Norte','caja1',SELLER);assert.equal(r.status,403);assert.equal(r.body.code,'ACCOUNT_DISABLED');
  assert.equal(r.token,undefined);
  r=await f.act(f.owner,{type:'company.access',companyId:f.north.id,form:{enabled:false}});assert.equal(r.status,200,r.body.error);
  r=await f.login('Moto Norte','laura',ADMIN);assert.equal(r.status,403);assert.equal(r.body.code,'COMPANY_DISABLED');
  r=await f.login('Taller Sur','pedro',ADMIN,{now:Date.parse('2031-02-01T15:00:00Z')});assert.equal(r.status,403);assert.equal(r.body.code,'CONTRACT_EXPIRED');assert.match(r.body.error,/venció/);
  r=await f.act(f.owner,{type:'company.create',form:{name:'Futura',startDate:'2027-03-01',endDate:'2027-12-31',monthlyFee:1,username:'ana',password:ADMIN}});assert.equal(r.status,200,r.body.error);
  r=await f.login('Futura','ana',ADMIN);assert.equal(r.status,403);assert.equal(r.body.code,'CONTRACT_NOT_STARTED');
});

test('recuperación: misma respuesta exista o no la cuenta, enlace de un solo uso por 1 hora y guardado solo como huella',async()=>{
  const f=await withCompanies(MAIL);
  const laura=(await f.login('Moto Norte','laura',ADMIN)).token;
  const sent=await f.act(laura,{type:'profile.email.verify.request'});const code=sent.outbox[0].text.match(/\b(\d{6})\b/)[1];
  assert.equal((await f.act(laura,{type:'profile.email.verify.confirm',form:{code}})).status,200);
  const real=await f.call('POST','/api/v2/password/forgot',{company:'Moto Norte',username:'laura'});
  const fake=await f.call('POST','/api/v2/password/forgot',{company:'Moto Norte',username:'nadie'},{clientKey:'10.0.0.2'});
  const noCompany=await f.call('POST','/api/v2/password/forgot',{company:'No Existe',username:'laura'},{clientKey:'10.0.0.3'});
  assert.equal(real.status,200);assert.deepEqual(fake.body,real.body);assert.deepEqual(noCompany.body,real.body);
  assert.equal(real.outbox.length,1);assert.equal(fake.outbox,undefined);assert.equal(real.outbox[0].to,'laura@example.com');
  assert.match(real.outbox[0].text,/1 hora/);
  const token=real.outbox[0].text.match(/\/recuperar#([A-Za-z0-9_-]{43})/)[1];
  assert.ok(!JSON.stringify(f.state).includes(token),'solo se guarda la huella del enlace');
  assert.equal(PASSWORD_RESET_TTL_MS,60*60*1000);
  const weak=await f.call('POST','/api/v2/password/reset',{token,newPassword:'corta'});assert.equal(weak.status,400);
  const ok=await f.call('POST','/api/v2/password/reset',{token,newPassword:'Nueva.Clave.Laura.7'},{now:T0+59*60000});assert.equal(ok.status,200,ok.body.error);
  assert.equal((await f.call('GET','/api/v2/session',undefined,{token:laura,now:T0+59*60000})).status,401,'el cambio cierra las sesiones abiertas');
  const again=await f.call('POST','/api/v2/password/reset',{token,newPassword:'Otra.Clave.Laura.7'},{now:T0+59*60000});assert.equal(again.status,400);assert.equal(again.body.code,'RESET_INVALID');
  assert.equal((await f.login('Moto Norte','laura','Nueva.Clave.Laura.7',{now:T0+60*60000})).status,200);
  // Un enlace nuevo vence pasada la hora.
  const second=await f.call('POST','/api/v2/password/forgot',{company:'Moto Norte',username:'laura'},{now:T0+2*3600000,clientKey:'10.0.0.9'});
  const late=second.outbox[0].text.match(/\/recuperar#([A-Za-z0-9_-]{43})/)[1];
  const expired=await f.call('POST','/api/v2/password/reset',{token:late,newPassword:'Tarde.Clave.Laura.7'},{now:T0+2*3600000+PASSWORD_RESET_TTL_MS+1});
  assert.equal(expired.status,400);assert.equal(expired.body.code,'RESET_INVALID');
});

test('propietario: segundo factor obligatorio, código requerido al ingresar y sin repetición',async()=>{
  const f=await withCompanies();f.setOptions({requireOwnerTwoFactor:true});
  let r=await f.login('Fragola','Steven',OWNER);const token=r.token;
  assert.equal(r.body.session.twoFactorRequired,true);assert.equal(r.body.session.twoFactorEnabled,false);
  r=await f.act(token,{type:'company.create',form:{name:'Nueva',startDate:'2026-01-01',endDate:'2030-12-31',monthlyFee:1,username:'nuevo',password:ADMIN}});assert.equal(r.status,403);assert.equal(r.body.code,'TWO_FACTOR_SETUP_REQUIRED');
  assert.equal((await f.call('GET','/api/v2/session',undefined,{token})).status,200);
  r=await f.act(token,{type:'twofa.setup'});assert.equal(r.status,200);const secret=r.body.twoFactorSetup.secret;assert.match(r.body.twoFactorSetup.uri,/^otpauth:\/\/totp\//);
  r=await f.act(token,{type:'twofa.enable',form:{code:'000000'===await totpCode(secret,totpCounter(T0))?'111111':'000000'}});assert.equal(r.status,400);
  r=await f.act(token,{type:'twofa.enable',form:{code:await totpCode(secret,totpCounter(T0))}});assert.equal(r.status,200,r.body.error);assert.equal(r.body.session.twoFactorEnabled,true);
  assert.ok(!JSON.stringify(r.body).includes(secret),'el secreto no vuelve a mostrarse');
  // Las cuentas de empresa no se ven afectadas por la política del propietario.
  assert.equal((await f.login('Moto Norte','laura',ADMIN)).status,200);
  const later=T0+90000;
  r=await f.login('Fragola','Steven',OWNER,{now:later});assert.equal(r.status,401);assert.equal(r.body.code,'TOTP_REQUIRED');assert.equal(r.token,undefined);
  const code=await totpCode(secret,totpCounter(later));
  r=await f.login('Fragola','Steven',OWNER,{now:later,totp:code});assert.equal(r.status,200,r.body.error);const second=r.token;
  r=await f.login('Fragola','Steven',OWNER,{now:later+1000,totp:code,clientKey:'10.0.0.7'});assert.equal(r.status,401);assert.equal(r.body.code,'TOTP_INVALID','un código ya usado no sirve otra vez');
  r=await f.act(second,{type:'company.create',form:{name:'Nueva',startDate:'2026-01-01',endDate:'2030-12-31',monthlyFee:1,username:'nuevo',password:ADMIN}},{now:later});assert.equal(r.status,200,r.body.error);
});

test('cierre de sesión, cambio obligatorio de contraseña, política y límite de intentos',async()=>{
  const f=await withCompanies();
  let r=await f.login('Moto Norte','laura',ADMIN);const token=r.token;
  r=await f.call('POST','/api/v2/logout',{},{token});assert.equal(r.status,200);assert.equal(r.token,null);
  assert.equal((await f.call('GET','/api/v2/data',undefined,{token})).status,401,'el token cerrado ya no sirve');
  // Política de contraseñas nuevas.
  for(const weak of ['Corta.1','sinmayuscula.1','SINMINUSCULA.1','SinSimbolo123']){
    r=await f.act(f.owner,{type:'user.create',companyId:f.north.id,form:{username:'debil'+weak.length,password:weak,role:'vendedor'}});assert.equal(r.status,400,weak);
  }
  // Restablecimiento por el propietario: obliga a cambiarla antes de seguir.
  const laura=f.state.users.find(u=>u.username==='laura');
  r=await f.act(f.owner,{type:'user.reset',userId:laura.id,form:{password:'Temporal.Laura.2026'}});assert.equal(r.status,200);
  r=await f.login('Moto Norte','laura','Temporal.Laura.2026');assert.equal(r.body.session.mustChangePassword,true);const temp=r.token;
  r=await f.act(temp,{type:'business.change',payload:{kind:'producto',form:{nombre:'X',stock:1,precio_venta:1}}});assert.equal(r.status,403);assert.equal(r.body.code,'PASSWORD_CHANGE_REQUIRED');
  r=await f.call('POST','/api/v2/password',{currentPassword:'Temporal.Laura.2026',newPassword:'Definitiva.Laura.2026'},{token:temp});assert.equal(r.status,200);
  // Intentos repetidos: bloqueo temporal con 429.
  let last;for(let i=0;i<11;i++)last=await f.login('Taller Sur','pedro','Mala.Clave.'+i,{clientKey:'10.9.9.9'});
  assert.equal(last.status,429);assert.equal(last.body.code,'RATE_LIMITED');
  assert.equal((await f.login('Taller Sur','pedro',ADMIN,{clientKey:'10.9.9.9'})).status,429,'ni siquiera la contraseña correcta pasa durante el bloqueo');
});
