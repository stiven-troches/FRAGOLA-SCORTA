import {readFileSync} from 'node:fs';
import {createPlatform} from './platform.mjs';
import {estadoVacio,aplicarCambio} from './inventory.mjs';
import {PLAN_FEATURE_KEYS} from './plan-limits.mjs';

// Cuenta ficticia pública de pruebas. No sirve para entrar como propietario.
export const TEST_COMPANY={id:'scorta-test-moto-central-v1',name:'Moto Central Demo',slug:'moto-central-demo',username:'demo.admin',seller:'demo.vendedor',password:'Demo.MotoCentral.2026'};
const SEED='moto-central-v1';
// Las credenciales anteriores son públicas: la empresa solo se crea si se pide de forma explícita
// (SCORTA_TEST_COMPANY=1) y, con NODE_ENV=production, además con SCORTA_TEST_COMPANY_PRODUCTION=1.
export function testCompanyEnabled(env=process.env){
 if(env.SCORTA_TEST_COMPANY!=='1')return false;
 return env.NODE_ENV!=='production'||env.SCORTA_TEST_COMPANY_PRODUCTION==='1';
}
// Topes del plan: una cuenta con contraseña pública no puede crecer sin límite dentro del estado compartido.
export const TEST_COMPANY_PLAN=Object.freeze({maxUsers:3,maxProducts:60,maxPhotos:40});
const groups=[
 {asset:'helmet',prefix:'CAS',name:'Casco integral negro',category:'Cascos',brand:'Ruta Demo',variants:['M','L','XL','XXL'],cost:120000,price:180000,description:'Casco integral negro con visor transparente. Elige la talla que deseas probar.'},
 {asset:'oil',prefix:'ACE',name:'Aceite 4T 1 litro',category:'Lubricantes',brand:'Motor Demo',variants:['10W-40','15W-50','20W-50','5W-40'],cost:22000,price:35000,description:'Aceite para motor de motocicleta de cuatro tiempos. Presentación de un litro.'},
 {asset:'gloves',prefix:'GUA',name:'Guantes de moto negros',category:'Protección',brand:'Ruta Demo',variants:['S','M','L','XL'],cost:38000,price:65000,description:'Par de guantes negros para motociclista con protección en los nudillos.'},
 {asset:'brakes',prefix:'FRE',name:'Pastillas de freno',category:'Frenos',brand:'Freno Demo',variants:['Referencia A','Referencia B','Referencia C','Referencia D'],cost:18000,price:32000,description:'Juego de pastillas de freno. Las referencias de esta tienda son ficticias.'},
 {asset:'filter',prefix:'FIL',name:'Filtro de aire',category:'Filtros',brand:'Motor Demo',variants:['Referencia A','Referencia B','Referencia C','Referencia D'],cost:14000,price:25000,description:'Filtro de aire de papel plisado con marco de goma. Referencia de demostración.'},
 {asset:'holder',prefix:'SOP',name:'Soporte de celular',category:'Accesorios',brand:'Ruta Demo',variants:['Referencia A','Referencia B','Referencia C','Referencia D'],cost:22000,price:39000,description:'Soporte ajustable para celular y manubrio de motocicleta. Referencia de demostración.'},
];
const image=name=>'data:image/webp;base64,'+readFileSync(new URL('./public/test-shop/'+name+'.webp',import.meta.url)).toString('base64');

