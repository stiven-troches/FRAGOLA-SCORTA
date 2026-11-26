// Hallazgo QA (E2E de garantías): una garantía resuelta con «devolución» ya descuenta la unidad en
// `devuelto` de la línea; claimableUnits no debe restarla una segunda vez.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {claimableUnits} from '../garantias.mjs';

const sale={id:'s1',detalles:[{nombre:'Aceite',cantidad:3,devuelto:1}]};
const warranty=(decision,extra={})=>({saleId:'s1',lineIndex:0,cantidad:1,decision:decision?{tipo:decision}:null,...extra});

test('devolución de garantía: la unidad devuelta no se descuenta dos veces',()=>{
 assert.equal(claimableUnits({warranties:[warranty('devolucion')]},sale,0),2);
});
test('cambio, reparación y reclamo sin decidir siguen reservando su unidad; el rechazo la libera',()=>{
 const open={...sale,detalles:[{nombre:'Aceite',cantidad:3,devuelto:0}]};
 for(const decision of ['cambio','reparacion',null])assert.equal(claimableUnits({warranties:[warranty(decision)]},open,0),2,String(decision));
 assert.equal(claimableUnits({warranties:[warranty('rechazo')]},open,0),3);
 assert.equal(claimableUnits({warranties:[]},open,0),3);
 assert.equal(claimableUnits({warranties:[warranty('devolucion',{saleId:'otra'})]},open,0),3,'otra venta no cuenta');
});
