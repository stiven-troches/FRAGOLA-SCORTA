// BE-30: fotos y logos fuera de la base: almacén en disco o R2 (S3 falso por fetch inyectado),
// referencias en el estado, ruta /media con reglas por empresa y catálogo, migración y respaldo.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync,readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createHash,randomBytes} from 'node:crypto';
import {createMediaStore,mediaConfig,externalizeMedia,decodeImageDataUrl} from '../media-store.mjs';
import {isMediaRef,mediaUrl,clientImage,imageWeight} from '../media-ref.mjs';
import {openPlatformStore,createPlatformHandler} from '../platform-server.mjs';
import {signV4,syncMediaOffsite,decryptMediaFolder,decryptBackup,runOffsiteBackup,mediaObjectKey,MEDIA_REFRESH_MS} from '../ops/offsite-backup.mjs';

const password='MediaFixture!2026',owner={company:'Fragola',username:'Steven',password};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const png=(n=64)=>Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),randomBytes(n)]);
const jpeg=(n=64)=>Buffer.concat([Buffer.from([255,216,255,224]),randomBytes(n)]);
const dataUrl=(bytes,type='image/png')=>'data:'+type+';base64,'+bytes.toString('base64');
const quiet=t=>{const log=console.log,error=console.error,lines=[];console.log=(...a)=>lines.push(a.join(' '));console.error=(...a)=>lines.push(a.join(' '));t.after(()=>{console.log=log;console.error=error;});return lines;};
// Windows no borra una base abierta: lo registrado con closeLater se cierra antes de borrar la carpeta.
const closers=new WeakMap(),closeLater=(t,fn)=>closers.get(t).push(fn);
const temp=t=>{const dir=mkdtempSync(join(tmpdir(),'scorta-media-')),list=[];closers.set(t,list);t.after(async()=>{for(const fn of list.reverse()){try{await fn();}catch{}}rmSync(dir,{recursive:true,force:true});});return dir;};

// S3 falso: guarda los objetos y rechaza firmas SigV4 que no coinciden (recalculadas aquí).
const creds={accessKeyId:'AKIDMEDIA',secretAccessKey:'media/secret+key'};
function fakeS3(){
  const objects=new Map(),calls=[];
  const fetchImpl=async(url,{method,headers,body})=>{
    const bytes=body?Buffer.from(body):Buffer.alloc(0),u=new URL(url);
    const date=headers['x-amz-date'],parsed=new Date(date.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,'$1-$2-$3T$4:$5:$6Z'));
    const extra=Object.fromEntries(Object.entries(headers).filter(([k])=>!['authorization','x-amz-date','x-amz-content-sha256'].includes(k)));
    const expected=signV4({method,url,headers:extra,payloadHash:sha(bytes),...creds,region:'auto',date:parsed});
    calls.push({method,path:u.pathname,type:headers['content-type']});
    if(headers['x-amz-content-sha256']!==sha(bytes)||headers.authorization!==expected.authorization)return new Response('firma',{status:403});
    if(method==='PUT'){objects.set(u.pathname,bytes);return new Response('',{status:200});}
    if(method==='GET')return objects.has(u.pathname)?new Response(objects.get(u.pathname),{status:200}):new Response('NoSuchKey',{status:404});
    return new Response('',{status:405});
  };
  return {objects,calls,fetchImpl,config:{endpoint:'https://cuenta.r2.example',bucket:'scorta-media',region:'auto',...creds,prefix:'prod'}};
}

