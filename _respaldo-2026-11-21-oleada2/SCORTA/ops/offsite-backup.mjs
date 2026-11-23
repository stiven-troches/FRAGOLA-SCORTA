// OPS-01/OPS-03: encrypted off-site backup that runs inside the web service (a Render
// Cron Job cannot read the Persistent Disk). Zero dependencies: node:crypto + fetch.
//
// Key (SCORTA_BACKUP_KEY): if it is base64 that decodes to exactly 32 bytes it is used
// as the AES-256 key directly (generate: node -e "console.log(crypto.randomBytes(32).toString('base64'))").
// Anything else is treated as a passphrase and stretched with scrypt (N=2^15,r=8,p=1)
// using a random 16-byte salt stored in the file header.
//
// File format (all integers single bytes):
//   magic "SCBK" | version 1 | kdf (0=raw key, 1=scrypt) | salt[16] | iv[12] | tag[16] | ciphertext
// The ciphertext is AES-256-GCM over gzip(sqlite file); the 34 header bytes before the
// tag (magic..iv) are authenticated as AAD.
import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes,scryptSync} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';

const MAGIC=Buffer.from('SCBK'),VERSION=1,SCRYPT={N:2**15,r:8,p:1,maxmem:64*1024*1024};
// warn/error and startup lines go to stderr: stdout's first line announces readiness.
const log=(level,event,extra={})=>(level==='info'?console.log:console.error)(JSON.stringify({level,at:new Date().toISOString(),event,...extra}));

function deriveKey(secret,kdf,salt){
  if(kdf===0)return Buffer.from(String(secret).trim(),'base64');
  return scryptSync(String(secret),salt,32,SCRYPT);
}
const rawKey=secret=>{const s=String(secret||'').trim();if(!/^[A-Za-z0-9+/]{43}=$/.test(s))return false;return Buffer.from(s,'base64').length===32;};
export function encryptBackup(plain,secret){
  if(!secret)throw Error('Falta SCORTA_BACKUP_KEY');
  const kdf=rawKey(secret)?0:1,salt=kdf?randomBytes(16):Buffer.alloc(16),iv=randomBytes(12);
  const header=Buffer.concat([MAGIC,Buffer.from([VERSION,kdf]),salt,iv]);
  const cipher=createCipheriv('aes-256-gcm',deriveKey(secret,kdf,salt),iv);cipher.setAAD(header);
  const data=Buffer.concat([cipher.update(gzipSync(plain)),cipher.final()]);
  return Buffer.concat([header,cipher.getAuthTag(),data]);
}
export function decryptBackup(file,secret){
  if(!secret)throw Error('Falta SCORTA_BACKUP_KEY');
  if(file.length<50||!file.subarray(0,4).equals(MAGIC))throw Error('El archivo no es un respaldo cifrado de SCORTA');
  if(file[4]!==VERSION)throw Error('Versión de respaldo cifrado no soportada: '+file[4]);
  const kdf=file[5],salt=file.subarray(6,22),iv=file.subarray(22,34),tag=file.subarray(34,50);
  if(kdf!==0&&kdf!==1)throw Error('Derivación de llave desconocida');
  if(kdf===0&&!rawKey(secret))throw Error('Este respaldo usa una llave base64 de 32 bytes');
  const decipher=createDecipheriv('aes-256-gcm',deriveKey(secret,kdf,salt),iv);decipher.setAAD(file.subarray(0,34));decipher.setAuthTag(tag);
  try{return gunzipSync(Buffer.concat([decipher.update(file.subarray(50)),decipher.final()]));}
  catch{throw Error('No se pudo descifrar: llave incorrecta o archivo alterado');}
}

