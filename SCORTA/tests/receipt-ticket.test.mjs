import {test} from 'node:test';
import assert from 'node:assert/strict';
import {receiptDocument,receiptMarkup,receiptTotals,receiptPrintCSS,safeReceiptImage,safeReceiptUrl} from '../src/receipt-ticket.mjs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'vite';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const company={name:'JE Accesorios y Repuestos',nit:'900.123.456-7',address:'Carrera 10 # 20-30',whatsapp:'+573205878749',email:'contacto@example.com',logo:'data:image/png;base64,iVBORw0KGgo='};
const sale={id:'venta-123',fecha:'2026-11-20',usuario:'jhoan',cliente:'Andrea',telefono:'+573001234567',placa:'ABC12D',paymentMethod:'efectivo',detalles:[{nombre:'Aceite 4T',cantidad:2,precio_unitario:35000}],labor:[{descripcion:'Cambio de aceite',mecanico:'Carlos',importe:15000}],total:85000};

test('ticket comparte el logo y datos existentes con productos, mano de obra y total correcto',()=>{
 const markup=receiptMarkup({sale,company});
 assert.ok(markup.includes(`<img src="${company.logo}"`));assert.ok(markup.includes(`<h1>${company.name}</h1>`));for(const text of ['NIT: '+company.nit,company.address,'WhatsApp: '+company.whatsapp,company.email])assert.ok(markup.includes(`<p>${text}</p>`),text);for(const [label,value] of [['N.º',sale.id],['Vendedor',sale.usuario],['Cliente',sale.cliente],['Teléfono',sale.telefono],['Placa',sale.placa],['Medio de pago','Efectivo']])assert.ok(markup.includes(`<dt>${label}</dt><dd>${value}</dd>`),label);const plain=markup.replace(/\s/g,' ');for(const [label,amount] of [['Productos','70.000'],['Mano de obra','15.000'],['TOTAL','85.000']])assert.ok(plain.includes(`<dt>${label}</dt><dd>$ ${amount}</dd>`),label);assert.ok(plain.includes('<strong>Aceite 4T</strong><strong>$ 70.000</strong>'));assert.ok(plain.includes('<strong>Cambio de aceite</strong><strong>$ 15.000</strong>'));assert.ok(plain.includes('Mano de obra · Carlos'));
 assert.deepEqual(receiptTotals(sale),{products:70000,labor:15000,original:85000,returned:0,net:85000});
 const optional=receiptMarkup({sale:{id:'solo',fecha:'2026-11-20',labor:[],detalles:[],total:0},company:{name:'Sin datos fiscales'}});
 assert.ok(!optional.includes('<dt>Placa</dt>'));assert.ok(!optional.includes('NIT:'));assert.ok(!optional.includes('undefined'));
});

test('ticket conserva trazabilidad de devoluciones y anulación sin mostrar un total cobrado duplicado',()=>{
 const returned={...sale,detalles:[{...sale.detalles[0],devuelto:1}],laborRefund:5000};
 assert.equal(receiptTotals(returned).net,45000);
 const markup=receiptMarkup({sale:returned,company}),plain=markup.replace(/\s/g,' ');assert.ok(plain.includes('<dt>Total original</dt><dd>$ 85.000</dd>'));assert.ok(plain.includes('<dt>Devuelto</dt><dd>$ 40.000</dd>'));assert.ok(plain.includes('<div class="rt-total"><dt>Total vigente</dt><dd>$ 45.000</dd>'));assert.ok(markup.includes('<div class="rt-returned">Devuelto: 1 unidad</div>'));
 assert.equal(receiptTotals({...returned,anulada:true}).net,0);
 assert.ok(receiptMarkup({sale:{...returned,anulada:true},company}).includes('VENTA ANULADA'));
});

test('HTML descargable escapa campos y bloquea imágenes o enlaces ejecutables',()=>{
 const dangerous='</strong><script>alert(1)</script><img src=x onerror="alert(2)">';
 const html=receiptDocument({company:{name:dangerous,logo:'javascript:alert(3)'},sale:{...sale,cliente:dangerous,detalles:[{nombre:dangerous,cantidad:1,precio_unitario:200}]}});
 assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x'));assert.ok(!html.includes('javascript:'));
 assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('Content-Security-Policy'));assert.ok(html.includes("default-src 'none'"));
 for(const value of ['javascript:alert(1)','data:image/svg+xml,<svg onload=alert(1)>','//attacker.example/image.png','https://name:secret@example.com/logo.png'])assert.equal(safeReceiptImage(value),'');
 assert.equal(safeReceiptImage(company.logo),company.logo);
 assert.equal(safeReceiptUrl('javascript:alert(1)'),'');assert.equal(safeReceiptUrl('data:text/html,abc'),'');assert.equal(safeReceiptUrl('/#/receipt/token','https://demo.example'),'https://demo.example/#/receipt/token');
});

test('formatos de 80 y 58 mm y un ticket largo se imprimen sin altura limitada ni pérdida de líneas',()=>{
 const lines=Array.from({length:120},(_,i)=>({nombre:'Producto de prueba '+i+' '+'descripción extensa '.repeat(4),cantidad:1,precio_unitario:1000}));
 const html=receiptDocument({sale:{...sale,detalles:lines,total:135000},company,width:58});
 assert.equal((html.match(/<li class="rt-line">/g)||[]).length,121);assert.ok(html.includes('Producto de prueba 119'));assert.ok(html.includes('size:58mm 297mm'));
 assert.ok(receiptPrintCSS(80).includes('size:80mm 297mm'));assert.ok(receiptPrintCSS(13).includes('size:80mm 297mm'));
 assert.ok(html.includes('max-height:none!important'));assert.ok(html.includes('overflow:visible!important'));
 assert.ok(!/height:\s*(?:300|500)px/.test(html));
});

test('SSR del ticket público conserva impresión y logo, sin controles privados de WhatsApp',async()=>{
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');mkdirSync(join(root,'test-results'),{recursive:true});
 const directory=mkdtempSync(join(root,'test-results','receipt-ssr-'));
 try{
  const entry=join(directory,'entry.mjs');writeFileSync(entry,`export {default} from ${JSON.stringify(join(root,'src/ReceiptTicket.jsx'))};`);
  const result=await build({root,logLevel:'silent',build:{ssr:entry,write:false,minify:false}});
  const output=(Array.isArray(result)?result[0]:result).output,chunk=output.find(x=>x.type==='chunk'&&x.isEntry);assert.ok(chunk);
  const module=join(directory,'receipt.mjs');writeFileSync(module,chunk.code);const {default:Receipt}=await import(pathToFileURL(module).href);
  const html=renderToStaticMarkup(React.createElement(Receipt,{sale,company,publicView:true}));
  for(const text of ['Imprimir / PDF','Descargar ticket','80 mm','58 mm',company.name,'85.000'])assert.ok(html.includes(text),text);
  assert.ok(!html.includes('Enviar por WhatsApp'));assert.ok(!html.includes('Renovar enlace'));
 }finally{rmSync(directory,{recursive:true,force:true})}
});
