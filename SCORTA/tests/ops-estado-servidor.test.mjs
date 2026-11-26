// OPS-19: tarjeta «Estado del servidor» del propietario, servida por una ruta autenticada
// (GET /api/v2/owner/server-status) sin usar ni exponer SCORTA_HEALTH_TOKEN.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {openPlatformStore,createPlatformHandler} from '../platform-server.mjs';
import {compileSSR} from './ssr-build.mjs';

const password='Estado.Servidor.2026!';
const status={ok:true,version:'abc123',startedAt:'2026-11-25T12:00:00.000Z',uptimeSeconds:3720,db:{sizeBytes:2*1048576,stateBytes:512*1024},disk:{usedPct:42.5},latencyP95Ms:37,lastBackup:{at:'2026-11-25T13:00:00.000Z',ok:false,kind:'offsite'},warning:false,backups:{local:{at:'2026-11-25T12:00:00.000Z',ok:true,kind:'startup'},offsite:{at:'2026-11-25T13:00:00.000Z',ok:false},offsiteEnabled:true},alertMail:true};

let ui,cleanup;
before(async()=>{({module:ui,cleanup}=await compileSSR('estado-servidor',{ServerStatusView:'src/OwnerWorkspace.jsx#ServerStatusView',ServerStatus:'src/OwnerWorkspace.jsx#ServerStatus'}))});
after(()=>cleanup?.());

test('estado del servidor: solo el propietario autenticado lo consulta',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'scorta-estado-'));
  const store=await openPlatformStore(join(dir,'platform.sqlite'),{owner:{company:'Fragola',username:'owner',password}});
  let calls=0;
  const handler=createPlatformHandler({store,serverStatus:()=>{calls++;return status;}});
  const server=createServer(async(req,res)=>{if(!await handler(req,res)){res.statusCode=404;res.end('{}')}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));store.close();rmSync(dir,{recursive:true,force:true})});
  const jars={};
  const call=async(actor,method,path,body,headers={})=>{const response=await fetch(origin+path,{method,headers:{...(jars[actor]?{cookie:jars[actor]}:{}),...(body?{'Content-Type':'application/json',Origin:origin}:{}),...headers},body:body?JSON.stringify(body):undefined});const cookie=response.headers.get('set-cookie');if(cookie)jars[actor]=cookie.split(';')[0];return {status:response.status,body:await response.json()};};
  // Sin sesión.
  let r=await call('anon','GET','/api/v2/owner/server-status');assert.equal(r.status,401);assert.equal(r.body.status,undefined);
  // El token de salud no sirve como credencial.
  r=await call('anon','GET','/api/v2/owner/server-status',null,{authorization:'Bearer token-de-salud-0123456789'});assert.equal(r.status,401);
  // Propietario.
  r=await call('owner','POST','/api/v2/login',{company:'Fragola',username:'owner',password});assert.equal(r.status,200,r.body.error);
  r=await call('owner','GET','/api/v2/owner/server-status');assert.equal(r.status,200,r.body.error);assert.deepEqual(r.body.status,status);assert.equal(calls,1);
  assert.equal((await call('owner','POST','/api/v2/owner/server-status',{})).status,405);
  // Administrador de una empresa: prohibido.
  r=await call('owner','POST','/api/v2/action',{requestId:crypto.randomUUID(),type:'company.create',form:{name:'Taller Estado',username:'admin',password,startDate:'2026-01-01',endDate:'2030-12-31',monthlyFee:1}},{'X-SCORTA-Company':'@owner'});assert.equal(r.status,200,r.body.error);
  r=await call('admin','POST','/api/v2/login',{company:'Taller Estado',username:'admin',password});assert.equal(r.status,200,r.body.error);
  r=await call('admin','GET','/api/v2/owner/server-status');assert.equal(r.status,403);assert.equal(r.body.code,'FORBIDDEN');assert.equal(calls,1);
  // Propietario sin la verificación en dos pasos exigida: prohibido.
  const strict=createPlatformHandler({store,serverStatus:()=>status,requireOwnerTwoFactor:true});
  const strictServer=createServer(async(req,res)=>{if(!await strict(req,res)){res.statusCode=404;res.end('{}')}});
  await new Promise(resolve=>strictServer.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>strictServer.close(resolve)));
  const response=await fetch('http://127.0.0.1:'+strictServer.address().port+'/api/v2/owner/server-status',{headers:{cookie:jars.owner}});
  assert.equal(response.status,403);
});

test('estado del servidor: la tarjeta muestra versión, disco, base, latencia y respaldos',()=>{
  const html=renderToStaticMarkup(React.createElement(ui.ServerStatusView,{status}));
  for(const text of ['abc123','1 h 2 min','42.5 %','2.0 MB','512 KB','37 ms','Respaldo local','Correcto','Respaldo externo','Falló','Sin alertas de capacidad','Activas'])assert.ok(html.includes(text),text);
  const warning=renderToStaticMarkup(React.createElement(ui.ServerStatusView,{status:{...status,warning:true,backups:{offsiteEnabled:false}}}));
  assert.match(warning,/Atención: el disco supera el 80 %/);assert.match(warning,/Desactivado/);assert.match(warning,/Sin respaldo en este arranque/);
  const shell=renderToStaticMarkup(React.createElement(ui.ServerStatus));assert.match(shell,/Estado del servidor/);assert.match(shell,/Actualizar|Consultando/);
});

test('estado del servidor: respaldo externo apagado no se confunde con falta de disco',()=>{
  const html=renderToStaticMarkup(React.createElement(ui.ServerStatusView,{status:{...status,warning:true,capacityWarning:false,offsiteBackup:{enabled:false,warning:true,missing:['SCORTA_S3_BUCKET']}}}));
  assert.doesNotMatch(html,/el disco supera el 80 %/);assert.match(html,/Sin alertas de capacidad/);
  assert.match(html,/respaldo externo está apagado/);assert.match(html,/SCORTA_S3_BUCKET/);
});
