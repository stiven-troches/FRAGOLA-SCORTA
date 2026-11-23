// QA-07: el límite de intentos se aplica por IP real del cliente cuando el operador
// configura la cabecera de su proxy de confianza (clientIpHeader).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openPlatformStore,createPlatformHandler} from '../platform-server.mjs';
import {OWNER_PASSWORD} from './qa-fixture.mjs';

// cf-connecting-ip: cabecera estable (la semántica de x-forwarded-for está en revisión).
const HEADER='cf-connecting-ip';

async function withServer(options,run){
 const directory=mkdtempSync(join(tmpdir(),'scorta-qa-ip-'));
 const store=await openPlatformStore(join(directory,'platform.sqlite'),{owner:{company:'Fragola',username:'owner',name:'Owner',password:OWNER_PASSWORD}});
 const handler=createPlatformHandler({store,...options});
 const server=createServer(async(req,res)=>{if(!await handler(req,res)){res.writeHead(404);res.end()}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 const login=(ip,password)=>fetch(base+'/api/v2/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:base,...(ip?{[HEADER]:ip}:{})},body:JSON.stringify({company:'Fragola',username:'owner',password})});
 try{await run(login)}finally{await new Promise(resolve=>server.close(resolve));store.close();rmSync(directory,{recursive:true,force:true})}
}

test('QA-07: 11 logins fallidos desde la IP A no bloquean a la IP B (cabecera configurada)',async()=>{
 await withServer({clientIpHeader:HEADER},async login=>{
  const statuses=[];
  for(let i=0;i<11;i++)statuses.push((await login('203.0.113.10','contraseña-incorrecta')).status);
  assert.deepEqual(statuses,[...Array(10).fill(401),429]);
  // La IP A queda bloqueada incluso con la contraseña correcta...
  const blocked=await login('203.0.113.10',OWNER_PASSWORD);
  assert.equal(blocked.status,429);assert.ok(Number(blocked.headers.get('retry-after'))>0);
  // ...pero otro equipo (IP B) entra normalmente.
  const other=await login('198.51.100.20',OWNER_PASSWORD);
  assert.equal(other.status,200,JSON.stringify(await other.clone().json()));
  assert.match(other.headers.get('set-cookie')||'',/scorta_platform=[A-Za-z0-9_-]{43}/);
  // Solo se toma el primer valor si la cabecera trae una lista.
  const listed=await login('198.51.100.30, 203.0.113.10',OWNER_PASSWORD);assert.equal(listed.status,200);
 });
});

test('QA-07: sin cabecera configurada todos comparten la IP del socket (por qué se debe configurar)',async()=>{
 await withServer({},async login=>{
  for(let i=0;i<10;i++)assert.equal((await login('203.0.113.10','contraseña-incorrecta')).status,401);
  // La cabecera se ignora: la "IP B" se ve como el mismo socket 127.0.0.1 y queda bloqueada.
  assert.equal((await login('198.51.100.20',OWNER_PASSWORD)).status,429);
 });
});
