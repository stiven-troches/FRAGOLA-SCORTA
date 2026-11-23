import {test} from 'node:test';
import assert from 'node:assert/strict';
import {estadoVacio,aplicarCambio} from '../inventory.mjs';

function fixture(cost=100){
  let state=estadoVacio();
  const change=(kind,form={},items=[],extra={})=>state=aplicarCambio(state,{kind,form,items,revision:state.revision,...extra},'Audit');
  change('producto',{nombre:'Prueba',stock:10,precio_venta:300,...(cost===undefined?{}:{precio_compra:cost})});
  const productId=state.prods[0].id;
  return {change,productId,get state(){return state},set state(next){state=next},get product(){return state.prods[0]},
    buy:(price,qty=2)=>{change('compra',{fecha:'2026-11-20'},[{producto_id:productId,cantidad:qty,precio_unitario:price}]);return state.compras[0].id},
    cancel:id=>change('reversion',{tipo:'compra',motivo:'Corrección de prueba'},[],{id}),
    sell:()=>change('venta',{fecha:'2026-11-20'},[{producto_id:productId,cantidad:1,precio_unitario:300}]),
    manual:price=>change('producto',{...state.prods[0],precio_compra:price})};
}
test('unknown costs stay null, explicit zero stays known, and edits without cost preserve it',()=>{
  const f=fixture(null);assert.equal(f.product.precio_compra,null);f.sell();assert.equal(f.state.ventas[0].detalles[0].costo_unitario,null);
  f.manual(0);assert.equal(f.product.precio_compra,0);f.sell();assert.equal(f.state.ventas[0].detalles[0].costo_unitario,0);
  const history=structuredClone(f.product.costHistory);const form={...f.product,nombre:'Nombre actualizado'};delete form.precio_compra;
  f.change('producto',form);assert.equal(f.product.precio_compra,0);assert.deepEqual(f.product.costHistory,history);
  f.change('importar',{},[{nombre:'Importado',precio_venta:10,precio_compra:'   '}]);assert.equal(f.state.prods[1].precio_compra,null);
  f.manual('   ');assert.equal(f.product.precio_compra,null);
});
test('cancelling the last purchase restores its baseline cost for future sales, retaining prior snapshots',()=>{
  const f=fixture(),purchase=f.buy(200);f.sell();const previous=structuredClone(f.state.ventas[0]);f.cancel(purchase);
  assert.equal(f.product.stock,9);assert.equal(f.product.precio_compra,100);assert.deepEqual(f.state.ventas[0],previous);
  f.sell();assert.equal(f.state.ventas[0].detalles[0].costo_unitario,100);
  assert.equal(f.product.costHistory.some(entry=>entry.documentId===purchase),false);
});
test('cancelling earlier purchases preserves later purchases and excludes cancelled costs from subsequent fallbacks',()=>{
  // Weighted average: 10×100 + 2×200 → 116.67; + 2×300 → 142.86. Cancelling the
  // first purchase replays the later one without it (BE-23): (10×100+600)/12 → 133.33.
  const f=fixture(),first=f.buy(200);assert.equal(f.product.precio_compra,116.67);const second=f.buy(300);assert.equal(f.product.precio_compra,142.86);
  f.cancel(first);assert.equal(f.product.precio_compra,133.33);
  f.cancel(second);assert.equal(f.product.precio_compra,100);assert.equal(f.product.stock,10);
});
test('a manual cost after a purchase remains authoritative when that purchase is cancelled',()=>{
  const f=fixture(),purchase=f.buy(200);f.manual(150);f.cancel(purchase);assert.equal(f.product.precio_compra,150);
  assert.equal(f.product.costHistory.at(-1).kind,'manual');
});
test('multiple lines round the weighted unit cost to two decimals and cancellation removes its source only once',()=>{
  const f=fixture(0);f.change('compra',{fecha:'2026-11-20'},[
    {producto_id:f.productId,cantidad:2,precio_unitario:1},
    {producto_id:f.productId,cantidad:1,precio_unitario:2},
  ]);
  // 10 units at 0 plus 3 units totalling 4 → weighted average 4/13 = 0.31.
  const purchase=f.state.compras[0].id;assert.equal(f.state.compras[0].total,4);assert.equal(f.product.precio_compra,0.31);
  assert.equal(f.product.costHistory.at(-1).costo_compra,1.33);
  f.change('producto',{...f.product,nombre:'Cambio ajeno al costo'});assert.equal(f.product.precio_compra,0.31);
  f.cancel(purchase);assert.equal(f.product.precio_compra,0);assert.equal(f.product.stock,10);
});
test('cancelling a legacy purchase never invents its missing previous cost',()=>{
  const f=fixture(),purchase=f.buy(200);delete f.product.costHistory;f.cancel(purchase);
  assert.equal(f.product.precio_compra,null);f.sell();assert.equal(f.state.ventas[0].detalles[0].costo_unitario,null);
});
test('legacy cancellation preserves known later sources but invalidates a baseline that would revive the cancelled cost',()=>{
  const f=fixture(),legacy=f.buy(200);delete f.product.costHistory;const later=f.buy(300);
  f.cancel(legacy);assert.equal(f.product.precio_compra,142.86);f.cancel(later);assert.equal(f.product.precio_compra,null);
  const g=fixture(),old=g.buy(200);delete g.product.costHistory;g.manual(150);g.cancel(old);assert.equal(g.product.precio_compra,150);
});
test('money totals round consistently and excessive precision cannot enter inventory prices',()=>{
  const f=fixture(0.1);f.change('venta',{fecha:'2026-11-20'},[{producto_id:f.productId,cantidad:3,precio_unitario:0.1}]);assert.equal(f.state.ventas[0].total,0.3);
  const before=structuredClone(f.state);assert.throws(()=>f.buy(1.234),/decimales/);assert.deepEqual(f.state,before);
  assert.throws(()=>f.buy('   '),/importe/);assert.deepEqual(f.state,before);
  assert.throws(()=>f.manual(1.234),/decimales/);assert.deepEqual(f.state,before);
});
