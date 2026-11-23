// BE-17 / BE-35 / BE-40: vistas «Cotizaciones», «Garantías» y «Proveedores» (órdenes de compra y
// cuentas por pagar) del espacio de la empresa. Celular primero: tarjetas apiladas, tablas con
// desplazamiento y botones de 44 px. Reutiliza los componentes de Caja/Cartera/Separados.
import MoneyInput from './MoneyInput.jsx';
import React,{useMemo,useState} from 'react';
import {money} from './format.mjs';
import {roundMoney,sumMoney} from '../money.mjs';
import * as venta from '../sale-pricing.mjs';
import {whatsappLink} from '../caja-credito.mjs';
import {QUOTE_STATUS,quoteStatus,quoteCounts} from '../cotizaciones.mjs';
import {WARRANTY_DECISIONS,WARRANTY_STATUS,WARRANTY_RESULTS,WARRANTY_COLUMNS,claimableUnits,warrantyTerm,warrantyReport} from '../garantias.mjs';
import {PO_STATUS,PAYABLE_COLUMNS,payablesReport,payablesSummary,replenishmentOrderItems} from '../compras-proveedores.mjs';
import {Field,Heading,Metric,Modal,MethodSelect,Status,todayBogota,useOperation} from './CajaCredito.jsx';
import {printVoucher,purchaseOrderMarkup,quoteMarkup,supplierPaymentMarkup,warrantyMarkup} from './voucher-ticket.mjs';
import ExcelButton from './ExcelButton.jsx';
import './caja-credito.css';
import './documentos-comerciales.css';

