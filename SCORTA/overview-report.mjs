import {salesReport,reportDate} from './admin-reports.mjs';
import {laborReport} from './labor-report.mjs';
import {financialSales} from './financial-sales.mjs';
import {roundMoney} from './money.mjs';
import {vatOf} from './sale-pricing.mjs';

const array=value=>Array.isArray(value)?value:[];
const text=value=>value==null?'':String(value);
const number=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
const hasCost=value=>(typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value))&&Number(value)>=0;
const normalize=value=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const dateFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'});
const inPeriod=(date,range)=>!!date&&(!range.from||date>=range.from)&&(!range.to||date<=range.to);
const percent=(profit,revenue)=>profit!==null&&revenue>0?profit/revenue*100:null;
const byName=(a,b)=>a.name.localeCompare(b.name,'es')||a.id.localeCompare(b.id,'es');
const rank=(rows,key,direction)=>[...rows].sort((a,b)=>direction*(a[key]-b[key])||byName(a,b)).slice(0,5);
const invalid=message=>{throw Object.assign(Error(message),{status:400,code:'INVALID_REPORT_PERIOD'})};

/** Calendar shortcuts in Bogotá. Week/month end today, rather than including future days. */
export function quickOverviewRange(key,now=Date.now()){
  const value=typeof now==='function'?now():now,date=new Date(value);
  if(!Number.isFinite(date.getTime()))invalid('La fecha de referencia no es válida.');
  const today=dateFormat.format(date),calendar=new Date(today+'T12:00:00Z');
  if(key==='today')return {from:today,to:today};
  if(key==='yesterday'){
    calendar.setUTCDate(calendar.getUTCDate()-1);
    const previous=calendar.toISOString().slice(0,10);return {from:previous,to:previous};
  }
  if(key==='week'){
    calendar.setUTCDate(calendar.getUTCDate()-((calendar.getUTCDay()+6)%7));
    return {from:calendar.toISOString().slice(0,10),to:today};
  }
  if(key==='month')return {from:today.slice(0,8)+'01',to:today};
  invalid('Selecciona Hoy, Ayer, Esta semana o Este mes.');
}

/**
 * Read-only period overview. Money follows the shared current-net/original-sale-date
 * report; historical unit costs come exclusively from each retained sale line.
 */
export function overviewReport(business={},filters={}){
  const report=salesReport(business,filters),labor=laborReport(business,filters),range={from:report.from,to:report.to};
  const catalog=new Map(array(business.prods).map(product=>[text(product.id),product]));
  const groups=new Map();let laborServices=0;
  for(const sale of financialSales(business)){
    const saleDate=reportDate(sale.fecha);if(!inPeriod(saleDate,range))continue;
    const cancelled=!!sale.anulada;
    if(!cancelled)laborServices+=array(sale.labor||sale.mano_obra||sale.servicios).length;
    for(const line of array(sale.detalles)){
      const sourceId=text(line.producto_id),id=sourceId||'legacy:'+normalize(line.nombre||'Producto sin identificar');
      const current=sourceId?catalog.get(sourceId):null;
      let row=groups.get(id);
      if(!row){
        row={id,name:text(line.nombre||current?.nombre||'Producto sin identificar'),reference:text(line.referencia||current?.referencia),
          grossUnits:0,returnedUnits:0,cancelledUnits:0,netUnits:0,netRevenue:0,vat:0,knownHistoricalCost:0,
          historicalCost:0,profit:0,marginPercent:null,costComplete:true,unknownCostLines:0,currentCatalog:!!current};
        groups.set(id,row);
      }
      const quantity=number(line.cantidad),returned=Math.min(quantity,number(line.devuelto)),retained=cancelled?0:quantity-returned;
      row.grossUnits+=quantity;row.returnedUnits+=cancelled?0:returned;row.cancelledUnits+=cancelled?quantity:0;
      row.netUnits+=retained;row.netRevenue+=retained*roundMoney(number(line.precio_unitario));
      // BE-18: el IVA incluido en el precio no es ganancia.
      if(retained>0&&sale.iva&&line.tarifa_iva!=null)row.vat+=vatOf(retained*roundMoney(number(line.precio_unitario)),line.tarifa_iva).iva;
      if(retained>0){
        if(hasCost(line.costo_unitario))row.knownHistoricalCost+=retained*roundMoney(line.costo_unitario);
        else{row.costComplete=false;row.unknownCostLines++}
      }
    }
  }
  const products=[...groups.values()].map(row=>({
    ...row,netRevenue:roundMoney(row.netRevenue),vat:roundMoney(row.vat),knownHistoricalCost:roundMoney(row.knownHistoricalCost),historicalCost:row.costComplete?roundMoney(row.knownHistoricalCost):null,
    profit:row.costComplete?roundMoney(row.netRevenue-row.vat-row.knownHistoricalCost):null,
    marginPercent:percent(row.costComplete?roundMoney(row.netRevenue-row.vat-row.knownHistoricalCost):null,roundMoney(row.netRevenue-row.vat))
  })).sort(byName);
  const sold=products.filter(row=>row.netUnits>0),rankable=sold.filter(row=>row.costComplete);
  const noSales=array(business.prods).filter(product=>!(groups.get(text(product.id))?.netUnits>0)).map(product=>({
    id:text(product.id),name:text(product.nombre||'Producto sin nombre'),reference:text(product.referencia),category:text(product.categoria||'General')
  })).sort(byName);
  const salesCount=report.rows.filter(row=>!row.cancelled&&row.net>0).length;
  return {
    kind:'overview',basis:report.basis,...range,
    countBasis:{sales:'noncancelled_positive_net',laborServices:'registered_lines_noncancelled_sales',noSales:'current_catalog_no_net_units'},
    totals:{net:report.totals.net,products:report.totals.products,labor:report.totals.labor,
      laborProfit:labor.totals.businessAmount,mechanicAmount:labor.totals.mechanicAmount,laborSplitComplete:labor.totals.splitComplete,
      totalProfit:report.totals.productMargin!==null&&labor.totals.businessAmount!==null?roundMoney(report.totals.productMargin+labor.totals.businessAmount):null,
      salesCount,averageSale:salesCount?roundMoney(report.totals.net/salesCount):0,laborServices,
      productUnits:products.reduce((total,row)=>total+row.netUnits,0),
      productProfit:report.totals.productMargin,productMarginPercent:percent(report.totals.productMargin,roundMoney(report.totals.products-report.totals.productVat)),
      costComplete:report.totals.marginComplete,unknownCostLines:report.totals.unknownCostLines,
      returns:report.totals.returns,cancellations:report.totals.cancellations,discounts:report.totals.discounts,vat:report.totals.vat},
    labor,products,rankings:{mostSold:rank(sold,'netUnits',-1),leastSold:rank(sold,'netUnits',1),
      mostProfit:rank(rankable,'profit',-1),leastProfit:rank(rankable,'profit',1)},noSales,
    incompleteCostProducts:sold.filter(row=>!row.costComplete).length,
    paymentTotals:report.paymentTotals,unknownPaymentCount:report.unknownPaymentCount
  };
}
