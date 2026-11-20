import {reportDate,salesReport} from './admin-reports.mjs';
const list=v=>Array.isArray(v)?v:[];
const amount=v=>Number.isFinite(Number(v))?Math.max(0,Number(v)):0;
const round=v=>Math.round((v+Number.EPSILON)*100)/100;
const validPercentage=v=>v!==null&&v!==undefined&&v!==''&&['number','string'].includes(typeof v)&&Number.isFinite(Number(v))&&Number(v)>=0&&Number(v)<=100;

/** Historical snapshots only. Unallocated multi-line refunds remain unknown. */
export function laborReport(business={},filters={}){
 const sales=salesReport(business,filters),allowed=new Set(sales.rows.map(row=>row.id)),rows=[];
 for(const sale of list(business.ventas)){
  if(!allowed.has(String(sale.id??'')))continue;
  const lines=list(sale.labor||sale.mano_obra||sale.servicios),gross=lines.reduce((n,l)=>n+amount(l.importe??l.valor??l.precio),0);
  const refund=Math.min(gross,amount(sale.laborRefund??sale.devolucion_mano_obra));
  for(const [index,line] of lines.entries()){
   const charged=amount(line.importe??line.valor??line.precio),net=sale.anulada||refund===gross&&refund>0?0:refund===0?charged:lines.length===1?round(charged-refund):null;
   const percentage=validPercentage(line.mecanicoPorcentaje)?Number(line.mecanicoPorcentaje):null;
   const mechanicAmount=net===0?0:net!==null&&percentage!==null?round(net*percentage/100):null;
   rows.push({id:String(sale.id)+':'+index,saleId:String(sale.id),date:reportDate(sale.fecha),plate:String(sale.placa||''),customer:String(sale.cliente||'Cliente general'),
    description:String(line.descripcion||line.descripcion_trabajo||'Servicio'),mechanicId:line.mecanicoId||null,mechanic:String(line.mecanico||'Sin identificar'),
    status:sale.anulada?'Anulado':refund?'Con devolución':'Vigente',cancelled:!!sale.anulada,gross:charged,net,percentage,mechanicAmount,
    businessAmount:mechanicAmount===null?null:round(net-mechanicAmount),allocationComplete:net!==null,splitComplete:mechanicAmount!==null});
  }
 }
 const included=rows.filter(row=>!row.cancelled),lineNet=included.reduce((n,row)=>n+(row.net??0),0);
 const complete=included.every(row=>row.splitComplete)&&Math.abs(lineNet-sales.totals.labor)<0.01;
 const mechanicAmount=complete?round(included.reduce((n,row)=>n+row.mechanicAmount,0)):null;
 return {kind:'labor',from:sales.from,to:sales.to,rows,totals:{services:included.length,net:sales.totals.labor,splitComplete:complete,
  mechanicAmount,businessAmount:complete?round(sales.totals.labor-mechanicAmount):null,missingPercentages:included.filter(row=>row.net!==0&&row.percentage===null).length,
  unallocatedRefunds:included.filter(row=>!row.allocationComplete).length}};
}
export function mechanicLaborActivity(report,mechanic){
 const rows=report.rows.filter(row=>row.mechanicId===mechanic.id&&!row.cancelled),complete=rows.every(row=>row.splitComplete),allocated=rows.every(row=>row.allocationComplete);
 const sum=key=>round(rows.reduce((n,row)=>n+(row[key]||0),0));
 return {rows,jobs:rows.length,amount:allocated?sum('net'):null,mechanicAmount:complete?sum('mechanicAmount'):null,businessAmount:complete?sum('businessAmount'):null,allocationComplete:allocated,splitComplete:complete};
}
