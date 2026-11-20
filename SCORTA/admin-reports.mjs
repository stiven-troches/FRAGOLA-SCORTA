// Pure administrator queries. No mutation, storage, current-price reconstruction
// of historical costs, or exposure of raw documents/credentials in exports.
const methods=['efectivo','transferencia','tarjeta'];
const array=value=>Array.isArray(value)?value:[];
const number=value=>Number.isFinite(Number(value))?Number(value):0;
const nonnegative=value=>Math.max(0,number(value));
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
  if(lines.length)return lines.reduce((sum,line)=>sum+nonnegative(line.importe??line.valor??line.precio),0);
  return nonnegative(sale.subtotal_mano_obra??sale.costo_mano_obra??sale.laborTotal);
}
function saleRow(sale){
  const details=array(sale.detalles),cancelled=!!sale.anulada;
  let grossProducts=0,productReturns=0,knownProductCost=0,unknownCostLines=0;
  for(const line of details){
    const quantity=nonnegative(line.cantidad),price=nonnegative(line.precio_unitario),returned=Math.min(quantity,nonnegative(line.devuelto));
    grossProducts+=quantity*price;productReturns+=returned*price;
    const retained=cancelled?0:quantity-returned;
    if(retained>0){if(hasNumber(line.costo_unitario))knownProductCost+=retained*Number(line.costo_unitario);else unknownCostLines++}
  }
  const grossLabor=originalLabor(sale),laborReturns=Math.min(grossLabor,nonnegative(sale.laborRefund??sale.devolucion_mano_obra));
  const gross=hasNumber(sale.total)?Number(sale.total):grossProducts+grossLabor;
  // A full cancellation takes priority over any prior partial returns so the
  // gross - returns - cancellations reconciliation never deducts them twice.
  const returns=cancelled?0:Math.min(gross,productReturns+laborReturns),cancellations=cancelled?gross:0;
  const products=cancelled?0:Math.max(0,grossProducts-productReturns),labor=cancelled?0:Math.max(0,grossLabor-laborReturns);
  const marginComplete=unknownCostLines===0;
  return {id:string(sale.id),date:reportDate(sale.fecha),seller:string(sale.usuario||sale.sellerName||'Sin usuario'),
    customer:string(sale.cliente||'Cliente general'),plate:string(sale.placa),paymentMethod:string(sale.paymentMethod||sale.medio_pago),
    status:cancelled?'Anulada':returns>0?'Con devolución':'Vigente',cancelled,
    gross,returns,cancellations,net:Math.max(0,gross-returns-cancellations),products,labor,
    productCost:marginComplete?knownProductCost:null,knownProductCost,productMargin:marginComplete?products-knownProductCost:null,marginComplete,unknownCostLines};
}
function salesTotals(rows){
  const totals={count:rows.length,gross:0,returns:0,cancellations:0,net:0,products:0,labor:0,productCost:0,knownProductCost:0,productMargin:0,marginComplete:true,unknownCostLines:0};
  for(const row of rows){
    for(const key of ['gross','returns','cancellations','net','products','labor','knownProductCost','unknownCostLines'])totals[key]+=row[key];
    if(!row.marginComplete)totals.marginComplete=false;
  }
  totals.productCost=totals.marginComplete?totals.knownProductCost:null;
  totals.productMargin=totals.marginComplete?totals.products-totals.knownProductCost:null;
  return totals;
}
export function salesReport(business={},filters={}){
  const range=period(filters),rows=array(business.ventas).map(saleRow).filter(row=>inPeriod(row.date,range));
  const paymentTotals={efectivo:0,transferencia:0,tarjeta:0};let unknownPaymentCount=0;
  for(const row of rows){if(methods.includes(row.paymentMethod))paymentTotals[row.paymentMethod]+=row.net;else if(row.net>0)unknownPaymentCount++}
  const sellers=new Map();for(const row of rows){const group=sellers.get(row.seller)||[];group.push(row);sellers.set(row.seller,group)}
  return {kind:'sales',basis:'sale_date_current_net',...range,rows,totals:salesTotals(rows),paymentTotals,unknownPaymentCount,
    bySeller:[...sellers].map(([seller,entries])=>({seller,...salesTotals(entries)}))};
}
export function cashExpected(business,date){if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!reportDate(date))fail('Selecciona el día del cierre.');return salesReport(business,{from:date,to:date}).paymentTotals}

