import React,{useId,useMemo,useReducer,useState} from 'react';
import {formatCOP,formatNumber,formatPercent,formatDate} from './format.mjs';
import {overviewReport} from '../overview-report.mjs';
import OverviewDateFilter from './OverviewDateFilter.jsx';
import {initialOverviewDates,overviewDatesReducer,overviewRankingRows} from './overview-filters.mjs';
import ExcelButton from './ExcelButton.jsx';
import LaborTable from './LaborTable.jsx';
import './overview-panel.css';

const money=formatCOP,amount=formatNumber,percent=formatPercent;
const dateLabel=value=>formatDate(value,'');
const rankingNames={mostSold:'Más vendidos',leastSold:'Menos vendidos',mostProfit:'Mayor ganancia',leastProfit:'Menor ganancia',noSales:'SIN VENTAS'};
const tools=[['cash','Cierre de caja'],['reports','Reportes y exportaciones'],['replenishment','Preparar reposición'],['mechanics','Mecánicos']];
const productColumns=[['name','PRODUCTO'],['netUnits','UNIDADES NETAS'],['netRevenue','VENTA NETA','#,##0.00'],['profit','GANANCIA DE PRODUCTOS','#,##0.00'],['costComplete','COSTO COMPLETO']];
function Metric({label,value,help,primary=false}){return <section className={`ov-metric${primary?' ov-metric-primary':''}`}><h2>{label}</h2><strong>{value}</strong>{help&&<p>{help}</p>}</section>}

