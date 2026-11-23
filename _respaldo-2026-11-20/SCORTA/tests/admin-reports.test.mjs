import {test} from 'node:test';
import assert from 'node:assert/strict';
import {salesReport,cashExpected,purchaseReport,inventoryReport,replenishmentReport,mechanicReport,reportCSV,csvCell,reportDate} from '../admin-reports.mjs';

const sale=(id,extra={})=>({id,fecha:'2026-11-20',usuario:'Ana',cliente:'Cliente',paymentMethod:'efectivo',
 detalles:[{nombre:'Aceite',cantidad:2,precio_unitario:10000,costo_unitario:6000}],labor:[{descripcion:'Cambio',mecanico:'Carlos',importe:15000}],total:35000,...extra});

test('ventas: productos/servicios netos, costos históricos y pagos concilian sin contar dos veces anulaciones',()=>{
 const business={ventas:[sale('normal'),sale('partial',{paymentMethod:'tarjeta',detalles:[{nombre:'Aceite',cantidad:2,devuelto:1,precio_unitario:10000,costo_unitario:6000}]}),sale('cancelled',{paymentMethod:'transferencia',anulada:true,detalles:[{cantidad:2,devuelto:2,precio_unitario:10000,costo_unitario:6000}]}),sale('labor',{detalles:[],total:15000,paymentMethod:'transferencia'})],prods:[{precio_compra:999999}]};
 const before=structuredClone(business),report=salesReport(business,{from:'2026-11-20',to:'2026-11-20'});
 assert.deepEqual(report.paymentTotals,{efectivo:35000,tarjeta:25000,transferencia:15000});
 assert.equal(report.totals.gross,120000);assert.equal(report.totals.returns,10000);assert.equal(report.totals.cancellations,35000);assert.equal(report.totals.net,75000);
 assert.equal(report.totals.products,30000);assert.equal(report.totals.labor,45000);assert.equal(report.totals.productCost,18000);assert.equal(report.totals.productMargin,12000);assert.equal(report.totals.marginComplete,true);
 assert.equal(report.bySeller[0].net,75000);assert.deepEqual(cashExpected(business,'2026-11-20'),report.paymentTotals);assert.deepEqual(business,before);
});

test('devolución de mano de obra se resta una vez; costo ausente no genera utilidad ficticia',()=>{
 const report=salesReport({ventas:[sale('refunded',{laborRefund:5000,detalles:[{cantidad:2,precio_unitario:10000}]})]});
 assert.equal(report.totals.net,30000);assert.equal(report.totals.labor,10000);assert.equal(report.totals.productMargin,null);assert.equal(report.totals.productCost,null);assert.equal(report.totals.marginComplete,false);assert.equal(report.totals.unknownCostLines,1);
 const returned=salesReport({ventas:[sale('full-return',{detalles:[{cantidad:2,devuelto:2,precio_unitario:10000}]})]});
 assert.equal(returned.totals.productMargin,0);assert.equal(returned.totals.marginComplete,true,'No queda producto cuyo costo deba reconstruirse');
 for(const cost of [' ',null,false])assert.equal(salesReport({ventas:[sale('unknown',{detalles:[{cantidad:1,precio_unitario:10000,costo_unitario:cost}]})]}).totals.productMargin,null);
});

test('fechas inclusivas en Bogotá, períodos inválidos y pagos sin identificar son explícitos',()=>{
 const report=salesReport({ventas:[sale('before',{fecha:'2026-11-20T04:59:59.000Z'}),sale('inside',{fecha:'2026-11-20T05:00:00.000Z',paymentMethod:''}),sale('cancelled',{paymentMethod:'',anulada:true})]},{from:'2026-11-20',to:'2026-11-20'});
 assert.deepEqual(report.rows.map(row=>row.id),['inside','cancelled']);assert.equal(report.unknownPaymentCount,1);assert.equal(report.totals.net,35000);
 assert.equal(reportDate('2026-02-30'),'');
 for(const filters of [{from:'2026-02-30'},{to:'2026-11-31'},{from:'2026-11-21',to:'2026-11-20'},{from:0},{to:'2026-1-1'}])assert.throws(()=>salesReport({},filters),error=>error.code==='INVALID_REPORT_PERIOD');
 assert.throws(()=>cashExpected({},undefined),/día del cierre/);
});

