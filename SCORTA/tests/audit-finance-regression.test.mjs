import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'vite';
import {financialSales} from '../financial-sales.mjs';
import {salesReport,cashExpected} from '../admin-reports.mjs';
import {overviewReport} from '../overview-report.mjs';
import {laborReport} from '../labor-report.mjs';
import {applyAdminControl} from '../admin-controls.mjs';
import {estadoVacio,aplicarCambio} from '../inventory.mjs';
import {roundMoney,sumMoney,moneyAmount} from '../money.mjs';
import {parseMoneyInput} from '../src/format.mjs';

const day='2026-11-20',period={from:day,to:day},clock={now:day+'T15:00:00Z',today:day};
const actor={id:'audit-admin',username:'audit',name:'Prueba',role:'admin',companyId:'audit-company'};
const actual={efectivo:0,transferencia:0,tarjeta:0};
const sale=(id,total,extra={})=>({id,fecha:day,detalles:[],labor:[],total,paymentMethod:'efectivo',...extra});
const service=(id,amount,extra={})=>({id,fecha:'2026-11-01',fecha_entrega:day,estado:'entregado',detalles:[],costo_mano_obra:amount,total:amount,mecanico:'Histórico',paymentMethod:'transferencia',...extra});
const change=(state,kind,form={},items=[])=>aplicarCambio(state,{revision:state.revision,kind,form,items},'Auditoría');
const product=(cost)=>change(estadoVacio(),'producto',{nombre:'Producto de prueba',stock:20,precio_venta:2,...(cost===undefined?{}:{precio_compra:cost})});
const sell=(state,price=2,quantity=1)=>change(state,'venta',{fecha:day},[{producto_id:state.prods[0].id,cantidad:quantity,precio_unitario:price}]);

test('H06: servicio entregado independiente suma ingresos una vez; los espejos de venta no duplican',()=>{
 const business={revision:0,ventas:[sale('v1',100,{labor:[{importe:100,mecanico:'Ana',mecanicoPorcentaje:60}]})],servs:[
  service('legacy',250),service('mirror-id',100,{venta_id:'v1'}),service('mirror-alias',100,{saleId:'v1'}),service('mirror-document',100,{documento:'v1'}),
  service('pending',999,{estado:'pendiente'}),service('completed',999,{estado:'completado'}),service('outside',999,{fecha_entrega:'2026-11-19'})]};
 const before=structuredClone(business),report=salesReport(business,period),overview=overviewReport(business,period),labor=laborReport(business,period);
 assert.equal(financialSales(business).filter(row=>row.legacyService).length,2);
 assert.equal(report.rows.length,2);assert.equal(report.totals.net,350);assert.equal(report.totals.labor,350);
 assert.equal(overview.totals.net,350);assert.equal(overview.totals.laborServices,2);assert.equal(labor.totals.services,2);
 assert.deepEqual(cashExpected(business,day),{efectivo:100,transferencia:250,tarjeta:0});
 assert.deepEqual(business,before);
});

test('H06: anular un servicio independiente conserva el histórico y deja ingreso/caja netos en cero',()=>{
 const business={servs:[service('cancelled',125,{estado:'anulado',estado_anterior:'entregado',anulada:true})]};
 const report=salesReport(business,period),overview=overviewReport(business,period);
 assert.equal(report.rows.length,1);assert.equal(report.totals.cancellations,125);assert.equal(report.totals.net,0);
 assert.equal(overview.totals.totalProfit,0);assert.deepEqual(cashExpected(business,day),actual);
});

test('H06: sin porcentaje histórico se conserva el cobro, sin inventar ganancia ni usar el porcentaje actual',()=>{
 const business={mechanics:[{id:'m1',name:'Histórico',percentage:60}],servs:[service('legacy',100,{mecanicoId:'m1'})]};
 const before=structuredClone(business),report=overviewReport(business,period);
 assert.equal(report.totals.net,100);assert.equal(report.totals.labor,100);assert.equal(report.totals.laborSplitComplete,false);
 assert.equal(report.totals.totalProfit,null);assert.equal(report.totals.laborProfit,null);assert.equal(report.totals.mechanicAmount,null);
 assert.equal(report.labor.rows[0].percentage,null);assert.equal(report.labor.totals.missingPercentages,1);assert.deepEqual(business,before);
});

test('H06: pago histórico desconocido bloquea cierre sin asignarlo a efectivo ni mutar la empresa',()=>{
 for(const paymentMethod of ['',undefined,'cheque']){
  const business={revision:7,servs:[service('legacy',100,{paymentMethod})]},before=structuredClone(business),report=salesReport(business,period);
  assert.equal(report.totals.net,100);assert.equal(report.unknownPaymentCount,1);assert.deepEqual(cashExpected(business,day),actual);
  assert.throws(()=>applyAdminControl(business,actor,{type:'cash.close',form:{date:day,actual}},clock),error=>error.code==='UNKNOWN_PAYMENT_METHOD');
  assert.deepEqual(business,before);
 }
});

test('producto: costo omitido queda desconocido y cero explícito tiene ganancia conocida',()=>{
 const unknown=sell(product(undefined)),zero=sell(product(0));
 assert.equal(unknown.prods[0].precio_compra,null);assert.equal(unknown.ventas[0].detalles[0].costo_unitario,null);
 assert.equal(overviewReport(unknown,period).totals.productProfit,null);assert.equal(overviewReport(unknown,period).totals.totalProfit,null);
 assert.equal(zero.ventas[0].detalles[0].costo_unitario,0);assert.equal(overviewReport(zero,period).totals.totalProfit,2);
});

