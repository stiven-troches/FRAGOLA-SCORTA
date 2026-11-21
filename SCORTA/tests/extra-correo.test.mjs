import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createMailer,mailConfig,maskEmail} from '../ops/mailer.mjs';
import {openPlatformStore,createPlatformHandler} from '../platform-server.mjs';

// SEG-13: envío real por HTTP contra un servidor falso de Resend (nunca sale a internet).
async function fakeResend(t,{status=200}={}){
 const received=[];
 const server=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;received.push({method:req.method,url:req.url,headers:req.headers,body:JSON.parse(raw||'{}')});res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(status===200?{id:'fake-'+received.length}:{message:'rechazado'}));});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
 return {url:`http://127.0.0.1:${server.address().port}/emails`,received};
}

test('mailer: sin configuración queda desactivado; valida URL y remitente',async()=>{
 assert.deepEqual(mailConfig({}),{provider:null});
 const off=createMailer({env:{}});assert.equal(off.enabled,false);assert.deepEqual(await off.sendAll([{to:'a@b.co',subject:'x',text:'y'}]),[]);
 assert.throws(()=>mailConfig({RESEND_API_KEY:'re_x'}),/SCORTA_MAIL_FROM/);
 assert.throws(()=>mailConfig({SCORTA_MAIL_WEBHOOK_URL:'http://correo.example.com/hook'}),/https/);
 assert.equal(mailConfig({RESEND_API_KEY:'re_x',SCORTA_MAIL_FROM:'SCORTA <no@x.co>'}).url,'https://api.resend.com/emails');
 assert.equal(maskEmail('laura@example.com'),'l***@example.com');
});

test('mailer: Resend recibe remitente, destinatario y texto con la llave como Bearer',async t=>{
 const fake=await fakeResend(t),logs=[];
 const mailer=createMailer({env:{RESEND_API_KEY:'re_prueba',SCORTA_MAIL_FROM:'SCORTA <no-responder@scorta.test>',RESEND_API_URL:fake.url},log:entry=>logs.push(entry)});
 assert.equal(mailer.provider,'resend');
 assert.deepEqual(await mailer.sendAll([{to:'laura@example.com',subject:'Hola',text:'Texto'}]),[true]);
 const [request]=fake.received;
 assert.equal(request.headers.authorization,'Bearer re_prueba');
 assert.deepEqual(request.body,{from:'SCORTA <no-responder@scorta.test>',to:['laura@example.com'],subject:'Hola',text:'Texto'});
 assert.equal(logs[0].event,'mail-sent');assert.equal(logs[0].to,'l***@example.com');assert.ok(!JSON.stringify(logs).includes('re_prueba'));
});

test('mailer: un error del proveedor se registra sin lanzar; el webhook genérico también funciona',async t=>{
 const failing=await fakeResend(t,{status:422}),logs=[];
 const broken=createMailer({env:{RESEND_API_KEY:'k',SCORTA_MAIL_FROM:'a@b.co',RESEND_API_URL:failing.url},log:e=>logs.push(e)});
 assert.deepEqual(await broken.sendAll([{to:'x@y.co',subject:'s',text:'t'},{to:'no-es-correo',subject:'s',text:'t'}]),[false,false]);
 assert.equal(logs[0].event,'mail-failed');assert.match(logs[0].error,/422/);
 const hook=await fakeResend(t);
 const webhook=createMailer({env:{SCORTA_MAIL_WEBHOOK_URL:hook.url,SCORTA_MAIL_WEBHOOK_SECRET:'secreto'}});
 assert.equal(webhook.provider,'webhook');await webhook.send({to:'x@y.co',subject:'s',text:'t'});
 assert.equal(hook.received[0].headers.authorization,'Bearer secreto');assert.deepEqual(hook.received[0].body,{to:'x@y.co',subject:'s',text:'t'});
});

