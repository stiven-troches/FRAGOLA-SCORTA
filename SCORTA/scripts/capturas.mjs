// FE-24: regenera docs/capturas con las pantallas actuales y SOLO datos ficticios.
//  - Casi todo se captura en la demo compilada (dist-demo), que vive en IndexedDB.
//  - El catálogo público no existe en la demo: se abre en el servidor real con una carpeta de
//    datos temporal y la semilla ficticia de la demo (src/demo-seed.mjs). Nunca usa .env,
//    la base real ni datos de clientes.
// Uso: npm run build && npm run build:demo && npm run capturas
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,statSync,readdirSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,extname,join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {chromium,request as httpRequest} from '@playwright/test';
import {crearSemillaDemo} from '../src/demo-seed.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=join(root,'docs','capturas'),demoDir=join(root,'dist-demo');
const DEMO_PORT=19470,APP_PORT=19471,MAX_BYTES=400*1024;
const VIEWPORTS=[
 {name:'escritorio',viewport:{width:1440,height:900},deviceScaleFactor:1,isMobile:false,hasTouch:false},
 {name:'movil',viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true},
];
for(const file of ['dist-demo/index.html','dist/index.html'])if(!existsSync(join(root,file)))throw Error(`Falta ${file}. Ejecuta antes «npm run build» y «npm run build:demo».`);

// ---------- Servidor estático de la demo: rechaza cualquier /api real ----------
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.json':'application/json','.woff2':'font/woff2'};
const apiCalls=[];
const demoServer=createServer((req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path.startsWith('/api/')){apiCalls.push(req.method+' '+path);res.writeHead(404);return res.end()}
 try{const file=resolve(demoDir,'.'+decodeURIComponent(path==='/'?'/index.html':path));if(!file.startsWith(demoDir+sep)||!statSync(file).isFile())throw Error();res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(readFileSync(file))}
 catch{res.writeHead(404);res.end()}
});
await new Promise(ok=>demoServer.listen(DEMO_PORT,'127.0.0.1',ok));

// ---------- Servidor real aislado para el catálogo público ----------
const dataDir=mkdtempSync(join(tmpdir(),'scorta-capturas-'));
const OWNER={company:'Capturas Owner',username:'capowner',password:'Capturas.Owner!2026',name:'Propietario ficticio'};
const app=spawn(process.execPath,['server.mjs'],{cwd:root,stdio:['ignore','ignore','inherit'],env:{...process.env,
 HOST:'127.0.0.1',PORT:String(APP_PORT),DATA_DIR:dataDir,NODE_ENV:'development',SCORTA_PUBLIC_URL:'',DATABASE_URL:'',
 SCORTA_OWNER_COMPANY:OWNER.company,SCORTA_OWNER_USER:OWNER.username,SCORTA_OWNER_NAME:OWNER.name,SCORTA_OWNER_PASSWORD:OWNER.password,
 SCORTA_OWNER_EMAIL:'owner@example.invalid',SCORTA_OWNER_CONTACT:'',SCORTA_ADMIN_PASSWORD:'',SCORTA_ALLOW_LOCAL:'0',SCORTA_TEST_COMPANY:'0'}});
// En Windows el servidor debe terminar antes de borrar su carpeta temporal.
const appExit=new Promise(ok=>app.once('exit',ok));
async function cleanup(){try{app.kill()}catch{}demoServer.close();await Promise.race([appExit,new Promise(ok=>setTimeout(ok,5000))]);try{rmSync(dataDir,{recursive:true,force:true,maxRetries:5,retryDelay:200})}catch(error){console.warn('No se pudo borrar '+dataDir+': '+error.message)}}

const APP=`http://127.0.0.1:${APP_PORT}`,DEMO=`http://127.0.0.1:${DEMO_PORT}`;
const day=offset=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+offset*86400000));
async function waitFor(url){for(let i=0;i<100;i++){try{if((await fetch(url)).ok)return}catch{}await new Promise(r=>setTimeout(r,200))}throw Error('El servidor no respondió: '+url)}
async function call(api,path,{method='GET',body,companyId='@owner'}={}){
 const response=await api.fetch(path,{method,headers:{...(method==='POST'?{Origin:APP}:{}),'X-SCORTA-Company':companyId},...(body?{data:body}:{})});
 const value=await response.json();if(!response.ok())throw Error(path+': '+JSON.stringify(value));return value;
}
async function act(api,body,companyId='@owner'){const data=await call(api,'/api/v2/data',{companyId});return call(api,'/api/v2/action',{method:'POST',companyId,body:{revision:data.revision,requestId:randomUUID(),...body}})}

