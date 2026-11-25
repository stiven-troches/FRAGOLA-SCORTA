import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import {productTemplateBuffer,readProductExcel} from '../src/excel.mjs';
import {estadoVacio,aplicarCambio} from '../inventory.mjs';
import {EXAMPLE_PREFIX,exampleProducts,productColumns,productTableRecords,requiredProductColumns,validateProductImport} from '../product-import.mjs';

const inventory=[{id:'x1',nombre:'Cadena 428',referencia:'CAD-428',codigo_barras:'7700000000001'}];
const load=async buffer=>{const book=new ExcelJS.Workbook();await book.xlsx.load(buffer);return book};
const importXlsx=async(buffer,prods=inventory)=>validateProductImport({...productTableRecords(await readProductExcel(buffer)),prods});
// Llena la plantilla real debajo de los ejemplos, como lo haría el almacén en Excel.
async function filledTemplate(rows,{keepExamples=true}={}){
 const book=await load(await productTemplateBuffer()),sheet=book.getWorksheet('Productos');
 // Quien borra los ejemplos escribe sus productos desde la fila 2.
 if(!keepExamples)for(let row=2;row<=1+exampleProducts.length;row++)productColumns.forEach((_,index)=>{sheet.getRow(row).getCell(index+1).value=null});
 let next=keepExamples?sheet.actualRowCount+1:2;
 for(const values of rows){productColumns.forEach((key,index)=>{if(values[key]!==undefined)sheet.getRow(next).getCell(index+1).value=values[key]});next++}
 return book.xlsx.writeBuffer();
}

test('DM-01 plantilla Excel: columnas idénticas a las que acepta el importador (Excel y CSV)',async()=>{
 const book=await load(await productTemplateBuffer()),sheet=book.getWorksheet('Productos');
 assert.deepEqual(book.worksheets.map(s=>s.name),['Productos','Instrucciones']);
 assert.deepEqual(sheet.getRow(1).values.slice(1),productColumns);
 // La plantilla CSV y la validación del navegador usan la misma lista.
 const source=readFileSync(new URL('../src/ClientWorkspace.jsx',import.meta.url),'utf8');
 const csv=source.match(/const csvColumns=(\[[^\]]+\]);/);assert.ok(csv,'csvColumns en ClientWorkspace.jsx');
 assert.deepEqual(JSON.parse(csv[1].replaceAll("'",'"')),productColumns);
 assert.deepEqual(requiredProductColumns.filter(key=>!productColumns.includes(key)),[]);
 // Cada columna está explicada en la hoja de instrucciones.
 const help=book.getWorksheet('Instrucciones').getColumn(1).values.filter(Boolean).join('\n');
 for(const key of productColumns)assert.match(help,new RegExp('^'+key+': ','m'));
 assert.match(help,/sin puntos de miles/);assert.match(help,/no importa nada/);assert.match(help,/no puede[n]? repetirse/);
});

test('DM-01 plantilla Excel: 3 ejemplos marcados, códigos como texto y validación de datos',async()=>{
 const sheet=(await load(await productTemplateBuffer())).getWorksheet('Productos');
 assert.equal(sheet.actualRowCount,1+exampleProducts.length);assert.equal(exampleProducts.length,3);
 for(let row=2;row<=4;row++)assert.ok(String(sheet.getCell(row,1).value).startsWith(EXAMPLE_PREFIX));
 const col=key=>sheet.getColumn(productColumns.indexOf(key)+1).letter;
 assert.equal(sheet.getCell(`${col('referencia')}4`).value,'00123');assert.equal(sheet.getCell(`${col('referencia')}10`).numFmt,'@');
 const rule=key=>sheet.dataValidations.find(`${col(key)}50`);
 assert.deepEqual([rule('precio_venta').type,rule('precio_venta').formulae[0],rule('precio_venta').allowBlank],['decimal',0,undefined]);
 assert.equal(rule('precio_compra').allowBlank,true);
 assert.deepEqual([rule('stock').type,rule('stock').formulae[0]],['whole',0]);assert.equal(rule('stock_minimo').type,'whole');
 assert.deepEqual([rule('tarifa_iva').type,rule('tarifa_iva').formulae[0]],['list','"0,5,19"']);
 assert.equal(rule('nombre').type,'textLength');
 // Sin filas nuevas, la plantilla tal cual no importa nada.
 const empty=await importXlsx(await productTemplateBuffer());
 assert.equal(empty.examples,3);assert.match(empty.problems.join(' '),/entre 1 y 1000 productos/);
});

