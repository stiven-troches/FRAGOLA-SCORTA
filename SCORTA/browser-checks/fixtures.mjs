import {test as base,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
export {expect};
export const ORIGIN='http://127.0.0.1:19420';
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
export const test=base.extend({
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
   await use({ownerApi,adminApi,company,product,mechanic,admin,seller,owner:OWNER,suffix,
    data:()=>request(adminApi,'/api/v2/data',{companyId:company.id}),
    act:body=>action(adminApi,body,company.id)});
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
 const desktop=page.getByTitle(/^Mi perfil:/);
 if(await desktop.isVisible())await desktop.click();else await page.getByRole('button',{name:/^Mi perfil/}).click();
 await expect(page.getByRole('dialog',{name:'Mi perfil'})).toBeVisible();
}
export async function addProduct(page,product){
 await navigate(page,'Inventario');await page.getByRole('button',{name:'Tabla',exact:true}).click();await page.getByRole('searchbox',{name:'Buscar productos',exact:true}).fill(product.referencia);
 await page.getByRole('button',{name:'Agregar al carrito',exact:true}).first().click();await navigate(page,'Nueva venta');
}
export async function noOverflow(page){expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(()=>innerWidth)+1)}
export async function waitSaved(page){await expect(page.getByText('Guardado',{exact:true}).first()).toBeVisible()}
