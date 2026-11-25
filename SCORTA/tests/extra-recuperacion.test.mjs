import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPlatform,platformRequest,PASSWORD_RESET_TTL_MS,EMAIL_CODE_TTL_MS,MAIL_DISABLED_MESSAGE} from '../platform.mjs';

// SEG-13: lógica pura de recuperación y verificación de correo (sin red ni correos reales).
const T0=Date.parse('2026-11-21T15:00:00Z');
const ownerPassword='Propietario.Prueba.2026',adminPassword='Administrador.Prueba.2026';
const MAIL={mailEnabled:true,baseUrl:'https://app.scorta.test'};

async function fixture(){
 let state=await createPlatform({owner:{company:'Fragola',username:'Steven',password:ownerPassword,email:'dueno@example.com'}});
 const call=async(method,path,body,{token,now=T0,options=MAIL,clientKey='10.0.0.1'}={})=>{const r=await platformRequest(state,{method,path,body,token,clientKey},{now,...options});state=r.state;return r;};
 const owner=(await call('POST','/api/v2/login',{company:'Fragola',username:'Steven',password:ownerPassword})).token;
 await call('POST','/api/v2/action',{type:'company.create',requestId:'c1',form:{name:'Moto Norte',startDate:'2026-01-01',endDate:'2030-12-31',monthlyFee:50000,username:'admin',password:adminPassword,adminEmail:'laura@example.com'}},{token:owner});
 const admin=(await call('POST','/api/v2/login',{company:'Moto Norte',username:'admin',password:adminPassword})).token;
 return {call,owner,admin,get state(){return state},set state(v){state=v}};
}
const user=(f,name)=>f.state.users.find(u=>u.username===name);
async function verifyEmail(f,token,now=T0){
 const sent=await f.call('POST','/api/v2/action',{type:'profile.email.verify.request',requestId:'v'+now},{token,now});
 assert.equal(sent.status,200,JSON.stringify(sent.body));assert.equal(sent.outbox.length,1);
 const code=sent.outbox[0].text.match(/\b(\d{6})\b/)[1];
 const ok=await f.call('POST','/api/v2/action',{type:'profile.email.verify.confirm',requestId:'c'+now,form:{code}},{token,now});
 assert.equal(ok.status,200);return ok;
}
const linkToken=message=>message.text.match(/\/recuperar#([A-Za-z0-9_-]{43})/)[1];

test('SEG-13: verificación del correo con código de 6 dígitos, intentos limitados y sin filtrar el código',async()=>{
 const f=await fixture();
 const sent=await f.call('POST','/api/v2/action',{type:'profile.email.verify.request',requestId:'r1'},{token:f.admin});
 assert.equal(sent.status,200);assert.deepEqual(sent.outbox.map(m=>m.to),['laura@example.com']);
 assert.match(sent.outbox[0].subject,/verificar/i);
 const code=sent.outbox[0].text.match(/\b(\d{6})\b/)[1];
 // The code is stored only hashed and never reaches the envelope.
 assert.ok(!JSON.stringify(f.state).includes(code));assert.ok(!JSON.stringify(sent.body).includes('emailVerification'));
 const again=await f.call('POST','/api/v2/action',{type:'profile.email.verify.request',requestId:'r2'},{token:f.admin,now:T0+1000});
 assert.equal(again.status,429);
 const wrong=code==='000000'?'111111':'000000';
 const bad=await f.call('POST','/api/v2/action',{type:'profile.email.verify.confirm',requestId:'x1',form:{code:wrong}},{token:f.admin});
 assert.equal(bad.status,400);assert.equal(bad.body.code,'EMAIL_CODE_INVALID');assert.equal(user(f,'admin').emailVerification.attempts,1,'el intento fallido se conserva');
 const ok=await f.call('POST','/api/v2/action',{type:'profile.email.verify.confirm',requestId:'x2',form:{code}},{token:f.admin});
 assert.equal(ok.status,200);assert.equal(ok.body.session.emailVerified,true);assert.equal(ok.body.session.emailRecovery,true);
 assert.ok(f.state.audit.some(a=>a.accion==='profile.email.verify.confirm'));
});

test('SEG-13: el código vence a los 10 minutos y se invalida tras 5 intentos',async()=>{
 const f=await fixture();
 const sent=await f.call('POST','/api/v2/action',{type:'profile.email.verify.request',requestId:'r1'},{token:f.admin});
 const code=sent.outbox[0].text.match(/\b(\d{6})\b/)[1];
 const late=await f.call('POST','/api/v2/action',{type:'profile.email.verify.confirm',requestId:'l1',form:{code}},{token:f.admin,now:T0+EMAIL_CODE_TTL_MS+1});
 assert.equal(late.status,400);assert.equal(late.body.code,'EMAIL_CODE_EXPIRED');
 const resent=await f.call('POST','/api/v2/action',{type:'profile.email.verify.request',requestId:'r2'},{token:f.admin,now:T0+EMAIL_CODE_TTL_MS+2});
 const fresh=resent.outbox[0].text.match(/\b(\d{6})\b/)[1],wrong=fresh==='000000'?'111111':'000000';
 for(let i=0;i<5;i++)await f.call('POST','/api/v2/action',{type:'profile.email.verify.confirm',requestId:'w'+i,form:{code:wrong}},{token:f.admin,now:T0+EMAIL_CODE_TTL_MS+3});
 const blocked=await f.call('POST','/api/v2/action',{type:'profile.email.verify.confirm',requestId:'w9',form:{code:fresh}},{token:f.admin,now:T0+EMAIL_CODE_TTL_MS+4});
 assert.equal(blocked.status,400);assert.equal(user(f,'admin').emailVerified,false);
});

test('SEG-13: sin correo configurado no se envía nada y la respuesta pública es la misma',async()=>{
 const f=await fixture(),off={baseUrl:'https://app.scorta.test'};
 const status=await f.call('GET','/api/v2/password/status',undefined,{options:off});
 assert.deepEqual(status.body,{emailRecovery:false,message:MAIL_DISABLED_MESSAGE});
 const verify=await f.call('POST','/api/v2/action',{type:'profile.email.verify.request',requestId:'r1'},{token:f.admin,options:off});
 assert.equal(verify.status,503);assert.equal(verify.body.code,'MAIL_DISABLED');
 const forgot=await f.call('POST','/api/v2/password/forgot',{company:'Moto Norte',username:'admin'},{options:off});
 assert.equal(forgot.status,200);assert.equal(forgot.outbox,undefined);assert.equal(forgot.body.emailRecovery,false);
 const session=await f.call('GET','/api/v2/session',undefined,{token:f.admin,options:off});assert.equal(session.body.session.emailRecovery,false);
});

test('SEG-13: /password/forgot responde igual exista o no la cuenta y solo envía a correos verificados',async()=>{
 const f=await fixture();
 const unverified=await f.call('POST','/api/v2/password/forgot',{company:'Moto Norte',username:'admin'});
 await verifyEmail(f,f.admin);
 const real=await f.call('POST','/api/v2/password/forgot',{company:'moto norte',username:'ADMIN'},{clientKey:'10.0.0.2'});
 const ghost=await f.call('POST','/api/v2/password/forgot',{company:'Moto Norte',username:'nadie'},{clientKey:'10.0.0.2'});
 const badCompany=await f.call('POST','/api/v2/password/forgot',{company:'No existe',username:'admin'},{clientKey:'10.0.0.2'});
 const invalid=await f.call('POST','/api/v2/password/forgot',{company:5},{clientKey:'10.0.0.2'});
 for(const r of [unverified,real,ghost,badCompany,invalid]){assert.equal(r.status,200);assert.deepEqual(r.body,real.body);}
 assert.equal(unverified.outbox,undefined);assert.equal(ghost.outbox,undefined);assert.equal(badCompany.outbox,undefined);
 assert.equal(real.outbox.length,1);assert.equal(real.outbox[0].to,'laura@example.com');
 assert.match(real.outbox[0].text,/^https:\/\/app\.scorta\.test\/recuperar#[A-Za-z0-9_-]{43}$/m);
 assert.doesNotMatch(real.outbox[0].text,/http:\/\/|www\./);
 const secret=linkToken(real.outbox[0]);
 assert.ok(!JSON.stringify(f.state).includes(secret),'solo se guarda el hash del token');
 assert.equal(Object.keys(f.state.passwordResets).length,1);
 assert.ok(f.state.audit.some(a=>a.accion==='password.reset.request'));
});

test('SEG-13: límites por cuenta (silencioso) y por IP (429)',async()=>{
 const f=await fixture();await verifyEmail(f,f.admin);
 const sends=[];
 for(let i=0;i<5;i++){const r=await f.call('POST','/api/v2/password/forgot',{company:'Moto Norte',username:'admin'},{clientKey:'ip-'+i});assert.equal(r.status,200);sends.push(r.outbox?.length||0);}
 assert.deepEqual(sends,[1,1,1,0,0],'tres enlaces por cuenta cada 15 minutos');
 const after=await f.call('POST','/api/v2/password/forgot',{company:'Moto Norte',username:'admin'},{clientKey:'ip-x',now:T0+15*60000+1});
 assert.equal(after.outbox.length,1);
 let last;for(let i=0;i<11;i++)last=await f.call('POST','/api/v2/password/forgot',{company:'X',username:'y'+i},{clientKey:'1.2.3.4'});
 assert.equal(last.status,429);assert.equal(last.body.code,'RATE_LIMITED');assert.ok(last.body.retryAfterSeconds>0);
});

test('SEG-13: /password/reset aplica la política, es de un solo uso, cierra sesiones y vence a la hora',async()=>{
 const f=await fixture();await verifyEmail(f,f.admin);
 const other=(await f.call('POST','/api/v2/login',{company:'Moto Norte',username:'admin',password:adminPassword})).token;
 const mail=(await f.call('POST','/api/v2/password/forgot',{company:'Moto Norte',username:'admin'})).outbox[0],secret=linkToken(mail);
 const weak=await f.call('POST','/api/v2/password/reset',{token:secret,newPassword:'corta'});
 assert.equal(weak.status,400);assert.equal(weak.body.code,'INVALID_PASSWORD');
 const same=await f.call('POST','/api/v2/password/reset',{token:secret,newPassword:adminPassword});assert.equal(same.status,400);
 const done=await f.call('POST','/api/v2/password/reset',{token:secret,newPassword:'Nueva.Clave.Segura.2026'},{now:T0+60000});
 assert.equal(done.status,200);assert.equal(done.body.username,'admin');assert.equal(done.body.company,'Moto Norte');
 assert.equal(done.outbox[0].to,'laura@example.com');assert.match(done.outbox[0].subject,/cambió/);
 for(const token of [f.admin,other])assert.equal((await f.call('GET','/api/v2/session',undefined,{token})).status,401,'todas las sesiones se cierran');
 const reused=await f.call('POST','/api/v2/password/reset',{token:secret,newPassword:'Otra.Clave.Segura.2026'});
 assert.equal(reused.status,400);assert.equal(reused.body.code,'RESET_INVALID');
 assert.equal((await f.call('POST','/api/v2/login',{company:'Moto Norte',username:'admin',password:'Nueva.Clave.Segura.2026'})).status,200);
 assert.equal((await f.call('POST','/api/v2/login',{company:'Moto Norte',username:'admin',password:adminPassword},{clientKey:'z'})).status,401);
 const audit=f.state.audit.find(a=>a.accion==='password.reset');assert.equal(audit.usuario,'admin');assert.equal(audit.medio,'correo');
 // Expiry: a second link stops working after one hour.
 const later=(await f.call('POST','/api/v2/password/forgot',{company:'Moto Norte',username:'admin'},{now:T0+120000,clientKey:'e'})).outbox[0];
 const expired=await f.call('POST','/api/v2/password/reset',{token:linkToken(later),newPassword:'Tercera.Clave.Segura.2026'},{now:T0+120000+PASSWORD_RESET_TTL_MS+1});
 assert.equal(expired.status,400);assert.equal(expired.body.code,'RESET_INVALID');
 const garbage=await f.call('POST','/api/v2/password/reset',{token:'x'.repeat(43),newPassword:'Tercera.Clave.Segura.2026'});assert.equal(garbage.status,400);
});

test('SEG-13: un enlace nuevo, cambiar el correo o restablecer por el propietario invalida el anterior',async()=>{
 const f=await fixture();await verifyEmail(f,f.admin);
 const first=linkToken((await f.call('POST','/api/v2/password/forgot',{company:'Moto Norte',username:'admin'})).outbox[0]);
 const second=linkToken((await f.call('POST','/api/v2/password/forgot',{company:'Moto Norte',username:'admin'})).outbox[0]);
 assert.equal((await f.call('POST','/api/v2/password/reset',{token:first,newPassword:'Nueva.Clave.Segura.2026'})).status,400);
 const changed=await f.call('POST','/api/v2/action',{type:'profile.email.update',requestId:'e1',form:{email:'nuevo@example.com',password:adminPassword}},{token:f.admin});
 assert.equal(changed.status,200);assert.equal(changed.body.session.email,'nuevo@example.com');assert.equal(changed.body.session.emailVerified,false);
 assert.equal((await f.call('POST','/api/v2/password/reset',{token:second,newPassword:'Nueva.Clave.Segura.2026'})).status,400);
 const wrongPassword=await f.call('POST','/api/v2/action',{type:'profile.email.update',requestId:'e2',form:{email:'otro@example.com',password:'mala'}},{token:f.admin});
 assert.equal(wrongPassword.status,400);assert.equal(user(f,'admin').email,'nuevo@example.com');
});

test('SEG-13: el propietario también puede recuperar su acceso y la empresa suspendida no recibe enlaces',async()=>{
 const f=await fixture();await verifyEmail(f,f.owner);
 const mail=await f.call('POST','/api/v2/password/forgot',{company:'Fragola',username:'steven'});
 assert.equal(mail.outbox[0].to,'dueno@example.com');
 await verifyEmail(f,f.admin,T0+1);
 const company=f.state.companies[0];f.state=structuredClone(f.state);f.state.companies[0].enabled=false;
 const suspended=await f.call('POST','/api/v2/password/forgot',{company:company.name,username:'admin'},{clientKey:'s'});
 assert.equal(suspended.status,200);assert.equal(suspended.outbox,undefined);
});
