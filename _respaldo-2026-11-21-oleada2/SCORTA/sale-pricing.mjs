// Reglas puras de precio, descuento, IVA y pagos de una venta. Las comparten el servidor
// (platform.mjs), la interfaz (Nueva venta), el comprobante y los reportes, de modo que el
// total que ve el vendedor es exactamente el que confirma el servidor.
import {moneyAmount,roundMoney,sumMoney} from './money.mjs';

const fail=(message,status=400,code)=>{throw Object.assign(Error(message),{status,...(code?{code}:{})})};
const finite=value=>{const number=Number(value);return Number.isFinite(number)?number:0};
const has=(value,key)=>!!value&&typeof value==='object'&&Object.hasOwn(value,key);

export const PAYMENT_METHODS=[['efectivo','Efectivo'],['transferencia','Transferencia'],['tarjeta','Tarjeta'],['nequi','Nequi'],['daviplata','Daviplata']];
export const PAYMENT_KEYS=PAYMENT_METHODS.map(([key])=>key);
// Medios que siempre aparecen en reportes y cierres (los anteriores a FE-06).
export const BASE_PAYMENT_KEYS=['efectivo','transferencia','tarjeta'];
// BE-16 / BE-34: medios que NO son dinero recibido en caja. «credito» deja la venta por cobrar
// (cartera), «anticipo» paga una venta entregada desde un separado con sus abonos y
// «saldo_favor» usa el saldo a favor del cliente. Ninguno entra al esperado del cierre.
export const CREDIT_METHOD='credito',LAYAWAY_METHOD='anticipo',FAVOR_METHOD='saldo_favor';
export const NON_CASH_METHODS=[[CREDIT_METHOD,'Crédito'],[LAYAWAY_METHOD,'Abonos de separado'],[FAVOR_METHOD,'Saldo a favor']];
export const SALE_PAYMENT_KEYS=[...PAYMENT_KEYS,...NON_CASH_METHODS.map(([key])=>key)];
const paymentNames=Object.fromEntries([...PAYMENT_METHODS,...NON_CASH_METHODS]);
export const paymentLabel=key=>paymentNames[key]||key||'No registrado';
export const MAX_PAYMENTS=5;
// FE-07: carts on hold per user besides the current one.
export const MAX_HELD_SALES=10;

export const CUSTOMER_TYPES=[['mostrador','Mostrador'],['mecanico','Mecánico'],['mayorista','Mayorista']];
const customerTypeNames=Object.fromEntries(CUSTOMER_TYPES);
export const customerTypeLabel=key=>customerTypeNames[key]||'Mostrador';
export const customerType=value=>Object.hasOwn(customerTypeNames,value)?value:'mostrador';
export const DOCUMENT_TYPES=[['CC','Cédula de ciudadanía'],['NIT','NIT'],['CE','Cédula de extranjería'],['PAS','Pasaporte']];
export const documentLabel=(type,number)=>number?[type,number].filter(Boolean).join(' '):'';

export const VAT_RATES=[0,5,19];
export const DEFAULT_MAX_SELLER_DISCOUNT=10;
export const DEFAULT_SALE_SETTINGS=Object.freeze({maxSellerDiscountPct:DEFAULT_MAX_SELLER_DISCOUNT,vat:Object.freeze({enabled:false,defaultRate:19,pricesIncludeVat:true})});

const percentValue=(value,label)=>{
  if(value==null||!['number','string'].includes(typeof value)||String(value).trim()==='')fail(label+': indica un porcentaje.');
  const number=Number(value);
  if(!Number.isFinite(number)||number<0||number>100||roundMoney(number)!==number)fail(label+': usa un porcentaje entre 0 y 100 con hasta dos decimales.');
  return number;
};
export const vatRate=(value,label='Tarifa de IVA')=>{
  if(value===''||value==null)return null;
  const number=Number(String(value).replace('%','').trim());
  if(!VAT_RATES.includes(number))fail(label+': usa 0, 5 o 19 %.');
  return number;
};

