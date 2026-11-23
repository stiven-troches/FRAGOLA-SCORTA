import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {fileURLToPath} from 'node:url';
import {CONTENT_TYPES,staticCacheControl} from '../server.mjs';

const script=fileURLToPath(new URL('../server.mjs',import.meta.url)),dist=fileURLToPath(new URL('../dist/',import.meta.url));
const clean=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^(SCORTA_|RENDER_|NODE_ENV$|NODE_TEST_CONTEXT$|PORT$|HOST$|DATA_DIR$)/.test(k)));
const freePort=()=>new Promise((resolve,reject)=>{const s=createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const {port}=s.address();s.close(()=>resolve(port))})});
const password='Servidor.Real.Fixture.2026';

test('servidor: tipos de contenido y caché estática',()=>{
  assert.equal(CONTENT_TYPES['.webmanifest'],'application/manifest+json');
  for(const ext of ['.webp','.png','.svg','.ico','.json','.woff2'])assert.ok(CONTENT_TYPES[ext],ext);
  assert.equal(staticCacheControl('/assets/main-abc.js'),'public, max-age=31536000, immutable');
  assert.equal(staticCacheControl('/sw.js'),'no-cache');assert.equal(staticCacheControl('/'),'no-cache');
});

test('INT-10: servidor real en producción — ingreso, empresa, términos y venta con consentimiento',{timeout:90000},async t=>{
  const dir=mkdtempSync(join(tmpdir(),'scorta-int-server-'));
  const port=await freePort(),base='http://127.0.0.1:'+port;
  const child=spawn(process.execPath,[script],{env:{...clean,NODE_ENV:'production',PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir,SCORTA_PUBLIC_URL:base,SCORTA_OWNER_PASSWORD:password},stdio:['ignore','pipe','pipe']});
  let out='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>out+=d);
  // Hooks run in order: stop the server first, then remove its data directory.
  t.after(()=>new Promise(r=>{if(child.exitCode!==null||child.signalCode!==null)return r();child.once('exit',r);child.kill()}));
  t.after(()=>rmSync(dir,{recursive:true,force:true,maxRetries:5}));
  const deadline=Date.now()+20000;while(!/listo en http/.test(out)){if(child.exitCode!==null||Date.now()>deadline)throw Error('El servidor no arrancó:\n'+out);await new Promise(r=>setTimeout(r,50))}
  const jars={},contexts={};
  const call=async(actor,method,path,body)=>{
    const response=await fetch(base+path,{method,headers:{...(jars[actor]?{cookie:jars[actor]}:{}),...(body?{'Content-Type':'application/json',Origin:base}:{}),...(Object.hasOwn(contexts,actor)?{'X-SCORTA-Company':contexts[actor]??'@owner'}:{})},body:body?JSON.stringify(body):undefined});
    const cookie=response.headers.get('set-cookie');if(cookie)jars[actor]=cookie.split(';')[0];
    const json=await response.json();if(json?.session)contexts[actor]=json.session.companyId??null;return {status:response.status,body:json,headers:response.headers};
  };
  const act=(actor,action)=>call(actor,'POST','/api/v2/action',{requestId:crypto.randomUUID(),...action});
  let r=await call('owner','POST','/api/v2/login',{company:'Fragola',username:'Steven',password});assert.equal(r.status,200,r.body.error);
  assert.match(r.headers.get('set-cookie'),/HttpOnly; SameSite=Strict; Max-Age=\d+; Secure/);assert.equal(r.headers.get('cache-control'),'no-store');
  r=await act('owner',{type:'company.create',form:{name:'Moto Real',contact:'Ana',whatsapp:'+573001234567',username:'admin',password,startDate:'2026-01-01',endDate:'2030-12-31',monthlyFee:80000}});assert.equal(r.status,200,r.body.error);
  r=await call('admin','POST','/api/v2/login',{company:'Moto Real',username:'admin',password});assert.equal(r.status,200,r.body.error);assert.equal(r.body.session.termsAccepted,false);
  const product={kind:'producto',form:{nombre:'Llanta 90/90',stock:4,precio_compra:60000,precio_venta:95000}};
  r=await act('admin',{type:'business.change',revision:r.body.revision,payload:product});assert.equal(r.status,403);assert.equal(r.body.code,'TERMS_REQUIRED');
  const termsVersion=(await call('admin','GET','/api/v2/session')).body.session.termsVersion;r=await act('admin',{type:'terms.accept',form:{version:termsVersion}});assert.equal(r.status,200,r.body.error);assert.equal(r.body.session.termsAccepted,true);
  r=await act('admin',{type:'business.change',revision:r.body.revision,payload:product});assert.equal(r.status,200,r.body.error);
  const items=[{producto_id:r.body.state.prods[0].id,cantidad:1,precio_unitario:95000}];
  r=await act('admin',{type:'sale.create',form:{cliente:'Carlos',telefono:'3105550000',placa:'QWE12R',paymentMethod:'efectivo'},items,labor:[]});assert.equal(r.status,400);assert.equal(r.body.code,'DATA_CONSENT_REQUIRED');
  r=await act('admin',{type:'sale.create',form:{cliente:'Carlos',telefono:'3105550000',placa:'QWE12R',paymentMethod:'efectivo',dataConsent:true,consentMedium:'verbal'},items,labor:[]});assert.equal(r.status,200,r.body.error);
  const link=r.body.receiptLink;assert.ok(link.url.startsWith(base+'/receipt/'));
  r=await call('public','GET','/api/v2/receipt/'+link.token);assert.equal(r.status,200);assert.equal(r.body.sale.telefono,'******0000');
  // Static files (requires `npm run build`): SPA, landing, cache policy.
  if(existsSync(join(dist,'index.html'))){
    let page=await fetch(base+'/');assert.equal(page.headers.get('cache-control'),'no-cache');assert.match(page.headers.get('content-type'),/text\/html/);
    page=await fetch(base+'/receipt/'+link.token);assert.equal(page.status,200);
    if(existsSync(join(dist,'landing.html'))){page=await fetch(base+'/inicio');assert.equal(page.status,200);assert.match(page.headers.get('content-type'),/text\/html/);assert.notEqual(await page.text(),await (await fetch(base+'/')).text())}
    const asset=readdirSync(join(dist,'assets')).find(name=>name.endsWith('.js'));
    if(asset){page=await fetch(base+'/assets/'+asset);assert.equal(page.status,200);assert.equal(page.headers.get('cache-control'),'public, max-age=31536000, immutable');assert.match(page.headers.get('content-type'),/javascript/)}
  }
  const health=await (await fetch(base+'/healthz')).json();assert.equal(health.ok,true);
});
