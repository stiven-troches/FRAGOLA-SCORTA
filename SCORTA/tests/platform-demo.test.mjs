import {test} from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {platformRequest} from '../platform.mjs';
import {createPlatformDemoSeed,createPlatformDemoStore,installPlatformDemoFetch,DEMO_ACCOUNTS} from '../src/platform-demo.mjs';

const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const makeProduct={nombre:'Producto exclusivo de prueba',referencia:'CAS-CAS-001',categoria:'Pruebas',stock:3,stock_minimo:1,precio_compra:5000,precio_venta:10000};
async function fixture(run){
  const indexedDBFactory=new IDBFactory(),name='scorta-platform-test-'+crypto.randomUUID();
  const store=await createPlatformDemoStore({indexedDBFactory,name,lockManager:null});
  const open=options=>createPlatformDemoStore({indexedDBFactory,name,lockManager:null,...options});
  try{await run({store,open,indexedDBFactory,name})}finally{store.close()}
}
async function getData(store){const result=await store.request({method:'GET',path:'/api/v2/data'});assert.equal(result.status,200,result.body?.error);return result.body}
async function act(store,action){const before=await getData(store);const result=await store.request({method:'POST',path:'/api/v2/action',body:{revision:before.revision,requestId:crypto.randomUUID(),...action}});assert.equal(result.status,200,result.body?.error);return result.body}
const sale=(product,extra={})=>({type:'sale.create',form:{fecha:today(),cliente:'Cliente ficticio de prueba',telefono:'+573001234500',placa:'QA123A',paymentMethod:'efectivo'},items:[{producto_id:product.id,cantidad:1,precio_unitario:product.precio_venta}],labor:[],...extra});


test('demo usa empresas y perfiles aislados con credenciales exclusivamente ficticias',()=>fixture(async({store})=>{
  const initial=await store.request({method:'GET',path:'/api/v2/session'});assert.equal(initial.status,401);
  let data=await store.loginAs('owner');
  assert.equal(data.session.role,'owner');assert.equal(data.companies.length,3);
  const serialized=JSON.stringify(data);
  assert.ok(!serialized.includes(DEMO_ACCOUNTS.owner.password));assert.ok(!serialized.includes('digest'));assert.ok(!serialized.includes('salt'));
  data=await store.loginAs('admin');assert.equal(data.session.company.name,'Moto Norte');assert.equal(data.state.prods.length,24);
  data=await store.loginAs('vendedor');assert.equal(data.session.role,'vendedor');
  assert.ok(data.state.prods.every(product=>!Object.hasOwn(product,'precio_compra')));
  assert.ok(!data.state.compras?.length);
  assert.ok(data.state.ventas.length>=2);
  assert.ok(data.state.ventas.every(sale=>sale.usuario===data.session.username||sale.userId===data.session.userId));
}));

test('IndexedDB conserva altas y ventas y los reintentos no duplican cantidades',()=>fixture(async({store})=>{
  await store.loginAs('admin');
  let data=await act(store,{type:'business.change',payload:{kind:'producto',form:makeProduct}});
  const product=data.state.prods.find(product=>product.referencia===makeProduct.referencia);
  await store.loginAs('vendedor');data=await getData(store);
  const body={...sale(product),revision:data.revision,requestId:'same-demo-operation'};
  const first=await store.request({method:'POST',path:'/api/v2/action',body});assert.equal(first.status,200,first.body.error);
  const repeated=await store.request({method:'POST',path:'/api/v2/action',body});assert.equal(repeated.status,200,repeated.body.error);
  assert.equal(repeated.body.state.prods.find(item=>item.id===product.id).stock,2);
  assert.equal(repeated.body.state.ventas.length,first.body.state.ventas.length);
  const changed=await store.request({method:'POST',path:'/api/v2/action',body:{...body,items:[{...body.items[0],cantidad:2}]}});
  assert.ok(changed.status>=400);
}));

test('dos conexiones CAS compiten por la última unidad sin sobrescribir ventas',()=>fixture(async({store,open})=>{
  await store.loginAs('admin');
  let data=await act(store,{type:'business.change',payload:{kind:'producto',form:{...makeProduct,stock:1}}});
  const product=data.state.prods.find(product=>product.referencia===makeProduct.referencia);
  await store.loginAs('vendedor');
  const second=await open();
  try{
    await second.loginAs('vendedor');
    data=await getData(store);const beforeSales=data.state.ventas.length;
    const body={...sale(product),revision:data.revision};
    const results=await Promise.all([
      store.request({method:'POST',path:'/api/v2/action',body:{...body,requestId:'parallel-a'}}),
      second.request({method:'POST',path:'/api/v2/action',body:{...body,requestId:'parallel-b'}}),
    ]);
    assert.equal(results.filter(result=>result.status===200).length,1);
    assert.equal(results.filter(result=>result.status>=400).length,1);
    data=await getData(store);assert.equal(data.state.prods.find(item=>item.id===product.id).stock,0);
    assert.equal(data.state.ventas.length,beforeSales+1);
  }finally{second.close()}
}));

test('reabrir conserva datos y reiniciar invalida sesiones de las otras pestañas',()=>fixture(async({store,open})=>{
  await store.loginAs('admin');
  await act(store,{type:'business.change',payload:{kind:'producto',form:makeProduct}});
  const second=await open();
  try{
    assert.equal((await second.request({method:'GET',path:'/api/v2/session'})).status,401);
    await second.loginAs('admin');let data=await getData(second);
    assert.ok(data.state.prods.some(product=>product.referencia===makeProduct.referencia));
    await second.reset();
    assert.equal((await store.request({method:'GET',path:'/api/v2/session'})).status,401);
    await second.loginAs('admin');data=await getData(second);
    assert.equal(data.state.prods.length,24);
    assert.ok(!data.state.prods.some(product=>product.referencia===makeProduct.referencia));
  }finally{second.close()}
}));

