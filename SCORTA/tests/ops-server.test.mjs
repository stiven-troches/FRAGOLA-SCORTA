import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync,existsSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {latencyWindow,deployedVersion} from '../server.mjs';

const script=fileURLToPath(new URL('../server.mjs',import.meta.url));
const clean=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^(SCORTA_|RENDER_|NODE_ENV$|NODE_TEST_CONTEXT$|PORT$|HOST$|DATA_DIR$)/.test(k)));
async function start(t,env){
  const child=spawn(process.execPath,[script],{env:{...clean,PORT:'0',HOST:'127.0.0.1',...env},stdio:['ignore','pipe','pipe']});
  let out='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>out+=d);
  const stop=()=>new Promise(r=>{if(child.exitCode!==null||child.signalCode!==null)return r();child.once('exit',r);child.kill();});
  t.after(stop);
  const deadline=Date.now()+15000;
  while(!/listo en http:\/\/localhost:(\d+)/.test(out)){if(child.exitCode!==null||Date.now()>deadline)throw Error('El servidor no arrancó:\n'+out);await new Promise(r=>setTimeout(r,50));}
  return {pid:child.pid,base:'http://127.0.0.1:'+out.match(/localhost:(\d+)/)[1],log:()=>out,stop};
}

test('BE-11: ventana p95 y versión desplegada',()=>{
  const w=latencyWindow(500);assert.equal(w.p95(),null);for(let i=1;i<=600;i++)w.add(i);assert.equal(w.p95(),575);
  assert.equal(deployedVersion({RENDER_GIT_COMMIT:'abc',SCORTA_VERSION:'v'}),'abc');assert.equal(deployedVersion({SCORTA_VERSION:'v'}),'v');assert.equal(deployedVersion({}),'dev');
});

test('arranque real: /healthz ampliado, respaldo al arrancar, aviso SEG-04 y modo mantenimiento',{timeout:60000},async t=>{
  const dir=mkdtempSync(join(tmpdir(),'scorta-ops-server-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const env={DATA_DIR:dir,SCORTA_OWNER_PASSWORD:'OwnerPlatformFixture123456!',SCORTA_VERSION:'ops-test',SCORTA_LOG_IP_HEADERS:'1',SCORTA_HEALTH_TOKEN:'token-de-salud-0123456789'};
  const detail={headers:{authorization:'Bearer token-de-salud-0123456789'}};
  let s=await start(t,env);
  assert.equal(existsSync(join(dir,'backups')),false,'primer arranque: no hay base que respaldar');
  await fetch(s.base+'/api/v2/session',{headers:{'cf-connecting-ip':'203.0.113.4',cookie:'scorta_platform=secreto'}});
  // Público: solo estado y versión; el detalle exige el token.
  const pub=await (await fetch(s.base+'/healthz')).json();assert.deepEqual(Object.keys(pub).sort(),['ok','startedAt','version','warning']);
  assert.equal((await (await fetch(s.base+'/healthz',{headers:{authorization:'Bearer otro'}})).json()).db,undefined);
  let h=await (await fetch(s.base+'/healthz',detail)).json();
  assert.equal(h.ok,true);assert.equal(h.version,'ops-test');assert.ok(Date.parse(h.startedAt));
  assert.ok(h.db.sizeBytes>0&&h.db.stateBytes>0);assert.equal(typeof h.warning,'boolean');assert.ok(h.disk&&'usedPct' in h.disk);
  assert.equal(typeof h.latencyP95Ms,'number');assert.deepEqual(h.lastBackup,{at:null,ok:null});
  assert.match(s.log(),/offsite-backup-disabled/);assert.match(s.log(),/"cf-connecting-ip":"203.0.113.4"/);assert.ok(!s.log().includes('secreto'));
  await s.stop();
  s=await start(t,env);
  assert.match(s.log(),/borra SCORTA_OWNER_PASSWORD de Render; ya no se usa/);
  assert.equal(readdirSync(join(dir,'backups')).filter(f=>/^startup-.*\.sqlite$/.test(f)).length,1);
  h=await (await fetch(s.base+'/healthz',detail)).json();assert.equal(h.lastBackup.ok,true);assert.equal(h.lastBackup.kind,'startup');
  await s.stop();
  s=await start(t,{DATA_DIR:dir,SCORTA_MAINTENANCE:'1'});
  const health=await fetch(s.base+'/healthz');assert.equal(health.status,200,'Render no debe marcar fallido el deploy');const hb=await health.json();assert.equal(hb.maintenance,true);assert.equal(hb.ok,false);
  const api=await fetch(s.base+'/api/v2/session');assert.equal(api.status,503);assert.match((await api.json()).error,/mantenimiento/);
  const page=await fetch(s.base+'/');assert.equal(page.status,503);assert.match(await page.text(),/en mantenimiento/);
  const pidFile=join(dir,'platform.sqlite.pid');assert.ok(!existsSync(pidFile)||readFileSync(pidFile,'utf8')!==String(s.pid),'mantenimiento no abre la base');
  assert.equal(readdirSync(join(dir,'backups')).length,1,'mantenimiento no respalda');
});