/** Opciones de venta de una empresa, con valores por defecto para datos antiguos. */
export function saleSettings(business){
  const raw=business?.settings||{},vat=raw.vat||{};
  const pct=Number(raw.maxSellerDiscountPct);
  return {maxSellerDiscountPct:Number.isFinite(pct)&&pct>=0&&pct<=100?pct:DEFAULT_MAX_SELLER_DISCOUNT,
    vat:{enabled:vat.enabled===true,defaultRate:VAT_RATES.includes(Number(vat.defaultRate))?Number(vat.defaultRate):19,pricesIncludeVat:vat.pricesIncludeVat!==false}};
}
/** Valida el formulario de opciones de venta del administrador. */
export function cleanSaleSettings(form={},current={}){
  const base=saleSettings({settings:current}),vat=form.vat||{};
  const bool=(value,fallback,label)=>{if(value==null)return fallback;if(typeof value!=='boolean')fail(label+': indica sí o no.');return value};
  return {maxSellerDiscountPct:has(form,'maxSellerDiscountPct')?percentValue(form.maxSellerDiscountPct,'Tope de descuento del vendedor'):base.maxSellerDiscountPct,
    vat:{enabled:bool(vat.enabled,base.vat.enabled,'IVA activo'),defaultRate:has(vat,'defaultRate')?vatRate(vat.defaultRate,'Tarifa general de IVA')??fail('Tarifa general de IVA: usa 0, 5 o 19 %.'):base.vat.defaultRate,
      pricesIncludeVat:bool(vat.pricesIncludeVat,base.vat.pricesIncludeVat,'Precios con IVA incluido')}};
}

/** Precio de catálogo según la lista del cliente (mostrador = precio_venta). */
export function catalogPrice(product,tipo='mostrador'){
  const kind=customerType(tipo),special=kind!=='mostrador'?product?.precios?.[kind]:null;
  return special!=null&&special!==''&&Number.isFinite(Number(special))?Number(special):finite(product?.precio_venta);
}
/** Tarifa de IVA de un producto (null con IVA desactivado). */
export function productVatRate(product,settings){
  if(!settings?.vat?.enabled)return null;
  return VAT_RATES.includes(product?.tarifa_iva)?product.tarifa_iva:settings.vat.defaultRate;
}
/** Precio de lista final al cliente (con IVA incluido) para el tipo de cliente. */
export function listPrice(product,tipo,settings){
  const base=catalogPrice(product,tipo),rate=productVatRate(product,settings);
  return rate!=null&&!settings.vat.pricesIncludeVat?roundMoney(base*(1+rate/100)):roundMoney(base);
}

/** {tipo:'valor'|'porcentaje', valor} o null si no hay descuento. Lanza un error legible. */
export function normalizeDiscount(value,label='Descuento'){
  if(value==null||value==='')return null;
  if(typeof value!=='object'||Array.isArray(value))fail(label+' inválido.');
  const tipo=value.tipo==='porcentaje'?'porcentaje':value.tipo==='valor'?'valor':fail(label+': elige valor o porcentaje.');
  if(value.valor===''||value.valor==null)return null;
  const valor=tipo==='porcentaje'?percentValue(value.valor,label):(()=>{try{return moneyAmount(value.valor,label)}catch(error){return fail(error.message)}})();
  return valor>0?{tipo,valor}:null;
}
const unitDiscount=(price,discount,label)=>{
  if(!discount)return 0;
  const amount=discount.tipo==='porcentaje'?roundMoney(price*discount.valor/100):discount.valor;
  if(amount>price)fail(label+': el descuento no puede superar el precio.');
  return amount;
};

/**
 * Calcula precios netos. lines: [{precio, cantidad, descuento}] (precio por unidad antes de
 * descuento). El descuento de línea es por unidad; el descuento al total se reparte por
 * unidad en proporción al valor de cada línea, así devoluciones y utilidad usan el neto.
 */
