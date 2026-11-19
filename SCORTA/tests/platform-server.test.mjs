import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {openPlatformStore,createPlatformHandler,validatePlatformDatabase} from '../platform-server.mjs';
import {savePlatformBackup,restorePlatformBackup} from '../platform-backup.mjs';
const password='OwnerPlatformFixture123456';
const owner={company:'Fragola',username:'Steven',password};

async function fixture(t){const dir=mkdtempSync(join(tmpdir(),'scorta-platform-sqlite-')),file=join(dir,'platform.sqlite');let store=await openPlatformStore(file,{owner});t.after(()=>{try{store.close();}catch{}rmSync(dir,{recursive:true,force:true});});return {dir,file,get store(){return store},reopen:async()=>{store.close();store=await openPlatformStore(file);return store;}};}
async function login(store){const result=await store.request({method:'POST',path:'/api/v2/login',body:{company:'Fragola',username:'Steven',password}});assert.equal(result.status,200);return result.token;}

test('SQLite de plataforma persiste empresas, revoca sesiones al reiniciar y no expone la contraseña',async t=>{
 const f=await fixture(t),token=await login(f.store);
 const created=await f.store.request({method:'POST',path:'/api/v2/action',token,body:{type:'company.create',requestId:'create-fixture',form:{name:'Moto Fixture',startDate:'2026-01-01',endDate:'2030-12-31',monthlyFee:50000,username:'adminfixture',password:'ClientPlatformFixture12345'}}});
 assert.equal(created.status,200);assert.equal(created.body.companies.length,1);
 assert.ok(!JSON.stringify(f.store.readPrivate()).includes(password));
 assert.ok(!JSON.stringify(created.body).includes('digest'));
 await f.reopen();
 const old=await f.store.request({method:'GET',path:'/api/v2/data',token});assert.equal(old.status,401);
 const nextToken=await login(f.store),data=await f.store.request({method:'GET',path:'/api/v2/data',token:nextToken});assert.equal(data.body.companies[0].name,'Moto Fixture');
});

test('respaldo de plataforma es consistente y restauración exige cierre, conserva anterior y elimina sesiones',async t=>{
 const f=await fixture(t),token=await login(f.store),backup=await savePlatformBackup(f.file,join(f.dir,'backups'));
 assert.ok(existsSync(backup));assert.equal(validatePlatformDatabase(backup).schemaVersion,1);
 assert.throws(()=>restorePlatformBackup(backup,f.file),/offline/);
 assert.throws(()=>restorePlatformBackup(backup,f.file,{offline:true}),/abierta/);
 f.store.close();const restored=restorePlatformBackup(backup,f.file,{offline:true});assert.ok(existsSync(restored.previous));
 const state=validatePlatformDatabase(f.file);assert.deepEqual(state.sessions,{});
 // The backup is a SQLite file rather than a browser-only JSON export.
 assert.equal(readFileSync(backup).subarray(0,15).toString(),'SQLite format 3');
});

test('HTTP v2 verifica origen/formato, emite cookie segura y permite cerrar una sesión caducada',async t=>{
 const f=await fixture(t),handler=createPlatformHandler({store:f.store,production:true,publicUrl:'https://scorta.example'});
 const server=createServer(async(req,res)=>{if(!await handler(req,res)){res.statusCode=404;res.end();}});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const request=(path,body,headers={})=>fetch(base+path,{method:body?'POST':'GET',headers:{Origin:'https://scorta.example','Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined});
 const invalid=await request('/api/v2/login',owner,{Origin:'https://evil.example'});assert.equal(invalid.status,403);
 const format=await request('/api/v2/login',owner,{'Content-Type':'text/plain'});assert.equal(format.status,415);
 const signed=await request('/api/v2/login',owner);assert.equal(signed.status,200);const cookie=signed.headers.get('set-cookie');for(const marker of ['HttpOnly','SameSite=Strict','Secure'])assert.ok(cookie.includes(marker));
 const session=await request('/api/v2/data',undefined,{Cookie:cookie.split(';')[0]});assert.equal(session.status,200);assert.equal((await session.json()).session.role,'owner');
 const out=await request('/api/v2/logout',{}, {Cookie:cookie.split(';')[0]});assert.equal(out.status,200);assert.match(out.headers.get('set-cookie'),/Max-Age=0/);
 const ended=await request('/api/v2/data',undefined,{Cookie:cookie.split(';')[0]});assert.equal(ended.status,401);
});
