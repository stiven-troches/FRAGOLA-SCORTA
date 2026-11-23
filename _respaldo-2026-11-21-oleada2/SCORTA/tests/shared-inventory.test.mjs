import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {aplicarCambio, estadoVacio} from '../inventory.mjs';
import {consultarProductos, consultarMovimientos} from '../consultas.mjs';
import {openStore} from '../server.mjs';

function freezeTree(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeTree(child);
  }
  return value;
}
const product = (state, name, stock) => aplicarCambio(state, {
  kind: 'producto', revision: state.revision,
  form: {nombre: name, stock, precio_venta: 1000, precio_compra: 500},
}, 'Demo');

test('motor compartido crea estado independiente sin modificar datos o solicitud de entrada', () => {
  const base = freezeTree(estadoVacio());
  const request = freezeTree({kind: 'producto', revision: 0, form: {nombre: 'Casco demo', stock: 10, precio_venta: 180000}});
  const next = aplicarCambio(base, request, 'Demo');
  assert.equal(base.revision, 0);assert.equal(base.prods.length, 0);
  assert.equal(next.revision, 1);assert.equal(next.prods[0].stock, 10);
  assert.equal(next.movimientos[0].usuario, 'Demo');assert.equal(next.auditoria[0].accion, 'producto');
  assert.notEqual(next.prods, base.prods);
  const other = estadoVacio();other.prods.push({nombre:'Otro'});
  assert.equal(estadoVacio().prods.length, 0);
});

test('un rechazo tras procesar una línea válida no altera el estado anterior del navegador', () => {
  let state = product(estadoVacio(), 'Casco', 10);
  state = product(state, 'Visor', 1);
  const snapshot = structuredClone(state);
  const [a,b] = state.prods;
  freezeTree(state);
  assert.throws(() => aplicarCambio(state, {kind:'venta',revision:state.revision,form:{fecha:'2026-11-12'},items:[
    {producto_id:a.id,cantidad:2,precio_unitario:1000},
    {producto_id:b.id,cantidad:2,precio_unitario:1000},
  ]}, 'Demo'), /Stock insuficiente/);
  assert.deepEqual(state,snapshot);
  assert.throws(() => aplicarCambio(state, {kind:'ajuste',revision:state.revision-1,id:a.id,form:{stock:0,motivo:'Desactualizado'}}, 'Demo'), /Otro usuario/);
  assert.deepEqual(state,snapshot);
});

test('devolución compartida mantiene historial independiente de objetos reutilizados por el cliente', () => {
  let state = product(estadoVacio(), 'Guantes', 5);
  const p = state.prods[0];
  state = aplicarCambio(state,{kind:'venta',revision:state.revision,form:{fecha:'2026-11-12'},items:[{producto_id:p.id,cantidad:2,precio_unitario:1000}]},'Demo');
  const request = {kind:'reversion',revision:state.revision,id:state.ventas[0].id,form:{tipo:'venta',parcial:true,motivo:'Talla de ensayo'},items:[{index:0,cantidad:1}]};
  const before = structuredClone(state);
  const next = aplicarCambio(state,request,'Demo');
  request.items[0].cantidad=99;
  assert.equal(next.prods[0].stock,4);assert.equal(next.ventas[0].reversiones[0].detalles[0].cantidad,1);
  assert.deepEqual(state,before);
});

test('consultas paginadas funcionan con APIs del navegador sin Buffer de Node', () => {
  const previous=globalThis.Buffer;
  try {
    globalThis.Buffer=undefined;
    const state={revision:7,prods:[{id:'a',nombre:'A'},{id:'b',nombre:'B'},{id:'c',nombre:'C'}],movimientos:[
      {id:'1',producto_id:'a',fecha:'2026-11-12T12:00:00Z',tipo:'apertura'},
      {id:'2',producto_id:'a',fecha:'2026-11-12T13:00:00Z',tipo:'compra'},
    ]};
    const first=consultarProductos(state,{limit:'2'});
    assert.match(first.next_cursor,/^[A-Za-z0-9_-]+$/);
    const second=consultarProductos(state,{limit:'2',cursor:first.next_cursor});
    assert.deepEqual([...first.items,...second.items].map(p=>p.id),['a','b','c']);
    assert.equal(second.next_cursor,null);
    const movements=consultarMovimientos(state,{limit:'1'},'a');
    assert.deepEqual(consultarMovimientos(state,{limit:'1',cursor:movements.next_cursor},'a').items.map(m=>m.id),['1']);
    assert.throws(()=>consultarProductos({...state,revision:8},{cursor:first.next_cursor}),error=>error.status===409);
    assert.throws(()=>consultarProductos(state,{cursor:'bnVsbA'}),/Página/);
  } finally {globalThis.Buffer=previous;}
});

test('SQLite y motor de demo producen los mismos documentos, saldos e historial durante una jornada', t => {
  const directory=mkdtempSync(join(tmpdir(),'scorta-shared-'));
  const store=openStore(join(directory,'test.sqlite'));
  t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
  t.mock.timers.enable({apis:['Date'],now:Date.UTC(2026,10,12,15)});
  t.mock.method(Math,'random',()=>0.123456789);
  let state=estadoVacio();
  const run=request=>{
    const action={...request,revision:state.revision};
    state=aplicarCambio(state,action,'Demo QA');
    assert.deepEqual(store.change(action,'Demo QA'),state);
    assert.deepEqual(store.read(),JSON.parse(JSON.stringify(state)));
    t.mock.timers.tick(1);
  };
  run({kind:'producto',form:{nombre:'Casco',stock:8,precio_venta:1200,precio_compra:500}});
  run({kind:'producto',form:{nombre:'Cadena',stock:2,precio_venta:2000,precio_compra:900}});
  const [helmet,chain]=state.prods;
  run({kind:'compra',form:{fecha:'2026-11-12',proveedor:'Proveedor ficticio'},items:[{producto_id:helmet.id,cantidad:4,precio_unitario:750}]});
  run({kind:'venta',form:{fecha:'2026-11-12'},items:[
    {producto_id:helmet.id,cantidad:2,precio_unitario:1200},
    {producto_id:helmet.id,cantidad:1,precio_unitario:1100},
    {producto_id:chain.id,cantidad:1,precio_unitario:2000},
  ]});
  run({kind:'servicio',form:{fecha:'2026-11-12',placa:'DEMO01',descripcion_trabajo:'Ensayo de instalación',costo_mano_obra:100},items:[{producto_id:chain.id,cantidad:1,precio_unitario:2000}]});
  run({kind:'estado',id:state.servs[0].id});
  run({kind:'ajuste',id:helmet.id,form:{stock:7,motivo:'Conteo de ensayo'}});
  run({kind:'reversion',id:state.ventas[0].id,form:{tipo:'venta',parcial:true,motivo:'Devolución de ensayo'},items:[{index:0,cantidad:1}]});
  run({kind:'reversion',id:state.servs[0].id,form:{tipo:'servicio',motivo:'Anulación de ensayo'}});
  run({kind:'reversion',id:state.compras[0].id,form:{tipo:'compra',motivo:'Compra de ensayo anulada'}});
  assert.deepEqual(state.prods.map(p=>p.stock),[4,1]);
  assert.equal(state.revision,10);
});