test('compras anuladas quedan visibles pero no incrementan la compra neta',()=>{
 const report=purchaseReport({compras:[{id:'a',fecha:'2026-11-20',proveedor:'Proveedor',usuario:'Admin',total:60000},{id:'b',fecha:'2026-11-20',proveedor:'Otro',total:40000,anulada:true},{id:'c',fecha:'2026-11-19',total:10000}]},{from:'2026-11-20',to:'2026-11-20'});
 assert.equal(report.totals.count,2);assert.equal(report.totals.gross,100000);assert.equal(report.totals.cancellations,40000);assert.equal(report.totals.net,60000);assert.equal(report.rows[1].status,'Anulada');assert.equal(report.rows[1].net,0);
});

test('existencias y reposición son actuales, incluyen mínimo alcanzado y no modifican el inventario',()=>{
 const business={prods:[{id:'empty',nombre:'Agotado',stock:0,stock_minimo:0,precio_compra:100,precio_venta:200},{id:'low',nombre:'Bajo',stock:2,stock_minimo:5,precio_compra:100},{id:'equal',nombre:'Mínimo',stock:5,stock_minimo:5,precio_compra:100},{id:'enough',nombre:'Suficiente',stock:6,stock_minimo:5}]};
 const snapshot=structuredClone(business),inventory=inventoryReport(business),restock=replenishmentReport(business);
 assert.equal(inventory.basis,'current');assert.equal(inventory.totals.units,13);assert.equal(inventory.totals.costComplete,false);assert.equal(inventory.totals.stockValue,null);
 assert.deepEqual(restock.rows.map(row=>[row.id,row.suggestedQty,row.stockStatus]),[['empty',1,'agotado'],['low',4,'minimo'],['equal',1,'minimo']]);assert.equal(restock.totals.suggestedUnits,6);assert.deepEqual(business,snapshot);
});

test('CSV permite importes negativos numéricos y neutraliza fórmulas aun con espacios/control iniciales',()=>{
 for(const text of ['=1+1',' \t=HYPERLINK("bad")','\r\n+123','\u0001-456','\ufeff@SUM(A1:A2)'])assert.ok(csvCell(text).startsWith('"\''));
 assert.equal(csvCell(-1250),'-1250');assert.equal(csvCell('-1250'),'"\'-1250"');assert.equal(csvCell('Texto "con", coma\ny salto'),'"Texto ""con"", coma\ny salto"');
 const report=salesReport({ventas:[sale('1',{cliente:' =DANGEROUS()',receiptToken:'SECRET',password:'PRIVATE',detalles:[{cantidad:1,precio_unitario:10000,costo_unitario:12000}],labor:[],total:10000})]});
 const output=reportCSV('sales',report);assert.ok(output.startsWith('\ufeff'));assert.ok(output.includes('"\' =DANGEROUS()"'));assert.ok(output.includes(',-2000,'));assert.ok(!output.includes('SECRET'));assert.ok(!output.includes('PRIVATE'));assert.ok(!output.includes('receiptToken'));
 assert.throws(()=>reportCSV('passwords',report),/no válido/);
});

test('mecánicos solo cuenta labor de ventas: conserva snapshots y evita atribuir reembolsos sin desglose',()=>{
 const business={ventas:[sale('one'),sale('two',{labor:[{mecanico:'Carlos',importe:5000},{mecanico:'Ana',importe:10000}],laborRefund:3000}),sale('cancelled',{anulada:true})],servs:[{costo_mano_obra:999999,mecanico:'Carlos'}]};
 const report=mechanicReport(business);
 assert.equal(report.totals.services,3);assert.equal(report.totals.gross,30000);assert.equal(report.totals.returns,3000);assert.equal(report.totals.net,27000);
 assert.equal(report.rows.find(row=>row.mechanic==='Carlos').gross,20000);assert.ok(report.rows.every(row=>row.net===null&&row.allocationComplete===false));
 const single=mechanicReport({ventas:[sale('one',{laborRefund:1000})]});assert.equal(single.rows[0].net,14000);assert.equal(single.rows[0].returns,1000);
});
