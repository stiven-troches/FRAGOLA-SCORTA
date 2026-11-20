export const purchaseColumns=[['producto_id','PRODUCTO ID'],['referencia','REFERENCIA'],['nombre','PRODUCTO'],['cantidad','CANTIDAD'],['precio_unitario','COSTO UNITARIO']];
const normalize=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
const empty=v=>v===null||v===undefined||typeof v==='string'&&v.trim()==='';
export function purchaseTemplate(prods){return prods.slice(0,1000).map(p=>({producto_id:p.id,referencia:p.referencia||'',nombre:p.nombre,cantidad:null,precio_unitario:p.precio_compra??0}))}
export function parsePurchaseRows(table,prods){
 if(!Array.isArray(table)||table.length<2||table.length>1001)throw Error('El Excel debe contener entre 1 y 1000 productos.');
 const headers=table[0].map(normalize),required=['CANTIDAD','COSTO UNITARIO'];
 for(const key of required)if(!headers.includes(key))throw Error('Falta la columna '+key+'. Usa la plantilla.');
 if(new Set(headers.filter(Boolean)).size!==headers.filter(Boolean).length)throw Error('Hay columnas repetidas. Usa la plantilla.');
 if(!['PRODUCTO ID','REFERENCIA','PRODUCTO'].some(key=>headers.includes(key)))throw Error('Falta la identificación del producto. Usa la plantilla.');
 const problems=[],lines=[],seen=new Set();
 for(let i=1;i<table.length;i++){
  const row=Object.fromEntries(headers.map((h,c)=>[h,table[i][c]??'']));
  if(Object.values(row).every(empty)||empty(row.CANTIDAD))continue;
  const issue=message=>problems.push('Fila '+(i+1)+': '+message);
  if(Object.values(row).some(v=>typeof v==='object'||typeof v==='boolean')){issue('No se permiten fórmulas, enlaces ni valores especiales.');continue}
  let candidates=prods;
  const identifiers=[['PRODUCTO ID','id'],['REFERENCIA','referencia'],['PRODUCTO','nombre']].filter(([key])=>!empty(row[key]));
  if(!identifiers.length){issue('Identifica el producto con ID, referencia o nombre.');continue}
  for(const [key,field] of identifiers)candidates=candidates.filter(p=>normalize(p[field])===normalize(row[key]));
  if(candidates.length!==1){issue(candidates.length?'El producto es ambiguo; indica su ID o referencia.':'Producto inexistente o identificadores que no coinciden.');continue}
  const p=candidates[0],qty=Number(row.CANTIDAD),cost=Number(row['COSTO UNITARIO']);
  if(!Number.isSafeInteger(qty)||qty<1||qty>1e9){issue('La cantidad debe ser un entero positivo.');continue}
  if(empty(row['COSTO UNITARIO'])||!Number.isFinite(cost)||cost<0||cost>1e12||Math.abs(Math.round(cost*100)-cost*100)>1e-7){issue('Indica un costo numérico no negativo, sin símbolos de moneda.');continue}
  if(qty*cost>1e12){issue('El importe del producto supera el límite permitido.');continue}
  if(seen.has(p.id)){issue('Producto repetido en el archivo.');continue}seen.add(p.id);
  lines.push({producto_id:p.id,nombre:p.nombre,cantidad:qty,precio_unitario:cost});
 }
 if(problems.length)throw Error(problems.slice(0,20).join('\n'));
 if(!lines.length)throw Error('Completa la cantidad de al menos un producto.');
 if(lines.reduce((n,l)=>n+l.cantidad*l.precio_unitario,0)>1e12)throw Error('El total de la compra supera el límite permitido.');
 return lines;
}