test('SEG-13 HTTP: verificación y recuperación completas con Resend falso; el enlace usa SCORTA_PUBLIC_URL',async t=>{
 const fake=await fakeResend(t),dir=mkdtempSync(join(tmpdir(),'scorta-mail-'));
 const ownerPassword='Propietario.Prueba.2026';
 const store=await openPlatformStore(join(dir,'platform.sqlite'),{owner:{company:'Fragola',username:'Steven',password:ownerPassword,email:'dueno@example.com'}});
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 const mailer=createMailer({env:{RESEND_API_KEY:'re_prueba',SCORTA_MAIL_FROM:'SCORTA <no-responder@scorta.test>',RESEND_API_URL:fake.url}});
 const sending=[];const publicUrl='https://app.scorta.test';
 const handler=createPlatformHandler({store,publicUrl,mailer,onMail:p=>sending.push(p)});
 const server=createServer(async(req,res)=>{if(!await handler(req,res)){res.statusCode=404;res.end();}});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
 const base=`http://127.0.0.1:${server.address().port}`;let cookie='';
 const call=async(method,path,body,headers={})=>{const response=await fetch(base+path,{method,headers:{Origin:publicUrl,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...headers},body:body?JSON.stringify(body):undefined});const set=response.headers.get('set-cookie');if(set)cookie=set.split(';')[0];return {status:response.status,body:await response.json()};};
 const flush=async()=>{await Promise.all(sending.splice(0));};
 assert.deepEqual((await call('GET','/api/v2/password/status')).body,{emailRecovery:true,message:''});
 const login=await call('POST','/api/v2/login',{company:'Fragola',username:'Steven',password:ownerPassword});assert.equal(login.status,200);assert.equal(login.body.session.emailRecovery,true);
 const ctx={'X-SCORTA-Company':'@owner'};
 const req=await call('POST','/api/v2/action',{type:'profile.email.verify.request',expectedCompanyId:'@owner',requestId:'v1'},ctx);
 assert.equal(req.status,200);assert.equal(req.body.outbox,undefined,'el outbox nunca llega al navegador');await flush();
 assert.equal(fake.received.length,1);const code=fake.received[0].body.text.match(/\b(\d{6})\b/)[1];
 assert.equal((await call('POST','/api/v2/action',{type:'profile.email.verify.confirm',expectedCompanyId:'@owner',requestId:'v2',form:{code}},ctx)).body.session.emailVerified,true);
 // Host header spoofing cannot change the link: it always uses SCORTA_PUBLIC_URL.
 const forgot=await call('POST','/api/v2/password/forgot',{company:'Fragola',username:'Steven'},{Host:'atacante.example'});
 assert.equal(forgot.status,200);assert.equal(forgot.body.outbox,undefined);await flush();
 const link=fake.received[1].body.text.match(/https:\/\/\S+/)[0];assert.match(link,/^https:\/\/app\.scorta\.test\/recuperar#[A-Za-z0-9_-]{43}$/);
 const ghost=await call('POST','/api/v2/password/forgot',{company:'Fragola',username:'nadie'});await flush();
 assert.deepEqual(ghost.body,forgot.body);assert.equal(fake.received.length,2,'una cuenta inexistente no genera correo');
 const reset=await call('POST','/api/v2/password/reset',{token:link.split('#')[1],newPassword:'Nueva.Clave.Segura.2026'});
 assert.equal(reset.status,200);await flush();
 assert.match(fake.received[2].body.subject,/cambió/);
 assert.equal((await call('GET','/api/v2/session')).status,401,'la sesión anterior quedó cerrada');
 cookie='';assert.equal((await call('POST','/api/v2/login',{company:'Fragola',username:'Steven',password:'Nueva.Clave.Segura.2026'})).status,200);
});

test('SEG-13 HTTP: sin proveedor o sin SCORTA_PUBLIC_URL no se envía nada',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'scorta-mail-off-'));
 const store=await openPlatformStore(join(dir,'platform.sqlite'),{owner:{company:'Fragola',username:'Steven',password:'Propietario.Prueba.2026'}});
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 let sent=0;const mailer={enabled:true,provider:'fake',sendAll:async()=>{sent++;return [];}};
 const handler=createPlatformHandler({store,mailer});// sin publicUrl
 const server=createServer(async(req,res)=>{if(!await handler(req,res)){res.statusCode=404;res.end();}});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
 const base=`http://127.0.0.1:${server.address().port}`;
 const status=await (await fetch(base+'/api/v2/password/status')).json();assert.equal(status.emailRecovery,false);
 const response=await fetch(base+'/api/v2/password/forgot',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({company:'Fragola',username:'Steven'})});
 assert.equal(response.status,200);assert.equal(sent,0);
});