async function prepareCatalog(){
 await waitFor(APP);
 const owner=await httpRequest.newContext({baseURL:APP}),admin=await httpRequest.newContext({baseURL:APP});
 try{
  await call(owner,'/api/v2/login',{method:'POST',body:OWNER});
  const name='Moto Norte',created=await act(owner,{type:'company.create',form:{name,contact:'Laura Gómez',email:'contacto@example.com',whatsapp:'+573001234567',address:'Calle 10 # 20-30 (ficticia)',startDate:day(-1),endDate:day(30),monthlyFee:80000,username:'adminnorte',password:'Demo.Norte!2026',adminName:'Laura Gómez'}});
  const company=created.companies.find(c=>c.name===name);
  await call(admin,'/api/v2/login',{method:'POST',body:{company:name,username:'adminnorte',password:'Demo.Norte!2026'},companyId:company.id});
  await act(admin,{type:'terms.accept'},company.id);
  for(const p of crearSemillaDemo().prods.filter(p=>p.stock>0).slice(0,12)){
   const form=Object.fromEntries(['nombre','categoria','referencia','marca','descripcion','modelo','compatibilidad','precio_compra','precio_venta','stock','stock_minimo'].map(key=>[key,p[key]]));
   await act(admin,{type:'business.change',payload:{kind:'producto',form}},company.id);
  }
  await act(owner,{type:'catalog.update',companyId:company.id,form:{enabled:true,primary:'#1644d8',secondary:'#edf2ff',headline:'Todo para tu moto',description:'Cascos, lubricantes y accesorios. Pide por WhatsApp.'}});
  return company.slug;
 }finally{await owner.dispose();await admin.dispose()}
}

// ---------- Utilidades de captura ----------
const written=[];
async function shot(page,file,{fullPage=false}={}){
 await page.evaluate(()=>document.fonts?.ready);await page.waitForTimeout(250);
 const path=join(out,file);
 let buffer=await page.screenshot({path,fullPage,animations:'disabled',caret:'hide'});
 // Si pesa demasiado, se repite sin página completa (solo la vista).
 if(buffer.length>MAX_BYTES&&fullPage)buffer=await page.screenshot({path,animations:'disabled',caret:'hide'});
 written.push({file,bytes:buffer.length});
}
const banner=page=>page.getByRole('region',{name:'Demostración de SCORTA'});
async function role(page,name,heading){
 const button=banner(page).getByRole('button',{name,exact:true});await button.click();
 await button.waitFor({state:'visible'});await page.getByRole('heading',{name:heading,exact:true}).first().waitFor();
 await page.getByText('Recuperando venta pendiente…',{exact:true}).waitFor({state:'detached'}).catch(()=>{});
}
async function navigate(page,name){
 const mobile=page.getByRole('navigation',{name:'Navegación móvil'});
 if(await mobile.isVisible()){
  const direct={'Nueva venta':/^Venta(?: \d+)?$/,Inventario:'Inventario'}[name];
  if(direct)await mobile.getByRole('button',{name:direct,exact:true}).click();
  else{await mobile.getByRole('button',{name:'Más',exact:true}).click();await page.getByRole('dialog',{name:'Más opciones'}).getByRole('button',{name,exact:true}).click()}
 }else await page.getByRole('navigation',{name:'Módulos de la empresa'}).getByRole('button',{name:name==='Nueva venta'?/^Nueva venta(?: \d+)?$/:name,exact:true}).click();
}
// Escritorio: desde arriba. Celular: la lista de productos (el encabezado ocupa la primera pantalla).
const showInventory=async(page,vp)=>{if(vp.isMobile)await page.getByRole('button',{name:'Tarjetas',exact:true}).evaluate(el=>el.scrollIntoView({block:'center'}));else await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(300)};
const closeDialog=async page=>{await page.keyboard.press('Escape');await page.waitForTimeout(200)};

