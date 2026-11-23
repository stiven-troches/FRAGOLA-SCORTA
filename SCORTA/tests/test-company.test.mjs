import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createPlatform,platformRequest} from '../platform.mjs';
import {openPlatformStore,createPlatformHandler} from '../platform-server.mjs';
import {seedTestCompany,TEST_COMPANY,TEST_COMPANY_PLAN,testCompanyEnabled} from '../test-company.mjs';
import {companyPlan} from '../plan-limits.mjs';

const owner={company:'Propietario QA',username:'ownerqa',password:'Owner.SeedFixture!2026'},now='2026-11-22T18:00:00Z';
const initial=()=>createPlatform({owner});
test('semilla completa: 24 productos con fotos, logo, categorías, precios e historial ficticio',async()=>{
 const original=await initial(),before=structuredClone(original),state=await seedTestCompany(original,{now});
 assert.deepEqual(original,before);assert.equal(state.companies.length,1);assert.equal(state.users.filter(u=>u.role==='owner').length,1);
 const company=state.companies[0],business=state.businesses[company.id];assert.equal(company.slug,TEST_COMPANY.slug);assert.equal(company.isTestCompany,true);assert.equal(company.catalog.enabled,true);
 assert.match(company.logo,/^data:image\/webp;base64,/);assert.equal(business.prods.length,24);assert.equal(new Set(business.prods.map(p=>p.categoria)).size,6);
 assert.equal(business.prods.filter(p=>p.stock===0).length,2);assert.equal(new Set(business.prods.map(p=>p.referencia)).size,24);
 for(const p of business.prods){assert.ok(p.precio_venta>p.precio_compra);assert.match(p.foto,/^data:image\/webp;base64,/);const bytes=Buffer.from(p.foto.split(',')[1],'base64');assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WEBP');assert.ok(bytes.length<500000);assert.ok(p.descripcion&&p.codigo_barras&&p.marca&&p.modelo&&p.stock_minimo)}
 assert.equal(business.ventas.length,3);assert.equal(business.compras.length,1);assert.ok(business.movimientos.length>=24);assert.ok(!JSON.stringify(state).includes(TEST_COMPANY.password));
 const catalog=await platformRequest(state,{path:'/api/v2/catalog/'+company.slug},{now});assert.equal(catalog.status,200);assert.equal(catalog.body.products.length,22);
 const order=await platformRequest(state,{method:'POST',path:'/api/v2/catalog/'+company.slug+'/checkout',body:{items:[{id:business.prods[0].id,quantity:1}]}},{now});assert.equal(order.status,400);assert.match(order.body.error,/WhatsApp/);
});

test('idempotencia: conserva ediciones, contraseñas cambiadas y un borrado voluntario',async()=>{
 const state=await seedTestCompany(await initial(),{now});state.businesses[TEST_COMPANY.id].prods[0].stock=1;state.users.find(u=>u.role==='admin').name='Nombre editado';
 assert.strictEqual(await seedTestCompany(state),state);assert.equal(state.businesses[TEST_COMPANY.id].prods[0].stock,1);assert.equal(state.users.find(u=>u.role==='admin').name,'Nombre editado');
 state.companies=[];state.users=state.users.filter(u=>u.companyId!==TEST_COMPANY.id);delete state.businesses[TEST_COMPANY.id];
 assert.strictEqual(await seedTestCompany(state),state);assert.equal(state.companies.length,0);
 const reserved=await initial();reserved.companies.push({id:TEST_COMPANY.id,name:'Existente'});assert.strictEqual(await seedTestCompany(reserved),reserved);
});

test('un nombre existente no se modifica y la semilla no cambia el propietario ni sus usuarios',async()=>{
 const state=await initial();state.companies.push({id:'real',name:TEST_COMPANY.name,slug:TEST_COMPANY.slug});state.businesses.real={revision:7,prods:[{id:'real-product',stock:31}]};
 const before=structuredClone(state),seeded=await seedTestCompany(state,{now});assert.deepEqual(state,before);assert.deepEqual(seeded.businesses.real,before.businesses.real);assert.deepEqual(seeded.users[0],before.users[0]);
 assert.equal(seeded.companies[1].slug,TEST_COMPANY.slug+'-2');assert.equal(seeded.companies[0].name,TEST_COMPANY.name);
});

test('las cuentas demo entran solo a su empresa y no pueden actuar como propietario',async()=>{
 let state=await seedTestCompany(await initial(),{now});
 const call=async(request)=>{const r=await platformRequest(state,request,{now});state=r.state;return r};
 const admin=await call({method:'POST',path:'/api/v2/login',body:{company:TEST_COMPANY.name,username:TEST_COMPANY.username,password:TEST_COMPANY.password}});assert.equal(admin.status,200);assert.equal(admin.body.session.role,'admin');assert.equal(admin.body.session.companyId,TEST_COMPANY.id);
 const denied=await call({method:'POST',path:'/api/v2/action',token:admin.token,body:{type:'company.create',form:{}}});assert.equal(denied.status,403);
 const cross=await call({method:'POST',path:'/api/v2/action',token:admin.token,body:{type:'catalog.update',companyId:'other',form:{enabled:true}}});assert.equal(cross.status,403);
 const seller=await call({method:'POST',path:'/api/v2/login',body:{company:TEST_COMPANY.name,username:TEST_COMPANY.seller,password:TEST_COMPANY.password}});assert.equal(seller.status,200);assert.equal(seller.body.session.role,'vendedor');
 assert.equal((await call({method:'POST',path:'/api/v2/action',token:seller.token,body:{type:'business.change',payload:{kind:'producto',form:{}}}})).status,403);
 assert.equal((await call({method:'POST',path:'/api/v2/login',body:{company:owner.company,username:TEST_COMPANY.username,password:TEST_COMPANY.password}})).status,401);
});

test('SQLite añade la empresa una vez, conserva las ediciones al reiniciar y sirve las fotos reales',async t=>{
 const directory=mkdtempSync(join(tmpdir(),'scorta-test-company-')),file=join(directory,'platform.sqlite');let store;
 t.after(()=>{try{store?.close()}finally{rmSync(directory,{recursive:true,force:true})}});
 store=await openPlatformStore(file,{owner});assert.equal(store.readPrivate().companies.length,0);store.close();
 store=await openPlatformStore(file,{withTestCompany:true});const state=store.readPrivate(),product=state.businesses[TEST_COMPANY.id].prods[0];
 const signed=await store.request({method:'POST',path:'/api/v2/login',body:{company:TEST_COMPANY.name,username:TEST_COMPANY.username,password:TEST_COMPANY.password}});assert.equal(signed.status,200);
 const changed=await store.request({method:'POST',path:'/api/v2/action',token:signed.token,body:{type:'business.change',requestId:'test-stock',payload:{kind:'ajuste',id:product.id,form:{stock:2,motivo:'Prueba de persistencia'}}}});assert.equal(changed.status,200);
 const newPassword='Edited.Demo!2026';const passwordChange=await store.request({method:'POST',path:'/api/v2/password',token:signed.token,body:{currentPassword:TEST_COMPANY.password,newPassword}});assert.equal(passwordChange.status,200);store.close();
 store=await openPlatformStore(file,{withTestCompany:true});assert.equal(store.readPrivate().companies.length,1);assert.equal(store.readPrivate().businesses[TEST_COMPANY.id].prods[0].stock,2);
 const sign=password=>store.request({method:'POST',path:'/api/v2/login',body:{company:TEST_COMPANY.name,username:TEST_COMPANY.username,password}});
 assert.equal((await sign(TEST_COMPANY.password)).status,401);assert.equal((await sign(newPassword)).status,200);
 const handler=createPlatformHandler({store}),server=createServer((req,res)=>handler(req,res));server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
 const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/v2/catalog/'+TEST_COMPANY.slug+'/photo/'+product.id);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/webp');assert.equal(Buffer.from(await response.arrayBuffer()).subarray(8,12).toString(),'WEBP');
});

