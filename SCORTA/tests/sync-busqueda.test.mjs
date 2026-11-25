// BE-29 (recarga incremental con versión del sobre) y BE-28 (búsqueda paginada en el servidor).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qaPlatform,ok,STAFF_PASSWORD,AT_D,AT_D1} from './qa-fixture.mjs';

const tagged=async(f,actor,ifNoneMatch,extra={})=>f.call(actor,'/api/v2/data',undefined,{etag:true,...(ifNoneMatch?{ifNoneMatch}:{}),...extra});

test('BE-29: 304 sin cuerpo si nada cambió; sin etag:true la respuesta no cambia',async()=>{
 const f=await qaPlatform();const A=await f.shop('Sync Uno');
 const first=await tagged(f,A.admin);ok(first);assert.match(first.etag,/^W\/"[A-Za-z0-9_-]{32}"$/);assert.ok(first.body.state.prods.length);
 const again=await tagged(f,A.admin,first.etag);
 assert.equal(again.status,304);assert.equal(again.body,null);assert.equal(again.etag,first.etag);
 assert.equal((await tagged(f,A.admin,'W/"otro", '+first.etag)).status,304,'lista de etiquetas');
 assert.equal((await tagged(f,A.admin,'W/"otro"')).status,200);
 const plain=await f.call(A.admin);ok(plain);assert.equal(Object.hasOwn(plain,'etag'),false,'sin etag:true no hay versión');
 // Otro día (Bogotá) cambia cartera y vencimientos: la versión también cambia.
 assert.equal((await tagged(f,A.admin,first.etag,{now:AT_D1})).status,200);
});

test('BE-29: un cambio de otro dispositivo se ve en la siguiente recarga',async()=>{
 const f=await qaPlatform();const A=await f.shop('Sync Dos');
 const admin=await tagged(f,A.admin),seller=await tagged(f,A.seller);
 await f.act(A.seller,f.saleBody(A.product));
 const next=await tagged(f,A.admin,admin.etag);ok(next);assert.notEqual(next.etag,admin.etag);assert.equal(next.body.state.ventas.length,1);
 assert.equal((await tagged(f,A.admin,next.etag)).status,304);
 // El administrador edita un producto: el vendedor recibe el cambio.
 await f.act(A.admin,{type:'business.change',payload:{kind:'producto',id:A.product.id,form:{...A.product,nombre:'Producto renombrado'}}});
 const sellerNext=await tagged(f,A.seller,seller.etag);ok(sellerNext);assert.equal(sellerNext.body.state.prods[0].nombre,'Producto renombrado');
 // Cambios fuera del negocio: datos de la empresa (propietario) y tickets.
 const before=await tagged(f,A.admin);
 await f.act('owner',{type:'company.update',companyId:A.company.id,form:{contact:'Contacto nuevo'}});
 const afterCompany=await tagged(f,A.admin,before.etag);ok(afterCompany);assert.equal(afterCompany.body.session.company.contact,'Contacto nuevo');
 await f.act('owner',{type:'ticket.reply',id:A.ticket.id,form:{message:'Respuesta del propietario'}});
 const afterTicket=await tagged(f,A.admin,afterCompany.etag);ok(afterTicket);assert.equal(afterTicket.body.tickets[0].messages.at(-1).message,'Respuesta del propietario');
});

test('BE-29: la versión nunca valida datos de otro rol, usuario o empresa',async()=>{
 const f=await qaPlatform();const A=await f.shop('Sync Tres'),B=await f.shop('Sync Cuatro');
 const admin=await tagged(f,A.admin),seller=await tagged(f,A.seller),seller2=await tagged(f,A.seller2),otherAdmin=await tagged(f,B.admin),owner=await tagged(f,'owner');
 assert.equal(new Set([admin.etag,seller.etag,seller2.etag,otherAdmin.etag,owner.etag]).size,5);
 const sellerWithAdminTag=await tagged(f,A.seller,admin.etag);ok(sellerWithAdminTag);
 assert.equal(sellerWithAdminTag.body.session.role,'vendedor');assert.equal(Object.hasOwn(sellerWithAdminTag.body.state.prods[0],'precio_compra'),false,'el vendedor no recibe costos');
 assert.equal((await tagged(f,A.admin,seller.etag)).status,200);
 assert.equal((await tagged(f,A.seller2,seller.etag)).status,200);
 assert.equal((await tagged(f,B.admin,admin.etag)).status,200);
 assert.equal((await tagged(f,'owner',admin.etag)).status,200);
 // Un cambio en la empresa B no invalida la copia de A; el propietario sí ve el cambio.
 await f.act(B.admin,f.saleBody(B.product));
 assert.equal((await tagged(f,A.admin,admin.etag)).status,304);
 assert.equal((await tagged(f,'owner',owner.etag)).status,200);
 // Sesión cerrada: 401 aunque la versión coincida.
 await f.call(A.admin,'/api/v2/logout',{});
 assert.equal((await tagged(f,A.admin,admin.etag)).status,401);
});