export function priceLines(lines=[],saleDiscount=null){
  const first=lines.map((line,index)=>{
    const precio=roundMoney(finite(line.precio)),cantidad=finite(line.cantidad),discount=normalizeDiscount(line.descuento,'Descuento de '+(line.nombre||'la línea '+(index+1)));
    const lineDiscount=unitDiscount(precio,discount,'Descuento de '+(line.nombre||'la línea '+(index+1)));
    return {precio,cantidad,descuentoLinea:lineDiscount,despues:roundMoney(precio-lineDiscount)};
  });
  const subtotal=sumMoney(first.map(line=>roundMoney(line.despues*line.cantidad)));
  const total=normalizeDiscount(saleDiscount,'Descuento al total');
  let ratio=0;
  if(total){
    if(total.tipo==='porcentaje')ratio=total.valor/100;
    else{if(total.valor>subtotal)fail('Descuento al total: no puede superar el subtotal de productos ('+subtotal+').');ratio=subtotal>0?total.valor/subtotal:0}
  }
  const priced=first.map(line=>{
    const descuentoVenta=ratio?Math.min(line.despues,roundMoney(line.despues*ratio)):0,neto=roundMoney(line.despues-descuentoVenta);
    return {...line,descuentoVenta,descuento:roundMoney(line.precio-neto),precio_unitario:neto,total:roundMoney(neto*line.cantidad)};
  });
  const bruto=sumMoney(priced.map(line=>roundMoney(line.precio*line.cantidad)));
  return {lines:priced,bruto,subtotal:sumMoney(priced.map(line=>line.total)),
    descuentoLineas:sumMoney(priced.map(line=>roundMoney(line.descuentoLinea*line.cantidad))),
    descuentoTotal:sumMoney(priced.map(line=>roundMoney(line.descuentoVenta*line.cantidad))),
    descuentos:sumMoney(priced.map(line=>roundMoney(line.descuento*line.cantidad)))};
}
/**
 * BE-04/BE-36 (compartido por venta y cotización, BE-17): precia las líneas de un carrito con la
 * lista del cliente. items: [{producto_id,cantidad,precio?,descuento?,precio_unitario?}]. El
 * vendedor no cambia el precio de lista; un precio menor es un descuento limitado por el tope.
 * Devuelve {lines:[{product,lista,precio,descuento,explicit,sent}], priced} (priced = priceLines).
 */
export function priceSaleItems(prods,items,{tipo='mostrador',settings,seller=false,saleDiscount=null}={}){
  const config=settings||saleSettings({});
  const lines=items.map((line,index)=>{
    if(!line||typeof line!=='object'||Array.isArray(line))fail('Producto inválido en la línea '+(index+1));
    const product=(prods||[]).find(p=>p.id===line.producto_id);if(!product)fail('Producto inexistente');
    const lista=listPrice(product,tipo,config),explicit=line.precio!=null||line.descuento!=null;
    let precio,descuento=null;
    const amount=(value,label)=>{try{return moneyAmount(value,label)}catch(error){return fail(error.message)}};
    if(explicit){precio=line.precio==null?lista:amount(line.precio,'Precio de '+product.nombre);descuento=line.descuento??null;}
    else{
      const neto=amount(line.precio_unitario,'Precio unitario');
      if(!seller||neto===lista)precio=neto;
      else{if(neto>lista)fail('El vendedor no puede cambiar el precio del producto',403,'FORBIDDEN');precio=lista;descuento={tipo:'valor',valor:roundMoney(lista-neto)};}
    }
    if(seller&&precio!==lista)fail(`El vendedor no puede cambiar el precio de ${product.nombre}. Aplica un descuento dentro del tope de ${config.maxSellerDiscountPct} %.`,403,'FORBIDDEN');
    return {product,lista,precio,descuento,explicit,sent:line};
  });
  const priced=priceLines(lines.map(l=>({nombre:l.product.nombre,precio:l.precio,cantidad:l.sent.cantidad,descuento:l.descuento})),saleDiscount);
  for(const [index,l] of lines.entries()){
    const neto=priced.lines[index].precio_unitario;
    if(l.explicit&&l.sent.precio_unitario!=null&&Number(l.sent.precio_unitario)!==neto)fail(`El precio de ${l.product.nombre} cambió (${neto}). Revisa el carrito antes de cobrar.`,409,'PRICE_CHANGED');
    if(seller&&roundMoney(l.lista-neto)>roundMoney(l.lista*config.maxSellerDiscountPct/100))fail(`El descuento en ${l.product.nombre} es de ${discountPercent(l.lista,neto)} % y supera el tope de ${config.maxSellerDiscountPct} % permitido al vendedor. Pide a un administrador que lo autorice.`,403,'DISCOUNT_LIMIT');
  }
  return {lines,priced};
}
/** Descuento máximo por unidad que un vendedor puede aplicar sobre un precio de lista. */
export const sellerDiscountLimit=(lista,settings)=>roundMoney(finite(lista)*saleSettings({settings}).maxSellerDiscountPct/100);
export const discountPercent=(lista,neto)=>finite(lista)>0?roundMoney((finite(lista)-finite(neto))/finite(lista)*100):0;

