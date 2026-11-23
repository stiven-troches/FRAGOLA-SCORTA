// QA-14: los Excel de reportes son ZIP válidos, sus XML están bien formados y no
// contienen fórmulas, aunque los datos traigan texto peligroso.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import ExcelJS from 'exceljs';
import {excelBuffer,validateWorkbookArchive} from '../src/excel.mjs';
import {salesReport,purchaseReport,inventoryReport,replenishmentReport,reportColumns} from '../admin-reports.mjs';
import {qaPlatform,DAY_D} from './qa-fixture.mjs';

/** Comprobación mínima de XML bien formado (sin DTD): etiquetas balanceadas, una raíz,
 * atributos entre comillas y sin duplicar, entidades válidas y sin caracteres prohibidos. */
export function assertWellFormedXml(xml,name){
 assert.ok(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/.test(xml),name+': carácter de control prohibido en XML');
 let body=xml.replace(/^﻿?<\?xml[^?]*\?>/,'');
 const stack=[];let roots=0;
 for(const [token]of body.matchAll(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<(?:"[^"]*"|'[^']*'|[^'">])*>|[^<]+/g)){
  if(token.startsWith('<!--')||token.startsWith('<![CDATA[')||token.startsWith('<?'))continue;
  if(!token.startsWith('<')){
   if(!stack.length){assert.ok(!token.trim(),name+': texto fuera de la raíz');continue}
   for(const [entity]of token.matchAll(/&[^;\s<]*;?/g))assert.match(entity,/^&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);$/,name+': entidad inválida '+entity);
   continue;
  }
  const end=token.match(/^<\/([A-Za-z_][\w:.-]*)\s*>$/);
  if(end){assert.equal(stack.pop(),end[1],name+': cierre desbalanceado </'+end[1]+'>');continue}
  const start=token.match(/^<([A-Za-z_][\w:.-]*)((?:\s+[A-Za-z_][\w:.-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>$/);
  assert.ok(start,name+': etiqueta mal formada '+token.slice(0,80));
  const attributes=[...start[2].matchAll(/([A-Za-z_][\w:.-]*)\s*=/g)].map(m=>m[1]);
  assert.equal(new Set(attributes).size,attributes.length,name+': atributo duplicado en '+start[1]);
  for(const [entity]of start[2].matchAll(/&[^;\s"']*;?/g))assert.match(entity,/^&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);$/,name+': entidad inválida en atributo');
  if(!stack.length)roots++;
  if(!start[3])stack.push(start[1]);
 }
 assert.deepEqual(stack,[],name+': etiquetas sin cerrar');assert.equal(roots,1,name+': debe tener una sola raíz');
}

const DANGEROUS=['=HYPERLINK("http://example.invalid","clic")','+SUM(1,2)','-2+3','@cmd','<b>&amp;"comillas"\'</b>','Ñandú ü 🏍️'];

async function sampleBusiness(){
 const f=await qaPlatform();const S=await f.shop('Excel QA',{stock:20});
 const products=[];
 for(const [index,nombre]of DANGEROUS.entries()){
  const body=await f.act(S.admin,{type:'business.change',payload:{kind:'producto',form:{nombre,referencia:'X'+index,categoria:DANGEROUS[(index+1)%DANGEROUS.length],stock:index===0?0:index===1?10:5,stock_minimo:2,precio_compra:1000.5,precio_venta:2000.25}}});
  products.push(body.state.prods.find(p=>p.referencia==='X'+index));
 }
 for(const [index,cliente]of DANGEROUS.entries())await f.act(S.admin,{type:'sale.create',form:{cliente,paymentMethod:['efectivo','transferencia','tarjeta'][index%3]},items:[{producto_id:products[1].id,cantidad:1,precio_unitario:2000.25}],labor:[]});
 await f.act(S.admin,{type:'business.change',payload:{kind:'compra',form:{fecha:DAY_D,proveedor:DANGEROUS[0]},items:[{producto_id:products[2].id,cantidad:3,precio_unitario:1000.5}]}});
 return f.state.businesses[S.company.id];
}

test('QA-14: los cuatro reportes generan .xlsx con ZIP correcto, XML bien formado y sin fórmulas',async()=>{
 const business=await sampleBusiness();
 const reports={sales:salesReport(business,{from:DAY_D,to:DAY_D}),purchases:purchaseReport(business,{from:DAY_D,to:DAY_D}),inventory:inventoryReport(business),replenishment:replenishmentReport(business)};
 for(const [kind,report]of Object.entries(reports)){
  assert.ok(report.rows.length>0,kind+' sin filas');
  const columns=reportColumns(kind);
  const buffer=await excelBuffer({title:kind.toUpperCase(),columns,rows:report.rows,...(['sales','purchases'].includes(kind)?{from:DAY_D,to:DAY_D}:{})});
  const bytes=new Uint8Array(buffer);
  assert.deepEqual([...bytes.subarray(0,4)],[0x50,0x4b,0x03,0x04],kind+': firma ZIP');
  assert.doesNotThrow(()=>validateWorkbookArchive(bytes),kind);
  const files=unzipSync(bytes);
  for(const required of ['[Content_Types].xml','_rels/.rels','xl/workbook.xml','xl/_rels/workbook.xml.rels','xl/worksheets/sheet1.xml'])assert.ok(files[required],kind+': falta '+required);
  const sheets=Object.keys(files).filter(name=>/^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  assert.equal(sheets.length,['sales','purchases'].includes(kind)?2:1,kind+': número de hojas');
  for(const [name,content]of Object.entries(files))if(/\.(xml|rels)$/.test(name))assertWellFormedXml(strFromU8(content),kind+':'+name);
  for(const name of sheets){const xml=strFromU8(files[name]);assert.ok(!/<f[\s>\/]/.test(xml),kind+':'+name+' contiene fórmulas');assert.ok(!/t="e"/.test(xml),kind+':'+name+' contiene errores')}
  // Los textos peligrosos se conservan como texto literal y los importes como número.
  const book=new ExcelJS.Workbook();await book.xlsx.load(buffer);const sheet=book.worksheets[0];
  assert.equal(sheet.rowCount,report.rows.length+1);
  assert.deepEqual(sheet.getRow(1).values.slice(1),columns.map(([,label])=>label));
  report.rows.forEach((row,index)=>columns.forEach(([key],column)=>{
   const cell=sheet.getRow(index+2).getCell(column+1),value=row[key];
   if(value==null)assert.equal(cell.value,null,kind+' '+key);
   else if(typeof value==='number'){assert.equal(cell.type,ExcelJS.ValueType.Number,kind+' '+key);assert.equal(cell.value,value)}
   else if(typeof value==='string'){assert.equal(cell.type,ExcelJS.ValueType.String,kind+' '+key+'='+value);assert.equal(cell.value,value)}
  }));
 }
});

test('QA-14: el comprobador de XML detecta documentos mal formados',()=>{
 assertWellFormedXml('<?xml version="1.0"?><a x="1"><b/>t &amp; &#10;</a>','ok');
 for(const bad of ['<a><b></a></b>','<a>x & y</a>','<a x=1/>','<a/><b/>','<a x="1" x="2"/>','<a>\u0001</a>','<a>'])assert.throws(()=>assertWellFormedXml(bad,'malo'),bad);
});

// ExcelJS elimina los caracteres de control al escribir (el dato se pierde en el Excel, pero el XML es válido).
test('QA-14: un nombre de cliente con caracteres de control produce un Excel válido',async()=>{
 const f=await qaPlatform();const S=await f.shop('Control QA',{stock:5});
 await f.act(S.admin,{type:'sale.create',form:{cliente:'Cliente\u0007con\u001bcontrol',paymentMethod:'efectivo'},items:[{producto_id:S.product.id,cantidad:1,precio_unitario:S.product.precio_venta}],labor:[]});
 const report=salesReport(f.state.businesses[S.company.id],{});
 const files=unzipSync(new Uint8Array(await excelBuffer({title:'VENTAS',columns:reportColumns('sales'),rows:report.rows})));
 for(const [name,content]of Object.entries(files))if(/\.xml$/.test(name))assertWellFormedXml(strFromU8(content),name);
});