test('BE-29: la respuesta de una acción trae la versión que valida la siguiente recarga',async()=>{
 const f=await qaPlatform();const A=await f.shop('Sync Cinco');
 const changed=await f.call(A.admin,'/api/v2/action',{requestId:crypto.randomUUID(),type:'business.change',payload:{kind:'ajuste',id:A.product.id,form:{stock:7,motivo:'Conteo QA'}}},{etag:true});ok(changed);
 assert.match(changed.etag,/^W\//);
 assert.equal((await tagged(f,A.admin,changed.etag)).status,304);
 // Con datos de un solo uso (enlace del comprobante) no se versiona.
 const sale=await f.call(A.seller,'/api/v2/action',{requestId:crypto.randomUUID(),...f.saleBody(A.product)},{etag:true});ok(sale);
 if(sale.body.receiptLink)assert.equal(Object.hasOwn(sale,'etag'),false);
});

test('BE-29 HTTP: If-None-Match por empresa y rol en el adaptador',async()=>{
 const {createServer}=await import('node:http'),{mkdtempSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const {openPlatformStore,createPlatformHandler}=await import('../platform-server.mjs');
 const directory=mkdtempSync(join(tmpdir(),'scorta-sync-'));
 const store=await openPlatformStore(join(directory,'platform.sqlite'),{owner:{company:'Fragola',username:'owner',name:'Owner',password:'QaOwnerOnly-2026!'}});
 const server=createServer(async(req,res)=>{if(!await createPlatformHandler({store})(req,res)){res.writeHead(404);res.end()}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 const post=async(path,body,cookie,company)=>{const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:base,...(cookie?{cookie}:{}),...(company?{'X-SCORTA-Company':company}:{})},body:JSON.stringify(body)});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0],etag:r.headers.get('etag')}};
 const get=async(cookie,company,etag)=>{const r=await fetch(base+'/api/v2/data',{headers:{cookie,'X-SCORTA-Company':company,...(etag?{'If-None-Match':etag}:{})}});return {status:r.status,etag:r.headers.get('etag'),text:await r.text()}};
 try{
  const owner=(await post('/api/v2/login',{company:'Fragola',username:'owner',password:'QaOwnerOnly-2026!'})).cookie;
  const created=await post('/api/v2/action',{requestId:crypto.randomUUID(),expectedCompanyId:'@owner',type:'company.create',form:{name:'Sync HTTP',contact:'QA',email:'qa@example.invalid',whatsapp:'+573001234567',startDate:'2020-01-01',endDate:'2099-12-31',monthlyFee:1000,username:'admin',password:STAFF_PASSWORD,adminName:'Admin'}},owner,'@owner');
  assert.equal(created.status,200);const company=created.body.companies[0];
  assert.equal((await post('/api/v2/action',{requestId:crypto.randomUUID(),expectedCompanyId:'@owner',type:'user.create',companyId:company.id,form:{username:'vendedor',name:'Vendedor',role:'vendedor',password:STAFF_PASSWORD}},owner,'@owner')).status,200);
  const admin=(await post('/api/v2/login',{company:company.slug,username:'admin',password:STAFF_PASSWORD})).cookie,seller=(await post('/api/v2/login',{company:company.slug,username:'vendedor',password:STAFF_PASSWORD})).cookie;
  const first=await get(admin,company.id);assert.equal(first.status,200);assert.ok(first.etag);
  const same=await get(admin,company.id,first.etag);assert.equal(same.status,304);assert.equal(same.text,'');assert.equal(same.etag,first.etag);
  const cross=await get(seller,company.id,first.etag);assert.equal(cross.status,200,'la versión del administrador no sirve al vendedor');assert.equal(JSON.parse(cross.text).session.role,'vendedor');
  const changed=await post('/api/v2/action',{requestId:crypto.randomUUID(),expectedCompanyId:company.id,type:'business.change',revision:JSON.parse(first.text).revision,payload:{kind:'producto',form:{nombre:'Nuevo',categoria:'QA',stock:3,stock_minimo:1,precio_compra:1000,precio_venta:2000}}},admin,company.id);
  assert.equal(changed.status,200);assert.ok(changed.etag,'la acción trae su versión');
  assert.equal((await get(admin,company.id,changed.etag)).status,304);
  const sellerNext=await get(seller,company.id,cross.etag);assert.equal(sellerNext.status,200);assert.equal(JSON.parse(sellerNext.text).state.prods.length,1);
 }finally{await new Promise(resolve=>server.close(resolve));store.close();rmSync(directory,{recursive:true,force:true})}
});

