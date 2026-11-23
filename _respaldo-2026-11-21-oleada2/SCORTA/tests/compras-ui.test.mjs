// BE-40: SSR de Proveedores (órdenes, cuentas por pagar y fichas), orden desde reposición y comprobantes.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {compileSSR} from './ssr-build.mjs';
import {purchaseOrderMarkup,supplierPaymentMarkup} from '../src/voucher-ticket.mjs';
import {CASH_MOVEMENT_LABELS} from '../caja-credito.mjs';

let ui,cleanup;
before(async()=>{({module:ui,cleanup}=await compileSSR('compras-ui',{PurchasingView:'src/DocumentosComerciales.jsx#PurchasingView',orderMessage:'src/DocumentosComerciales.jsx#orderMessage',AdminTools:'src/AdminTools.jsx'}))});
after(()=>cleanup?.());
const company={id:'c1',name:'Moto Compras'};
const supplier={id:'s1',nombre:'Frenos SAS',nit:'900111222-3',telefono:'3105550000',plazoDias:30,contacto:'Marta'};
const order={id:'o1',numero:'OC-0001',fecha:'2026-11-19',estado:'enviada',supplierId:'s1',proveedor:'Frenos SAS',total:100000,items:[{producto_id:'p1',nombre:'Pastillas',referencia:'REP-1',cantidad:5,costo:20000,recibido:0}],recepciones:[],usuario:'admin'};
const accounts=[{supplierId:'s1',nombre:'Frenos SAS',nit:'900111222-3',plazoDias:30,saldo:60000,vencido:60000,facturas:[{compraId:'c1',fecha:'2026-10-01',factura:'A-1',vence:'2026-10-31',monto:60000,saldo:60000,pagado:0,vencida:true,diasVencida:19}],pagos:[]}];
const state={prods:[{id:'p1',nombre:'Pastillas',stock:0,stock_minimo:2,precio_compra:20000}],suppliers:[supplier],purchaseOrders:[order],payableAccounts:accounts,compras:[{id:'c1',fecha:'2026-10-01',supplierId:'s1',proveedor:'Frenos SAS',factura:'A-1',total:60000,credito:{monto:60000,saldo:60000,pagado:0,plazoDias:30,vence:'2026-10-31'},detalles:[]}]};

test('órdenes de compra: acciones por estado, WhatsApp al proveedor e impresión',()=>{
 const html=renderToStaticMarkup(React.createElement(ui.PurchasingView,{state,admin:true,company,features:['ordenes_compra'],onAction:async()=>({})}));
 for(const text of ['Nueva orden','Desde reposición','OC-0001 · Frenos SAS','Enviada','Recibir','Imprimir o PDF','Anular','https://wa.me/573105550000'])assert.ok(html.includes(text),text);
 assert.ok(!html.includes('Marcar enviada'),'una orden enviada no se vuelve a enviar');
 assert.match(ui.orderMessage(order,company),/orden de compra OC-0001:\n• 5 × Pastillas \(ref\. REP-1\) a \$\s?20\.000/);
 const markup=purchaseOrderMarkup({order,company,supplier,status:'Enviada'});
 for(const text of ['ORDEN DE COMPRA','OC-0001','900111222-3','Total estimado'])assert.ok(markup.includes(text),text);
 const disabled=renderToStaticMarkup(React.createElement(ui.PurchasingView,{state:{...state,purchaseOrders:[]},admin:true,company,features:[],onAction:async()=>({})}));
 assert.ok(!disabled.includes('Nueva orden'),'sin la función del plan no se crean órdenes');assert.match(disabled,/Cuentas por pagar/);
 assert.match(renderToStaticMarkup(React.createElement(ui.PurchasingView,{state,admin:false,company,features:['ordenes_compra']})),/son del administrador/);
});

test('cuentas por pagar y proveedores',()=>{
 const html=renderToStaticMarkup(React.createElement(ui.PurchasingView,{state,admin:true,company,features:['ordenes_compra'],initialTab:'pagar',onAction:async()=>({})}));
 for(const text of ['Total por pagar','Vencido','Frenos SAS','A-1','vencida hace 19 días','Registrar pago'])assert.ok(html.includes(text),text);
 const suppliers=renderToStaticMarkup(React.createElement(ui.PurchasingView,{state,admin:true,company,features:['ordenes_compra'],initialTab:'proveedores',onAction:async()=>({})}));
 for(const text of ['Nuevo proveedor','NIT 900111222-3','30 días','Editar'])assert.ok(suppliers.includes(text),text);
 const markup=supplierPaymentMarkup({payment:{numero:'PP-0001',fecha:'2026-11-20',proveedor:'Frenos SAS',method:'efectivo',amount:60000,saldoAntes:60000,saldoDespues:0,aplicado:[{fecha:'2026-10-01',factura:'A-1',amount:60000}]},company});
 for(const text of ['PAGO A PROVEEDOR','PP-0001','A-1','Efectivo'])assert.ok(markup.includes(text),text);
 assert.equal(CASH_MOVEMENT_LABELS.pago_proveedor,'Pago a proveedor');
});

test('Preparar reposición ofrece generar la orden de compra',()=>{
 const props=features=>({view:'replenishment',session:{role:'admin',companyId:'c1',company:{...company,plan:{features}}},data:{state},onAction:async()=>({}),onClose(){}});
 const html=renderToStaticMarkup(React.createElement(ui.AdminTools,props(['ordenes_compra'])));
 assert.match(html,/Generar orden de compra/);assert.match(html,/Frenos SAS/);
 assert.doesNotMatch(renderToStaticMarkup(React.createElement(ui.AdminTools,props([]))),/Generar orden de compra/);
});
