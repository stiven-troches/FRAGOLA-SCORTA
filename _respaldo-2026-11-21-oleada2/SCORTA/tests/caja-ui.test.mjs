// BE-15 / BE-16 / BE-34: SSR de las vistas Caja, Cartera, Separados, cierre de caja y comprobantes.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'vite';
import {creditAccounts} from '../caja-credito.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let directory,ui;
before(async()=>{
 mkdirSync(join(root,'test-results'),{recursive:true});directory=mkdtempSync(join(root,'test-results','caja-ui-'));
 const entry=join(directory,'entry.mjs');
 writeFileSync(entry,`export {CajaView,CarteraView,SeparadosView} from ${JSON.stringify(join(root,'src/CajaCredito.jsx'))}; export {default as AdminTools} from ${JSON.stringify(join(root,'src/AdminTools.jsx'))}; export * from ${JSON.stringify(join(root,'src/voucher-ticket.mjs'))}; export {receiptMarkup} from ${JSON.stringify(join(root,'src/receipt-ticket.mjs'))};`);
 const result=await build({root,logLevel:'silent',build:{ssr:entry,write:false,minify:false}}),output=Array.isArray(result)?result[0].output:result.output,chunk=output.find(item=>item.type==='chunk'&&item.isEntry);
 const module=join(directory,'compiled.mjs');writeFileSync(module,chunk.code);ui=await import(pathToFileURL(module).href);
});
after(()=>{if(directory)rmSync(directory,{recursive:true,force:true})});
const company={name:'Moto QA',nit:'900-1'};
const business=()=>{
 const state={prods:[{id:'p1',nombre:'Casco',precio_venta:100000,stock:3,stock_reservado:1}],
  customerRecords:[{id:'c1',nombre:'Taller Uno',telefono:'3001234567',creditLimit:300000,saldoAFavor:5000}],
  ventas:[{id:'v1',fecha:today,total:150000,customerId:'c1',cliente:'Taller Uno',paymentMethod:'credito',payments:[{method:'efectivo',amount:50000},{method:'credito',amount:100000}],credito:{monto:100000,saldo:60000,vence:'2020-01-01'},detalles:[]}],
  creditPayments:[{id:'a1',numero:'AB-0001',fecha:today,customerId:'c1',cliente:'Taller Uno',method:'nequi',amount:40000,aplicado:[{saleId:'v1',fecha:today,amount:40000}],saldoAntes:100000,saldoDespues:60000,usuario:'admin',userId:'u1'}],
  cashMovements:[{id:'m1',tipo:'base',fecha:today,method:'efectivo',amount:80000,motivo:'Base del día',usuario:'admin',userId:'u1'},{id:'m2',tipo:'gasto',fecha:today,method:'efectivo',amount:12000,motivo:'Almuerzo',usuario:'vendedor',userId:'u2'}],
  layaways:[{id:'l1',numero:'SEP-0001',fecha:today,vence:'2020-01-02',cliente:'Sofía',telefono:'3004445566',detalles:[{producto_id:'p1',nombre:'Casco',cantidad:1,precio_unitario:100000}],total:100000,pagado:30000,saldo:70000,abonos:[{id:'x1',numero:'SEP-0001-1',fecha:today,method:'efectivo',amount:30000,saldoAntes:100000,saldoDespues:70000}],estado:'activo',customerId:null},
   {id:'l2',numero:'SEP-0002',fecha:today,vence:'2099-01-01',cliente:'Pagado',detalles:[],total:50000,pagado:50000,saldo:0,abonos:[],estado:'activo'}],
  customerDirectory:[{id:'c1',nombre:'Taller Uno',telefono:'3001234567',tipo:'mostrador',creditLimit:300000,saldoAFavor:5000}],cashClosures:[]};
 state.creditAccounts=creditAccounts(state,today);return state;
};
const render=(Component,props)=>renderToStaticMarkup(React.createElement(Component,{company,onAction:async()=>({}),...props}));

test('SSR Caja: el administrador ve desglose por medio, esperado y movimientos; el vendedor solo gastos',()=>{
 const html=render(ui.CajaView,{state:business(),admin:true,onOpenClose(){}});
 assert.match(html,/Caja del día/);assert.match(html,/Caja abierta con base de/);assert.match(html,/Efectivo esperado ahora/);
 // 80.000 base + 50.000 venta + 30.000 abono de separado − 12.000 gasto = 148.000; Nequi 40.000 del abono.
 assert.match(html,/148\.000/);assert.match(html,/Abonos de cartera/);assert.match(html,/Devoluciones pagadas/);assert.match(html,/Nequi/);
 assert.match(html,/Ventas a crédito hoy/);assert.match(html,/100\.000/);assert.match(html,/Cierre de caja/);assert.match(html,/Almuerzo/);assert.match(html,/Comprobante/);
 assert.match(html,/disabled="">Apertura de caja/,'la apertura ya existe');
 const seller=render(ui.CajaView,{state:business(),admin:false});
 assert.match(seller,/Registrar gasto/);assert.match(seller,/Tope por gasto/);assert.doesNotMatch(seller,/Efectivo esperado|Retiro<|Apertura de caja|Cierre de caja/);
});

