import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'vite';

const root=resolve(new URL('..',import.meta.url).pathname),date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let directory,components;
before(async()=>{
 mkdirSync(join(root,'test-results'),{recursive:true});directory=mkdtempSync(join(root,'test-results','admin-tools-ui-'));
 const entry=join(directory,'entry.mjs');writeFileSync(entry,`export {default as AdminTools,mechanicActivity} from ${JSON.stringify(join(root,'src/AdminTools.jsx'))};`);
 const result=await build({root,logLevel:'silent',build:{ssr:entry,write:false,minify:false}}),output=Array.isArray(result)?result[0].output:result.output,chunk=output.find(item=>item.type==='chunk'&&item.isEntry);
 assert.ok(chunk);const module=join(directory,'compiled.mjs');writeFileSync(module,chunk.code);components=await import(pathToFileURL(module).href);
});
after(()=>{if(directory)rmSync(directory,{recursive:true,force:true})});
const render=(view,state={},role='admin')=>renderToStaticMarkup(React.createElement(components.AdminTools,{view,data:{state},session:{role,companyId:'c1',company:{name:'Empresa de prueba'}},onClose(){},onAction:async()=>({})}));

test('SSR administrador: reportes identifican costos incompletos y no llaman utilidad a la mano de obra',()=>{
 const html=render('reports',{ventas:[{id:'v1',fecha:date,usuario:'Admin',cliente:'Cliente',paymentMethod:'efectivo',total:120,detalles:[{producto_id:'p1',nombre:'Aceite',cantidad:1,precio_unitario:100}],labor:[{descripcion:'Cambio',mecanico:'Ana',importe:20}]}]});
 assert.match(html,/role="dialog"/);assert.match(html,/Ventas netas/);assert.match(html,/Margen de productos/);assert.match(html,/Sin costo completo/);assert.match(html,/la mano de obra es ingreso, no utilidad calculada/);assert.match(html,/Descargar CSV/);
 const seller=render('reports',{},'vendedor');assert.match(seller,/disponible para el administrador/);assert.doesNotMatch(seller,/Descargar CSV/);
});

test('SSR cierre: conserva snapshot inmutable y avisa cambios por medio de pago aun con total idéntico',()=>{
 const html=render('cash',{ventas:[{id:'v1',fecha:date,total:100,paymentMethod:'transferencia',detalles:[],labor:[{descripcion:'Servicio',mecanico:'Ana',importe:100}]}],cashClosures:[{id:'c1',date,name:'Ana',createdAt:date+'T15:00:00Z',expected:{efectivo:100,transferencia:0,tarjeta:0},actual:{efectivo:90,transferencia:0,tarjeta:0},differences:{efectivo:-10,transferencia:0,tarjeta:0},totals:{expected:100,actual:90,difference:-10}}]});
 assert.match(html,/Cierre registrado/);assert.match(html,/Diferencia total/);assert.match(html,/Movimientos posteriores/);assert.match(html,/No incluye saldo inicial, gastos ni retiros/);assert.doesNotMatch(html,/>Registrar cierre</);
});

test('SSR reposición: agotados y mínimos claros, sugerencias sin compra automática',()=>{
 const html=render('replenishment',{prods:[{id:'p1',nombre:'Agotado',stock:0,stock_minimo:2,precio_compra:5,precio_venta:10},{id:'p2',nombre:'En mínimo',stock:3,stock_minimo:3,precio_compra:5,precio_venta:10},{id:'p3',nombre:'Suficiente',stock:5,stock_minimo:3,precio_compra:5,precio_venta:10}]});
 assert.match(html,/at-stock-agotado/);assert.match(html,/at-stock-minimo/);assert.match(html,/Compra sugerida/);assert.doesNotMatch(html,/Suficiente/);assert.match(html,/no registra una compra ni cambia las existencias/);
});

test('mecánicos: solo ventas, historial por ID y devoluciones ambiguas sin reparto ficticio',()=>{
 const business={ventas:[{id:'v1',fecha:date,total:50,labor:[{mecanicoId:'m1',mecanico:'Nombre anterior',importe:30},{mecanicoId:'m2',mecanico:'Otro',importe:20}],laborRefund:10}],servs:[{fecha:date,mecanico:'Nombre anterior',costo_mano_obra:50}]};
 const activity=components.mechanicActivity(business,{id:'m1',name:'Nuevo nombre'},{from:date,to:date});assert.equal(activity.jobs,1);assert.equal(activity.amount,null);assert.equal(activity.allocationComplete,false);
 const html=render('mechanics',{...business,mechanics:[{id:'m1',name:'Nuevo nombre',active:true}]});assert.match(html,/Devolución sin desglose/);assert.match(html,/no representan el pago al mecánico/);assert.match(html,/Desactivar/);assert.match(html,/Agregar mecánico/);
});


test('SSR mecánicos: conserva cobros históricos de nombres sin asociación sin inventar un catálogo',()=>{
 const state={mechanics:[{id:'m1',name:'Nombre nuevo',active:true}],ventas:[{id:'v1',fecha:date,total:30000,labor:[{mecanico:'Nombre anterior sin ID',importe:30000}]}]};
 const html=render('mechanics',state);
 assert.match(html,/Históricos sin asociación a la lista/);assert.match(html,/Nombre anterior sin ID/);assert.match(html,/sin asignarlos automáticamente/);assert.equal(state.mechanics.length,1);
});