test('BE-30: almacén en disco direccionado por contenido, valida tipo y tamaño y entrega los mismos bytes',async t=>{
  const dir=temp(t),media=createMediaStore({dir:join(dir,'media')}),bytes=png(200);
  const ref=await media.put('empresa-a',bytes,'image/png');
  assert.deepEqual(ref,{mediaId:sha(bytes)+'.png',companyId:'empresa-a',type:'image/png',bytes:bytes.length});assert.ok(isMediaRef(ref));
  assert.deepEqual(readFileSync(join(dir,'media','empresa-a',ref.mediaId)),bytes);
  assert.deepEqual(await media.put('empresa-a',bytes,'image/png'),ref,'la misma imagen produce la misma referencia');
  assert.deepEqual(await media.get(ref),bytes);
  assert.equal(await media.get({...ref,mediaId:'0'.repeat(64)+'.png'}),null);
  await assert.rejects(media.put('empresa-a',Buffer.from('GIF89a'+'x'.repeat(20)),'image/gif'),/PNG, JPEG o WebP/);
  await assert.rejects(media.put('empresa-a',png(),'image/jpeg'),/no coincide/);
  await assert.rejects(media.put('empresa-a',png(512001),'image/png'),/500 KB/);
  await assert.rejects(media.put('../otra',bytes,'image/png'),/Empresa inválida/);
  assert.equal(await media.putDataUrl('empresa-a','data:image/gif;base64,R0lGODlh'),null,'GIF heredado no se migra');
  // Un archivo alterado en disco no se entrega.
  writeFileSync(join(dir,'media','empresa-a',ref.mediaId),png());quiet(t);assert.equal(await media.get(ref),null);
  assert.equal(mediaUrl(ref),'/media/empresa-a/'+ref.mediaId);assert.equal(clientImage(ref),mediaUrl(ref));assert.equal(clientImage('data:x'),'data:x');
  assert.equal(imageWeight(dataUrl(bytes)),dataUrl(bytes).length);assert.ok(Math.abs(imageWeight(ref)-dataUrl(bytes).length)<=4);
  assert.deepEqual(decodeImageDataUrl(dataUrl(bytes)),{type:'image/png',bytes});
});

test('BE-30: R2/S3 con fetch inyectado: PUT y GET firmados (SigV4), 404 = inexistente y lectura de respaldo desde disco',async t=>{
  const dir=temp(t),s3=fakeS3(),bytes=jpeg(300);
  const media=createMediaStore({dir:join(dir,'media'),s3:s3.config,fetchImpl:s3.fetchImpl});assert.equal(media.kind,'s3');
  const ref=await media.put('empresa-a',bytes,'image/jpeg');
  assert.deepEqual(s3.calls,[{method:'PUT',path:'/scorta-media/prod/empresa-a/'+ref.mediaId,type:'image/jpeg'}]);
  assert.ok(!existsSync(join(dir,'media','empresa-a')),'con R2 no se escribe en disco');
  const fresh=createMediaStore({dir:join(dir,'media'),s3:s3.config,fetchImpl:s3.fetchImpl});
  assert.deepEqual(await fresh.get(ref),bytes);assert.equal(s3.calls.at(-1).method,'GET');
  const calls=s3.calls.length;assert.deepEqual(await fresh.get(ref),bytes);assert.equal(s3.calls.length,calls,'segunda lectura desde la caché');
  assert.equal(await fresh.get({...ref,mediaId:sha(png())+'.jpg'}),null);
  // Imagen que quedó en disco antes de configurar R2: se sirve y se sube a R2.
  const old=png(80),local=createMediaStore({dir:join(dir,'media')}),oldRef=await local.put('empresa-b',old,'image/png');
  assert.deepEqual(await fresh.get(oldRef),old);assert.ok(s3.objects.has('/scorta-media/prod/empresa-b/'+oldRef.mediaId));
  // Firma incorrecta: error explícito.
  const bad=createMediaStore({dir:join(dir,'otra'),s3:{...s3.config,secretAccessKey:'otra'},fetchImpl:s3.fetchImpl});
  await assert.rejects(bad.put('empresa-a',png(),'image/png'),/S3 respondió 403/);
  assert.deepEqual(mediaConfig({}),{s3:null,missing:[]});
  assert.deepEqual(mediaConfig({SCORTA_MEDIA_S3_BUCKET:'b'}).missing,['SCORTA_MEDIA_S3_ENDPOINT','SCORTA_MEDIA_S3_ACCESS_KEY_ID','SCORTA_MEDIA_S3_SECRET_ACCESS_KEY']);
  const full=mediaConfig({SCORTA_MEDIA_S3_ENDPOINT:'https://x.r2.example',SCORTA_MEDIA_S3_BUCKET:'b',SCORTA_MEDIA_S3_ACCESS_KEY_ID:'a',SCORTA_MEDIA_S3_SECRET_ACCESS_KEY:'s',SCORTA_MEDIA_S3_PREFIX:'/prod/'});
  assert.deepEqual(full.s3,{endpoint:'https://x.r2.example',bucket:'b',region:'auto',accessKeyId:'a',secretAccessKey:'s',prefix:'prod'});
});

