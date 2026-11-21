import {financialSales} from './financial-sales.mjs';
import {roundMoney,sumMoney} from './money.mjs';
import {SALE_PAYMENT_KEYS,BASE_PAYMENT_KEYS,LAYAWAY_METHOD,allocatePayments,paymentSummary,paymentLabel,saleDiscounts,saleVat,salePayments,vatOf} from './sale-pricing.mjs';
import {cashBook,creditAccounts,portfolioSummary,creditPaymentsIn} from './caja-credito.mjs';
import {WARRANTY_COLUMNS,warrantyReport} from './garantias.mjs';
import {PAYABLE_COLUMNS,payablesReport} from './compras-proveedores.mjs';
export {warrantyReport,payablesReport};
// Pure administrator queries. No mutation, storage, current-price reconstruction
// of historical costs, or exposure of raw documents/credentials in exports.
// BE-16 / BE-34: los reportes reparten también el crédito y los anticipos de separados.
const methods=SALE_PAYMENT_KEYS;
const array=value=>Array.isArray(value)?value:[];
const number=value=>Number.isFinite(Number(value))?Number(value):0;
const nonnegative=value=>Math.max(0,number(value));
const monetary=value=>roundMoney(nonnegative(value));
const string=value=>typeof value==='string'?value:value==null?'':String(value);
const hasNumber=value=>(typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value))&&Number(value)>=0;
const fail=message=>{throw Object.assign(Error(message),{status:400,code:'INVALID_REPORT_PERIOD'})};
export function reportDate(value){
  if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)){
    const time=Date.parse(value+'T12:00:00Z');
    return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value?value:'';
  }
  if(!value)return '';
  const date=new Date(value);
  return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(date):'';
}
function period({from='',to=''}={}){
  if(from!=null&&from!==''&&(typeof from!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(from)||!reportDate(from)))fail('Selecciona una fecha inicial válida.');
  if(to!=null&&to!==''&&(typeof to!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(to)||!reportDate(to)))fail('Selecciona una fecha final válida.');
  if(from&&to&&from>to)fail('La fecha inicial no puede ser posterior a la final.');
  return {from:from||'',to:to||''};
}
const inPeriod=(date,range)=>!!date&&(!range.from||date>=range.from)&&(!range.to||date<=range.to);
function originalLabor(sale){
  const lines=array(sale.labor||sale.mano_obra||sale.servicios);
  if(lines.length)return lines.reduce((sum,line)=>sum+monetary(line.importe??line.valor??line.precio),0);
  return monetary(sale.subtotal_mano_obra??sale.costo_mano_obra??sale.laborTotal);
}
function saleRow(sale){
  const details=array(sale.detalles),cancelled=!!sale.anulada;
  let grossProducts=0,productReturns=0,knownProductCost=0,unknownCostLines=0,productVat=0;
  for(const line of details){
    const quantity=nonnegative(line.cantidad),price=monetary(line.precio_unitario),returned=Math.min(quantity,nonnegative(line.devuelto));
    grossProducts+=quantity*price;productReturns+=returned*price;
    const retained=cancelled?0:quantity-returned;
    if(retained>0){if(hasNumber(line.costo_unitario))knownProductCost+=retained*roundMoney(line.costo_unitario);else unknownCostLines++}
    // BE-18: el IVA cobrado no es utilidad; la ganancia en productos usa la base sin IVA.
    if(retained>0&&sale.iva&&line.tarifa_iva!=null)productVat+=vatOf(retained*price,line.tarifa_iva).iva;
  }
  const grossLabor=originalLabor(sale),laborReturns=Math.min(grossLabor,monetary(sale.laborRefund??sale.devolucion_mano_obra));
  const gross=hasNumber(sale.total)?roundMoney(sale.total):roundMoney(grossProducts+grossLabor);
  // A full cancellation takes priority over any prior partial returns so the
  // gross - returns - cancellations reconciliation never deducts them twice.
  const returns=cancelled?0:Math.min(gross,productReturns+laborReturns),cancellations=cancelled?gross:0;
  const products=cancelled?0:Math.max(0,grossProducts-productReturns),labor=cancelled?0:Math.max(0,grossLabor-laborReturns);
  const marginComplete=unknownCostLines===0,net=roundMoney(Math.max(0,gross-returns-cancellations));
  // FE-06: el valor vigente se reparte entre los medios con que se pagó (ventas antiguas: su paymentMethod).
  const payments=allocatePayments(sale,net),vat=saleVat(sale);
  return {id:string(sale.id),date:reportDate(sale.fecha),seller:string(sale.usuario||sale.sellerName||'Sin usuario'),
    customer:string(sale.cliente||'Cliente general'),plate:string(sale.placa),paymentMethod:string(sale.paymentMethod||sale.medio_pago),
    status:cancelled?'Anulada':returns>0?'Con devolución':'Vigente',cancelled,
    gross:roundMoney(gross),returns:roundMoney(returns),cancellations:roundMoney(cancellations),net,products:roundMoney(products),labor:roundMoney(labor),
    discounts:saleDiscounts(sale),vat:vat?vat.iva:0,productVat:roundMoney(productVat),payments,paymentDetail:salePayments(sale).length>1?paymentSummary(sale):string(sale.paymentMethod||sale.medio_pago),
    productCost:marginComplete?roundMoney(knownProductCost):null,knownProductCost:roundMoney(knownProductCost),productMargin:marginComplete?roundMoney(products-roundMoney(productVat)-knownProductCost):null,marginComplete,unknownCostLines};
}
function salesTotals(rows){
  const totals={count:rows.length,gross:0,returns:0,cancellations:0,net:0,products:0,labor:0,discounts:0,vat:0,productVat:0,productCost:0,knownProductCost:0,productMargin:0,marginComplete:true,unknownCostLines:0};
  for(const row of rows){
    for(const key of ['gross','returns','cancellations','net','products','labor','discounts','vat','productVat','knownProductCost','unknownCostLines'])totals[key]=roundMoney(totals[key]+row[key]);
    if(!row.marginComplete)totals.marginComplete=false;
  }
  totals.productCost=totals.marginComplete?totals.knownProductCost:null;
  totals.productMargin=totals.marginComplete?roundMoney(totals.products-totals.productVat-totals.knownProductCost):null;
  return totals;
}
export function salesReport(business={},filters={}){
  const range=period(filters),rows=financialSales(business).map(saleRow).filter(row=>inPeriod(row.date,range));
  // The three original methods are always listed; Nequi/Daviplata appear once a sale uses them.
  const paymentTotals=Object.fromEntries(BASE_PAYMENT_KEYS.map(key=>[key,0]));let unknownPaymentCount=0;
  for(const row of rows){const entries=Object.entries(row.payments).filter(([key])=>methods.includes(key));if(!entries.length){if(row.net>0)unknownPaymentCount++;continue}for(const [key,value]of entries)paymentTotals[key]=roundMoney((paymentTotals[key]||0)+value)}
  const sellers=new Map();for(const row of rows){const group=sellers.get(row.seller)||[];group.push(row);sellers.set(row.seller,group)}
  // BE-16: ventas a crédito del periodo (causación: cuentan el día de la venta), abonos recibidos y cartera actual.
  const creditSales=roundMoney(array(business.ventas).filter(sale=>!sale.anulada&&sale.credito&&inPeriod(reportDate(sale.fecha),range)).reduce((sum,sale)=>sum+monetary(sale.credito.monto),0));
  const credit={sales:creditSales,payments:roundMoney(creditPaymentsIn(business,range).reduce((sum,p)=>sum+monetary(p.amount),0)),portfolio:portfolioSummary(creditAccounts(business,range.to||reportDate(new Date()))).saldo};
  return {kind:'sales',basis:'sale_date_current_net',...range,rows,totals:salesTotals(rows),paymentTotals,unknownPaymentCount,credit,
    bySeller:[...sellers].map(([seller,entries])=>({seller,...salesTotals(entries)}))};
}
export function cashExpected(business,date){if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!reportDate(date))fail('Selecciona el día del cierre.');return cashBook(business,date).expected}
/** BE-15: libro de caja de un día (base, ventas cobradas, abonos, separados, movimientos y devoluciones). */
export function cashDay(business,date){if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!reportDate(date))fail('Selecciona el día del cierre.');return cashBook(business,date)}
/** BE-16: cartera por cliente (saldo actual, vencido y antigüedad). */
export function portfolioReport(business={},today=reportDate(new Date())){
  const accounts=creditAccounts(business,today).filter(account=>account.saldo>0),summary=portfolioSummary(accounts);
  const rows=accounts.map(account=>({id:account.customerId,customer:account.nombre,phone:account.telefono,limit:account.creditLimit,balance:account.saldo,overdue:account.vencido,
    b0_30:account.antiguedad['0-30'],b31_60:account.antiguedad['31-60'],b61_90:account.antiguedad['61-90'],b90:account.antiguedad['+90'],invoices:account.facturas.filter(f=>f.saldo>0).length,oldest:account.facturas.find(f=>f.saldo>0)?.fecha||''}));
  return {kind:'portfolio',basis:'current',date:today,rows,totals:summary};
}
/** BE-16: abonos recibidos en el periodo (entran a la caja del día en que se pagan). */
export function creditPaymentReport(business={},filters={}){
  const range=period(filters),rows=creditPaymentsIn(business,range).map(p=>({id:string(p.id),date:p.fecha,customer:string(p.cliente),method:paymentLabel(p.method),amount:monetary(p.amount),user:string(p.usuario),invoices:array(p.aplicado).length}));
  return {kind:'creditPayments',basis:'payment_date',...range,rows,totals:{count:rows.length,amount:roundMoney(rows.reduce((sum,row)=>sum+row.amount,0))}};
}

