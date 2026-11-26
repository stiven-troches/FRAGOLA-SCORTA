// Ley 1581: (1) customer.erase y customer.update alcanzan TODO lo que guarda la empresa de un cliente
// y (2) el vendedor nunca recibe teléfono ni documento completos en ninguna colección del sobre.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qaPlatform,ok} from './qa-fixture.mjs';

const PHONE='3115550123',DOC='9876543210',NAME='Ana Privada Gómez';
const post=(f,actor,body)=>f.call(actor,'/api/v2/action',{requestId:crypto.randomUUID(),...body});
const item=(product,cantidad=1)=>({producto_id:product.id,cantidad,precio_unitario:product.precio_venta});

// Una empresa con un cliente (ficha con cupo) que tiene movimiento en todas las colecciones.
async function scenario(name){
  const f=await qaPlatform(),S=await f.shop(name,{stock:50,price:10000});
  let body=await f.act(S.admin,{type:'customer.create',form:{nombre:NAME,telefono:PHONE,tipoDocumento:'CC',numeroDocumento:DOC,correo:'ana.privada@example.invalid',creditLimit:500000,dataConsent:true}});
  const card=body.state.customerRecords.find(c=>c.nombre===NAME);
  // Venta a crédito con la ficha (admin) y otra del vendedor, ambas con teléfono/documento copiados de la ficha.
  body=await f.act(S.admin,{type:'sale.create',form:{customerId:card.id,cliente:NAME,paymentMethod:'credito',dataConsent:true},items:[item(S.product,2)],labor:[]});
  const creditSale=body.state.ventas[0];
  body=await f.act(S.seller,{type:'sale.create',form:{customerId:card.id,cliente:NAME,paymentMethod:'efectivo'},items:[item(S.product,1)],labor:[]});
  const cashSale=body.state.ventas[0];
  body=await f.act(S.admin,{type:'credit.payment',form:{customerId:card.id,amount:5000,method:'efectivo'}});
  // Separado, cotización y garantía con la ficha.
  body=await f.act(S.seller,{type:'layaway.create',form:{customerId:card.id,items:[item(S.product,1)],deposit:{amount:2000,method:'efectivo'}}});
  body=await f.act(S.seller,{type:'quote.create',form:{customerId:card.id,items:[item(S.product,1)]}});
  // Cotización sin ficha pero con el mismo teléfono y nombre (escrita a mano).
  body=await f.act(S.admin,{type:'quote.create',form:{cliente:NAME,telefono:PHONE,dataConsent:true,items:[item(S.product,1)]}});
  body=await f.act(S.admin,{type:'warranty.create',form:{saleId:cashSale.id,lineIndex:0,motivo:'No funciona'}});
  // Corrección previa: deja teléfono/documento en los antes/después de la auditoría.
  body=await f.act(S.admin,{type:'customer.update',id:card.id,form:{nombre:NAME,telefono:PHONE,numeroDocumento:DOC}});
  return {f,S,card,creditSale,cashSale};
}
const saveDraft=async(f,actor,draft,version=0)=>{const r=await f.call(actor,'/api/v2/draft',{version,writeId:crypto.randomUUID(),draft});ok(r);return r.body};
const saleForm=extra=>({cliente:NAME,telefono:PHONE,placa:'',fecha:'2026-11-19',paymentMethod:'efectivo',numeroDocumento:DOC,tipoDocumento:'CC',customerId:extra.customerId,...extra});
const emptyLabor={descripcion:'',mecanico:'',importe:''};

test('customer.erase: ni el teléfono ni el documento ni el nombre quedan en ninguna parte del estado (incluida la auditoría y los borradores)',async()=>{
  const {f,S,card}=await scenario('Borrado Total');
  // Venta actual y venta en espera del vendedor con los datos del cliente.
  const draft={cart:[],labor:[],laborDraft:emptyLabor,saleForm:saleForm({customerId:card.id}),
    held:[{id:'h1',nombre:NAME,createdAt:'2026-11-19T15:00:00.000Z',cart:[],labor:[],saleForm:saleForm({customerId:card.id})}]};
  const saved=await saveDraft(f,S.seller,draft);
  // Antes de borrar, los datos sí están (la prueba detecta el fallo si el estado no los contiene).
  const before=JSON.stringify(f.state);
  for(const needle of [PHONE,DOC,NAME])assert.ok(before.includes(needle),'precondición: '+needle);
  assert.ok(before.includes('ana.privada@example.invalid'));

  ok(await post(f,S.admin,{type:'customer.erase',id:card.id}));
  const after=JSON.stringify(f.state);
  for(const needle of [PHONE,DOC,NAME,'ana.privada@example.invalid','Ana Priv'])assert.ok(!after.includes(needle),'quedó '+needle+' en el estado: '+after.slice(Math.max(0,after.indexOf(needle)-120),after.indexOf(needle)+80));
  // El borrador se invalida (versión nueva) para que ninguna pestaña lo vuelva a guardar con los datos.
  const draftNow=await f.call(S.seller,'/api/v2/draft');ok(draftNow);
  assert.ok(draftNow.body.version>saved.version);
  assert.equal(draftNow.body.draft.held.length,1,'la venta en espera se conserva, sin datos del cliente');
  assert.equal(draftNow.body.draft.saleForm.telefono,'');assert.equal(draftNow.body.draft.saleForm.customerId,undefined);
  // Ficha borrada: no se puede usar para una venta nueva.
  const reuse=await post(f,S.seller,{type:'sale.create',form:{customerId:card.id,paymentMethod:'efectivo'},items:[item(S.product,1)],labor:[]});
  assert.equal(reuse.status,404);
});