export function mechanicReport(business={},filters={}){
  const range=period(filters),groups=new Map(),totals={services:0,gross:0,returns:0,net:0};
  const normalize=value=>string(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  for(const sale of array(business.ventas)){
    if(sale.anulada||!inPeriod(reportDate(sale.fecha),range))continue;
    // Service records mirror their sale: count only the labor snapshots on ventas.
    const lines=array(sale.labor||sale.mano_obra||sale.servicios);if(!lines.length)continue;
    const keys=lines.map(line=>line.mecanicoId||'legacy:'+normalize(line.mecanico||'Sin identificar'));
    const gross=lines.reduce((sum,line)=>sum+nonnegative(line.importe??line.valor??line.precio),0);
    const refunded=Math.min(gross,nonnegative(sale.laborRefund??sale.devolucion_mano_obra));
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
    const gross=hasNumber(purchase.total)?Number(purchase.total):array(purchase.detalles).reduce((sum,line)=>sum+nonnegative(line.cantidad)*nonnegative(line.precio_unitario),0),cancelled=!!purchase.anulada;
    const supplier=string(purchase.proveedor||'Sin especificar');
    return {id:string(purchase.id),date:reportDate(purchase.fecha),supplier,provider:supplier,user:string(purchase.usuario||'Sin usuario'),
      status:cancelled?'Anulada':'Vigente',cancelled,gross,total:gross,cancellations:cancelled?gross:0,net:cancelled?0:gross};
  }).filter(row=>inPeriod(row.date,range));
  const totals=rows.reduce((sum,row)=>({count:sum.count+1,gross:sum.gross+row.gross,cancellations:sum.cancellations+row.cancellations,net:sum.net+row.net}),{count:0,gross:0,cancellations:0,net:0});
  return {kind:'purchases',basis:'purchase_date_current_net',...range,rows,totals:{...totals,total:totals.gross}};
}
export function inventoryReport(business={}){
  const rows=array(business.prods).map(product=>{
    const stock=nonnegative(product.stock),cost=hasNumber(product.precio_compra)?Number(product.precio_compra):null;
    return {id:string(product.id),name:string(product.nombre),category:string(product.categoria||'General'),reference:string(product.referencia),
      stock,minimum:nonnegative(product.stock_minimo),purchaseCost:cost,purchasePrice:cost,salePrice:hasNumber(product.precio_venta)?Number(product.precio_venta):null,
      stockValue:stock===0?0:cost===null?null:stock*cost};
  });
  const costComplete=rows.every(row=>row.stockValue!==null),units=rows.reduce((sum,row)=>sum+row.stock,0);
  return {kind:'inventory',basis:'current',rows,totals:{products:rows.length,units,stockValue:costComplete?rows.reduce((sum,row)=>sum+row.stockValue,0):null,costComplete}};
}
export function replenishmentReport(business={}){
  const rows=inventoryReport(business).rows.filter(row=>row.stock<=row.minimum).map(row=>({...row,suggestedQty:Math.max(0,row.minimum+1-row.stock),stockStatus:row.stock===0?'agotado':'minimo'}));
  return {kind:'replenishment',basis:'current',rows,totals:{products:rows.length,suggestedUnits:rows.reduce((sum,row)=>sum+row.suggestedQty,0)}};
}

// Explicit allowlists avoid accidentally exporting nested state, credentials,
// receipt tokens, support messages or customer contact data.
const schemas={
  sales:[['id','Documento'],['date','Fecha'],['seller','Vendedor'],['customer','Cliente'],['plate','Placa'],['paymentMethod','Medio de pago'],['status','Estado'],['gross','Venta original'],['returns','Devoluciones'],['cancellations','Anulaciones'],['net','Venta neta'],['products','Productos netos'],['labor','Mano de obra neta'],['productCost','Costo histórico productos'],['productMargin','Margen productos'],['marginComplete','Costo completo']],
  purchases:[['id','Documento'],['date','Fecha'],['supplier','Proveedor'],['user','Usuario'],['status','Estado'],['gross','Compra original'],['cancellations','Anulaciones'],['net','Compra neta']],
  inventory:[['id','Producto ID'],['name','Producto'],['reference','Referencia'],['category','Categoría'],['stock','Existencia actual'],['minimum','Mínimo'],['purchaseCost','Costo actual'],['salePrice','Precio venta'],['stockValue','Valor existencia actual']],
  replenishment:[['id','Producto ID'],['name','Producto'],['reference','Referencia'],['category','Categoría'],['stock','Existencia actual'],['minimum','Mínimo'],['stockStatus','Estado'],['suggestedQty','Sugerencia para superar mínimo']]
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