async function legacyPlatform(t){
  const dir=temp(t),file=join(dir,'platform.sqlite');
  const images={logoA:png(120),logoB:jpeg(90),photo:png(150),hidden:png(140)};
  let store=await openPlatformStore(file,{owner});
  const call=(path,body,token)=>store.request({method:body===undefined?'GET':'POST',path,body,token});
  const ownerToken=(await call('/api/v2/login',{company:'Fragola',username:'Steven',password})).token;
  let n=0;const action=(token,body)=>call('/api/v2/action',{requestId:'media-'+ ++n,...body},token);
  const a=await action(ownerToken,{type:'company.create',form:{name:'Tienda Uno',username:'admin',password,whatsapp:'3001234567',startDate:'2026-01-01',endDate:'2099-12-31',logo:dataUrl(images.logoA)}});
  assert.equal(a.status,200,JSON.stringify(a.body));
  const b=await action(ownerToken,{type:'company.create',form:{name:'Tienda Dos',username:'admin',password,startDate:'2026-01-01',endDate:'2099-12-31',logo:dataUrl(images.logoB,'image/jpeg')}});
  assert.equal(b.status,200,JSON.stringify(b.body));
  const companyA=b.body.companies.find(c=>c.name==='Tienda Uno'),companyB=b.body.companies.find(c=>c.name==='Tienda Dos');
  const adminA=(await call('/api/v2/login',{company:companyA.slug,username:'admin',password})).token;
  const adminB=(await call('/api/v2/login',{company:companyB.slug,username:'admin',password})).token;
  for(const [nombre,stock,image] of [['Aceite',3,images.photo],['Agotado',0,images.hidden]]){
    const r=await action(adminA,{type:'business.change',payload:{kind:'producto',form:{nombre,stock,precio_venta:35000,precio_compra:15000,foto:dataUrl(image)}}});
    assert.equal(r.status,200,JSON.stringify(r.body));
  }
  const legacy=store.readPrivate();
  assert.match(legacy.companies.find(c=>c.id===companyA.id).logo,/^data:image\/png;base64,/,'sin almacén de medios todo sigue como data URL');
  assert.ok(legacy.businesses[companyA.id].prods.every(p=>p.foto.startsWith('data:')));
  store.close();
  const media=createMediaStore({dir:join(dir,'media')});
  quiet(t);store=await openPlatformStore(file,{media});closeLater(t,()=>{try{store.close();}catch{}});
  return {dir,file,media,images,companyA,companyB,ownerToken,adminA,adminB,get store(){return store;},call:(path,body,token)=>store.request({method:body===undefined?'GET':'POST',path,body,token}),action};
}

test('BE-30: migración al arrancar: data URL heredados pasan al almacén, el estado guarda referencias y es idempotente',async t=>{
  const p=await legacyPlatform(t),state=p.store.readPrivate(),companyA=state.companies.find(c=>c.id===p.companyA.id);
  assert.ok(isMediaRef(companyA.logo));assert.equal(companyA.logo.mediaId,sha(p.images.logoA)+'.png');
  assert.ok(isMediaRef(state.companies.find(c=>c.id===p.companyB.id).logo));
  const [aceite,agotado]=['Aceite','Agotado'].map(name=>state.businesses[p.companyA.id].prods.find(x=>x.nombre===name));
  assert.deepEqual(aceite.foto,{mediaId:sha(p.images.photo)+'.png',companyId:p.companyA.id,type:'image/png',bytes:p.images.photo.length});
  assert.deepEqual(readFileSync(join(p.dir,'media',p.companyA.id,aceite.foto.mediaId)),p.images.photo);
  assert.deepEqual(readFileSync(join(p.dir,'media',p.companyA.id,agotado.foto.mediaId)),p.images.hidden);
  assert.ok(!JSON.stringify(state).includes('base64'),'ningún data URL queda en la base');
  // Segunda pasada / segundo arranque: nada que mover y las referencias no cambian.
  assert.deepEqual(await externalizeMedia(structuredClone(state),p.media),{moved:0,failed:0});
  p.store.close();const again=await openPlatformStore(p.file,{media:p.media});
  try{assert.deepEqual(again.readPrivate().businesses,state.businesses);assert.deepEqual(again.readPrivate().companies,state.companies);}finally{again.close();}
});

