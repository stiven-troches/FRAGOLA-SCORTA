// BE-37: límites por plan. Sin plan = sin límites (empresas existentes). El servidor responde
// 403 PLAN_LIMIT al crear usuarios, productos o fotos por encima del límite, y al usar funciones
// opcionales desactivadas (crédito, cotizaciones, garantías, órdenes de compra e IVA).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qaPlatform,ok,AT_D} from './qa-fixture.mjs';
import {companyPlan,cleanPlan,planUsage,PLAN_FEATURE_KEYS,DEFAULT_PLAN} from '../plan-limits.mjs';

const post=(f,actor,body)=>f.call(actor,'/api/v2/action',{requestId:crypto.randomUUID(),...body});
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('reglas puras: plan por defecto sin límites y validación del formulario',()=>{
 assert.deepEqual(companyPlan({}),{maxUsers:null,maxProducts:null,maxPhotos:null,features:PLAN_FEATURE_KEYS});
 assert.deepEqual(DEFAULT_PLAN.features,['credito','cotizaciones','garantias','ordenes_compra','iva']);
 assert.deepEqual(cleanPlan({maxUsers:'3',maxProducts:'',maxPhotos:0,features:['iva','credito']}),{maxUsers:3,maxProducts:null,maxPhotos:0,features:['credito','iva']});
 assert.throws(()=>cleanPlan({maxUsers:-1}),/Máximo de usuarios/);assert.throws(()=>cleanPlan({features:['nube']}),/Funciones del plan/);
 assert.deepEqual(planUsage({plan:{maxUsers:2}},{users:2,products:5}).users,{used:2,max:2,full:true});
});

test('el propietario define el plan; usuarios y productos por encima del límite responden 403 PLAN_LIMIT',async()=>{
 const f=await qaPlatform({now:AT_D}),S=await f.shop('Plan Uno');
 let owner=await f.data('owner');let company=owner.companies.find(c=>c.id===S.company.id);
 assert.deepEqual(company.plan.features,PLAN_FEATURE_KEYS,'empresa existente: todas las funciones');assert.equal(company.plan.maxUsers,null);
 assert.deepEqual([company.usage.users,company.usage.products,company.usage.photos],[3,1,0]);
 assert.equal((await post(f,S.admin,{type:'company.plan',companyId:S.company.id,form:{maxUsers:1}})).status,403,'solo el propietario');
 owner=await f.act('owner',{type:'company.plan',companyId:S.company.id,form:{maxUsers:3,maxProducts:2,maxPhotos:1,features:PLAN_FEATURE_KEYS}});
 assert.equal(owner.companies.find(c=>c.id===S.company.id).plan.maxProducts,2);
 assert.ok(owner.audit.some(a=>a.accion==='company.plan'&&a.plan?.despues?.maxUsers===3));
 const user=await post(f,'owner',{type:'user.create',companyId:S.company.id,form:{username:'cuarto',name:'Cuarto',role:'vendedor',password:'QaStaffOnly-2026!'}});
 assert.equal(user.status,403);assert.equal(user.body.code,'PLAN_LIMIT');assert.match(user.body.error,/hasta 3 usuarios activos/);
 // Desactivar uno libera un cupo; reactivarlo por encima del límite no se permite.
 const seller2=owner.users.find(u=>u.companyId===S.company.id&&u.username==='vendedor2');
 await f.act('owner',{type:'user.update',companyId:S.company.id,userId:seller2.id,form:{active:false}});
 ok(await post(f,'owner',{type:'user.create',companyId:S.company.id,form:{username:'cuarto',name:'Cuarto',role:'vendedor',password:'QaStaffOnly-2026!'}}));
 assert.equal((await post(f,'owner',{type:'user.update',companyId:S.company.id,userId:seller2.id,form:{active:true}})).body.code,'PLAN_LIMIT');
 // Productos: el segundo cabe, el tercero no (ni por importación).
 ok(await post(f,S.admin,{type:'business.change',payload:{kind:'producto',form:{nombre:'Segundo',precio_venta:1000,stock:1}}}));
 const third=await post(f,S.admin,{type:'business.change',payload:{kind:'producto',form:{nombre:'Tercero',precio_venta:1000,stock:1}}});
 assert.equal(third.status,403);assert.equal(third.body.code,'PLAN_LIMIT');assert.match(third.body.error,/hasta 2 productos/);
 assert.equal((await post(f,S.admin,{type:'business.change',payload:{kind:'importar',form:{},items:[{nombre:'Importado',precio_venta:500}]}})).body.code,'PLAN_LIMIT');
 // Editar productos existentes sigue funcionando; la segunda foto se rechaza.
 let data=await f.data(S.admin);
 ok(await post(f,S.admin,{type:'business.change',revision:data.revision,payload:{kind:'producto',form:{...data.state.prods[0],foto:PNG}}}));
 data=await f.data(S.admin);
 const photo=await post(f,S.admin,{type:'business.change',revision:data.revision,payload:{kind:'producto',form:{...data.state.prods[1],foto:PNG}}});
 assert.equal(photo.body.code,'PLAN_LIMIT');assert.match(photo.body.error,/hasta 1 foto de producto./);
 data=await f.data(S.admin);assert.deepEqual(data.session.company.plan,{maxUsers:3,maxProducts:2,maxPhotos:1,features:PLAN_FEATURE_KEYS},'la empresa ve su plan');
});

