// Dedicated HTTP fixture for PlatformApp. Never opens a real database or .env.
// Además levanta un «buzón» local (puerto de la app + 1000): el servidor lo usa como webhook de
// correo, de modo que las pruebas E2E de verificación y recuperación leen los correos reales que la
// aplicación envía, sin salir a internet. GET /mails → lista; DELETE /mails → vacía.
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
if(!existsSync('dist/index.html'))throw Error('Compila SCORTA antes de ejecutar esta suite.');
const directory=mkdtempSync(join(tmpdir(),'scorta-platform-browser-'));
const appPort=Number(process.env.SCORTA_UI_PORT||'19420'),mailPort=appPort+1000;
const mails=[];
const mailbox=createServer(async(req,res)=>{
 if(req.method==='POST'){let raw='';for await(const chunk of req)raw+=chunk;try{mails.push({at:new Date().toISOString(),...JSON.parse(raw||'{}')})}catch{}res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"ok":true}')}
 if(req.method==='DELETE'){mails.length=0;res.writeHead(204);return res.end()}
 res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(mails));
});
await new Promise((resolve,reject)=>{mailbox.once('error',reject);mailbox.listen(mailPort,'127.0.0.1',resolve)});
const child=spawn(process.execPath,['server.mjs'],{stdio:'inherit',env:{...process.env,
 HOST:'127.0.0.1',PORT:String(appPort),DATA_DIR:directory,NODE_ENV:'development',SCORTA_PUBLIC_URL:'http://127.0.0.1:'+appPort,
 SCORTA_MAIL_WEBHOOK_URL:'http://127.0.0.1:'+mailPort+'/mail',SCORTA_MAIL_WEBHOOK_SECRET:'',SCORTA_MAIL_FROM:'SCORTA QA <qa@example.invalid>',
 SCORTA_OWNER_COMPANY:'QA Owner',SCORTA_OWNER_USER:'qaowner',SCORTA_OWNER_NAME:'QA Owner',
 SCORTA_OWNER_PASSWORD:'QA.Owner!2026',SCORTA_OWNER_EMAIL:'owner@example.invalid',SCORTA_OWNER_CONTACT:'',
 SCORTA_ADMIN_PASSWORD:'',SCORTA_ALLOW_LOCAL:'0',SCORTA_TEST_COMPANY:'0'}});
let stopping=false;
const cleanup=()=>{mailbox.close();rmSync(directory,{recursive:true,force:true})};
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{if(stopping)return;stopping=true;child.kill(signal);setTimeout(()=>child.kill('SIGKILL'),5000).unref()});
child.on('error',error=>{cleanup();console.error(error.message);process.exit(1)});
child.on('exit',code=>{cleanup();process.exit(stopping?0:code??1)});
