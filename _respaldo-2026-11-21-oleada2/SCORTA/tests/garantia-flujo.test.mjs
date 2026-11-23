// BE-35: garantías. La pieza defectuosa queda en stock_garantia (no vendible), el cambio entrega
// otra unidad, la devolución reembolsa como devolución parcial, y el reclamo al proveedor sigue
// recibida → enviada → aprobada/rechazada → cerrada.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qaPlatform,ok,AT_D,AT_D1,DAY_D,DAY_D1,OWNER_PASSWORD} from './qa-fixture.mjs';
import {warrantyReport,claimableUnits} from '../garantias.mjs';
import {cashBook} from '../caja-credito.mjs';
import {salesReport} from '../admin-reports.mjs';

const post=(f,actor,body)=>f.call(actor,'/api/v2/action',{requestId:crypto.randomUUID(),...body});
async function soldShop(f,name,{stock=6,price=40000,cantidad=2,garantia_dias=30}={}){
 const S=await f.shop(name,{stock,price});
 const fresh=await f.data(S.admin);
 const supplier=(await f.act(S.admin,{type:'supplier.create',form:{nombre:'Repuestos Andinos',nit:'900555111-2',telefono:'3105550000',plazoDias:30}})).state.suppliers[0];
 await f.act(S.admin,{type:'business.change',revision:fresh.revision+1,payload:{kind:'producto',form:{...fresh.state.prods[0],garantia_dias}}});
 const sold=await f.act(S.seller,f.saleBody(S.product,{cantidad,precio:price}));
 return {...S,supplier,sale:sold.state.ventas[0]};
}

test('recibir y cambiar: la pieza no vuelve al stock vendible y el cambio entrega otra unidad',async()=>{
 const f=await qaPlatform({now:AT_D}),S=await soldShop(f,'Garantia Cambio');
 assert.equal((await f.data(S.admin)).state.prods[0].stock,4);
 const received=await f.act(S.seller,{type:'warranty.create',form:{saleId:S.sale.id,lineIndex:0,cantidad:1,motivo:'No enciende',proveedor:'Repuestos Andinos'}});
 const warranty=received.state.warranties[0];
 assert.equal(warranty.numero,'GAR-0001');assert.equal(warranty.estado,'recibida');assert.equal(warranty.decision,null);assert.equal(warranty.venceGarantia,'2026-12-19');assert.equal(warranty.fueraDePlazo,false);
 assert.equal(received.state.prods[0].stock,4,'la unidad defectuosa no entra al stock vendible');assert.equal(received.state.prods[0].stock_garantia,1);
 assert.equal(received.document.kind,'garantia');
 // El vendedor no decide; el administrador sí.
 assert.equal((await post(f,S.seller,{type:'warranty.decide',id:warranty.id,form:{decision:'cambio'}})).status,403);
 assert.equal((await post(f,S.seller,{type:'warranty.status',id:warranty.id,form:{estado:'enviada'}})).status,403);
 const changed=await f.act(S.admin,{type:'warranty.decide',id:warranty.id,form:{decision:'cambio',nota:'Se entrega otra unidad'}});
 assert.equal(changed.state.prods[0].stock,3,'el cambio sale del stock vendible');assert.equal(changed.state.prods[0].stock_garantia,1);
 assert.ok(changed.state.movimientos.some(m=>m.tipo==='garantia_recibida'&&m.cantidad===0&&m.documento===warranty.id));
 assert.ok(changed.state.movimientos.some(m=>m.tipo==='garantia_cambio'&&m.cantidad===-1));
 assert.equal((await post(f,S.admin,{type:'warranty.decide',id:warranty.id,form:{decision:'rechazo'}})).body.code,'WARRANTY_DECIDED');
 // Reclamo al proveedor: enviada → aprobada → cerrada con reposición (entra al stock vendible).
 assert.equal((await post(f,S.admin,{type:'warranty.status',id:warranty.id,form:{estado:'aprobada'}})).body.code,'WARRANTY_STATUS','no se salta estados');
 await f.act(S.admin,{type:'warranty.status',id:warranty.id,form:{estado:'enviada',nota:'Guía 123'}});
 await f.act(S.admin,{type:'warranty.status',id:warranty.id,form:{estado:'aprobada'}});
 const closed=await f.act(S.admin,{type:'warranty.status',id:warranty.id,form:{estado:'cerrada',resultado:'reposicion'}});
 const done=closed.state.warranties[0];
 assert.equal(done.estado,'cerrada');assert.equal(done.resultado,'reposicion');assert.deepEqual(done.historial.map(h=>h.estado),['recibida','recibida','enviada','aprobada','cerrada']);
 assert.equal(closed.state.prods[0].stock,4);assert.equal(closed.state.prods[0].stock_garantia,0);
 assert.ok(closed.state.auditoria.some(a=>a.accion==='garantia_cerrada'));
 // No se pueden reclamar más unidades de las vendidas.
 const sale=closed.state.ventas.find(s=>s.id===S.sale.id);assert.equal(claimableUnits(closed.state,sale,0),1);
 assert.equal((await post(f,S.admin,{type:'warranty.create',form:{saleId:S.sale.id,lineIndex:0,cantidad:2,motivo:'Otra'}})).body.code,'WARRANTY_QUANTITY');
});

