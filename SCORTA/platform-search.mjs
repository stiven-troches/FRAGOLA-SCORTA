// BE-28: búsqueda paginada en el servidor para empresas con listas grandes (productos,
// ventas y clientes). Funciones puras: platform.mjs decide qué filas ve cada rol y aquí solo
// se normaliza, filtra, ordena y pagina. El estado leído en caché es inmutable, así que el
// índice ordenado y normalizado se guarda por arreglo de origen (WeakMap): varias búsquedas
// sobre la misma versión de los datos no lo recalculan.
export const SEARCH_DEFAULT_LIMIT=50,SEARCH_MAX_LIMIT=200,SEARCH_MAX_QUERY=100,SEARCH_MAX_OFFSET=10000000;
export const PRODUCT_AVAILABILITY=['','disponibles','bajos','agotados'];
const fail=(message,status=400,code='INVALID_SEARCH')=>{throw Object.assign(Error(message),{status,code});};
export const searchNorm=value=>String(value??'').normalize('NFD').replace(/[̀-ͯ]/g,'').trim().toLowerCase();
const collator=new Intl.Collator('es');
const integer=(raw,fallback,min,max,message)=>{
  if(raw==null||raw==='')return fallback;
  if(!/^\d{1,9}$/.test(raw))fail(message);
  const value=Number(raw);if(value<min||value>max)fail(message);return value;
};
const optionalParam=(params,key,max=100)=>{const value=params.get(key);if(value==null)return '';if(value.length>max)fail('Filtro demasiado largo.');return value.trim();};
const day=(params,key)=>{const value=optionalParam(params,key,10);if(value&&!/^\d{4}-\d{2}-\d{2}$/.test(value))fail('Fecha inválida: usa AAAA-MM-DD.');return value;};
// offset/limit: límite de 1 a 200 (50 por omisión); q se normaliza sin tildes ni mayúsculas.
export function pageParams(params){
  const q=params.get('q')??'';if(q.length>SEARCH_MAX_QUERY)fail(`La búsqueda admite hasta ${SEARCH_MAX_QUERY} caracteres.`);
  return {q:searchNorm(q),
    limit:integer(params.get('limit'),SEARCH_DEFAULT_LIMIT,1,SEARCH_MAX_LIMIT,`El tamaño de página debe estar entre 1 y ${SEARCH_MAX_LIMIT}.`),
    offset:integer(params.get('offset'),0,0,SEARCH_MAX_OFFSET,'Posición de página inválida.')};
}
export function page(rows,{offset,limit}){
  const items=rows.slice(offset,offset+limit),end=offset+items.length;
  return {items,total:rows.length,offset,limit,nextOffset:end<rows.length?end:null};
}
const indexes=new WeakMap();
// build() se ejecuta una vez por arreglo de origen y clave (p. ej. el vendedor de la consulta).
function cached(source,key,build){
  let byKey=indexes.get(source);if(!byKey)indexes.set(source,byKey=new Map());
  if(!byKey.has(key))byKey.set(key,build());
  return byKey.get(key);
}
const productText=p=>searchNorm([p.nombre,p.referencia,p.codigo_barras,p.marca,p.categoria,p.modelo,p.compatibilidad].join(' '));
// Productos: primero la coincidencia exacta de código de barras o referencia; luego el texto
// (nombre, referencia, código, marca, categoría…), en orden alfabético.
export function searchProducts(prods,params){
  const paging=pageParams(params),category=optionalParam(params,'category'),availability=optionalParam(params,'availability',20);
  if(!PRODUCT_AVAILABILITY.includes(availability))fail('Filtro de existencias inválido.');
  const list=cached(prods,'products',()=>prods.map(row=>({row,text:productText(row),codes:[row.codigo_barras,row.referencia].filter(Boolean).map(searchNorm)})).sort((a,b)=>collator.compare(a.row.nombre||'',b.row.nombre||'')));
  const keep=({row})=>(!category||(row.categoria||'General')===category)&&(!availability||(availability==='agotados'?row.stock===0:availability==='bajos'?row.stock>0&&row.stock<=row.stock_minimo:row.stock>0));
  const {q}=paging,exact=q?list.filter(entry=>entry.codes.includes(q)&&keep(entry)):[],exactSet=new Set(exact);
  const rows=[...exact,...list.filter(entry=>!exactSet.has(entry)&&(!q||entry.text.includes(q))&&keep(entry))].map(entry=>entry.row);
  return page(rows,paging);
}
// Ventas: más recientes primero; texto sobre número, cliente, teléfono, placa y usuario.
export function searchSales(sales,params,{key='*',visible=()=>true}={}){
  const paging=pageParams(params),from=day(params,'from'),to=day(params,'to');
  const list=cached(sales,'sales:'+key,()=>sales.filter(visible).map(row=>({row,date:String(row.fecha||'').slice(0,10),text:searchNorm([row.id,row.numero,row.consecutivo,row.cliente,row.telefono,row.placa,row.usuario].filter(v=>v!=null).join(' '))})).sort((a,b)=>String(b.row.fecha||'').localeCompare(String(a.row.fecha||''))||String(b.row.id).localeCompare(String(a.row.id))));
  const {q}=paging,rows=list.filter(entry=>(!q||entry.text.includes(q))&&(!from||entry.date>=from)&&(!to||entry.date<=to)).map(entry=>entry.row);
  return page(rows,paging);
}
// Clientes: tarjetas del directorio ya preparadas para el rol (el vendedor recibe teléfono y
// documento enmascarados y solo puede buscar por lo que ve).
export function searchCustomers(records,params,{key='*',card}){
  const paging=pageParams(params);
  const list=cached(records,'customers:'+key,()=>records.filter(c=>!c.erasedAt).map(card).map(row=>({row,text:searchNorm([row.nombre,row.telefono,row.numeroDocumento].join(' '))})).sort((a,b)=>collator.compare(a.row.nombre||'',b.row.nombre||'')));
  const {q}=paging,rows=list.filter(entry=>!q||entry.text.includes(q)).map(entry=>entry.row);
  return page(rows,paging);
}