const search=(f,actor,kind,query='')=>f.call(actor,`/api/v2/search/${kind}${query?'?'+query:''}`);
const importProducts=async(f,actor,count,offset=0)=>{
 const items=Array.from({length:count},(_,i)=>{const n=String(offset+i).padStart(4,'0');return {nombre:'Artículo '+n,referencia:'REF'+n,codigo_barras:'77'+n,categoria:i%2?'Frenos':'Motor',precio_compra:1000,precio_venta:2000,stock:i%5,stock_minimo:1}});
 await f.act(actor,{type:'business.change',payload:{kind:'importar',items}});
};

test('BE-28: productos paginados con límites 1..200 y offset',async()=>{
 const f=await qaPlatform();const A=await f.shop('Busca Uno');
 await importProducts(f,A.admin,260);
 const total=261;
 let r=await search(f,A.admin,'products');ok(r);assert.equal(r.body.items.length,50);assert.equal(r.body.total,total);assert.equal(r.body.offset,0);assert.equal(r.body.nextOffset,50);assert.equal(typeof r.body.revision,'number');
 r=await search(f,A.admin,'products','limit=200');ok(r);assert.equal(r.body.items.length,200);assert.equal(r.body.nextOffset,200);
 const second=await search(f,A.admin,'products','limit=200&offset=200');ok(second);assert.equal(second.body.items.length,total-200);assert.equal(second.body.nextOffset,null);
 const ids=new Set([...r.body.items,...second.body.items].map(p=>p.id));assert.equal(ids.size,total,'sin repetidos ni faltantes entre páginas');
 const exact=await search(f,A.admin,'products',`limit=1&offset=${total-1}`);assert.equal(exact.body.items.length,1);assert.equal(exact.body.nextOffset,null);
 const beyond=await search(f,A.admin,'products','offset=5000');ok(beyond);assert.deepEqual(beyond.body.items,[]);assert.equal(beyond.body.nextOffset,null);
 for(const bad of ['limit=201','limit=0','limit=-1','limit=abc','offset=-5','offset=1.5','availability=raro','q='+'x'.repeat(101)])assert.equal((await search(f,A.admin,'products',bad)).status,400,bad);
 // Orden alfabético estable.
 const names=r.body.items.map(p=>p.nombre);assert.deepEqual(names,[...names].sort((a,b)=>a.localeCompare(b,'es')));
});

test('BE-28: búsqueda de productos por nombre, código y referencia, con filtros',async()=>{
 const f=await qaPlatform();const A=await f.shop('Busca Dos');
 await importProducts(f,A.admin,30);
 let r=await search(f,A.admin,'products','q=articulo 001');ok(r);assert.deepEqual(r.body.items.map(p=>p.nombre),Array.from({length:10},(_,i)=>'Artículo 001'+i),'sin tildes ni mayúsculas');
 r=await search(f,A.admin,'products','q=770007');assert.equal(r.body.items[0].nombre,'Artículo 0007','código de barras exacto primero');
 r=await search(f,A.admin,'products','q=ref0012');assert.equal(r.body.items[0].referencia,'REF0012');assert.equal(r.body.total,1);
 r=await search(f,A.admin,'products','category=Frenos&availability=agotados');ok(r);assert.ok(r.body.items.length);assert.ok(r.body.items.every(p=>p.categoria==='Frenos'&&p.stock===0));
 r=await search(f,A.admin,'products','availability=bajos');assert.ok(r.body.items.every(p=>p.stock>0&&p.stock<=p.stock_minimo));
 r=await search(f,A.admin,'products','q=no-existe');ok(r);assert.equal(r.body.total,0);
 // El vendedor busca igual, pero sin costos.
 const seller=await search(f,A.seller,'products','q=artículo&limit=200');ok(seller);assert.equal(seller.body.total,30);
 assert.ok(seller.body.items.every(p=>!Object.hasOwn(p,'precio_compra')&&!Object.hasOwn(p,'costHistory')));
 const admin=await search(f,A.admin,'products','q=artículo&limit=1');assert.equal(admin.body.items[0].precio_compra,1000);
 // El propietario fuera de soporte no tiene empresa.
 assert.equal((await search(f,'owner','products')).status,403);
});

