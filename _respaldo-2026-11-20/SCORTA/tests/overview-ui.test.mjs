import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'vite';
import {initialOverviewDates,overviewDatesReducer,overviewRankingRows} from '../src/overview-filters.mjs';
import {overviewReport} from '../overview-report.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url))),now=Date.parse('2026-11-20T15:00:00.000Z');
const session={role:'admin',companyId:'c1',company:{name:'Empresa de prueba'}};
let directory,OverviewPanel,OverviewDateFilter;
before(async()=>{
 mkdirSync(join(root,'test-results'),{recursive:true});directory=mkdtempSync(join(root,'test-results','overview-ui-'));
 const entry=join(directory,'entry.mjs');writeFileSync(entry,`export {default as OverviewPanel} from ${JSON.stringify(join(root,'src/OverviewPanel.jsx'))}; export {default as OverviewDateFilter} from ${JSON.stringify(join(root,'src/OverviewDateFilter.jsx'))};`);
 const result=await build({root,logLevel:'silent',build:{ssr:entry,write:false,minify:false}}),output=(Array.isArray(result)?result[0]:result).output,chunk=output.find(item=>item.type==='chunk'&&item.isEntry);
 assert.ok(chunk);const file=join(directory,'compiled.mjs');writeFileSync(file,chunk.code);({OverviewPanel,OverviewDateFilter}=await import(pathToFileURL(file).href));
});
after(()=>{if(directory)rmSync(directory,{recursive:true,force:true})});
const render=(state={},extra={})=>renderToStaticMarkup(React.createElement(OverviewPanel,{data:{state},session,now,onOpenAdmin(){},onNavigate(){},onPurchase(){},onSales(){},...extra}));
const sale=(extra={})=>({id:'sale',fecha:'2026-11-20',usuario:'Admin',paymentMethod:'efectivo',total:75000,detalles:[{producto_id:'p1',nombre:'Aceite de prueba',cantidad:2,precio_unitario:25000,costo_unitario:15000}],labor:[{descripcion:'Cambio de aceite',mecanico:'Carlos',mecanicoId:'m1',mecanicoPorcentaje:60,importe:25000}],...extra});

test('SSR resumen: período, importes separados, producto vendido y ganancia final con margen',()=>{
 const html=render({ventas:[sale()],prods:[{id:'p1',nombre:'Aceite de prueba'},{id:'p2',nombre:'Producto sin ventas'}]});
 for(const label of ['RESUMEN GENERAL','FECHA','VENTAS NETAS TOTALES','VENTA DE PRODUCTOS','MANO DE OBRA FACTURADA','QUÉ VENDIMOS','Aceite de prueba','GANANCIA TOTAL GENERAL','Margen:'])assert.ok(html.includes(label),label);
 assert.match(html,/75\.000/);assert.match(html,/50\.000/);assert.match(html,/25\.000/);assert.match(html,/20\.000/);assert.match(html,/40 %/);
 assert.match(html,/servicio registrado/);assert.match(html,/Mayor ganancia/);
 for(const label of ['Cierre de caja','Reportes y exportaciones','Preparar reposición','Mecánicos'])assert.ok(html.includes(label));
 assert.ok(html.lastIndexOf('GANANCIA TOTAL GENERAL')>html.indexOf('QUÉ VENDIMOS'));
 assert.match(html,/<option value="noSales">SIN VENTAS<\/option>/);
 assert.doesNotMatch(html,/ov-no-sales|ov-summary|Producto sin ventas/);
 for(const text of ['Cómo nos fue en estas fechas.','Importes netos, considerando devoluciones y anulaciones sobre la fecha original de la venta.','Unidades netas entre los productos vendidos en el período.','Máximo 5 productos. Los productos sin ventas aparecen aparte.','Ventas con ingreso neto','Venta promedio','Devoluciones','Anulaciones'])assert.ok(!html.includes(text),text);
 for(const text of ['Hoy','Ayer','Esta semana','Este mes'])assert.ok(!html.includes('>'+text+'<'),text);
 for(const heading of html.matchAll(/<(?:h1|h2|h3|th)>([^<]+)<\/(?:h1|h2|h3|th)>/g))assert.equal(heading[1],heading[1].toLocaleUpperCase('es'));
});

