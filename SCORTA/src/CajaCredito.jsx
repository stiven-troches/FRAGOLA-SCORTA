// BE-15 / BE-16 / BE-34: vistas «Caja», «Cartera» y «Separados» del espacio de la empresa.
// Celular primero: listas en tarjetas apiladas, tablas con desplazamiento y botones de 44 px.
import MoneyInput from './MoneyInput.jsx';
import React,{useMemo,useRef,useState} from 'react';
import Dialog from './Dialog.jsx';
import {money} from './format.mjs';
import {roundMoney,sumMoney} from '../money.mjs';
import * as venta from '../sale-pricing.mjs';
import {AGING_BUCKETS,CASH_MOVEMENT_LABELS,CASH_OUT_TYPES,CASH_ROW_KEYS,CASH_ROW_LABELS,LAYAWAY_STATUS,cashBook,cashSettings,layawayExpired,portfolioSummary,whatsappLink} from '../caja-credito.mjs';
import {cashMovementMarkup,creditPaymentMarkup,layawayMarkup,printVoucher,statementMarkup} from './voucher-ticket.mjs';
import './caja-credito.css';

export const todayBogota=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const humanDate=value=>{if(!value)return '—';const date=new Date(String(value).length===10?value+'T12:00:00Z':value);return Number.isNaN(date.getTime())?String(value):date.toLocaleDateString('es-CO',{timeZone:'America/Bogota',day:'numeric',month:'short',year:'numeric'})};
const norm=value=>String(value??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const uuid=()=>globalThis.crypto.randomUUID();
const validAmount=(value,{allowZero=false}={})=>{if(String(value??'').trim()==='')return null;const number=Number(value);return Number.isFinite(number)&&number>=0&&(allowZero||number>0)&&Math.abs(Math.round(number*100)-number*100)<1e-7&&number<=1e12?number:null};

export function Field({label,children,hint}){return <label className="cw-field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>}
export function Heading({company,title,subtitle,children}){return <header className="cw-page-heading"><div><p className="cw-eyebrow">{company}</p><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div><div className="cw-actions">{children}</div></header>}
export function Metric({label,value,tone}){return <div className={`cw-card cc-metric${tone?' cc-metric-'+tone:''}`}><span>{label}</span><strong>{value}</strong></div>}
export function Modal({title,onClose,busy,children,wide}){return <Dialog title={title} onClose={onClose} busy={busy} wide={wide} className={`cw-modal${wide?' cw-modal-wide':''}`} backdropClassName="cw-modal-backdrop cc-modal-backdrop" closeClassName="cw-icon-button" bodyClassName="cw-modal-body">{children}</Dialog>}
export function MethodSelect({value,onChange,extra=[],label='Medio de pago'}){return <Field label={label}><select value={value} onChange={event=>onChange(event.target.value)}>{venta.PAYMENT_METHODS.map(([key,name])=><option key={key} value={key}>{name}</option>)}{extra.map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></Field>}

/** Operación con requestId propio, error visible y comprobación si la respuesta se perdió. */
export function useOperation(onAction,onRetryAction){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false),[failure,setFailure]=useState(null),flight=useRef(false);
 // failure conserva el código y los detalles del último rechazo (p. ej. QUOTE_CHANGED).
 const perform=async action=>{if(flight.current||uncertain)return null;flight.current=true;setBusy(true);setError('');setFailure(null);try{return await onAction({...action,requestId:uuid()})||{}}catch(failure){setFailure(failure);setError(failure.message||'No se pudo guardar. Revisa la conexión.');setUncertain(!!failure.uncertain||failure.status===401||!failure.status||failure.status>=500);return null}finally{flight.current=false;setBusy(false)}};
 const retry=async()=>{if(flight.current||!onRetryAction)return null;flight.current=true;setBusy(true);setError('');try{const result=await onRetryAction();setUncertain(false);return result||{}}catch(failure){setError(failure.message||'No se pudo comprobar la operación.');return null}finally{flight.current=false;setBusy(false)}};
 return {busy,error,setError,uncertain,perform,retry,failure,setFailure};
}
export function Status({op,notice,onNotice}){return <>{op.error&&<div className="cw-error" role="alert">{op.error}</div>}{op.uncertain&&<div className="cw-error" role="alert"><p>No se confirmó el resultado. Compruébalo antes de repetir la operación.</p><button type="button" className="cw-btn cw-btn-small" onClick={op.retry}>Comprobar operación</button></div>}{notice&&<div className="cw-notice" role="status"><span>{notice}</span>{onNotice&&<button type="button" className="cw-text-button" onClick={()=>onNotice('')}>Cerrar</button>}</div>}</>}

// ---------------------------------------------------------------- Caja
export function CajaView({state={},session={},admin=false,company={},onAction,onRetryAction,onOpenClose}){
 const op=useOperation(onAction,onRetryAction),[notice,setNotice]=useState(''),[form,setForm]=useState(null);
 const today=todayBogota(),settings=cashSettings(state),companyName=company.name||'Mi empresa';
 const book=useMemo(()=>cashBook(state,today),[state,today]);
 const closed=(state.cashClosures||[]).some(record=>record.date===today);
 const movements=(state.cashMovements||[]).filter(item=>item.fecha===today);
 const methods=Object.keys(book.rows);
 const openForm=tipo=>{op.setError('');setNotice('');setForm({tipo,amount:'',method:'efectivo',motivo:''})};
 const submit=async event=>{
  event.preventDefault();const value=validAmount(form.amount,{allowZero:form.tipo==='base'});
  if(value==null){op.setError('Escribe un valor válido, con hasta dos decimales.');return}
  if(form.tipo!=='base'&&!form.motivo.trim()){op.setError('Escribe el motivo del movimiento.');return}
  if(form.tipo==='gasto'&&!admin&&value>settings.maxSellerExpense){op.setError(`Puedes registrar gastos hasta ${money(settings.maxSellerExpense)}. Pide al administrador que registre este gasto.`);return}
  const type={base:'cash.open',gasto:'cash.expense',retiro:'cash.withdrawal',ingreso:'cash.deposit'}[form.tipo];
  const result=await op.perform({type,form:{amount:value,method:form.method,motivo:form.motivo.trim()}});
  if(result){const saved=(result.state?.cashMovements||[]).find(item=>item.id===result.document?.id);setForm(null);setNotice(`${CASH_MOVEMENT_LABELS[form.tipo]} registrado por ${money(value)}.`);if(saved)setForm({printed:saved})}
 };
 return <section className="cc-view" aria-labelledby="cc-caja-title">
  <Heading company={companyName} title={<span id="cc-caja-title">Caja del día</span>} subtitle={`${humanDate(today)} · ${closed?'Caja cerrada':book.opening?'Caja abierta con base de '+money(book.opening.amount):'Sin apertura registrada'}`}>
   {admin&&<button type="button" className="cw-btn" disabled={!!book.opening||closed||op.busy} onClick={()=>openForm('base')}>Apertura de caja</button>}
   <button type="button" className="cw-btn cw-btn-primary" disabled={closed||op.busy} onClick={()=>openForm('gasto')}>Registrar gasto</button>
   {admin&&<button type="button" className="cw-btn" disabled={closed||op.busy} onClick={()=>openForm('retiro')}>Retiro</button>}
   {admin&&<button type="button" className="cw-btn" disabled={closed||op.busy} onClick={()=>openForm('ingreso')}>Ingreso</button>}
   {admin&&onOpenClose&&<button type="button" className="cw-btn" onClick={onOpenClose}>Cierre de caja</button>}
  </Heading>
  <Status op={op} notice={notice} onNotice={setNotice}/>
  {!admin&&<p className="cw-muted">Registra aquí los gastos pagados con dinero de la caja (transporte, almuerzo…). Tope por gasto: {money(settings.maxSellerExpense)}. El administrador hace la apertura, los retiros y el cierre.</p>}
  {admin&&<><div className="cc-metrics"><Metric label="Efectivo esperado ahora" value={money(book.expected.efectivo)} tone="main"/><Metric label="Ventas a crédito hoy" value={money(book.creditSales)}/><Metric label="Entregas de separados hoy" value={money(book.layawaySales)}/></div>
   <section className="cw-card cw-card-table" aria-label="Desglose por medio de pago"><div className="cw-table-wrap"><table className="cw-table cc-breakdown"><thead><tr><th scope="col">Concepto</th>{methods.map(key=><th key={key} scope="col">{venta.paymentLabel(key)}</th>)}</tr></thead><tbody>{CASH_ROW_KEYS.map(key=><tr key={key}><th scope="row">{CASH_ROW_LABELS[key]}</th>{methods.map(method=><td key={method}>{['gastos','retiros','devoluciones'].includes(key)&&book.rows[method][key]?'−':''}{money(book.rows[method][key])}</td>)}</tr>)}<tr className="cc-total-row"><th scope="row">Esperado</th>{methods.map(method=><td key={method}><strong>{money(book.expected[method])}</strong></td>)}</tr></tbody></table></div></section>
   <p className="cw-footnote">Esperado = base + ventas cobradas + abonos + separados + ingresos − gastos (incluye pagos a proveedores en efectivo) − retiros − devoluciones pagadas hoy. Las ventas a crédito y las entregas de separados no suman dinero hoy: se cobran con los abonos.</p></>}
  <section className="cw-card cc-list-card" aria-labelledby="cc-movements"><h2 id="cc-movements">Movimientos de hoy</h2>{!movements.length?<p className="cw-muted">Todavía no hay movimientos de caja hoy.</p>:<ul className="cc-list">{movements.map(item=><li key={item.id}><div><strong>{CASH_MOVEMENT_LABELS[item.tipo]}</strong><small>{item.motivo} · {venta.paymentLabel(item.method)} · {item.usuario}</small></div><strong className={CASH_OUT_TYPES.includes(item.tipo)?'cc-out':undefined}>{CASH_OUT_TYPES.includes(item.tipo)?'−':''}{money(item.amount)}</strong><button type="button" className="cw-btn cw-btn-small" onClick={()=>{if(!printVoucher(cashMovementMarkup({movement:item,company}),'Movimiento de caja'))op.setError('Permite abrir ventanas para imprimir el comprobante.')}}>Comprobante</button></li>)}</ul>}</section>
  {form&&!form.printed&&<Modal title={{base:'Apertura de caja',gasto:'Registrar gasto',retiro:'Retiro del dueño',ingreso:'Ingreso que no es venta'}[form.tipo]} busy={op.busy} onClose={()=>setForm(null)}><form className="cw-form" onSubmit={submit}>
   {op.error&&<div className="cw-error" role="alert">{op.error}</div>}
   <Field label={form.tipo==='base'?'Base inicial en efectivo (COP)':'Valor (COP)'} hint={form.tipo==='gasto'&&!admin?`Tope por gasto para vendedores: ${money(settings.maxSellerExpense)}`:form.tipo==='base'?'Dinero con que abre el cajón hoy. Solo una apertura por día.':null}><MoneyInput required value={form.amount} onChange={event=>setForm(f=>({...f,amount:event.target.value}))}/></Field>
   {form.tipo!=='base'&&<MethodSelect value={form.method} onChange={method=>setForm(f=>({...f,method}))}/>}
   <Field label={form.tipo==='base'?'Observación (opcional)':'Motivo'}><input maxLength={300} required={form.tipo!=='base'} placeholder={form.tipo==='gasto'?'Ej. transporte, almuerzo':form.tipo==='retiro'?'Ej. retiro del dueño':form.tipo==='ingreso'?'Ej. préstamo, devolución de proveedor':''} value={form.motivo} onChange={event=>setForm(f=>({...f,motivo:event.target.value}))}/></Field>
   <div className="cw-modal-actions"><button type="button" className="cw-btn" onClick={()=>setForm(null)}>Cancelar</button><button type="submit" className="cw-btn cw-btn-primary" disabled={op.busy}>Registrar</button></div>
  </form></Modal>}
  {form?.printed&&<Modal title="Movimiento registrado" onClose={()=>setForm(null)}><p>{CASH_MOVEMENT_LABELS[form.printed.tipo]} por <strong>{money(form.printed.amount)}</strong>.</p><div className="cw-modal-actions"><button type="button" className="cw-btn" onClick={()=>setForm(null)}>Listo</button><button type="button" className="cw-btn cw-btn-primary" onClick={()=>printVoucher(cashMovementMarkup({movement:form.printed,company}),'Movimiento de caja')}>Imprimir comprobante</button></div></Modal>}
 </section>;
}

// ---------------------------------------------------------------- Cartera
const reminderText=(account,company)=>`Hola ${account.nombre}, te saludamos de ${company.name||'el almacén'}. Tu saldo pendiente es de ${money(account.saldo)}${account.vencido?`, de los cuales ${money(account.vencido)} están vencidos`:''}. Puedes abonar en el almacén o por transferencia. ¡Gracias!`;
export function CarteraView({state={},session={},admin=false,company={},onAction,onRetryAction}){
 const op=useOperation(onAction,onRetryAction),[notice,setNotice]=useState(''),[query,setQuery]=useState(''),[onlyOverdue,setOnlyOverdue]=useState(false),[dialog,setDialog]=useState(null);
 const today=todayBogota(),companyName=company.name||'Mi empresa';
 const accounts=state.creditAccounts||[],summary=portfolioSummary(accounts);
 const visible=accounts.filter(account=>(account.saldo>0||account.saldoAFavor>0||!query&&!onlyOverdue&&account.creditLimit>0)&&(!onlyOverdue||account.vencido>0)&&(!query||norm([account.nombre,account.telefono,account.numeroDocumento].join(' ')).includes(norm(query))));
 const directory=state.customerDirectory||[];
 const print=(markup,title)=>{if(!printVoucher(markup,title))op.setError('Permite abrir ventanas para imprimir o guardar como PDF.')};
 const pay=async event=>{
  event.preventDefault();const value=validAmount(dialog.amount);const account=dialog.account;
  if(value==null){op.setError('Escribe el valor del abono.');return}
  if(value>account.saldo){op.setError(`El abono no puede superar el saldo de ${money(account.saldo)}.`);return}
  const result=await op.perform({type:'credit.payment',form:{customerId:account.customerId,amount:value,method:dialog.method}});
  if(result){const payment=(result.state?.creditPayments||[]).find(item=>item.id===result.document?.id);setNotice(`Abono de ${money(value)} registrado a ${account.nombre}.`);setDialog(payment?{type:'paid',payment}:null)}
 };
 const assign=async event=>{
  event.preventDefault();const limit=validAmount(dialog.limit,{allowZero:true});
  if(!dialog.customerId){op.setError('Selecciona el cliente.');return}if(limit==null){op.setError('Escribe el cupo (puede ser cero).');return}
  const days=String(dialog.days||'').trim();if(days&&(!Number.isSafeInteger(Number(days))||Number(days)<1||Number(days)>365)){op.setError('El plazo debe estar entre 1 y 365 días.');return}
  const result=await op.perform({type:'customer.update',id:dialog.customerId,form:{creditLimit:limit,creditDays:days?Number(days):''}});
  if(result){setDialog(null);setNotice('Cupo de crédito actualizado.')}
 };
 const statementAccount=dialog?.type==='statement'?accounts.find(a=>a.customerId===dialog.account.customerId)||dialog.account:null;
 return <section className="cc-view" aria-labelledby="cc-cartera-title">
  <Heading company={companyName} title={<span id="cc-cartera-title">Cartera</span>} subtitle="Clientes con saldo a crédito, vencidos y abonos.">{admin&&<button type="button" className="cw-btn cw-btn-primary" onClick={()=>{op.setError('');setDialog({type:'limit',customerId:'',limit:'',days:'',search:''})}}>Asignar cupo</button>}</Heading>
  <Status op={op} notice={notice} onNotice={setNotice}/>
  <div className="cc-metrics"><Metric label="Cartera total" value={money(summary.saldo)} tone="main"/><Metric label="Vencido" value={money(summary.vencido)} tone={summary.vencido>0?'alert':''}/><Metric label="Clientes con saldo" value={String(summary.clientes)}/></div>
  <section className="cw-card cc-aging" aria-label="Antigüedad de la cartera"><h2>Antigüedad</h2><div>{AGING_BUCKETS.map(key=><span key={key}><small>{key==='+90'?'Más de 90 días':key+' días'}</small><strong>{money(summary.antiguedad[key])}</strong></span>)}</div></section>
  <div className="cw-tools"><div className="cw-search"><input type="search" aria-label="Buscar cliente en cartera" placeholder="Cliente, teléfono o documento" value={query} onChange={event=>setQuery(event.target.value)}/></div><label className="cc-check"><input type="checkbox" checked={onlyOverdue} onChange={event=>setOnlyOverdue(event.target.checked)}/>Solo vencidos</label></div>
  {!visible.length?<div className="cw-card cw-empty"><p>{accounts.length?'No hay clientes con saldo para esta búsqueda.':'Aún no hay ventas a crédito. Asigna un cupo en la ficha del cliente y elige «Crédito» al cobrar.'}</p></div>:
  <ul className="cc-cards">{visible.map(account=>{const link=whatsappLink(account.telefono,reminderText(account,company));return <li key={account.customerId} className="cw-card">
   <div className="cc-card-head"><div><strong>{account.nombre}</strong><small>{account.telefono||'Sin teléfono'}{account.creditLimit?` · Cupo ${money(account.creditLimit)} · Disponible ${money(account.disponible)}`:''}</small></div><div className="cc-amount"><strong>{money(account.saldo)}</strong>{account.vencido>0&&<span className="cw-tag cw-tag-danger">Vencido {money(account.vencido)}</span>}{account.saldoAFavor>0&&<span className="cw-tag">A favor {money(account.saldoAFavor)}</span>}</div></div>
   <div className="cc-card-actions">{account.saldo>0&&<button type="button" className="cw-btn cw-btn-primary cw-btn-small" onClick={()=>{op.setError('');setDialog({type:'pay',account,amount:'',method:'efectivo'})}}>Registrar abono</button>}<button type="button" className="cw-btn cw-btn-small" onClick={()=>setDialog({type:'statement',account})}>Estado de cuenta</button>{link&&account.saldo>0&&<a className="cw-btn cw-btn-small" href={link} target="_blank" rel="noopener noreferrer">Recordar por WhatsApp</a>}</div>
  </li>})}</ul>}
  {dialog?.type==='pay'&&<Modal title={`Abono de ${dialog.account.nombre}`} busy={op.busy} onClose={()=>setDialog(null)}><form className="cw-form" onSubmit={pay}>{op.error&&<div className="cw-error" role="alert">{op.error}</div>}
   <p>Saldo pendiente: <strong>{money(dialog.account.saldo)}</strong>. El abono se aplica primero a la factura más antigua.</p>
   <Field label="Valor del abono (COP)"><MoneyInput required value={dialog.amount} onChange={event=>setDialog(d=>({...d,amount:event.target.value}))}/></Field>
   <button type="button" className="cw-text-button" onClick={()=>setDialog(d=>({...d,amount:String(d.account.saldo)}))}>Pagar todo el saldo</button>
   <MethodSelect value={dialog.method} onChange={method=>setDialog(d=>({...d,method}))} extra={dialog.account.saldoAFavor>0?[[venta.FAVOR_METHOD,`Saldo a favor (${money(dialog.account.saldoAFavor)})`]]:[]}/>
   <div className="cw-modal-actions"><button type="button" className="cw-btn" onClick={()=>setDialog(null)}>Cancelar</button><button type="submit" className="cw-btn cw-btn-primary" disabled={op.busy}>Registrar abono</button></div></form></Modal>}
  {dialog?.type==='paid'&&<Modal title="Abono registrado" onClose={()=>setDialog(null)}><p>{dialog.payment.numero} · {dialog.payment.cliente}: <strong>{money(dialog.payment.amount)}</strong>. Saldo pendiente: {money(dialog.payment.saldoDespues)}.</p><div className="cw-modal-actions"><button type="button" className="cw-btn" onClick={()=>setDialog(null)}>Listo</button><button type="button" className="cw-btn cw-btn-primary" onClick={()=>print(creditPaymentMarkup({payment:dialog.payment,company}),'Abono '+dialog.payment.numero)}>Imprimir comprobante</button></div></Modal>}
  {statementAccount&&<Modal wide title={`Estado de cuenta · ${statementAccount.nombre}`} onClose={()=>setDialog(null)}>
   <dl className="cw-definition"><div><dt>Saldo</dt><dd>{money(statementAccount.saldo)}</dd></div><div><dt>Vencido</dt><dd>{money(statementAccount.vencido)}</dd></div><div><dt>Cupo</dt><dd>{statementAccount.creditLimit?money(statementAccount.creditLimit):'Sin cupo'}</dd></div><div><dt>Saldo a favor</dt><dd>{money(statementAccount.saldoAFavor)}</dd></div></dl>
   <div className="cw-table-wrap"><table className="cw-table"><thead><tr><th>Factura</th><th>Vence</th><th>Crédito</th><th>Saldo</th></tr></thead><tbody>{statementAccount.facturas.map(item=><tr key={item.saleId}><td>{humanDate(item.fecha)}<small>{item.anulada?'Anulada':item.dias+' días'}</small></td><td>{humanDate(item.vence)}{item.vencida&&<small className="cc-out">Vencida hace {item.diasVencida} días</small>}</td><td>{money(item.monto)}</td><td><strong>{money(item.saldo)}</strong></td></tr>)}</tbody></table></div>
   {statementAccount.abonos.length>0&&<><h3>Abonos</h3><ul className="cc-list">{statementAccount.abonos.slice(0,20).map(item=><li key={item.id}><div><strong>{item.numero||'Abono'}</strong><small>{humanDate(item.fecha)} · {venta.paymentLabel(item.method)}</small></div><strong>{money(item.amount)}</strong></li>)}</ul></>}
   <div className="cw-modal-actions"><button type="button" className="cw-btn" onClick={()=>print(statementMarkup({account:statementAccount,company,today}),'Estado de cuenta')}>Imprimir o guardar PDF</button>{whatsappLink(statementAccount.telefono,reminderText(statementAccount,company))&&<a className="cw-btn cw-btn-primary" href={whatsappLink(statementAccount.telefono,reminderText(statementAccount,company))} target="_blank" rel="noopener noreferrer">Recordar por WhatsApp</a>}</div>
  </Modal>}
  {dialog?.type==='limit'&&admin&&<Modal title="Cupo de crédito" busy={op.busy} onClose={()=>setDialog(null)}><form className="cw-form" onSubmit={assign}>{op.error&&<div className="cw-error" role="alert">{op.error}</div>}
   <p>El cupo es el saldo máximo que el cliente puede deber. El vendedor no puede superarlo; el administrador recibe una advertencia.</p>
   <Field label="Buscar cliente"><input type="search" value={dialog.search} placeholder="Nombre, teléfono o documento" onChange={event=>setDialog(d=>({...d,search:event.target.value}))}/></Field>
   <Field label="Cliente"><select required value={dialog.customerId} onChange={event=>{const card=directory.find(c=>c.id===event.target.value);setDialog(d=>({...d,customerId:event.target.value,limit:card?.creditLimit!=null?String(card.creditLimit||''):'',days:card?.creditDays?String(card.creditDays):''}))}}><option value="">Selecciona una ficha</option>{directory.filter(c=>!dialog.search||norm([c.nombre,c.telefono,c.numeroDocumento].join(' ')).includes(norm(dialog.search))).slice(0,200).map(c=><option key={c.id} value={c.id}>{c.nombre}{c.telefono?' · '+c.telefono:''}</option>)}</select></Field>
   <div className="cw-form-grid"><Field label="Cupo (COP)"><MoneyInput required value={dialog.limit} onChange={event=>setDialog(d=>({...d,limit:event.target.value}))}/></Field><Field label="Plazo en días" hint={`Vacío: ${cashSettings(state).creditDays} días (opción general).`}><input type="number" inputMode="numeric" min="1" max="365" step="1" value={dialog.days} onChange={event=>setDialog(d=>({...d,days:event.target.value}))}/></Field></div>
   <div className="cw-modal-actions"><button type="button" className="cw-btn" onClick={()=>setDialog(null)}>Cancelar</button><button type="submit" className="cw-btn cw-btn-primary" disabled={op.busy}>Guardar cupo</button></div></form></Modal>}
 </section>;
}

// ---------------------------------------------------------------- Separados
const FILTERS=[['activo','Activos'],['vencido','Vencidos'],['entregado','Entregados'],['cancelado','Cancelados']];
export function SeparadosView({state={},session={},admin=false,company={},onAction,onRetryAction}){
 const op=useOperation(onAction,onRetryAction),[notice,setNotice]=useState(''),[filter,setFilter]=useState('activo'),[query,setQuery]=useState(''),[dialog,setDialog]=useState(null);
 const today=todayBogota(),companyName=company.name||'Mi empresa',settings=venta.saleSettings(state),cash=cashSettings(state);
 const layaways=state.layaways||[],prods=state.prods||[],directory=state.customerDirectory||[];
 const matches=layaway=>filter==='vencido'?layawayExpired(layaway,today):filter==='activo'?layaway.estado==='activo':layaway.estado===filter;
 const visible=layaways.filter(layaway=>matches(layaway)&&(!query||norm([layaway.numero,layaway.cliente,layaway.telefono].join(' ')).includes(norm(query))));
 const counts=Object.fromEntries(FILTERS.map(([key])=>[key,layaways.filter(l=>key==='vencido'?layawayExpired(l,today):l.estado===key).length]));
 const print=(markup,title)=>{if(!printVoucher(markup,title))op.setError('Permite abrir ventanas para imprimir o guardar como PDF.')};
 const card=dialog?.type==='new'&&dialog.customerId?directory.find(c=>c.id===dialog.customerId):null;
 const tipo=card?venta.customerType(card.tipo):'mostrador';
 const lines=dialog?.type==='new'?dialog.items.map(item=>{const product=prods.find(p=>p.id===item.producto_id);return product?{...item,product,price:venta.listPrice(product,tipo,settings)}:null}).filter(Boolean):[];
 const newTotal=sumMoney(lines.map(line=>roundMoney(line.price*(Number(line.cantidad)||0))));
 const productMatches=dialog?.type==='new'&&dialog.search.trim().length>=2?prods.filter(p=>p.stock>0&&norm([p.nombre,p.referencia,p.codigo_barras].join(' ')).includes(norm(dialog.search))).slice(0,8):[];
 const startNew=()=>{op.setError('');setNotice('');setDialog({type:'new',customerId:'',cliente:'',telefono:'',dataConsent:false,customerSearch:'',search:'',items:[],deposit:'',method:'efectivo',dias:String(cash.layawayDays)})};
 const addItem=product=>setDialog(d=>{const existing=d.items.find(item=>item.producto_id===product.id);return {...d,search:'',items:existing?d.items.map(item=>item===existing?{...item,cantidad:Math.min(product.stock,Number(item.cantidad)+1)}:item):[...d.items,{producto_id:product.id,cantidad:1}]}});
 const create=async event=>{
  event.preventDefault();
  if(!dialog.customerId&&!dialog.cliente.trim()){op.setError('Escribe el nombre de quien separa o selecciona su ficha.');return}
  if(!lines.length){op.setError('Agrega al menos un producto.');return}
  for(const line of lines)if(!Number.isSafeInteger(Number(line.cantidad))||Number(line.cantidad)<1||Number(line.cantidad)>line.product.stock){op.setError(`Revisa la cantidad de ${line.product.nombre}: hay ${line.product.stock} disponibles.`);return}
  const deposit=String(dialog.deposit).trim()===''?0:validAmount(dialog.deposit,{allowZero:true});
  if(deposit==null||deposit>newTotal){op.setError('El abono inicial debe ser un valor entre cero y el total.');return}
  if(!dialog.customerId&&dialog.telefono.trim()&&!dialog.dataConsent){op.setError('Confirma que el cliente autorizó el tratamiento de su teléfono.');return}
  const result=await op.perform({type:'layaway.create',form:{...(dialog.customerId?{customerId:dialog.customerId}:{cliente:dialog.cliente.trim(),telefono:dialog.telefono.trim(),...(dialog.telefono.trim()?{dataConsent:true}:{})}),dias:Number(dialog.dias)||cash.layawayDays,items:lines.map(line=>({producto_id:line.producto_id,cantidad:Number(line.cantidad)})),...(deposit>0?{deposit:{amount:deposit,method:dialog.method}}:{})}});
  if(result){const saved=(result.state?.layaways||[]).find(item=>item.id===result.document?.id);setNotice(saved?`Separado ${saved.numero} creado. La mercancía quedó reservada.`:'Separado creado.');setDialog(saved?{type:'done',layaway:saved}:null)}
 };
 const pay=async event=>{
  event.preventDefault();const value=validAmount(dialog.amount),layaway=dialog.layaway;
  if(value==null||value>layaway.saldo){op.setError(`Escribe un abono entre 1 y ${money(layaway.saldo)}.`);return}
  const deliver=dialog.deliver&&value===layaway.saldo;
  const result=await op.perform(deliver?{type:'layaway.deliver',id:layaway.id,form:{payment:{amount:value,method:dialog.method}}}:{type:'layaway.payment',id:layaway.id,form:{amount:value,method:dialog.method}});
  if(result){const saved=(result.state?.layaways||[]).find(item=>item.id===layaway.id);setNotice(deliver?`Separado ${layaway.numero} pagado y entregado.`:`Abono de ${money(value)} registrado al separado ${layaway.numero}.`);setDialog(saved?{type:'done',layaway:saved,paymentId:saved.abonos.at(-1)?.id}:null)}
 };
 const deliver=async layaway=>{if(!window.confirm(`¿Entregar la mercancía del separado ${layaway.numero} a ${layaway.cliente}? Se registra como venta de hoy.`))return;const result=await op.perform({type:'layaway.deliver',id:layaway.id});if(result)setNotice(`Separado ${layaway.numero} entregado. La venta quedó registrada.`)};
 const cancel=async event=>{
  event.preventDefault();const layaway=dialog.layaway;if(!dialog.motivo.trim()){op.setError('Escribe el motivo de la cancelación.');return}
  const result=await op.perform({type:'layaway.cancel',id:layaway.id,form:{motivo:dialog.motivo.trim(),...(layaway.pagado>0?{destino:dialog.destino,method:dialog.method}:{})}});
  if(result){setDialog(null);setNotice(`Separado ${layaway.numero} cancelado. La mercancía volvió al inventario.`)}
 };
 return <section className="cc-view" aria-labelledby="cc-separados-title">
  <Heading company={companyName} title={<span id="cc-separados-title">Separados</span>} subtitle="Mercancía apartada con abonos. Las unidades separadas no se pueden vender a otro cliente."><button type="button" className="cw-btn cw-btn-primary" onClick={startNew}>Nuevo separado</button></Heading>
  <Status op={op} notice={notice} onNotice={setNotice}/>
  <div className="cc-tabs" role="tablist" aria-label="Estado de los separados">{FILTERS.map(([key,label])=><button key={key} type="button" role="tab" aria-selected={filter===key} className={filter===key?'is-active':''} onClick={()=>setFilter(key)}>{label}<b>{counts[key]}</b></button>)}</div>
  <div className="cw-tools"><div className="cw-search"><input type="search" aria-label="Buscar separado" placeholder="Cliente, teléfono o número" value={query} onChange={event=>setQuery(event.target.value)}/></div></div>
  {!visible.length?<div className="cw-card cw-empty"><p>{layaways.length?'No hay separados en esta lista.':'Aún no hay separados. Usa «Nuevo separado» para apartar mercancía con un abono.'}</p></div>:
  <ul className="cc-cards">{visible.map(layaway=>{const expired=layawayExpired(layaway,today);return <li key={layaway.id} className="cw-card">
   <div className="cc-card-head"><div><strong>{layaway.numero} · {layaway.cliente}</strong><small>{(layaway.detalles||[]).map(line=>`${line.cantidad} × ${line.nombre}`).join(', ')}</small><small>Creado {humanDate(layaway.fecha)} · {layaway.estado==='activo'?`vence ${humanDate(layaway.vence)}`:LAYAWAY_STATUS[layaway.estado]}</small></div>
    <div className="cc-amount"><strong>{money(layaway.saldo)}</strong><small>de {money(layaway.total)} · abonado {money(layaway.pagado)}</small>{expired&&<span className="cw-tag cw-tag-danger">Vencido</span>}{layaway.estado!=='activo'&&<span className="cw-tag">{LAYAWAY_STATUS[layaway.estado]}</span>}</div></div>
   <div className="cc-card-actions">{layaway.estado==='activo'&&layaway.saldo>0&&<button type="button" className="cw-btn cw-btn-primary cw-btn-small" onClick={()=>{op.setError('');setDialog({type:'pay',layaway,amount:'',method:'efectivo',deliver:false})}}>Registrar abono</button>}
    {layaway.estado==='activo'&&layaway.saldo>0&&<button type="button" className="cw-btn cw-btn-small" onClick={()=>{op.setError('');setDialog({type:'pay',layaway,amount:String(layaway.saldo),method:'efectivo',deliver:true})}}>Pagar y entregar</button>}
    {layaway.estado==='activo'&&layaway.saldo===0&&<button type="button" className="cw-btn cw-btn-primary cw-btn-small" onClick={()=>deliver(layaway)}>Entregar</button>}
    <button type="button" className="cw-btn cw-btn-small" onClick={()=>print(layawayMarkup({layaway,company}),'Separado '+layaway.numero)}>Comprobante</button>
    {admin&&layaway.estado==='activo'&&<button type="button" className="cw-btn cw-btn-danger cw-btn-small" onClick={()=>{op.setError('');setDialog({type:'cancel',layaway,motivo:'',destino:layaway.customerId?'saldo_a_favor':'reembolso',method:'efectivo'})}}>Cancelar</button>}</div>
  </li>})}</ul>}
  {dialog?.type==='new'&&<Modal wide title="Nuevo separado" busy={op.busy} onClose={()=>setDialog(null)}><form className="cw-form" onSubmit={create}>{op.error&&<div className="cw-error" role="alert">{op.error}</div>}
   <fieldset className="cc-fieldset"><legend>Cliente</legend>
    <Field label="Buscar ficha (opcional)"><input type="search" value={dialog.customerSearch} placeholder="Nombre, teléfono o documento" onChange={event=>setDialog(d=>({...d,customerSearch:event.target.value}))}/></Field>
    {dialog.customerSearch.trim().length>=2&&!dialog.customerId&&<ul className="cc-picker">{directory.filter(c=>norm([c.nombre,c.telefono,c.numeroDocumento].join(' ')).includes(norm(dialog.customerSearch))).slice(0,6).map(c=><li key={c.id}><button type="button" onClick={()=>setDialog(d=>({...d,customerId:c.id,customerSearch:c.nombre}))}>{c.nombre}<small>{c.telefono}</small></button></li>)}</ul>}
    {card?<p className="cc-selected">Ficha: <strong>{card.nombre}</strong> <button type="button" className="cw-text-button" onClick={()=>setDialog(d=>({...d,customerId:'',customerSearch:''}))}>Quitar</button></p>:<div className="cw-form-grid"><Field label="Nombre"><input maxLength={200} value={dialog.cliente} onChange={event=>setDialog(d=>({...d,cliente:event.target.value}))}/></Field><Field label="Teléfono (opcional)"><input type="tel" inputMode="tel" maxLength={30} value={dialog.telefono} onChange={event=>setDialog(d=>({...d,telefono:event.target.value}))}/></Field></div>}
    {!card&&dialog.telefono.trim()&&<label className="cc-check"><input type="checkbox" checked={dialog.dataConsent} onChange={event=>setDialog(d=>({...d,dataConsent:event.target.checked}))}/>El cliente autorizó el tratamiento de su teléfono</label>}
   </fieldset>
   <fieldset className="cc-fieldset"><legend>Mercancía</legend>
    <Field label="Buscar producto"><input type="search" value={dialog.search} placeholder="Nombre, referencia o código" onChange={event=>setDialog(d=>({...d,search:event.target.value}))}/></Field>
    {productMatches.length>0&&<ul className="cc-picker">{productMatches.map(p=><li key={p.id}><button type="button" onClick={()=>addItem(p)}>{p.nombre}<small>{money(venta.listPrice(p,tipo,settings))} · {p.stock} disponibles</small></button></li>)}</ul>}
    {lines.length>0&&<ul className="cc-list">{lines.map(line=><li key={line.producto_id}><div><strong>{line.product.nombre}</strong><small>{money(line.price)} c/u · {line.product.stock} disponibles</small></div><input aria-label={`Cantidad de ${line.product.nombre}`} className="cc-qty" type="number" min="1" max={line.product.stock} step="1" value={line.cantidad} onChange={event=>setDialog(d=>({...d,items:d.items.map(item=>item.producto_id===line.producto_id?{...item,cantidad:event.target.value}:item)}))}/><button type="button" className="cw-btn cw-btn-small" onClick={()=>setDialog(d=>({...d,items:d.items.filter(item=>item.producto_id!==line.producto_id)}))}>Quitar</button></li>)}</ul>}
    <p className="cc-total">Total: <strong>{money(newTotal)}</strong></p>
   </fieldset>
   <div className="cw-form-grid"><Field label="Abono inicial (COP)"><MoneyInput value={dialog.deposit} onChange={event=>setDialog(d=>({...d,deposit:event.target.value}))}/></Field><MethodSelect value={dialog.method} onChange={method=>setDialog(d=>({...d,method}))}/><Field label="Vence en (días)"><input type="number" inputMode="numeric" min="1" max="365" step="1" value={dialog.dias} onChange={event=>setDialog(d=>({...d,dias:event.target.value}))}/></Field></div>
   <div className="cw-modal-actions"><button type="button" className="cw-btn" onClick={()=>setDialog(null)}>Cancelar</button><button type="submit" className="cw-btn cw-btn-primary" disabled={op.busy}>Separar mercancía</button></div></form></Modal>}
  {dialog?.type==='pay'&&<Modal title={`${dialog.deliver?'Pagar y entregar':'Abono'} · ${dialog.layaway.numero}`} busy={op.busy} onClose={()=>setDialog(null)}><form className="cw-form" onSubmit={pay}>{op.error&&<div className="cw-error" role="alert">{op.error}</div>}
   <p>{dialog.layaway.cliente} · saldo <strong>{money(dialog.layaway.saldo)}</strong>{dialog.deliver?'. Al pagar el saldo se entrega la mercancía y se registra la venta de hoy.':''}</p>
   <Field label="Valor (COP)"><MoneyInput required readOnly={dialog.deliver} value={dialog.amount} onChange={event=>setDialog(d=>({...d,amount:event.target.value}))}/></Field>
   <MethodSelect value={dialog.method} onChange={method=>setDialog(d=>({...d,method}))}/>
   <div className="cw-modal-actions"><button type="button" className="cw-btn" onClick={()=>setDialog(null)}>Cancelar</button><button type="submit" className="cw-btn cw-btn-primary" disabled={op.busy}>{dialog.deliver?'Pagar y entregar':'Registrar abono'}</button></div></form></Modal>}
  {dialog?.type==='done'&&<Modal title={`Separado ${dialog.layaway.numero}`} onClose={()=>setDialog(null)}><p>{dialog.layaway.cliente} · total {money(dialog.layaway.total)} · abonado {money(dialog.layaway.pagado)} · saldo <strong>{money(dialog.layaway.saldo)}</strong></p><div className="cw-modal-actions"><button type="button" className="cw-btn" onClick={()=>setDialog(null)}>Listo</button>{dialog.paymentId&&<button type="button" className="cw-btn" onClick={()=>print(layawayMarkup({layaway:dialog.layaway,company,paymentId:dialog.paymentId}),'Abono')}>Comprobante del abono</button>}<button type="button" className="cw-btn cw-btn-primary" onClick={()=>print(layawayMarkup({layaway:dialog.layaway,company}),'Separado '+dialog.layaway.numero)}>Comprobante del separado</button></div></Modal>}
  {dialog?.type==='cancel'&&admin&&<Modal title={`Cancelar separado ${dialog.layaway.numero}`} busy={op.busy} onClose={()=>setDialog(null)}><form className="cw-form" onSubmit={cancel}>{op.error&&<div className="cw-error" role="alert">{op.error}</div>}
   <p>La mercancía vuelve al inventario disponible. {dialog.layaway.pagado>0?<>El cliente abonó <strong>{money(dialog.layaway.pagado)}</strong>.</>:'No hay abonos que devolver.'}</p>
   {dialog.layaway.pagado>0&&<><Field label="¿Qué pasa con lo abonado?"><select value={dialog.destino} onChange={event=>setDialog(d=>({...d,destino:event.target.value}))}><option value="reembolso">Devolver el dinero hoy</option>{dialog.layaway.customerId&&<option value="saldo_a_favor">Dejarlo como saldo a favor del cliente</option>}</select></Field>{dialog.destino==='reembolso'&&<MethodSelect label="Devolver por" value={dialog.method} onChange={method=>setDialog(d=>({...d,method}))}/>}</>}
   <Field label="Motivo"><textarea rows={2} maxLength={500} required value={dialog.motivo} onChange={event=>setDialog(d=>({...d,motivo:event.target.value}))}/></Field>
   <div className="cw-modal-actions"><button type="button" className="cw-btn" onClick={()=>setDialog(null)}>Volver</button><button type="submit" className="cw-btn cw-btn-danger" disabled={op.busy}>Cancelar separado</button></div></form></Modal>}
 </section>;
}
