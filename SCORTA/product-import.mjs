// DM-01: importación inicial de productos desde CSV o Excel (.xlsx).
// Una sola definición de columnas y validación para la plantilla, el lector CSV y el lector Excel.
import {moneyAmount} from './money.mjs';
import {VAT_RATES} from './sale-pricing.mjs';

export const productColumns=['nombre','precio_venta','precio_compra','stock','stock_minimo','categoria','referencia','marca','modelo','compatibilidad','codigo_barras','precio_mecanico','precio_mayorista','tarifa_iva'];
export const requiredProductColumns=['nombre','precio_venta'];
export const MAX_IMPORT_ROWS=1000;
// Qué significa cada columna (encabezado de la plantilla e Instrucciones).
export const productColumnHelp={
 nombre:'Obligatorio. Nombre del producto, máximo 200 caracteres. No puede repetirse.',
 precio_venta:'Obligatorio. Precio de venta en pesos, sin puntos ni signo $ (ej. 45000).',
 precio_compra:'Costo unitario en pesos, sin puntos. Vacío si no lo conoces.',
 stock:'Existencia inicial: número entero, 0 o más. Vacío = 0.',
 stock_minimo:'Unidades mínimas antes de avisar que hay pocas. Entero. Vacío = 0.',
 categoria:'Agrupa el inventario (ej. Frenos, Lubricantes). Vacío = General.',
 referencia:'Código interno o del proveedor. No puede repetirse.',
 marca:'Marca del repuesto. Máximo 100 caracteres.',
 modelo:'Modelo del repuesto. Máximo 100 caracteres.',
 compatibilidad:'Motos con las que sirve. Máximo 300 caracteres.',
 codigo_barras:'Código de barras para el lector. No puede repetirse.',
 precio_mecanico:'Precio especial para mecánicos, en pesos. Opcional.',
 precio_mayorista:'Precio especial para mayoristas, en pesos. Opcional.',
 tarifa_iva:'IVA del producto: 0, 5 o 19. Vacío = la tarifa general de tu negocio.'
};
// Filas de ejemplo de la plantilla: se reconocen por el prefijo y nunca se importan.
export const EXAMPLE_PREFIX='EJEMPLO - ';
export const exampleProducts=[
 {nombre:EXAMPLE_PREFIX+'Pastillas de freno delanteras',precio_venta:45000,precio_compra:28000,stock:12,stock_minimo:3,categoria:'Frenos',referencia:'PF-0012',marca:'Genérica',modelo:'Delantera',compatibilidad:'Pulsar 180, Discover 125',codigo_barras:'7701234567890',precio_mecanico:40000,precio_mayorista:36000,tarifa_iva:19},
 {nombre:EXAMPLE_PREFIX+'Aceite 4T 20W50 1 litro',precio_venta:32000,precio_compra:21500,stock:24,stock_minimo:6,categoria:'Lubricantes',referencia:'AC-20W50',marca:'Motul',modelo:'',compatibilidad:'Motores 4 tiempos',codigo_barras:'',precio_mecanico:'',precio_mayorista:'',tarifa_iva:19},
 {nombre:EXAMPLE_PREFIX+'Bombillo farola 12V',precio_venta:8500,precio_compra:'',stock:0,stock_minimo:2,categoria:'Eléctricos',referencia:'00123',marca:'',modelo:'H4',compatibilidad:'',codigo_barras:'',precio_mecanico:'',precio_mayorista:'',tarifa_iva:''}
];
export const isExampleRow=row=>/^ejemplo\s*[-–:]/i.test(String(row?.nombre??'').trim());

