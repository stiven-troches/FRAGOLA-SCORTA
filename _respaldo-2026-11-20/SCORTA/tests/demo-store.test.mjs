import {test} from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createDemoStore, installDemoFetch} from '../src/demo-api.mjs';
import {crearSemillaDemo} from '../src/demo-seed.mjs';

const catalog = state => state.prods.map(p => ({nombre: p.nombre, referencia: p.referencia,
  codigo: p.codigo_barras, stock: p.stock, minimo: p.stock_minimo,
  compra: p.precio_compra, venta: p.precio_venta})).sort((a, b) => a.referencia.localeCompare(b.referencia));
const productForm = {nombre: 'Accesorio QA de demostración', referencia: 'QA-DEMO-001',
  categoria: 'Pruebas', stock: 3, stock_minimo: 1, precio_compra: 5000, precio_venta: 10000};
async function fixture(run) {
  const indexedDBFactory = new IDBFactory();
  const name = 'qa-demo-' + crypto.randomUUID();
  const store = await createDemoStore({indexedDBFactory, name});
  try {await run({store, indexedDBFactory, name});}
  finally {store.close();}
}
async function send(store, kind, form = {}, extra = {}) {
  const state = await store.readState();
  return store.change({kind, form, items: [], revision: state.revision,
    requestId: crypto.randomUUID(), ...extra});
}

test('la semilla ficticia tiene identificadores únicos, variedad y saldos trazables', () => {
  const state = crearSemillaDemo();
  assert.ok(state.prods.length >= 24);
  assert.ok(new Set(state.prods.map(p => p.categoria)).size >= 5);
  for (const key of ['referencia', 'codigo_barras']) {
    const values = state.prods.map(p => p[key]).filter(Boolean);
    assert.equal(new Set(values).size, values.length);
  }
  assert.ok(state.prods.some(p => p.stock === 0));
  assert.ok(state.prods.some(p => p.stock > 0 && p.stock <= p.stock_minimo));
  assert.ok(state.prods.some(p => p.stock > p.stock_minimo));
  assert.ok(state.ventas.length && state.compras.length && state.servs.length);
  for (const p of state.prods) {
    assert.ok(Number.isSafeInteger(p.stock) && p.stock >= 0);
    const delta = state.movimientos.filter(m => m.producto_id === p.id).reduce((n, m) => n + m.cantidad, 0);
    assert.equal(delta, p.stock, p.nombre);
  }
});

test('producto, compra, venta y ajuste operan en la copia de IndexedDB', () => fixture(async ({store}) => {
  let state = await send(store, 'producto', productForm);
  const product = state.prods.find(p => p.referencia === productForm.referencia);
  state = await send(store, 'compra', {fecha: '2026-11-12', proveedor: 'Proveedor ficticio QA'},
    {items: [{producto_id: product.id, cantidad: 4, precio_unitario: 5000}]});
  assert.equal(state.compras[0].total, 20000);
  assert.equal(state.prods.find(p => p.id === product.id).stock, 7);
  state = await send(store, 'venta', {fecha: '2026-11-12', cliente: 'Cliente ficticio QA'},
    {items: [{producto_id: product.id, cantidad: 2, precio_unitario: 10000}]});
  assert.equal(state.ventas[0].total, 20000);
  assert.equal(state.prods.find(p => p.id === product.id).stock, 5);
  state = await send(store, 'ajuste', {stock: 4, motivo: 'Una unidad dañada de prueba'}, {id: product.id});
  assert.equal(state.prods.find(p => p.id === product.id).stock, 4);
  const movements = state.movimientos.filter(m => m.producto_id === product.id);
  assert.equal(movements.reduce((n, m) => n + m.cantidad, 0), 4);
  assert.equal(movements[0].cantidad, -1);
}));