test('BE-30: /media sirve los mismos bytes con caché revalidable; otra empresa no accede y el catálogo público solo muestra lo publicado',async t=>{
  const p=await legacyPlatform(t),handler=createPlatformHandler({store:p.store,media:p.media});
  const server=createServer((req,res)=>handler(req,res).then(done=>{if(!done){res.statusCode=404;res.end();}}));server.listen(0,'127.0.0.1');await once(server,'listening');closeLater(t,()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));
  const base='http://127.0.0.1:'+server.address().port,get=(path,token,headers={})=>fetch(base+path,{headers:{...headers,...(token?{cookie:'scorta_platform='+token}:{})}});
  // El navegador recibe URLs /media, nunca la referencia ni el data URL.
  const session=await (await get('/api/v2/session',p.adminA)).json();
  const aceite=session.state.prods.find(x=>x.nombre==='Aceite'),agotado=session.state.prods.find(x=>x.nombre==='Agotado');
  assert.match(aceite.foto,/^\/media\/[^/]+\/[a-f0-9]{64}\.png$/);assert.match(session.session.company.logo,/^\/media\//);
  let r=await get(aceite.foto,p.adminA);
  assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');assert.equal(r.headers.get('cache-control'),'private, no-cache');
  assert.deepEqual(Buffer.from(await r.arrayBuffer()),p.images.photo,'bytes idénticos');
  const etag=r.headers.get('etag');assert.equal((await get(aceite.foto,p.adminA,{'if-none-match':etag})).status,304);
  assert.equal((await fetch(base+aceite.foto,{method:'HEAD',headers:{cookie:'scorta_platform='+p.adminA}})).status,200);
  // Sin sesión (catálogo apagado), con una sesión inventada u otra empresa: 404, igual que una imagen inexistente (SEG-10).
  assert.equal((await get(aceite.foto)).status,404);assert.equal((await get(aceite.foto,'x'.repeat(43))).status,404);
  assert.equal((await get(aceite.foto,p.adminB)).status,404);
  assert.equal((await get(session.session.company.logo,p.adminB)).status,404);
  assert.equal((await get('/media/'+p.companyA.id+'/'+'0'.repeat(64)+'.png',p.adminA)).status,404);
  assert.equal((await get('/media/'+p.companyB.id+'/'+aceite.foto.split('/').pop(),p.adminB)).status,404,'el mismo id bajo otra empresa no existe');
  // Propietario: ve los logos de todas las empresas, no sus fotos.
  const ownerView=await (await get('/api/v2/session',p.ownerToken)).json(),logoB=ownerView.companies.find(c=>c.id===p.companyB.id).logo;
  r=await get(logoB,p.ownerToken);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/jpeg');assert.deepEqual(Buffer.from(await r.arrayBuffer()),p.images.logoB);
  assert.equal((await get(aceite.foto,p.ownerToken)).status,404);
  // Catálogo publicado: la foto del producto visible y el logo son públicos; el agotado no.
  const published=await p.action(p.adminA,{type:'catalog.update',form:{enabled:true}});assert.equal(published.status,200,JSON.stringify(published.body));
  r=await get(aceite.foto);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'public, max-age=3600');assert.deepEqual(Buffer.from(await r.arrayBuffer()),p.images.photo);
  assert.equal((await get(session.session.company.logo)).status,200);
  assert.equal((await get(agotado.foto)).status,404,'un producto fuera del catálogo sigue privado');
  assert.equal((await get(agotado.foto,p.adminA)).status,200);
  const catalog=await (await get('/api/v2/catalog/'+p.companyA.slug)).json();
  assert.equal(catalog.products.find(x=>x.nombre==='Aceite').foto,aceite.foto);assert.equal(catalog.company.logo,session.session.company.logo);
  r=await get('/api/v2/catalog/'+p.companyA.slug+'/logo');assert.equal(r.status,200);assert.deepEqual(Buffer.from(await r.arrayBuffer()),p.images.logoA);
  r=await get('/api/v2/catalog/'+p.companyA.slug+'/photo/'+aceite.id);assert.equal(r.status,200);assert.deepEqual(Buffer.from(await r.arrayBuffer()),p.images.photo);
  // Catálogo apagado otra vez: vuelve a ser privado.
  await p.action(p.adminA,{type:'catalog.update',form:{enabled:false}});assert.equal((await get(aceite.foto)).status,404);
  assert.equal((await fetch(base+aceite.foto,{method:'POST'})).status,405);
});

