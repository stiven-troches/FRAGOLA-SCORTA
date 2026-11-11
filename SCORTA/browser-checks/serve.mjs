import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const directory=mkdtempSync(join(tmpdir(),'scorta-browser-'));
const child=spawn(process.execPath,['server.mjs'],{stdio:'inherit',env:{...process.env,HOST:'127.0.0.1',PORT:'19420',DATA_DIR:directory,NODE_ENV:'development',SCORTA_ADMIN_PASSWORD:'SCORTA-QA-Password-12345'}});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>{rmSync(directory,{recursive:true,force:true});process.exit(code??0)});
