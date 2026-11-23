import {test} from 'node:test';
import assert from 'node:assert/strict';
import {overviewReport,quickOverviewRange} from '../overview-report.mjs';
import {salesReport} from '../admin-reports.mjs';

const detail=(id,name,quantity,price,cost,extra={})=>({producto_id:id,nombre:name,cantidad:quantity,precio_unitario:price,...(cost===undefined?{}:{costo_unitario:cost}),...extra});
const sale=(id,details,labor=[],extra={})=>({id,fecha:'2026-11-20',usuario:'Vendedor',paymentMethod:'efectivo',detalles:details,labor,
  total:details.reduce((n,line)=>n+line.cantidad*line.precio_unitario,0)+labor.reduce((n,line)=>n+line.importe,0),...extra});
const work=(amount=10000)=>({descripcion:'Servicio',mecanico:'Carlos',importe:amount});

test('resumen: neto y ganancia histórica concilian con el reporte, mano de obra permanece como ingreso',()=>{
  const business={prods:[{id:'a',nombre:'Aceite actual',precio_compra:99999},{id:'b',nombre:'Filtro'},{id:'none',nombre:'Sin venta'}],
    ventas:[sale('one',[detail('a','Aceite',3,10000,6000)],[work(15000)]),
      sale('two',[detail('a','Aceite',2,10000,6500,{devuelto:1}),detail('b','Filtro',1,5000,3000)],[],{paymentMethod:'tarjeta'}),
      sale('only-labor',[],[work(20000)],{paymentMethod:'transferencia'}),
      sale('cancelled',[detail('b','Filtro',8,5000,3000,{devuelto:3})],[work()],{anulada:true})],servs:[{costo_mano_obra:999999}]};
  const snapshot=structuredClone(business),result=overviewReport(business,{from:'2026-11-20',to:'2026-11-20'}),shared=salesReport(business,{from:'2026-11-20',to:'2026-11-20'});
  assert.equal(result.totals.net,80000);assert.equal(result.totals.products,45000);assert.equal(result.totals.labor,35000);
  assert.equal(result.totals.productProfit,17500);assert.equal(result.totals.productProfit,shared.totals.productMargin);
  assert.equal(result.totals.productMarginPercent,17500/45000*100);
  assert.equal(result.totals.salesCount,3);assert.equal(result.totals.averageSale,80000/3);assert.equal(result.totals.laborServices,2);
  assert.equal(result.totals.productUnits,5);assert.equal(result.totals.returns,10000);assert.equal(result.totals.cancellations,50000);
  assert.deepEqual(result.noSales.map(p=>p.id),['none']);
  const oil=result.products.find(p=>p.id==='a');assert.equal(oil.netUnits,4);assert.equal(oil.historicalCost,24500);assert.equal(oil.profit,15500);
  assert.equal(oil.name,'Aceite');assert.deepEqual(business,snapshot);
});

test('rankings separan cero ventas, conservan productos eliminados y ordenan pérdidas/empates de forma estable',()=>{
  const business={prods:[{id:'a',nombre:'Alfa'},{id:'b',nombre:'Beta'},{id:'zero',nombre:'Cero'},{id:'returned',nombre:'Devuelto'}],ventas:[
    sale('one',[detail('a','Alfa',2,100,200),detail('b','Beta',2,100,200),detail('deleted','Producto eliminado',1,400,100),detail('returned','Devuelto',3,200,100,{devuelto:3})]),
    sale('cancelled',[detail('zero','Cero',9,500,400)],[],{anulada:true})]};
  const r=overviewReport(business);
  assert.deepEqual(r.rankings.mostSold.map(p=>p.id),['a','b','deleted']);assert.deepEqual(r.rankings.leastSold.map(p=>p.id),['deleted','a','b']);
  assert.deepEqual(r.rankings.mostProfit.map(p=>p.id),['deleted','a','b']);assert.deepEqual(r.rankings.leastProfit.map(p=>p.id),['a','b','deleted']);
  assert.deepEqual(r.noSales.map(p=>p.id),['zero','returned']);assert.equal(r.products.find(p=>p.id==='deleted').currentCatalog,false);
  assert.equal(r.products.find(p=>p.id==='a').profit,-200);assert.equal(r.products.find(p=>p.id==='returned').netUnits,0);
});