export async function seedTestCompany(state,{now=Date.now()}={}){
 // El marcador también conserva un borrado voluntario: nunca repone datos al reiniciar.
 if(state.seededFixtures?.[SEED])return state;
 if(state.companies.some(c=>c.id===TEST_COMPANY.id))return state;
 const used=new Set(state.companies.flatMap(c=>[c.name.toLowerCase(),c.slug.toLowerCase()]));used.add(state.ownerCompany.toLowerCase());
 let name=TEST_COMPANY.name,slug=TEST_COMPANY.slug,n=1;
 while(used.has(name.toLowerCase())||used.has(slug.toLowerCase())){n++;name=TEST_COMPANY.name+' '+n;slug=TEST_COMPANY.slug+'-'+n;}
 const at=new Date(now).toISOString(),day=offset=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Number(new Date(now))+offset*86400000));
 const pictures=Object.fromEntries([...groups.map(g=>g.asset),'logo'].map(asset=>[asset,image(asset)]));
 const fixture=await createPlatform({owner:{company:'Semilla ficticia',username:TEST_COMPANY.username,password:TEST_COMPANY.password,name:'Administrador de pruebas'}});
 const template=fixture.users[0];
 const admin={...template,companyId:TEST_COMPANY.id,role:'admin',createdAt:at,passwordChangedAt:at};
 const seller={...structuredClone(admin),id:crypto.randomUUID(),username:TEST_COMPANY.seller,name:'Vendedor de pruebas',role:'vendedor'};
 let business=estadoVacio();
 for(const [groupIndex,group] of groups.entries())for(const [i,variant] of group.variants.entries()){
  const index=groupIndex*4+i,stock=[8,16,3,12,30,22,18,14,10,7,2,9,20,15,11,6,18,13,0,9,12,8,5,0][index];
  business=aplicarCambio(business,{kind:'producto',revision:business.revision,form:{nombre:group.name+' · '+variant,referencia:`${group.prefix}-DEMO-${i+1}`,marca:group.brand,categoria:group.category,modelo:variant,descripcion:group.description+' Producto ficticio para pruebas. Fotografía ilustrativa generada con IA.',compatibilidad:'Datos ficticios: no usar como guía de compatibilidad real.',codigo_barras:String(9900000000000+index),stock,stock_minimo:4,precio_compra:group.cost+i*1000,precio_venta:group.price+i*2000,garantia_dias:30,precios:{mecanico:group.price-3000,mayorista:group.price-5000}}},'Semilla de pruebas',now);
 }
 const item=(ref,qty)=>{const p=business.prods.find(p=>p.referencia===ref);return {producto_id:p.id,cantidad:qty,precio_unitario:p.precio_venta}};
 const purchase=business.prods.find(p=>p.referencia==='ACE-DEMO-1');
 business=aplicarCambio(business,{kind:'compra',revision:business.revision,form:{fecha:day(-2),proveedor:'Proveedor ficticio Demo'},items:[{producto_id:purchase.id,cantidad:6,precio_unitario:purchase.precio_compra}]},'Semilla de pruebas',now);
 for(const [i,ref] of ['CAS-DEMO-2','ACE-DEMO-1','GUA-DEMO-1'].entries()){
  business=aplicarCambio(business,{kind:'venta',revision:business.revision,form:{fecha:day(-i),cliente:'Cliente ficticio '+(i+1)},items:[item(ref,i===1?2:1)]},'Semilla de pruebas',now);
  Object.assign(business.ventas[0],{paymentMethod:['efectivo','tarjeta','transferencia'][i],userId:admin.id});
 }
 // El motor de inventario no gestiona imágenes: se adjuntan después de crear el historial.
 for(const product of business.prods){const group=groups.find(g=>product.referencia.startsWith(g.prefix+'-'));product.foto=pictures[group.asset];}
 const company={id:TEST_COMPANY.id,name,slug,isTestCompany:true,seedVersion:1,enabled:true,startDate:'2026-01-01',endDate:'2099-12-31',monthlyFee:0,plan:{...TEST_COMPANY_PLAN,features:[...PLAN_FEATURE_KEYS]},createdAt:at,contact:'Negocio ficticio para pruebas',email:'pruebas@example.invalid',whatsapp:'',nit:'DEMO-SIN-VALOR',address:'Empresa ficticia · Solo para pruebas',logo:pictures.logo,catalog:{enabled:true,primary:'#1644d8',secondary:'#edf2ff',headline:'Tu moto merece lo mejor.',description:'Tienda de demostración: productos, fotos y precios ficticios para explorar el catálogo.'}};
 return {...state,revision:state.revision+1,companies:[...state.companies,company],users:[...state.users,admin,seller],businesses:{...state.businesses,[company.id]:business},seededFixtures:{...state.seededFixtures,[SEED]:company.id},audit:[{id:crypto.randomUUID(),fecha:at,usuario:'Sistema',accion:'test-company.seed',companyId:company.id,productos:business.prods.length},...state.audit]};
}
