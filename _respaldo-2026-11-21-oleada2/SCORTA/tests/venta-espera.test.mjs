// FE-07: ventas en espera guardadas en el borrador del servidor (no reservan existencias).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qaPlatform,ok} from './qa-fixture.mjs';
import {MAX_DRAFT_CHARS} from '../sale-drafts.mjs';
import {MAX_HELD_SALES} from '../sale-pricing.mjs';

const form=(extra={})=>({cliente:'',telefono:'',placa:'',fecha:'2026-11-19',paymentMethod:'efectivo',...extra});
const cart=product=>[{producto_id:product.id,nombre:product.nombre,cantidad:2,precio_unitario:product.precio_venta}];
const heldEntry=(product,nombre,extra={})=>({id:crypto.randomUUID(),nombre,createdAt:'2026-11-19T15:00:00.000Z',cart:cart(product),labor:[],saleForm:form({cliente:nombre}),...extra});
const draft=(product,extra={})=>({cart:[],labor:[],laborDraft:{descripcion:'',mecanico:'',importe:''},saleForm:form(),pendingSale:null,...extra});
const save=(f,actor,version,value,writeId=crypto.randomUUID())=>f.call(actor,'/api/v2/draft',{version,writeId,draft:value});

test('el borrador guarda ventas en espera sin reservar stock y las aísla por usuario y empresa',async()=>{
  const f=await qaPlatform(),A=await f.shop('Espera A',{stock:3}),B=await f.shop('Espera B',{stock:3});
  const value=draft(A.product,{held:[heldEntry(A.product,'Cliente 1'),heldEntry(A.product,'Ana',{saleForm:form({cliente:'Ana',descuento:{tipo:'porcentaje',valor:'5'},payments:[{method:'efectivo',amount:'30000'},{method:'nequi',amount:'38000'}],customerId:'c1',tipoDocumento:'CC',numeroDocumento:'123'})})]});
  let r=await save(f,A.seller,0,value);ok(r);
  assert.equal(r.body.draft.held.length,2);assert.equal(r.body.draft.held[1].saleForm.payments[1].method,'nequi');assert.equal(r.body.draft.held[1].saleForm.descuento.tipo,'porcentaje');
  // No reserva existencias: el stock sigue igual y otro vendedor puede vender las unidades.
  assert.equal(f.state.businesses[A.company.id].prods[0].stock,3);
  ok(await f.call(A.seller2,'/api/v2/action',{requestId:crypto.randomUUID(),...f.saleBody(A.product,{cantidad:3})}));
  // Otro usuario y otra empresa no ven esas ventas en espera.
  r=await f.call(A.seller2,'/api/v2/draft');ok(r);assert.equal(r.body.draft,null);
  r=await f.call(B.seller,'/api/v2/draft');ok(r);assert.equal(r.body.draft,null);
  r=await f.call(A.seller,'/api/v2/draft');ok(r);assert.equal(r.body.draft.held.length,2);
});

test('límites: máximo de ventas en espera y tamaño del borrador con mensajes claros',async()=>{
  const f=await qaPlatform(),S=await f.shop('Límite espera',{stock:3});
  const many=Array.from({length:MAX_HELD_SALES+1},(_,i)=>heldEntry(S.product,'Cliente '+(i+1)));
  let r=await save(f,S.seller,0,draft(S.product,{held:many}));
  assert.equal(r.status,400);assert.equal(r.body.code,'TOO_MANY_HELD');assert.match(r.body.error,/hasta 10 ventas en espera/);
  ok(await save(f,S.seller,0,draft(S.product,{held:many.slice(0,MAX_HELD_SALES)})));
  const bigCart=key=>Array.from({length:1000},(_,i)=>({producto_id:key+i,nombre:'x'.repeat(190),cantidad:1,precio_unitario:1000}));
  const big=draft(S.product,{held:['a','b','c','d','e','f'].map(key=>heldEntry(S.product,'Grande '+key,{cart:bigCart(key)}))});
  assert.ok(JSON.stringify(big).length>MAX_DRAFT_CHARS);
  r=await save(f,S.seller,1,big);assert.equal(r.status,400);assert.equal(r.body.code,'DRAFT_TOO_LARGE');
  // Un carrito completo (1000 líneas) más una venta en espera sí cabe (antes el tope era 200 KB).
  const full=draft(S.product,{cart:Array.from({length:1000},(_,i)=>({producto_id:'p'+i,nombre:'Producto de prueba con nombre largo '+i+' '+'x'.repeat(150),cantidad:1,precio_unitario:1000})),held:[heldEntry(S.product,'Cliente 1')]});
  assert.ok(JSON.stringify(full).length>200000);ok(await save(f,S.seller,1,full));
});

test('cobrar conserva las ventas en espera y el cobro protegido con datos del cliente coincide con el borrador',async()=>{
  const f=await qaPlatform(),S=await f.shop('Cobro espera',{stock:5});
  const requestId=crypto.randomUUID();
  // El formulario incluye consentimiento, documento, pagos y descuento: todo debe coincidir con lo guardado.
  const saleForm=form({cliente:'Luis',telefono:'3001234567',dataConsent:true,consentMedium:'escrito',tipoDocumento:'CC',numeroDocumento:'1020304050',payments:[{method:'efectivo',amount:30000},{method:'nequi',amount:38000}],paymentMethod:'nequi',efectivo_recibido:50000});
  const items=[{producto_id:S.product.id,nombre:S.product.nombre,cantidad:2,precio_unitario:S.product.precio_venta,precio:S.product.precio_venta}];
  const pending={type:'sale.create',requestId,draftRequestId:requestId,form:saleForm,items,labor:[]};
  const held=[heldEntry(S.product,'Cliente 1')];
  ok(await save(f,S.seller,0,draft(S.product,{cart:items,saleForm,pendingSale:pending,held})));
  let r=await f.call(S.seller,'/api/v2/action',pending);ok(r);
  const record=r.body.state.ventas[0];assert.equal(record.numeroDocumento,'1020304050');assert.equal(record.vueltas,20000);assert.equal(record.paymentMethod,'nequi');
  const saved=await f.call(S.seller,'/api/v2/draft');ok(saved);
  assert.equal(saved.body.draft.pendingSale,null);assert.equal(saved.body.draft.cart.length,0);assert.equal(saved.body.draft.held.length,1);assert.equal(saved.body.draft.held[0].nombre,'Cliente 1');
  assert.equal(saved.body.version,r.body.draftVersion);
  // Reintento idéntico: no duplica la venta.
  r=await f.call(S.seller,'/api/v2/action',pending);ok(r);assert.equal(r.body.state.ventas.length,1);
  // Un cobro que no coincide con lo guardado se rechaza.
  const other=crypto.randomUUID(),changed={...pending,requestId:other,draftRequestId:other};
  ok(await save(f,S.seller,saved.body.version,draft(S.product,{cart:items,saleForm,pendingSale:changed,held})));
  r=await f.call(S.seller,'/api/v2/action',{...changed,form:{...saleForm,efectivo_recibido:60000}});assert.equal(r.status,409);assert.equal(r.body.code,'DRAFT_CONFLICT');
});
