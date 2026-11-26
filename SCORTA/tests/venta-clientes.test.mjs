// BE-19 ficha de cliente con documento y BE-36 lista de precios por tipo de cliente.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qaPlatform,ok,DAY_D} from './qa-fixture.mjs';
import {catalogPrice,cleanProductPrices} from '../sale-pricing.mjs';
import {aplicarCambio,estadoVacio} from '../inventory.mjs';
import {inventoryReport,reportColumns,salesReport} from '../admin-reports.mjs';
import {receiptMarkup} from '../src/receipt-ticket.mjs';

const action=(f,actor,body)=>f.call(actor,'/api/v2/action',{requestId:crypto.randomUUID(),...body});
const setPrices=(f,S,precios)=>action(f,S.admin,{type:'business.change',payload:{kind:'producto',form:{...S.product,id:S.product.id,precios}}});

test('inventario: precios especiales opcionales, tarifa de IVA, importación y columnas de exportación',()=>{
  assert.equal(catalogPrice({precio_venta:100,precios:{mecanico:90}},'mecanico'),90);
  assert.equal(catalogPrice({precio_venta:100,precios:{mecanico:90}},'mayorista'),100);
  assert.equal(catalogPrice({precio_venta:100},'desconocido'),100);
  assert.deepEqual(cleanProductPrices({precio_mecanico:'90',precio_mayorista:''}),{mecanico:90});
  assert.throws(()=>cleanProductPrices({precios:{mayorista:-1}}),/importe inválido/);
  let state=aplicarCambio(estadoVacio(),{kind:'importar',revision:0,items:[
    {nombre:'Aceite',precio_venta:38000,stock:5,precio_mecanico:34000,precio_mayorista:31000,tarifa_iva:19},
    {nombre:'Filtro',precio_venta:20000,stock:2,precio_mecanico:'',tarifa_iva:''}]},'QA');
  const [oil,filter]=state.prods;
  assert.deepEqual(oil.precios,{mostrador:38000,mecanico:34000,mayorista:31000});assert.equal(oil.tarifa_iva,19);
  assert.equal(filter.precios,undefined);assert.equal(filter.tarifa_iva,undefined);
  assert.throws(()=>aplicarCambio(state,{kind:'importar',revision:state.revision,items:[{nombre:'Malo',precio_venta:1,tarifa_iva:16}]},'QA'),/0, 5 o 19/);
  // Editar sin enviar precios conserva los especiales; cambiar precio_venta actualiza mostrador.
  state=aplicarCambio(state,{kind:'producto',revision:state.revision,form:{id:oil.id,nombre:'Aceite',precio_venta:40000}},'QA');
  assert.deepEqual(state.prods[0].precios,{mostrador:40000,mecanico:34000,mayorista:31000});assert.equal(state.prods[0].tarifa_iva,19);
  state=aplicarCambio(state,{kind:'producto',revision:state.revision,form:{id:oil.id,nombre:'Aceite',precio_venta:40000,precios:{mecanico:null,mayorista:null},tarifa_iva:''}},'QA');
  assert.equal(state.prods[0].precios,undefined);assert.equal(state.prods[0].tarifa_iva,undefined);
  const columns=reportColumns('inventory').map(([key])=>key);
  for(const key of ['priceMechanic','priceWholesale','vatRate'])assert.ok(columns.includes(key),key);
  const report=inventoryReport({prods:[{id:'1',nombre:'A',precio_venta:10,precios:{mecanico:9},tarifa_iva:5,stock:1}]});
  assert.equal(report.rows[0].priceMechanic,9);assert.equal(report.rows[0].priceWholesale,null);assert.equal(report.rows[0].vatRate,5);
});

