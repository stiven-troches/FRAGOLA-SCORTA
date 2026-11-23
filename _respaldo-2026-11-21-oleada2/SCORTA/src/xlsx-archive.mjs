import {Inflate} from 'fflate';
const LIMIT=20000000,ENTRY_LIMIT=2000;
const crcTable=Uint32Array.from({length:256},(_,value)=>{for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0});
const fail=message=>{throw Error(message)};
/** Verify the complete directory and bound actual streamed output before ExcelJS loads it. */
export function validateWorkbookArchive(buffer){
 const bytes=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bytes.length>5000000||bytes.length<22)fail('El Excel debe ser un archivo .xlsx de hasta 5 MB.');
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===bytes.length){end=i;break}
 if(end<0)fail('El archivo no es un Excel .xlsx válido.');
 const count=view.getUint16(end+10,true),size=view.getUint32(end+12,true),offset=view.getUint32(end+16,true);
 if(view.getUint16(end+4,true)||view.getUint16(end+6,true)||view.getUint16(end+8,true)!==count||!count||count>ENTRY_LIMIT||offset+size!==end)fail('El directorio del Excel no es válido.');
 const entries=[],names=new Set(),decoder=new TextDecoder('utf-8',{fatal:true});let at=offset,declared=0;
 while(at<end){
  if(entries.length>=ENTRY_LIMIT||at+46>end||view.getUint32(at,true)!==0x02014b50)fail('La estructura del Excel no es válida.');
  const flags=view.getUint16(at+8,true),method=view.getUint16(at+10,true),crc=view.getUint32(at+16,true),compressed=view.getUint32(at+20,true),expanded=view.getUint32(at+24,true),nameSize=view.getUint16(at+28,true),extraSize=view.getUint16(at+30,true),commentSize=view.getUint16(at+32,true),local=view.getUint32(at+42,true),next=at+46+nameSize+extraSize+commentSize;
  if(flags&1||![0,8].includes(method)||next>end||compressed===0xffffffff||expanded===0xffffffff||view.getUint16(at+34,true))fail('El Excel usa un formato ZIP no admitido.');
  declared+=expanded;if(declared>LIMIT)fail('El contenido del Excel supera el límite de 20 MB.');
  const name=decoder.decode(bytes.subarray(at+46,at+46+nameSize));if(!name||names.has(name))fail('Hay nombres de archivo repetidos en el Excel.');names.add(name);
  if(local+30>offset||view.getUint32(local,true)!==0x04034b50||view.getUint16(local+6,true)!==flags||view.getUint16(local+8,true)!==method)fail('La cabecera del Excel no coincide con su directorio.');
  const localNameSize=view.getUint16(local+26,true),start=local+30+localNameSize+view.getUint16(local+28,true),finish=start+compressed;
  if(finish>offset||decoder.decode(bytes.subarray(local+30,local+30+localNameSize))!==name)fail('La ubicación de los datos del Excel no es válida.');
  if(!(flags&8)&&(view.getUint32(local+14,true)!==crc||view.getUint32(local+18,true)!==compressed||view.getUint32(local+22,true)!==expanded))fail('Los tamaños del Excel no coinciden.');
  entries.push({local,start,finish,method,crc,expanded});at=next;
 }
 if(at!==end||entries.length!==count||!names.has('[Content_Types].xml')||!names.has('xl/workbook.xml'))fail('El directorio del Excel está incompleto.');
 const ordered=[...entries].sort((a,b)=>a.local-b.local);for(let i=1;i<ordered.length;i++)if(ordered[i].local<ordered[i-1].finish)fail('Los datos del Excel se superponen.');
 let total=0;
 for(const entry of entries){
  let length=0,checksum=0xffffffff;
  const consume=chunk=>{length+=chunk.length;total+=chunk.length;if(total>LIMIT||length>entry.expanded)fail('El contenido del Excel supera el tamaño permitido.');for(const byte of chunk)checksum=crcTable[(checksum^byte)&255]^(checksum>>>8)};
  if(entry.method===0)consume(bytes.subarray(entry.start,entry.finish));
  else{const inflate=new Inflate(consume);for(let cursor=entry.start;cursor<entry.finish;cursor+=1024){const endChunk=Math.min(cursor+1024,entry.finish);inflate.push(bytes.subarray(cursor,endChunk),endChunk===entry.finish)}}
  if(length!==entry.expanded||((checksum^0xffffffff)>>>0)!==entry.crc)fail('Los datos del Excel están dañados o sus tamaños no coinciden.');
 }
 return {entries:entries.length,expandedBytes:total};
}
