import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../server.mjs';

function warehouse(run) {
  const directory = mkdtempSync(join(tmpdir(), 'scorta-operacion-'));
  const store = openStore(join(directory, 'operacion.sqlite'));
  const send = (kind, form = {}, items = [], extra = {}, actor = 'admin-prueba') =>
    store.change({kind, form, items, revision: store.read().revision, ...extra}, actor);
  try {run({store, send});}
  finally {store.close(); rmSync(directory, {recursive: true, force: true});}
}

test('jornada: entradas, venta a dos precios, taller, merma y reversiones concilian con conteo independiente', () => warehouse(({store, send}) => {
  const expected = new Map();
  const check = () => {
    const state = store.read();
    assert.deepEqual(Object.fromEntries(state.prods.map(p => [p.nombre, p.stock])), Object.fromEntries(expected));
    for (const p of state.prods) {
      let balance = 0;
      for (const movement of state.movimientos.filter(m => m.producto_id === p.id).reverse()) {
        assert.equal(movement.stock_antes, balance);
        balance += movement.cantidad;
        assert.equal(movement.stock_despues, balance);
        assert.ok(movement.usuario);
      }
      assert.equal(balance, expected.get(p.nombre));
    }
  };
  const products = {};
  for (const [name, stock, price] of [['Casco', 10, 150000], ['Guantes', 20, 50000], ['Aceite', 30, 35000]]) {
    const state = send('producto', {nombre: name, stock, precio_venta: price, precio_compra: price / 2});
    products[name] = state.prods.find(p => p.nombre === name);
    expected.set(name, stock);check();
  }
  const line = (name, cantidad, precio_unitario) => ({producto_id: products[name].id, cantidad, precio_unitario});
  let state = send('compra', {fecha: '2026-11-12', proveedor: 'Proveedor de prueba'}, [line('Casco', 5, 80000), line('Aceite', 8, 20000)]);
  const purchase = state.compras[0];assert.equal(purchase.total, 560000);
  expected.set('Casco', 15);expected.set('Aceite', 38);check();
  const salePayload = {kind: 'venta', form: {fecha: '2026-11-12', cliente: 'Cliente ficticio'}, items: [line('Casco', 2, 150000), line('Casco', 1, 140000), line('Guantes', 2, 50000), line('Aceite', 2, 35000)], revision: state.revision, requestId: 'venta-de-jornada'};
  state = store.change(salePayload, 'operador-prueba');const sale = state.ventas[0];
  assert.equal(sale.total, 610000);assert.equal(sale.detalles.length, 4);
  expected.set('Casco', 12);expected.set('Guantes', 18);expected.set('Aceite', 36);check();
  const unchanged = store.read();assert.deepEqual(store.change(salePayload, 'operador-prueba'), unchanged);check();
  state = send('servicio', {fecha: '2026-11-12', placa: 'QA123A', descripcion_trabajo: 'Cambio de aceite de prueba', costo_mano_obra: 25000}, [line('Aceite', 2, 35000)], {}, 'operador-prueba');
  const service = state.servs[0];assert.equal(service.total, 95000);
  expected.set('Aceite', 34);check();
  send('ajuste', {stock: 15, motivo: 'Merma de tres pares confirmada por conteo'}, [], {id: products.Guantes.id});expected.set('Guantes', 15);check();
  const beforeRejected = store.read();
  assert.throws(() => send('venta', {fecha: '2026-11-12'}, [line('Casco', 13, 150000)]), /Stock insuficiente/);
  assert.deepEqual(store.read(), beforeRejected);
  send('reversion', {tipo: 'venta', parcial: true, motivo: 'Cambio de talla de una unidad'}, [{index: 0, cantidad: 1}], {id: sale.id});expected.set('Casco', 13);check();
  state = send('reversion', {tipo: 'venta', motivo: 'Anulación del resto de la venta'}, [], {id: sale.id});
  expected.set('Casco', 15);expected.set('Guantes', 17);expected.set('Aceite', 36);check();
  assert.equal(state.ventas[0].anulada, true);
  send('reversion', {tipo: 'servicio', motivo: 'Servicio cancelado'}, [], {id: service.id});expected.set('Aceite', 38);check();
  send('reversion', {tipo: 'compra', motivo: 'Mercancía devuelta al proveedor'}, [], {id: purchase.id});expected.set('Casco', 10);expected.set('Aceite', 30);check();
  const final = store.read();assert.deepEqual([...expected.values()], [10, 17, 30]);
  assert.ok(final.movimientos.some(m => m.tipo === 'ajuste' && m.cantidad === -3 && /Merma/.test(m.motivo)));
}));