test('reset concurrente no permite resucitar un estado anterior durante un cálculo',()=>fixture(async({store,open})=>{
  let release,started;
  const waiting=new Promise(resolve=>{release=resolve}),announced=new Promise(resolve=>{started=resolve});
  let held=false;
  const delayed=await open({requestFactory:async(state,input,options)=>{
    const result=await platformRequest(state,input,options);
    if(input.path==='/api/v2/action'&&!held){held=true;started();await waiting}
    return result;
  }});
  try{
    await delayed.loginAs('admin');let data=await getData(delayed);
    const pending=delayed.request({method:'POST',path:'/api/v2/action',body:{type:'business.change',revision:data.revision,requestId:'stale-after-reset',payload:{kind:'producto',form:makeProduct}}});
    await announced;await store.reset();release();
    const result=await pending;assert.ok(result.status>=400);
    await store.loginAs('admin');data=await getData(store);
    assert.ok(!data.state.prods.some(product=>product.referencia===makeProduct.referencia));
  }finally{release();delayed.close()}
}));

test('exportar la demo excluye contraseñas, hashes, sesiones y tokens de recibo',()=>fixture(async({store})=>{
  await store.loginAs('vendedor');const view=await store.request({method:'GET',path:'/api/v2/data'});const privateLinks=view.body.state.ventas.flatMap(s=>[s.receiptToken,s.receiptUrl]).filter(Boolean);await store.loginAs('owner');const exported=await store.exportData();
  assert.equal(exported.demostracion,true);assert.equal(exported.companies.length,3);
  const text=JSON.stringify(exported);for(const value of privateLinks)assert.ok(!text.includes(value),'El export no debe incluir tokens o enlaces privados de recibos');
  for(const account of Object.values(DEMO_ACCOUNTS))assert.ok(!text.includes(account.password));
  assert.ok(!/"(?:sessions|requests|password|salt|digest|hash|receiptToken)"\s*:/i.test(text));
  assert.ok(Object.values(exported.businesses).some(business=>business.ventas.length));
}));

test('adaptador resuelve API y recibos en local, adapta enlaces estáticos y delega solo recursos',()=>fixture(async({store})=>{
  const network=[],target={location:{href:'https://demo.example/',origin:'https://demo.example'},fetch:async(...args)=>{network.push(args);return new Response('asset')}};
  const restore=installPlatformDemoFetch(store,{target});
  try{
    let response=await target.fetch('/api/v2/login',{method:'POST',body:JSON.stringify(DEMO_ACCOUNTS.owner)});assert.equal(response.status,200);
    let data=await response.json();assert.ok(data.companies.every(company=>company.url.startsWith('https://demo.example/?empresa=')));
    response=await target.fetch('/api/v2/login',{method:'POST',body:JSON.stringify(DEMO_ACCOUNTS.vendedor)});assert.equal(response.status,200);data=await response.json();
    const withReceipt=data.state.ventas.find(sale=>sale.receiptToken);assert.ok(withReceipt);
    assert.match(withReceipt.receiptUrl,/^https:\/\/demo\.example\/#\/receipt\//);
    response=await target.fetch('/receipt/'+withReceipt.receiptToken);assert.equal(response.status,200);
    assert.equal((await response.json()).sale.id,withReceipt.id);
    assert.equal((await target.fetch('/api/no-existe')).status,404);
    assert.equal((await target.fetch('/api/v2/no-existe',{headers:{'X-SCORTA-Company':data.session.companyId}})).status,404);
    assert.equal(network.length,0);
    await target.fetch('/assets/app.js');assert.equal(network.length,1);
    const bad=await target.fetch('/api/v2/action',{method:'POST',body:'{'});assert.equal(bad.status,400);
  }finally{restore()}
}));


test('cambio de contraseña invalida sesiones locales y la credencial pública anterior',()=>fixture(async({store,open})=>{
  await store.loginAs('admin');
  const second=await open();
  const password='Nueva.Clave.Prueba.2026';
  try{
    await second.loginAs('admin');
    const changed=await store.request({method:'POST',path:'/api/v2/password',body:{currentPassword:DEMO_ACCOUNTS.admin.password,newPassword:password}});
    assert.equal(changed.status,200,changed.body?.error);
    assert.equal((await store.request({method:'GET',path:'/api/v2/session'})).status,401);
    assert.equal((await second.request({method:'GET',path:'/api/v2/session'})).status,401);
    await assert.rejects(store.loginAs('admin'),/contraseña|ingresar|incorrect/i);
    const login=await store.request({method:'POST',path:'/api/v2/login',body:{...DEMO_ACCOUNTS.admin,password}});
    assert.equal(login.status,200,login.body?.error);
    const failed=await store.request({method:'POST',path:'/api/v2/login',body:{...DEMO_ACCOUNTS.admin,password:'Contraseña.Fallida.2026'}});
    assert.equal(failed.status,401);
    // An incorrect login attempt does not replace an existing valid demo session.
    assert.equal((await store.request({method:'GET',path:'/api/v2/session'})).status,200);
    assert.ok(!JSON.stringify(await store.exportData()).includes(password));
  }finally{second.close()}
}));
