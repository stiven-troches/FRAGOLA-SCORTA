// SEG-10: hallazgos de la revisión interna de seguridad (2026-11-25): tope por origen en /media,
// caché y 304 sin leer el archivo, verificación en disco sin repetir el sha256, subidas a R2 fuera
// de la cola de escrituras, búsqueda de productos con URL /media y alertas por empresa/cuenta real.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,utimesSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {createMediaStore,pendingMedia} from '../media-store.mjs';
import {isMediaRef} from '../media-ref.mjs';
import {openPlatformStore,createPlatformHandler} from '../platform-server.mjs';
import {createAlerter,securityAlert,scrub} from '../ops/alerts.mjs';

const password='Seg10Fixture!2026',owner={company:'Fragola',username:'Steven',password};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const png=(n=64)=>Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),randomBytes(n)]);
const dataUrl=bytes=>'data:image/png;base64,'+bytes.toString('base64');
const quiet=t=>{const error=console.error;console.error=()=>{};t.after(()=>{console.error=error;});};
const temp=t=>{const dir=mkdtempSync(join(tmpdir(),'scorta-seg10-')),closers=[];t.after(async()=>{for(const fn of closers.reverse()){try{await fn();}catch{}}rmSync(dir,{recursive:true,force:true});});return {dir,closeLater:fn=>closers.push(fn)};};
// Solicitud y respuesta mínimas para llamar al manejador sin abrir un puerto.
function call(handler,path,{ip='198.51.100.7',headers={}}={}){
  const req={url:path,method:'GET',headers,socket:{remoteAddress:ip}},res={statusCode:200,headers:{},body:null,
    setHeader(k,v){this.headers[k.toLowerCase()]=v;},writeHead(status,h={}){this.statusCode=status;for(const [k,v]of Object.entries(h))this.setHeader(k,v);},end(body){this.body=body??null;}};
  return handler(req,res).then(()=>res);
}

test('SEG-10: /media tiene el mismo tope por origen que el catálogo (600/min, 429 + Retry-After)',async()=>{
  let now=Date.UTC(2026,10,25,12);
  const handler=createPlatformHandler({store:null,clock:()=>now}),path='/media/empresa-a/'+'a'.repeat(64)+'.png';
  for(let i=0;i<600;i++)assert.equal((await call(handler,path)).statusCode,404);
  const limited=await call(handler,path);
  assert.equal(limited.statusCode,429);assert.equal(limited.headers['retry-after'],'60');assert.match(String(limited.body),/RATE_LIMITED/);
  assert.equal((await call(handler,path,{ip:'198.51.100.8'})).statusCode,404,'otro origen no se ve afectado');
  now+=60000;assert.equal((await call(handler,path)).statusCode,404,'la ventana se renueva');
});

test('SEG-10: un If-None-Match coincidente responde 304 sin leer la imagen; caché pública de 1 h y privada revalidable',async()=>{
  const bytes=png(),ref={mediaId:sha(bytes)+'.png',companyId:'empresa-a',type:'image/png',bytes:bytes.length},reads=[];
  const media={get:async r=>{reads.push(r);return bytes;}};
  for(const [isPublic,cache] of [[true,'public, max-age=3600'],[false,'private, no-cache']]){
    reads.length=0;
    const handler=createPlatformHandler({store:{request:async()=>({status:200,body:{media:ref,public:isPublic}})},media}),path='/media/empresa-a/'+ref.mediaId;
    const first=await call(handler,path);
    assert.equal(first.statusCode,200);assert.equal(first.headers['cache-control'],cache);assert.deepEqual(first.body,bytes);assert.equal(reads.length,1);
    const again=await call(handler,path,{headers:{'if-none-match':first.headers.etag}});
    assert.equal(again.statusCode,304);assert.equal(again.headers['cache-control'],cache);assert.equal(reads.length,1,'el 304 no lee el archivo ni R2');
  }
});

test('SEG-10: en disco la huella se verifica una vez por archivo; un cambio de tamaño o fecha se vuelve a verificar',async t=>{
  quiet(t);const {dir}=temp(t),media=createMediaStore({dir:join(dir,'media')}),bytes=png(300),ref=await media.put('empresa-a',bytes,'image/png');
  assert.deepEqual(await media.get(ref),bytes);assert.deepEqual(await media.get(ref),bytes);
  const file=join(dir,'media','empresa-a',ref.mediaId),forged=png(300),{mtime}=statSync(file);
  writeFileSync(file,forged);utimesSync(file,mtime,new Date(mtime.getTime()+5000));
  assert.equal(await media.get(ref),null,'mismo tamaño, otra fecha: se recalcula y se rechaza');
  writeFileSync(file,bytes);assert.deepEqual(await media.get(ref),bytes);
});

