// BE-09 (Ley 1581, consulta): el administrador descarga todo lo guardado de un cliente final.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openPlatformStore} from '../platform-server.mjs';

const password='Consulta.Fixture.2026!';

test('consulta de datos de un cliente: JSON completo, sin costos ni enlaces, auditada y solo para administradores',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'scorta-consulta-'));
  const store=await openPlatformStore(join(dir,'platform.sqlite'),{owner:{company:'Fragola',username:'owner',password}});
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  const tokens={};
  const login=async(actor,company,username)=>{const r=await store.request({method:'POST',path:'/api/v2/login',body:{company,username,password}});assert.equal(r.status,200,r.body.error);tokens[actor]=r.token;return r;};
  const act=(actor,body)=>store.request({method:'POST',path:'/api/v2/action',token:tokens[actor],body:{requestId:crypto.randomUUID(),...body}});
  await login('owner','Fragola','owner');
  let r=await act('owner',{type:'company.create',form:{name:'Taller Consulta',username:'admin',password,startDate:'2026-01-01',endDate:'2030-12-31',monthlyFee:1,nit:'900111222-3'}});assert.equal(r.status,200,r.body.error);
  const companyId=r.body.companies.find(c=>c.name==='Taller Consulta').id;
  r=await act('owner',{type:'user.create',companyId,form:{username:'seller',role:'vendedor',password}});assert.equal(r.status,200,r.body.error);
  await login('admin','Taller Consulta','admin');await login('seller','Taller Consulta','seller');
  r=await act('admin',{type:'business.change',payload:{kind:'producto',form:{nombre:'Filtro',stock:5,precio_compra:1000,precio_venta:3000}}});assert.equal(r.status,200,r.body.error);
  const product=r.body.state.prods[0];
  r=await act('admin',{type:'customer.create',form:{nombre:'Luisa Gómez',telefono:'3110000000',tipoDocumento:'CC',numeroDocumento:'1020304050',dataConsent:true,consentMedium:'escrito'}});assert.equal(r.status,200,r.body.error);
  const record=r.body.state.customerRecords.find(c=>c.nombre==='Luisa Gómez');
  r=await act('admin',{type:'sale.create',form:{customerId:record.id,cliente:'Luisa Gómez',telefono:'3110000000',placa:'XYZ98A',paymentMethod:'efectivo',dataConsent:true},items:[{producto_id:product.id,cantidad:1,precio_unitario:3000}],labor:[]});assert.equal(r.status,200,r.body.error);
  const saleId=r.body.receiptLink.saleId;
  // Otro cliente que no debe aparecer.
  r=await act('admin',{type:'sale.create',form:{cliente:'Pedro Otro',telefono:'3229999999',paymentMethod:'efectivo',dataConsent:true},items:[{producto_id:product.id,cantidad:1,precio_unitario:3000}],labor:[]});assert.equal(r.status,200,r.body.error);

  // Solo el administrador.
  r=await act('seller',{type:'customer.export',id:record.id});assert.equal(r.status,403);
  r=await act('admin',{type:'customer.export',id:'no-existe'});assert.equal(r.status,404);

  r=await act('admin',{type:'customer.export',id:record.id});assert.equal(r.status,200,r.body.error);
  const data=r.body.customerExport;
  assert.equal(data.format,'scorta-customer-data');assert.equal(data.responsable.empresa,'Taller Consulta');assert.equal(data.responsable.nit,'900111222-3');
  assert.equal(data.cliente.id,record.id);assert.equal(data.cliente.nombre,'Luisa Gómez');assert.equal(data.cliente.numeroDocumento,'1020304050');
  assert.equal(data.autorizacionDatos.medio,'escrito');assert.ok(data.autorizacionDatos.fecha);
  assert.deepEqual(data.ventas.map(s=>s.id),[saleId]);assert.equal(data.autorizacionesEnVentas[0].venta,saleId);
  for(const key of ['servicios','separados','cotizaciones','garantias'])assert.ok(Array.isArray(data[key]),key);
  assert.ok(Array.isArray(data.credito.abonos));assert.ok(data.historial.some(e=>e.documento===record.id));
  const text=JSON.stringify(data);
  for(const forbidden of ['Pedro Otro','3229999999','precio_compra','costo_unitario','receiptHash','receiptToken','password'])assert.ok(!text.includes(forbidden),forbidden);
  // Queda auditada en el almacén y en la auditoría global, sin copiar los datos del cliente.
  const business=store.readPrivate().businesses[companyId];
  const entry=business.auditoria.find(e=>e.accion==='cliente_consultado');assert.ok(entry);assert.equal(entry.documento,record.id);assert.ok(entry.motivo);assert.ok(!JSON.stringify(entry).includes('1020304050'));
  const global=store.readPrivate().audit.find(e=>e.accion==='customer.export');assert.ok(global,'auditoría global');assert.equal(global.documento,record.id);assert.equal(global.companyId,companyId);
  // Un cliente borrado ya no se puede consultar.
  r=await act('admin',{type:'customer.erase',id:record.id});assert.equal(r.status,200,r.body.error);
  r=await act('admin',{type:'customer.export',id:record.id});assert.equal(r.status,404);
});

test('consulta de datos de un cliente: botón en el detalle del cliente que descarga el JSON',()=>{
  const source=readFileSync(new URL('../src/ClientWorkspace.jsx',import.meta.url),'utf8');
  assert.match(source,/type:'customer\.export'/);assert.match(source,/Descargar datos/);assert.match(source,/datos-cliente/);
});
