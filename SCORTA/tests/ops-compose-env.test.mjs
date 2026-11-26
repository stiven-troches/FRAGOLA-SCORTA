// OPS: compose.yaml (instalación propia con Docker) debe pasar al contenedor TODAS las variables que el
// servidor lee en producción. El `.env` no entra a la imagen (.dockerignore): lo que compose.yaml no lista,
// nunca llega a la app (respaldos apagados, límite de intentos global, correo sin configurar...).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const root=fileURLToPath(new URL('..',import.meta.url));
const read=file=>readFileSync(join(root,file),'utf8');
const compose=read('compose.yaml'),envExample=read('.env.example'),dockerfile=read('Dockerfile'),caddyfile=read('Caddyfile');

// Variables internas: el servidor las lee pero NO deben pasarse desde compose (motivo explícito).
const INTERNAL=new Map([
  ['RENDER_GIT_COMMIT','la define Render; fuera de Render se usa SCORTA_VERSION'],
  ['RESEND_API_URL','solo para pruebas con un servidor de correo falso local'],
]);

/** Variables de entorno que lee el código del servidor (la imagen copia *.mjs de la raíz y ops/). */
function envReadByServer(){
  const files=[...readdirSync(root).filter(f=>f.endsWith('.mjs')&&!/^playwright.*\.config\.mjs$/.test(f)),...readdirSync(join(root,'ops')).filter(f=>f.endsWith('.mjs')).map(f=>'ops/'+f)];
  const found=new Map();
  const add=(name,file)=>{if(!found.has(name))found.set(name,new Set());found.get(name).add(file);};
  for(const file of files){
    const code=read(file).replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
    for(const m of code.matchAll(/\benv\.([A-Z][A-Z0-9_]*[A-Z0-9])\b/g))add(m[1],file);
    for(const m of code.matchAll(/\benv\[\s*['"]([A-Z][A-Z0-9_]*[A-Z0-9])['"]\s*\]/g))add(m[1],file);
    // Listas de nombres que luego se leen con env[name] (p. ej. offsiteConfig, mediaConfig).
    for(const m of code.matchAll(/['"]((?:SCORTA|RESEND)_[A-Z0-9_]*[A-Z0-9])['"]/g))add(m[1],file);
  }
  return found;
}
/** Claves de `services.app.environment` y su valor tal como está escrito. */
function appEnvironment(){
  const block=compose.match(/^  app:\n([\s\S]*?)^  \S/m)?.[1]||'';
  const env=block.match(/^    environment:\n((?:      .*\n|\s*\n)+)/m)?.[1]||'';
  const result=new Map();
  for(const line of env.split('\n')){const m=line.match(/^      ([A-Z][A-Z0-9_]*):\s*(.*)$/);if(m)result.set(m[1],m[2]);}
  return result;
}
const dockerEnv=new Set((dockerfile.match(/^ENV\s+(.+)$/m)?.[1]||'').split(/\s+/).map(pair=>pair.split('=')[0]).filter(Boolean));

test('el escaneo del código encuentra las variables conocidas (la prueba no está vacía)',()=>{
  const found=envReadByServer();
  for(const name of ['SCORTA_BACKUP_KEY','SCORTA_S3_ENDPOINT','SCORTA_S3_SECRET_ACCESS_KEY','SCORTA_MEDIA_S3_BUCKET','SCORTA_CLIENT_IP_HEADER','SCORTA_TRUSTED_PROXY_HOPS','SCORTA_HEALTH_TOKEN','SCORTA_ALERT_5XX_THRESHOLD','SCORTA_BACKUP_INTERVAL_MIN','SCORTA_OFFSITE_BACKUP','SCORTA_OWNER_PASSWORD','SCORTA_PUBLIC_URL','RESEND_API_KEY','SCORTA_MAIL_FROM','NODE_ENV','DATA_DIR'])assert.ok(found.has(name),name+' debería detectarse');
  assert.ok(found.size>=35,'se detectaron '+found.size);
});

test('compose.yaml pasa al contenedor cada variable que el servidor lee en producción',()=>{
  const passed=appEnvironment(),missing=[];
  assert.ok(passed.size>=30,'no se pudo leer services.app.environment ('+passed.size+')');
  for(const [name,files] of envReadByServer()){
    if(INTERNAL.has(name)||dockerEnv.has(name))continue;
    if(!passed.has(name))missing.push(name+' ('+[...files].join(', ')+')');
  }
  assert.deepEqual(missing,[],'compose.yaml no pasa estas variables al contenedor:\n'+missing.join('\n'));
});

test('la lista de variables internas permitidas no tiene entradas muertas ni variables que compose sí pasa',()=>{
  const found=envReadByServer(),passed=appEnvironment();
  for(const [name,reason] of INTERNAL){assert.ok(found.has(name),name+' ya no se lee: quítala de INTERNAL ('+reason+')');assert.ok(!passed.has(name),name+' es interna y no debe pasarse desde compose');}
  for(const name of passed.keys())assert.ok(found.has(name),'compose.yaml pasa '+name+' pero el servidor no la lee');
});

test('.env.example documenta cada variable que el servidor lee (salvo las que fija el Dockerfile o son internas)',()=>{
  const missing=[];
  for(const name of envReadByServer().keys()){
    if(INTERNAL.has(name)||['NODE_ENV','HOST','PORT','DATA_DIR'].includes(name))continue;
    if(!new RegExp('^#?\\s*'+name+'=','m').test(envExample))missing.push(name);
  }
  assert.deepEqual(missing,[],'.env.example no documenta: '+missing.join(', '));
  assert.match(envExample,/^DOMAIN=/m);
});

test('SCORTA_OWNER_PASSWORD no es obligatoria en compose (ruta de salida de Render) y no hay credenciales por defecto',()=>{
  const passed=appEnvironment();
  assert.equal(passed.get('SCORTA_OWNER_PASSWORD'),'${SCORTA_OWNER_PASSWORD:-}','debe usar :- (vacío permitido), no :?');
  assert.doesNotMatch(compose,/SCORTA_OWNER_PASSWORD:\?/);
  for(const name of ['SCORTA_OWNER_COMPANY','SCORTA_OWNER_USER','SCORTA_OWNER_NAME'])assert.equal(passed.get(name),'${'+name+':-}',name+' no debe traer un valor por defecto');
  const activeCompose=compose.split('\n').filter(l=>!/^\s*#/.test(l)).join('\n'),activeEnv=envExample.split('\n').filter(l=>!/^\s*#/.test(l)).join('\n');
  assert.doesNotMatch(activeCompose,/\b(?:Fragola|Steven)\b/);assert.doesNotMatch(activeEnv,/\b(?:Fragola|Steven)\b/);
  // Ningún secreto con valor por defecto escrito en compose.
  for(const name of ['SCORTA_BACKUP_KEY','SCORTA_S3_SECRET_ACCESS_KEY','SCORTA_S3_ACCESS_KEY_ID','SCORTA_MEDIA_S3_SECRET_ACCESS_KEY','SCORTA_MEDIA_S3_ACCESS_KEY_ID','RESEND_API_KEY','SCORTA_MAIL_WEBHOOK_SECRET','SCORTA_HEALTH_TOKEN'])assert.equal(passed.get(name),'${'+name+':-}',name);
  // El dominio sigue siendo obligatorio.
  assert.match(compose,/SCORTA_PUBLIC_URL: https:\/\/\$\{DOMAIN:\?/);
});

test('detrás de Caddy la IP del cliente se toma de x-forwarded-for con un salto, y los valores por defecto son los de producción',()=>{
  const passed=appEnvironment();
  assert.equal(passed.get('SCORTA_CLIENT_IP_HEADER'),'${SCORTA_CLIENT_IP_HEADER:-x-forwarded-for}');
  assert.equal(passed.get('SCORTA_TRUSTED_PROXY_HOPS'),'${SCORTA_TRUSTED_PROXY_HOPS:-1}');
  assert.equal(passed.get('SCORTA_TEST_COMPANY'),'${SCORTA_TEST_COMPANY:-0}');
  assert.equal(passed.get('SCORTA_BACKUP_INTERVAL_MIN'),'${SCORTA_BACKUP_INTERVAL_MIN:-60}');
  assert.equal(passed.get('SCORTA_S3_REGION'),'${SCORTA_S3_REGION:-auto}');
  assert.match(caddyfile,/reverse_proxy app:3000/);
  assert.doesNotMatch(caddyfile.split('\n').filter(l=>!/^\s*#/.test(l)).join('\n'),/trusted_proxies/,'con trusted_proxies Caddy conservaría un X-Forwarded-For falsificable');
});
