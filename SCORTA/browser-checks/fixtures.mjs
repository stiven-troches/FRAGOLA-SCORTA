import {test as base,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {totpCode,totpCounter} from '../totp.mjs';
export {expect};
// SCORTA_UI_PORT permite correr la suite en paralelo con otra copia del proyecto.
export const ORIGIN='http://127.0.0.1:'+(process.env.SCORTA_UI_PORT||'19420');
// Buzón de correo local que levanta serve.mjs (puerto de la app + 1000): ver serve.mjs.
export const MAIL_ORIGIN='http://127.0.0.1:'+(Number(process.env.SCORTA_UI_PORT||'19420')+1000);
export const OWNER=Object.freeze({company:'QA Owner',username:'qaowner',password:'QA.Owner!2026',name:'QA Owner'});
// Keep the synthetic login burst below the production limit of 60 attempts per minute.
let lastLoginAt=0;
async function paceLogin(){const delay=1100-(Date.now()-lastLoginAt);if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));lastLoginAt=Date.now()}
export const day=offset=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+offset*86400000));
export async function request(api,path,{method='GET',body,companyId='@owner'}={}){
 if(path==='/api/v2/login')await paceLogin();
 const response=await api.fetch(path,{method,headers:{...(method==='POST'?{Origin:ORIGIN}:{}),'X-SCORTA-Company':companyId},...(body?{data:body}:{})});
 const value=await response.json();expect(response.ok(),JSON.stringify(value)).toBeTruthy();return value;
}
export async function action(api,body,companyId='@owner'){
 const data=await request(api,'/api/v2/data',{companyId});
 return request(api,'/api/v2/action',{method:'POST',companyId,body:{revision:data.revision,requestId:randomUUID(),...body}});
}
// Cobertura de la interfaz (npm run test:coverage:ui): con SCORTA_UI_COVERAGE=1 el navegador carga una
// compilación SIN minificar y con mapas de fuente (dist-coverage) y cada prueba guarda la cobertura V8
// de la página principal en test-results/ui-coverage/. Sin la variable no cambia nada.
const COVERAGE_DIR=process.env.SCORTA_UI_COVERAGE?join(process.cwd(),'dist-coverage'):null;
const RAW_DIR=join(process.cwd(),'test-results','ui-coverage','raw');
const SPA_PATH=/^\/(?:recuperar|c\/[^/]+|catalogo\/[^/]+)?\/?$/;
export const test=base.extend({
 page:async({page},use,testInfo)=>{
  if(!COVERAGE_DIR){await use(page);return}
  if(!existsSync(join(COVERAGE_DIR,'index.html')))throw Error('Falta dist-coverage: ejecuta npm run test:coverage:ui.');
  await page.route(url=>url.origin===ORIGIN,async route=>{
   const request=route.request(),url=new URL(request.url());
   if(request.method()==='GET'&&request.resourceType()==='document'&&SPA_PATH.test(url.pathname)){
    const response=await route.fetch();await route.fulfill({response,body:readFileSync(join(COVERAGE_DIR,'index.html'))});return;
   }
   if(request.method()==='GET'&&url.pathname.startsWith('/assets/')){
    const file=join(COVERAGE_DIR,url.pathname);if(existsSync(file)){await route.fulfill({path:file});return}
   }
   await route.fallback();
  });
  await page.coverage.startJSCoverage({resetOnNavigation:false});
  await use(page);
  const entries=await page.coverage.stopJSCoverage().catch(()=>[]);
  const keep=entries.filter(entry=>entry.url.startsWith(ORIGIN+'/assets/')).map(({url,functions})=>({url,functions}));
  mkdirSync(RAW_DIR,{recursive:true});
  writeFileSync(join(RAW_DIR,testInfo.project.name+'-'+testInfo.testId+'-'+testInfo.retry+'.json'),JSON.stringify(keep));
 },
 scenario:async({playwright},use)=>{
  const ownerApi=await playwright.request.newContext({baseURL:ORIGIN}),adminApi=await playwright.request.newContext({baseURL:ORIGIN});
  const suffix=randomUUID().slice(0,8),companyName='QA Moto '+suffix;
  let company;
  try{
   await request(ownerApi,'/api/v2/login',{method:'POST',body:OWNER});
   const created=await action(ownerApi,{type:'company.create',form:{name:companyName,contact:'QA Administrador',email:'qa@example.invalid',whatsapp:'+573001234567',startDate:day(-1),endDate:day(30),monthlyFee:80000,username:'qaadmin',password:'QA.Admin!2026',adminName:'QA Administrador'}});
   company=created.companies.find(item=>item.name===companyName);
   await action(ownerApi,{type:'user.create',companyId:company.id,form:{username:'qavendedor',name:'QA Vendedor',role:'vendedor',password:'QA.Vendedor!2026'}});
   const admin={company:companyName,username:'qaadmin',password:'QA.Admin!2026',name:'QA Administrador'},seller={company:companyName,username:'qavendedor',password:'QA.Vendedor!2026',name:'QA Vendedor'};
   await request(adminApi,'/api/v2/login',{method:'POST',body:admin,companyId:company.id});
   await action(adminApi,{type:'terms.accept'},company.id);
   let data=await action(adminApi,{type:'business.change',payload:{kind:'producto',form:{nombre:'Aceite QA '+suffix,referencia:'QA-'+suffix,categoria:'Lubricantes',stock:50,stock_minimo:2,precio_venta:35000,precio_compra:20000}}},company.id);
   const product=data.state.prods.find(item=>item.referencia==='QA-'+suffix);
   data=await action(adminApi,{type:'mechanic.create',form:{name:'QA Mecánico',percentage:60}},company.id);
   const mechanic=data.state.mechanics.find(item=>item.name==='QA Mecánico');
   // El vendedor entra por la API solo si la prueba lo pide (cada ingreso cuesta ~1 s por el límite de intentos).
   let sellerApi;const asSeller=async()=>{if(!sellerApi){sellerApi=await playwright.request.newContext({baseURL:ORIGIN});await request(sellerApi,'/api/v2/login',{method:'POST',body:seller,companyId:company.id})}return sellerApi};
   try{
   await use({ownerApi,adminApi,company,product,mechanic,admin,seller,owner:OWNER,suffix,
    data:()=>request(adminApi,'/api/v2/data',{companyId:company.id}),
    act:body=>action(adminApi,body,company.id),
    sellerData:async()=>request(await asSeller(),'/api/v2/data',{companyId:company.id}),
    sellerAct:async body=>action(await asSeller(),body,company.id)});
   }finally{await sellerApi?.dispose()}
  }finally{
   if(company)await action(ownerApi,{type:'company.delete',companyId:company.id,form:{confirmation:company.name}}).catch(()=>{});
   await ownerApi.dispose();await adminApi.dispose();
  }
 },
});
export async function login(page,account){
 await page.goto('/');await expect(page.getByLabel('Empresa',{exact:true})).toBeVisible();await expect(page.getByRole('img',{name:'FRAGOLA SCORTA',exact:true})).toBeVisible();await page.getByLabel('Empresa',{exact:true}).fill(account.company);
 await page.getByLabel('Usuario',{exact:true}).fill(account.username);await page.getByLabel('Contraseña',{exact:true}).fill(account.password);
 await paceLogin();await page.getByRole('button',{name:'Ingresar',exact:true}).click();
 await expect(page.getByRole('heading',{name:account===OWNER?'Empresas':/Nueva venta|Resumen general/i}).first()).toBeVisible();
 if(account!==OWNER)await expect(page.getByText('Recuperando venta pendiente…',{exact:true})).toHaveCount(0);
}
export async function navigate(page,name){
 const mobile=page.getByRole('navigation',{name:'Navegación móvil'});
 if(await mobile.isVisible()){
  const direct={"Nueva venta":'Venta',Inventario:'Inventario',Taller:'Taller'}[name];
  if(direct)await mobile.getByRole('button',{name:direct==='Venta'?/^Venta(?: \d+)?$/:direct,exact:true}).click();
  else{await mobile.getByRole('button',{name:'Más',exact:true}).click();await page.getByRole('dialog',{name:'Más opciones'}).getByRole('button',{name,exact:true}).click()}
 }else await page.getByRole('navigation',{name:'Módulos de la empresa'}).getByRole('button',{name:name==='Nueva venta'?/^Nueva venta(?: \d+)?$/:name,exact:true}).click();
}
export async function profile(page){
 const desktop=page.getByTitle(/^Mi perfil:/),owner=page.locator('.ow-profile');
 if(await owner.isVisible())await owner.click();
 else if(await desktop.isVisible())await desktop.click();else await page.getByRole('button',{name:/^Mi perfil/}).click();
 await expect(page.getByRole('dialog',{name:'Mi perfil'})).toBeVisible();
}
export async function addProduct(page,product){
 await navigate(page,'Inventario');await page.getByRole('button',{name:'Tabla',exact:true}).click();await page.getByRole('searchbox',{name:'Buscar productos',exact:true}).fill(product.referencia);
 await page.getByRole('button',{name:'Agregar al carrito',exact:true}).first().click();await navigate(page,'Nueva venta');
}
export async function noOverflow(page){expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(()=>innerWidth)+1)}
export async function waitSaved(page){await expect(page.getByText('Guardado',{exact:true}).first()).toBeVisible()}
// «Ingresar mercancía» busca el producto (nombre, referencia o código + Enter) en lugar de una lista desplegable.
export async function choosePurchaseProduct(dialog,product){
 const search=dialog.getByRole('searchbox',{name:/^Buscar producto/});await search.fill(product.referencia);await search.press('Enter');
 await expect(dialog.getByRole('button',{name:'Cambiar',exact:true})).toBeVisible();
}
// ---- Ayudas de los E2E de crédito, separados, garantías, cotizaciones, 2FA y recuperación ----
// Cobro por la interfaz desde «Nueva venta» con una ficha de cliente ya registrada.
export async function pickCustomer(page,name){
 const summary=page.locator('summary',{hasText:/Agregar cliente|Datos del cliente/});
 if(await summary.isVisible()&&!(await page.getByLabel('Buscar cliente registrado',{exact:true}).isVisible()))await summary.click();
 await page.getByLabel('Buscar cliente registrado',{exact:true}).fill(name);
 await page.getByRole('button',{name:'Usar ficha de '+name,exact:true}).click();
 await expect(page.getByText('Ficha del cliente',{exact:true})).toBeVisible();
}
// Dinero tal como lo pinta la interfaz: $ 70.000 (con espacio duro) → regex tolerante.
export const cop=value=>new RegExp('\\$\\s?'+String(value).replace(/\B(?=(\d{3})+(?!\d))/g,'\\.')+'(?!\\d)');
export async function mails(request){const response=await request.get(MAIL_ORIGIN+'/mails');return response.json()}
export async function clearMails(request){await request.delete(MAIL_ORIGIN+'/mails')}
// TOTP: el servidor rechaza un contador ya usado o anterior (sin reutilización) y acepta ±1 ventana de 30 s.
// Se escoge el siguiente contador válido y, si hace falta, se espera a la ventana siguiente.
export function totpSource(secret){
 let last=-1;
 return async()=>{
  for(;;){
   const current=totpCounter(Date.now()),counter=Math.max(last+1,current-1);
   if(counter<=current+1){last=counter;return {code:await totpCode(secret,counter),counter}}
   await new Promise(resolve=>setTimeout(resolve,1000));
  }
 };
}
// Cerrar sesión en escritorio, celular (menú «Más») o como propietario.
export async function logout(page){
 const mobile=page.getByRole('navigation',{name:'Navegación móvil'});
 if(await mobile.isVisible()){await mobile.getByRole('button',{name:'Más',exact:true}).click();await page.getByRole('dialog',{name:'Más opciones'}).getByRole('button',{name:'Cerrar sesión',exact:true}).click()}
 else await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();
 await expect(page.getByLabel('Empresa',{exact:true})).toBeVisible();
}