test('dinero: centavos de productos concilian entre documento, reportes, resumen y cierre',()=>{
 const state=sell(product(0.01),0.10,3);state.ventas[0].paymentMethod='efectivo';
 const saleReport=salesReport(state,period),overview=overviewReport(state,period);
 assert.equal(state.ventas[0].total,0.30);assert.equal(saleReport.totals.net,0.30);assert.equal(saleReport.totals.products,0.30);
 assert.equal(saleReport.totals.productCost,0.03);assert.equal(saleReport.totals.productMargin,0.27);
 assert.equal(overview.products[0].netRevenue,0.30);assert.equal(overview.products[0].profit,0.27);assert.equal(overview.totals.totalProfit,0.27);
 const result=applyAdminControl(state,actor,{type:'cash.close',form:{date:day,actual:{...actual,efectivo:0.30}}},clock);
 assert.equal(result.after.totals.expected,0.30);assert.equal(result.after.totals.actual,0.30);assert.equal(result.after.totals.difference,0);
});

test('dinero: half-up de costo histórico 1.005 normaliza por unidad sin reescribir snapshots',()=>{
 assert.equal(roundMoney(1.005),1.01);assert.equal(roundMoney(2.675),2.68);assert.equal(sumMoney([1.005,1.005,1.005]),3.03);
 const business={prods:[{id:'p1',nombre:'Actual',precio_compra:999}],ventas:[sale('history',6,{detalles:[{producto_id:'p1',nombre:'Histórico',cantidad:3,precio_unitario:2,costo_unitario:1.005}]})]};
 const before=structuredClone(business),report=salesReport(business,period),overview=overviewReport(business,period);
 assert.equal(report.totals.productCost,3.03);assert.equal(report.totals.productMargin,2.97);
 assert.equal(overview.products[0].historicalCost,3.03);assert.equal(overview.products[0].profit,2.97);assert.equal(overview.totals.totalProfit,2.97);
 assert.deepEqual(business,before);
});

test('dinero: nuevas entradas con tres decimales se rechazan en producto, compra, venta y cierre sin cambios',()=>{
 assert.throws(()=>moneyAmount(1.005),/decimales/);assert.throws(()=>product(1.005),/decimales/);
 const state=product(1),before=structuredClone(state),item={producto_id:state.prods[0].id,cantidad:1,precio_unitario:1.005};
 assert.throws(()=>sell(state,1.005),/decimales/);
 assert.throws(()=>change(state,'compra',{fecha:day},[item]),/decimales/);
 assert.throws(()=>change(state,'producto',{...state.prods[0],precio_venta:1.005}),/decimales/);
 for(const method of Object.keys(actual))assert.throws(()=>applyAdminControl(state,actor,{type:'cash.close',form:{date:day,actual:{...actual,[method]:1.005}}},clock),/decimales/);
 assert.deepEqual(state,before);
});

test('dinero: cambiar costo actual o editar producto histórico no reescribe costos de ventas anteriores',()=>{
 let state=product(1);state=sell(state);const previous=structuredClone(state.ventas[0]);
 state=change(state,'producto',{...state.prods[0],precio_compra:1.50});assert.deepEqual(state.ventas[0],previous);
 assert.equal(overviewReport(state,period).totals.productProfit,1);
 state.prods[0].precio_compra=1.005;const history=structuredClone(state.ventas);
 state=change(state,'producto',{...state.prods[0],nombre:'Nombre actualizado'});
 assert.equal(state.prods[0].precio_compra,1.005);assert.deepEqual(state.ventas,history);
 state=sell(state);assert.equal(state.ventas[0].detalles[0].costo_unitario,1.005);
 assert.equal(salesReport(state,period).totals.productCost,2.01);assert.equal(overviewReport(state,period).totals.totalProfit,1.99);
});

test('SSR caja: entradas permiten centavos y pago desconocido deshabilita el cierre',async()=>{
 const root=resolve(fileURLToPath(new URL('..',import.meta.url)));mkdirSync(join(root,'test-results'),{recursive:true});
 const directory=mkdtempSync(join(root,'test-results','audit-finance-'));
 try{
  const entry=join(directory,'entry.mjs');writeFileSync(entry,`export {default} from ${JSON.stringify(join(root,'src/AdminTools.jsx'))};`);
  const result=await build({root,logLevel:'silent',build:{ssr:entry,write:false,minify:false}}),output=Array.isArray(result)?result[0].output:result.output;
  const chunk=output.find(item=>item.type==='chunk'&&item.isEntry);assert.ok(chunk);
  const file=join(directory,'compiled.mjs');writeFileSync(file,chunk.code);const {default:AdminTools}=await import(pathToFileURL(file).href);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const html=renderToStaticMarkup(React.createElement(AdminTools,{view:'cash',session:actor,data:{state:{servs:[service('legacy',100,{fecha_entrega:today,paymentMethod:''})]}},onAction:async()=>({})}));
  // Campos de dinero (MoneyInput): texto con teclado decimal; aceptan centavos con coma y separador de miles.
  const inputs=html.match(/<input\b[^>]*inputMode="decimal"[^>]*>/g)||[];assert.equal(inputs.length,6,'FE-06: efectivo, transferencia, tarjeta, Nequi y Daviplata; BE-15: base inicial sin apertura');
  for(const input of inputs){assert.match(input,/type="text"/);assert.doesNotMatch(input,/type="number"/);}
  assert.equal(parseMoneyInput('12.000,50'),'12000.5');
  assert.match(html,/ventas sin medio de pago reconocido/);assert.match(html,/<button[^>]*disabled=""[^>]*>Registrar cierre<\/button>/);
 }finally{rmSync(directory,{recursive:true,force:true})}
});