test('SEG-10: la subida a R2 usa un tiempo de espera corto configurable',async()=>{
  const hang=(url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason)));
  const s3={endpoint:'https://cuenta.r2.example',bucket:'b',region:'auto',accessKeyId:'a',secretAccessKey:'s',prefix:''};
  const media=createMediaStore({dir:join(tmpdir(),'scorta-seg10-sin-uso'),s3,fetchImpl:hang,uploadTimeoutMs:50}),started=Date.now();
  await assert.rejects(media.put('empresa-a',png(),'image/png'),/timeout|aborted/i);
  assert.ok(Date.now()-started<5000);
});

test('SEG-10: una escritura solo sube sus imágenes; si falla conserva el data URL y las pendientes se reintentan en segundo plano',async t=>{
  quiet(t);const {dir,closeLater}=temp(t),file=join(dir,'platform.sqlite');
  let store=await openPlatformStore(file,{owner});
  const ownerToken=(await store.request({method:'POST',path:'/api/v2/login',body:owner})).token;let n=0;
  const action=(token,body)=>store.request({method:'POST',path:'/api/v2/action',body:{requestId:'seg10-'+ ++n,...body},token});
  for(const name of ['Tienda Uno','Tienda Dos'])assert.equal((await action(ownerToken,{type:'company.create',form:{name,username:'admin',password,startDate:'2026-01-01',endDate:'2099-12-31',logo:dataUrl(png(80))}})).status,200);
  const [companyA,companyB]=['Tienda Uno','Tienda Dos'].map(name=>store.readPrivate().companies.find(c=>c.name===name));
  const adminA=(await store.request({method:'POST',path:'/api/v2/login',body:{company:companyA.slug,username:'admin',password}})).token;
  store.close();
  // Almacén que falla a voluntad y registra para qué empresa se intentó cada subida.
  const real=createMediaStore({dir:join(dir,'media')}),calls=[];let failing=true;
  const media={kind:'test',get:real.get,removeCompany:real.removeCompany,async putDataUrl(companyId,value){calls.push(companyId);if(failing)throw Error('R2 no responde');return real.putDataUrl(companyId,value);}};
  store=await openPlatformStore(file,{media,mediaRetryMs:1500});closeLater(()=>store.close());
  assert.equal(pendingMedia(store.readPrivate()).size,2,'los logos quedaron pendientes al arrancar');
  calls.length=0;
  const product=photo=>action(adminA,{type:'business.change',payload:{kind:'producto',form:{nombre:'Foto '+ ++n,stock:1,precio_venta:1000,foto:dataUrl(photo)}}});
  let r=await product(png(90));assert.equal(r.status,200,'la escritura no falla aunque R2 no responda');
  assert.deepEqual(calls,[companyA.id],'solo la imagen de esta escritura');
  const kept=store.readPrivate().businesses[companyA.id].prods.at(-1);assert.match(kept.foto,/^data:image\/png;base64,/);
  failing=false;calls.length=0;
  r=await product(png(95));assert.equal(r.status,200);
  assert.deepEqual(calls,[companyA.id],'ni el logo de la otra empresa ni la foto que falló antes');
  assert.ok(isMediaRef(store.readPrivate().businesses[companyA.id].prods.at(-1).foto));
  // En segundo plano (fuera de la cola de escrituras) se mueven las pendientes de todas las empresas.
  const deadline=Date.now()+8000;while(pendingMedia(store.readPrivate()).size&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
  const state=store.readPrivate();
  assert.equal(pendingMedia(state).size,0);
  assert.ok(isMediaRef(state.companies.find(c=>c.id===companyB.id).logo));
  assert.ok(isMediaRef(state.businesses[companyA.id].prods.find(p=>p.id===kept.id).foto));
});

test('SEG-10: la búsqueda de productos devuelve la URL /media de la foto, no la referencia interna',async t=>{
  quiet(t);const {dir,closeLater}=temp(t),media=createMediaStore({dir:join(dir,'media')});
  const store=await openPlatformStore(join(dir,'platform.sqlite'),{owner,media});closeLater(()=>store.close());
  const ownerToken=(await store.request({method:'POST',path:'/api/v2/login',body:owner})).token;
  assert.equal((await store.request({method:'POST',path:'/api/v2/action',body:{requestId:'c1',type:'company.create',form:{name:'Tienda Uno',username:'admin',password,startDate:'2026-01-01',endDate:'2099-12-31'}},token:ownerToken})).status,200);
  const company=store.readPrivate().companies.find(c=>c.name==='Tienda Uno');
  const admin=(await store.request({method:'POST',path:'/api/v2/login',body:{company:company.slug,username:'admin',password}})).token;
  const photo=png(120);
  assert.equal((await store.request({method:'POST',path:'/api/v2/action',body:{requestId:'p1',type:'business.change',payload:{kind:'producto',form:{nombre:'Casco rojo',stock:2,precio_venta:90000,foto:dataUrl(photo)}}},token:admin})).status,200);
  const found=await store.request({method:'GET',path:'/api/v2/search/products?q=casco',token:admin});
  assert.equal(found.status,200,JSON.stringify(found.body));
  const [item]=found.body.items;assert.equal(item.foto,'/media/'+company.id+'/'+sha(photo)+'.png');assert.equal(item.hasPhoto,undefined);
});

test('SEG-10: alertas por tipo y empresa/cuenta real con tope total; un señuelo no silencia otra cuenta',async()=>{
  let now=Date.UTC(2026,10,25,12);const sent=[],mailer={enabled:true,async send(message){sent.push(message);}};
  const alerter=createAlerter({mailer,to:'dueno@example.com',clock:()=>now});
  const decoy=securityAlert({tipo:'login_failures',companyId:null,empresa:'Visita www.estafa.co',empresaInexistente:true,usuario:'x',usuarioInexistente:true,intentos:5});
  const real=securityAlert({tipo:'login_failures',companyId:'c1',empresa:'Moto Real',usuario:'Admin',intentos:5});
  assert.equal(await alerter.notify(decoy.type,decoy),'sent');
  assert.equal(await alerter.notify(real.type,real),'sent','el señuelo no silencia el ataque real');
  assert.equal(await alerter.notify(real.type,real),'throttled');
  const otherDecoy=securityAlert({tipo:'login_failures',empresa:'Otra falsa',empresaInexistente:true,usuario:'y',usuarioInexistente:true,intentos:5});
  assert.equal(await alerter.notify(otherDecoy.type,otherDecoy),'throttled','todas las empresas inexistentes comparten un correo por hora');
  const text=sent[0].text;assert.match(text,/Empresa: \(empresa inexistente\)/);assert.match(text,/Usuario: \(usuario inexistente\)/);assert.doesNotMatch(text,/estafa/);
  assert.match(sent[1].text,/Empresa: Moto Real/);assert.doesNotMatch(sent[1].text,/c1\b/);
  // Tope total: como máximo 10 correos por hora entre todas las alertas.
  for(let i=0;i<8;i++)assert.equal(await alerter.notify('security:login_failures',{subject:'x',key:'empresa-'+i}),'sent');
  assert.equal(await alerter.notify('capacity-warning',{subject:'Capacidad'}),'throttled');
  now+=60*60*1000;assert.equal(await alerter.notify('capacity-warning',{subject:'Capacidad'}),'sent');
});

test('SEG-10: scrub quita dominios sueltos además de las URL con esquema',()=>{
  assert.equal(scrub('Visita www.estafa.co ya'),'Visita [url] ya');
  assert.equal(scrub('entra a pago-seguro.com/login?x=1 hoy'),'entra a [url] hoy');
  assert.equal(scrub('Moto Real S.A.S'),'Moto Real S.A.S');
  assert.equal(scrub('error en platform.sqlite y platform.mjs'),'error en platform.sqlite y platform.mjs');
  assert.equal(scrub('fecha 2026-11-25T12:00:00.000Z'),'fecha 2026-11-25T12:00:00.000Z');
});

test('SEG-10: el evento de ingresos fallidos marca la empresa inexistente y la alerta no copia su texto',async t=>{
  const {dir,closeLater}=temp(t),received=[];
  const store=await openPlatformStore(join(dir,'platform.sqlite'),{owner,onSecurityEvents:events=>received.push(...events)});closeLater(()=>store.close());
  for(let i=0;i<5;i++)assert.equal((await store.request({method:'POST',path:'/api/v2/login',body:{company:'Gana premios en premio.co',username:'admin',password:'incorrecta'},clientKey:'origen-'+i})).status,401);
  assert.equal(received.length,1);assert.equal(received[0].empresaInexistente,true);assert.equal(received[0].usuarioInexistente,true);
  const alert=securityAlert(received[0]),text=alert.lines.join('\n');
  assert.match(text,/Empresa: \(empresa inexistente\)/);assert.doesNotMatch(text,/premio/);
});