test('devolución de dinero: devuelto en la venta, reembolso en la caja del día y sin volver al stock',async()=>{
 const f=await qaPlatform({now:AT_D}),S=await soldShop(f,'Garantia Dinero',{cantidad:2,price:40000});
 f.setNow(AT_D1);
 const created=await f.act(S.admin,{type:'warranty.create',form:{saleId:S.sale.id,lineIndex:0,cantidad:1,motivo:'Falla de fábrica',decision:'devolucion',refundMethod:'efectivo'}});
 const warranty=created.state.warranties[0],sale=created.state.ventas.find(s=>s.id===S.sale.id);
 assert.equal(warranty.decision.tipo,'devolucion');assert.equal(warranty.decision.reembolso.total,40000);
 assert.equal(sale.detalles[0].devuelto,1);assert.equal(sale.reversiones.at(-1).garantiaId,warranty.id);assert.equal(sale.reversiones.at(-1).fechaComercial,DAY_D1);
 assert.equal(created.state.prods[0].stock,4,'la pieza defectuosa no vuelve al stock');assert.equal(created.state.prods[0].stock_garantia,1);
 assert.equal(cashBook(created.state,DAY_D1).rows.efectivo.devoluciones,40000);
 assert.equal(salesReport(created.state,{from:DAY_D,to:DAY_D}).totals.net,40000,'la venta original queda neta');
 // Rechazo del proveedor: la pieza se da de baja al cerrar.
 assert.equal((await post(f,S.admin,{type:'warranty.status',id:warranty.id,form:{estado:'enviada'}})).status,400,'sin proveedor no se envía');
 await f.act(S.admin,{type:'warranty.status',id:warranty.id,form:{estado:'enviada',supplierId:S.supplier.id}});
 await f.act(S.admin,{type:'warranty.status',id:warranty.id,form:{estado:'rechazada',nota:'Mal uso'}});
 const bad=await post(f,S.admin,{type:'warranty.status',id:warranty.id,form:{estado:'cerrada',resultado:'nota_credito'}});assert.equal(bad.status,400);
 const closed=await f.act(S.admin,{type:'warranty.status',id:warranty.id,form:{estado:'cerrada',resultado:'baja'}});
 assert.equal(closed.state.prods[0].stock,4);assert.equal(closed.state.prods[0].stock_garantia,0);
 const report=warrantyReport(closed.state,{from:DAY_D1,to:DAY_D1});
 assert.equal(report.totals.count,1);assert.equal(report.byProduct[0].units,1);assert.equal(report.bySupplier[0].name,'Repuestos Andinos');assert.equal(report.bySupplier[0].rejected,1);assert.equal(report.rows[0].refund,40000);
});

test('rechazo al cliente, reparación, fuera de plazo y reglas del vendedor',async()=>{
 const f=await qaPlatform({now:AT_D}),S=await soldShop(f,'Garantia Plazo',{garantia_dias:1,cantidad:3});
 // El vendedor no recibe garantías de ventas ajenas.
 const foreign=await post(f,S.seller2,{type:'warranty.create',form:{saleId:S.sale.id,lineIndex:0,motivo:'x'}});assert.equal(foreign.status,403);
 f.setNow('2026-11-25T15:00:00.000Z');
 const late=await f.act(S.seller,{type:'warranty.create',form:{saleId:S.sale.id,lineIndex:0,motivo:'Se rompió'}});
 assert.match(late.warning,/fuera del plazo de garantía de 1 días/);assert.equal(late.state.warranties[0].fueraDePlazo,true);
 const rejected=await f.act(S.admin,{type:'warranty.decide',id:late.state.warranties[0].id,form:{decision:'rechazo',nota:'Fuera de plazo'}});
 assert.equal(rejected.state.warranties[0].estado,'cerrada');assert.equal(rejected.state.warranties[0].resultado,'devuelta_cliente');assert.equal(rejected.state.prods[0].stock_garantia,0);
 // Reparación: la misma pieza vuelve al cliente al cerrar.
 const repair=await f.act(S.admin,{type:'warranty.create',form:{saleId:S.sale.id,lineIndex:0,motivo:'Ruido',decision:'reparacion'}});
 const id=repair.state.warranties[0].id;assert.equal(repair.state.prods[0].stock_garantia,1);
 assert.equal((await post(f,S.admin,{type:'warranty.status',id,form:{estado:'cerrada',resultado:'baja'}})).status,400);
 const delivered=await f.act(S.admin,{type:'warranty.status',id,form:{estado:'cerrada'}});
 assert.equal(delivered.state.warranties[0].resultado,'entregada_cliente');assert.equal(delivered.state.prods[0].stock_garantia,0);assert.equal(delivered.state.prods[0].stock,3);
 // Un producto con unidades en garantía no se retira y editarlo las conserva.
 const pending=await f.act(S.admin,{type:'warranty.create',form:{saleId:S.sale.id,lineIndex:0,motivo:'Otra falla'}});
 const product=pending.state.prods[0];
 const edited=await f.act(S.admin,{type:'business.change',revision:pending.revision,payload:{kind:'producto',form:{...product,precio_venta:41000}}});
 assert.equal(edited.state.prods[0].stock_garantia,1);assert.equal(edited.state.prods[0].garantia_dias,1);
 // Aislamiento y plan.
 await f.login('owner','Fragola','owner',OWNER_PASSWORD);const B=await f.shop('Garantia Otra');
 assert.equal((await post(f,B.admin,{type:'warranty.decide',id:pending.state.warranties[0].id,form:{decision:'cambio'}})).status,404);
 await f.act('owner',{type:'company.plan',companyId:S.company.id,form:{features:['cotizaciones']}});
 const blocked=await post(f,S.admin,{type:'warranty.create',form:{saleId:S.sale.id,lineIndex:0,motivo:'x'}});assert.equal(blocked.body.code,'PLAN_LIMIT');
 ok(await post(f,S.admin,{type:'warranty.decide',id:pending.state.warranties[0].id,form:{decision:'reparacion'}}));
});