test('customer.erase: la deuda a crédito de un cliente borrado se puede seguir cobrando contra la cuenta anonimizada',async()=>{
  const {f,S,card,creditSale}=await scenario('Deuda Borrada');
  const owed=creditSale.credito.saldo-5000; // el escenario ya abonó 5.000
  ok(await post(f,S.admin,{type:'customer.erase',id:card.id}));
  const accounts=(await f.data(S.admin)).state.creditAccounts;
  const account=accounts.find(a=>a.customerId===card.id);
  assert.ok(account,'la cuenta sigue existiendo');assert.equal(account.saldo,owed);
  assert.equal(account.nombre,'Cliente eliminado');assert.equal(account.telefono,'');assert.equal(account.numeroDocumento,'');
  // El vendedor y el administrador pueden registrar el abono.
  let r=await post(f,S.seller,{type:'credit.payment',form:{customerId:card.id,amount:3000,method:'efectivo'}});ok(r);
  assert.equal(r.body.state.creditAccounts.find(a=>a.customerId===card.id).saldo,owed-3000);
  assert.equal(r.body.state.creditPayments[0].cliente,'Cliente eliminado');
  r=await post(f,S.admin,{type:'credit.payment',form:{customerId:card.id,amount:owed-3000,method:'transferencia'}});ok(r);
  // Saldada la deuda, el cliente borrado vuelve a ser inexistente; con saldo a favor no se puede pagar.
  r=await post(f,S.admin,{type:'credit.payment',form:{customerId:card.id,amount:1,method:'efectivo'}});assert.equal(r.status,404);
  for(const needle of [PHONE,DOC,NAME])assert.ok(!JSON.stringify(f.state).includes(needle),needle);
});

test('customer.erase: un cliente borrado con deuda no admite pagar con saldo a favor (ya no existe)',async()=>{
  const {f,S,card}=await scenario('Deuda Favor');
  ok(await post(f,S.admin,{type:'customer.erase',id:card.id}));
  const r=await post(f,S.admin,{type:'credit.payment',form:{customerId:card.id,amount:100,method:'saldo_favor'}});
  assert.equal(r.status,400);assert.equal(r.body.code,'FAVOR_INSUFFICIENT');
});

test('customer.update propaga nombre, teléfono y documento a separados, cotizaciones, garantías, abonos y borradores',async()=>{
  const {f,S,card}=await scenario('Correccion Total');
  await saveDraft(f,S.seller,{cart:[],labor:[],laborDraft:emptyLabor,saleForm:saleForm({customerId:card.id}),
    held:[{id:'h1',nombre:'Cliente 1',createdAt:'2026-11-19T15:00:00.000Z',cart:[],labor:[],saleForm:saleForm({customerId:card.id})}]});
  const NEW_PHONE='3207778899',NEW_DOC='1112223334';
  const body=await f.act(S.admin,{type:'customer.update',id:card.id,form:{nombre:'Ana Corregida',telefono:NEW_PHONE,numeroDocumento:NEW_DOC}});
  const state=body.state;
  for(const list of ['layaways','quotes','warranties','creditPayments','ventas']){
    const rows=state[list].filter(row=>row.customerId===card.id);assert.ok(rows.length,list);
    for(const row of rows){assert.equal(row.cliente,'Ana Corregida',list);assert.equal(row.telefono,NEW_PHONE,list);if(list==='quotes'||list==='ventas')assert.equal(row.numeroDocumento,NEW_DOC,list);}
  }
  // La cotización escrita a mano con el mismo teléfono también se actualiza; no queda el teléfono viejo en ninguna colección.
  const {auditoria,...collections}=f.state.businesses[S.company.id],text=JSON.stringify(collections); // la auditoría conserva el «antes» a propósito
  assert.ok(!text.includes('"telefono":"'+PHONE+'"'),'teléfono viejo en colecciones');assert.ok(!text.includes('"numeroDocumento":"'+DOC+'"'),'documento viejo en colecciones');
  const draft=(await f.call(S.seller,'/api/v2/draft')).body.draft;
  assert.equal(draft.saleForm.telefono,NEW_PHONE);assert.equal(draft.saleForm.numeroDocumento,NEW_DOC);assert.equal(draft.saleForm.cliente,'Ana Corregida');
  assert.equal(draft.held[0].saleForm.telefono,NEW_PHONE);assert.equal(draft.held[0].nombre,'Cliente 1','el nombre de la espera no es del cliente');
});