test('funciones opcionales: crédito e IVA desactivados por el plan',async()=>{
 const f=await qaPlatform({now:AT_D}),S=await f.shop('Plan Dos');
 await f.act(S.admin,{type:'settings.update',form:{vat:{enabled:true,defaultRate:19}}});
 const card=(await f.act(S.admin,{type:'customer.create',form:{nombre:'Taller',creditLimit:100000}})).state.customerRecords[0];
 await f.act('owner',{type:'company.plan',companyId:S.company.id,form:{features:['cotizaciones']}});
 const data=await f.data(S.admin);assert.equal(data.state.settings.vat.enabled,false,'quitar el IVA del plan lo apaga en la empresa');
 assert.ok(data.state.auditoria.some(a=>a.accion==='plan_actualizado'));
 assert.equal((await post(f,S.admin,{type:'settings.update',form:{vat:{enabled:true}}})).body.code,'PLAN_LIMIT');
 assert.equal((await post(f,S.admin,{type:'customer.update',id:card.id,form:{creditLimit:200000}})).body.code,'PLAN_LIMIT');
 const credit=await post(f,S.seller,{type:'sale.create',form:{cliente:'Taller',customerId:card.id,paymentMethod:'credito'},items:[{producto_id:S.product.id,cantidad:1,precio_unitario:S.product.precio_venta}],labor:[]});
 assert.equal(credit.status,403);assert.equal(credit.body.code,'PLAN_LIMIT');
 ok(await post(f,S.seller,f.saleBody(S.product)));
 // Sin plan explícito (null) vuelve a no tener límites.
 const reset=await f.act('owner',{type:'company.plan',companyId:S.company.id,form:{}});
 assert.deepEqual(reset.companies.find(c=>c.id===S.company.id).plan.features,PLAN_FEATURE_KEYS);
});

test('compatibilidad: empresas creadas antes del plan y company.create con plan',async()=>{
 const f=await qaPlatform({now:AT_D});
 delete f.state.companies[0]?.plan;
 const created=await f.act('owner',{type:'company.create',form:{name:'Plan Tres',contact:'QA',email:'qa@example.invalid',whatsapp:'+573001234567',startDate:'2026-11-01',endDate:'2026-12-31',monthlyFee:1000,username:'admin',password:'QaStaffOnly-2026!',plan:{maxUsers:1,features:['iva']}}});
 const company=created.companies.find(c=>c.name==='Plan Tres');
 assert.deepEqual(company.plan,{maxUsers:1,maxProducts:null,maxPhotos:null,features:['iva']});
 assert.equal((await post(f,'owner',{type:'user.create',companyId:company.id,form:{username:'v',name:'V',role:'vendedor',password:'QaStaffOnly-2026!'}})).body.code,'PLAN_LIMIT');
});
