import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync,writeFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
import {openPlatformStore,createPlatformHandler,clientAddressFrom,ipHeaderDiagnostics,validatePlatformDatabase} from '../platform-server.mjs';
import {savePlatformBackup,restorePlatformBackup,startupBackup} from '../platform-backup.mjs';

const password='OwnerPlatformFixture123456!',owner={company:'Fragola',username:'Steven',password};
async function fixture(t){const dir=mkdtempSync(join(tmpdir(),'scorta-ops-platform-')),file=join(dir,'platform.sqlite'),store=await openPlatformStore(file,{owner});t.after(()=>{try{store.close();}catch{}rmSync(dir,{recursive:true,force:true});});return {dir,file,store};}
const login=async store=>(await store.request({method:'POST',path:'/api/v2/login',body:{company:'Fragola',username:'Steven',password}})).token;
const req=(headers,remoteAddress='10.0.0.9')=>({headers,socket:{remoteAddress},url:'/api/v2/session'});

test('SEG-02: x-forwarded-for usa la entrada del proxy de confianza contando desde la derecha',()=>{
  const h={'x-forwarded-for':'1.1.1.1, 203.0.113.7, 198.51.100.2'};
  assert.equal(clientAddressFrom(req(h),'x-forwarded-for'),'198.51.100.2');
  assert.equal(clientAddressFrom(req(h),'x-forwarded-for',2),'203.0.113.7');
  assert.equal(clientAddressFrom(req(h),'x-forwarded-for',9),'1.1.1.1');
  assert.equal(clientAddressFrom(req({'cf-connecting-ip':' 203.0.113.50 '}),'cf-connecting-ip'),'203.0.113.50');
  assert.equal(clientAddressFrom(req({}),'cf-connecting-ip'),'10.0.0.9');
  assert.equal(clientAddressFrom(req(h),null),'10.0.0.9');
  assert.equal(clientAddressFrom(req({'true-client-ip':'x'.repeat(101)}),'true-client-ip'),'10.0.0.9');
});

test('SEG-02: el handler aplica SCORTA_TRUSTED_PROXY_HOPS y pasa requireTerms; el diagnóstico no incluye cookies',async t=>{
  const seen=[];const store={request:async(payload,options)=>{seen.push({ip:payload.clientKey,options});return {status:200,body:{ok:true}};}};
  const handler=createPlatformHandler({store,clientIpHeader:'X-Forwarded-For',trustedProxyHops:2,requireTerms:true});
  const server=createServer((q,s)=>handler(q,s));server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
  await fetch('http://127.0.0.1:'+server.address().port+'/api/v2/session',{headers:{'x-forwarded-for':'6.6.6.6, 203.0.113.7, 10.1.1.1'}});
  assert.equal(seen[0].ip,'203.0.113.7');assert.equal(seen[0].options.requireTerms,true);
  const plain=createPlatformHandler({store});const s2=createServer((q,s)=>plain(q,s));s2.listen(0,'127.0.0.1');await once(s2,'listening');t.after(()=>s2.close());
  await fetch('http://127.0.0.1:'+s2.address().port+'/api/v2/session',{headers:{'x-forwarded-for':'6.6.6.6'}});
  assert.equal(seen[1].ip,'127.0.0.1');assert.equal(Object.hasOwn(seen[1].options,'requireTerms'),false);
  const line=ipHeaderDiagnostics({url:'/api/v2/receipt/'+'a'.repeat(43)+'?x=1',socket:{remoteAddress:'10.0.0.1'},headers:{cookie:'scorta_platform=secreto','cf-connecting-ip':'203.0.113.9','x-forwarded-for':'1.2.3.4',authorization:'Bearer x'}});
  assert.equal(line.headers['cf-connecting-ip'],'203.0.113.9');assert.equal(line.path,'/api/v2/receipt/[token]');
  assert.ok(!JSON.stringify(line).includes('secreto'));assert.ok(!JSON.stringify(line).includes('Bearer'));
});

