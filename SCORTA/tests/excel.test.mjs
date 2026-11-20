import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {excelBuffer,readPurchaseExcel,validateWorkbookArchive} from '../src/excel.mjs';
import {purchaseColumns,purchaseTemplate,parsePurchaseRows} from '../purchase-import.mjs';
import {reportColumns,replenishmentReport} from '../admin-reports.mjs';
const products=[{id:'p1',referencia:'ACE-01',nombre:'Aceite 4T',precio_compra:15000,stock:2,stock_minimo:3},{id:'p2',referencia:'00123',nombre:'Filtro',precio_compra:5000,stock:0,stock_minimo:2}];
const headers=purchaseColumns.map(([,label])=>label);

test('Excel real: números, encabezados y filtros del período sobreviven al abrir el .xlsx',async()=>{
 const buffer=await excelBuffer({title:'QUÉ VENDIMOS',columns:[['name','Producto'],['amount','Venta','#,##0.00']],rows:[{name:'=1+1',amount:1234.5}],from:'2026-11-01',to:'2026-11-20'});
 assert.equal(buffer[0],0x50);assert.equal(buffer[1],0x4b);
 const book=new ExcelJS.Workbook();await book.xlsx.load(buffer);const sheet=book.worksheets[0];
 assert.equal(sheet.getCell('A1').value,'PRODUCTO');assert.equal(sheet.getCell('A2').type,ExcelJS.ValueType.String);assert.equal(sheet.getCell('A2').value,'=1+1');assert.equal(sheet.getCell('B2').value,1234.5);
 assert.equal(book.getWorksheet('PERÍODO').getCell('B1').value,'2026-11-01');assert.equal(book.getWorksheet('PERÍODO').getCell('B2').value,'2026-11-20');
});

test('plantilla compra: completa cantidades y carga varios productos sin perder referencias con ceros',async()=>{
 const rows=purchaseTemplate(products);rows[0].cantidad=2;rows[1].cantidad=3;
 const buffer=await excelBuffer({title:'COMPRA',columns:purchaseColumns,rows});
 const lines=parsePurchaseRows(await readPurchaseExcel(buffer),products);
 assert.deepEqual(lines,[{producto_id:'p1',nombre:'Aceite 4T',cantidad:2,precio_unitario:15000},{producto_id:'p2',nombre:'Filtro',cantidad:3,precio_unitario:5000}]);
 assert.equal(lines.reduce((n,l)=>n+l.cantidad*l.precio_unitario,0),45000);
});

test('importación valida todas las filas: desconocidos, duplicados, fórmulas, cantidades y costos inválidos',()=>{
 const valid=['p1','ACE-01','Aceite 4T',2,15000],invalid=[['no','','Desconocido',1,10],['p2','00123','Filtro',-1,2],['p2','00123','Filtro',1,-1],['p2','00123','Filtro',{formula:'1+1',result:2},10],['p1','ACE-01','Aceite 4T',1,10],['p2','NO','Filtro',1,10]];
 for(const row of invalid)assert.throws(()=>parsePurchaseRows([headers,valid,row],products),/Fila 3/);
 assert.throws(()=>parsePurchaseRows([headers,['p1','ACE-01','Aceite 4T',1,'']],products),/costo/);
 const ambiguous=[{id:'x',nombre:'Igual'},{id:'y',nombre:'Igual'}];assert.throws(()=>parsePurchaseRows([['PRODUCTO','CANTIDAD','COSTO UNITARIO'],['Igual',1,1]],ambiguous),/ambiguo/);
 assert.equal(parsePurchaseRows([headers,valid,['p2','00123','Filtro','',5000]],products).length,1);
});

test('Excel de reposición omite sugerencias y solo incluye productos agotados o en mínimo',async()=>{
 const report=replenishmentReport({prods:[...products,{id:'ok',nombre:'Suficiente',stock:10,stock_minimo:1}]});
 const buffer=await excelBuffer({title:'REPOSICIÓN',columns:reportColumns('replenishment'),rows:report.rows});
 const book=new ExcelJS.Workbook();await book.xlsx.load(buffer);const sheet=book.worksheets[0];
 assert.equal(sheet.rowCount,3);assert.ok(!JSON.stringify(sheet.getRow(1).values).includes('Sugerencia'));assert.ok(!JSON.stringify(sheet.getRow(1).values).includes('sugerida'));
});

test('Excel inválido o con ZIP declarado demasiado grande se rechaza antes de descomprimir',async()=>{
 assert.throws(()=>validateWorkbookArchive(new Uint8Array(30)),/no es un Excel/);
 const buffer=await excelBuffer({columns:purchaseColumns,rows:purchaseTemplate(products)}),bytes=new Uint8Array(buffer),view=new DataView(bytes.buffer);
 let found=false;for(let i=0;i<bytes.length-46;i++)if(view.getUint32(i,true)===0x02014b50){view.setUint32(i+24,21000000,true);found=true;break}
 assert.ok(found);assert.throws(()=>validateWorkbookArchive(bytes),/20 MB/);
});