test('costos faltantes invalidan su ganancia y el total; una devolución completa no exige costo reconstruido',()=>{
  const business={prods:[{id:'missing',nombre:'Sin costo',precio_compra:1}],ventas:[sale('one',[detail('missing','Sin costo',2,100,undefined),detail('good','Con costo',1,200,100),detail('returned','Retornado',1,200,undefined,{devuelto:1})])]};
  const r=overviewReport(business);
  assert.equal(r.totals.productProfit,null);assert.equal(r.totals.productMarginPercent,null);assert.equal(r.totals.costComplete,false);
  assert.equal(r.totals.unknownCostLines,1);assert.equal(r.incompleteCostProducts,1);
  assert.equal(r.products.find(p=>p.id==='missing').profit,null);assert.equal(r.products.find(p=>p.id==='returned').profit,0);
  assert.deepEqual(r.rankings.mostProfit.map(p=>p.id),['good']);assert.ok(r.rankings.mostSold.some(p=>p.id==='missing'));
});

test('vacío, servicios sin costo, venta completamente devuelta y cero ingreso tienen bases explícitas',()=>{
  const empty=overviewReport({prods:[{id:'one',nombre:'Producto'}]});
  assert.equal(empty.totals.productProfit,0);assert.equal(empty.totals.productMarginPercent,null);assert.equal(empty.totals.averageSale,0);assert.equal(empty.noSales.length,1);
  const r=overviewReport({ventas:[sale('zero',[],[work(0)]),sale('refunded',[],[work(10000)],{laborRefund:10000}),sale('returned',[detail('p','Producto',1,5000,2000,{devuelto:1})]),sale('cancelled',[],[work(10000)],{anulada:true})]});
  assert.equal(r.totals.net,0);assert.equal(r.totals.salesCount,0);assert.equal(r.totals.averageSale,0);assert.equal(r.totals.laborServices,2);
  assert.equal(r.totals.productProfit,0);assert.equal(r.totals.productMarginPercent,null);assert.deepEqual(r.rankings.mostSold,[]);
  assert.equal(r.countBasis.laborServices,'registered_lines_noncancelled_sales');
});

test('filtro de fechas incluye límites de Bogotá, valida rangos y rankings limitan a cinco',()=>{
  const sales=Array.from({length:8},(_,i)=>sale('s'+i,[detail('p'+i,'Producto '+i,i+1,100,50)]));
  sales.push(sale('before',[detail('outside','Fuera',100,100,10)],[],{fecha:'2026-11-20T04:59:59.999Z'}));
  sales.push(sale('boundary',[detail('boundary','Límite',1,100,50)],[],{fecha:'2026-11-20T05:00:00.000Z'}));
  const r=overviewReport({ventas:sales},{from:'2026-11-20',to:'2026-11-20'});
  assert.equal(r.products.some(p=>p.id==='outside'),false);assert.equal(r.products.some(p=>p.id==='boundary'),true);
  for(const rows of Object.values(r.rankings))assert.equal(rows.length,5);
  for(const filters of [{from:'2026-02-30'},{from:'2026-11-21',to:'2026-11-20'},{from:0}])assert.throws(()=>overviewReport({},filters),error=>error.code==='INVALID_REPORT_PERIOD');
});

test('atajos usan Bogotá, ayer cruza mes/año y semana empieza el lunes sin días futuros',()=>{
  const clock='2026-11-20T04:30:00.000Z'; // Still Thursday Nov19 in Bogotá.
  assert.deepEqual(quickOverviewRange('today',clock),{from:'2026-11-19',to:'2026-11-19'});
  assert.deepEqual(quickOverviewRange('yesterday','2027-01-01T15:00:00Z'),{from:'2026-12-31',to:'2026-12-31'});
  assert.deepEqual(quickOverviewRange('week',clock),{from:'2026-11-16',to:'2026-11-19'});
  assert.deepEqual(quickOverviewRange('week','2026-11-23T15:00:00Z'),{from:'2026-11-23',to:'2026-11-23'});
  assert.deepEqual(quickOverviewRange('month',clock),{from:'2026-11-01',to:'2026-11-19'});
  assert.deepEqual(quickOverviewRange('today',0),{from:'1969-12-31',to:'1969-12-31'});
  assert.throws(()=>quickOverviewRange('invalid',clock));assert.throws(()=>quickOverviewRange('today','invalid'));
});