const plain=value=>value==null?'':value;
/** Convierte la tabla leída del Excel (filas de valores de celda) en encabezados y filas como texto. */
export function productTableRecords(table){
 if(!Array.isArray(table)||!table.length)return {headers:[],rows:[],lines:[],problems:['El Excel está vacío. Usa la plantilla.']};
 const problems=[],cell=(value,where)=>{
  if(value==null)return '';
  if(typeof value==='number')return Number.isFinite(value)?String(value):(problems.push(where+': número no válido.'),'');
  if(typeof value==='string')return value;
  if(typeof value==='object'&&Array.isArray(value.richText))return value.richText.map(part=>part?.text??'').join('');
  problems.push(where+': no se permiten fórmulas, fechas, enlaces ni valores especiales; escribe el valor directamente.');return '';
 };
 const headers=table[0].map((value,c)=>cell(value,'Encabezado '+(c+1)).replace(/^﻿/,'').trim().toLowerCase());
 while(headers.length&&!headers[headers.length-1])headers.pop();
 const rows=[],lines=[];
 for(let i=1;i<table.length;i++){
  const values=headers.map((_,c)=>cell(plain(table[i]?.[c]),'Fila '+(i+1)));
  if(values.every(v=>String(v).trim()===''))continue;
  rows.push(Object.fromEntries(headers.map((h,c)=>[h,values[c]])));lines.push(i+1);
 }
 return {headers,rows,lines,problems};
}

/**
 * Valida las filas (objetos columna → texto) contra el inventario actual.
 * Devuelve {items, problems, examples}; items solo es útil si problems está vacío.
 */
export function validateProductImport({headers=[],rows=[],lines=[],prods=[],problems:initial=[]}){
 const problems=[...initial];
 for(const required of requiredProductColumns)if(!headers.includes(required))problems.push(`Falta la columna obligatoria ${required}.`);
 const seenHeaders=new Set();
 for(const field of headers){if(!field)continue;if(!productColumns.includes(field))problems.push(`Columna no reconocida: ${field}. Usa la plantilla.`);else if(seenHeaders.has(field))problems.push(`Columna repetida: ${field}. Usa la plantilla.`);seenHeaders.add(field)}
 const data=[],dataLines=[];let examples=0;
 rows.forEach((row,index)=>{if(isExampleRow(row)){examples++;return}data.push(row);dataLines.push(lines[index]??index+2)});
 if(!data.length||data.length>MAX_IMPORT_ROWS)problems.push(`El archivo debe contener entre 1 y ${MAX_IMPORT_ROWS} productos${examples?' (las filas de ejemplo no cuentan)':''}.`);
 const seen={nombre:new Set(prods.map(p=>String(p.nombre||'').toLowerCase())),referencia:new Set(prods.map(p=>String(p.referencia||'').trim().toLowerCase()).filter(Boolean)),codigo_barras:new Set(prods.map(p=>String(p.codigo_barras||'').trim().toLowerCase()).filter(Boolean))};
 const items=data.slice(0,MAX_IMPORT_ROWS).map((row,index)=>{
  const line=dataLines[index],at=`Fila ${line}`;
  const clean=Object.fromEntries(productColumns.map(key=>[key,String(row[key]??'').trim()]));
  if(!clean.nombre||clean.nombre.length>200)problems.push(`${at}: nombre obligatorio, máximo 200 caracteres.`);
  for(const field of ['nombre','referencia','codigo_barras']){const key=clean[field].toLowerCase();if(!key)continue;if(seen[field].has(key))problems.push(`${at}: ${field} duplicado en el archivo o inventario.`);seen[field].add(key)}
  for(const field of ['precio_venta','precio_compra','stock','stock_minimo']){
   const input=clean[field],integer=['stock','stock_minimo'].includes(field);if(field==='precio_compra'&&!input){clean[field]=null;continue}const number=Number(input||0);
   if((field==='precio_venta'&&!input)||!Number.isFinite(number)||number<0||number>1e12||(integer&&!Number.isSafeInteger(number)))problems.push(`${at}: ${field} debe ser ${integer?'un entero':'un número'} válido y no negativo.`);
   if(!integer&&input){try{moneyAmount(input,field)}catch(failure){problems.push(`${at}: ${failure.message}`)}}clean[field]=number;
  }
  // BE-36 / BE-18: columnas opcionales de precios especiales y tarifa de IVA.
  for(const field of ['precio_mecanico','precio_mayorista']){if(!clean[field]){delete clean[field];continue}try{clean[field]=moneyAmount(clean[field],field)}catch(failure){problems.push(`${at}: ${failure.message}`)}}
  if(clean.tarifa_iva==='')delete clean.tarifa_iva;else{const rate=Number(String(clean.tarifa_iva).replace('%','').trim());if(!VAT_RATES.includes(rate))problems.push(`${at}: tarifa_iva debe ser 0, 5 o 19.`);else clean.tarifa_iva=rate}
  for(const key of ['referencia','marca','modelo','codigo_barras'])if(String(clean[key]).length>100)problems.push(`${at}: ${key} supera 100 caracteres.`);
  if(clean.compatibilidad.length>300)problems.push(`${at}: compatibilidad supera 300 caracteres.`);
  return clean;
 });
 return {items,problems,examples};
}

