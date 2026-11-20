import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'vite';

const root=resolve(fileURLToPath(new URL('..',import.meta.url))),now=Date.parse('2026-11-20T15:00:00.000Z');
const session={role:'admin',companyId:'c1',company:{name:'Empresa de prueba'}};
let directory,OverviewPanel;
before(async()=>{
 mkdirSync(join(root,'test-results'),{recursive:true});directory=mkdtempSync(join(root,'test-results','overview-ui-'));
 const entry=join(directory,'entry.mjs');writeFileSync(entry,`export {default as OverviewPanel} from ${JSON.stringify(join(root,'src/OverviewPanel.jsx'))};`);
 const result=await build({root,logLevel:'silent',build:{ssr:entry,write:false,minify:false}}),output=(Array.isArray(result)?result[0]:result).output,chunk=output.find(item=>item.type==='chunk'&&item.isEntry);
 assert.ok(chunk);const file=join(directory,'compiled.mjs');writeFileSync(file,chunk.code);OverviewPanel=(await import(pathToFileURL(file).href)).OverviewPanel;
});
after(()=>{if(directory)rmSync(directory,{recursive:true,force:true})});
const render=(state={},extra={})=>renderToStaticMarkup(React.createElement(OverviewPanel,{data:{state},session,now,onOpenAdmin(){},onNavigate(){},onPurchase(){},onSales(){},...extra}));
const sale=(extra={})=>({id:'sale',fecha:'2026-11-20',usuario:'Admin',paymentMethod:'efectivo',total:75000,detalles:[{producto_id:'p1',nombre:'Aceite de prueba',cantidad:2,precio_unitario:25000,costo_unitario:15000}],labor:[{descripcion:'Cambio de aceite',mecanico:'Carlos',importe:25000}],...extra});

test('SSR resumen: período, importes separados, producto vendido y ganancia final con margen',()=>{
 const html=render({ventas:[sale()],prods:[{id:'p1',nombre:'Aceite de prueba'},{id:'p2',nombre:'Producto sin ventas'}]});
 for(const label of ['Resumen general','Hoy','Ayer','Esta semana','Este mes','Desde','Hasta','Ventas netas totales','Venta de productos','Mano de obra facturada','Ventas con ingreso neto','Venta promedio','Qué vendimos','Aceite de prueba','Ganancia total de productos del período','Margen:'])assert.ok(html.includes(label),label);
 assert.match(html,/75\.000/);assert.match(html,/50\.000/);assert.match(html,/25\.000/);assert.match(html,/20\.000/);assert.match(html,/40 %/);
 assert.match(html,/servicio registrado/);assert.match(html,/Mayor ganancia/);
 for(const label of ['Cierre de caja','Reportes y exportaciones','Preparar reposición','Mecánicos','Nueva venta'])assert.ok(html.includes(label));
 assert.ok(html.lastIndexOf('Ganancia total de productos del período')>html.indexOf('Qué vendimos'));
 assert.match(html,/Productos sin ventas netas/);assert.match(html,/catálogo actual/);assert.match(html,/Producto sin ventas/);
 assert.doesNotMatch(html,/<details[^>]*class="ov-no-sales"[^>]*open/);
});

test('SSR resumen: costos incompletos no se convierten en ganancia cero ni se mezclan con mano de obra',()=>{
 const html=render({ventas:[sale({detalles:[{producto_id:'p1',nombre:'Sin costo',cantidad:2,precio_unitario:25000}]})]});
 assert.match(html,/Sin costo completo/);assert.match(html,/Sin costo histórico completo/);assert.match(html,/no se puede calcular/);
 assert.doesNotMatch(html,/ov-profit-values/);
 assert.match(html,/sus costos aún no se registran/);
});

test('SSR resumen: solo mano de obra conserva ingreso y no inventa un margen de productos',()=>{
 const html=render({ventas:[sale({detalles:[],total:25000})]});
 assert.match(html,/25\.000/);assert.match(html,/No se vendieron productos/);assert.match(html,/Margen: <b>—<\/b>/);
 assert.match(html,/La mano de obra se muestra como ingreso aparte/);assert.doesNotMatch(html,/Sin costo histórico completo/);
});

test('SSR resumen: vendedor no recibe datos o herramientas administrativas',()=>{
 const html=render({ventas:[sale()]},{session:{role:'vendedor',companyId:'c1'}});
 assert.match(html,/disponible para el administrador/);assert.doesNotMatch(html,/75\.000|Ganancia total|Administración|Cierre de caja/);
});

test('SSR resumen: texto de producto se escapa y no se muestran formularios con acciones de escritura',()=>{
 const html=render({ventas:[sale({detalles:[{producto_id:'p1',nombre:'<script>producto</script>',cantidad:1,precio_unitario:50000,costo_unitario:30000}]})]});
 assert.match(html,/&lt;script&gt;producto&lt;\/script&gt;/);assert.doesNotMatch(html,/<script>/);assert.doesNotMatch(html,/<form\b/);
 assert.match(html,/aria-label="Períodos rápidos"/);assert.match(html,/type="date"/);
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
