import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {consultarProductos, consultarMovimientos} from '../consultas.mjs';
import {openStore} from '../server.mjs';

const state = {revision: 8, prods: [
  {id:'a',nombre:'Aceite 770',referencia:'A1',marca:'Motúl',modelo:'10W',compatibilidad:'Yamaha',codigo_barras:'12',categoria:'Aceites',stock:5,stock_minimo:2,precio_venta:30},
  {id:'b',nombre:'Casco',referencia:'C1',marca:'XYZ',codigo_barras:'770',categoria:'Cascos',stock:0,stock_minimo:2,precio_venta:100},
  {id:'c',nombre:'Visor',referencia:'V1',marca:'XYZ',categoria:'Cascos',stock:2,stock_minimo:2,precio_venta:20},
], movimientos: [
  {id:'1',producto_id:'a',fecha:'2026-11-11T03:00:00.000Z',cantidad:2,tipo:'compra',usuario:'ana'},
  {id:'2',producto_id:'a',fecha:'2026-11-11T05:00:00.000Z',cantidad:-1,tipo:'venta',usuario:'ana'},
  {id:'3',producto_id:'b',fecha:'2026-11-10T15:00:00.000Z',cantidad:1,tipo:'apertura'},
]};

test('búsqueda sin tildes y prioridad de código exacto, filtros y orden', () => {
  assert.deepEqual(consultarProductos(state,{q:'motul yamaha'}).items.map(p=>p.id),['a']);
  assert.deepEqual(consultarProductos(state,{q:'770'}).items.map(p=>p.id),['b','a']);
  assert.deepEqual(consultarProductos(state,{categoria:'cascos',disponibilidad:'bajo'}).items.map(p=>p.id),['c']);
  assert.deepEqual(consultarProductos(state,{marca:'xyz',orden:'precio',direccion:'desc'}).items.map(p=>p.id),['b','c']);
  assert.equal(consultarProductos(state,{disponibilidad:'agotado'}).total,1);
  assert.throws(()=>consultarProductos(state,{disponibilidad:'incorrecto'}),/disponibilidad/);
});

test('paginación sin repetir productos y cursor invalidado tras cambios', () => {
  const first=consultarProductos(state,{limit:'2'});
  const second=consultarProductos(state,{limit:'2',cursor:first.next_cursor});
  assert.equal(first.total,3);
  assert.equal(new Set([...first.items,...second.items].map(p=>p.id)).size,3);
  assert.equal(second.next_cursor,null);
  assert.throws(()=>consultarProductos({...state,revision:9},{cursor:first.next_cursor}),e=>e.status===409);
  assert.throws(()=>consultarProductos(state,{cursor:Buffer.from('null').toString('base64url')}),/Página/);
  assert.throws(()=>consultarProductos(state,{limit:'201'}),/página/);
});

test('historial respeta día colombiano, usuario, producto y fechas válidas', () => {
  const before=JSON.stringify(state);
  assert.deepEqual(consultarMovimientos(state,{desde:'2026-11-10',hasta:'2026-11-10',usuario:'ana'},'a').items.map(m=>m.id),['1']);
  assert.deepEqual(consultarMovimientos(state,{tipo:'venta',producto_id:'a'}).items.map(m=>m.id),['2']);
  assert.throws(()=>consultarMovimientos(state,{desde:'2026-02-30'}),/fechas/);
  assert.throws(()=>consultarMovimientos(state,{desde:'2026-12-01',hasta:'2026-11-01'}),/posterior/);
  assert.equal(JSON.stringify(state),before);
  assert.equal(consultarMovimientos(state,{producto_id:'b'}).items[0].usuario,undefined);
});

test('movimientos nuevos conservan usuario, saldo, documento y reintentos únicos', () => {
  const dir=mkdtempSync(join(tmpdir(),'scorta-consultas-')),store=openStore(join(dir,'store.sqlite'));
  try {
    let s=store.change({kind:'producto',revision:0,form:{nombre:'Casco',stock:5,precio_venta:100}},'ana');
    const p=s.prods[0];
    assert.equal(s.movimientos[0].stock_antes,0);
    assert.equal(s.movimientos[0].stock_despues,5);
    const sale={kind:'venta',requestId:'sale-1',revision:s.revision,form:{fecha:'2026-11-11'},items:[{producto_id:p.id,cantidad:2,precio_unitario:100}]};
    s=store.change(sale,'vendedor');
    assert.deepEqual([s.movimientos[0].usuario,s.movimientos[0].stock_antes,s.movimientos[0].stock_despues,s.movimientos[0].tipo_documento],['vendedor',5,3,'venta']);
    const count=s.movimientos.length;
    assert.equal(store.change(sale,'vendedor').movimientos.length,count);
    const saleId=s.ventas[0].id;
    s=store.change({kind:'reversion',revision:s.revision,id:saleId,form:{tipo:'venta',parcial:true,motivo:'Talla equivocada'},items:[{index:0,cantidad:1}]},'admin');
    assert.deepEqual([s.movimientos[0].stock_antes,s.movimientos[0].stock_despues,s.movimientos[0].tipo_documento,s.movimientos[0].documento],[3,4,'venta',saleId]);
    s=store.change({kind:'ajuste',revision:s.revision,id:p.id,form:{stock:3,motivo:'Conteo físico'}},'admin');
    assert.deepEqual([s.movimientos[0].stock_antes,s.movimientos[0].stock_despues,s.movimientos[0].cantidad],[4,3,-1]);
  } finally {store.close();rmSync(dir,{recursive:true,force:true});}
});