const humanDate=value=>{if(!value)return '—';const date=new Date(String(value).length===10?value+'T12:00:00Z':value);return Number.isNaN(date.getTime())?String(value):date.toLocaleDateString('es-CO',{timeZone:'America/Bogota',day:'numeric',month:'short',year:'numeric'})};
const norm=value=>String(value??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const validAmount=(value,{allowZero=false}={})=>{if(String(value??'').trim()==='')return null;const number=Number(value);return Number.isFinite(number)&&number>=0&&(allowZero||number>0)&&Math.abs(Math.round(number*100)-number*100)<1e-7&&number<=1e12?number:null};
const positiveInt=value=>{const number=Number(value);return Number.isSafeInteger(number)&&number>0?number:null};
/** WhatsApp con el número del contacto o, sin número, para elegir el chat al compartir. */
export const shareLink=(phone,message)=>whatsappLink(phone,message)||'https://wa.me/?text='+encodeURIComponent(message);
const columns=list=>list.map(([key,label])=>[key,label.toLocaleUpperCase('es')]);
function Tabs({items,value,onChange,label}){return <div className="cc-tabs" role="tablist" aria-label={label}>{items.map(([key,text,count])=><button key={key} type="button" role="tab" aria-selected={value===key} className={value===key?'is-active':''} onClick={()=>onChange(key)}>{text}{count!=null&&<b>{count}</b>}</button>)}</div>}
function Search({label,value,onChange,placeholder}){return <div className="cw-tools"><div className="cw-search"><input type="search" aria-label={label} placeholder={placeholder} value={value} onChange={event=>onChange(event.target.value)}/></div></div>}
function Empty({children}){return <div className="cw-card cw-empty"><p>{children}</p></div>}
const usePrint=op=>(markup,title)=>{if(!printVoucher(markup,title))op.setError('Permite abrir ventanas para imprimir o guardar como PDF.')};

// ---------------------------------------------------------------- Cotizaciones
export const quoteMessage=(quote,company={})=>[`Hola ${quote.cliente&&quote.cliente!=='Cliente general'?quote.cliente:''}, te compartimos la cotización ${quote.numero} de ${company.name||'nuestro almacén'}:`.replace('Hola ,','Hola,'),
 ...(quote.detalles||[]).map(line=>`• ${line.cantidad} × ${line.nombre}: ${money(roundMoney(line.cantidad*line.precio_unitario))}`),`Total: ${money(quote.total)}`,`Válida hasta el ${humanDate(quote.vence)}. Precios sujetos a disponibilidad.`].join('\n');
/** Vista previa de la conversión: precio actual por línea y stock disponible. */
export function quotePreview(quote,state={},admin=false){
 const prods=state.prods||[],settings=venta.saleSettings(state),card=quote.customerId?(state.customerDirectory||[]).find(c=>c.id===quote.customerId):null;
 const tipo=card?venta.customerType(card.tipo):admin?venta.customerType(quote.tipoCliente):'mostrador';
 const lines=(quote.detalles||[]).map(line=>{const product=prods.find(p=>p.id===line.producto_id);return {line,product,precio:product?line.precio_modificado??venta.listPrice(product,tipo,settings):0}});
 const missing=lines.filter(item=>!item.product).map(item=>item.line.nombre);
 const short=lines.filter(item=>item.product&&Number(item.product.stock)<item.line.cantidad).map(item=>({nombre:item.line.nombre,disponible:Number(item.product.stock)||0,solicitado:item.line.cantidad}));
 let changes=[],total=quote.total,error='';
 if(!missing.length){try{const priced=venta.priceLines(lines.map(item=>({nombre:item.line.nombre,precio:item.precio,cantidad:item.line.cantidad,descuento:item.line.descuentoLinea||null})),quote.descuentoVenta||null);changes=lines.map((item,index)=>({nombre:item.line.nombre,cantidad:item.line.cantidad,antes:item.line.precio_unitario,ahora:priced.lines[index].precio_unitario})).filter(item=>item.antes!==item.ahora);total=priced.subtotal}catch(failure){error=failure.message}}
 return {missing,short,changes,total,error,card};
}
const STATUS_TONE={vigente:'',vencida:'cw-tag-danger',convertida:'',anulada:''};
export function QuotesView({state={},session={},admin=false,company={},features=[],onAction,onRetryAction,onNewQuote,onOpenSale,focusId=null}){
 const op=useOperation(onAction,onRetryAction),[notice,setNotice]=useState(''),[filter,setFilter]=useState('vigente'),[query,setQuery]=useState(''),[dialog,setDialog]=useState(()=>{const quote=focusId&&(state.quotes||[]).find(q=>q.id===focusId);return quote?{type:'done',quote}:null});
 const today=todayBogota(),quotes=state.quotes||[],counts=quoteCounts(quotes,today),print=usePrint(op);
 const visible=quotes.filter(quote=>quoteStatus(quote,today)===filter&&(!query||norm([quote.numero,quote.cliente,quote.telefono].join(' ')).includes(norm(query))));
 const canCancel=quote=>quote.estado==='vigente'&&(admin||quote.userId===session.userId);
 const startConvert=quote=>{op.setError('');op.setFailure?.(null);setNotice('');setDialog({type:'convert',quote,method:'efectivo',received:'',accept:false})};
 const convert=async event=>{
  event.preventDefault();const quote=dialog.quote,preview=quotePreview(quote,state,admin),changes=op.failure?.code==='QUOTE_CHANGED'?op.failure.details?.changes||[]:preview.changes;
  if(preview.short.length){op.setError('No hay stock suficiente para convertir esta cotización.');return}
  if(changes.length&&!dialog.accept){op.setError('Los precios cambiaron. Marca «Acepto los precios actuales» para vender.');return}
  const received=String(dialog.received).trim();
  if(received!==''&&dialog.method==='efectivo'&&(validAmount(received,{allowZero:true})==null||Number(received)<preview.total)){op.setError(`El efectivo recibido debe cubrir ${money(preview.total)}.`);return}
  const result=await op.perform({type:'quote.convert',id:quote.id,form:{paymentMethod:dialog.method,...(changes.length?{aceptarCambios:true}:{}),...(received!==''&&dialog.method==='efectivo'?{efectivo_recibido:Number(received)}:{})}});
  if(result){const sale=(result.state?.ventas||[]).find(item=>item.id===result.document?.id);setNotice(`Cotización ${quote.numero} convertida en venta.${result.warning?' '+result.warning:''}`);setDialog(sale?{type:'converted',quote,sale}:null)}
 };
 const cancel=async event=>{event.preventDefault();if(!dialog.motivo.trim()){op.setError('Escribe el motivo de la anulación.');return}const result=await op.perform({type:'quote.cancel',id:dialog.quote.id,form:{motivo:dialog.motivo.trim()}});if(result){setDialog(null);setNotice(`Cotización ${dialog.quote.numero} anulada.`)}};
 const preview=dialog?.type==='convert'?quotePreview(dialog.quote,state,admin):null;
 const serverChanges=op.failure?.code==='QUOTE_CHANGED'?op.failure.details?.changes||[]:[];
 const changes=preview?(serverChanges.length?serverChanges:preview.changes):[];
 const creditAllowed=features.includes('credito')&&!!preview?.card;
 return <section className="cc-view" aria-labelledby="dc-quotes-title">
  <Heading company={company.name||'Mi empresa'} title={<span id="dc-quotes-title">Cotizaciones</span>} subtitle="Precios para el cliente sin descontar inventario. Se envían por WhatsApp y se convierten en venta.">{onNewQuote&&<button type="button" className="cw-btn cw-btn-primary" onClick={onNewQuote}>Nueva cotización</button>}</Heading>
  <Status op={op} notice={notice} onNotice={setNotice}/>
  <Tabs label="Estado de las cotizaciones" value={filter} onChange={setFilter} items={Object.entries(QUOTE_STATUS).map(([key,label])=>[key,label+'s',counts[key]])}/>
  <Search label="Buscar cotización" value={query} onChange={setQuery} placeholder="Cliente, teléfono o número"/>
  {!visible.length?<Empty>{quotes.length?'No hay cotizaciones en esta lista.':'Aún no hay cotizaciones. En Nueva venta agrega productos y usa «Guardar como cotización».'}</Empty>:
  <ul className="cc-cards">{visible.map(quote=>{const status=quoteStatus(quote,today);return <li key={quote.id} className="cw-card">
   <div className="cc-card-head"><div><strong>{quote.numero} · {quote.cliente}</strong><small>{(quote.detalles||[]).map(line=>`${line.cantidad} × ${line.nombre}`).join(', ')}</small><small>{humanDate(quote.fecha)} · {status==='vigente'?`válida hasta ${humanDate(quote.vence)}`:status==='vencida'?`venció ${humanDate(quote.vence)}`:QUOTE_STATUS[status]} · {quote.usuario}</small></div>
    <div className="cc-amount"><strong>{money(quote.total)}</strong><span className={`cw-tag ${STATUS_TONE[status]}`}>{QUOTE_STATUS[status]}</span></div></div>
   <div className="cc-card-actions">{quote.estado==='vigente'&&<button type="button" className="cw-btn cw-btn-primary cw-btn-small" onClick={()=>startConvert(quote)}>Convertir en venta</button>}
    <button type="button" className="cw-btn cw-btn-small" onClick={()=>print(quoteMarkup({quote,company}),'Cotización '+quote.numero)}>Imprimir o PDF</button>
    <a className="cw-btn cw-btn-small" href={shareLink(quote.telefono,quoteMessage(quote,company))} target="_blank" rel="noopener noreferrer">WhatsApp</a>
    {quote.estado==='convertida'&&quote.saleId&&onOpenSale&&<button type="button" className="cw-btn cw-btn-small" onClick={()=>onOpenSale(quote.saleId)}>Ver venta</button>}
    {canCancel(quote)&&<button type="button" className="cw-btn cw-btn-danger cw-btn-small" onClick={()=>{op.setError('');setDialog({type:'cancel',quote,motivo:''})}}>Anular</button>}</div>
  </li>})}</ul>}
  {dialog?.type==='done'&&<Modal title={`Cotización ${dialog.quote.numero}`} onClose={()=>setDialog(null)}><p>{dialog.quote.cliente} · total <strong>{money(dialog.quote.total)}</strong> · válida hasta {humanDate(dialog.quote.vence)}. No se descontó inventario.</p><div className="cw-modal-actions"><button type="button" className="cw-btn" onClick={()=>setDialog(null)}>Listo</button><button type="button" className="cw-btn" onClick={()=>print(quoteMarkup({quote:dialog.quote,company}),'Cotización '+dialog.quote.numero)}>Imprimir o PDF</button><a className="cw-btn cw-btn-primary" href={shareLink(dialog.quote.telefono,quoteMessage(dialog.quote,company))} target="_blank" rel="noopener noreferrer">Enviar por WhatsApp</a></div></Modal>}
  {dialog?.type==='convert'&&preview&&<Modal wide title={`Convertir ${dialog.quote.numero} en venta`} busy={op.busy} onClose={()=>setDialog(null)}><form className="cw-form" onSubmit={convert}>{op.error&&<div className="cw-error" role="alert">{op.error}</div>}
   <p>Se registra la venta de hoy a nombre de <strong>{dialog.quote.cliente}</strong> y se descuenta el inventario.</p>
   <div className="cw-table-wrap"><table className="cw-table"><thead><tr><th>Producto</th><th>Cant.</th><th>Cotizado</th><th>Hoy</th></tr></thead><tbody>{dialog.quote.detalles.map((line,index)=>{const change=changes.find(item=>item.nombre===line.nombre);const product=(state.prods||[]).find(p=>p.id===line.producto_id);return <tr key={index}><td>{line.nombre}{product&&Number(product.stock)<line.cantidad&&<small className="cc-out">Disponibles: {product.stock}</small>}{!product&&<small className="cc-out">Ya no existe</small>}</td><td>{line.cantidad}</td><td>{money(line.precio_unitario)}</td><td>{change?<strong className="cc-out">{money(change.ahora)}</strong>:money(line.precio_unitario)}</td></tr>})}</tbody></table></div>
   <p className="cc-total">Total a cobrar: <strong>{money(op.failure?.details?.totalAhora??preview.total)}</strong>{changes.length>0&&<> (cotizado {money(dialog.quote.total)})</>}</p>
   {preview.short.length>0&&<div className="cw-error" role="alert">No hay stock suficiente: {preview.short.map(item=>`${item.nombre} (disponibles ${item.disponible})`).join(', ')}.</div>}
   {changes.length>0&&<label className="cc-check"><input type="checkbox" checked={dialog.accept} onChange={event=>setDialog(d=>({...d,accept:event.target.checked}))}/>Acepto los precios actuales</label>}
   <div className="cw-form-grid"><MethodSelect value={dialog.method} onChange={method=>setDialog(d=>({...d,method}))} extra={creditAllowed?[[venta.CREDIT_METHOD,'Crédito']]:[]}/>{dialog.method==='efectivo'&&<Field label="Efectivo recibido (opcional)"><MoneyInput value={dialog.received} onChange={event=>setDialog(d=>({...d,received:event.target.value}))}/></Field>}</div>
   <p className="cw-footnote">Para pago dividido o mano de obra, registra la venta desde Nueva venta.</p>
   <div className="cw-modal-actions"><button type="button" className="cw-btn" onClick={()=>setDialog(null)}>Cancelar</button><button type="submit" className="cw-btn cw-btn-primary" disabled={op.busy||preview.short.length>0||preview.missing.length>0}>Registrar venta</button></div></form></Modal>}
  {dialog?.type==='converted'&&<Modal title="Venta registrada" onClose={()=>setDialog(null)}><p>{dialog.quote.numero} → venta de <strong>{money(dialog.sale.total)}</strong> a {dialog.sale.cliente}.</p><div className="cw-modal-actions"><button type="button" className="cw-btn" onClick={()=>setDialog(null)}>Listo</button>{onOpenSale&&<button type="button" className="cw-btn cw-btn-primary" onClick={()=>{setDialog(null);onOpenSale(dialog.sale.id)}}>Ver comprobante</button>}</div></Modal>}
  {dialog?.type==='cancel'&&<Modal title={`Anular ${dialog.quote.numero}`} busy={op.busy} onClose={()=>setDialog(null)}><form className="cw-form" onSubmit={cancel}>{op.error&&<div className="cw-error" role="alert">{op.error}</div>}<Field label="Motivo"><textarea rows={2} maxLength={500} required value={dialog.motivo} onChange={event=>setDialog(d=>({...d,motivo:event.target.value}))}/></Field><div className="cw-modal-actions"><button type="button" className="cw-btn" onClick={()=>setDialog(null)}>Volver</button><button type="submit" className="cw-btn cw-btn-danger" disabled={op.busy}>Anular cotización</button></div></form></Modal>}
 </section>;
}

// ---------------------------------------------------------------- Garantías
const W_FILTERS=[['abiertas','Abiertas'],['decidir','Por decidir'],['reclamo','En reclamo'],['cerradas','Cerradas']];
const wMatch=(item,filter)=>filter==='abiertas'?item.estado!=='cerrada':filter==='decidir'?!item.decision&&item.estado!=='cerrada':filter==='reclamo'?['enviada','aprobada','rechazada'].includes(item.estado):item.estado==='cerrada';
const labels={decisions:WARRANTY_DECISIONS,status:WARRANTY_STATUS};
function supplierOptions(suppliers){return (suppliers||[]).filter(item=>item.activo!==false).map(item=><option key={item.id} value={item.id}>{item.nombre}</option>)}
export function WarrantiesView({state={},session={},admin=false,company={},onAction,onRetryAction,focusSaleId=null}){
 const op=useOperation(onAction,onRetryAction),[notice,setNotice]=useState(''),[filter,setFilter]=useState('abiertas'),[query,setQuery]=useState('');
 const today=todayBogota(),warranties=state.warranties||[],sales=state.ventas||[],prods=state.prods||[],suppliers=state.suppliers||[],print=usePrint(op);
 const newDialog=saleId=>({type:'new',search:'',saleId:saleId||'',lineIndex:sales.find(item=>item.id===saleId)?.detalles?.length===1?'0':'',cantidad:'1',motivo:'',supplierId:'',proveedor:'',decision:'',refundMethod:''});
 const [dialog,setDialog]=useState(()=>focusSaleId&&sales.some(s=>s.id===focusSaleId)?newDialog(focusSaleId):null);
 const [from,setFrom]=useState(()=>today.slice(0,7)+'-01'),[to,setTo]=useState(today);
 const visible=warranties.filter(item=>wMatch(item,filter)&&(!query||norm([item.numero,item.cliente,item.nombre,item.proveedor].join(' ')).includes(norm(query))));
 const counts=Object.fromEntries(W_FILTERS.map(([key])=>[key,warranties.filter(item=>wMatch(item,key)).length]));
 const report=useMemo(()=>{try{return from&&to&&from>to?null:warrantyReport(state,{from,to})}catch{return null}},[state,from,to]);
 const sale=dialog?.type==='new'&&dialog.saleId?sales.find(item=>item.id===dialog.saleId):null;
 const saleMatches=dialog?.type==='new'&&!dialog.saleId?sales.filter(item=>!item.anulada&&(item.detalles||[]).length&&(!dialog.search.trim()||norm([item.cliente,item.telefono,item.placa,item.id,item.numeroDocumento].join(' ')).includes(norm(dialog.search)))).slice(0,12):[];
 const line=sale&&dialog.lineIndex!==''?sale.detalles[Number(dialog.lineIndex)]:null,product=line?prods.find(p=>p.id===line.producto_id):null;
 const term=line&&product?warrantyTerm(product,sale,today):null,available=line?claimableUnits(state,sale,Number(dialog.lineIndex)):0;
 const receive=async event=>{
  event.preventDefault();if(!sale||!line){op.setError('Selecciona la venta y el producto.');return}
  const quantity=positiveInt(dialog.cantidad);if(!quantity||quantity>available){op.setError(`Indica de 1 a ${available} unidades.`);return}
  if(!dialog.motivo.trim()){op.setError('Escribe el motivo del reclamo.');return}
  const result=await op.perform({type:'warranty.create',form:{saleId:sale.id,lineIndex:Number(dialog.lineIndex),cantidad:quantity,motivo:dialog.motivo.trim(),...(dialog.supplierId?{supplierId:dialog.supplierId}:dialog.proveedor.trim()?{proveedor:dialog.proveedor.trim()}:{}),...(admin&&dialog.decision?{decision:dialog.decision,...(dialog.decision==='devolucion'&&dialog.refundMethod?{refundMethod:dialog.refundMethod}:{})}:{})}});
  if(result){const saved=(result.state?.warranties||[]).find(item=>item.id===result.document?.id);setNotice(`Garantía ${saved?.numero||''} recibida. La pieza quedó fuera del stock vendible.${result.warning?' '+result.warning:''}`);setDialog(saved?{type:'done',warranty:saved}:null)}
 };
 const decide=async event=>{
  event.preventDefault();if(!dialog.decision){op.setError('Elige la decisión.');return}
  const result=await op.perform({type:'warranty.decide',id:dialog.warranty.id,form:{decision:dialog.decision,nota:dialog.nota.trim(),...(dialog.decision==='devolucion'&&dialog.refundMethod?{refundMethod:dialog.refundMethod}:{})}});
  if(result){setDialog(null);setNotice(`Garantía ${dialog.warranty.numero}: ${WARRANTY_DECISIONS[dialog.decision].toLowerCase()}.${result.warning?' '+result.warning:''}`)}
 };
 const status=async event=>{
  event.preventDefault();const form={estado:dialog.estado,nota:dialog.nota.trim()};
  if(dialog.estado==='enviada'){if(dialog.supplierId)form.supplierId=dialog.supplierId;else if(dialog.proveedor.trim())form.proveedor=dialog.proveedor.trim();else{op.setError('Indica el proveedor.');return}}
  if(dialog.estado==='cerrada')form.resultado=dialog.resultado;
  const result=await op.perform({type:'warranty.status',id:dialog.warranty.id,form});
  if(result){setDialog(null);setNotice(`Garantía ${dialog.warranty.numero}: ${WARRANTY_STATUS[dialog.estado].toLowerCase()}.`)}
 };
 const closeResults=warranty=>warranty.decision?.tipo==='reparacion'?['entregada_cliente']:warranty.estado==='aprobada'?['reposicion','nota_credito','baja']:['baja','reposicion'];
 const openStatus=(warranty,estado)=>{op.setError('');setDialog({type:'status',warranty,estado,nota:'',supplierId:warranty.supplierId||'',proveedor:warranty.supplierId?'':warranty.proveedor||'',resultado:closeResults(warranty)[0]})};
 const tabs=[...W_FILTERS.map(([key,label])=>[key,label,counts[key]]),...(admin?[['reporte','Reporte']]:[])];
 return <section className="cc-view" aria-labelledby="dc-warranty-title">
  <Heading company={company.name||'Mi empresa'} title={<span id="dc-warranty-title">Garantías</span>} subtitle="Piezas defectuosas recibidas del cliente y reclamos al proveedor. La pieza no vuelve al stock vendible."><button type="button" className="cw-btn cw-btn-primary" onClick={()=>{op.setError('');setNotice('');setDialog(newDialog())}}>Recibir garantía</button></Heading>
  <Status op={op} notice={notice} onNotice={setNotice}/>
  <Tabs label="Estado de las garantías" value={filter} onChange={setFilter} items={tabs}/>
  {filter==='reporte'&&admin?<>
   <div className="cw-form-grid dc-range"><Field label="Desde"><input type="date" value={from} onChange={event=>setFrom(event.target.value)}/></Field><Field label="Hasta"><input type="date" value={to} onChange={event=>setTo(event.target.value)}/></Field><ExcelButton className="cw-btn" disabled={!report} options={{title:'GARANTÍAS',columns:columns(WARRANTY_COLUMNS),rows:report?.rows||[],from,to}} name="SCORTA-garantias"/></div>
   {!report?<Empty>La fecha Desde debe ser igual o anterior a Hasta.</Empty>:<>
    <div className="cc-metrics"><Metric label="Garantías del período" value={String(report.totals.count)} tone="main"/><Metric label="Unidades reclamadas" value={String(report.totals.units)}/><Metric label="Piezas en garantía hoy" value={String(report.totals.inWarranty)}/></div>
    {[['Por producto',report.byProduct],['Por proveedor',report.bySupplier]].map(([title,rows])=><section key={title} className="cw-card cw-card-table"><h2 className="dc-card-title">{title}</h2>{!rows.length?<p className="cw-muted">Sin garantías en el período.</p>:<div className="cw-table-wrap"><table className="cw-table"><thead><tr><th>{title==='Por producto'?'Producto':'Proveedor'}</th><th>Garantías</th><th>Unidades</th><th>Abiertas</th><th>Aprobadas</th><th>Rechazadas</th></tr></thead><tbody>{rows.map(row=><tr key={row.name}><td>{row.name}</td><td>{row.count}</td><td>{row.units}</td><td>{row.pending}</td><td>{row.approved}</td><td>{row.rejected}</td></tr>)}</tbody></table></div>}</section>)}
   </>}
  </>:<>
  <Search label="Buscar garantía" value={query} onChange={setQuery} placeholder="Cliente, producto, proveedor o número"/>
  {!visible.length?<Empty>{warranties.length?'No hay garantías en esta lista.':'Aún no hay garantías. Usa «Recibir garantía» cuando un cliente traiga una pieza defectuosa.'}</Empty>:
  <ul className="cc-cards">{visible.map(item=><li key={item.id} className="cw-card">
   <div className="cc-card-head"><div><strong>{item.numero} · {item.nombre} ({item.cantidad})</strong><small>{item.cliente} · venta del {humanDate(item.saleFecha)} · recibida {humanDate(item.fecha)}</small><small>Motivo: {item.motivo}</small>{item.proveedor&&<small>Proveedor: {item.proveedor}</small>}</div>
    <div className="cc-amount"><span className="cw-tag">{WARRANTY_STATUS[item.estado]}</span>{item.decision?<span className="cw-tag">{WARRANTY_DECISIONS[item.decision.tipo]}</span>:<span className="cw-tag cw-tag-danger">Por decidir</span>}{item.fueraDePlazo&&<span className="cw-tag cw-tag-danger">Fuera de plazo</span>}</div></div>
   <div className="cc-card-actions"><button type="button" className="cw-btn cw-btn-small" onClick={()=>print(warrantyMarkup({warranty:item,company,labels}),'Garantía '+item.numero)}>Comprobante</button>
    {admin&&!item.decision&&item.estado!=='cerrada'&&<button type="button" className="cw-btn cw-btn-primary cw-btn-small" onClick={()=>{op.setError('');setDialog({type:'decide',warranty:item,decision:'',nota:'',refundMethod:''})}}>Decidir</button>}
    {admin&&item.estado==='recibida'&&item.decision&&item.decision.tipo!=='rechazo'&&<button type="button" className="cw-btn cw-btn-small" onClick={()=>openStatus(item,'enviada')}>Enviar al proveedor</button>}
    {admin&&item.estado==='enviada'&&<><button type="button" className="cw-btn cw-btn-small" onClick={()=>openStatus(item,'aprobada')}>Aprobada</button><button type="button" className="cw-btn cw-btn-small" onClick={()=>openStatus(item,'rechazada')}>Rechazada</button></>}
    {admin&&item.decision&&['recibida','aprobada','rechazada'].includes(item.estado)&&<button type="button" className="cw-btn cw-btn-small" onClick={()=>openStatus(item,'cerrada')}>Cerrar</button>}</div>
  </li>)}</ul>}</>}
  {dialog?.type==='new'&&<Modal wide title="Recibir garantía" busy={op.busy} onClose={()=>setDialog(null)}><form className="cw-form" onSubmit={receive}>{op.error&&<div className="cw-error" role="alert">{op.error}</div>}
   {!sale?<><Field label="Buscar la venta" hint={admin?'Cliente, teléfono, placa o documento.':'Solo aparecen tus ventas.'}><input type="search" value={dialog.search} placeholder="Nombre, teléfono o placa" onChange={event=>setDialog(d=>({...d,search:event.target.value}))}/></Field>
    {!saleMatches.length?<p className="cw-muted">No hay ventas para esta búsqueda.</p>:<ul className="cc-picker">{saleMatches.map(item=><li key={item.id}><button type="button" onClick={()=>setDialog(d=>({...d,saleId:item.id,lineIndex:item.detalles.length===1?'0':''}))}>{item.cliente||'Cliente general'} · {humanDate(item.fecha)} · {money(item.total)}<small>{(item.detalles||[]).map(l=>`${l.cantidad} × ${l.nombre}`).join(', ')}</small></button></li>)}</ul>}</>:
   <><p className="cc-selected">Venta: <strong>{sale.cliente||'Cliente general'}</strong> del {humanDate(sale.fecha)} <button type="button" className="cw-text-button" onClick={()=>setDialog(d=>({...d,saleId:'',lineIndex:''}))}>Cambiar</button></p>
    <Field label="Producto con falla"><select required value={dialog.lineIndex} onChange={event=>setDialog(d=>({...d,lineIndex:event.target.value,cantidad:'1'}))}><option value="">Selecciona</option>{sale.detalles.map((item,index)=><option key={index} value={index} disabled={!claimableUnits(state,sale,index)}>{item.nombre} · {claimableUnits(state,sale,index)} por reclamar</option>)}</select></Field>
    {term?.dias&&<p className={term.fueraDePlazo?'cw-error':'cw-muted'} role={term.fueraDePlazo?'alert':undefined}>{term.fueraDePlazo?`Fuera de plazo: la garantía de ${term.dias} días venció el ${humanDate(term.vence)}. Puedes recibirla; el administrador decide.`:`Garantía de ${term.dias} días, vigente hasta el ${humanDate(term.vence)}.`}</p>}
    {line&&!term?.dias&&<p className="cw-muted">Este producto no tiene plazo de garantía registrado.</p>}
    <div className="cw-form-grid"><Field label="Unidades"><input type="number" inputMode="numeric" min="1" max={available||1} step="1" required value={dialog.cantidad} onChange={event=>setDialog(d=>({...d,cantidad:event.target.value}))}/></Field>
     {suppliers.length>0?<Field label="Proveedor (opcional)"><select value={dialog.supplierId} onChange={event=>setDialog(d=>({...d,supplierId:event.target.value}))}><option value="">El de la última compra</option>{supplierOptions(suppliers)}</select></Field>:<Field label="Proveedor (opcional)"><input maxLength={200} value={dialog.proveedor} onChange={event=>setDialog(d=>({...d,proveedor:event.target.value}))}/></Field>}</div>
    <Field label="Motivo del reclamo"><textarea rows={2} maxLength={500} required value={dialog.motivo} placeholder="Ej. no enciende, se partió al instalar" onChange={event=>setDialog(d=>({...d,motivo:event.target.value}))}/></Field>
    {admin&&<div className="cw-form-grid"><Field label="Decisión (opcional)"><select value={dialog.decision} onChange={event=>setDialog(d=>({...d,decision:event.target.value}))}><option value="">Decidir después</option>{Object.entries(WARRANTY_DECISIONS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field>{dialog.decision==='devolucion'&&<MethodSelect label="Devolver por" value={dialog.refundMethod||'efectivo'} onChange={refundMethod=>setDialog(d=>({...d,refundMethod}))}/>}</div>}
    {!admin&&<p className="cw-footnote">El administrador decide si hay cambio, reparación, devolución o rechazo.</p>}</>}
   <div className="cw-modal-actions"><button type="button" className="cw-btn" onClick={()=>setDialog(null)}>Cancelar</button><button type="submit" className="cw-btn cw-btn-primary" disabled={op.busy||!sale}>Recibir pieza</button></div></form></Modal>}
  {dialog?.type==='done'&&<Modal title={`Garantía ${dialog.warranty.numero}`} onClose={()=>setDialog(null)}><p>{dialog.warranty.nombre} ({dialog.warranty.cantidad}) de {dialog.warranty.cliente}. {WARRANTY_STATUS[dialog.warranty.estado]}.</p><div className="cw-modal-actions"><button type="button" className="cw-btn" onClick={()=>setDialog(null)}>Listo</button><button type="button" className="cw-btn cw-btn-primary" onClick={()=>print(warrantyMarkup({warranty:dialog.warranty,company,labels}),'Garantía '+dialog.warranty.numero)}>Imprimir recepción</button></div></Modal>}
  {dialog?.type==='decide'&&admin&&<Modal title={`Decidir ${dialog.warranty.numero}`} busy={op.busy} onClose={()=>setDialog(null)}><form className="cw-form" onSubmit={decide}>{op.error&&<div className="cw-error" role="alert">{op.error}</div>}
   <p>{dialog.warranty.nombre} ({dialog.warranty.cantidad}) · {dialog.warranty.cliente}. {dialog.warranty.fueraDePlazo&&<strong className="cc-out">Fuera de plazo.</strong>}</p>
   <Field label="Decisión"><select required value={dialog.decision} onChange={event=>setDialog(d=>({...d,decision:event.target.value}))}><option value="">Selecciona</option>{Object.entries(WARRANTY_DECISIONS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field>
   {dialog.decision==='cambio'&&<p className="cw-muted">Se entrega otra unidad del stock vendible (disponibles: {(prods.find(p=>p.id===dialog.warranty.producto_id)||{}).stock??0}).</p>}
   {dialog.decision==='devolucion'&&<><p className="cw-muted">Se devuelven {money(roundMoney(dialog.warranty.cantidad*dialog.warranty.precio_unitario))} como devolución parcial de la venta (si fue a crédito, primero baja su saldo).</p><MethodSelect label="Devolver por" value={dialog.refundMethod||'efectivo'} onChange={refundMethod=>setDialog(d=>({...d,refundMethod}))}/></>}
   {dialog.decision==='rechazo'&&<p className="cw-muted">La pieza se devuelve al cliente y la garantía queda cerrada.</p>}
   <Field label="Nota (opcional)"><textarea rows={2} maxLength={500} value={dialog.nota} onChange={event=>setDialog(d=>({...d,nota:event.target.value}))}/></Field>
   <div className="cw-modal-actions"><button type="button" className="cw-btn" onClick={()=>setDialog(null)}>Cancelar</button><button type="submit" className="cw-btn cw-btn-primary" disabled={op.busy}>Guardar decisión</button></div></form></Modal>}
  {dialog?.type==='status'&&admin&&<Modal title={`${dialog.warranty.numero}: ${WARRANTY_STATUS[dialog.estado]}`} busy={op.busy} onClose={()=>setDialog(null)}><form className="cw-form" onSubmit={status}>{op.error&&<div className="cw-error" role="alert">{op.error}</div>}
   {dialog.estado==='enviada'&&(suppliers.length>0?<Field label="Proveedor"><select value={dialog.supplierId} onChange={event=>setDialog(d=>({...d,supplierId:event.target.value}))}><option value="">{dialog.warranty.proveedor&&!dialog.warranty.supplierId?dialog.warranty.proveedor:'Selecciona'}</option>{supplierOptions(suppliers)}</select></Field>:<Field label="Proveedor"><input maxLength={200} value={dialog.proveedor} onChange={event=>setDialog(d=>({...d,proveedor:event.target.value}))}/></Field>)}
   {dialog.estado==='cerrada'&&<Field label="Resultado"><select value={dialog.resultado} onChange={event=>setDialog(d=>({...d,resultado:event.target.value}))}>{closeResults(dialog.warranty).map(key=><option key={key} value={key}>{WARRANTY_RESULTS[key]}</option>)}</select></Field>}
   <Field label="Nota (opcional)"><textarea rows={2} maxLength={500} value={dialog.nota} placeholder={dialog.estado==='enviada'?'Ej. número de guía':''} onChange={event=>setDialog(d=>({...d,nota:event.target.value}))}/></Field>
   <div className="cw-modal-actions"><button type="button" className="cw-btn" onClick={()=>setDialog(null)}>Cancelar</button><button type="submit" className="cw-btn cw-btn-primary" disabled={op.busy}>Guardar</button></div></form></Modal>}
 </section>;
}

// ---------------------------------------------------------------- Proveedores, órdenes y cuentas por pagar
const PO_FILTERS=[['abiertas','Abiertas'],['borrador','Borrador'],['enviada','Enviadas'],['parcial','Parciales'],['cerradas','Cerradas'],['anulada','Anuladas']];
const poMatch=(order,filter)=>filter==='abiertas'?['borrador','enviada','parcial','recibida'].includes(order.estado):filter==='cerradas'?['recibida','cerrada'].includes(order.estado):order.estado===filter;
export const orderMessage=(order,company={})=>[`Hola ${order.proveedor}, ${company.name||'nuestro almacén'} les envía la orden de compra ${order.numero}:`,...(order.items||[]).map(item=>`• ${item.cantidad} × ${item.nombre}${item.referencia?' (ref. '+item.referencia+')':''}${item.costo!=null?' a '+money(item.costo):''}`),order.total?`Total estimado: ${money(order.total)}`:'',order.fechaEntrega?`Entrega esperada: ${humanDate(order.fechaEntrega)}`:'','Por favor confirmen disponibilidad y precios. ¡Gracias!'].filter(Boolean).join('\n');
const emptySupplier=()=>({type:'supplier',id:null,nombre:'',nit:'',contacto:'',telefono:'',correo:'',direccion:'',plazoDias:'0',notas:''});
export function PurchasingView({state={},admin=true,company={},features=[],onAction,onRetryAction,initialTab=null}){
 const ordersEnabled=features.includes('ordenes_compra');
 const op=useOperation(onAction,onRetryAction),[notice,setNotice]=useState(''),[tab,setTab]=useState(initialTab||(ordersEnabled?'ordenes':'pagar')),[filter,setFilter]=useState('abiertas'),[query,setQuery]=useState(''),[dialog,setDialog]=useState(null),[onlyOpen,setOnlyOpen]=useState(true);
 const today=todayBogota(),orders=state.purchaseOrders||[],suppliers=state.suppliers||[],prods=state.prods||[],accounts=state.payableAccounts||[],summary=payablesSummary(accounts),print=usePrint(op);
 const supplierOf=id=>suppliers.find(item=>item.id===id)||{};
 if(!admin)return <section className="cc-view"><Empty>Los proveedores, las órdenes de compra y los pagos a proveedores son del administrador.</Empty></section>;
 const visibleOrders=orders.filter(order=>poMatch(order,filter)&&(!query||norm([order.numero,order.proveedor].join(' ')).includes(norm(query))));
 const orderCounts=Object.fromEntries(PO_FILTERS.map(([key])=>[key,orders.filter(order=>poMatch(order,key)).length]));
 const visibleAccounts=accounts.filter(account=>(!onlyOpen||account.saldo>0)&&(!query||norm([account.nombre,account.nit].join(' ')).includes(norm(query))));
 const visibleSuppliers=suppliers.filter(item=>!query||norm([item.nombre,item.nit,item.contacto,item.telefono].join(' ')).includes(norm(query)));
 const openOrder=(order=null,items=null)=>{op.setError('');setNotice('');setDialog({type:'order',id:order?.id||null,supplierId:order?.supplierId||'',proveedor:order&&!order.supplierId?order.proveedor:'',nota:order?.nota||'',fechaEntrega:order?.fechaEntrega||'',enviar:false,search:'',origen:items?'reposicion':'',items:(items||order?.items||[]).map(item=>({producto_id:item.producto_id,nombre:item.nombre,cantidad:String(item.cantidad),costo:item.costo==null?'':String(item.costo)}))})};
 const addProduct=product=>setDialog(d=>d.items.some(item=>item.producto_id===product.id)?{...d,search:''}:{...d,search:'',items:[...d.items,{producto_id:product.id,nombre:product.nombre,cantidad:'1',costo:product.precio_compra==null?'':String(product.precio_compra)}]});
 const productMatches=dialog?.type==='order'&&dialog.search.trim().length>=2?prods.filter(p=>norm([p.nombre,p.referencia,p.codigo_barras].join(' ')).includes(norm(dialog.search))).slice(0,8):[];
 const saveOrder=async event=>{
  event.preventDefault();if(!dialog.supplierId&&!dialog.proveedor.trim()){op.setError('Selecciona o escribe el proveedor.');return}
  if(!dialog.items.length){op.setError('Agrega al menos un producto.');return}
  for(const item of dialog.items){if(!positiveInt(item.cantidad)){op.setError(`Revisa la cantidad de ${item.nombre}.`);return}if(String(item.costo).trim()!==''&&validAmount(item.costo,{allowZero:true})==null){op.setError(`Revisa el costo de ${item.nombre}.`);return}}
  const form={...(dialog.supplierId?{supplierId:dialog.supplierId}:{proveedor:dialog.proveedor.trim()}),nota:dialog.nota.trim(),...(dialog.fechaEntrega?{fechaEntrega:dialog.fechaEntrega}:{}),items:dialog.items.map(item=>({producto_id:item.producto_id,cantidad:Number(item.cantidad),costo:String(item.costo).trim()===''?null:Number(item.costo)})),...(!dialog.id&&dialog.enviar?{enviar:true}:{}),...(!dialog.id&&dialog.origen?{origen:dialog.origen}:{})};
  const result=await op.perform(dialog.id?{type:'po.update',id:dialog.id,form}:{type:'po.create',form});
  if(result){const saved=(result.state?.purchaseOrders||[]).find(item=>item.id===result.document?.id);setNotice(`Orden ${saved?.numero||''} ${dialog.id?'actualizada':'creada'}.`);setDialog(saved?{type:'orderDone',order:saved}:null)}
 };
 const transition=async(order,type,message,form={})=>{const result=await op.perform({type,id:order.id,form});if(result){setNotice(message);setDialog(null)}return result};
 const openReceive=order=>{op.setError('');setDialog({type:'receive',order,fecha:today,factura:'',credito:!!order.supplierId&&Number(supplierOf(order.supplierId).plazoDias)>0,items:order.items.map(item=>({producto_id:item.producto_id,nombre:item.nombre,pendiente:item.cantidad-(item.recibido||0),cantidad:String(Math.max(0,item.cantidad-(item.recibido||0))),costo:item.costo==null?'':String(item.costo)}))})};
 const receive=async event=>{
  event.preventDefault();const items=dialog.items.filter(item=>String(item.cantidad).trim()!==''&&Number(item.cantidad)>0);
  if(!items.length){op.setError('Indica al menos una cantidad recibida.');return}
  for(const item of items){if(!positiveInt(item.cantidad)||Number(item.cantidad)>item.pendiente){op.setError(`${item.nombre}: recibe de 1 a ${item.pendiente} unidades.`);return}if(validAmount(item.costo,{allowZero:true})==null){op.setError(`Indica el costo de compra de ${item.nombre}.`);return}}
  const result=await op.perform({type:'po.receive',id:dialog.order.id,form:{fecha:dialog.fecha,factura:dialog.factura.trim(),...(dialog.credito?{credito:true}:{}),items:items.map(item=>({producto_id:item.producto_id,cantidad:Number(item.cantidad),costo:Number(item.costo)}))}});
  if(result){setDialog(null);setNotice(`Mercancía recibida en ${dialog.order.numero}. Existencias y costo promedio actualizados.${dialog.credito?' Quedó en cuentas por pagar.':''}`)}
 };
 const pay=async event=>{
  event.preventDefault();const value=validAmount(dialog.amount);
  if(value==null||value>dialog.account.saldo){op.setError(`Escribe un pago entre 1 y ${money(dialog.account.saldo)}.`);return}
  const result=await op.perform({type:'payable.payment',form:{supplierId:dialog.account.supplierId,amount:value,method:dialog.method,nota:dialog.nota.trim()}});
  if(result){const payment=(result.state?.supplierPayments||[]).find(item=>item.id===result.document?.id);setNotice(`Pago de ${money(value)} a ${dialog.account.nombre} registrado.${dialog.method==='efectivo'?' Salió de la caja de hoy.':''}`);setDialog(payment?{type:'paid',payment}:null)}
 };
 const saveSupplier=async event=>{
  event.preventDefault();if(!dialog.nombre.trim()){op.setError('Escribe el nombre del proveedor.');return}
  const days=String(dialog.plazoDias).trim()===''?0:Number(dialog.plazoDias);if(!Number.isSafeInteger(days)||days<0||days>365){op.setError('El plazo de pago debe estar entre 0 y 365 días.');return}
  const form={nombre:dialog.nombre.trim(),nit:dialog.nit.trim(),contacto:dialog.contacto.trim(),telefono:dialog.telefono.trim(),correo:dialog.correo.trim(),direccion:dialog.direccion.trim(),plazoDias:days,notas:dialog.notas.trim()};
  const result=await op.perform(dialog.id?{type:'supplier.update',id:dialog.id,form}:{type:'supplier.create',form});
  if(result){setDialog(null);setNotice(`Proveedor ${form.nombre} ${dialog.id?'actualizado':'creado'}.`)}
 };
 const orderDialogTotal=dialog?.type==='order'?sumMoney(dialog.items.map(item=>roundMoney((Number(item.cantidad)||0)*(Number(item.costo)||0)))):0;
 const tabs=[...(ordersEnabled||orders.length?[['ordenes','Órdenes de compra',orders.filter(o=>['borrador','enviada','parcial'].includes(o.estado)).length]]:[]),['pagar','Cuentas por pagar',accounts.filter(a=>a.saldo>0).length],['proveedores','Proveedores',suppliers.length]];
 const payablesRows=payablesReport(state,today).rows;
 return <section className="cc-view" aria-labelledby="dc-purchasing-title">
  <Heading company={company.name||'Mi empresa'} title={<span id="dc-purchasing-title">Proveedores</span>} subtitle="Órdenes de compra, mercancía por recibir, cuentas por pagar y fichas de proveedores.">
   {tab==='ordenes'&&ordersEnabled&&<button type="button" className="cw-btn cw-btn-primary" onClick={()=>openOrder()}>Nueva orden</button>}
   {tab==='ordenes'&&ordersEnabled&&<button type="button" className="cw-btn" onClick={()=>{const items=replenishmentOrderItems(prods);if(!items.length){op.setError('No hay productos bajo el mínimo.');return}openOrder(null,items)}}>Desde reposición</button>}
   {tab==='proveedores'&&<button type="button" className="cw-btn cw-btn-primary" onClick={()=>{op.setError('');setDialog(emptySupplier())}}>Nuevo proveedor</button>}
   {tab==='pagar'&&<ExcelButton className="cw-btn" disabled={!payablesRows.length} options={{title:'CUENTAS POR PAGAR',columns:columns(PAYABLE_COLUMNS),rows:payablesRows}} name="SCORTA-cuentas-por-pagar"/>}
  </Heading>
  <Status op={op} notice={notice} onNotice={setNotice}/>
  <Tabs label="Secciones de proveedores" value={tab} onChange={next=>{setTab(next);setQuery('')}} items={tabs}/>
  {tab==='ordenes'&&<><Tabs label="Estado de las órdenes" value={filter} onChange={setFilter} items={PO_FILTERS.map(([key,label])=>[key,label,orderCounts[key]])}/>
   <Search label="Buscar orden" value={query} onChange={setQuery} placeholder="Proveedor o número"/>
   {!visibleOrders.length?<Empty>{orders.length?'No hay órdenes en esta lista.':'Aún no hay órdenes de compra. Crea una o genérala desde los productos bajo el mínimo.'}</Empty>:
   <ul className="cc-cards">{visibleOrders.map(order=>{const supplier=supplierOf(order.supplierId),received=order.items.reduce((n,i)=>n+(i.recibido||0),0),units=order.items.reduce((n,i)=>n+i.cantidad,0);return <li key={order.id} className="cw-card">
    <div className="cc-card-head"><div><strong>{order.numero} · {order.proveedor}</strong><small>{order.items.map(item=>`${item.cantidad} × ${item.nombre}`).join(', ')}</small><small>{humanDate(order.fecha)}{order.fechaEntrega?` · entrega ${humanDate(order.fechaEntrega)}`:''} · recibidas {received} de {units}</small></div>
     <div className="cc-amount"><strong>{money(order.total)}</strong><span className="cw-tag">{PO_STATUS[order.estado]}</span>{order.origen==='reposicion'&&<span className="cw-tag">Reposición</span>}</div></div>
    <div className="cc-card-actions">{['borrador','enviada','parcial'].includes(order.estado)&&<button type="button" className="cw-btn cw-btn-primary cw-btn-small" onClick={()=>openReceive(order)}>Recibir</button>}
     {order.estado==='borrador'&&<button type="button" className="cw-btn cw-btn-small" onClick={()=>openOrder(order)}>Editar</button>}
     {order.estado==='borrador'&&<button type="button" className="cw-btn cw-btn-small" onClick={()=>transition(order,'po.send',`Orden ${order.numero} marcada como enviada.`)}>Marcar enviada</button>}
     <button type="button" className="cw-btn cw-btn-small" onClick={()=>print(purchaseOrderMarkup({order,company,supplier,status:PO_STATUS[order.estado]}),'Orden '+order.numero)}>Imprimir o PDF</button>
     <a className="cw-btn cw-btn-small" href={shareLink(supplier.telefono,orderMessage(order,company))} target="_blank" rel="noopener noreferrer">WhatsApp</a>
     {['parcial','recibida'].includes(order.estado)&&<button type="button" className="cw-btn cw-btn-small" onClick={()=>{if(window.confirm(`¿Cerrar la orden ${order.numero}?${order.estado==='parcial'?' Lo pendiente ya no se recibirá.':''}`))transition(order,'po.close',`Orden ${order.numero} cerrada.`)}}>Cerrar</button>}
     {['borrador','enviada'].includes(order.estado)&&<button type="button" className="cw-btn cw-btn-danger cw-btn-small" onClick={()=>{op.setError('');setDialog({type:'cancelOrder',order,motivo:''})}}>Anular</button>}</div>
   </li>})}</ul>}</>}
  {tab==='pagar'&&<><div className="cc-metrics"><Metric label="Total por pagar" value={money(summary.saldo)} tone="main"/><Metric label="Vencido" value={money(summary.vencido)} tone={summary.vencido>0?'alert':''}/><Metric label="Proveedores con saldo" value={String(summary.proveedores)}/></div>
   <div className="cw-tools"><div className="cw-search"><input type="search" aria-label="Buscar proveedor con saldo" placeholder="Proveedor o NIT" value={query} onChange={event=>setQuery(event.target.value)}/></div><label className="cc-check"><input type="checkbox" checked={onlyOpen} onChange={event=>setOnlyOpen(event.target.checked)}/>Solo con saldo</label></div>
   {!visibleAccounts.length?<Empty>{accounts.length?'No hay saldos para esta búsqueda.':'No hay compras a crédito. Al recibir una orden o ingresar mercancía marca «A crédito» para registrarla aquí.'}</Empty>:
   <ul className="cc-cards">{visibleAccounts.map(account=><li key={account.supplierId} className="cw-card">
    <div className="cc-card-head"><div><strong>{account.nombre}</strong><small>{account.nit?`NIT ${account.nit} · `:''}{account.plazoDias?`Plazo ${account.plazoDias} días`:'Contado'}</small></div><div className="cc-amount"><strong>{money(account.saldo)}</strong>{account.vencido>0&&<span className="cw-tag cw-tag-danger">Vencido {money(account.vencido)}</span>}</div></div>
    <ul className="cc-list">{account.facturas.filter(item=>item.saldo>0||!onlyOpen).slice(0,8).map(item=><li key={item.compraId}><div><strong>{item.factura||'Compra'} · {humanDate(item.fecha)}</strong><small>Vence {humanDate(item.vence)}{item.vencida?` · vencida hace ${item.diasVencida} días`:''}{item.orden?` · ${item.orden}`:''}</small></div><strong className={item.vencida?'cc-out':undefined}>{money(item.saldo)}</strong></li>)}</ul>
    <div className="cc-card-actions">{account.saldo>0&&<button type="button" className="cw-btn cw-btn-primary cw-btn-small" onClick={()=>{op.setError('');setDialog({type:'pay',account,amount:'',method:'transferencia',nota:''})}}>Registrar pago</button>}{account.pagos[0]&&<small className="cw-muted">Último pago {humanDate(account.pagos[0].fecha)} · {money(account.pagos[0].amount)}</small>}</div>
   </li>)}</ul>}</>}
  {tab==='proveedores'&&<><Search label="Buscar proveedor" value={query} onChange={setQuery} placeholder="Nombre, NIT o contacto"/>
   {!visibleSuppliers.length?<Empty>{suppliers.length?'No hay proveedores para esta búsqueda.':'Aún no hay proveedores. Crea su ficha con NIT, contacto y plazo de pago.'}</Empty>:
   <ul className="cc-cards">{visibleSuppliers.map(item=><li key={item.id} className="cw-card"><div className="cc-card-head"><div><strong>{item.nombre}</strong><small>{[item.nit&&'NIT '+item.nit,item.contacto,item.telefono,item.correo].filter(Boolean).join(' · ')||'Sin datos de contacto'}</small></div><div className="cc-amount"><span className="cw-tag">{item.plazoDias?`${item.plazoDias} días`:'Contado'}</span>{item.activo===false&&<span className="cw-tag">Inactivo</span>}</div></div>
    <div className="cc-card-actions"><button type="button" className="cw-btn cw-btn-small" onClick={()=>{op.setError('');setDialog({...emptySupplier(),...item,plazoDias:String(item.plazoDias??0),type:'supplier'})}}>Editar</button>{item.telefono&&<a className="cw-btn cw-btn-small" href={whatsappLink(item.telefono,'Hola '+item.nombre+', ')||undefined} target="_blank" rel="noopener noreferrer">WhatsApp</a>}</div></li>)}</ul>}</>}
  {dialog?.type==='order'&&<Modal wide title={dialog.id?'Editar orden de compra':'Nueva orden de compra'} busy={op.busy} onClose={()=>setDialog(null)}><form className="cw-form" onSubmit={saveOrder}>{op.error&&<div className="cw-error" role="alert">{op.error}</div>}
   <div className="cw-form-grid">{suppliers.length>0&&<Field label="Proveedor"><select value={dialog.supplierId} onChange={event=>setDialog(d=>({...d,supplierId:event.target.value}))}><option value="">Otro (escribir)</option>{supplierOptions(suppliers)}</select></Field>}{!dialog.supplierId&&<Field label={suppliers.length?'Nombre del proveedor':'Proveedor'}><input maxLength={200} value={dialog.proveedor} onChange={event=>setDialog(d=>({...d,proveedor:event.target.value}))}/></Field>}<Field label="Entrega esperada (opcional)"><input type="date" value={dialog.fechaEntrega} onChange={event=>setDialog(d=>({...d,fechaEntrega:event.target.value}))}/></Field></div>
   <fieldset className="cc-fieldset"><legend>Productos</legend>
    <Field label="Buscar producto"><input type="search" value={dialog.search} placeholder="Nombre, referencia o código" onChange={event=>setDialog(d=>({...d,search:event.target.value}))}/></Field>
    {productMatches.length>0&&<ul className="cc-picker">{productMatches.map(p=><li key={p.id}><button type="button" onClick={()=>addProduct(p)}>{p.nombre}<small>Stock {p.stock} · mínimo {p.stock_minimo}{p.precio_compra!=null?' · costo '+money(p.precio_compra):''}</small></button></li>)}</ul>}
    {dialog.items.length>0&&<ul className="cc-list">{dialog.items.map(item=><li key={item.producto_id}><div><strong>{item.nombre}</strong></div><input aria-label={`Cantidad de ${item.nombre}`} className="cc-qty" type="number" min="1" step="1" value={item.cantidad} onChange={event=>setDialog(d=>({...d,items:d.items.map(entry=>entry.producto_id===item.producto_id?{...entry,cantidad:event.target.value}:entry)}))}/><MoneyInput aria-label={`Costo esperado de ${item.nombre}`} className="dc-cost" placeholder="Costo" value={item.costo} onChange={event=>setDialog(d=>({...d,items:d.items.map(entry=>entry.producto_id===item.producto_id?{...entry,costo:event.target.value}:entry)}))}/><button type="button" className="cw-btn cw-btn-small" onClick={()=>setDialog(d=>({...d,items:d.items.filter(entry=>entry.producto_id!==item.producto_id)}))}>Quitar</button></li>)}</ul>}
    <p className="cc-total">Total estimado: <strong>{money(orderDialogTotal)}</strong></p></fieldset>
   <Field label="Nota (opcional)"><textarea rows={2} maxLength={500} value={dialog.nota} onChange={event=>setDialog(d=>({...d,nota:event.target.value}))}/></Field>
   {!dialog.id&&<label className="cc-check"><input type="checkbox" checked={dialog.enviar} onChange={event=>setDialog(d=>({...d,enviar:event.target.checked}))}/>Marcar como enviada al proveedor</label>}
   <div className="cw-modal-actions"><button type="button" className="cw-btn" onClick={()=>setDialog(null)}>Cancelar</button><button type="submit" className="cw-btn cw-btn-primary" disabled={op.busy}>{dialog.id?'Guardar cambios':'Crear orden'}</button></div></form></Modal>}
  {dialog?.type==='orderDone'&&(()=>{const supplier=supplierOf(dialog.order.supplierId);return <Modal title={`Orden ${dialog.order.numero}`} onClose={()=>setDialog(null)}><p>{dialog.order.proveedor} · {PO_STATUS[dialog.order.estado]} · total estimado <strong>{money(dialog.order.total)}</strong>.</p><div className="cw-modal-actions"><button type="button" className="cw-btn" onClick={()=>setDialog(null)}>Listo</button><button type="button" className="cw-btn" onClick={()=>print(purchaseOrderMarkup({order:dialog.order,company,supplier,status:PO_STATUS[dialog.order.estado]}),'Orden '+dialog.order.numero)}>Imprimir o PDF</button><a className="cw-btn cw-btn-primary" href={shareLink(supplier.telefono,orderMessage(dialog.order,company))} target="_blank" rel="noopener noreferrer">Enviar por WhatsApp</a></div></Modal>})()}
  {dialog?.type==='receive'&&<Modal wide title={`Recibir ${dialog.order.numero}`} busy={op.busy} onClose={()=>setDialog(null)}><form className="cw-form" onSubmit={receive}>{op.error&&<div className="cw-error" role="alert">{op.error}</div>}
   <p>Escribe lo que llegó. Se registra como compra de {dialog.order.proveedor}, suben las existencias y se recalcula el costo promedio.</p>
   <ul className="cc-list">{dialog.items.map(item=><li key={item.producto_id}><div><strong>{item.nombre}</strong><small>Pendientes: {item.pendiente}</small></div><input aria-label={`Recibidas de ${item.nombre}`} className="cc-qty" type="number" min="0" max={item.pendiente} step="1" value={item.cantidad} disabled={!item.pendiente} onChange={event=>setDialog(d=>({...d,items:d.items.map(entry=>entry.producto_id===item.producto_id?{...entry,cantidad:event.target.value}:entry)}))}/><MoneyInput aria-label={`Costo de ${item.nombre}`} className="dc-cost" placeholder="Costo" value={item.costo} disabled={!item.pendiente} onChange={event=>setDialog(d=>({...d,items:d.items.map(entry=>entry.producto_id===item.producto_id?{...entry,costo:event.target.value}:entry)}))}/></li>)}</ul>
   <div className="cw-form-grid"><Field label="Fecha de recepción"><input type="date" max={today} required value={dialog.fecha} onChange={event=>setDialog(d=>({...d,fecha:event.target.value}))}/></Field><Field label="Factura del proveedor (opcional)"><input maxLength={60} value={dialog.factura} onChange={event=>setDialog(d=>({...d,factura:event.target.value}))}/></Field></div>
   {dialog.order.supplierId?<label className="cc-check"><input type="checkbox" checked={dialog.credito} onChange={event=>setDialog(d=>({...d,credito:event.target.checked}))}/>A crédito (plazo del proveedor: {supplierOf(dialog.order.supplierId).plazoDias||0} días)</label>:<p className="cw-footnote">Para registrarla a crédito, la orden debe tener la ficha del proveedor.</p>}
   <div className="cw-modal-actions"><button type="button" className="cw-btn" onClick={()=>setDialog(null)}>Cancelar</button><button type="submit" className="cw-btn cw-btn-primary" disabled={op.busy}>Registrar recepción</button></div></form></Modal>}
  {dialog?.type==='cancelOrder'&&<Modal title={`Anular ${dialog.order.numero}`} busy={op.busy} onClose={()=>setDialog(null)}><form className="cw-form" onSubmit={event=>{event.preventDefault();if(!dialog.motivo.trim()){op.setError('Escribe el motivo.');return}transition(dialog.order,'po.cancel',`Orden ${dialog.order.numero} anulada.`,{motivo:dialog.motivo.trim()})}}>{op.error&&<div className="cw-error" role="alert">{op.error}</div>}<Field label="Motivo"><textarea rows={2} maxLength={500} required value={dialog.motivo} onChange={event=>setDialog(d=>({...d,motivo:event.target.value}))}/></Field><div className="cw-modal-actions"><button type="button" className="cw-btn" onClick={()=>setDialog(null)}>Volver</button><button type="submit" className="cw-btn cw-btn-danger" disabled={op.busy}>Anular orden</button></div></form></Modal>}
  {dialog?.type==='pay'&&<Modal title={`Pago a ${dialog.account.nombre}`} busy={op.busy} onClose={()=>setDialog(null)}><form className="cw-form" onSubmit={pay}>{op.error&&<div className="cw-error" role="alert">{op.error}</div>}
   <p>Saldo pendiente: <strong>{money(dialog.account.saldo)}</strong>. El pago se aplica primero a la compra más antigua.</p>
   <Field label="Valor del pago (COP)"><MoneyInput required value={dialog.amount} onChange={event=>setDialog(d=>({...d,amount:event.target.value}))}/></Field>
   <button type="button" className="cw-text-button" onClick={()=>setDialog(d=>({...d,amount:String(d.account.saldo)}))}>Pagar todo el saldo</button>
   <MethodSelect value={dialog.method} onChange={method=>setDialog(d=>({...d,method}))}/>
   {dialog.method==='efectivo'&&<p className="cw-muted">En efectivo, el pago sale de la caja de hoy (fila Gastos del cierre).</p>}
   <Field label="Nota (opcional)"><input maxLength={300} value={dialog.nota} onChange={event=>setDialog(d=>({...d,nota:event.target.value}))}/></Field>
   <div className="cw-modal-actions"><button type="button" className="cw-btn" onClick={()=>setDialog(null)}>Cancelar</button><button type="submit" className="cw-btn cw-btn-primary" disabled={op.busy}>Registrar pago</button></div></form></Modal>}
  {dialog?.type==='paid'&&<Modal title="Pago registrado" onClose={()=>setDialog(null)}><p>{dialog.payment.numero} · {dialog.payment.proveedor}: <strong>{money(dialog.payment.amount)}</strong>. Saldo pendiente: {money(dialog.payment.saldoDespues)}.</p><div className="cw-modal-actions"><button type="button" className="cw-btn" onClick={()=>setDialog(null)}>Listo</button><button type="button" className="cw-btn cw-btn-primary" onClick={()=>print(supplierPaymentMarkup({payment:dialog.payment,company}),'Pago '+dialog.payment.numero)}>Imprimir comprobante</button></div></Modal>}
  {dialog?.type==='supplier'&&<Modal title={dialog.id?'Editar proveedor':'Nuevo proveedor'} busy={op.busy} onClose={()=>setDialog(null)}><form className="cw-form" onSubmit={saveSupplier}>{op.error&&<div className="cw-error" role="alert">{op.error}</div>}
   <Field label="Nombre o razón social"><input required maxLength={200} value={dialog.nombre} onChange={event=>setDialog(d=>({...d,nombre:event.target.value}))}/></Field>
   <div className="cw-form-grid"><Field label="NIT"><input maxLength={40} value={dialog.nit} onChange={event=>setDialog(d=>({...d,nit:event.target.value}))}/></Field><Field label="Plazo de pago (días)" hint="0 = de contado."><input type="number" inputMode="numeric" min="0" max="365" step="1" value={dialog.plazoDias} onChange={event=>setDialog(d=>({...d,plazoDias:event.target.value}))}/></Field></div>
   <div className="cw-form-grid"><Field label="Contacto"><input maxLength={200} value={dialog.contacto} onChange={event=>setDialog(d=>({...d,contacto:event.target.value}))}/></Field><Field label="Teléfono / WhatsApp"><input type="tel" inputMode="tel" maxLength={30} value={dialog.telefono} onChange={event=>setDialog(d=>({...d,telefono:event.target.value}))}/></Field></div>
   <div className="cw-form-grid"><Field label="Correo"><input type="email" maxLength={254} value={dialog.correo} onChange={event=>setDialog(d=>({...d,correo:event.target.value}))}/></Field><Field label="Dirección"><input maxLength={300} value={dialog.direccion} onChange={event=>setDialog(d=>({...d,direccion:event.target.value}))}/></Field></div>
   <Field label="Notas"><textarea rows={2} maxLength={500} value={dialog.notas} onChange={event=>setDialog(d=>({...d,notas:event.target.value}))}/></Field>
   <div className="cw-modal-actions"><button type="button" className="cw-btn" onClick={()=>setDialog(null)}>Cancelar</button><button type="submit" className="cw-btn cw-btn-primary" disabled={op.busy}>Guardar proveedor</button></div></form></Modal>}
 </section>;
}
