// BE-38: el modo antiguo «motoshop» ya no existe. Solo se lee una vez, en modo de solo
// lectura, para sembrar una plataforma nueva; no queda ninguna ruta /api/* heredada.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readLegacyState} from '../server.mjs';
import {estadoVacio} from '../inventory.mjs';

const script=fileURLToPath(new URL('../server.mjs',import.meta.url));
const clean=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^(SCORTA_|RENDER_|NODE_ENV$|NODE_TEST_CONTEXT$|PORT$|HOST$|DATA_DIR$|RESEND_)/.test(k)));
function legacyFile(dir){
  const file=join(dir,'motoshop.sqlite'),state=estadoVacio();
  state.prods.push({id:'p1',nombre:'Casco anterior',stock:3,stock_minimo:0,precio_venta:100,precio_compra:50});state.revision=1;
  const db=new DatabaseSync(file);db.exec('CREATE TABLE app(id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');db.prepare('INSERT INTO app VALUES(1,?)').run(JSON.stringify(state));db.close();
  return {file,state};
}

test('readLegacyState lee la base anterior sin modificarla y tolera su ausencia',()=>{
  const dir=mkdtempSync(join(tmpdir(),'scorta-legacy-'));
  try{
    assert.equal(readLegacyState(join(dir,'motoshop.sqlite')),undefined);
    assert.equal(existsSync(join(dir,'motoshop.sqlite')),false,'no crea la base heredada');
    const {file,state}=legacyFile(dir),before=readFileSync(file);
    assert.deepEqual(readLegacyState(file),state);
    assert.deepEqual(readFileSync(file),before);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('el servidor siembra la plataforma con los datos anteriores y no expone rutas /api heredadas',{timeout:60000},async t=>{
  const dir=mkdtempSync(join(tmpdir(),'scorta-legacy-server-'));
  legacyFile(dir);
  const child=spawn(process.execPath,[script],{env:{...clean,PORT:'0',HOST:'127.0.0.1',DATA_DIR:dir,SCORTA_OWNER_PASSWORD:'OwnerLegacyFixture.2026!'},stdio:['ignore','pipe','pipe']});
  let out='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>out+=d);
  t.after(()=>new Promise(r=>{if(child.exitCode!==null||child.signalCode!==null)return r();child.once('exit',r);child.kill();}));
  // Hooks run in order: stop the server first, then remove its data directory.
  t.after(()=>rmSync(dir,{recursive:true,force:true,maxRetries:5}));
  const deadline=Date.now()+15000;
  while(!/listo en http:\/\/localhost:(\d+)/.test(out)){if(child.exitCode!==null||Date.now()>deadline)throw Error('El servidor no arrancó:\n'+out);await new Promise(r=>setTimeout(r,50));}
  const base='http://127.0.0.1:'+out.match(/localhost:(\d+)/)[1];
  for(const [method,path] of [['GET','/api/state'],['GET','/api/session'],['GET','/api/backup'],['GET','/api/backup/full'],['GET','/api/productos'],['POST','/api/login']]){
    const response=await fetch(base+path,{method,headers:method==='POST'?{'Content-Type':'application/json',Origin:base}:{},body:method==='POST'?'{"username":"admin","password":"x"}':undefined});
    assert.equal(response.status,403,path);assert.equal((await response.json()).code,'PLATFORM_REQUIRED');
  }
  const login=await fetch(base+'/api/v2/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({company:'Fragola',username:'Steven',password:'OwnerLegacyFixture.2026!'})});
  assert.equal(login.status,200);const body=await login.json();
  assert.ok(body.companies.some(c=>c.name==='Almacén principal'),'la primera preparación copia los datos comerciales anteriores');
});
