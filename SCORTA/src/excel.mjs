const mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const excel=async()=>{const module=await import('exceljs');return module.default||module};
const filename=value=>String(value).replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ _.-]/g,'').slice(0,100);
export async function excelBuffer({title='REPORTE',columns,rows=[],from,to}){
 const Excel=await excel(),book=new Excel.Workbook();book.creator='SCORTA';
 const sheet=book.addWorksheet(title.replace(/[\\/*?:\[\]]/g,' ').slice(0,31)||'REPORTE');
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
// Reject oversized ZIP declarations before decompressing an untrusted workbook.
export function validateWorkbookArchive(buffer){
 const bytes=new Uint8Array(buffer),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bytes.length>5000000||bytes.length<22)throw Error('El Excel debe ser un archivo .xlsx de hasta 5 MB.');
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break}
 if(end<0)throw Error('El archivo no es un Excel .xlsx válido.');
 const count=view.getUint16(end+10,true),offset=view.getUint32(end+16,true);let at=offset,total=0;
 if(count>2000||count===65535)throw Error('El archivo Excel contiene demasiados elementos.');
 for(let i=0;i<count;i++){
  if(at+46>bytes.length||view.getUint32(at,true)!==0x02014b50)throw Error('La estructura del Excel no es válida.');
  if(view.getUint16(at+8,true)&1)throw Error('El Excel no debe estar protegido con contraseña.');
  total+=view.getUint32(at+24,true);if(total>20000000)throw Error('El contenido del Excel supera el límite de 20 MB.');
  at+=46+view.getUint16(at+28,true)+view.getUint16(at+30,true)+view.getUint16(at+32,true);
 }
}
export async function readPurchaseExcel(buffer){
 validateWorkbookArchive(buffer);const Excel=await excel(),book=new Excel.Workbook();await book.xlsx.load(buffer);
 const sheet=book.worksheets[0];if(!sheet||sheet.rowCount>1001||sheet.columnCount>20)throw Error('Usa la plantilla con un máximo de 1000 productos y 20 columnas.');
 const rows=[];sheet.eachRow({includeEmpty:true},row=>{rows.push(Array.from({length:Math.min(20,sheet.columnCount)},(_,i)=>row.getCell(i+1).value??''))});return rows;
}
