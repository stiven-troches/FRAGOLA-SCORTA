// BE-30: fotos de productos y logos fuera de la base de datos.
//
// Dos destinos, mismas claves (direccionadas por contenido: <companyId>/<sha256>.<ext>):
//   - Almacenamiento S3 compatible (Cloudflare R2) si están SCORTA_MEDIA_S3_ENDPOINT, _BUCKET,
//     _ACCESS_KEY_ID y _SECRET_ACCESS_KEY (+ _REGION, por defecto auto, y _PREFIX opcional).
//     Firma SigV4 reutilizada de ops/offsite-backup.mjs.
//   - Si no, archivos en el disco persistente: DATA_DIR/media/<companyId>/<sha256>.<ext>.
//     Esa carpeta NO está dentro de platform.sqlite: el respaldo externo cada hora la sube
//     cifrada (ops/offsite-backup.mjs, syncMediaOffsite) cuando el destino es el disco.
// El estado JSON guarda solo {mediaId,companyId,type,bytes} (media-ref.mjs).
import {createHash,randomUUID} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,renameSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {getObject,putObject} from './ops/offsite-backup.mjs';
import {MEDIA_MAX_BYTES,MEDIA_TYPES,isMediaRef,sniffImage,validCompanyId} from './media-ref.mjs';

const log=(level,event,extra={})=>console.error(JSON.stringify({level,at:new Date().toISOString(),event,...extra}));
const S3_VARS=['SCORTA_MEDIA_S3_ENDPOINT','SCORTA_MEDIA_S3_BUCKET','SCORTA_MEDIA_S3_ACCESS_KEY_ID','SCORTA_MEDIA_S3_SECRET_ACCESS_KEY'];

/** {s3:config|null, missing:[...]} — missing solo cuando la configuración S3 está a medias. */
export function mediaConfig(env=process.env){
  if(!S3_VARS.some(name=>env[name]))return {s3:null,missing:[]};
  const missing=S3_VARS.filter(name=>!env[name]);
  if(!missing.length&&!/^https?:\/\//.test(env.SCORTA_MEDIA_S3_ENDPOINT))missing.push('SCORTA_MEDIA_S3_ENDPOINT (http/https)');
  if(missing.length)return {s3:null,missing};
  return {s3:{endpoint:env.SCORTA_MEDIA_S3_ENDPOINT,bucket:env.SCORTA_MEDIA_S3_BUCKET,region:env.SCORTA_MEDIA_S3_REGION||'auto',accessKeyId:env.SCORTA_MEDIA_S3_ACCESS_KEY_ID,secretAccessKey:env.SCORTA_MEDIA_S3_SECRET_ACCESS_KEY,prefix:String(env.SCORTA_MEDIA_S3_PREFIX||'').replace(/^\/+|\/+$/g,'')},missing:[]};
}

const fail=message=>{throw Object.assign(Error(message),{status:400,code:'INVALID_IMAGE'})};
/** Valida tipo (WebP, PNG, JPEG por su firma real) y tamaño (500 KB). */
export function checkImage(bytes,type){
  if(!Object.hasOwn(MEDIA_TYPES,type))fail('La imagen debe ser PNG, JPEG o WebP de hasta 500 KB');
  if(!bytes?.length||bytes.length>MEDIA_MAX_BYTES)fail('La imagen no puede superar 500 KB');
  if(sniffImage(bytes)!==type)fail('El contenido de la imagen no coincide con su formato');
}
/** data:image/(png|jpeg|webp);base64,... -> {type,bytes}; null si no es un data URL de imagen soportado. */
export function decodeImageDataUrl(value){
  const match=typeof value==='string'&&/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+=*)$/.exec(value);
  return match?{type:match[1],bytes:Buffer.from(match[2],'base64')}:null;
}
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

/**
 * createMediaStore({dir, s3, fetchImpl}) -> {kind, dir, put, putDataUrl, get, removeCompany}
 * `dir` es DATA_DIR/media. Con S3 la carpeta sigue sirviendo de respaldo de lectura: un archivo
 * que solo existe en disco (antes de configurar R2) se sube a R2 la primera vez que se lee.
 */