export function mechanicReport(business={},filters={}){
  const range=period(filters),groups=new Map(),totals={services:0,gross:0,returns:0,net:0};
  const normalize=value=>string(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  for(const sale of financialSales(business)){
    if(sale.anulada||!inPeriod(reportDate(sale.fecha),range))continue;
    // Service records mirror their sale: count only the labor snapshots on ventas.
    const lines=array(sale.labor||sale.mano_obra||sale.servicios);if(!lines.length)continue;
    const keys=lines.map(line=>line.mecanicoId||'legacy:'+normalize(line.mecanico||'Sin identificar'));
    const gross=lines.reduce((sum,line)=>sum+monetary(line.importe??line.valor??line.precio),0);
    const refunded=Math.min(gross,monetary(sale.laborRefund??sale.devolucion_mano_obra));
    const unambiguous=new Set(keys).size===1;
    totals.services+=lines.length;totals.gross+=gross;totals.returns+=refunded;totals.net+=gross-refunded;
    for(let index=0;index<lines.length;index++){
      const line=lines[index],key=keys[index];let row=groups.get(key);
      if(!row){row={id:key,mechanicId:line.mecanicoId||null,mechanic:string(line.mecanico||'Sin identificar'),services:0,gross:0,returns:0,net:0,allocationComplete:true};groups.set(key,row)}
      row.services++;row.gross+=nonnegative(line.importe??line.valor??line.precio);
      if(refunded&&!unambiguous)row.allocationComplete=false;
    }
    if(refunded&&unambiguous)groups.get(keys[0]).returns+=refunded;
  }
  const rows=[...groups.values()].map(row=>({...row,returns:row.allocationComplete?row.returns:null,net:row.allocationComplete?row.gross-row.returns:null}));
  return {kind:'mechanics',basis:'sale_date_current_net',...range,rows,totals};
}

export function purchaseReport(business={},filters={}){
  const range=period(filters),rows=array(business.compras).map(purchase=>{
    const gross=hasNumber(purchase.total)?roundMoney(purchase.total):sumMoney(array(purchase.detalles).map(line=>roundMoney(nonnegative(line.cantidad)*nonnegative(line.precio_unitario)))),cancelled=!!purchase.anulada;
    const supplier=string(purchase.proveedor||'Sin especificar');
    return {id:string(purchase.id),date:reportDate(purchase.fecha),supplier,provider:supplier,user:string(purchase.usuario||'Sin usuario'),
      status:cancelled?'Anulada':'Vigente',cancelled,gross,total:gross,cancellations:cancelled?gross:0,net:cancelled?0:gross};
  }).filter(row=>inPeriod(row.date,range));
  const totals={count:rows.length,gross:sumMoney(rows.map(row=>row.gross)),cancellations:sumMoney(rows.map(row=>row.cancellations)),net:sumMoney(rows.map(row=>row.net))};
  return {kind:'purchases',basis:'purchase_date_current_net',...range,rows,totals:{...totals,total:totals.gross}};
}
export function inventoryReport(business={}){
  const rows=array(business.prods).map(product=>{
    // BE-34: las unidades separadas salen del stock disponible pero siguen siendo del almacén.
    const stock=nonnegative(product.stock),reserved=nonnegative(product.stock_reservado),owned=stock+reserved,cost=hasNumber(product.precio_compra)?Number(product.precio_compra):null;
    return {id:string(product.id),name:string(product.nombre),category:string(product.categoria||'General'),reference:string(product.referencia),
      stock,reserved,warranty:nonnegative(product.stock_garantia),minimum:nonnegative(product.stock_minimo),purchaseCost:cost,purchasePrice:cost,salePrice:hasNumber(product.precio_venta)?Number(product.precio_venta):null,
      priceMechanic:hasNumber(product.precios?.mecanico)?Number(product.precios.mecanico):null,priceWholesale:hasNumber(product.precios?.mayorista)?Number(product.precios.mayorista):null,vatRate:hasNumber(product.tarifa_iva)?Number(product.tarifa_iva):null,
      stockValue:owned===0?0:cost===null?null:roundMoney(owned*cost)};
  });
  const costComplete=rows.every(row=>row.stockValue!==null),units=rows.reduce((sum,row)=>sum+row.stock,0);
  return {kind:'inventory',basis:'current',rows,totals:{products:rows.length,units,stockValue:costComplete?sumMoney(rows.map(row=>row.stockValue)):null,costComplete}};
}
export function replenishmentReport(business={}){
  const rows=inventoryReport(business).rows.filter(row=>row.stock<=row.minimum).map(row=>({...row,suggestedQty:Math.max(0,row.minimum+1-row.stock),stockStatus:row.stock===0?'agotado':'minimo'}));
  return {kind:'replenishment',basis:'current',rows,totals:{products:rows.length,suggestedUnits:rows.reduce((sum,row)=>sum+row.suggestedQty,0)}};
}

// Explicit allowlists avoid accidentally exporting nested state, credentials,
// receipt tokens, support messages or customer contact data.
const schemas={
  sales:[['id','Documento'],['date','Fecha'],['seller','Vendedor'],['customer','Cliente'],['plate','Placa'],['paymentMethod','Medio de pago'],['paymentDetail','Pagos'],['status','Estado'],['gross','Venta original'],['returns','Devoluciones'],['cancellations','Anulaciones'],['net','Venta neta'],['discounts','Descuentos'],['vat','IVA'],['products','Productos netos'],['labor','Mano de obra neta'],['productCost','Costo histórico productos'],['productMargin','Margen productos'],['marginComplete','Costo completo']],
  purchases:[['id','Documento'],['date','Fecha'],['supplier','Proveedor'],['user','Usuario'],['status','Estado'],['gross','Compra original'],['cancellations','Anulaciones'],['net','Compra neta']],
  inventory:[['id','Producto ID'],['name','Producto'],['reference','Referencia'],['category','Categoría'],['stock','Existencia actual'],['reserved','Separadas'],['warranty','En garantía'],['minimum','Mínimo'],['purchaseCost','Costo actual'],['salePrice','Precio venta'],['priceMechanic','Precio mecánico'],['priceWholesale','Precio mayorista'],['vatRate','Tarifa IVA'],['stockValue','Valor existencia actual']],
  portfolio:[['customer','Cliente'],['phone','Teléfono'],['limit','Cupo'],['balance','Saldo'],['overdue','Vencido'],['b0_30','0-30 días'],['b31_60','31-60 días'],['b61_90','61-90 días'],['b90','Más de 90 días'],['invoices','Facturas pendientes'],['oldest','Factura más antigua']],
  creditPayments:[['id','Documento'],['date','Fecha'],['customer','Cliente'],['method','Medio de pago'],['amount','Abono'],['invoices','Facturas abonadas'],['user','Usuario']],
  replenishment:[['id','Producto ID'],['name','Producto'],['reference','Referencia'],['category','Categoría'],['stock','Existencia actual'],['minimum','Mínimo'],['stockStatus','Estado']],
  // BE-35 / BE-40: garantías del período y cuentas por pagar actuales.
  warranties:WARRANTY_COLUMNS,
  payables:PAYABLE_COLUMNS
};
export function csvCell(value){
  if(value===null||value===undefined)return '';
  if(typeof value==='number')return Number.isFinite(value)?String(value):'';
  if(typeof value==='boolean')return value?'Sí':'No';
  let safe=string(value);
  if(/^[\s\u0000-\u001f\u007f-\u009f]*[=+\-@]/u.test(safe))safe="'"+safe;
  return '"'+safe.replaceAll('"','""')+'"';
}
export function reportCSV(kind,report){
  const columns=schemas[kind];if(!columns)throw Error('Tipo de reporte no válido.');
  const rows=array(report?.rows),lines=[columns.map(([,label])=>csvCell(label)).join(',')];
  for(const row of rows)lines.push(columns.map(([key])=>csvCell(row[key])).join(','));
  return '\ufeff'+lines.join('\r\n')+'\r\n';
}

export function reportColumns(kind){if(!schemas[kind])throw Error('Tipo de reporte no válido.');return schemas[kind].map(([key,label])=>[key,label.toLocaleUpperCase('es')]);}
