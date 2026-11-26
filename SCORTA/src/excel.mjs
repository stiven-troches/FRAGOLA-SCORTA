import {validateWorkbookArchive} from './xlsx-archive.mjs';
export {validateWorkbookArchive} from './xlsx-archive.mjs';
import {MAX_IMPORT_ROWS,exampleProducts,productColumnHelp,productColumns,productTemplateInstructions,requiredProductColumns} from '../product-import.mjs';
const mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const excel=async()=>{const module=await import('exceljs');return module.default||module};
const filename=value=>String(value).replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ _.-]/g,'').slice(0,100);
export async function excelBuffer({title='REPORTE',columns,rows=[],from,to}){
 const Excel=await excel(),book=new Excel.Workbook();book.creator='SCORTA';
 const sheet=book.addWorksheet(String(title).replace(/[\\/*?:\[\]\x00-\x1f]/g,' ').trim().slice(0,31).replace(/^'+|'+$/g,'').trim()||'REPORTE');
 sheet.columns=columns.map(([key,header,format])=>({key,header:header.toLocaleUpperCase('es'),width:format?22:30,...(format?{style:{numFmt:format}}:{})}));
 for(const source of rows)sheet.addRow(Object.fromEntries(columns.map(([key])=>[key,source[key]??null])));
 sheet.getRow(1).font={bold:true,color:{argb:'FF111111'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF4CF32'}};
 sheet.views=[{state:'frozen',ySplit:1}];sheet.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,rows.length+1),column:columns.length}};
 if(from!==undefined||to!==undefined){const period=book.addWorksheet('PERÍODO');period.addRows([['DESDE',from||'Todo el historial'],['HASTA',to||'Todo el historial']]);period.columns=[{width:24},{width:30}];}
 return book.xlsx.writeBuffer();
}
export async function downloadExcel(options,name){
 const buffer=await excelBuffer(options),url=URL.createObjectURL(new Blob([buffer],{type:mime}));
 const anchor=document.createElement('a');anchor.href=url;anchor.download=filename(name||'SCORTA')+'.xlsx';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function readPurchaseExcel(buffer){
 validateWorkbookArchive(buffer);const Excel=await excel(),book=new Excel.Workbook();await book.xlsx.load(buffer);
 const sheet=book.worksheets[0];if(!sheet||sheet.rowCount>1001||sheet.columnCount>20)throw Error('Usa la plantilla con un máximo de 1000 productos y 20 columnas.');
 const rows=[];sheet.eachRow({includeEmpty:true},row=>{rows.push(Array.from({length:Math.min(20,sheet.columnCount)},(_,i)=>row.getCell(i+1).value??''))});return rows;
}
// DM-01: plantilla Excel de inventario inicial («Productos» + «Instrucciones») y su lector.
const TEXT_COLUMNS=new Set(['nombre','categoria','referencia','marca','modelo','compatibilidad','codigo_barras']);
const PRODUCT_SHEET_ROWS=MAX_IMPORT_ROWS+exampleProducts.length+1;
export async function productTemplateBuffer(){
 const Excel=await excel(),book=new Excel.Workbook();book.creator='SCORTA';
 const sheet=book.addWorksheet('Productos',{views:[{state:'frozen',ySplit:1}]});
 sheet.columns=productColumns.map(key=>({key,header:key,width:key==='nombre'||key==='compatibilidad'?36:key.startsWith('precio')?18:16,...(TEXT_COLUMNS.has(key)?{style:{numFmt:'@'}}:{})}));
 const header=sheet.getRow(1);header.font={bold:true,color:{argb:'FF111111'}};
 productColumns.forEach((key,index)=>{const cell=header.getCell(index+1);cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:requiredProductColumns.includes(key)?'FFF4CF32':'FFE9ECEF'}};cell.note=productColumnHelp[key]});
 for(const example of exampleProducts){const row=sheet.addRow(Object.fromEntries(productColumns.map(key=>[key,example[key]===''?null:example[key]])));row.font={italic:true,color:{argb:'FF6B7280'}};row.eachCell({includeEmpty:true},cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF3F4F6'}}})}
 const range=key=>{const letter=sheet.getColumn(key).letter;return `${letter}2:${letter}${PRODUCT_SHEET_ROWS}`};
 const rule=(key,validation,error)=>sheet.dataValidations.add(range(key),{allowBlank:true,showErrorMessage:true,errorStyle:'stop',errorTitle:key,error,...validation});
 const money='Escribe un valor en pesos de 0 o más, sin puntos ni signo $.';
 rule('nombre',{type:'textLength',operator:'between',allowBlank:false,formulae:[1,200]},'El nombre es obligatorio y tiene máximo 200 caracteres.');
 rule('precio_venta',{type:'decimal',operator:'between',allowBlank:false,formulae:[0,1e12]},'El precio de venta es obligatorio. '+money);
 for(const key of ['precio_compra','precio_mecanico','precio_mayorista'])rule(key,{type:'decimal',operator:'between',formulae:[0,1e12]},money);
 for(const key of ['stock','stock_minimo'])rule(key,{type:'whole',operator:'between',formulae:[0,1e9]},'Escribe un número entero de 0 o más.');
 rule('tarifa_iva',{type:'list',formulae:['"0,5,19"']},'Usa 0, 5 o 19.');
 for(const key of ['referencia','marca','modelo','codigo_barras'])rule(key,{type:'textLength',operator:'lessThanOrEqual',formulae:[100]},'Máximo 100 caracteres.');
 rule('compatibilidad',{type:'textLength',operator:'lessThanOrEqual',formulae:[300]},'Máximo 300 caracteres.');
 const help=book.addWorksheet('Instrucciones');help.getColumn(1).width=120;
 productTemplateInstructions.forEach((line,index)=>{const cell=help.getCell(index+1,1);cell.value=line;cell.alignment={wrapText:true,vertical:'top'};if(line&&line===line.toLocaleUpperCase('es'))cell.font={bold:true}});
 return book.xlsx.writeBuffer();
}
export async function downloadProductTemplate(){
 const buffer=await productTemplateBuffer(),url=URL.createObjectURL(new Blob([buffer],{type:mime}));
 const anchor=document.createElement('a');anchor.href=url;anchor.download='scorta-plantilla-productos.xlsx';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
/** Lee la hoja «Productos» (o la primera) como filas de valores de celda; la validación está en product-import.mjs. */
export async function readProductExcel(buffer){
 validateWorkbookArchive(buffer);const Excel=await excel(),book=new Excel.Workbook();await book.xlsx.load(buffer);
 const sheet=book.getWorksheet('Productos')||book.worksheets[0];
 if(!sheet||sheet.actualRowCount>PRODUCT_SHEET_ROWS||sheet.actualColumnCount>30)throw Error(`Usa la plantilla: máximo ${MAX_IMPORT_ROWS} productos y 30 columnas en la hoja «Productos».`);
 const width=Math.min(30,sheet.columnCount),rows=[];
 const tooMany=Error(`Usa la plantilla: máximo ${MAX_IMPORT_ROWS} productos y 30 columnas en la hoja «Productos».`);
 sheet.eachRow((row,number)=>{if(number>PRODUCT_SHEET_ROWS)throw tooMany;rows[number-1]=Array.from({length:width},(_,i)=>row.getCell(i+1).value??null)});
 return Array.from(rows,row=>row||[]);
}
