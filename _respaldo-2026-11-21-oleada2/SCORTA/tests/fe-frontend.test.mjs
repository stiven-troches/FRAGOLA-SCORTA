import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {formatCOP,formatCOPCode,formatNumber,formatPercent,roundCents} from '../src/format.mjs';
import {receiptMarkup,receiptDocument,safeReceiptImage,RECEIPT_LEGAL_NOTICE} from '../src/receipt-ticket.mjs';
import {draftRequest,SaleDraftSync} from '../src/sale-draft-client.mjs';
import {renewalProposal as uiRenewal} from '../src/renewal.mjs';
import {renewalProposal as serverRenewal} from '../platform.mjs';
import {DEMO_CONTACT_WHATSAPP,demoWhatsappLink} from '../src/platform-demo.mjs';
import {landingWhatsappLink} from '../src/landing.mjs';

const nbsp=value=>value.replace(/ /g,' ');

test('FE-04: COP muestra decimales solo cuando el valor los tiene (hasta 2)',()=>{
 assert.equal(nbsp(formatCOP(85000)),'$ 85.000');
 assert.equal(nbsp(formatCOP(12500.5)),'$ 12.500,50');
 assert.equal(nbsp(formatCOP(0.105)),'$ 0,11');
 assert.equal(nbsp(formatCOP(19.999)),'$ 20');
 assert.equal(nbsp(formatCOP('abc')),'$ 0');
 assert.equal(nbsp(formatCOPCode(80000)),'COP 80.000');
 assert.equal(formatNumber(1234),'1.234');assert.equal(formatNumber(2.5),'2,50');
 assert.equal(formatPercent(null),'—');assert.equal(nbsp(formatPercent(12.5)),'12,50 %');
 assert.equal(roundCents(1.005),1.01);assert.equal(roundCents(-2.345),-2.35);
});

test('FE-04: no quedan formateadores Intl.NumberFormat dispersos en la interfaz',()=>{
 for(const file of ['ClientWorkspace.jsx','OwnerWorkspace.jsx','PlatformApp.jsx','AdminTools.jsx','OverviewPanel.jsx','LaborTable.jsx','PurchaseExcel.jsx','SubscriptionPanel.jsx','LegalDocuments.jsx','receipt-ticket.mjs']){
  assert.doesNotMatch(readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),/Intl\.NumberFormat\([^)]*currency/,file);
 }
});

test('FE-02: el comprobante dice que es documento comercial e identifica al emisor',()=>{
 const sale={id:'v1',fecha:'2026-11-21',detalles:[{nombre:'Aceite',cantidad:1,precio_unitario:12500.5}],total:12500.5};
 const html=receiptMarkup({sale,company:{name:'Moto Norte',nit:'900.123.456-7'}});
 assert.equal(RECEIPT_LEGAL_NOTICE,'Documento comercial. No es factura electrónica.');
 assert.ok(html.includes(RECEIPT_LEGAL_NOTICE));assert.ok(html.includes('Emisor: Moto Norte · NIT 900.123.456-7'));
 assert.ok(nbsp(html).includes('$ 12.500,50'));
 for(const width of [80,58])assert.ok(receiptDocument({sale,company:{name:'Moto Norte',nit:'1'},width}).includes(RECEIPT_LEGAL_NOTICE));
 const withoutNit=receiptMarkup({sale,company:{name:'Sin NIT'}});assert.ok(withoutNit.includes('Emisor: Sin NIT'));assert.ok(!withoutNit.includes('NIT:'));
});

test('FE-23: el logo del comprobante solo acepta data: y rutas del mismo origen',()=>{
 for(const value of ['http://example.com/logo.png','https://example.com/logo.png','//example.com/logo.png','/a b.png','\\\\server\\logo.png'])assert.equal(safeReceiptImage(value),'',value);
 assert.equal(safeReceiptImage('/uploads/logo.png'),'/uploads/logo.png');
 assert.equal(safeReceiptImage('data:image/png;base64,iVBORw0KGgo='),'data:image/png;base64,iVBORw0KGgo=');
 assert.doesNotMatch(receiptDocument({}),/img-src[^;]*https?:/);
});

test('FE-05: una respuesta HTML (502) del borrador produce un error claro, no un fallo de JSON',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>new Response('<html>Bad gateway</html>',{status:502,headers:{'Content-Type':'text/html'}});
 try{await assert.rejects(draftRequest('GET'),error=>error.status===502&&/servidor no respondió/.test(error.message))}
 finally{globalThis.fetch=previous}
});

test('FE-12: un aviso de otra pestaña marca conflicto al instante y detiene el guardado',async()=>{
 const writes=[],statuses=[],changes=[];
 const sync=new SaleDraftSync({request:async(method,body)=>{if(method==='POST'){writes.push(body);return {version:body.version+1}}return {version:1,draft:null}},onStatus:value=>statuses.push(value.status),onChange:()=>changes.push(1)});
 await sync.load();sync.update({cart:[1]});assert.equal(changes.length,1);
 sync.markConflict('Otra pestaña cambió esta venta.');
 assert.equal(statuses.at(-1),'conflict');await new Promise(resolve=>setTimeout(resolve,450));assert.equal(writes.length,0);
 await assert.rejects(sync.flush(),/Recarga el borrador/);
 sync.dispose();
});

test('FE-16: renewalProposal de la interfaz es idéntica a la del servidor',()=>{
 const now='2026-11-21T15:00:00Z';
 for(const company of [{startDate:'2026-11-01',endDate:'2026-11-30',monthlyFee:80000},{startDate:'2026-09-01',endDate:'2026-10-31',monthlyFee:90000},{startDate:'2026-01-31',endDate:'2026-01-31',monthlyFee:0}])
  assert.deepEqual(uiRenewal(company,now),serverRenewal(company,now));
 assert.doesNotMatch(readFileSync(new URL('../src/OwnerWorkspace.jsx',import.meta.url),'utf8'),/from '\.\.\/platform\.mjs'/);
});

test('FE-10 / FE-11: los botones de WhatsApp se ocultan mientras el número esté vacío',()=>{
 assert.equal(DEMO_CONTACT_WHATSAPP,'');assert.equal(demoWhatsappLink(),'');assert.equal(landingWhatsappLink(),'');
 assert.equal(demoWhatsappLink('+57 300 123 4567','Hola SCORTA'),'https://wa.me/573001234567?text=Hola%20SCORTA');
 const landing=readFileSync(new URL('../landing.html',import.meta.url),'utf8');
 for(const text of ['Precio a consultar','data-demo-link','data-whatsapp-link','/#terminos','/#privacidad','brand.css'])assert.ok(landing.includes(text),text);
});

test('FE-17: el service worker nunca cachea /api/ y solo atiende assets versionados',()=>{
 const sw=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
 assert.match(sw,/startsWith\('\/api\/'\)/);assert.match(sw,/\/assets\//);
 const manifest=JSON.parse(readFileSync(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));
 assert.equal(manifest.start_url,'/');assert.ok(manifest.icons.some(icon=>icon.sizes==='512x512'));
 assert.match(readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8'),/import\.meta\.env\.PROD/);
});

test('FE-16: la variante WebP del logo para 154 px pesa menos de 40 KB',()=>{
 assert.ok(readFileSync(new URL('../src/assets/fragola-scorta-logo-160-web.webp',import.meta.url)).length<40000);
});
