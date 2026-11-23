import {validateWorkbookArchive} from './xlsx-archive.mjs';
export {validateWorkbookArchive} from './xlsx-archive.mjs';
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