test('BE-10: las lecturas no esperan la cola de escritura y reutilizan el estado parseado por storage_version',async t=>{
  const f=await fixture(t),token=await login(f.store);
  const original=JSON.parse;let parses=0;JSON.parse=function(text,...rest){if(typeof text==='string'&&text.includes('"schemaVersion"'))parses++;return original.call(this,text,...rest);};
  try{
    await f.store.request({method:'GET',path:'/api/v2/data',token});parses=0;
    for(let i=0;i<5;i++)assert.equal((await f.store.request({method:'GET',path:'/api/v2/session',token})).status,200);
    assert.equal(parses,0,'sin JSON.parse si la versión no cambió');
    const created=await f.store.request({method:'POST',path:'/api/v2/action',token,body:{type:'company.create',requestId:'be10-a',form:{name:'Moto BE10',startDate:'2026-01-01',endDate:'2030-12-31',monthlyFee:1,username:'adminbe10',password:'ClientPlatformFixture12345!'}}});
    assert.equal(created.status,200);
    const after=await f.store.request({method:'GET',path:'/api/v2/data',token});assert.equal(after.body.companies.length,1);
    assert.equal(parses,0,'la escritura actualiza la caché sin volver a parsear');
  }finally{JSON.parse=original;}
  // Writes are queued (scrypt logins are slow); a read issued after them finishes first.
  const order=[];const logins=[1,2,3].map(i=>f.store.request({method:'POST',path:'/api/v2/login',body:{company:'Fragola',username:'Steven',password}}).then(r=>{order.push('login'+i);return r;}));
  const read=f.store.request({method:'GET',path:'/api/v2/data',token}).then(r=>{order.push('read');return r;});
  await Promise.all([...logins,read]);assert.ok(order.indexOf('read')<order.indexOf('login3'),order.join(','));
  // Concurrent writes mixed with reads stay consistent.
  const ops=[];for(let i=0;i<4;i++){ops.push(f.store.request({method:'POST',path:'/api/v2/action',token,body:{type:'company.create',requestId:'be10-c'+i,form:{name:'Moto C'+i,startDate:'2026-01-01',endDate:'2030-12-31',monthlyFee:1,username:'adminc'+i,password:'ClientPlatformFixture12345!'}}}));ops.push(f.store.request({method:'GET',path:'/api/v2/data',token}));}
  const results=await Promise.all(ops);assert.ok(results.every(r=>r.status===200),JSON.stringify(results.map(r=>r.status)));
  const final=await f.store.request({method:'GET',path:'/api/v2/data',token});
  assert.equal(final.body.companies.length,5);assert.deepEqual(final.body.companies.map(c=>c.id).sort(),f.store.readPrivate().companies.map(c=>c.id).sort());
});

test('BE-11: stats entrega tamaño de base y del estado',async t=>{
  const f=await fixture(t),s=f.store.stats();
  assert.ok(s.sizeBytes>0);assert.ok(s.stateBytes>100);assert.equal(s.stateBytes,Buffer.byteLength(JSON.stringify(f.store.readPrivate())));
});

test('BE-02: respaldo de arranque consistente y conserva los 5 últimos; sin base lo omite',async t=>{
  const f=await fixture(t),dir=join(f.dir,'backups');
  assert.equal(await startupBackup(join(f.dir,'nada.sqlite'),dir),null);assert.equal(existsSync(dir),false);
  const files=[];for(let i=0;i<7;i++)files.push(await startupBackup(f.file,dir,{now:new Date(Date.UTC(2026,10,21,0,0,i))}));
  const kept=readdirSync(dir).sort();assert.equal(kept.length,5);assert.equal(kept[0],'startup-2026-11-21T00-00-02.000Z.sqlite');
  assert.equal(validatePlatformDatabase(files.at(-1)).schemaVersion,1);
});

test('BE-03: restaurar vacía sesiones y ventas pendientes y borra -wal/-shm vacíos',async t=>{
  const f=await fixture(t);await login(f.store);f.store.close();
  const db=new DatabaseSync(f.file);const state=JSON.parse(db.prepare('SELECT data FROM platform WHERE id=1').get().data);state.saleDrafts={'["c","u"]':{version:3,draft:{items:[1]}}};db.prepare('UPDATE platform SET data=? WHERE id=1').run(JSON.stringify(state));db.close();
  const backup=await savePlatformBackup(f.file,join(f.dir,'backups'));
  writeFileSync(f.file+'-wal','');writeFileSync(f.file+'-shm','');
  restorePlatformBackup(backup,f.file,{offline:true});
  assert.equal(existsSync(f.file+'-wal'),false);assert.equal(existsSync(f.file+'-shm'),false);
  const restored=validatePlatformDatabase(f.file);assert.deepEqual(restored.sessions,{});assert.deepEqual(restored.saleDrafts,{});
});