test('DM-01 importar .xlsx: omite ejemplos, conserva ceros y produce lo mismo que el CSV',async()=>{
 const rows=[
  {nombre:'Filtro de aire',precio_venta:18000,precio_compra:11000,stock:5,stock_minimo:2,categoria:'Filtros',referencia:'00045',codigo_barras:'0012345',tarifa_iva:19},
  {nombre:'Bujía NGK',precio_venta:'9500',stock:'10',precio_mayorista:8000,tarifa_iva:'5'},
  {nombre:'Guaya clutch',precio_venta:1250.5}
 ];
 const result=await importXlsx(await filledTemplate(rows));
 assert.deepEqual(result.problems,[]);assert.equal(result.examples,3);
 assert.deepEqual(result.items.map(p=>p.nombre),['Filtro de aire','Bujía NGK','Guaya clutch']);
 assert.deepEqual(result.items[0],{nombre:'Filtro de aire',precio_venta:18000,precio_compra:11000,stock:5,stock_minimo:2,categoria:'Filtros',referencia:'00045',marca:'',modelo:'',compatibilidad:'',codigo_barras:'0012345',tarifa_iva:19});
 assert.deepEqual([result.items[1].precio_venta,result.items[1].stock,result.items[1].precio_compra,result.items[1].precio_mayorista,result.items[1].tarifa_iva],[9500,10,null,8000,5]);
 assert.equal(result.items[2].precio_venta,1250.5);assert.equal(result.items[2].stock,0);
 // El mismo contenido en CSV da exactamente los mismos productos.
 const csv=Papa.unparse({fields:productColumns,data:rows.map(row=>productColumns.map(key=>row[key]??''))});
 const parsed=Papa.parse(csv,{header:true,skipEmptyLines:'greedy'});
 assert.deepEqual(validateProductImport({headers:parsed.meta.fields,rows:parsed.data,prods:inventory}).items,result.items);
 // Y el servidor acepta esas filas tal cual en la operación «importar».
 const state=estadoVacio(),next=aplicarCambio(state,{revision:state.revision,kind:'importar',form:{},items:result.items},'admin');
 assert.deepEqual(next.prods.map(p=>[p.nombre,p.referencia,p.stock,p.precio_venta]),[['Filtro de aire','00045',5,18000],['Bujía NGK','',10,9500],['Guaya clutch','',0,1250.5]]);
 assert.equal(next.prods[1].precios?.mayorista,8000);assert.equal(next.prods[1].tarifa_iva,5);
});

test('DM-01 importar .xlsx: duplicados, negativos, fórmulas y columnas desconocidas se rechazan con su fila',async()=>{
 const bad=await importXlsx(await filledTemplate([
  {nombre:'Cadena 428',precio_venta:1000},
  {nombre:'Nuevo',precio_venta:1000,referencia:'cad-428'},
  {nombre:'Otro',precio_venta:1000,stock:-1},
  {nombre:'Fórmula',precio_venta:{formula:'1+1',result:2}},
  {nombre:'Sin precio'},
  {nombre:'IVA raro',precio_venta:10,tarifa_iva:16},
  {nombre:'Otro',precio_venta:5}
 ],{keepExamples:false}));
 const text=bad.problems.join('\n');
 assert.match(text,/Fila 2: nombre duplicado/);assert.match(text,/Fila 3: referencia duplicado/);
 assert.match(text,/Fila 4: stock debe ser un entero/);assert.match(text,/Fila 5: no se permiten fórmulas/);
 assert.match(text,/Fila 6: precio_venta/);assert.match(text,/Fila 7: tarifa_iva debe ser 0, 5 o 19/);assert.match(text,/Fila 8: nombre duplicado/);
 // Encabezados ajenos a la plantilla.
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Productos');sheet.addRow(['Nombre','precio','stock']);sheet.addRow(['A',1,1]);
 const foreign=await importXlsx(await book.xlsx.writeBuffer());
 assert.match(foreign.problems.join('\n'),/Falta la columna obligatoria precio_venta/);assert.match(foreign.problems.join('\n'),/Columna no reconocida: precio/);
 // Un archivo que no es Excel no llega a ExcelJS.
 await assert.rejects(readProductExcel(new TextEncoder().encode('nombre,precio_venta\nA,1').buffer),/Excel/);
});