test('SSR resumen: costos incompletos no se convierten en ganancia cero ni se mezclan con mano de obra',()=>{
 const html=render({ventas:[sale({detalles:[{producto_id:'p1',nombre:'Sin costo',cantidad:2,precio_unitario:25000}]})]});
 assert.match(html,/Sin costo completo/);assert.match(html,/Sin costo histórico completo/);assert.match(html,/no se puede calcular/);
 assert.doesNotMatch(html,/ov-profit-values/);
 assert.match(html,/No calculable con los datos disponibles/);
});

test('SSR resumen: solo mano de obra conserva ingreso y no inventa un margen de productos',()=>{
 const html=render({ventas:[sale({detalles:[],total:25000})]});
 assert.match(html,/25\.000/);assert.match(html,/No se vendieron productos/);assert.match(html,/Margen: <b>—<\/b>/);
 assert.match(html,/GANANCIA EN MANO DE OBRA/);assert.match(html,/10\.000/);assert.doesNotMatch(html,/Sin costo histórico completo/);
});

test('SSR resumen: vendedor no recibe datos o herramientas administrativas',()=>{
 const html=render({ventas:[sale()]},{session:{role:'vendedor',companyId:'c1'}});
 assert.match(html,/disponible para el administrador/);assert.doesNotMatch(html,/75\.000|GANANCIA TOTAL|Administración|Cierre de caja/);
});

test('SSR resumen: texto de producto se escapa y no se muestran formularios con acciones de escritura',()=>{
 const html=render({ventas:[sale({detalles:[{producto_id:'p1',nombre:'<script>producto</script>',cantidad:1,precio_unitario:50000,costo_unitario:30000}]})]});
 assert.match(html,/&lt;script&gt;producto&lt;\/script&gt;/);assert.doesNotMatch(html,/<script>/);assert.doesNotMatch(html,/<form\b/);
 assert.match(html,/aria-expanded="false"/);assert.match(html,/aria-haspopup="dialog"/);assert.doesNotMatch(html,/type="date"|ov-shortcuts/);
});


test('SSR resumen: producto eliminado mantiene su venta histórica sin enlazar una ficha inexistente',()=>{
 const html=render({ventas:[sale({detalles:[{producto_id:'deleted',nombre:'Producto descontinuado',cantidad:1,precio_unitario:50000,costo_unitario:30000}]})],prods:[]},{onProduct(){}});
 assert.match(html,/Producto descontinuado/);assert.match(html,/20\.000/);assert.doesNotMatch(html,/<button[^>]*class="ov-product-button"[^>]*>Producto descontinuado<\/button>/);
});


test('SSR resumen: detalle inicial compacto sin recortar la ganancia de todos los productos',()=>{
 const ventas=Array.from({length:12},(_,index)=>sale({id:'sale-'+index,total:2000,labor:[],detalles:[{producto_id:'product-'+index,nombre:'Producto '+String(index+1).padStart(2,'0'),cantidad:1,precio_unitario:2000,costo_unitario:1000}]}));
 const html=render({ventas,prods:[]});
 const table=html.match(/<table class="ov-table">([\s\S]*?)<\/table>/)?.[1]||'';
 assert.equal((table.match(/<tr>/g)||[]).length,11,'Encabezado y diez productos visibles');
 assert.match(html,/Ver más productos/);
 const final=html.slice(html.lastIndexOf('<section class="ov-profit"'));
 assert.match(final,/12\.000/);assert.match(final,/50 %/);
});


test('filtro de rango: editar no cambia cifras hasta FILTRAR y cerrar descarta el borrador',()=>{
 const original=initialOverviewDates(now);
 assert.deepEqual(original.range,{from:'2026-11-01',to:'2026-11-20'});
 let state=overviewDatesReducer(original,{type:'toggle'});
 state=overviewDatesReducer(state,{type:'edit',field:'from',value:'2026-10-01'});
 assert.deepEqual(state.range,original.range);assert.equal(state.draft.from,'2026-10-01');
 const closed=overviewDatesReducer(state,{type:'close'});
 assert.equal(closed.open,false);assert.deepEqual(closed.draft,original.range);
 state=overviewDatesReducer(state,{type:'apply'});
 assert.equal(state.range.from,'2026-10-01');assert.equal(state.open,false);assert.equal(state.error,'');
});

