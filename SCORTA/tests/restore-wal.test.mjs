import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,statSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {restorePlatformBackup} from '../platform-backup.mjs';
import {validatePlatformDatabase} from '../platform-server.mjs';
import {estadoVacio} from '../inventory.mjs';

test('platform restore snapshots committed WAL, preserves the old target and removes sessions only',()=>{
  const dir=mkdtempSync(join(tmpdir(),'scorta-platform-wal-'));
  const source=join(dir,'source.sqlite'),target=join(dir,'target.sqlite');let db;
  const initial={schemaVersion:1,revision:1,users:[],companies:[],businesses:{fixture:estadoVacio()},sessions:{active:{userId:'fixture'}},requests:{}};
  const changed=structuredClone(initial);changed.revision=2;changed.businesses.fixture.prods.push({id:'p',nombre:'Prueba',stock:3});changed.requests.receipt={fingerprint:'retained'};
  try{
    db=new DatabaseSync(source);db.exec('PRAGMA journal_mode=WAL;CREATE TABLE platform(id INTEGER PRIMARY KEY,data TEXT NOT NULL,storage_version INTEGER NOT NULL DEFAULT 0)');
    db.prepare('INSERT INTO platform VALUES(1,?,0)').run(JSON.stringify(initial));db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    db.prepare('UPDATE platform SET data=?,storage_version=1 WHERE id=1').run(JSON.stringify(changed));
    assert.ok(statSync(source+'-wal').size>0);
    const old=new DatabaseSync(target);old.exec('CREATE TABLE platform(id INTEGER PRIMARY KEY,data TEXT,storage_version INTEGER)');old.prepare('INSERT INTO platform VALUES(1,?,0)').run(JSON.stringify(initial));old.close();
    const result=restorePlatformBackup(source,target,{offline:true});
    // BE-03: restore also empties pending sale drafts (their requestId may have been charged after the backup).
    assert.deepEqual(validatePlatformDatabase(target),{...changed,sessions:{},saleDrafts:{}});
    assert.deepEqual(validatePlatformDatabase(source),changed,'Source sessions and committed changes stay intact');
    assert.deepEqual(validatePlatformDatabase(result.previous),initial);
    // POSIX permissions are not enforced by chmod on Windows.
    if(process.platform!=='win32')assert.equal(statSync(target).mode&0o777,0o600);
    assert.throws(()=>restorePlatformBackup(source,source,{offline:true}),/diferentes/);
    assert.equal(existsSync(target+'-wal'),false);
  }finally{db?.close();rmSync(dir,{recursive:true,force:true});}
});
