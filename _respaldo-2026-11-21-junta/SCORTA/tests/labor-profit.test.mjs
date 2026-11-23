import {test} from 'node:test';
import assert from 'node:assert/strict';
import {laborReport,mechanicLaborActivity} from '../labor-report.mjs';
import {overviewReport} from '../overview-report.mjs';
const line=(importe=10000,percentage=60,extra={})=>({descripcion:'Cambio de aceite',mecanico:'Ana',mecanicoId:'m1',importe,mecanicoPorcentaje:percentage,...extra});
const sale=(id,labor,extra={})=>({id,fecha:'2026-11-20',placa:'ABC12D',cliente:'Cliente',detalles:[],labor,total:labor.reduce((n,l)=>n+l.importe,0),...extra});
const period={from:'2026-11-01',to:'2026-11-20'};

test('ganancia: suma productos y parte del negocio de mano de obra con porcentajes históricos',()=>{
 const state={mechanics:[{id:'m1',name:'Ana nueva',percentage:99}],ventas:[sale('v1',[line(30000)],{detalles:[{producto_id:'p1',nombre:'Aceite',cantidad:2,precio_unitario:25000,costo_unitario:15000}],total:80000}),sale('v2',[line(10000,80)])]};
 const report=overviewReport(state,period),activity=mechanicLaborActivity(report.labor,{id:'m1'});
 assert.equal(report.totals.productProfit,20000);assert.equal(report.totals.laborProfit,14000);assert.equal(report.totals.mechanicAmount,26000);assert.equal(report.totals.totalProfit,34000);
 assert.equal(activity.jobs,2);assert.equal(activity.amount,40000);assert.equal(activity.businessAmount,14000);assert.equal(activity.mechanicAmount,26000);
 assert.deepEqual(activity.rows.map(r=>r.percentage),[60,80]);assert.ok(activity.rows.every(r=>r.mechanic==='Ana'));
});

test('reparto: 0 y 100 %, centavos y pérdida de productos concilian sin duplicar valores',()=>{
 const state={ventas:[sale('v1',[line(100,0),line(100,100),line(101,33.33)],{detalles:[{nombre:'Pérdida',cantidad:1,precio_unitario:5,costo_unitario:10}],total:306})]};
 const {totals,labor}=overviewReport(state,period);
 assert.equal(totals.laborProfit,167.34);assert.equal(totals.mechanicAmount,133.66);assert.equal(totals.totalProfit,162.34);
 for(const row of labor.rows)assert.equal(Math.round((row.businessAmount+row.mechanicAmount)*100),Math.round(row.net*100));
});

test('devoluciones: una línea se reparte sobre el neto, anulación y devolución total dejan cero',()=>{
 const single=sale('one',[line(10000)],{laborRefund:2000}),cancelled=sale('cancel',[line(10000,null)],{anulada:true}),refunded=sale('full',[line(5000,null),line(5000,null)],{laborRefund:10000});
 const report=laborReport({ventas:[single,cancelled,refunded]},period);
 assert.equal(report.totals.net,8000);assert.equal(report.totals.mechanicAmount,4800);assert.equal(report.totals.businessAmount,3200);assert.equal(report.totals.splitComplete,true);
 assert.ok(report.rows.filter(r=>r.saleId!=='one').every(r=>r.net===0&&r.mechanicAmount===0));
});

test('históricos sin porcentaje y devoluciones sin desglose no inventan ganancia general',()=>{
 for(const ventas of [[sale('old',[line(10000,null)])],[sale('return',[line(10000,60),line(10000,80)],{laborRefund:5000})]]){
  const state={ventas,mechanics:[{id:'m1',name:'Ana',percentage:60}]},before=structuredClone(state),report=overviewReport(state,period);
  assert.equal(report.totals.totalProfit,null);assert.equal(report.totals.laborProfit,null);assert.equal(report.totals.laborSplitComplete,false);assert.deepEqual(state,before);
 }
 const noCost=overviewReport({ventas:[sale('no-cost',[line()],{detalles:[{nombre:'Sin costo',cantidad:1,precio_unitario:5}],total:10005})]},period);
 assert.equal(noCost.totals.productProfit,null);assert.equal(noCost.totals.laborProfit,4000);assert.equal(noCost.totals.totalProfit,null);
});

test('fechas y fuentes: solo ventas del rango, sin contar duplicados de taller o asignar por nombre',()=>{
 const business={ventas:[sale('included',[line()]),sale('past',[line()],{fecha:'2026-10-31'})],servs:[{labor:[line(99999)]}]};
 const report=laborReport(business,period);assert.equal(report.rows.length,1);assert.equal(report.totals.net,10000);
 assert.equal(mechanicLaborActivity(report,{id:'other',name:'Ana'}).jobs,0);
 const empty=overviewReport({},period);assert.equal(empty.totals.totalProfit,0);assert.equal(empty.totals.laborProfit,0);
});