test('filtro de rango: rechaza fechas incompletas, imposibles o invertidas sin cambiar el período aplicado',()=>{
 const original=initialOverviewDates(now);
 for(const draft of [{from:'',to:'2026-11-20'},{from:'2026-02-30',to:'2026-11-20'},{from:'2026-11-21',to:'2026-11-20'},{from:'noviembre',to:'2026-11-20'}]){
  const result=overviewDatesReducer({...original,open:true,draft},{type:'apply'});
  assert.ok(result.error);assert.equal(result.open,true);assert.deepEqual(result.range,original.range);
 }
});

test('filtro de rango: LIMPIAR incluye todo el historial y conserva cálculos históricos',()=>{
 const original=initialOverviewDates(now),ventas=[sale(),sale({id:'old',fecha:'2026-10-20'})];
 assert.equal(overviewReport({ventas},original.range).totals.net,75000);
 const cleared=overviewDatesReducer(original,{type:'clear'});
 assert.deepEqual(cleared.range,{from:'',to:''});assert.equal(cleared.open,false);
 const report=overviewReport({ventas},cleared.range);
 assert.equal(report.totals.net,150000);assert.equal(report.totals.productProfit,40000);
 const reopened=overviewDatesReducer(cleared,{type:'toggle'});assert.deepEqual(reopened.draft,cleared.range);
});

test('SSR filtro abierto: dos fechas accesibles, FILTRAR y LIMPIAR, sin atajos',()=>{
 const state={...initialOverviewDates(now),open:true,error:'Selecciona las fechas Desde y Hasta.'};
 const html=renderToStaticMarkup(React.createElement(OverviewDateFilter,{state,dispatch(){}}));
 assert.equal((html.match(/type="date"/g)||[]).length,2);
 for(const text of ['DESDE','HASTA','FILTRAR','LIMPIAR'])assert.ok(html.includes(text));
 assert.match(html,/role="dialog"/);assert.match(html,/aria-expanded="true"/);assert.match(html,/role="alert"/);assert.match(html,/aria-describedby=/);
 assert.doesNotMatch(html,/Hoy|Ayer|Esta semana|Este mes/);
});

test('SIN VENTAS usa catálogo sin ventas netas del rango y muestra más sin alterar los otros rankings',()=>{
 const prods=Array.from({length:14},(_,i)=>({id:'p'+i,nombre:'Producto '+i}));
 const overview=overviewReport({ventas:[sale()],prods},{from:'2026-11-01',to:'2026-11-20'});
 assert.equal(overview.noSales.length,13);
 const first=overviewRankingRows(overview,'noSales');assert.equal(first.length,10);assert.ok(first.every(p=>p.id!=='p1'));
 assert.equal(overviewRankingRows(overview,'noSales',20).length,13);
 assert.deepEqual(overviewRankingRows(overview,'mostSold'),overview.rankings.mostSold);
 assert.deepEqual(overviewRankingRows(null,'noSales'),[]);
});


test('SSR resumen: tres exportaciones, sin referencia ni accesos duplicados y con ganancias separadas',()=>{
 const html=render({ventas:[sale()],prods:[{id:'p1',nombre:'Aceite',referencia:'NO-DEBE-VERSE'}]});
 assert.doesNotMatch(html,/NO-DEBE-VERSE|excluye anulados|>Nueva venta<|>Ver inventario<|>Ingresar mercancía</);
 assert.equal((html.match(/>DESCARGAR EXCEL</g)||[]).length,3);
 for(const label of ['GANANCIA EN PRODUCTOS','GANANCIA EN MANO DE OBRA','GANANCIA TOTAL GENERAL','Cambio de aceite','60 %'])assert.ok(html.includes(label),label);
 const final=html.slice(html.lastIndexOf('<section class="ov-profit"'));
 assert.match(final,/20\.000/);assert.match(final,/10\.000/);assert.match(final,/30\.000/);
});
