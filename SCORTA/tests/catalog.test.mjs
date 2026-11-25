import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPlatform,platformRequest} from '../platform.mjs';
import {catalogHead,cleanCatalog,whatsappNumber,catalogDefaults} from '../catalog.mjs';
import {contrastText} from '../src/catalog-ui.mjs';
const now='2026-11-22T18:00:00Z',password='CatalogTest!2026';
async function fixture(){
 let state=await createPlatform({owner:{company:'Owner',username:'owner',password}});
 const call=async(path,body,token)=>{const r=await platformRequest(state,{path,method:body===undefined?'GET':'POST',body,token},{now});state=r.state;return r};
 const owner=(await call('/api/v2/login',{company:'Owner',username:'owner',password})).token;
 let n=0;const action=(token,body)=>call('/api/v2/action',{requestId:'catalog-'+ ++n,...body},token);
 const created=await action(owner,{type:'company.create',form:{name:'Tienda Uno',username:'admin',password,whatsapp:'3001234567',startDate:'2026-11-01',endDate:'2026-12-30'}});
 assert.equal(created.status,200,JSON.stringify(created.body));const company=created.body.companies[0];
 const admin=(await call('/api/v2/login',{company:company.slug,username:'admin',password})).token;
 await action(owner,{type:'user.create',companyId:company.id,form:{name:'Vendedor',username:'seller',password,role:'vendedor'}});
 const seller=(await call('/api/v2/login',{company:company.slug,username:'seller',password})).token;
 const add=await action(admin,{type:'business.change',payload:{kind:'producto',form:{nombre:'Aceite',descripcion:'Aceite para motor',stock:3,precio_venta:35000,precio_compra:15000,categoria:'Lubricantes'}}});
 const product=add.body.state.prods[0];
 return {call,action,owner,admin,seller,company,product,get state(){return state},url:'/api/v2/catalog/'+company.slug};
}
test('catálogo público: publicación explícita, proyección sin datos privados y agotados ocultos',async()=>{
 const f=await fixture();assert.equal((await f.call(f.url)).status,404);
 let r=await f.action(f.admin,{type:'catalog.update',companyId:f.company.id,form:{enabled:true}});assert.equal(r.status,200);
 await f.action(f.admin,{type:'business.change',payload:{kind:'producto',form:{nombre:'Agotado',stock:0,precio_venta:10}}});
 const before=structuredClone(f.state);r=await f.call(f.url);assert.equal(r.status,200);assert.deepEqual(f.state,before);
 assert.equal(r.body.company.name,'Tienda Uno');assert.equal(r.body.products.length,1);assert.equal(r.body.products[0].descripcion,'Aceite para motor');
 for(const key of ['stock','precio_compra','costHistory','userId','stock_minimo'])assert.ok(!(key in r.body.products[0]));
 for(const key of ['users','audit','payments','ventas','sessions','email','monthlyFee'])assert.ok(!(key in r.body)&&!(key in r.body.company));
 assert.equal((await f.call(f.url+'/photo/no-existe')).status,404);
});
test('checkout usa precios actuales, no modifica datos y comprueba cantidades sin revelar existencias',async()=>{
 const f=await fixture();await f.action(f.admin,{type:'catalog.update',form:{enabled:true}});
 const before=structuredClone(f.state),items=[{id:f.product.id,quantity:2,price:1}];
 let r=await f.call(f.url+'/checkout',{items});assert.equal(r.status,200);assert.equal(r.body.total,70000);assert.deepEqual(f.state,before);
 assert.match(r.body.url,/^https:\/\/wa.me\/573001234567\?text=/);assert.match(decodeURIComponent(r.body.url),/2 × Aceite/);
 for(const quantity of [0,1.5,1000]){r=await f.call(f.url+'/checkout',{items:[{id:f.product.id,quantity}]});assert.equal(r.status,409);assert.ok(!r.body.error.includes('3'))}
 // Más unidades que las existencias (3): se acepta y el negocio confirma por WhatsApp; así no se revela el inventario.
 r=await f.call(f.url+'/checkout',{items:[{id:f.product.id,quantity:4}]});assert.equal(r.status,200);assert.equal(r.body.total,140000);
 assert.equal((await f.call(f.url+'/checkout',{items:[]})).status,400);
 assert.equal((await f.call(f.url+'/checkout',{items:[...items,...items]})).status,409);
 await f.action(f.admin,{type:'business.change',payload:{kind:'ajuste',id:f.product.id,form:{stock:0,motivo:'Prueba agotado'}}});
 assert.equal((await f.call(f.url+'/checkout',{items})).status,409);
});
test('administrador no modifica otra empresa, vendedor no configura y contrato vencido o suspendido oculta catálogo',async()=>{
 const f=await fixture();assert.equal((await f.action(f.seller,{type:'catalog.update',form:{enabled:true}})).status,403);
 assert.equal((await f.action(f.admin,{type:'catalog.update',companyId:'otra',form:{enabled:true}})).status,403);
 await f.action(f.owner,{type:'catalog.update',companyId:f.company.id,form:{enabled:true}});
 await f.action(f.owner,{type:'company.access',companyId:f.company.id,form:{enabled:false}});assert.equal((await f.call(f.url)).status,404);
 await f.action(f.owner,{type:'company.access',companyId:f.company.id,form:{enabled:true}});
 await f.action(f.owner,{type:'company.update',companyId:f.company.id,form:{endDate:'2026-11-20'}});assert.equal((await f.call(f.url)).status,404);
 assert.equal((await f.call('/api/v2/catalog/otra')).status,404);
});
test('WhatsApp, colores y configuración inválidos no se guardan',async()=>{
 assert.equal(whatsappNumber('300 123 4567'),'573001234567');assert.equal(whatsappNumber('abc'),'');assert.equal(whatsappNumber('+1 212 555 0100'),'12125550100');
 assert.equal(contrastText('#ffffff'),'#000000');assert.equal(contrastText('#000000'),'#ffffff');
 assert.deepEqual(cleanCatalog({}),catalogDefaults);assert.throws(()=>cleanCatalog({primary:'red'}));assert.throws(()=>cleanCatalog({enabled:'yes'}));
 const f=await fixture();assert.equal((await f.action(f.admin,{type:'catalog.update',form:{enabled:true,whatsapp:''}})).status,400);assert.equal((await f.call(f.url)).status,404);
});

