import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readdirSync,existsSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {openStore} from '../server.mjs';
import {createFullBackup,saveFullBackup} from '../backup.mjs';
import {restoreBackup} from '../restore.mjs';
const sandbox=()=>mkdtempSync(join(tmpdir(),'scorta-recovery-test-'));
test('online WAL snapshot restores inventory, users and retry protection via CLI',async()=>{
 const dir=sandbox();let store;
 try{
  const source=join(dir,'source.sqlite');store=openStore(source);store.addUser('admin','contraseña-larga-segura','admin');
  const operation={kind:'producto',revision:0,requestId:'same-request',form:{nombre:'Casco',stock:4,precio_venta:100}};
  store.change(operation,'admin');
  const file=join(dir,'full.sqlite');writeFileSync(file,await store.fullBackup());
  assert.equal(store.read().revision,1);assert.ok(existsSync(source+'-wal'));store.close();store=null;
  const targetDir=join(dir,'restored');
  const result=spawnSync(process.execPath,['restore.mjs',file,'--offline'],{cwd:new URL('..',import.meta.url),env:{...process.env,DATA_DIR:targetDir},encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);store=openStore(join(targetDir,'motoshop.sqlite'));
  assert.equal(store.read().prods[0].stock,4);assert.equal(store.verifyUser('admin','contraseña-larga-segura').role,'admin');
  assert.equal(store.change(operation,'admin').revision,1);assert.equal(store.read().prods.length,1);
 }finally{store?.close();rmSync(dir,{recursive:true,force:true})}
});
test('restore rejects active database, requires offline acknowledgement and retains previous database',async()=>{
 const dir=sandbox();let store;
 try{
  const source=join(dir,'db.sqlite');store=openStore(source);
  const file=join(dir,'full.sqlite');writeFileSync(file,await createFullBackup(source));
  assert.throws(()=>restoreBackup(file,{target:source}),/--offline/);
  assert.throws(()=>restoreBackup(file,{target:source,offline:true}),/WAL/);
  store.close();store=null;
  const result=restoreBackup(file,{target:source,offline:true});assert.equal(result.full,true);assert.ok(existsSync(result.previous));
  const before=readFileSync(source),bad=join(dir,'bad.sqlite');writeFileSync(bad,'not a backup');
  assert.throws(()=>restoreBackup(bad,{target:source,offline:true}));assert.deepEqual(readFileSync(source),before);
 }finally{store?.close();rmSync(dir,{recursive:true,force:true})}
});
test('legacy JSON restores business state, keeps existing users, clears stale retry IDs',()=>{
 const dir=sandbox();let store;
 try{
  const source=join(dir,'db.sqlite');store=openStore(source);store.addUser('admin','contraseña-larga-segura','admin');
  const state=store.read();store.change({kind:'producto',revision:0,requestId:'obsolete',form:{nombre:'Aceite',precio_venta:20}},'admin');store.close();store=null;
  const json=join(dir,'partial.json');writeFileSync(json,JSON.stringify(state));assert.equal(restoreBackup(json,{target:source,offline:true}).full,false);
  store=openStore(source);assert.equal(store.read().prods.length,0);assert.equal(store.listUsers().length,1);store.close();store=null;
  const db=new DatabaseSync(source);assert.equal(db.prepare('SELECT count(*) AS n FROM requests').get().n,0);db.close();
 }finally{store?.close();rmSync(dir,{recursive:true,force:true})}
});
test('retention prunes only generated backups after a successful full snapshot',async()=>{
 const dir=sandbox();let store;
 try{
  const source=join(dir,'db.sqlite');store=openStore(source);const folder=join(dir,'backups');
  for(let i=0;i<3;i++)await saveFullBackup(folder,{source,keep:2});writeFileSync(join(folder,'manual.sqlite'),'keep me');
  await saveFullBackup(folder,{source,keep:2});assert.equal(readdirSync(folder).filter(n=>n.startsWith('scorta-')).length,2);assert.ok(existsSync(join(folder,'manual.sqlite')));
  await assert.rejects(saveFullBackup(folder,{source,keep:1}),/al menos 2/);await assert.rejects(createFullBackup(join(dir,'missing.sqlite')),/no existe/);
 }finally{store?.close();rmSync(dir,{recursive:true,force:true})}
});