export default function OverviewPanel({data={},session=data.session||{},onOpenAdmin,onProduct,onSales,now=Date.now()}){
 const [dates,dispatchDates]=useReducer(overviewDatesReducer,now,initialOverviewDates),[ranking,setRanking]=useState('mostSold'),[limit,setLimit]=useState(10),[noSalesLimit,setNoSalesLimit]=useState(10);
 const range=dates.range,rankingId=useId();
 const report=useMemo(()=>{try{return {value:overviewReport(data.state||data.business||{},range),error:''}}catch(error){return {value:null,error:error.message||'Revisa el rango de fechas.'}}},[data.state,data.business,range.from,range.to]);
 const allowed=session.role==='admin'||session.role==='owner'&&!!session.companyId;
 if(!allowed)return <p className="ov-access" role="alert">El resumen general está disponible para el administrador de la empresa.</p>;
 const overview=report.value,totals=overview?.totals||{},products=overview?.products||[],noSales=overview?.noSales||[],noSalesMode=ranking==='noSales',ranked=overviewRankingRows(overview,ranking,noSalesLimit);
 const profitRanking=ranking==='mostProfit'||ranking==='leastProfit';
 const changeDates=action=>{const next=overviewDatesReducer(dates,action);dispatchDates(action);if(action.type==='clear'||action.type==='apply'&&!next.error){setLimit(10);setNoSalesLimit(10)}};
 const period=!range.from&&!range.to?'Todo el historial':range.from===range.to?dateLabel(range.from):`${dateLabel(range.from)} al ${dateLabel(range.to)}`;
 const productButton=product=>product.currentCatalog!==false&&typeof onProduct==='function'?<button type="button" className="ov-product-button" onClick={()=>onProduct(product)}>{product.name}</button>:<strong>{product.name}</strong>;
 const rankingExport=(noSalesMode?noSales:ranked).map(row=>({...row,netUnits:noSalesMode?0:row.netUnits}));
 const rankingColumns=[['name','PRODUCTO'],profitRanking?['profit','GANANCIA','#,##0.00']:['netUnits','UNIDADES NETAS']];
 return <section className="ov-panel" aria-label="Resumen general del negocio">
  <header className="ov-heading"><h1>RESUMEN GENERAL</h1><details className="ov-menu"><summary>Administración <span aria-hidden="true">⋯</span></summary><div>{tools.map(([view,label])=><button type="button" key={view} onClick={event=>{event.currentTarget.closest('details').open=false;onOpenAdmin?.(view)}}>{label}</button>)}</div></details></header>
  <div className="ov-filter-toolbar"><OverviewDateFilter state={dates} dispatch={changeDates}/></div>
  {report.error?<p className="ov-error" role="alert">{report.error}</p>:<>
   <p className="ov-period" role="status">Período: <strong>{period}</strong></p>
   <div className="ov-metrics"><Metric primary label="VENTAS NETAS TOTALES" value={money(totals.net)} help="Productos y mano de obra"/><Metric label="VENTA DE PRODUCTOS" value={money(totals.products)} help={`${amount(totals.productUnits)} unidades netas`}/><Metric label="MANO DE OBRA FACTURADA" value={money(totals.labor)} help={`${amount(totals.laborServices)} ${totals.laborServices===1?'servicio registrado':'servicios registrados'}`}/></div>
   <div className="ov-detail-grid"><section className="ov-card ov-ranking"><div className="ov-card-heading"><h2>PRODUCTOS DESTACADOS</h2></div><label className="ov-ranking-picker" htmlFor={rankingId}>Ordenar por<select id={rankingId} value={ranking} onChange={event=>{setRanking(event.target.value);setNoSalesLimit(10)}}>{Object.entries(rankingNames).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
   {profitRanking&&<p className="ov-note">Ganancia en dinero, entre productos con costo histórico completo.</p>}{noSalesMode&&<p className="ov-note">Catálogo actual sin unidades netas vendidas en este período.</p>}
   {ranked.length?<ol className="ov-ranking-list">{ranked.map(product=><li key={product.id}><span>{productButton(product)}</span><strong className={profitRanking&&Number(product.profit)<0?'ov-negative':''}>{noSalesMode?'0 unidades':profitRanking?money(product.profit):`${amount(product.netUnits)} ${product.netUnits===1?'unidad':'unidades'}`}</strong></li>)}</ol>:<p className="ov-empty">{noSalesMode?'No hay productos sin ventas netas en esta consulta.':profitRanking?'No hay productos vendidos con costo completo para este ranking.':'No hay productos con ventas netas en este período.'}</p>}
   {noSalesMode&&noSales.length>noSalesLimit&&<button type="button" className="ov-more" onClick={()=>setNoSalesLimit(value=>value+10)}>Ver más productos sin ventas</button>}
   <ExcelButton options={{title:'PRODUCTOS DESTACADOS',columns:rankingColumns,rows:rankingExport,...range}} name={'SCORTA-'+rankingNames[ranking]}/></section>
    <section className="ov-card ov-products"><div className="ov-card-heading"><h2>QUÉ VENDIMOS</h2>{onSales&&<button type="button" className="ov-text-button" onClick={()=>onSales(range)}>Ver ventas</button>}</div>
    {!products.length?<p className="ov-empty">No se vendieron productos en estas fechas.</p>:<><div className="ov-table-wrap"><table className="ov-table"><thead><tr><th>PRODUCTO</th><th>UNIDADES NETAS</th><th>VENTA NETA</th><th>GANANCIA DE PRODUCTOS</th></tr></thead><tbody>{products.slice(0,limit).map(product=><tr key={product.id}><td data-label="PRODUCTO">{productButton(product)}</td><td data-label="UNIDADES NETAS">{amount(product.netUnits)}</td><td data-label="VENTA NETA">{money(product.netRevenue)}</td><td data-label="GANANCIA DE PRODUCTOS">{!product.costComplete?<span className="ov-incomplete">Sin costo completo</span>:<strong className={Number(product.profit)<0?'ov-negative':''}>{money(product.profit)}</strong>}</td></tr>)}</tbody></table></div>{products.length>limit&&<button type="button" className="ov-more" onClick={()=>setLimit(value=>value+10)}>Ver más productos</button>}</>}
    <ExcelButton options={{title:'QUÉ VENDIMOS',columns:productColumns,rows:products,...range}} name="SCORTA-productos-vendidos"/></section></div>
   <LaborTable key={range.from+':'+range.to} rows={(overview?.labor?.rows||[]).filter(row=>!row.cancelled)} {...range}/>
   <section className="ov-profit" aria-label="Ganancias del período"><div className="ov-profit-heading"><h2>GANANCIAS DEL PERÍODO</h2><p>{period}</p></div><div className="ov-profit-grid">
    <div><h3>GANANCIA EN PRODUCTOS</h3>{totals.costComplete===false?<strong className="ov-incomplete">Sin costo histórico completo</strong>:<><strong className={Number(totals.productProfit)<0?'ov-negative':''}>{money(totals.productProfit)}</strong><small>Margen: <b>{percent(totals.productMarginPercent)}</b></small></>}</div>
    <div><h3>GANANCIA EN MANO DE OBRA</h3>{totals.laborSplitComplete===false?<strong className="ov-incomplete">Reparto pendiente</strong>:<strong>{money(totals.laborProfit)}</strong>}<small>Parte del negocio</small></div>
    <div className="ov-grand-profit"><h3>GANANCIA TOTAL GENERAL</h3>{totals.totalProfit===null?<strong className="ov-incomplete">No calculable con los datos disponibles</strong>:<strong className={Number(totals.totalProfit)<0?'ov-negative':''}>{money(totals.totalProfit)}</strong>}</div>
   </div>{totals.costComplete===false&&<p className="ov-profit-note">Falta costo histórico en {amount(totals.unknownCostLines)} líneas. La ganancia total no se puede calcular.</p>}{totals.laborSplitComplete===false&&<p className="ov-profit-note">Hay servicios sin porcentaje histórico o devoluciones sin desglose. Completa el reparto antes de calcular la ganancia general.</p>}</section>
  </>}
 </section>;
}
