// BE-17: SSR de la vista de cotizaciones, «Guardar como cotización» en Nueva venta, comprobante y WhatsApp.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {compileSSR} from './ssr-build.mjs';
import {quoteMarkup} from '../src/voucher-ticket.mjs';

let ui,cleanup;
before(async()=>{({module:ui,cleanup}=await compileSSR('cotizacion-ui',{ClientWorkspace:'src/ClientWorkspace.jsx',QuotesView:'src/DocumentosComerciales.jsx#QuotesView',quotePreview:'src/DocumentosComerciales.jsx#quotePreview',quoteMessage:'src/DocumentosComerciales.jsx#quoteMessage'}))});
after(()=>cleanup?.());
const company={id:'c1',name:'Moto Cotiza',whatsapp:'+573001234567'};
const product={id:'p1',nombre:'Casco integral',referencia:'CAS-1',precio_venta:180000,stock:1,stock_minimo:1};
const quote={id:'q1',numero:'COT-0001',fecha:'2026-11-19',createdAt:'2026-11-19T15:00:00.000Z',vence:'2099-12-04',estado:'vigente',cliente:'Laura <b>',telefono:'3001112233',userId:'u1',usuario:'ana',
 detalles:[{producto_id:'p1',nombre:'Casco integral',referencia:'CAS-1',cantidad:2,precio_lista:170000,descuento:0,precio_unitario:170000}],bruto:340000,descuentos:0,total:340000};
const workspace=(role,plan)=>({session:{userId:'u1',username:'ana',name:'Ana',role,companyId:'c1',company:{...company,...(plan?{plan}:{})}},data:{revision:1,company,state:{prods:[product],ventas:[],compras:[],servs:[],movimientos:[],quotes:[quote],warranties:[],creditAccounts:[],customerDirectory:[]}},onAction:async()=>({}),onRefresh:async()=>({})});

test('navegación y Nueva venta: cotizaciones para vendedor y admin; ocultas si el plan no las incluye',()=>{
 const seller=renderToStaticMarkup(React.createElement(ui.ClientWorkspace,workspace('vendedor')));
 for(const label of ['>Cotizaciones<','>Garantías<','Guardar como cotización'])assert.ok(seller.includes(label),label);
 assert.ok(!seller.includes('>Proveedores<'),'el vendedor no ve proveedores');
 const admin=renderToStaticMarkup(React.createElement(ui.ClientWorkspace,workspace('admin')));
 for(const label of ['>Cotizaciones<','>Garantías<','>Proveedores<'])assert.ok(admin.includes(label),label);
 const limited=renderToStaticMarkup(React.createElement(ui.ClientWorkspace,workspace('vendedor',{features:['credito']})));
 for(const label of ['>Cotizaciones<','>Garantías<','Guardar como cotización'])assert.ok(!limited.includes(label),label);
});

test('vista de cotizaciones: estados, acciones, WhatsApp y comprobante imprimible',()=>{
 const html=renderToStaticMarkup(React.createElement(ui.QuotesView,{state:{prods:[product],quotes:[quote,{...quote,id:'q2',numero:'COT-0002',estado:'anulada'}]},session:{userId:'u1'},company,features:['cotizaciones'],onAction:async()=>({})}));
 assert.match(html,/Vigentes<b>1<\/b>/);assert.match(html,/Anuladas<b>1<\/b>/);
 assert.match(html,/COT-0001 · Laura &lt;b&gt;/);assert.doesNotMatch(html,/COT-0002/,'filtro vigente por defecto');
 for(const label of ['Convertir en venta','Imprimir o PDF','WhatsApp','Anular'])assert.ok(html.includes(label),label);
 assert.match(html,/https:\/\/wa\.me\/573001112233\?text=/);
 const message=ui.quoteMessage(quote,company);assert.match(message,/cotización COT-0001 de Moto Cotiza/);assert.match(message,/2 × Casco integral/);assert.match(message,/Total: \$\s?340\.000/);
 const markup=quoteMarkup({quote,company});
 for(const text of ['COTIZACIÓN','COT-0001','Total cotizado','no reserva mercancía','No es factura electrónica'])assert.ok(markup.includes(text),text);
 assert.ok(!markup.includes('<b>'),'el nombre del cliente se escapa');
});

test('vista previa de la conversión: avisa del precio actual y del stock faltante',()=>{
 const preview=ui.quotePreview(quote,{prods:[product],settings:{}},false);
 assert.deepEqual(preview.changes,[{nombre:'Casco integral',cantidad:2,antes:170000,ahora:180000}]);
 assert.equal(preview.total,360000);assert.deepEqual(preview.short,[{nombre:'Casco integral',disponible:1,solicitado:2}]);
 assert.deepEqual(ui.quotePreview(quote,{prods:[],settings:{}}).missing,['Casco integral']);
});
