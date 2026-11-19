import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {createPlatform,platformRequest} from '../platform.mjs';
import {openPlatformStore,createPlatformHandler} from '../platform-server.mjs';

const owner={company:'Fragola',username:'Steven',password:'OwnerPersistentFixture2026',email:'OWNER@EXAMPLE.COM'};
const clientPassword='ClientPersistentFixture2026';
const initial=Date.parse('2026-12-01T14:00:00Z');
async function core(){let state=await createPlatform({owner});let token;return {get state(){return state},get token(){return token},async request(method,path,body,now=initial){const r=await platformRequest(state,{method,path,body,token},{now,baseUrl:'https://scorta.example'});state=r.state;if(Object.hasOwn(r,'token'))token=r.token;return r},setToken(value){token=value}}}
async function createClient(f){assert.equal((await f.request('POST','/api/v2/login',owner)).status,200);const r=await f.request('POST','/api/v2/action',{type:'company.create',form:{name:'Empresa persistente',startDate:'2026-01-01',endDate:'2027-12-31',monthlyFee:100000,username:'admin',password:clientPassword,adminEmail:'ADMIN@EXAMPLE.COM'}});assert.equal(r.status,200);return r.body.companies[0]}

test('sesión persistente admite volver otro día y expira a los 30 días, sin contraseña en el token',async()=>{
 const f=await core();await createClient(f);const signed=await f.request('POST','/api/v2/login',{company:'Empresa persistente',username:'admin',password:clientPassword});assert.equal(signed.status,200);
 const token=f.token;assert.match(token,/^[A-Za-z0-9_-]{43}$/);assert.ok(!JSON.stringify(f.state).includes(token));assert.ok(!JSON.stringify(f.state).includes(clientPassword));
 const later=await f.request('GET','/api/v2/session',undefined,initial+29*86400000);assert.equal(later.status,200);assert.equal(later.body.session.company.name,'Empresa persistente');
 const expired=await f.request('GET','/api/v2/session',undefined,initial+30*86400000);assert.equal(expired.status,401);
});

test('recordar acceso nunca evita una suspensión manual o el vencimiento del contrato',async()=>{
 const f=await core();const company=await createClient(f);const ownerToken=f.token;
 f.setToken(null);await f.request('POST','/api/v2/login',{company:company.name,username:'admin',password:clientPassword});const clientToken=f.token;
 f.setToken(ownerToken);await f.request('POST','/api/v2/action',{type:'company.access',companyId:company.id,form:{enabled:false}});
 f.setToken(clientToken);let r=await f.request('GET','/api/v2/session');assert.equal(r.status,403);assert.equal(r.body.code,'COMPANY_DISABLED');
 f.setToken(ownerToken);await f.request('POST','/api/v2/action',{type:'company.access',companyId:company.id,form:{enabled:true}});await f.request('POST','/api/v2/action',{type:'company.update',companyId:company.id,form:{endDate:'2026-12-01'}});
 f.setToken(clientToken);r=await f.request('GET','/api/v2/session',undefined,Date.parse('2026-12-02T05:00:00Z'));assert.equal(r.status,403);assert.equal(r.body.code,'CONTRACT_EXPIRED');
});

test('SQLite conserva la sesión al reiniciar y la cookie real dura 30 días con protección HttpOnly',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'scorta-remember-')),file=join(dir,'platform.sqlite');let store=await openPlatformStore(file,{owner});t.after(()=>{try{store.close()}catch{}rmSync(dir,{recursive:true,force:true})});
 async function http(method,path,body,cookie){const req=Readable.from(body?[JSON.stringify(body)]:[]);Object.assign(req,{method,url:path,headers:{host:'scorta.example',origin:'https://scorta.example','content-type':'application/json',...(cookie?{cookie}:{})},socket:{remoteAddress:'127.0.0.1'}});const res={headers:{},setHeader(key,value){this.headers[key.toLowerCase()]=value},writeHead(status,headers){this.status=status;for(const [k,v]of Object.entries(headers||{}))this.setHeader(k,v)},end(value){this.body=JSON.parse(value)}};assert.equal(await createPlatformHandler({store,production:true,publicUrl:'https://scorta.example'})(req,res),true);return res}
 const signed=await http('POST','/api/v2/login',owner);assert.equal(signed.status,200);const cookie=signed.headers['set-cookie'];for(const marker of ['HttpOnly','Secure','SameSite=Strict','Max-Age=2592000'])assert.ok(cookie.includes(marker),marker);
 store.close();store=await openPlatformStore(file);const remembered=await http('GET','/api/v2/session',undefined,cookie.split(';')[0]);assert.equal(remembered.status,200);assert.equal(remembered.body.session.role,'owner');
 const out=await http('POST','/api/v2/logout',{},cookie.split(';')[0]);assert.equal(out.status,200);assert.ok(out.headers['set-cookie'].includes('Max-Age=0'));assert.equal((await http('GET','/api/v2/session',undefined,cookie.split(';')[0])).status,401);
});

test('correo de recuperación se guarda por usuario sin declarar verificación ni enviar mensajes',async()=>{
 const f=await core();const company=await createClient(f);let r=await f.request('GET','/api/v2/data');const user=r.body.users.find(u=>u.companyId===company.id);assert.equal(user.email,'admin@example.com');assert.equal(user.emailVerified,false);
 r=await f.request('POST','/api/v2/action',{type:'user.update',userId:user.id,form:{email:'NUEVO@EXAMPLE.COM',emailVerified:true}});assert.equal(r.status,200);assert.equal(r.body.users.find(u=>u.id===user.id).email,'nuevo@example.com');assert.equal(r.body.users.find(u=>u.id===user.id).emailVerified,false);
 const before=structuredClone(f.state);r=await f.request('POST','/api/v2/action',{type:'user.update',userId:user.id,form:{email:'no-es-correo'}});assert.equal(r.status,400);assert.deepEqual(f.state,before);
});
