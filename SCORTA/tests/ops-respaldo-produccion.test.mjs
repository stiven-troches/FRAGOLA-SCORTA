// OPS: en producción, un respaldo externo sin configurar no puede pasar desapercibido:
// error claro al arrancar, warning en /healthz y alerta por correo `offsite-backup-disabled`.
// SCORTA_OFFSITE_BACKUP=off es el opt-out explícito. Arranque real del servidor + webhook de correo falso.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';

const script=fileURLToPath(new URL('../server.mjs',import.meta.url));
const clean=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^(SCORTA_|RENDER_|RESEND_|NODE_ENV$|NODE_TEST_CONTEXT$|PORT$|HOST$|DATA_DIR$)/.test(k)));
const token='token-de-salud-0123456789',detail={headers:{authorization:'Bearer '+token}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function webhook(t,{status=200}={}){
  const received=[];
  const server=createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);received.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));res.statusCode=status;res.end('{}');});
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections?.();server.close();});
  return {received,url:'http://127.0.0.1:'+server.address().port+'/'};
}
async function start(t,env){
  const child=spawn(process.execPath,[script],{env:{...clean,PORT:'0',HOST:'127.0.0.1',...env},stdio:['ignore','pipe','pipe']});
  let out='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>out+=d);
  t.after(()=>new Promise(r=>{if(child.exitCode!==null||child.signalCode!==null)return r();child.once('exit',r);child.kill();}));
  const deadline=Date.now()+15000;
  while(!/listo en http:\/\/localhost:(\d+)/.test(out)){if(child.exitCode!==null||Date.now()>deadline)throw Error('El servidor no arrancó:\n'+out);await sleep(50);}
  return {base:'http://127.0.0.1:'+out.match(/localhost:(\d+)/)[1],log:()=>out};
}
// Se registra después de arrancar el servidor: los ganchos corren en orden y el proceso debe haber salido antes de borrar la carpeta.
const cleanup=(t,dir)=>t.after(()=>rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:200}));
const baseEnv=(dir,hook,extra={})=>({NODE_ENV:'production',DATA_DIR:dir,SCORTA_OWNER_PASSWORD:'OwnerPlatformFixture123456!',SCORTA_PUBLIC_URL:'https://scorta.example.com',SCORTA_HEALTH_TOKEN:token,SCORTA_OWNER_EMAIL:'dueno@example.com',SCORTA_MAIL_WEBHOOK_URL:hook.url,...extra});
async function waitFor(check,ms=8000){const end=Date.now()+ms;while(Date.now()<end){const v=check();if(v)return v;await sleep(50);}return null;}

test('producción sin variables de respaldo externo: error en el log, warning en /healthz y alerta por correo',{timeout:60000},async t=>{
  const dir=mkdtempSync(join(tmpdir(),'scorta-ops-respaldo-'));
  const hook=await webhook(t);
  const s=await start(t,baseEnv(dir,hook,{SCORTA_S3_BUCKET:'solo-el-bucket'}));cleanup(t,dir);
  const line=s.log().split('\n').map(l=>{try{return JSON.parse(l)}catch{return null}}).find(l=>l?.event==='offsite-backup-disabled');
  assert.ok(line,'error claro al arrancar');assert.equal(line.level,'error');
  assert.ok(line.missing.includes('SCORTA_BACKUP_KEY')&&line.missing.includes('SCORTA_S3_ENDPOINT'));
  // /healthz público: warning true (sin detalle); con token, el motivo.
  const pub=await (await fetch(s.base+'/healthz')).json();assert.equal(pub.warning,true);assert.deepEqual(Object.keys(pub).sort(),['ok','startedAt','version','warning']);
  const full=await (await fetch(s.base+'/healthz',detail)).json();
  assert.equal(full.warning,true);assert.equal(full.offsiteBackup.warning,true);assert.equal(full.offsiteBackup.enabled,false);assert.equal(full.offsiteBackup.optOut,false);
  assert.ok(full.offsiteBackup.missing.includes('SCORTA_BACKUP_KEY'));
  // Alerta por correo offsite-backup-disabled, sin secretos.
  const mail=await waitFor(()=>hook.received.find(m=>/offsite-backup-disabled/.test(m.text||'')));
  assert.ok(mail,'se envió la alerta offsite-backup-disabled');
  assert.equal(mail.to,'dueno@example.com');assert.match(mail.subject,/\[SCORTA\].*respaldo externo/i);
  assert.match(mail.text,/SCORTA_BACKUP_KEY/);assert.match(mail.text,/SCORTA_OFFSITE_BACKUP=off/);
  assert.doesNotMatch(mail.text,/OwnerPlatformFixture|solo-el-bucket/);
  // Varias consultas a /healthz no repiten la alerta (throttle de una hora).
  for(let i=0;i<3;i++)await fetch(s.base+'/healthz');await sleep(300);
  assert.equal(hook.received.filter(m=>/offsite-backup-disabled/.test(m.text||'')).length,1);
});

test('producción con SCORTA_OFFSITE_BACKUP=off: opt-out explícito, sin warning de respaldo ni alerta',{timeout:60000},async t=>{
  const dir=mkdtempSync(join(tmpdir(),'scorta-ops-respaldo-'));
  const hook=await webhook(t);
  const s=await start(t,baseEnv(dir,hook,{SCORTA_OFFSITE_BACKUP:'off'}));cleanup(t,dir);
  assert.match(s.log(),/offsite-backup-opt-out/);assert.doesNotMatch(s.log(),/"event":"offsite-backup-disabled"/);
  const full=await (await fetch(s.base+'/healthz',detail)).json();
  assert.equal(full.offsiteBackup.optOut,true);assert.equal(full.offsiteBackup.warning,false);assert.equal(full.offsiteBackup.enabled,false);
  await sleep(500);
  assert.equal(hook.received.filter(m=>/offsite-backup-disabled/.test(m.text||'')).length,0);
});