// ---- AWS Signature Version 4 (header auth, service s3, path-style URLs) ----
const sha256=data=>createHash('sha256').update(data).digest('hex');
const hmac=(key,data)=>createHmac('sha256',key).update(data).digest();
export const encodeKey=key=>key.split('/').map(part=>encodeURIComponent(part).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())).join('/');
/** Returns the headers to send (lower-case names), including Authorization. */
export function signV4({method,url,headers={},payloadHash,accessKeyId,secretAccessKey,region='auto',service='s3',date=new Date()}){
  const u=new URL(url),amzDate=date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''),day=amzDate.slice(0,8);
  const all={...Object.fromEntries(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),String(v).trim().replace(/\s+/g,' ')])),host:u.host,'x-amz-content-sha256':payloadHash,'x-amz-date':amzDate};
  const names=Object.keys(all).sort(),signedHeaders=names.join(';');
  const query=[...u.searchParams].map(([k,v])=>[encodeURIComponent(k),encodeURIComponent(v)]).sort(([a,x],[b,y])=>a<b?-1:a>b?1:x<y?-1:x>y?1:0).map(([k,v])=>k+'='+v).join('&');
  const canonical=[method,u.pathname||'/',query,names.map(n=>n+':'+all[n]+'\n').join(''),signedHeaders,payloadHash].join('\n');
  const scope=`${day}/${region}/${service}/aws4_request`,toSign=['AWS4-HMAC-SHA256',amzDate,scope,sha256(canonical)].join('\n');
  const key=hmac(hmac(hmac(hmac('AWS4'+secretAccessKey,day),region),service),'aws4_request');
  all.authorization=`AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${createHmac('sha256',key).update(toSign).digest('hex')}`;
  return all;
}
export function objectKey(prefix,date=new Date()){
  const iso=date.toISOString(),clean=String(prefix||'').replace(/^\/+|\/+$/g,'');
  return (clean?clean+'/':'')+`${iso.slice(0,4)}/${iso.slice(5,7)}/${iso.slice(8,10)}/scorta-${iso.replaceAll(':','-')}.sqlite.enc`;
}
export async function putObject({endpoint,bucket,region,accessKeyId,secretAccessKey},key,body,{date=new Date(),fetchImpl=fetch}={}){
  const url=endpoint.replace(/\/+$/,'')+'/'+encodeURIComponent(bucket)+'/'+encodeKey(key);
  const headers=signV4({method:'PUT',url,headers:{'content-type':'application/octet-stream'},payloadHash:sha256(body),accessKeyId,secretAccessKey,region,date});
  delete headers.host;
  const response=await fetchImpl(url,{method:'PUT',headers,body,signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw Error(`S3 respondió ${response.status}: ${(await response.text().catch(()=>'')).slice(0,300)}`);
  return url;
}

export function offsiteConfig(env=process.env){
  const config={endpoint:env.SCORTA_S3_ENDPOINT,bucket:env.SCORTA_S3_BUCKET,region:env.SCORTA_S3_REGION||'auto',accessKeyId:env.SCORTA_S3_ACCESS_KEY_ID,secretAccessKey:env.SCORTA_S3_SECRET_ACCESS_KEY,prefix:env.SCORTA_S3_PREFIX||'',key:env.SCORTA_BACKUP_KEY,intervalMin:Number(env.SCORTA_BACKUP_INTERVAL_MIN)||60,pingUrl:env.SCORTA_BACKUP_PING_URL||''};
  const missing=['SCORTA_S3_ENDPOINT','SCORTA_S3_BUCKET','SCORTA_S3_ACCESS_KEY_ID','SCORTA_S3_SECRET_ACCESS_KEY','SCORTA_BACKUP_KEY'].filter(name=>!env[name]);
  if(!missing.length&&!/^https?:\/\//.test(config.endpoint))missing.push('SCORTA_S3_ENDPOINT (http/https)');
  return {config,missing};
}
// OPS-03: Healthchecks.io style dead-man's switch. Never throws.
export async function ping(url,ok,fetchImpl=fetch){
  if(!url)return;
  try{await fetchImpl(url.replace(/\/+$/,'')+(ok?'':'/fail'),{method:'GET',signal:AbortSignal.timeout(10000)});}catch(error){log('warn','backup-ping-failed',{error:String(error?.message||error)});}
}
/** One backup run: snapshot -> encrypt -> upload -> ping. Returns {at,ok,key?,bytes?,error?}. */
export async function runOffsiteBackup(store,config,{date=new Date(),fetchImpl=fetch}={}){
  const at=date.toISOString();
  try{
    const sealed=encryptBackup(await store.snapshot(),config.key),key=objectKey(config.prefix,date);
    await putObject(config,key,sealed,{date,fetchImpl});
    log('info','offsite-backup',{key,bytes:sealed.length});await ping(config.pingUrl,true,fetchImpl);
    return {at,ok:true,key,bytes:sealed.length};
  }catch(error){
    log('error','offsite-backup-failed',{error:String(error?.message||error)});await ping(config.pingUrl,false,fetchImpl);
    return {at,ok:false,error:String(error?.message||error)};
  }
}
/** Starts the hourly loop. Disabled (logged once) when any variable is missing. */
export function startOffsiteBackup(store,{env=process.env,onResult=()=>{},firstDelayMs=120000,fetchImpl=fetch}={}){
  const {config,missing}=offsiteConfig(env);
  if(!store||missing.length){log('warn','offsite-backup-disabled',{missing:store?missing:['platform.sqlite']});return {enabled:false,stop(){}};}
  let timer=null,stopped=false;
  const loop=async()=>{if(stopped)return;onResult(await runOffsiteBackup(store,config,{fetchImpl}));if(!stopped)timer=setTimeout(loop,config.intervalMin*60000);};
  timer=setTimeout(loop,firstDelayMs);
  log('notice','offsite-backup-enabled',{intervalMin:config.intervalMin,bucket:config.bucket,prefix:config.prefix,ping:!!config.pingUrl});
  return {enabled:true,config,stop(){stopped=true;clearTimeout(timer);}};
}
