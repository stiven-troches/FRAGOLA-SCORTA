import {test} from 'node:test';
import assert from 'node:assert/strict';
import {estadoVacio,aplicarCambio} from '../inventory.mjs';
import {purchaseReport,inventoryReport} from '../admin-reports.mjs';

test('BE-21: aplicarCambio usa la hora inyectada en movimientos, entregas, reversiones y auditoría',()=>{
  const now=Date.parse('2026-03-04T05:06:07.000Z'),iso=new Date(now).toISOString();
  let s=aplicarCambio(estadoVacio(),{kind:'producto',revision:0,form:{nombre:'Casco',stock:5,precio_venta:10}},'t',now);
  assert.equal(s.movimientos[0].fecha,iso);assert.equal(s.auditoria[0].fecha,iso);assert.ok(s.prods[0].id.startsWith(String(now)));
  s=aplicarCambio(s,{kind:'compra',revision:s.revision,form:{fecha:'2026-03-04'},items:[{producto_id:s.prods[0].id,cantidad:1,precio_unitario:5}]},'t',now);
  s=aplicarCambio(s,{kind:'reversion',revision:s.revision,id:s.compras[0].id,form:{tipo:'compra',motivo:'x'}},'t',()=>now);
  assert.equal(s.compras[0].reversiones[0].fecha,iso);
  s=aplicarCambio(s,{kind:'servicio',revision:s.revision,form:{fecha:'2026-03-04',placa:'ABC12D',descripcion_trabajo:'x'},items:[]},'t',now);
  for(let i=0;i<3;i++)s=aplicarCambio(s,{kind:'estado',revision:s.revision,id:s.servs[0].id},'t',now);
  assert.equal(s.servs[0].fecha_entrega,'2026-03-04');
});

test('BE-23: anular una compra antigua repite las compras posteriores sin ella; un manual reinicia el costo',()=>{
  let s=aplicarCambio(estadoVacio(),{kind:'producto',revision:0,form:{nombre:'Casco',stock:10,precio_venta:500,precio_compra:100}},'t');
  const id=s.prods[0].id,buy=(price,qty)=>{s=aplicarCambio(s,{kind:'compra',revision:s.revision,form:{fecha:'2026-03-04'},items:[{producto_id:id,cantidad:qty,precio_unitario:price}]},'t');return s.compras[0].id};
  const a=buy(200,10);assert.equal(s.prods[0].precio_compra,150);const b=buy(300,10);assert.equal(s.prods[0].precio_compra,200);buy(100,20);assert.equal(s.prods[0].precio_compra,160);
  s=aplicarCambio(s,{kind:'reversion',revision:s.revision,id:a,form:{tipo:'compra',motivo:'error'}},'t');
  // Sin la compra A: 10×100 + 10×300 → 200; + 20×100 → 150.
  assert.equal(s.prods[0].precio_compra,150);assert.equal(s.prods[0].costHistory.at(-2).costo_unitario,200);
  s=aplicarCambio(s,{kind:'reversion',revision:s.revision,id:b,form:{tipo:'compra',motivo:'error'}},'t');assert.equal(s.prods[0].precio_compra,100);
});

test('BE-22: totales de compras y valor de existencias redondeados a centavos',()=>{
  const purchases=purchaseReport({compras:[{id:'1',fecha:'2026-03-04',total:0.1},{id:'2',fecha:'2026-03-04',total:0.2}]});assert.equal(purchases.totals.gross,0.3);assert.equal(purchases.totals.net,0.3);
  const inventory=inventoryReport({prods:[{id:'a',nombre:'A',stock:3,precio_compra:0.1},{id:'b',nombre:'B',stock:1,precio_compra:0.2}]});assert.equal(inventory.rows[0].stockValue,0.3);assert.equal(inventory.totals.stockValue,0.5);
});