test('API: ficha con documento; el vendedor la selecciona y vende con precio mecánico sin contarlo como descuento',async()=>{
  const f=await qaPlatform(),S=await f.shop('Clientes QA',{stock:10,price:34000});
  ok(await setPrices(f,S,{mecanico:30000,mayorista:28000}));
  let r=await action(f,S.seller,{type:'customer.create',form:{nombre:'Taller'}});assert.equal(r.status,403);
  r=await action(f,S.admin,{type:'customer.create',form:{nombre:'Taller El Pistón',telefono:'3005550101',tipoDocumento:'NIT',numeroDocumento:'900.123.456-1',correo:'Taller@Example.com',tipo:'mecanico',dataConsent:true}});ok(r);
  const card=r.body.state.customerRecords.find(c=>c.nombre==='Taller El Pistón');
  assert.equal(card.numeroDocumento,'900123456-1');assert.equal(card.tipoDocumento,'NIT');assert.equal(card.correo,'taller@example.com');assert.equal(card.tipo,'mecanico');assert.ok(card.consentAt);
  r=await action(f,S.admin,{type:'customer.create',form:{nombre:'Otro',tipoDocumento:'NIT',numeroDocumento:'900123456-1'}});assert.equal(r.status,400);assert.match(r.body.error,/documento/);
  r=await action(f,S.admin,{type:'customer.create',form:{nombre:'Malo',tipoDocumento:'XX',numeroDocumento:'123456'}});assert.equal(r.status,400);
  // El vendedor recibe el directorio (sin correo ni consentimiento) pero no los registros completos.
  const view=await f.data(S.seller);
  assert.equal(view.state.customerRecords,undefined);
  const entry=view.state.customerDirectory.find(c=>c.id===card.id);
  // Ley 1581: teléfono y documento enmascarados para el vendedor (solo los últimos 4).
  assert.deepEqual(entry,{id:card.id,nombre:'Taller El Pistón',telefono:'•••0101',tipo:'mecanico',tipoDocumento:'NIT',numeroDocumento:'•••56-1',masked:true});
  assert.equal(JSON.stringify(view.state.customerDirectory).includes('3005550101'),false);
  assert.equal((await f.data(S.admin)).state.customerDirectory.find(c=>c.id===card.id).telefono,'3005550101','el administrador ve el dato completo');
  const body=await f.act(S.seller,{type:'sale.create',form:{cliente:'Taller El Pistón',telefono:'3005550101',customerId:card.id,paymentMethod:'efectivo'},items:[{producto_id:S.product.id,cantidad:2,precio:30000,precio_unitario:30000}],labor:[]});
  const record=body.state.ventas[0],line=record.detalles[0];
  assert.equal(line.precio_lista,30000);assert.equal(line.descuento,0);assert.equal(record.total,60000);assert.equal(record.tipoCliente,'mecanico');
  assert.equal(record.numeroDocumento,'•••56-1','Ley 1581: el vendedor recibe el documento enmascarado');const stored=f.state.businesses[S.company.id].ventas[0];assert.equal(stored.numeroDocumento,'900123456-1','el servidor guarda el documento completo');assert.equal(record.descuentos,undefined);
  assert.equal(salesReport(f.state.businesses[S.company.id],{from:DAY_D,to:DAY_D}).totals.discounts,0);
  assert.ok(receiptMarkup({sale:stored,company:{name:'Clientes QA'}}).includes('NIT 900123456-1'));
  // Con la ficha, el tope del vendedor se mide sobre el precio de mecánico.
  r=await action(f,S.seller,{type:'sale.create',form:{cliente:'Taller El Pistón',customerId:card.id,paymentMethod:'efectivo'},items:[{producto_id:S.product.id,cantidad:1,precio:30000,descuento:{tipo:'porcentaje',valor:11},precio_unitario:26700}],labor:[]});
  assert.equal(r.status,403);assert.equal(r.body.code,'DISCOUNT_LIMIT');
  // Reconocido solo por teléfono (sin seleccionar la ficha) conserva el precio de mostrador.
  const byPhone=await f.act(S.seller,{type:'sale.create',form:{cliente:'Taller El Pistón',telefono:'3005550101',paymentMethod:'efectivo'},items:[{producto_id:S.product.id,cantidad:1,precio_unitario:34000}],labor:[]});
  assert.equal(byPhone.state.ventas[0].customerId,card.id);assert.equal(byPhone.state.ventas[0].detalles[0].precio_lista,34000);
  // El vendedor no asigna listas de precios; el administrador sí, al vender.
  r=await action(f,S.seller,{type:'sale.create',form:{cliente:'Nuevo',tipoCliente:'mayorista',paymentMethod:'efectivo'},items:[{producto_id:S.product.id,cantidad:1,precio_unitario:28000}],labor:[]});
  assert.equal(r.status,403);assert.match(r.body.error,/lista de precios/);
  const wholesale=await f.act(S.admin,{type:'sale.create',form:{cliente:'Mayorista QA',tipoCliente:'mayorista',paymentMethod:'efectivo'},items:[{producto_id:S.product.id,cantidad:1,precio:28000,precio_unitario:28000}],labor:[]});
  assert.equal(wholesale.state.ventas[0].detalles[0].precio_lista,28000);
  assert.equal(f.state.businesses[S.company.id].customerRecords.find(c=>c.nombre==='Mayorista QA').tipo,'mayorista');
});