/** IVA incluido en un valor final: devuelve {base, iva}. */
export function vatOf(amount,rate){
  const total=roundMoney(finite(amount)),r=finite(rate);
  if(!r||!total)return {base:total,iva:0};
  const base=roundMoney(total/(1+r/100));return {base,iva:roundMoney(total-base)};
}
/** Agrupa importes con IVA incluido por tarifa: [{tarifa, base, iva, total}] ordenado por tarifa. */
export function vatBreakdown(groups=[]){
  const byRate=new Map();
  for(const {tarifa,total}of groups){if(tarifa==null||!Number.isFinite(Number(tarifa)))continue;byRate.set(Number(tarifa),sumMoney([byRate.get(Number(tarifa))||0,roundMoney(finite(total))]))}
  const rows=[...byRate].sort((a,b)=>a[0]-b[0]).filter(([,total])=>total>0).map(([tarifa,total])=>({tarifa,total,...vatOf(total,tarifa)}));
  return {rows,base:sumMoney(rows.map(row=>row.base)),iva:sumMoney(rows.map(row=>row.iva)),total:sumMoney(rows.map(row=>row.total))};
}
const laborLines=sale=>{const lines=sale?.labor||sale?.mano_obra||sale?.servicios||[];return Array.isArray(lines)?lines:[]};
/** IVA vigente de una venta registrada con IVA (descuenta devoluciones; anulada = 0). null si no tiene IVA. */
export function saleVat(sale){
  if(!sale?.iva)return null;
  if(sale.anulada)return vatBreakdown([]);
  const groups=[];
  for(const line of Array.isArray(sale.detalles)?sale.detalles:[]){const retained=Math.max(0,finite(line.cantidad)-finite(line.devuelto));if(line.tarifa_iva!=null)groups.push({tarifa:line.tarifa_iva,total:roundMoney(retained*finite(line.precio_unitario))})}
  const labor=sumMoney(laborLines(sale).map(line=>roundMoney(finite(line.importe??line.valor??line.precio))));
  const laborNet=Math.max(0,roundMoney(labor-finite(sale.laborRefund??sale.devolucion_mano_obra)));
  if(sale.iva.tarifa_mano_obra!=null&&laborNet>0)groups.push({tarifa:sale.iva.tarifa_mano_obra,total:laborNet});
  return vatBreakdown(groups);
}
/** Descuentos vigentes de una venta (unidades no devueltas; anulada = 0). */
export function saleDiscounts(sale){
  if(!sale||sale.anulada)return 0;
  return sumMoney((Array.isArray(sale.detalles)?sale.detalles:[]).map(line=>roundMoney(Math.max(0,finite(line.cantidad)-finite(line.devuelto))*Math.max(0,finite(line.descuento)))));
}

