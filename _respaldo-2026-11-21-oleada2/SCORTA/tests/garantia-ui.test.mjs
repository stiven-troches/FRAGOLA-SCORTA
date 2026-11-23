// BE-35: SSR de la vista de garantías (vendedor y administrador), reporte y comprobante de recepción.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {compileSSR} from './ssr-build.mjs';
import {warrantyMarkup} from '../src/voucher-ticket.mjs';
import {WARRANTY_DECISIONS,WARRANTY_STATUS} from '../garantias.mjs';

let ui,cleanup;
before(async()=>{({module:ui,cleanup}=await compileSSR('garantia-ui',{WarrantiesView:'src/DocumentosComerciales.jsx#WarrantiesView'}))});
after(()=>cleanup?.());
const company={id:'c1',name:'Moto Garantía'};
const sale={id:'s1',fecha:'2026-11-10',cliente:'Pedro',userId:'u1',total:80000,detalles:[{producto_id:'p1',nombre:'Kit LED',cantidad:3,precio_unitario:40000}]};
const pending={id:'w1',numero:'GAR-0001',fecha:'2026-11-19',saleId:'s1',saleFecha:'2026-11-10',lineIndex:0,producto_id:'p1',nombre:'Kit LED',cantidad:1,precio_unitario:40000,cliente:'Pedro',motivo:'No enciende',proveedor:'Luz SAS',estado:'recibida',decision:null,fueraDePlazo:true,garantiaDias:5,venceGarantia:'2026-11-15',usuario:'ana'};
const sent={...pending,id:'w2',numero:'GAR-0002',estado:'enviada',decision:{tipo:'cambio'},fueraDePlazo:false};
const state={prods:[{id:'p1',nombre:'Kit LED',stock:3,stock_garantia:2,garantia_dias:5}],ventas:[sale],warranties:[pending,sent],suppliers:[]};

test('vendedor: recibe garantías pero no decide ni gestiona el reclamo',()=>{
 const html=renderToStaticMarkup(React.createElement(ui.WarrantiesView,{state,session:{userId:'u1'},admin:false,company,onAction:async()=>({})}));
 for(const text of ['Recibir garantía','GAR-0001 · Kit LED (1)','Por decidir','Fuera de plazo','Comprobante','Abiertas<b>2</b>'])assert.ok(html.includes(text),text);
 for(const text of ['>Decidir<','Enviar al proveedor','>Aprobada<','>Reporte<'])assert.ok(!html.includes(text),text);
});

test('administrador: decide, gestiona estados del reclamo y ve el reporte',()=>{
 const html=renderToStaticMarkup(React.createElement(ui.WarrantiesView,{state,session:{userId:'a1'},admin:true,company,onAction:async()=>({})}));
 for(const text of ['>Decidir<','>Aprobada<','>Rechazada<','>Reporte<','Cambio por otra unidad'])assert.ok(html.includes(text),text);
 // Abierta directamente en «Recibir garantía» desde el detalle de una venta.
 const dialog=renderToStaticMarkup(React.createElement(ui.WarrantiesView,{state,session:{userId:'a1'},admin:true,company,focusSaleId:'s1',onAction:async()=>({})}));
 assert.match(dialog,/Venta: <strong>Pedro<\/strong>/);assert.match(dialog,/<option value="0" selected="">Kit LED · 1 por reclamar/);assert.match(dialog,/Fuera de plazo: la garantía de 5 días venció/);
});

test('comprobante de recepción de garantía',()=>{
 const markup=warrantyMarkup({warranty:{...pending,telefono:'3001112233'},company,labels:{decisions:WARRANTY_DECISIONS,status:WARRANTY_STATUS}});
 for(const text of ['RECEPCIÓN DE GARANTÍA','GAR-0001','No enciende','Fuera del plazo de garantía','Recibida del cliente','Pendiente de revisión'])assert.ok(markup.includes(text),text);
});
