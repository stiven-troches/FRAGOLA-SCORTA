// BE-11 + BE-33 + OPS-07: alertas por correo al propietario con un mailer falso.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAlerter,errorBurst,securityAlert,scrub,ALERT_THROTTLE_MS} from '../ops/alerts.mjs';
import {openPlatformStore} from '../platform-server.mjs';

const fakeMailer=()=>{const sent=[];return {enabled:true,provider:'fake',sent,async send(message){sent.push(message);return true;}};};

test('alertas: un correo por tipo cada hora, desactivadas sin correo o sin destinatario',async()=>{
  let now=Date.UTC(2026,10,25,12);const mailer=fakeMailer(),logs=[];
  const alerter=createAlerter({mailer,to:'dueno@example.com',clock:()=>now,log:entry=>logs.push(entry),version:'v-test'});
  assert.equal(alerter.enabled,true);
  assert.equal(await alerter.notify('capacity-warning',{subject:'Capacidad',lines:['Disco usado: 85 %']}),'sent');
  assert.equal(await alerter.notify('capacity-warning',{subject:'Capacidad',lines:['Disco usado: 86 %']}),'throttled');
  assert.equal(await alerter.notify('offsite-backup-failed',{subject:'Respaldo',lines:[]}),'sent','otro tipo no espera');
  now+=ALERT_THROTTLE_MS-1;assert.equal(await alerter.notify('capacity-warning',{subject:'Capacidad'}),'throttled');
  now+=1;assert.equal(await alerter.notify('capacity-warning',{subject:'Capacidad'}),'sent');
  assert.equal(mailer.sent.length,3);
  const [first]=mailer.sent;assert.equal(first.to,'dueno@example.com');assert.equal(first.subject,'[SCORTA] Capacidad');
  assert.match(first.text,/Disco usado: 85 %/);assert.match(first.text,/Tipo: capacity-warning/);assert.match(first.text,/Versión: v-test/);
  assert.ok(logs.some(l=>l.event==='alert-mail-throttled'));
  // Sin proveedor o sin SCORTA_OWNER_EMAIL válido: nada sale.
  for(const options of [{mailer:{enabled:false},to:'dueno@example.com'},{mailer:fakeMailer(),to:''},{mailer:fakeMailer(),to:'no-es-correo'}]){
    const off=createAlerter(options);assert.equal(off.enabled,false);assert.equal(await off.notify('x',{subject:'x'}),'disabled');
  }
  // Un fallo del proveedor no lanza y libera el registro con el error depurado.
  const broken=createAlerter({mailer:{enabled:true,async send(){throw Error('401 token=abcdef secreto https://api.example.com/x?key=1');}},to:'dueno@example.com',log:entry=>logs.push(entry)});
  assert.equal(await broken.notify('security:login_failures',{subject:'x'}),'failed');
  const failure=logs.find(l=>l.event==='alert-mail-failed');assert.ok(failure);assert.doesNotMatch(failure.error,/abcdef|api\.example\.com/);
});

test('alertas: el texto no incluye secretos ni direcciones',()=>{
  assert.equal(scrub('Error token=abc123 en https://bucket.example/x?X-Amz-Signature=zzz'),'Error [oculto] en [url]');
  assert.doesNotMatch(scrub('llave '+'A'.repeat(44)),/AAAA/);
  const alert=securityAlert({id:'e1',fecha:'2026-11-25T12:00:00.000Z',tipo:'login_failures',companyId:'c1',empresa:'Moto Real',usuario:'admin',intentos:5,cookie:'scorta_platform=secreto',clientKey:'203.0.113.9'});
  assert.equal(alert.type,'security:login_failures');assert.equal(alert.subject,'Muchos intentos fallidos de ingreso');
  const text=alert.lines.join('\n');assert.match(text,/Moto Real/);assert.match(text,/Intentos: 5/);
  assert.doesNotMatch(text,/secreto|203\.0\.113|c1\b/);
  assert.equal(securityAlert({tipo:'owner_new_origin',usuario:'Steven'}).subject,'Ingreso del propietario desde un origen nuevo');
  assert.equal(securityAlert({tipo:'support_start',empresa:'Moto Real',motivo:'Revisar caja'}).type,'security:support_start');
});

test('alertas: ráfaga de errores 5xx (10 en 5 minutos) dispara una sola vez por ráfaga',()=>{
  let now=0;const burst=errorBurst({threshold:10,windowMs:300000,clock:()=>now});
  const fired=[];for(let i=0;i<9;i++){fired.push(burst.record());now+=1000;}
  assert.deepEqual(fired.filter(Boolean),[]);
  assert.equal(burst.record(),true);assert.equal(burst.record(),false,'la misma ráfaga no repite');
  assert.equal(burst.count(),11);
  now+=400000;assert.equal(burst.record(),false);assert.equal(burst.count(),1);
  // Errores espaciados (menos de 10 en la ventana) nunca disparan.
  for(let i=0;i<30;i++){now+=60000;assert.equal(burst.record(),false);}
});

test('alertas: la plataforma entrega los eventos de seguridad nuevos tras confirmar la escritura',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'scorta-alertas-')),file=join(directory,'platform.sqlite');let store;
  const owner={company:'Fragola',username:'Steven',password:'Owner.Alertas.2026!'};
  try{
    const received=[];
    store=await openPlatformStore(file,{owner,onSecurityEvents:events=>received.push(...events)});
    // Primer ingreso: solo registra el origen, sin evento.
    let r=await store.request({method:'POST',path:'/api/v2/login',body:owner,clientKey:'origen-a'});assert.equal(r.status,200);
    assert.equal(received.length,0);
    r=await store.request({method:'POST',path:'/api/v2/login',body:owner,clientKey:'origen-b'});assert.equal(r.status,200);
    assert.deepEqual(received.map(e=>e.tipo),['owner_new_origin']);
    for(let i=0;i<5;i++){r=await store.request({method:'POST',path:'/api/v2/login',body:{...owner,password:'incorrecta'},clientKey:'origen-c'+i});assert.equal(r.status,401);}
    assert.deepEqual(received.map(e=>e.tipo),['owner_new_origin','login_failures']);
    assert.equal(received[1].intentos,5);
    // Un sexto fallo en la misma ventana no repite el evento.
    await store.request({method:'POST',path:'/api/v2/login',body:{...owner,password:'incorrecta'},clientKey:'origen-d'});
    assert.equal(received.length,2);
    // Un oyente que falla no rompe la escritura.
    store.close();store=await openPlatformStore(file,{onSecurityEvents:()=>{throw Error('oyente roto');}});
    r=await store.request({method:'POST',path:'/api/v2/login',body:owner,clientKey:'origen-e'});assert.equal(r.status,200);
  }finally{store?.close();rmSync(directory,{recursive:true,force:true});}
});
