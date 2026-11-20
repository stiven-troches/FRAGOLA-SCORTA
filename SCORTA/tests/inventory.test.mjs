import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {openStore} from '../server.mjs';
test('persistencia, duplicados, rollback y concurrencia',()=>{const dir=mkdtempSync(join(tmpdir(),'motoshop-'));const file=join(dir,'test.sqlite');let db=openStore(file);try{
const send=(kind,form={},items=[],extra={})=>db.change({kind,form,items,revision:db.read().revision,...extra});
let s=send('producto',{nombre:'Casco',precio_venta:100,precio_compra:50,stock:10,stock_minimo:0});const id=s.prods[0].id;const line=q=>({producto_id:id,cantidad:q,precio_unitario:100});
s=send('servicio',{fecha:'2026-11-09',placa:'ABC12D',descripcion_trabajo:'Montaje',costo_mano_obra:20},[line(2),line(3)]);assert.equal(s.prods[0].stock,5);assert.equal(s.servs[0].total,520);assert.equal(s.movimientos[0].cantidad,-5);
const before=db.read();assert.throws(()=>send('venta',{fecha:'2026-11-09'},[line(4),line(4)]),/Stock/);assert.deepEqual(db.read(),before);
assert.throws(()=>send('venta',{fecha:'2026-11-09'},[line(1)],{revision:0}),/Otro usuario/);
assert.throws(()=>send('compra',{fecha:'2026-11-09'},[{...line(1),precio_unitario:-1}]),/inválido/);
assert.throws(()=>send('venta',{fecha:'2026-11-09'},[line(1.5)]),/inválido/);
s=send('producto',{...s.prods[0],stock:999});assert.equal(s.prods[0].stock,5);assert.equal(s.prods[0].stock_minimo,0);
assert.throws(()=>send('eliminar',{},[],{id}),/existencias/);
s=send('compra',{fecha:'2026-11-09',proveedor:'Proveedor'},[{...line(2),precio_unitario:40}]);assert.equal(s.prods[0].stock,7);assert.equal(s.prods[0].precio_compra,40);
db.close();db=openStore(file);assert.equal(db.read().prods[0].stock,7);
}finally{db.close();rmSync(dir,{recursive:true,force:true})}});
