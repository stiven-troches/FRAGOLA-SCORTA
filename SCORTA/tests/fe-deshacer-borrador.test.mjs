// FE-14: retirar una línea y «Deshacer» antes de que salga el guardado no deja el borrador
// en «Guardando…» para siempre ni envía escrituras innecesarias.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SaleDraftSync} from '../src/sale-draft-client.mjs';

const line={producto_id:'p1',nombre:'Aceite',cantidad:3,precio_unitario:33000};
function sync(){
 const sent=[],statuses=[];
 const draft=new SaleDraftSync({request:async(method,body)=>{if(method==='POST'){sent.push(structuredClone(body));return {version:body.version+1}}return {version:1,draft:{cart:[line]}}},onStatus:s=>statuses.push(s.status)});
 return {draft,sent,statuses};
}

test('FE-14: deshacer antes del envío vuelve a «Guardado» sin escribir',async()=>{
 const {draft,sent,statuses}=sync();await draft.load();
 draft.update({cart:[]});assert.equal(statuses.at(-1),'saving');
 draft.update({cart:[line]});
 assert.equal(statuses.at(-1),'saved','el estado no queda en «Guardando…»');
 await new Promise(r=>setTimeout(r,500));
 assert.equal(sent.length,0,'no hay nada que guardar');assert.equal(draft.unsaved,false);draft.dispose();
});

test('FE-14: deshacer después del envío guarda otra vez la línea restaurada',async()=>{
 const {draft,sent,statuses}=sync();await draft.load();
 draft.update({cart:[]});await draft.flush();assert.equal(statuses.at(-1),'saved');
 draft.update({cart:[line]});assert.equal(statuses.at(-1),'saving');await draft.flush();
 assert.equal(sent.length,2);assert.deepEqual(sent[1].draft,{cart:[line]});assert.equal(statuses.at(-1),'saved');draft.dispose();
});
