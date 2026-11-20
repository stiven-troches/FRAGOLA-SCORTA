import {DatabaseSync} from 'node:sqlite';
import {writeFileSync,rmSync} from 'node:fs';

// SQLite reads the committed database, including WAL, into an independent file.
// VACUUM INTO keeps the restore APIs synchronous and does not modify the source.
export function snapshotForRestore(source,target){
  writeFileSync(target,'',{flag:'wx',mode:0o600});
  let db;
  try{
    db=new DatabaseSync(source,{readOnly:true});
    db.exec('PRAGMA busy_timeout=5000');
    db.prepare('VACUUM INTO ?').run(target);
  }catch(error){rmSync(target,{force:true});throw error;}
  finally{db?.close();}
}
