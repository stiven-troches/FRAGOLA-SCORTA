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