test('activación explícita: apagada por defecto y en producción exige una segunda variable',()=>{
 assert.equal(testCompanyEnabled({}),false,'sin variable no se crea');
 assert.equal(testCompanyEnabled({SCORTA_TEST_COMPANY:'0'}),false);
 assert.equal(testCompanyEnabled({SCORTA_TEST_COMPANY:'true'}),false,'solo el valor exacto 1 la activa');
 assert.equal(testCompanyEnabled({SCORTA_TEST_COMPANY:'1'}),true);
 assert.equal(testCompanyEnabled({SCORTA_TEST_COMPANY:'1',NODE_ENV:'production'}),false,'producción no la crea por accidente');
 assert.equal(testCompanyEnabled({SCORTA_TEST_COMPANY:'1',NODE_ENV:'production',SCORTA_TEST_COMPANY_PRODUCTION:'1'}),true);
 assert.equal(testCompanyEnabled({NODE_ENV:'production',SCORTA_TEST_COMPANY_PRODUCTION:'1'}),false);
});

test('la empresa de prueba tiene topes de plan y cabe dentro de ellos',async()=>{
 const state=await seedTestCompany(await initial(),{now}),company=state.companies[0],plan=companyPlan(company),business=state.businesses[company.id];
 assert.equal(plan.maxUsers,TEST_COMPANY_PLAN.maxUsers);assert.equal(plan.maxProducts,TEST_COMPANY_PLAN.maxProducts);assert.equal(plan.maxPhotos,TEST_COMPANY_PLAN.maxPhotos);
 assert.ok(business.prods.length<=plan.maxProducts);assert.ok(business.prods.filter(p=>p.foto).length<=plan.maxPhotos);
 assert.ok(state.users.filter(u=>u.companyId===company.id).length<=plan.maxUsers);
});