test('SSR Cartera: saldo, vencidos, antigüedad, abono, estado de cuenta y WhatsApp',()=>{
 const html=render(ui.CarteraView,{state:business(),admin:true});
 assert.match(html,/Cartera total/);assert.match(html,/60\.000/);assert.match(html,/Vencido/);assert.match(html,/0-30 días/);assert.match(html,/Más de 90 días/);
 assert.match(html,/Registrar abono/);assert.match(html,/Estado de cuenta/);assert.match(html,/https:\/\/wa\.me\/573001234567\?text=/);assert.match(html,/Asignar cupo/);assert.match(html,/A favor/);
 const seller=render(ui.CarteraView,{state:business(),admin:false});assert.doesNotMatch(seller,/Asignar cupo/);assert.match(seller,/Registrar abono/);
 const empty=render(ui.CarteraView,{state:{},admin:true});assert.match(empty,/Aún no hay ventas a crédito/);
});

test('SSR Separados: activos con vencidos, abonos, entrega; solo el administrador cancela',()=>{
 const html=render(ui.SeparadosView,{state:business(),admin:true});
 assert.match(html,/Separados/);assert.match(html,/SEP-0001 · Sofía/);assert.match(html,/Vencido/);assert.match(html,/Registrar abono/);assert.match(html,/Pagar y entregar/);assert.match(html,/>Entregar</);
 assert.match(html,/Cancelar/);assert.match(html,/Nuevo separado/);assert.match(html,/role="tab"/);
 const seller=render(ui.SeparadosView,{state:business(),admin:false});assert.doesNotMatch(seller,/>Cancelar</);assert.match(seller,/Registrar abono/);
});

test('SSR cierre: desglose, base sin apertura y cierres antiguos sin desglose se ven igual',()=>{
 const state=business();state.cashMovements=state.cashMovements.filter(m=>m.tipo!=='base');
 const open=renderToStaticMarkup(React.createElement(ui.AdminTools,{view:'cash',data:{state},session:{role:'admin',companyId:'c1'},onClose(){},onAction:async()=>({})}));
 assert.match(open,/Desglose del día/);assert.match(open,/Base inicial en efectivo/);assert.match(open,/devoluciones pagadas ese día/);assert.match(open,/Ventas a crédito del día/);
 const legacy={id:'old',date:today,name:'Ana',createdAt:today+'T15:00:00Z',expected:{efectivo:100,transferencia:0,tarjeta:0},actual:{efectivo:100,transferencia:0,tarjeta:0},differences:{efectivo:0,transferencia:0,tarjeta:0},totals:{expected:100,actual:100,difference:0}};
 const old=renderToStaticMarkup(React.createElement(ui.AdminTools,{view:'cash',data:{state:{cashClosures:[legacy]}},session:{role:'admin',companyId:'c1'},onClose(){},onAction:async()=>({})}));
 assert.match(old,/Cierre registrado/);assert.doesNotMatch(old,/Desglose por medio de pago/);
 const v2=renderToStaticMarkup(React.createElement(ui.AdminTools,{view:'cash',data:{state:{cashClosures:[{...legacy,version:2,base:50,breakdown:{efectivo:{base:50,ventas:50,abonos:0,separados:0,ingresos:0,gastos:0,retiros:0,devoluciones:0,esperado:100},transferencia:{},tarjeta:{}}}]}},session:{role:'admin',companyId:'c1'},onClose(){},onAction:async()=>({})}));
 assert.match(v2,/Desglose por medio de pago/);assert.match(v2,/Base inicial/);
 const reports=renderToStaticMarkup(React.createElement(ui.AdminTools,{view:'reports',data:{state:business()},session:{role:'admin',companyId:'c1'},onClose(){},onAction:async()=>({})}));
 assert.match(reports,/VENTAS A CRÉDITO/);assert.match(reports,/ABONOS RECIBIDOS/);assert.match(reports,/CARTERA TOTAL HOY/);assert.match(reports,/Abonos de cartera/);
 const settings=renderToStaticMarkup(React.createElement(ui.AdminTools,{view:'settings',data:{state:{}},session:{role:'admin',companyId:'c1'},onClose(){},onAction:async()=>({})}));
 assert.match(settings,/TOPE DE GASTO POR VENDEDOR/);assert.match(settings,/VENCIMIENTO DE SEPARADOS/);
});

test('comprobantes: separado, abono a separado, abono de cartera, movimiento de caja, estado de cuenta y venta a crédito',()=>{
 const state=business(),layaway=state.layaways[0];
 const sep=ui.layawayMarkup({layaway,company});assert.match(sep,/SEPARADO DE MERCANCÍA/);assert.match(sep,/SEP-0001/);assert.match(sep,/Saldo pendiente/);assert.match(sep,/No es factura electrónica/);
 const abono=ui.layawayMarkup({layaway,company,paymentId:'x1'});assert.match(abono,/ABONO A SEPARADO/);assert.match(abono,/SEP-0001-1/);
 const pay=ui.creditPaymentMarkup({payment:state.creditPayments[0],company});assert.match(pay,/ABONO A CRÉDITO/);assert.match(pay,/AB-0001/);assert.match(pay,/Nequi/);
 assert.match(ui.cashMovementMarkup({movement:state.cashMovements[1],company}),/GASTO/);
 const statement=ui.statementMarkup({account:state.creditAccounts[0],company,today});assert.match(statement,/ESTADO DE CUENTA/);assert.match(statement,/vencida hace/);assert.match(statement,/Saldo a favor/);
 assert.match(ui.voucherDocument(statement,'Estado'),/<!doctype html>/);
 const receipt=ui.receiptMarkup({sale:state.ventas[0],company});assert.match(receipt,/Saldo a crédito/);assert.match(receipt,/Crédito/);
 assert.doesNotMatch(ui.layawayMarkup({layaway:{...layaway,cliente:'<script>'},company}),/<script>/);
});