// uploadTimeoutMs (SEG-10): las subidas a R2 ocurren dentro de la cola de escrituras; un R2 lento
// no debe bloquearla 120 s. Si vence, la escritura sigue con el data URL y se reintenta después.
export function createMediaStore({dir,s3=null,fetchImpl=fetch,cacheBytes=32*1024*1024,uploadTimeoutMs=10000}={}){
  if(!dir)throw Error('Falta la carpeta de medios');
  dir=resolve(dir);
  const uploaded=new Set(),cache=new Map();let cached=0;
  // SEG-10: archivos en disco ya verificados (ruta -> tamaño:mtime) para no recalcular el sha256 en cada lectura.
  const verified=new Map(),MAX_VERIFIED=10000;
  const fileStamp=path=>{try{const s=statSync(path);return s.size+':'+s.mtimeMs;}catch{return null;}};
  const key=ref=>ref.companyId+'/'+ref.mediaId,s3Key=ref=>(s3.prefix?s3.prefix+'/':'')+key(ref);
  const file=ref=>resolve(dir,ref.companyId,ref.mediaId);
  const remember=(ref,bytes)=>{
    if(!s3||bytes.length>cacheBytes)return;
    const k=key(ref);if(cache.has(k))return;
    cache.set(k,bytes);cached+=bytes.length;
    for(const [old,value]of cache){if(cached<=cacheBytes)break;cache.delete(old);cached-=value.length;}
  };
  function writeDisk(ref,bytes){
    const target=file(ref);if(existsSync(target))return;
    mkdirSync(resolve(dir,ref.companyId),{recursive:true,mode:0o700});
    const pending=target+'.'+randomUUID()+'.tmp';
    try{writeFileSync(pending,bytes,{flag:'wx',mode:0o600});renameSync(pending,target);}finally{rmSync(pending,{force:true});}
  }
  async function upload(ref,bytes){
    if(uploaded.has(key(ref)))return;
    await putObject(s3,s3Key(ref),bytes,{fetchImpl,contentType:ref.type,timeoutMs:uploadTimeoutMs});
    uploaded.add(key(ref));
  }
  async function put(companyId,bytes,type){
    if(!validCompanyId(companyId))fail('Empresa inválida para la imagen');
    bytes=Buffer.from(bytes);checkImage(bytes,type);
    const ref={mediaId:sha256(bytes)+'.'+MEDIA_TYPES[type],companyId,type,bytes:bytes.length};
    if(s3)await upload(ref,bytes);else writeDisk(ref,bytes);
    return ref;
  }
  async function putDataUrl(companyId,value){
    const image=decodeImageDataUrl(value);
    return image?put(companyId,image.bytes,image.type):null;
  }
  /** Bytes de la imagen o null si no existe. Verifica el sha256 antes de entregarla. */
  async function get(ref){
    if(!isMediaRef(ref))return null;
    const hit=cache.get(key(ref));if(hit)return hit;
    let bytes=null;
    if(s3){
      bytes=await getObject(s3,s3Key(ref),{fetchImpl});
      if(!bytes&&existsSync(file(ref))){bytes=readFileSync(file(ref));if(sha256(bytes)+'.'+MEDIA_TYPES[ref.type]===ref.mediaId)await upload(ref,bytes).catch(error=>log('warn','media-upload-failed',{error:String(error?.message||error)}));}
    }else{
      const path=file(ref),before=fileStamp(path);if(!before)return null;
      bytes=readFileSync(path);
      if(verified.get(path)===before&&bytes.length===ref.bytes)return bytes;
      if(sha256(bytes)+'.'+MEDIA_TYPES[ref.type]!==ref.mediaId){verified.delete(path);log('error','media-corrupt',{key:key(ref)});return null;}
      if(!verified.has(path)&&verified.size>=MAX_VERIFIED)verified.delete(verified.keys().next().value);
      verified.set(path,before);return bytes;
    }
    if(!bytes)return null;
    if(sha256(bytes)+'.'+MEDIA_TYPES[ref.type]!==ref.mediaId){log('error','media-corrupt',{key:key(ref)});return null;}
    remember(ref,bytes);return bytes;
  }
  /** Borra las imágenes en disco de una empresa eliminada. En S3 no se listan objetos: usa una regla de ciclo de vida o bórralas a mano. */
  function removeCompany(companyId){
    if(!validCompanyId(companyId))return false;
    rmSync(resolve(dir,companyId),{recursive:true,force:true});
    for(const k of [...cache.keys()])if(k.startsWith(companyId+'/')){cached-=cache.get(k).length;cache.delete(k);}
    const folder=resolve(dir,companyId);for(const path of [...verified.keys()])if(resolve(path,'..')===folder)verified.delete(path);
    return true;
  }
  return {kind:s3?'s3':'disk',dir,put,putDataUrl,get,removeCompany};
}

/**
 * Migra al almacén de medios los data URL del estado (logos y fotos) y los cambia por referencias.
 * Idempotente: solo toca valores que todavía son data URL. Un error deja el data URL (sigue
 * funcionando) y se reintenta en segundo plano o en el siguiente arranque. Muta `state`.
 * include(companyId,value) (SEG-10): limita la pasada a esos valores (p. ej. los de una escritura).
 */
export async function externalizeMedia(state,media,{include=null}={}){
  const result={moved:0,failed:0};
  const move=async(companyId,holder,field)=>{
    const value=holder[field];if(typeof value!=='string'||!value.startsWith('data:'))return;
    if(include&&!include(companyId,value))return;
    try{const ref=await media.putDataUrl(companyId,value);if(ref){holder[field]=ref;result.moved++;}else result.failed++;}
    catch(error){result.failed++;log('warn','media-migrate-failed',{companyId,error:String(error?.message||error)});}
  };
  for(const company of state?.companies||[])if(validCompanyId(company?.id))await move(company.id,company,'logo');
  for(const [companyId,business]of Object.entries(state?.businesses||{})){
    if(!validCompanyId(companyId))continue;
    for(const product of business?.prods||[])if(product)await move(companyId,product,'foto');
  }
  return result;
}

/** SEG-10: data URL migrables que siguen en el estado, por empresa: Map<companyId, Set<dataUrl>>. */
export function pendingMedia(state){
  const pending=new Map(),add=(companyId,value)=>{
    if(typeof value!=='string'||!validCompanyId(companyId)||!/^data:image\/(?:png|jpeg|webp);base64,/.test(value))return;
    if(!pending.has(companyId))pending.set(companyId,new Set());pending.get(companyId).add(value);
  };
  for(const company of state?.companies||[])add(company?.id,company?.logo);
  for(const [companyId,business]of Object.entries(state?.businesses||{}))for(const product of business?.prods||[])add(companyId,product?.foto);
  return pending;
}