test('identificadores de producto no ambiguos en alta, edición e importación', () => warehouse(({store, send}) => {
  let state = send('producto', {nombre: 'Casco negro', referencia: 'CAS-01', codigo_barras: '770001', precio_venta: 150000});
  const first = state.prods[0];
  const before = store.read();
  assert.throws(() => send('producto', {nombre: 'Casco blanco', referencia: ' cas-01 ', precio_venta: 150000}), /referencia/i);
  assert.throws(() => send('producto', {nombre: 'Casco rojo', codigo_barras: '770001', precio_venta: 150000}), /código de barras/i);
  assert.deepEqual(store.read(), before);
  state = send('producto', {...first, marca: 'Marca corregida'});assert.equal(state.prods[0].marca, 'Marca corregida');
  assert.throws(() => send('importar', {}, [{nombre: 'Visor', referencia: 'VIS-01', codigo_barras: '770002', precio_venta: 20000}, {nombre: 'Guantes', referencia: 'GUA-01', codigo_barras: '770002', precio_venta: 50000}]), /código de barras/i);
  assert.equal(store.read().prods.length, 1);
  send('producto', {nombre: 'Producto sin identificación', precio_venta: 1000});
  send('producto', {nombre: 'Otro sin identificación', precio_venta: 1000});
  assert.equal(store.read().prods.length, 3);
}));

test('vaciar importes opcionales utiliza los valores iniciales sin impedir guardar', () => warehouse(({send}) => {
  let state = send('producto', {nombre: 'Bombillo', precio_venta: 15000, precio_compra: '', stock: '', stock_minimo: ''});
  assert.deepEqual([state.prods[0].precio_compra, state.prods[0].stock, state.prods[0].stock_minimo], [0, 0, 5]);
  state = send('servicio', {fecha: '2026-11-12', placa: 'QA123B', descripcion_trabajo: 'Revisión gratuita', costo_mano_obra: ''});
  assert.equal(state.servs[0].costo_mano_obra, 0);assert.equal(state.servs[0].total, 0);
  state = send('producto', {nombre: 'Obsequio', precio_venta: 0, precio_compra: 0, stock: 0, stock_minimo: 0});
  const gift = state.prods.find(p => p.nombre === 'Obsequio');
  assert.deepEqual([gift.precio_venta, gift.precio_compra, gift.stock, gift.stock_minimo], [0, 0, 0, 0]);
  assert.throws(() => send('producto', {nombre: 'Sin precio obligatorio', precio_venta: ''}), /inválido/);
  assert.throws(() => send('producto', {nombre: '', precio_venta: 100}), /obligatorio/);
  assert.throws(() => send('servicio', {fecha: '2026-11-12', placa: '', descripcion_trabajo: 'Sin placa', costo_mano_obra: ''}), /obligatorio/);
}));

test('salida por ajuste no permite retirar la ficha y perder su trazabilidad', () => warehouse(({store, send}) => {
  let state = send('producto', {nombre: 'Visor dañado', precio_venta: 25000, stock: 2});const product = state.prods[0];
  state = send('ajuste', {stock: 0, motivo: 'Dos visores dañados, salida por merma'}, [], {id: product.id});
  const before = store.read();
  assert.throws(() => send('eliminar', {}, [], {id: product.id}), /historial/i);
  assert.deepEqual(store.read(), before);
  state = send('producto', {nombre: 'Alta accidental sin existencias', precio_venta: 1000, stock: 0});const empty = state.prods.find(p => p.nombre.startsWith('Alta accidental'));
  state = send('eliminar', {}, [], {id: empty.id});assert.ok(!state.prods.some(p => p.id === empty.id));
}));

test('anular compra consumida se rechaza sin cambiar saldos ni documentos', () => warehouse(({store, send}) => {
  let state = send('producto', {nombre: 'Candado', precio_venta: 40000, stock: 0});const product = state.prods[0];
  const line = {producto_id: product.id, cantidad: 5, precio_unitario: 20000};
  state = send('compra', {fecha: '2026-11-12'}, [line]);const purchase = state.compras[0];
  state = send('venta', {fecha: '2026-11-12'}, [{...line, cantidad: 4, precio_unitario: 40000}]);
  const before = store.read();assert.equal(before.prods[0].stock, 1);
  assert.throws(() => send('reversion', {tipo: 'compra', motivo: 'Compra ya consumida'}, [], {id: purchase.id}), /Stock insuficiente/);
  assert.deepEqual(store.read(), before);
}));