// Hoja «Instrucciones» de la plantilla Excel, en lenguaje sencillo.
export const productTemplateInstructions=[
 'CÓMO LLENAR LA PLANTILLA DE INVENTARIO DE SCORTA',
 '',
 '1. Usa la hoja «Productos». Escribe un producto por fila, empezando en la primera fila libre debajo de los ejemplos.',
 '2. No cambies, borres ni reordenes los encabezados de la fila 1. Si no usas una columna, déjala vacía.',
 '3. Solo dos columnas son obligatorias: nombre y precio_venta. Las demás son opcionales.',
 '4. Precios y costos en pesos colombianos, sin puntos de miles, sin signo $ y sin espacios. Escribe 45000, no $45.000. Si hay centavos usa punto: 1250.50.',
 '5. stock es la cantidad que tienes hoy en el almacén y stock_minimo la cantidad con la que quieres que SCORTA te avise que quedan pocas. Ambos son números enteros (0, 1, 2…).',
 '6. precio_compra es lo que te cuesta cada unidad. Si no lo sabes, déjalo vacío; podrás completarlo después con las compras.',
 '7. categoria agrupa el inventario (Frenos, Lubricantes, Eléctricos…). Si la dejas vacía, el producto queda en «General».',
 '8. referencia y codigo_barras son los códigos del producto. Están en formato texto para conservar los ceros iniciales (00123).',
 '9. tarifa_iva admite 0, 5 o 19. Vacía = la tarifa general configurada en tu negocio.',
 '10. precio_mecanico y precio_mayorista son precios especiales opcionales para esos tipos de cliente.',
 '11. Las filas que empiezan con «EJEMPLO - » son solo de muestra: puedes borrarlas o dejarlas, SCORTA no las importa.',
 '12. No uses fórmulas ni celdas combinadas: escribe los valores directamente.',
 '',
 'DUPLICADOS Y ERRORES',
 '• El nombre, la referencia y el código de barras no pueden repetirse, ni dentro del archivo ni con productos que ya tengas en SCORTA.',
 '• Si hay un duplicado o un valor inválido, SCORTA muestra la lista de problemas con su número de fila y no importa nada. Corrige el archivo y vuelve a seleccionarlo.',
 '• La importación solo crea productos nuevos: no modifica ni reemplaza productos existentes. Para cambiar uno que ya existe, edítalo en Inventario.',
 '• Se importan entre 1 y 1000 productos por archivo. Si tienes más, divídelos en varios archivos.',
 '• Antes de confirmar verás una vista previa. El servidor guarda todo el archivo completo o no guarda nada.',
 '',
 'QUÉ SIGNIFICA CADA COLUMNA',
 ...productColumns.map(key=>`${key}: ${productColumnHelp[key]}`)
];