async function captureDemo(browser,vp){
 const context=await browser.newContext({baseURL:DEMO,viewport:vp.viewport,deviceScaleFactor:vp.deviceScaleFactor,isMobile:vp.isMobile,hasTouch:vp.hasTouch,timezoneId:'America/Bogota',locale:'es-CO',colorScheme:'light'});
 const page=await context.newPage();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.accept());
 const suffix='-'+vp.name+'.png';
 try{
  await page.goto('/');await banner(page).getByRole('button',{name:'Propietario',exact:true}).waitFor();
  await page.getByLabel('Empresa',{exact:true}).waitFor();
  await shot(page,'ingreso'+suffix);
  await role(page,'Propietario','Empresas');await shot(page,'propietario'+suffix);
  await role(page,'Administrador','RESUMEN GENERAL');
  await navigate(page,'Inventario');
  await page.getByRole('button',{name:'Tarjetas',exact:true}).click();await showInventory(page,vp);await shot(page,'inventario-tarjetas'+suffix);
  await page.getByRole('button',{name:'Tabla',exact:true}).click();await showInventory(page,vp);await shot(page,'inventario-tabla'+suffix);
  await navigate(page,'Resumen general');
  await page.locator('summary',{hasText:'Administración'}).first().click();
  await page.getByRole('button',{name:'Cierre de caja',exact:true}).first().click();
  const cash=page.getByRole('dialog',{name:'Cierre de caja'});await cash.waitFor();await shot(page,'cierre-caja'+suffix);
  await closeDialog(page);if(await cash.isVisible())await cash.getByRole('button',{name:/Cerrar/}).first().click();
  await role(page,'Vendedor','Nueva venta');
  await navigate(page,'Inventario');await page.getByRole('button',{name:'Tabla',exact:true}).click();
  for(const reference of ['CAS-001','ACE-001','GUA-001']){
   const search=page.getByRole('searchbox',{name:'Buscar productos',exact:true});await search.fill(reference);
   await page.getByRole('button',{name:'Agregar al carrito',exact:true}).first().click();
  }
  await navigate(page,'Nueva venta');
  await page.getByText('Guardado',{exact:true}).first().waitFor();
  // El aviso «… agregado a la venta» se oculta solo a los 6 s.
  await page.getByText(/agregado a la venta/).first().waitFor({state:'detached',timeout:10000}).catch(()=>{});
  if(vp.isMobile)await page.getByRole('heading',{name:'Carrito'}).first().evaluate(el=>el.scrollIntoView({block:'start'})).catch(()=>{});
  await shot(page,'venta-carrito'+suffix,{fullPage:!vp.isMobile});
  await page.getByRole('button',{name:'Registrar venta',exact:true}).click();
  await page.getByRole('dialog',{name:'Detalle de venta'}).waitFor();await shot(page,'comprobante'+suffix);
  if(apiCalls.length)throw Error('La demo llamó a la API real: '+apiCalls.join(', '));
 }finally{await context.close()}
}

async function captureCatalog(browser,vp,slug){
 const context=await browser.newContext({baseURL:APP,viewport:vp.viewport,deviceScaleFactor:vp.deviceScaleFactor,isMobile:vp.isMobile,hasTouch:vp.hasTouch,timezoneId:'America/Bogota',locale:'es-CO',colorScheme:'light'});
 const page=await context.newPage();
 try{
  await page.goto('/catalogo/'+slug);await page.getByRole('heading',{name:'Todo para tu moto',exact:true}).waitFor();
  await page.locator('.shop-card').first().waitFor();
  await shot(page,'catalogo-publico-'+vp.name+'.png',{fullPage:true});
 }finally{await context.close()}
}

let browser;
try{
 mkdirSync(out,{recursive:true});
 // Reemplaza las capturas viejas: la carpeta solo contiene lo que genera este script.
 for(const file of readdirSync(out))if(file.endsWith('.png'))unlinkSync(join(out,file));
 const slug=await prepareCatalog();
 browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 for(const vp of VIEWPORTS){await captureDemo(browser,vp);await captureCatalog(browser,vp,slug)}
 const heavy=written.filter(w=>w.bytes>MAX_BYTES);
 for(const w of written)console.log(`${w.file.padEnd(34)} ${(w.bytes/1024).toFixed(0).padStart(4)} KB`);
 if(heavy.length)throw Error('Capturas por encima de 400 KB: '+heavy.map(w=>w.file).join(', '));
 console.log(`Listo: ${written.length} capturas en docs/capturas.`);
}catch(error){console.error(error);process.exitCode=1}
finally{await browser?.close();await cleanup();process.exit(process.exitCode??0)}