/** Valida pagos [{method, amount}] cuya suma debe ser el total. Devuelve la lista limpia. */
export function normalizePayments(payments,total,{allow=[]}={}){
  if(!Array.isArray(payments)||!payments.length||payments.length>MAX_PAYMENTS)fail('Registra entre 1 y '+MAX_PAYMENTS+' pagos.');
  const clean=[],allowed=[...PAYMENT_KEYS,...allow];
  for(const payment of payments){
    if(!payment||typeof payment!=='object'||!allowed.includes(payment.method))fail('Selecciona efectivo, transferencia, tarjeta, Nequi'+(allow.includes(CREDIT_METHOD)?', Daviplata o crédito':' o Daviplata')+' en cada pago.');
    let amount;try{amount=moneyAmount(payment.amount,'Pago con '+paymentLabel(payment.method))}catch(error){fail(error.message)}
    if(amount===0&&payments.length>1)continue;
    const same=clean.find(item=>item.method===payment.method);
    if(same)same.amount=sumMoney([same.amount,amount]);else clean.push({method:payment.method,amount});
  }
  if(!clean.length)fail('Registra al menos un pago.');
  const paid=sumMoney(clean.map(item=>item.amount));
  if(paid!==roundMoney(total))fail(`Los pagos suman ${paid} y el total de la venta es ${roundMoney(total)}. Ajusta los valores para que coincidan.`,400,'PAYMENT_MISMATCH');
  return clean;
}
/** Medio principal: el de mayor monto (en empate, el primero). */
export function primaryMethod(payments){let best=null;for(const payment of payments||[])if(!best||finite(payment.amount)>finite(best.amount))best=payment;return best?.method||''}
/** Pagos de una venta; las ventas antiguas sin payments cuentan con su paymentMethod. */
export function salePayments(sale){
  const list=Array.isArray(sale?.payments)?sale.payments.filter(p=>SALE_PAYMENT_KEYS.includes(p?.method)&&Number.isFinite(Number(p.amount))):[];
  if(list.length)return list.map(p=>({method:p.method,amount:roundMoney(Number(p.amount))}));
  const method=sale?.paymentMethod||sale?.medio_pago;
  return SALE_PAYMENT_KEYS.includes(method)?[{method,amount:roundMoney(finite(sale.total))}]:[];
}
/**
 * Reparte el valor vigente (neto) de una venta entre sus medios de pago, en proporción a lo
 * pagado con cada uno. El medio principal absorbe el redondeo. {} si no hay medio válido.
 */
export function allocatePayments(sale,net){
  const payments=salePayments(sale),value=roundMoney(Math.max(0,finite(net)));
  if(!payments.length)return {};
  if(payments.length===1)return {[payments[0].method]:value};
  const paid=sumMoney(payments.map(p=>p.amount)),main=primaryMethod(payments),result={};
  for(const payment of payments)if(payment.method!==main)result[payment.method]=sumMoney([result[payment.method]||0,paid>0?roundMoney(value*payment.amount/paid):0]);
  result[main]=roundMoney(value-sumMoney(Object.values(result)));
  return result;
}
export function paymentSummary(sale){const payments=salePayments(sale);return payments.length>1?payments.map(p=>paymentLabel(p.method)+' '+p.amount).join(' + '):paymentLabel(payments[0]?.method||sale?.paymentMethod)}
/** Vueltas del efectivo (null si no se registró lo recibido). */
export function cashChange(received,cashAmount){
  if(received===''||received==null||!Number.isFinite(Number(received)))return null;
  return roundMoney(Number(received)-finite(cashAmount));
}

/** Precios especiales del producto (mecánico/mayorista). Devuelve undefined si no hay. */
export function cleanProductPrices(form,old){
  const read=key=>has(form?.precios,key)?form.precios[key]:has(form,'precio_'+key)?form['precio_'+key]:undefined;
  const supplied=['mecanico','mayorista'].some(key=>read(key)!==undefined);
  if(!supplied){const kept=Object.fromEntries(['mecanico','mayorista'].filter(key=>old?.precios?.[key]!=null).map(key=>[key,old.precios[key]]));return Object.keys(kept).length?kept:undefined}
  const result={};
  for(const key of ['mecanico','mayorista']){
    const value=read(key);
    if(value===undefined){if(old?.precios?.[key]!=null)result[key]=old.precios[key];continue}
    if(value===''||value===null)continue;
    try{result[key]=moneyAmount(value,'Precio '+customerTypeLabel(key).toLowerCase())}catch(error){fail(error.message)}
  }
  return Object.keys(result).length?result:undefined;
}
