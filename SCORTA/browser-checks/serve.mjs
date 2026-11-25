// Dedicated HTTP fixture for PlatformApp. Never opens a real database or .env.
import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
if(!existsSync('dist/index.html'))throw Error('Compila SCORTA antes de ejecutar esta suite.');
const directory=mkdtempSync(join(tmpdir(),'scorta-platform-browser-'));
const child=spawn(process.execPath,['server.mjs'],{stdio:'inherit',env:{...process.env,
 HOST:'127.0.0.1',PORT:process.env.SCORTA_UI_PORT||'19420',DATA_DIR:directory,NODE_ENV:'development',SCORTA_PUBLIC_URL:'',
 SCORTA_OWNER_COMPANY:'QA Owner',SCORTA_OWNER_USER:'qaowner',SCORTA_OWNER_NAME:'QA Owner',
 SCORTA_OWNER_PASSWORD:'QA.Owner!2026',SCORTA_OWNER_EMAIL:'owner@example.invalid',SCORTA_OWNER_CONTACT:'',
 SCORTA_ADMIN_PASSWORD:'',SCORTA_ALLOW_LOCAL:'0',SCORTA_TEST_COMPANY:'0'}});
let stopping=false;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{if(stopping)return;stopping=true;child.kill(signal);setTimeout(()=>child.kill('SIGKILL'),5000).unref()});
child.on('error',error=>{rmSync(directory,{recursive:true,force:true});console.error(error.message);process.exit(1)});
child.on('exit',code=>{rmSync(directory,{recursive:true,force:true});process.exit(stopping?0:code??1)});