test('BE-30: subidas nuevas quedan como referencia, la URL devuelta conserva la foto y no se aceptan imágenes de otra empresa',async t=>{
  const p=await legacyPlatform(t),fresh=jpeg(500);
  const added=await p.action(p.adminA,{type:'business.change',payload:{kind:'producto',form:{nombre:'Casco',stock:1,precio_venta:90000,foto:dataUrl(fresh,'image/jpeg')}}});
  assert.equal(added.status,200,JSON.stringify(added.body));
  const stored=p.store.readPrivate().businesses[p.companyA.id].prods.find(x=>x.nombre==='Casco');
  assert.deepEqual(stored.foto,{mediaId:sha(fresh)+'.jpg',companyId:p.companyA.id,type:'image/jpeg',bytes:fresh.length});
  assert.deepEqual(await p.media.get(stored.foto),fresh);
  // Editar el producto reenviando la URL que ve el navegador conserva la misma referencia.
  const edited=await p.action(p.adminA,{type:'business.change',payload:{kind:'producto',form:{id:stored.id,nombre:'Casco integral',stock:1,precio_venta:95000,foto:mediaUrl(stored.foto)}}});
  assert.equal(edited.status,200,JSON.stringify(edited.body));
  assert.deepEqual(p.store.readPrivate().businesses[p.companyA.id].prods.find(x=>x.id===stored.id).foto,stored.foto);
  // URL de una imagen de otra empresa (o inventada): rechazada.
  const logoB=p.store.readPrivate().companies.find(c=>c.id===p.companyB.id).logo;
  const stolen=await p.action(p.adminA,{type:'business.change',payload:{kind:'producto',form:{id:stored.id,nombre:'Casco integral',stock:1,precio_venta:95000,foto:mediaUrl(logoB)}}});
  assert.equal(stolen.status,400);assert.match(stolen.body.error,/ya no está disponible/);
  const gif=await p.action(p.adminA,{type:'business.change',payload:{kind:'producto',form:{nombre:'Gif',stock:1,precio_venta:1,foto:'data:image/gif;base64,'+Buffer.from('GIF89a0000000000').toString('base64')}}});
  assert.equal(gif.status,400);assert.match(gif.body.error,/PNG, JPEG o WebP/);
  // El propietario cambia el logo de B con la URL que recibió: se conserva; con uno nuevo, se reemplaza.
  const kept=await p.action(p.ownerToken,{type:'company.update',companyId:p.companyB.id,form:{logo:mediaUrl(logoB)}});assert.equal(kept.status,200,JSON.stringify(kept.body));
  assert.deepEqual(p.store.readPrivate().companies.find(c=>c.id===p.companyB.id).logo,logoB);
  const replaced=png(60);await p.action(p.ownerToken,{type:'company.update',companyId:p.companyB.id,form:{logo:dataUrl(replaced)}});
  assert.equal(p.store.readPrivate().companies.find(c=>c.id===p.companyB.id).logo.mediaId,sha(replaced)+'.png');
  // Borrar la empresa borra sus imágenes del disco.
  assert.ok(existsSync(join(p.dir,'media',p.companyB.id)));
  const removed=await p.action(p.ownerToken,{type:'company.delete',companyId:p.companyB.id,form:{confirmation:'Tienda Dos'}});assert.equal(removed.status,200,JSON.stringify(removed.body));
  assert.ok(!existsSync(join(p.dir,'media',p.companyB.id)));assert.ok(existsSync(join(p.dir,'media',p.companyA.id)));
});