// ------------------------------------------------------------------ PUNTO 3
const walk=(value,visit,path='$')=>{if(Array.isArray(value))value.forEach((v,i)=>walk(v,visit,path+'['+i+']'));else if(value&&typeof value==='object')for(const [k,v]of Object.entries(value))walk(v,visit,path+'.'+k);else visit(value,path);};
const leaks=(value,needles)=>{const found=[];walk(value,(v,path)=>{if(typeof v==='string')for(const n of needles)if(v.includes(n))found.push(path+' ('+n+')');});return found;};

test('el vendedor no recibe teléfono ni documento completos en ninguna colección del sobre; el administrador sí',async()=>{
  const {f,S,card,cashSale}=await scenario('Sobre Enmascarado');
  const needles=[PHONE,DOC];
  const seller=await f.data(S.seller);
  assert.deepEqual(leaks(seller,needles),[]);
  // Las colecciones existen y traen el dato enmascarado (no desaparecen): el vendedor sigue operando.
  const st=seller.state;
  const mask=v=>'•••'+v.slice(-4);
  assert.equal(st.creditAccounts.find(a=>a.customerId===card.id).telefono,mask(PHONE));
  assert.equal(st.creditAccounts.find(a=>a.customerId===card.id).numeroDocumento,mask(DOC));
  assert.equal(st.layaways[0].telefono,mask(PHONE));
  assert.equal(st.quotes.find(q=>q.customerId===card.id).telefono,mask(PHONE));
  assert.equal(st.quotes.find(q=>q.customerId===card.id).numeroDocumento,mask(DOC));
  assert.equal(st.warranties[0].telefono,mask(PHONE));
  assert.equal(st.ventas.find(s=>s.id===cashSale.id).telefono,mask(PHONE));
  assert.ok(st.customers.every(c=>!c.telefono||!c.telefono.includes(PHONE)));
  // La respuesta de una venta con la ficha seleccionada tampoco desenmascara al cliente.
  const sold=await post(f,S.seller,{type:'sale.create',form:{customerId:card.id,paymentMethod:'efectivo'},items:[item(S.product,1)],labor:[]});ok(sold);
  assert.deepEqual(leaks(sold.body,needles),[]);
  assert.deepEqual(leaks(sold.body.receiptLink,needles),[]);
  // Búsquedas del vendedor.
  for(const kind of ['sales','customers']){const r=await f.call(S.seller,'/api/v2/search/'+kind+'?q=Ana');ok(r);assert.deepEqual(leaks(r.body,needles),[],kind);}
  // Flujos que necesitan el dato completo siguen funcionando porque el servidor lo toma de la ficha.
  let r=await post(f,S.seller,{type:'credit.payment',form:{customerId:card.id,amount:1000,method:'efectivo'}});ok(r);assert.deepEqual(leaks(r.body,needles),[]);
  r=await post(f,S.seller,{type:'layaway.create',form:{customerId:card.id,items:[item(S.product,1)]}});ok(r);assert.deepEqual(leaks(r.body,needles),[]);
  const quote=(await f.data(S.seller)).state.quotes.find(q=>q.customerId===card.id&&q.estado==='vigente');
  r=await post(f,S.seller,{type:'quote.convert',id:quote.id,form:{paymentMethod:'efectivo'}});ok(r);assert.deepEqual(leaks(r.body,needles),[]);
  const converted=f.state.businesses[S.company.id].ventas[0];
  assert.equal(converted.telefono,PHONE,'el servidor guarda el dato completo');assert.equal(converted.numeroDocumento,DOC);
  // Administrador: ve todo completo.
  const admin=await f.data(S.admin),text=JSON.stringify(admin);
  assert.ok(text.includes(PHONE));assert.ok(text.includes(DOC));
  const as=admin.state;
  assert.equal(as.creditAccounts.find(a=>a.customerId===card.id).telefono,PHONE);assert.equal(as.creditAccounts.find(a=>a.customerId===card.id).numeroDocumento,DOC);
  assert.equal(as.layaways[0].telefono,PHONE);assert.equal(as.quotes.find(q=>q.customerId===card.id).numeroDocumento,DOC);assert.equal(as.warranties[0].telefono,PHONE);
});

test('otro vendedor tampoco ve el teléfono de un cliente que no es suyo (separados, cotizaciones, garantías y cartera)',async()=>{
  const {f,S}=await scenario('Otro Vendedor');
  const other=await f.data(S.seller2);
  assert.deepEqual(leaks(other,[PHONE,DOC]),[]);
  assert.ok(other.state.layaways.length&&other.state.quotes.length&&other.state.warranties.length&&other.state.creditAccounts.length);
});
