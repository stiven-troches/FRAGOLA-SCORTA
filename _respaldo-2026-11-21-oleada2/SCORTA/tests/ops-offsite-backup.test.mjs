import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createHash,createHmac,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {encryptBackup,decryptBackup,signV4,objectKey,offsiteConfig,runOffsiteBackup,startOffsiteBackup} from '../ops/offsite-backup.mjs';
import {openPlatformStore,validatePlatformDatabase} from '../platform-server.mjs';

const owner={company:'Fragola',username:'Steven',password:'OwnerPlatformFixture123456!'};
const rawKey=randomBytes(32).toString('base64');
const creds={accessKeyId:'AKIDOPSTEST',secretAccessKey:'secret/ops+test'};
const quiet=t=>{const log=console.log,error=console.error,lines=[];console.log=(...a)=>lines.push(a.join(' '));console.error=(...a)=>lines.push(a.join(' '));t.after(()=>{console.log=log;console.error=error;});return lines;};

// Independent SigV4 verifier (server side): rebuilds the canonical request from what arrived.
function verifySignature(req,body,secret){
  const auth=String(req.headers.authorization||''),m=auth.match(/^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/s3\/aws4_request, SignedHeaders=([^,]+), Signature=([0-9a-f]{64})$/);
  if(!m)return 'formato';
  const [,,day,region,signed,signature]=m,hash=createHash('sha256').update(body).digest('hex');
  if(req.headers['x-amz-content-sha256']!==hash)return 'hash';
  const [path,query='']=req.url.split('?');
  const canonical=[req.method,path,query,signed.split(';').map(h=>h+':'+String(req.headers[h]).trim()+'\n').join(''),signed,hash].join('\n');
  const toSign=['AWS4-HMAC-SHA256',req.headers['x-amz-date'],`${day}/${region}/s3/aws4_request`,createHash('sha256').update(canonical).digest('hex')].join('\n');
  let key=Buffer.from('AWS4'+secret);for(const part of [day,region,'s3','aws4_request'])key=createHmac('sha256',key).update(part).digest();
  return createHmac('sha256',key).update(toSign).digest('hex')===signature?null:'firma';
}
async function fakeS3(t,{status=200}={}){
  const puts=[],pings=[];
  const server=createServer(async(req,res)=>{
    const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);
    if(req.url.startsWith('/ping')){pings.push(req.url);res.end('OK');return;}
    const problem=verifySignature(req,body,creds.secretAccessKey);puts.push({method:req.method,url:req.url,body,problem});
    res.statusCode=problem?403:status;res.end(problem||'');
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
  return {puts,pings,url:'http://127.0.0.1:'+server.address().port};
}
async function platform(t){const dir=mkdtempSync(join(tmpdir(),'scorta-ops-offsite-')),file=join(dir,'platform.sqlite'),store=await openPlatformStore(file,{owner});t.after(()=>{try{store.close();}catch{}rmSync(dir,{recursive:true,force:true});});return {dir,file,store};}
const env=(base,extra={})=>({SCORTA_S3_ENDPOINT:base,SCORTA_S3_BUCKET:'respaldos',SCORTA_S3_ACCESS_KEY_ID:creds.accessKeyId,SCORTA_S3_SECRET_ACCESS_KEY:creds.secretAccessKey,SCORTA_S3_PREFIX:'/scorta/',SCORTA_BACKUP_KEY:rawKey,...extra});

test('OPS-01: firma SigV4 coincide con el vector de ejemplo de AWS',()=>{
  const h=signV4({method:'GET',url:'https://examplebucket.s3.amazonaws.com/test.txt',headers:{Range:'bytes=0-9'},payloadHash:'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',accessKeyId:'AKIAIOSFODNN7EXAMPLE',secretAccessKey:'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',region:'us-east-1',date:new Date('2013-05-24T00:00:00Z')});
  assert.match(h.authorization,/Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41$/);
});

test('OPS-01: cifrado AES-256-GCM con llave base64 o frase, formato con magic y detección de alteraciones',()=>{
  const plain=Buffer.from('SQLite format 3\0'+'x'.repeat(5000));
  const sealed=encryptBackup(plain,rawKey);
  assert.equal(sealed.subarray(0,4).toString(),'SCBK');assert.equal(sealed[4],1);assert.equal(sealed[5],0);
  assert.ok(!sealed.includes(Buffer.from('SQLite format')));
  assert.deepEqual(decryptBackup(sealed,rawKey),plain);
  const phrase=encryptBackup(plain,'una frase larga y secreta para respaldos');assert.equal(phrase[5],1);
  assert.deepEqual(decryptBackup(phrase,'una frase larga y secreta para respaldos'),plain);
  assert.throws(()=>decryptBackup(phrase,'otra frase'),/llave incorrecta/);
  const tampered=Buffer.from(sealed);tampered[tampered.length-1]^=1;assert.throws(()=>decryptBackup(tampered,rawKey),/alterado/);
  const header=Buffer.from(sealed);header[30]^=1;assert.throws(()=>decryptBackup(header,rawKey),/alterado/);
  assert.throws(()=>decryptBackup(Buffer.from('nada'.repeat(20)),rawKey),/no es un respaldo/);
  assert.throws(()=>encryptBackup(plain,''),/SCORTA_BACKUP_KEY/);
});

test('OPS-01: nombre del objeto prefix/AAAA/MM/DD/scorta-<iso>.sqlite.enc y desactivado si faltan variables',t=>{
  assert.equal(objectKey('/scorta/',new Date('2026-11-21T08:05:09.123Z')),'scorta/2026/11/21/scorta-2026-11-21T08-05-09.123Z.sqlite.enc');
  assert.equal(objectKey('',new Date('2026-01-02T00:00:00.000Z')),'2026/01/02/scorta-2026-01-02T00-00-00.000Z.sqlite.enc');
  assert.equal(offsiteConfig({}).config.region,'auto');
  assert.deepEqual(offsiteConfig({SCORTA_S3_BUCKET:'b'}).missing,['SCORTA_S3_ENDPOINT','SCORTA_S3_ACCESS_KEY_ID','SCORTA_S3_SECRET_ACCESS_KEY','SCORTA_BACKUP_KEY']);
  const lines=quiet(t);const loop=startOffsiteBackup({snapshot:async()=>Buffer.alloc(0)},{env:{SCORTA_S3_BUCKET:'b'}});
  assert.equal(loop.enabled,false);loop.stop();
  assert.equal(lines.filter(l=>l.includes('offsite-backup-disabled')).length,1);
});

test('OPS-01/03: sube el respaldo cifrado y firmado a un S3 falso, avisa al ping y el descifrado reproduce la base',async t=>{
  const s3=await fakeS3(t),p=await platform(t),{config}=offsiteConfig(env(s3.url,{SCORTA_BACKUP_PING_URL:s3.url+'/ping/abc/'}));
  quiet(t);
  const date=new Date('2026-11-21T10:00:00.000Z'),result=await runOffsiteBackup(p.store,config,{date});
  assert.equal(result.ok,true,result.error);assert.equal(s3.puts.length,1);
  const put=s3.puts[0];assert.equal(put.problem,null);assert.equal(put.method,'PUT');
  assert.equal(put.url,'/respaldos/scorta/2026/11/21/scorta-2026-11-21T10-00-00.000Z.sqlite.enc');
  assert.deepEqual(s3.pings,['/ping/abc']);
  const out=join(p.dir,'descifrado.sqlite');writeFileSync(out,decryptBackup(put.body,rawKey));
  const state=validatePlatformDatabase(out);assert.deepEqual(state.users.map(u=>u.id),p.store.readPrivate().users.map(u=>u.id));
  // CLI: node platform-backup.mjs decrypt <enc> <salida>
  const enc=join(p.dir,'r.sqlite.enc'),cli=join(p.dir,'cli.sqlite');writeFileSync(enc,put.body);
  const script=fileURLToPath(new URL('../platform-backup.mjs',import.meta.url));
  execFileSync(process.execPath,[script,'decrypt',enc,cli],{env:{...process.env,SCORTA_BACKUP_KEY:rawKey},stdio:'pipe'});
  assert.ok(existsSync(cli));assert.deepEqual(readFileSync(cli),readFileSync(out));
  assert.throws(()=>execFileSync(process.execPath,[script,'decrypt',enc,join(p.dir,'mal.sqlite')],{env:{...process.env,SCORTA_BACKUP_KEY:randomBytes(32).toString('base64')},stdio:'pipe'}));
});

test('OPS-01/03: credenciales inválidas fallan, se registra y se avisa a <url>/fail; el ciclo programado corre dentro del servicio',async t=>{
  const s3=await fakeS3(t),p=await platform(t);const lines=quiet(t);
  const bad=offsiteConfig(env(s3.url,{SCORTA_S3_SECRET_ACCESS_KEY:'otra',SCORTA_BACKUP_PING_URL:s3.url+'/ping/abc'})).config;
  const failed=await runOffsiteBackup(p.store,bad);
  assert.equal(failed.ok,false);assert.match(failed.error,/403/);assert.deepEqual(s3.pings,['/ping/abc/fail']);
  assert.ok(lines.some(l=>l.includes('offsite-backup-failed')));
  const results=[];let resolve;const done=new Promise(r=>resolve=r);
  const loop=startOffsiteBackup(p.store,{env:env(s3.url),firstDelayMs:0,onResult:r=>{results.push(r);resolve();}});
  t.after(()=>loop.stop());assert.equal(loop.enabled,true);
  await done;loop.stop();assert.equal(results[0].ok,true);assert.equal(s3.puts.at(-1).problem,null);
});