test('API: customer.update corrige documento, correo y tipo; customer.erase los borra; otra empresa no puede usar la ficha',async()=>{
  const f=await qaPlatform(),A=await f.shop('Ficha A',{stock:10}),B=await f.shop('Ficha B',{stock:10});
  const created=await f.act(A.admin,{type:'customer.create',form:{nombre:'Ana Gómez',telefono:'3001112233',dataConsent:true}});
  const card=created.state.customerRecords[0];
  await f.act(A.admin,{type:'sale.create',form:{cliente:'Ana Gómez',customerId:card.id,paymentMethod:'efectivo'},items:[{producto_id:A.product.id,cantidad:1,precio_unitario:A.product.precio_venta}],labor:[]});
  // El vendedor completa el documento que faltaba al vender con la ficha.
  let body=await f.act(A.seller,{type:'sale.create',form:{cliente:'Ana Gómez',customerId:card.id,tipoDocumento:'CC',numeroDocumento:'52.111.222',paymentMethod:'efectivo',dataConsent:true},items:[{producto_id:A.product.id,cantidad:1,precio_unitario:A.product.precio_venta}],labor:[]});
  assert.equal(f.state.businesses[A.company.id].customerRecords[0].numeroDocumento,'52111222');
  let r=await action(f,A.seller,{type:'customer.update',id:card.id,form:{numeroDocumento:'1'}});assert.equal(r.status,403);
  body=await f.act(A.admin,{type:'customer.update',id:card.id,form:{nombre:'Ana María Gómez',telefono:'3001112233',tipoDocumento:'CE',numeroDocumento:'E-998877',correo:'ana@example.com',tipo:'mayorista'}});
  const record=body.state.customerRecords[0];
  assert.deepEqual([record.tipoDocumento,record.numeroDocumento,record.correo,record.tipo],['CE','E-998877','ana@example.com','mayorista']);
  assert.ok(body.state.ventas.every(sale=>sale.numeroDocumento==='E-998877'&&sale.tipoDocumento==='CE'&&sale.cliente==='Ana María Gómez'));
  const log=body.state.auditoria.find(entry=>entry.accion==='cliente_corregido');assert.equal(log.antes.numeroDocumento,'52111222');assert.equal(log.despues.tipo,'mayorista');
  r=await action(f,A.admin,{type:'customer.update',id:card.id,form:{correo:'no-es-correo'}});assert.equal(r.status,400);
  // Aislamiento: la ficha de A no existe para B.
  r=await action(f,B.seller,{type:'sale.create',form:{cliente:'Ana',customerId:card.id,paymentMethod:'efectivo'},items:[{producto_id:B.product.id,cantidad:1,precio_unitario:B.product.precio_venta}],labor:[]});
  assert.equal(r.status,404);assert.equal(r.body.code,'CUSTOMER_NOT_FOUND');
  assert.equal((await f.data(B.admin)).state.customerDirectory.length,0);
  // El enlace público del comprobante enmascara el documento.
  const link=body.state.ventas[0];
  const issued=await f.act(A.admin,{type:'sale.receipt',id:link.id});const token=issued.receiptLink.token;
  const pub=await f.call(null,'/api/v2/receipt/'+token);ok(pub);assert.equal(pub.body.sale.numeroDocumento,'E-**8877');
  // Supresión (Ley 1581): se borran documento y correo de la ficha y de sus ventas.
  body=await f.act(A.admin,{type:'customer.erase',id:card.id});
  assert.ok(body.state.ventas.every(sale=>!sale.numeroDocumento&&!sale.tipoDocumento));
  assert.equal(body.state.customerRecords[0].numeroDocumento,undefined);assert.equal(body.state.customerRecords[0].correo,undefined);
  assert.ok(!JSON.stringify(f.state.businesses[A.company.id].auditoria).includes('E-998877'));
  r=await action(f,A.seller,{type:'sale.create',form:{cliente:'Ana',customerId:card.id,paymentMethod:'efectivo'},items:[{producto_id:A.product.id,cantidad:1,precio_unitario:A.product.precio_venta}],labor:[]});
  assert.equal(r.status,404);
});
