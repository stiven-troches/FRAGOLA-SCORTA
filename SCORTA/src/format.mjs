// Formateadores únicos de la interfaz. Cada Intl.NumberFormat se crea una sola vez.
// Regla: los decimales aparecen solo cuando el valor los tiene, con un máximo de 2.
// Se usa igual en el carrito, el comprobante y los reportes.
const options={style:'currency',currency:'COP'};
const copWhole=new Intl.NumberFormat('es-CO',{...options,minimumFractionDigits:0,maximumFractionDigits:0});
const copCents=new Intl.NumberFormat('es-CO',{...options,minimumFractionDigits:2,maximumFractionDigits:2});
const copCodeWhole=new Intl.NumberFormat('es-CO',{...options,currencyDisplay:'code',minimumFractionDigits:0,maximumFractionDigits:0});
const copCodeCents=new Intl.NumberFormat('es-CO',{...options,currencyDisplay:'code',minimumFractionDigits:2,maximumFractionDigits:2});
const numberWhole=new Intl.NumberFormat('es-CO',{minimumFractionDigits:0,maximumFractionDigits:0});
const numberCents=new Intl.NumberFormat('es-CO',{minimumFractionDigits:2,maximumFractionDigits:2});

/** Redondeo decimal a dos cifras (mitad hacia arriba) sin depender de errores binarios. */
export function roundCents(value){
 const number=Number(value);
 if(!Number.isFinite(number))return 0;
 const rounded=Number(Math.round(Number(Math.abs(number)+'e2'))+'e-2');
 return number<0?-rounded:rounded;
}
const pick=(value,whole,cents)=>{const rounded=roundCents(value);return (Number.isInteger(rounded)?whole:cents).format(Object.is(rounded,-0)?0:rounded)};

/** $ 12.500 · $ 12.500,50 */
export const formatCOP=value=>pick(value,copWhole,copCents);
/** COP 80.000 (cuando el símbolo $ podría confundirse y se necesita el código). */
export const formatCOPCode=value=>pick(value,copCodeWhole,copCodeCents);
/** 1.234 · 1.234,5 → 1.234,50 */
export const formatNumber=value=>pick(value,numberWhole,numberCents);
/** 12,5 % · '—' si no hay dato. */
export const formatPercent=value=>value==null||!Number.isFinite(Number(value))?'—':formatNumber(value)+' %';
export const money=formatCOP;

/**
 * Lee un valor en pesos escrito como en Colombia y lo devuelve como número en texto ('12000', '12000.5').
 * '12.000' → '12000' · '12.000,50' → '12000.5' · '$ 1.250.000' → '1250000' · '12,5' → '12.5' · '12.5' → '12.5'.
 * Devuelve '' si está vacío y null si es ambiguo o inválido ('1,000', '12.00.0', '-5'): nunca adivina.
 */
export function parseMoneyInput(text){
 const s=String(text??'').replace(/cop/gi,'').replace(/[\s$ ]/g,'');
 if(!s)return '';
 let plain;
 if(s.includes(',')){
  if(!/^(?:\d{1,3}(?:\.\d{3})+|\d+),\d{1,2}$/.test(s))return null;
  plain=s.replace(/\./g,'').replace(',','.');
 }else if(s.includes('.')){
  if(/^\d{1,3}(?:\.\d{3})+$/.test(s))plain=s.replace(/\./g,'');
  else if(/^\d+\.\d{1,2}$/.test(s))plain=s;
  else return null;
 }else{
  if(!/^\d+$/.test(s))return null;
  plain=s;
 }
 const number=Number(plain);
 return Number.isFinite(number)?String(number):null;
}
/** Valor numérico ('12000', 12000.5) mostrado con separador de miles para editar: '12.000' · '12.000,50'. */
export function formatMoneyInput(value){
 if(value==null||value==='')return '';
 const number=Number(value);
 return Number.isFinite(number)?formatNumber(number):String(value);
}

// Fechas: un solo formato en toda la app, siempre en hora de Colombia.
// «2026-11-23» (día del negocio) → «23 nov 2026»; un instante ISO → «23 nov 2026, 3:15 p. m.».
const bogotaDate=new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',day:'numeric',month:'short',year:'numeric'});
const bogotaDateTime=new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'});
const isDay=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value));
const toDate=value=>{if(value==null||value==='')return null;const date=value instanceof Date?value:new Date(isDay(value)?value+'T12:00:00Z':value);return Number.isNaN(date.getTime())?null:date};
const tidy=text=>text.replace(/\.(?=\s\d{4})/,'').replace(/\s+de\s+/g,' ');
export function formatDate(value,fallback='—'){const date=toDate(value);return date?tidy(bogotaDate.format(date)):fallback}
export function formatDateTime(value,fallback='—'){if(isDay(value))return formatDate(value,fallback);const date=toDate(value);return date?tidy(bogotaDateTime.format(date)):fallback}