test('BE-30: respaldo externo incluye DATA_DIR/media cifrada, una vez por imagen y renovada cada 7 días; se restaura verificando la huella',async t=>{
  quiet(t);
  const dir=temp(t),mediaDir=join(dir,'media'),media=createMediaStore({dir:mediaDir}),s3=fakeS3(),key=randomBytes(32).toString('base64');
  const a=png(100),b=jpeg(100),refA=await media.put('empresa-a',a,'image/png'),refB=await media.put('empresa-b',b,'image/jpeg');
  const config={...s3.config,bucket:'respaldos',prefix:'scorta',key};
  const date=new Date('2026-11-25T10:00:00Z');
  assert.deepEqual(await syncMediaOffsite(mediaDir,config,{date,fetchImpl:s3.fetchImpl}),{uploaded:2,total:2});
  const objectA='/respaldos/'+mediaObjectKey('scorta','empresa-a/'+refA.mediaId);assert.equal(objectA,'/respaldos/scorta/media/empresa-a/'+refA.mediaId+'.enc');
  assert.deepEqual(decryptBackup(s3.objects.get(objectA),key),a);assert.ok(!s3.objects.get(objectA).includes(a.subarray(8)),'cifrada');
  assert.deepEqual(await syncMediaOffsite(mediaDir,config,{date:new Date(+date+3600000),fetchImpl:s3.fetchImpl}),{uploaded:0,total:2},'ya subidas');
  assert.deepEqual(await syncMediaOffsite(mediaDir,config,{date:new Date(+date+MEDIA_REFRESH_MS+1),fetchImpl:s3.fetchImpl}),{uploaded:2,total:2},'copia renovada');
  // El ciclo completo sube las imágenes antes de la base.
  const p=await openPlatformStore(join(dir,'platform.sqlite'),{owner});closeLater(t,()=>p.close());
  await media.put('empresa-c',png(30),'image/png');
  const run=await runOffsiteBackup(p,config,{date:new Date(+date+7200000),fetchImpl:s3.fetchImpl,mediaDir});
  assert.equal(run.ok,true,run.error);assert.deepEqual(run.media,{uploaded:1,total:3});
  const puts=s3.calls.filter(c=>c.method==='PUT').map(c=>c.path);assert.match(puts.at(-1),/\.sqlite\.enc$/);assert.match(puts.at(-2),/\/media\/empresa-c\//);
  // Restauración: descarga de <prefijo>/media -> DATA_DIR/media.
  const download=join(dir,'descarga');
  for(const [path,body]of s3.objects)if(path.startsWith('/respaldos/scorta/media/')){const rel=path.slice('/respaldos/scorta/media/'.length);mkdirSync(join(download,rel.split('/')[0]),{recursive:true});writeFileSync(join(download,rel),body);}
  const restored=join(dir,'restaurado');assert.equal(decryptMediaFolder(download,restored,key),3);
  assert.deepEqual(readFileSync(join(restored,'empresa-b',refB.mediaId)),b);
  const back=createMediaStore({dir:restored});assert.deepEqual(await back.get(refA),a);
  writeFileSync(join(download,'empresa-a',refA.mediaId+'.enc'),(await import('../ops/offsite-backup.mjs')).encryptBackup(png(),key));
  assert.throws(()=>decryptMediaFolder(download,join(dir,'otra'),key),/no coincide con su huella/);
  assert.deepEqual(readdirSync(mediaDir).filter(n=>n.startsWith('.offsite-')).length,1,'un manifiesto por destino');
});