test('la página compartida usa la marca del negocio y escapa texto HTML',()=>{
 const source='<head><meta name="description" content="SCORTA"><link rel="manifest" href="/manifest"><link rel="icon" href="/scorta.png"><title>SCORTA</title></head>';
 const html=catalogHead(source,{name:'Tienda <script>',catalog:{description:'Comillas " y <texto>'}});
 assert.ok(!html.includes('SCORTA')&&!html.includes('<script>')&&!html.includes('rel="manifest"'));assert.match(html,/Tienda &lt;script&gt;/);assert.match(html,/&quot;/);assert.match(catalogHead(source),/Catálogo/);
});

test('catálogo: precio con IVA igual al de caja y logo servido por URL',async()=>{
 const f=await fixture();await f.action(f.admin,{type:'catalog.update',form:{enabled:true}});
 let r=await f.call(f.url);assert.equal(r.body.products[0].precio_venta,35000);
 // Precios registrados sin IVA: el catálogo suma el 19 % como la caja.
 const business=f.state.businesses[f.company.id];business.settings={vat:{enabled:true,defaultRate:19,pricesIncludeVat:false}};
 r=await f.call(f.url);assert.equal(r.body.products[0].precio_venta,41650);
 r=await f.call(f.url+'/checkout',{items:[{id:f.product.id,quantity:2}]});assert.equal(r.body.total,83300);assert.match(decodeURIComponent(r.body.url),/83.300/);
 assert.equal(r.body.lines[0].price,41650);
 assert.equal((await f.call(f.url+'/logo')).status,404,'sin logo');
 f.state.companies.find(c=>c.id===f.company.id).logo='data:image/png;base64,iVBORw0KGgo=';
 r=await f.call(f.url);assert.equal(r.body.company.logo,f.url+'/logo');assert.ok(!JSON.stringify(r.body).includes('base64'));
 r=await f.call(f.url+'/logo');assert.equal(r.status,200);assert.match(r.body.image,/^data:image\/png/);
 assert.ok(catalogHead('<head><title>x</title></head>',{name:'T',slug:'tienda-uno',logo:'/x'}).includes('href="/api/v2/catalog/tienda-uno/logo"'));
});