test('reintentar no duplica una venta y otro cuerpo con el mismo identificador se rechaza', () => fixture(async ({store}) => {
  const before = await store.readState();
  const p = before.prods.find(p => p.stock >= 2);
  const payload = {kind: 'venta', revision: before.revision, requestId: 'reintento-qa',
    form: {fecha: '2026-11-12'}, items: [{producto_id: p.id, cantidad: 1, precio_unitario: p.precio_venta}]};
  const after = await store.change(payload);
  assert.deepEqual(await store.change(payload), after);
  assert.equal(after.ventas.length, before.ventas.length + 1);
  assert.equal(after.prods.find(x => x.id === p.id).stock, p.stock - 1);
  await assert.rejects(store.change({...payload, items: [{...payload.items[0], cantidad: 2}]}), /identificador|datos/i);
}));

test('la falta de existencias no deja cambios parciales y permite corregir la operación', () => fixture(async ({store}) => {
  const before = await store.readState();
  const p = before.prods.find(p => p.stock >= 1);
  const payload = {kind: 'venta', revision: before.revision, requestId: 'cantidad-qa',
    form: {fecha: '2026-11-12'}, items: [{producto_id: p.id, cantidad: p.stock + 1, precio_unitario: p.precio_venta}]};
  await assert.rejects(store.change(payload), /Stock insuficiente/);
  assert.deepEqual(await store.readState(), before);
  const after = await store.change({...payload, items: [{...payload.items[0], cantidad: 1}]});
  assert.equal(after.prods.find(x => x.id === p.id).stock, p.stock - 1);
}));

test('dos conexiones compiten por la última unidad sin dejar stock negativo', () => fixture(async ({store, indexedDBFactory, name}) => {
  const created = await send(store, 'producto', {...productForm, stock: 1});
  const p = created.prods.find(p => p.referencia === productForm.referencia);
  const second = await createDemoStore({indexedDBFactory, name});
  try {
    const payload = {kind: 'venta', form: {fecha: '2026-11-12'}, revision: created.revision,
      items: [{producto_id: p.id, cantidad: 1, precio_unitario: 10000}]};
    const results = await Promise.allSettled([
      store.change({...payload, requestId: 'equipo-a'}),
      second.change({...payload, requestId: 'equipo-b'}),
    ]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter(r => r.status === 'rejected').length, 1);
    const after = await store.readState();
    assert.equal(after.prods.find(x => x.id === p.id).stock, 0);
    assert.equal(after.ventas.filter(v => v.detalles.some(d => d.producto_id === p.id)).length, 1);
  } finally {second.close();}
}));

test('volver a abrir conserva cambios y reiniciar restaura solo la base demo con revisión nueva', () => fixture(async ({store, indexedDBFactory, name}) => {
  const original = await store.readState();
  await send(store, 'producto', productForm);
  const reopened = await createDemoStore({indexedDBFactory, name});
  try {
    const changed = await reopened.readState();
    assert.ok(changed.prods.some(p => p.referencia === productForm.referencia));
    await reopened.reset();
    const reset = await store.readState();
    assert.deepEqual(catalog(reset), catalog(original));
    assert.ok(reset.revision > changed.revision);
    await assert.rejects(store.change({kind: 'producto', revision: changed.revision,
      requestId: 'formulario-anterior', form: {...productForm, nombre: 'Formulario anterior'}}), /modific|recarga|actualiza/i);
  } finally {reopened.close();}
}));

test('el adaptador atiende API local, catálogos e historial y no llama a un backend', () => fixture(async ({store}) => {
  const network = [];
  const target = {location: {href: 'https://demo.example/', origin: 'https://demo.example'},
    fetch: async (...args) => {network.push(args); return new Response('asset');}};
  const restore = installDemoFetch(store, {target});
  try {
    const response = await target.fetch('/api/state');
    assert.equal(response.status, 200);
    const state = await response.json();assert.ok(state.prods.length >= 24);
    const p = state.prods[0];
    const history = await target.fetch('/api/productos/' + encodeURIComponent(p.id) + '/movimientos');
    assert.equal(history.status, 200);assert.ok(Array.isArray((await history.json()).items));
    const search = await target.fetch('/api/productos?q=' + encodeURIComponent(p.referencia));
    assert.equal(search.status, 200);assert.ok((await search.json()).items.some(x => x.id === p.id));
    const missing = await target.fetch('/api/no-existe');assert.equal(missing.status, 404);
    assert.equal(network.length, 0);
    await target.fetch('/assets/demo.js');assert.equal(network.length, 1);
  } finally {restore();}
}));