test('BE-28: ventas paginadas: el vendedor ve solo las suyas y sin secretos',async()=>{
 const f=await qaPlatform();const A=await f.shop('Busca Tres',{stock:50}),B=await f.shop('Busca Cuatro');
 for(let i=0;i<3;i++)await f.act(A.seller,{...f.saleBody(A.product),form:{cliente:'Cliente Vendedor '+i,paymentMethod:'efectivo'}});
 await f.act(A.seller2,{...f.saleBody(A.product),form:{cliente:'Cliente Otro',paymentMethod:'efectivo'}});
 await f.act(A.admin,{...f.saleBody(A.product),form:{cliente:'Cliente Admin',paymentMethod:'efectivo'}});
 let r=await search(f,A.admin,'sales');ok(r);assert.equal(r.body.total,5);
 assert.ok(r.body.items.every(s=>!Object.hasOwn(s,'receiptToken')&&!Object.hasOwn(s,'receiptHash')));
 const dates=r.body.items.map(s=>s.fecha);assert.deepEqual(dates,[...dates].sort().reverse(),'más recientes primero');
 r=await search(f,A.seller,'sales','limit=2');ok(r);assert.equal(r.body.total,3);assert.equal(r.body.items.length,2);assert.equal(r.body.nextOffset,2);
 assert.ok(r.body.items.every(s=>s.cliente.startsWith('Cliente Vendedor')));
 assert.ok(r.body.items.every(s=>(s.detalles||[]).every(d=>!Object.hasOwn(d,'costo_unitario'))));
 r=await search(f,A.seller,'sales','q=otro');assert.equal(r.body.total,0,'no encuentra ventas de otro vendedor');
 r=await search(f,A.seller2,'sales','q=otro');assert.equal(r.body.total,1);
 r=await search(f,A.admin,'sales','q=cliente admin');assert.equal(r.body.total,1);
 r=await search(f,A.admin,'sales','from=2026-11-20');assert.equal(r.body.total,0);
 r=await search(f,A.admin,'sales','from=2026-11-19&to=2026-11-19');assert.equal(r.body.total,5);
 assert.equal((await search(f,A.admin,'sales','from=19/11/2026')).status,400);
 r=await search(f,B.admin,'sales');assert.equal(r.body.total,0,'otra empresa no ve nada');
});

test('BE-28: clientes: el vendedor recibe datos enmascarados y no puede buscar por el dato completo',async()=>{
 const f=await qaPlatform();const A=await f.shop('Busca Cinco');
 await f.act(A.admin,{type:'customer.create',form:{nombre:'Ana Pérez',telefono:'3001112233',tipoDocumento:'CC',numeroDocumento:'1020304050',dataConsent:true,consentMedium:'verbal'}});
 await f.act(A.admin,{type:'customer.create',form:{nombre:'Bruno Díaz'}});
 let r=await search(f,A.admin,'customers','q=perez');ok(r);assert.equal(r.body.total,1);assert.equal(r.body.items[0].telefono,'3001112233');
 r=await search(f,A.admin,'customers','q=3001112233');assert.equal(r.body.total,1);
 r=await search(f,A.admin,'customers');assert.deepEqual(r.body.items.map(c=>c.nombre),['Ana Pérez','Bruno Díaz']);
 r=await search(f,A.seller,'customers','q=ana');ok(r);assert.equal(r.body.items[0].telefono,'•••2233');assert.equal(r.body.items[0].numeroDocumento,'•••4050');assert.equal(r.body.items[0].masked,true);
 assert.equal(Object.hasOwn(r.body.items[0],'correo'),false);
 r=await search(f,A.seller,'customers','q=3001112233');assert.equal(r.body.total,0,'el número completo no sirve como oráculo');
 r=await search(f,A.seller,'customers','q=2233');assert.equal(r.body.total,1);
 assert.equal((await search(f,A.admin,'unknown')).status,404);
});
