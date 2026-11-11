import Papa from 'papaparse';
import React, { useState, useEffect, useRef, createContext, useContext } from "react";
import SessionGate from "./SessionGate.jsx";

/* ======= HELPERS ======= */
const COP = (v) => new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",minimumFractionDigits:0}).format(v||0);
const DATE = (d) => { if(!d) return "-"; return new Date(d+"T12:00").toLocaleDateString("es-CO"); };
const TODAY = () => new Intl.DateTimeFormat("en-CA",{timeZone:"America/Bogota",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());

const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const matches = (p,q) => norm([p.nombre,p.categoria,p.referencia,p.marca,p.modelo,p.compatibilidad,p.codigo_barras].join(' ')).includes(norm(q));
const netSale = v => v.anulada ? 0 : v.total-v.detalles.reduce((n,d)=>n+(d.devuelto||0)*d.precio_unitario,0);
const localDate = value => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const WHEN = value => value ? new Date(value).toLocaleString('es-CO',{timeZone:'America/Bogota'}) : '—';

const ESTADOS_LIST   = ["pendiente","en_proceso","completado","entregado"];
const ESTADOS_LABELS = {pendiente:"Pendiente",en_proceso:"En Proceso",completado:"Completado",entregado:"Entregado"};

/* ======= SAMPLE DATA ======= */
/* ======= MICRO-COMPONENTS ======= */
const S = { // shared styles
  th:   {textAlign:"left",padding:"10px 16px",fontSize:11,fontWeight:700,color:"#526479",textTransform:"uppercase",letterSpacing:"0.05em",background:"#F8FAFC",borderBottom:"1px solid #E2E8F0"},
  td:   {padding:"11px 16px",borderBottom:"1px solid #E2E8F0",verticalAlign:"middle",fontSize:13},
  card: {background:"white",borderRadius:8,boxShadow:"0 1px 3px rgba(0,0,0,0.1)",overflowX:"auto"},
  input:{padding:"9px 12px",border:"1.5px solid #E2E8F0",borderRadius:6,fontSize:14,color:"#1E293B",background:"white",width:"100%"},
};

function StockPill({stock,minimo}) {
  if (stock===0) return <span style={{display:"inline-block",padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:"#FEE2E2",color:"#991B1B"}}>Agotado</span>;
  if (stock<=minimo) return <span style={{display:"inline-block",padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:"#FEF3C7",color:"#92400E"}}>{stock} ⚠️</span>;
  return <span style={{display:"inline-block",padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:"#DCFCE7",color:"#166534"}}>{stock}</span>;
}

function StatusPill({estado}) {
  const styles={pendiente:{bg:"#FEF3C7",c:"#92400E"},en_proceso:{bg:"#DBEAFE",c:"#1E40AF"},completado:{bg:"#DCFCE7",c:"#166534"},entregado:{bg:"#F3F4F6",c:"#374151"}};
  const s=styles[estado]||{bg:"#F3F4F6",c:"#374151"};
  return <span style={{display:"inline-block",padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,textTransform:"uppercase",background:s.bg,color:s.c}}>{ESTADOS_LABELS[estado]||estado}</span>;
}

function Btn({children,onClick,type="button",variant="primary",sm=false,disabled=false,...rest}) {
  const v={primary:{background:"#2563EB",color:"white"},secondary:{background:"#E2E8F0",color:"#1E293B"},success:{background:"#147A39",color:"white"}};
  return <button {...rest} className={`btn btn-${variant}${sm?" btn-sm":""}`} type={type} onClick={onClick} disabled={disabled}
    style={{padding:sm?"4px 10px":"8px 16px",borderRadius:6,fontSize:sm?11:13,fontWeight:600,cursor:disabled?"not-allowed":"pointer",border:"none",opacity:disabled?0.5:1,...v[variant]||v.primary}}>
    {children}
  </button>;
}

function FG({children,label,span=1}) {
  return <div style={{gridColumn:`span ${span}`}}>
    <label style={{display:"block",fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.04em",color:"#475569",marginBottom:4}}>{label}{children}</label>
  </div>;
}

function MInput({value,onChange,type="text",placeholder="",required=false,min,step,rows,disabled=false,...rest}) {
  const s=S.input;
  if (rows) return <textarea {...rest} value={value??""} onChange={onChange} required={required} rows={rows} placeholder={placeholder} style={{...s,resize:"vertical"}}/>;
  return <input {...rest} disabled={disabled} type={type} value={value??""} onChange={onChange} required={required} min={min} step={step} placeholder={placeholder} style={s}/>;
}

function MSelect({value,onChange,children,...rest}) {
  return <select {...rest} value={value||""} onChange={onChange} style={{...S.input,cursor:"pointer"}}>{children}</select>;
}

const ModalFeedback=createContext({});

function ModalWrap({title,onClose,children,wide=false}) {
  const feedback=useContext(ModalFeedback);
  const box=useRef(null), closeRef=useRef(onClose);
  closeRef.current=onClose;
  const lastActive=useRef(feedback.sessionActive);
  useEffect(()=>{if(feedback.sessionActive&&!lastActive.current)box.current?.querySelector('input:not(:disabled),select:not(:disabled),textarea:not(:disabled),button:not(:disabled)')?.focus();lastActive.current=feedback.sessionActive},[feedback.sessionActive]);
  useEffect(()=>{const prior=document.activeElement;const el=box.current;el?.querySelector('input,select,textarea,button')?.focus();const key=e=>{if(el.closest('[hidden]'))return;if(e.key==='Escape'){e.preventDefault();closeRef.current()}if(e.key==='Tab'){const controls=[...el.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]')];if(!controls.length)return;const first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);prior?.focus()}},[]);
  return (
    <div ref={box} role="dialog" aria-modal="true" aria-label={title} onClick={e=>e.target===e.currentTarget&&onClose()}
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:20}}>
      <div className="modal-panel" style={{background:"white",borderRadius:12,width:"100%",maxWidth:wide?820:540,maxHeight:"90vh",display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:"0 25px 70px rgba(0,0,0,0.25)"}}>
        <div className="modal-heading" style={{padding:"16px 20px",borderBottom:"1px solid #E2E8F0",display:"flex",alignItems:"center",justifyContent:"space-between",background:"#F8FAFC",flexShrink:0}}>
          <h2 style={{fontSize:16,fontWeight:700}}>{title}</h2>
          <button aria-label="Cerrar ventana" onClick={onClose} style={{background:"none",border:"none",fontSize:18,cursor:"pointer",color:"#526479",padding:"4px 8px",borderRadius:4}}>✕</button>
        </div>
        <div className="modal-feedback">
          {feedback.toast&&<div role={feedback.toast.type==='error'?'alert':'status'} className={`inline-message ${feedback.toast.type==='error'?'is-error':''}`}><span>{feedback.toast.msg}</span><button type="button" aria-label="Cerrar mensaje" onClick={feedback.clearToast}>×</button></div>}
          {feedback.pending&&<div className="inline-message" role="alert"><p>La operación no está confirmada. Tus datos están conservados.</p><Btn disabled={feedback.busy} onClick={feedback.retry}>Reintentar operación</Btn></div>}
        </div>
        <fieldset disabled={feedback.busy||!!feedback.pending} className="modal-content" style={{border:0,padding:0,margin:0,minWidth:0,overflowY:'auto',flex:1}}>{children}</fieldset>
      </div>
    </div>
  );
}

function MBody({children}) { return <div className="modal-body" style={{padding:20}}>{children}</div>; }
function MFoot({children}) { return <div className="modal-footer sticky-total" style={{padding:"14px 20px",borderTop:"1px solid #E2E8F0",display:"flex",gap:8,justifyContent:"flex-end",background:"#F8FAFC",flexShrink:0}}>{children}</div>; }

function DetailTable({detalles}) {
  const total=detalles.reduce((n,d)=>n+d.cantidad*d.precio_unitario,0);
  return <table className="data-table"><thead><tr><th>Producto</th><th>Cantidad original</th><th>Devuelto / revertido</th><th>Precio unitario</th><th>Subtotal original</th></tr></thead><tbody>{detalles.map((d,i)=><tr key={i}><td data-label="Producto">{d.nombre}</td><td data-label="Cantidad original">{d.cantidad}</td><td data-label="Devuelto / revertido">{d.devuelto||0}</td><td data-label="Precio unitario">{COP(d.precio_unitario)}</td><td data-label="Subtotal original">{COP(d.cantidad*d.precio_unitario)}</td></tr>)}</tbody><tfoot><tr><td data-label="Total productos" colSpan={5}>Total original de productos: <strong>{COP(total)}</strong></td></tr></tfoot></table>;
}

function DocumentSummary({doc,type}) {
  const returned=doc.detalles.reduce((n,d)=>n+(d.devuelto||0)*d.precio_unitario,0);
  return <section className="document-summary"><p><strong>Estado:</strong> {doc.anulada?'Anulado':returned?'Con devolución':'Vigente'} · <strong>Registró:</strong> {doc.usuario||'Sin registro histórico'}</p><div className="detail-grid"><p>Importe original <strong>{COP(doc.total)}</strong></p>{type==='venta'&&<><p>Productos devueltos <strong>{COP(returned)}</strong></p><p>Importe neto <strong>{COP(netSale(doc))}</strong></p></>}</div>{doc.reversiones?.length>0&&<details><summary>Ver devoluciones y anulaciones ({doc.reversiones.length})</summary>{doc.reversiones.map(r=><div key={r.id}><strong>{r.parcial?'Devolución':'Anulación'}</strong><p>{r.motivo}</p><small>{WHEN(r.fecha)} · {r.usuario||'Sin registro histórico'}</small></div>)}</details>}<p className="help-text">Estos importes no representan movimientos de caja ni facturación electrónica.</p></section>;
}

function ProductHistory({product,onDocument}) {
  const [page,setPage]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[restart,setRestart]=useState(false);
  const generation=useRef(0);
  const read=async(cursor=null)=>{const turn=++generation.current;setLoading(true);setError('');try{const params=new URLSearchParams({limit:'50'});if(cursor)params.set('cursor',cursor);const r=await fetch(`/api/productos/${encodeURIComponent(product.id)}/movimientos?${params}`);if(r.status===409){if(turn===generation.current)setRestart(true);throw Error('El inventario cambió mientras consultabas el historial. Actualízalo desde el inicio.')}if(!r.ok)throw Error('No se pudo cargar el historial. Vuelve a intentar.');const data=await r.json();if(turn===generation.current)setRestart(false);if(turn===generation.current)setPage(prev=>({...data,items:cursor?[...(prev?.items||[]),...data.items]:data.items}))}catch(e){if(turn===generation.current)setError(e.message)}finally{if(turn===generation.current)setLoading(false)}};
  useEffect(()=>{setPage(null);read();return()=>{++generation.current}},[product.id]);
  return <section><h3>Historial de existencias</h3>{error&&<div role="alert"><p>{error}</p><Btn variant="secondary" onClick={()=>read(restart?null:page?.next_cursor)}>{restart?'Actualizar historial':'Reintentar historial'}</Btn></div>}{loading&&!page&&<p role="status">Cargando historial…</p>}{page&&<><p>{page.items.length} de {page.total} movimientos</p><table className="data-table"><thead><tr><th>Fecha</th><th>Movimiento</th><th>Unidades</th><th>Antes → después</th><th>Usuario</th><th>Documento</th></tr></thead><tbody>{page.items.map(m=><tr key={m.id}><td data-label="Fecha">{WHEN(m.fecha)}</td><td data-label="Movimiento">{m.tipo}<small>{m.motivo}</small></td><td data-label="Unidades">{m.cantidad>0?'+':''}{m.cantidad}</td><td data-label="Antes → después">{m.stock_antes??'—'} → {m.stock_despues??'—'}</td><td data-label="Usuario">{m.usuario||'Sin registro histórico'}</td><td data-label="Documento">{m.documento?<Btn sm variant="secondary" onClick={()=>onDocument(m.documento)}>Abrir documento</Btn>:'—'}</td></tr>)}</tbody></table>{!page.items.length&&<p className="empty-state">Todavía no hay movimientos.</p>}{page.next_cursor&&!restart&&<Btn variant="secondary" disabled={loading} onClick={()=>read(page.next_cursor)}>{loading?'Cargando…':'Cargar más movimientos'}</Btn>}</>}</section>;
}

function ItemsList({items,onRemove,onQuantity,prods,checkStock=false}) {
  if(!items.length) return <div className="empty-state"><strong>Tu lista está vacía</strong><p>Busca un producto y agrégalo para comenzar.</p></div>;
  return <div className="item-list">{items.map((it,i)=>{
    const qty=Number(it.cantidad), product=prods.find(p=>p.id===it.producto_id);
    const total=items.filter(x=>x.producto_id===it.producto_id).reduce((n,x)=>n+Number(x.cantidad),0);
    const quantityError=!Number.isSafeInteger(qty)||qty<1?'Ingresa una cantidad entera mayor que cero.':checkStock&&(!product||total>product.stock)?`Intentas usar ${total} unidades y quedan ${product?.stock||0}. Reduce la cantidad.`:'';
    return <div className="item-line" key={`${it.producto_id}-${i}`}>
      <div><strong>{it.nombre}</strong><small>{COP(it.precio_unitario)} por unidad</small></div>
      <div><label htmlFor={`quantity-${i}`}>Cantidad</label><input id={`quantity-${i}`} aria-label={`Cantidad de ${it.nombre}`} aria-invalid={!!quantityError} aria-describedby={quantityError?`quantity-error-${i}`:undefined} type="number" min="1" step="1" value={it.cantidad} onChange={e=>onQuantity(i,e.target.value)}/>{quantityError&&<p id={`quantity-error-${i}`} className="field-error" style={{color:'#b91c1c',fontSize:13,marginTop:6}}>{quantityError}</p>}</div>
      <strong>{COP(Number(it.cantidad)*it.precio_unitario)}</strong>
      <button type="button" className="btn btn-secondary" aria-label={`Quitar ${it.nombre}`} onClick={()=>onRemove(i)}>Quitar</button>
    </div>;
  })}</div>;
}

function AddItemRow({prods,tempItem,setTempItem,onAdd,label="producto",compra=false}) {
  const [search,setSearch]=useState('');
  const input=useRef(null);
  const prod=prods.find(p=>p.id===tempItem.producto_id);
  const result=prods.filter(p=>matches(p,search)).slice(0,12);
  const choose=p=>setTempItem({producto_id:p.id,cantidad:1,precio_unitario:compra?p.precio_compra:p.precio_venta});
  const add=()=>{onAdd();input.current?.focus()};
  return <section className="item-picker" aria-label={`Agregar ${label}`}>
    <label htmlFor="item-search">Buscar {label}</label>
    <input ref={input} id="item-search" type="search" autoComplete="off" placeholder="Nombre, referencia, marca o código de barras" value={search} onChange={e=>{setSearch(e.target.value);setTempItem({})}}
      onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();const exact=prods.find(p=>p.codigo_barras&&norm(p.codigo_barras)===norm(search));if(exact)choose(exact);else if(result.length===1)choose(result[0]);else input.current?.parentElement.querySelector('.item-result')?.focus()}}}/>
    <p className="help-text">Escribe o escanea un código y presiona Enter para seleccionar. Usa Tab para recorrer los resultados.</p>
    {!prod&&<div className="item-results">{result.map(p=><button type="button" className="item-result" key={p.id} onClick={()=>choose(p)}>
      <span><strong>{p.nombre}</strong><small>{[p.referencia,p.marca,p.compatibilidad].filter(Boolean).join(' · ')||p.categoria}</small></span>
      <span><strong>{COP(compra?p.precio_compra:p.precio_venta)}</strong><small>{p.stock} disponibles</small></span>
    </button>)}{!result.length&&<p className="empty-state">No encontramos productos disponibles con esa búsqueda.</p>}{result.length===12&&<small>Mostrando hasta 12 resultados. Escribe más para precisar la búsqueda.</small>}</div>}
    {prod&&<div className="selected-product"><strong>{prod.nombre}</strong><p>{prod.stock} disponibles · Precio sugerido: {COP(compra?prod.precio_compra:prod.precio_venta)}</p>
      <div className="form-grid"><FG label="Cantidad"><MInput aria-label="Cantidad a agregar" type="number" min="1" step="1" value={tempItem.cantidad} onChange={e=>setTempItem(v=>({...v,cantidad:e.target.value}))}/></FG>
      <FG label="Precio unitario"><MInput aria-label="Precio unitario" type="number" min="0" step="any" value={tempItem.precio_unitario} onChange={e=>setTempItem(v=>({...v,precio_unitario:e.target.value}))}/></FG></div>
      <div className="toolbar"><Btn onClick={add}>Agregar a la lista</Btn><Btn variant="secondary" onClick={()=>setTempItem({})}>Cambiar producto</Btn></div>
    </div>}
  </section>;
}

function Toast({msg,type,onClose}) {
  if(!msg)return null;
  return <div className={`notification ${type==='error'?'notification-error':''}`} role={type==='error'?'alert':'status'}>
    <span>{msg}</span><button type="button" aria-label="Cerrar mensaje" onClick={onClose}>×</button>
  </div>;
}

export default function App(){
  return <SessionGate>{props=><InventoryApp {...props}/>}</SessionGate>;
}

function InventoryApp({session,onLogout,onPasswordChange,onWorkStateChange,sessionActive=true}) {
  const isAdmin=session?.role==='admin';
  const [view,setView]=useState('dashboard');
  const [prods,setProds]=useState([]),[compras,setCompras]=useState([]),[ventas,setVentas]=useState([]),[servs,setServs]=useState([]);
  const [toast,setToast]=useState(null),[modal,setModal]=useState(null),[detail,setDetail]=useState(null);
  const [items,setItems]=useState([]),[tempItem,setTempItem]=useState({});
  const [pForm,setPForm]=useState({}),[cForm,setCForm]=useState({}),[vForm,setVForm]=useState({}),[sForm,setSForm]=useState({});
  const [adjust,setAdjust]=useState({}),[reverse,setReverse]=useState({}),[importRows,setImportRows]=useState([]);
  const [users,setUsers]=useState([]),[userForm,setUserForm]=useState({role:'operador'}),[audit,setAudit]=useState([]);
  const [revision,setRevision]=useState(0),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[loadError,setLoadError]=useState(''),[lastSync,setLastSync]=useState(null);
  const [query,setQuery]=useState(''),[category,setCategory]=useState(''),[brand,setBrand]=useState(''),[availability,setAvailability]=useState(''),[sort,setSort]=useState('nombre');
  const [movimientos,setMovimientos]=useState([]),[movementFilters,setMovementFilters]=useState({query:'',from:'',to:'',type:'',user:''});
  const [documentFilters,setDocumentFilters]=useState({query:'',from:'',to:''});
  const [dirty,setDirty]=useState(false),[pending,setPending]=useState(null);
  const openedRevision=useRef(null),busyRef=useRef(false),reloadGeneration=useRef(0),toastTimer=useRef(null);
  const sessionActiveRef=useRef(sessionActive);
  sessionActiveRef.current=sessionActive;
  const workStateCallback=useRef(onWorkStateChange);
  workStateCallback.current=onWorkStateChange;
  useEffect(()=>{workStateCallback.current?.({dirty,pending:!!pending,busy})},[dirty,pending,busy]);
  const notify=(msg,type='success')=>{clearTimeout(toastTimer.current);setToast({msg,type});if(type!=='error')toastTimer.current=setTimeout(()=>setToast(null),4500)};
  useEffect(()=>()=>clearTimeout(toastTimer.current),[]);
  const resetModal=()=>{openedRevision.current=null;setModal(null);setItems([]);setTempItem({});setDetail(null);setDirty(false);setPending(null);setToast(null)};
  const closeModal=()=>{if(busyRef.current)return;if(pending){notify('Hay una operación sin confirmar. Reintenta para comprobar su resultado antes de cerrar.','error');return;}if(dirty&&!window.confirm('Tienes cambios sin guardar. ¿Quieres descartarlos?'))return;resetModal()};
  const hydrate=s=>{setLastSync(new Date());setLoadError('');setProds(s.prods);setCompras(s.compras);setVentas(s.ventas);setServs(s.servs);setMovimientos(s.movimientos);setAudit(s.auditoria||[]);setRevision(s.revision);setReady(true)};
  const reload=async()=>{if(!sessionActiveRef.current)return null;const generation=++reloadGeneration.current;try{const r=await fetch('/api/state');if(r.status===401)window.dispatchEvent(new Event('scorta:unauthorized'));if(!r.ok)throw Error(r.status===401?'La sesión ha terminado. Vuelve a entrar.':'No se pudo actualizar la información');const data=await r.json();if(generation===reloadGeneration.current&&sessionActiveRef.current)hydrate(data);return data}catch(e){if(generation===reloadGeneration.current)setLoadError(e.message);return null}};
  useEffect(()=>{if(!sessionActive)return;reload();const t=setInterval(()=>{if(!busyRef.current&&sessionActiveRef.current)reload()},15000);return()=>clearInterval(t)},[sessionActive]);
  useEffect(()=>{if(modal){openedRevision.current=revision;setDirty(false);setToast(null)}},[modal]);
  useEffect(()=>{const warn=e=>{if(dirty||pending){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[dirty,pending]);
  const commit=async(kind,form={},extra={},retryPayload=null)=>{
    if(!sessionActiveRef.current){notify('Vuelve a entrar con tu cuenta para continuar con esta operación.','error');return}
    if(busyRef.current)return;
    if(pending&&!retryPayload){notify('Primero reintenta la operación pendiente para confirmar su resultado.','error');return;}
    busyRef.current=true;setBusy(true);setToast(null);
    const payload=retryPayload||{kind,form,items,revision:modal?openedRevision.current:revision,requestId:crypto.randomUUID(),...extra};
    let definitive=false;
    try{
      ++reloadGeneration.current;
      const r=await fetch('/api/change',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const data=await r.json();definitive=true;
      if(r.status===401){setPending(payload);notify('Tu sesión terminó. Vuelve a entrar con tu cuenta para confirmar la operación pendiente.','error');window.dispatchEvent(new Event('scorta:unauthorized'));return}
      if(r.status>=500){setPending(payload);notify('El servidor no pudo confirmar el resultado. Reintenta la operación sin cambiar los datos.','error');return}
      if(!r.ok){setPending(null);const fresh=await reload();if(fresh)openedRevision.current=fresh.revision;throw Error(data.error||'No se pudo guardar')}
      hydrate(data);resetModal();notify('Guardado correctamente');
    }catch(e){if(!definitive){setPending(payload);notify('No pudimos confirmar si se guardó. Tus datos están conservados. Usa «Reintentar operación» para comprobar el resultado sin duplicarla.','error')}else notify(e.message,'error')}
    finally{busyRef.current=false;setBusy(false)}
  };

  /* --- Item management --- */
  const addItem = () => {
    const {producto_id,cantidad,precio_unitario}=tempItem;
    if (!producto_id) return notify("Selecciona un producto","error");
    const qty=Number(cantidad), price=Number(precio_unitario);
    if (!Number.isSafeInteger(qty)||qty<1) return notify("Ingresa una cantidad válida","error");
    if (precio_unitario===''||precio_unitario==null||!Number.isFinite(price)||price<0) return notify("Ingresa un precio válido","error");
    const prod=prods.find(p=>p.id===producto_id);
    if (!prod) return;
    if (modal==="venta"||modal==="servicio") {
      const enLista=items.filter(i=>i.producto_id===producto_id).reduce((s,i)=>s+Number(i.cantidad),0);
      if (enLista+qty>prod.stock) return notify(`Stock insuficiente para "${prod.nombre}". Disponible: ${prod.stock-enLista}`,"error");
    }
    const existIdx=items.findIndex(i=>i.producto_id===producto_id);
    if (existIdx>=0 && items[existIdx].precio_unitario===price) {
      setItems(its=>its.map((it,i)=>i===existIdx?{...it,cantidad:Number(it.cantidad)+qty}:it));
    } else {
      setItems(its=>[...its,{producto_id:producto_id,nombre:prod.nombre,cantidad:qty,precio_unitario:price}]);
    }
    setTempItem({});setDirty(true);setToast(null);
  };
  const removeItem=idx=>{setItems(its=>its.filter((_,i)=>i!==idx));setDirty(true)};
  const changeQuantity=(index,value)=>{setItems(prev=>prev.map((it,i)=>i===index?{...it,cantidad:value}:it));setDirty(true);setToast(null)};
  const validateItems=()=>{for(const it of items){const qty=Number(it.cantidad);if(!Number.isSafeInteger(qty)||qty<1){notify(`Revisa la cantidad de ${it.nombre}: debe ser un entero mayor que cero.`,'error');return false}if(modal!=='compra'){const p=prods.find(p=>p.id===it.producto_id);const used=items.filter(x=>x.producto_id===it.producto_id).reduce((n,x)=>n+Number(x.cantidad),0);if(!p||used>p.stock){notify(`${it.nombre}: intentas usar ${used} unidades y quedan ${p?.stock||0}. Ajusta la cantidad.`,'error');return false}}}return true};

  /* --- CRUD actions --- */
  const saveProducto = e=>{e.preventDefault();commit('producto',pForm)};
  const saveCompra = e=>{e.preventDefault();if(validateItems())commit('compra',cForm)};
  const saveVenta = e=>{e.preventDefault();if(validateItems())commit('venta',vForm)};
  const saveServicio = e=>{e.preventDefault();if(validateItems())commit('servicio',sForm)};
  const openReverse=(tipo,doc,parcial=false)=>{setReverse({tipo,doc,parcial,motivo:'',cantidades:{}});setModal('reversion')};
  const avanzarEstado=id=>{const service=servs.find(s=>s.id===id);const next=ESTADOS_LABELS[ESTADOS_LIST[ESTADOS_LIST.indexOf(service.estado)+1]];if(confirm(`Servicio de ${service.placa}: pasará de ${ESTADOS_LABELS[service.estado]} a ${next}. ¿Confirmar?`))commit('estado',{}, {id})};
  /* --- Dashboard calcs --- */
  const ventasPeriodo=ventas.filter(v=>!v.anulada&&v.fecha.startsWith(TODAY().slice(0,7)));
  const entregados=servs.filter(v=>!v.anulada&&v.estado==='entregado'&&v.fecha_entrega?.startsWith(TODAY().slice(0,7)));
  const ventasMes=ventasPeriodo.reduce((s,v)=>s+v.total-v.detalles.reduce((n,d)=>n+(d.devuelto||0)*d.precio_unitario,0),0);
  const serviciosMes=entregados.reduce((s,sv)=>s+sv.total,0);
  const stockBajo=prods.filter(p=>p.stock<=p.stock_minimo).sort((a,b)=>(a.stock===0?-1:1)-(b.stock===0?-1:1)||(b.stock_minimo-b.stock)-(a.stock_minimo-a.stock));
  const filteredProducts=prods.filter(p=>matches(p,query)&&(!category||p.categoria===category)&&(!brand||p.marca===brand)&&(!availability||(availability==='agotado'?p.stock===0:availability==='bajo'?p.stock>0&&p.stock<=p.stock_minimo:availability==='reponer'?p.stock<=p.stock_minimo:p.stock>p.stock_minimo))).sort((a,b)=>sort==='nombre'?a.nombre.localeCompare(b.nombre,'es'):sort==='urgencia'?(a.stock===0?-1:1)-(b.stock===0?-1:1)||(b.stock_minimo-b.stock)-(a.stock_minimo-a.stock):Number(a[sort])-Number(b[sort]));
  const totalItems=items.reduce((n,it)=>n+Number(it.cantidad)*it.precio_unitario,0);
  const filteredDocuments=docs=>docs.filter(d=>(!documentFilters.from||d.fecha>=documentFilters.from)&&(!documentFilters.to||d.fecha<=documentFilters.to)&&norm([d.id,d.cliente,d.proveedor,d.placa,d.descripcion_trabajo,d.marca_moto].join(' ')).includes(norm(documentFilters.query)));
  const filteredMovements=movimientos.filter(m=>matches({nombre:[m.nombre,m.motivo,m.documento].join(' ')},movementFilters.query)&&(!movementFilters.from||localDate(m.fecha)>=movementFilters.from)&&(!movementFilters.to||localDate(m.fecha)<=movementFilters.to)&&(!movementFilters.type||m.tipo===movementFilters.type)&&(!movementFilters.user||norm(m.usuario||'').includes(norm(movementFilters.user))));
  const openDocument=(type,doc)=>{setDetail(doc);setModal('ver-'+type)};
  const findDocument=id=>{for(const [type,docs] of [['compra',compras],['venta',ventas],['servicio',servs]]){const doc=docs.find(d=>d.id===id);if(doc)return {type,doc}}return null};
  const openMovementDocument=id=>{const found=findDocument(id);if(found)openDocument(found.type,found.doc);else notify('Este movimiento no está asociado a un documento disponible.','error')};
  const openProduct=p=>{setDetail(p);setModal('ver-producto')};
  const documentFilterBar=<div className="toolbar inventory-filters"><label>Buscar documento<input type="search" placeholder="Cliente, proveedor, placa o número" value={documentFilters.query} onChange={e=>setDocumentFilters(f=>({...f,query:e.target.value}))}/></label><label>Desde<input type="date" value={documentFilters.from} onChange={e=>setDocumentFilters(f=>({...f,from:e.target.value}))}/></label><label>Hasta<input type="date" value={documentFilters.to} onChange={e=>setDocumentFilters(f=>({...f,to:e.target.value}))}/></label><Btn variant="secondary" onClick={()=>setDocumentFilters({query:'',from:'',to:''})}>Limpiar filtros</Btn></div>;

  /* --- Nav style helper --- */
  const navSt = (id) => ({display:"flex",alignItems:"center",gap:12,padding:"12px 18px",
    color:view===id?"white":"rgba(255,255,255,0.65)",cursor:"pointer",
    borderLeft:view===id?"3px solid #2563EB":"3px solid transparent",
    background:view===id?"rgba(37,99,235,0.25)":"transparent",
    fontWeight:view===id?600:400,transition:"all 0.15s",userSelect:"none"});

  const phRow = (title,btn,onBtn) => (
    <div className="page-heading" style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
      <h1 style={{fontSize:22,fontWeight:700}}>{title}</h1>
      {btn && <Btn onClick={onBtn}>{btn}</Btn>}
    </div>
  );

  return (
    <ModalFeedback.Provider value={{sessionActive,toast,clearToast:()=>setToast(null),pending,busy,retry:()=>commit(null,{}, {},pending)}}><div className="app-shell" style={{minHeight:"100vh",display:"flex",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",background:"#F1F5F9"}}>
      {!modal&&toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}

      {/* ===== SIDEBAR ===== */}
      <aside className="app-sidebar" style={{width:220,background:"#1E293B",minHeight:"100vh",position:"sticky",top:0,display:"flex",flexDirection:"column",flexShrink:0}}>
        <div style={{padding:"20px 16px",display:"flex",alignItems:"center",gap:10,borderBottom:"1px solid rgba(255,255,255,0.1)"}}>
          <span style={{fontSize:24}}>🏍️</span>
          <span style={{color:"white",fontSize:17,fontWeight:700}}>SCORTA</span>
        </div>
        <nav style={{padding:"12px 0",flex:1}}>
          {[{id:"dashboard",i:"📊",l:"Inicio"},{id:"inventario",i:"📦",l:"Inventario"},
            ...(isAdmin?[{id:"compras",i:"🛒",l:"Compras"}]:[]),{id:"ventas",i:"💰",l:"Ventas"},{id:"servicios",i:"🔧",l:"Servicios"},{id:"movimientos",i:"↔",l:"Movimientos"},...(session?.role==='admin'?[{id:"usuarios",i:"👥",l:"Usuarios"}]:[])]
            .map(n=>(
              <button type="button" key={n.id} aria-current={view===n.id?'page':undefined} onClick={()=>{setView(n.id);setDocumentFilters({query:'',from:'',to:''});setToast(null)}} style={{...navSt(n.id),width:'100%',borderTop:0,borderBottom:0,borderRight:0,textAlign:'left'}}>
                <span style={{fontSize:18}}>{n.i}</span><span>{n.l}</span>
              </button>
            ))}
        </nav>
        <div style={{padding:16,color:"rgba(255,255,255,0.3)",fontSize:11,borderTop:"1px solid rgba(255,255,255,0.08)"}}>
          <strong>{session?.username}</strong><p>{isAdmin?'Administrador':'Operador'} · COP</p>
          {session?.mode==='local'?<small>Modo de prueba local</small>:<div className="session-actions"><button type="button" onClick={()=>{if(pending){notify('Confirma la operación pendiente antes de cambiar la contraseña.','error');return}if(busy){notify('Espera a que termine el guardado antes de cambiar la contraseña.','error');return}if(modal||dirty){notify('Guarda los cambios o cierra el formulario antes de cambiar la contraseña.','error');return}onPasswordChange()}}>Cambiar contraseña</button><button type="button" onClick={()=>{if(busyRef.current){notify('Espera a que termine el guardado antes de salir.','error');return}if(pending){notify('Confirma la operación pendiente antes de salir.','error');return}if(dirty&&!confirm('¿Descartar los cambios y cerrar sesión?'))return;onLogout()}}>Cerrar sesión</button></div>}
        </div>
      </aside>

      {/* ===== MAIN ===== */}
      <main className="app-main" aria-busy={busy} style={{flex:1,padding:28,overflowY:"auto",minWidth:0}}>

        <div className={`connection-bar ${loadError?'is-offline':''}`} role="status">
          <span>{busy?'Guardando operación…':pending?'Operación pendiente de confirmación':loadError?'Sin conexión · mostrando la última copia disponible':lastSync?'Datos actualizados a las '+lastSync.toLocaleTimeString('es-CO'):'Conectando…'}</span>
          <Btn variant="secondary" disabled={busy} onClick={reload}>Actualizar datos</Btn>
          {isAdmin&&<a href="/api/backup/full">Descargar respaldo completo</a>}
        </div>
        {!ready&&<p role="alert">{loadError||'Cargando tu almacén…'}</p>}
        {pending&&!modal&&<div role="alert" className="pending-notice"><p>El resultado de una operación no está confirmado. Reintenta antes de continuar.</p><Btn onClick={()=>commit(null,{}, {},pending)} disabled={busy}>Reintentar operación</Btn></div>}
        <fieldset disabled={!ready||busy||!!pending} style={{border:0,padding:0,minWidth:0}}>
        {view==='dashboard'&&<>
          <div className="page-heading"><div><p className="eyebrow">Tu almacén, al día</p><h1>Inicio</h1><p>Consulta existencias y continúa con la atención.</p></div><Btn onClick={()=>{setVForm({fecha:TODAY()});setItems([]);setModal('venta')}}>Nueva venta</Btn></div>
          <div className="dashboard-grid">
            <div className="metric-card"><small>Ventas de hoy · netas</small><strong>{COP(ventas.filter(v=>v.fecha===TODAY()).reduce((n,v)=>n+netSale(v),0))}</strong><span>{ventas.filter(v=>v.fecha===TODAY()&&!v.anulada).length} ventas registradas</span></div>
            <div className="metric-card"><small>Productos agotados</small><strong>{prods.filter(p=>p.stock===0).length}</strong><Btn variant="secondary" onClick={()=>{setQuery('');setCategory('');setBrand('');setSort('nombre');setAvailability('agotado');setView('inventario')}}>Ver agotados</Btn></div>
            <div className="metric-card"><small>Existencias bajas</small><strong>{prods.filter(p=>p.stock>0&&p.stock<=p.stock_minimo).length}</strong><Btn variant="secondary" onClick={()=>{setQuery('');setCategory('');setBrand('');setSort('urgencia');setAvailability('bajo');setView('inventario')}}>Revisar existencias</Btn></div>
            <div className="metric-card"><small>Trabajos pendientes</small><strong>{servs.filter(s=>!s.anulada&&s.estado!=='entregado').length}</strong><Btn variant="secondary" onClick={()=>{setDocumentFilters({query:'',from:'',to:''});setView('servicios')}}>Abrir taller</Btn></div>
          </div>
          <p className="help-text">Ventas netas de devoluciones y anulaciones del documento original. No representan dinero recibido en caja.</p>
          <section className="table-card"><div className="page-heading"><div><h2>Productos para revisar</h2><p>Agotados primero. El mínimo es un umbral de alerta, no una recomendación de compra.</p></div><Btn variant="secondary" onClick={()=>{setQuery('');setCategory('');setBrand('');setSort('urgencia');setAvailability('reponer');setView('inventario')}}>Ver reposición</Btn></div>
            {!stockBajo.length?<div className="empty-state">{prods.length?'No hay productos por debajo del umbral de alerta.':'Comienza registrando tus productos.'}{isAdmin&&!prods.length&&<Btn onClick={()=>{setPForm({});setModal('producto')}}>Crear primer producto</Btn>}</div>:<table className="data-table"><thead><tr><th>Producto</th><th>Existencias</th><th>Mínimo</th><th>Unidades para llegar al mínimo</th><th>Acciones</th></tr></thead><tbody>{stockBajo.slice(0,8).map(p=><tr key={p.id}><td data-label="Producto"><strong>{p.nombre}</strong><small>{p.referencia||p.categoria}</small></td><td data-label="Existencias"><StockPill stock={p.stock} minimo={p.stock_minimo}/></td><td data-label="Mínimo">{p.stock_minimo}</td><td data-label="Para llegar al mínimo">{Math.max(0,p.stock_minimo-p.stock)}</td><td data-label=""><Btn sm variant="secondary" onClick={()=>openProduct(p)}>Ver producto</Btn>{isAdmin&&<Btn sm onClick={()=>{setCForm({fecha:TODAY()});setItems([]);setTempItem({producto_id:p.id,cantidad:Math.max(1,p.stock_minimo-p.stock),precio_unitario:p.precio_compra});setModal('compra')}}>Registrar compra</Btn>}</td></tr>)}</tbody></table>}
          </section>
          <section className="table-card"><div className="page-heading"><h2>Últimas ventas</h2><Btn variant="secondary" onClick={()=>{setDocumentFilters({query:'',from:'',to:''});setView('ventas')}}>Ver todas</Btn></div>{!ventas.length?<p className="empty-state">Todavía no hay ventas registradas.</p>:<table className="data-table"><thead><tr><th>Fecha</th><th>Cliente</th><th>Importe neto</th><th>Acciones</th></tr></thead><tbody>{ventas.slice(0,5).map(v=><tr key={v.id}><td data-label="Fecha">{DATE(v.fecha)}</td><td data-label="Cliente">{v.cliente}{v.anulada&&<small>Anulada</small>}</td><td data-label="Importe neto">{COP(netSale(v))}</td><td data-label=""><Btn variant="secondary" sm onClick={()=>openDocument('venta',v)}>Ver venta</Btn></td></tr>)}</tbody></table>}</section>
          <div className="monthly-summary"><p>Ventas netas del mes: <strong>{COP(ventasMes)}</strong></p><p>Servicios entregados del mes: <strong>{COP(serviciosMes)}</strong></p></div>
        </>}

        {view==='movimientos'&&<>
          {phRow('Movimientos de inventario')}
          <div className="inventory-filters toolbar"><label>Buscar movimiento<input type="search" placeholder="Producto, motivo o documento" value={movementFilters.query} onChange={e=>setMovementFilters(f=>({...f,query:e.target.value}))}/></label><label>Desde<input type="date" value={movementFilters.from} onChange={e=>setMovementFilters(f=>({...f,from:e.target.value}))}/></label><label>Hasta<input type="date" value={movementFilters.to} onChange={e=>setMovementFilters(f=>({...f,to:e.target.value}))}/></label><label>Tipo<select value={movementFilters.type} onChange={e=>setMovementFilters(f=>({...f,type:e.target.value}))}><option value="">Todos</option>{[...new Set(movimientos.map(m=>m.tipo))].map(t=><option key={t}>{t}</option>)}</select></label><label>Usuario<input value={movementFilters.user} onChange={e=>setMovementFilters(f=>({...f,user:e.target.value}))}/></label><Btn variant="secondary" onClick={()=>setMovementFilters({query:'',from:'',to:'',type:'',user:''})}>Limpiar filtros</Btn></div>
          <p>{filteredMovements.length} movimientos encontrados</p><div className="table-card"><table className="data-table"><thead><tr>{['Fecha','Producto','Tipo / motivo','Unidades','Antes → después','Usuario','Documento'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{filteredMovements.map(m=><tr key={m.id}><td data-label="Fecha">{WHEN(m.fecha)}</td><td data-label="Producto">{m.nombre}</td><td data-label="Tipo / motivo">{m.tipo}<small>{m.motivo}</small></td><td data-label="Unidades">{m.cantidad>0?'+':''}{m.cantidad}</td><td data-label="Antes → después">{m.stock_antes??'—'} → {m.stock_despues??'—'}</td><td data-label="Usuario">{m.usuario||'Sin registro histórico'}</td><td data-label="Documento">{m.documento&&findDocument(m.documento)?<Btn sm variant="secondary" onClick={()=>openMovementDocument(m.documento)}>Ver documento</Btn>:'—'}</td></tr>)}</tbody></table>{!filteredMovements.length&&<p className="empty-state">No hay movimientos para estos filtros.</p>}</div>
        </>}
        {view==='usuarios'&&isAdmin&&<><div className="page-heading"><div><h1>Usuarios y actividad</h1><p>Administra el acceso y consulta quién realizó cada operación.</p></div><Btn onClick={async()=>{try{const r=await fetch('/api/users');if(!r.ok)throw Error('No se pudieron cargar los usuarios');setUsers(await r.json());setUserForm({role:session.mode==='local'?'admin':'operador'});setModal('usuario')}catch(e){notify(e.message,'error')}}}>Crear usuario</Btn></div><h2>Actividad reciente</h2><div className="table-card"><table className="data-table"><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Documento</th></tr></thead><tbody>{audit.map(x=><tr key={x.id}><td data-label="Fecha">{WHEN(x.fecha)}</td><td data-label="Usuario">{x.usuario}</td><td data-label="Acción">{x.accion}</td><td data-label="Documento">{findDocument(x.documento)?<Btn sm variant="secondary" onClick={()=>openMovementDocument(x.documento)}>Ver documento</Btn>:x.documento}</td></tr>)}</tbody></table>{!audit.length&&<p className="empty-state">Todavía no hay actividad registrada.</p>}</div></>}
        {view==='inventario'&&<>
          {phRow('Inventario',isAdmin?'+ Nuevo producto':null,()=>{setPForm({});setModal('producto')})}
          <div className="toolbar">{isAdmin&&<Btn variant="secondary" onClick={()=>{setImportRows([]);setModal('importar')}}>Importar inventario CSV</Btn>}<span>{filteredProducts.length} de {prods.length} productos</span></div>
          <div className="inventory-filters"><label className="search-field">Buscar productos<input type="search" aria-label="Buscar productos" placeholder="Nombre, referencia, marca, compatibilidad o código" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="toolbar">
            <label>Categoría<select value={category} onChange={e=>setCategory(e.target.value)}><option value="">Todas</option>{[...new Set(prods.map(p=>p.categoria))].sort().map(c=><option key={c}>{c}</option>)}</select></label>
            <label>Marca<select value={brand} onChange={e=>setBrand(e.target.value)}><option value="">Todas</option>{[...new Set(prods.map(p=>p.marca).filter(Boolean))].sort().map(m=><option key={m}>{m}</option>)}</select></label>
            <label>Disponibilidad<select value={availability} onChange={e=>setAvailability(e.target.value)}><option value="">Todos</option><option value="agotado">Agotados</option><option value="bajo">Existencias bajas</option><option value="reponer">Para reposición</option><option value="disponible">Sobre el mínimo</option></select></label>
            <label>Ordenar por<select value={sort} onChange={e=>setSort(e.target.value)}><option value="nombre">Nombre A–Z</option><option value="urgencia">Prioridad de reposición</option><option value="stock">Menor existencia</option><option value="precio_venta">Menor precio</option></select></label>
            <Btn variant="secondary" onClick={()=>{setQuery('');setCategory('');setBrand('');setAvailability('');setSort('nombre')}}>Limpiar filtros</Btn>
          </div></div>
          <div className="table-card"><table className="data-table"><thead><tr><th>Producto / referencia</th><th>Categoría</th>{isAdmin&&<th>Costo</th>}<th>Precio de venta</th><th>Existencias</th><th>Mínimo</th><th>Acciones</th></tr></thead><tbody>{filteredProducts.map(p=><tr key={p.id}>
            <td data-label="Producto"><strong>{p.nombre}</strong><small>{[p.referencia,p.marca].filter(Boolean).join(' · ')||'Sin referencia'}</small></td><td data-label="Categoría">{p.categoria}</td>{isAdmin&&<td data-label="Costo">{COP(p.precio_compra)}</td>}<td data-label="Precio de venta">{COP(p.precio_venta)}</td><td data-label="Existencias"><StockPill stock={p.stock} minimo={p.stock_minimo}/></td><td data-label="Mínimo">{p.stock_minimo}</td>
            <td data-label="" className="row-actions"><Btn sm variant="secondary" aria-label={`Ver ${p.nombre}`} onClick={()=>openProduct(p)}>Ver</Btn>{isAdmin&&<><Btn sm variant="secondary" aria-label={`Editar ${p.nombre}`} onClick={()=>{setPForm({...p});setModal('producto')}}>Editar</Btn><Btn sm variant="secondary" aria-label={`Ajustar existencias de ${p.nombre}`} onClick={()=>{setAdjust({producto:p,stock:p.stock,motivo:''});setModal('ajuste')}}>Ajustar</Btn><Btn sm variant="danger" disabled={p.stock!==0} title={p.stock!==0?'Solo se retiran productos sin existencias':'Retirar producto sin historial'} aria-label={`Retirar ${p.nombre}`} onClick={()=>{if(confirm(`¿Retirar ${p.nombre}? Solo es posible si no tiene existencias ni historial.`))commit('eliminar',{}, {id:p.id})}}>Retirar</Btn></>}</td>
          </tr>)}</tbody></table>{!filteredProducts.length&&<div className="empty-state"><strong>{prods.length?'No encontramos coincidencias':'Tu inventario está vacío'}</strong><p>{prods.length?'Prueba con otros filtros o términos de búsqueda.':'Registra tu primer producto o importa un archivo CSV.'}</p></div>}</div>
        </>}

        {/* === COMPRAS === */}
        {view==="compras" && isAdmin && <>
          {phRow("Compras",isAdmin?"+ Nueva compra":null,()=>{setCForm({fecha:TODAY()});setItems([]);setModal("compra");})}
          {documentFilterBar}
          <div className="table-card" style={S.card}>
            <table className="data-table" style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr><th style={S.th}>#</th><th style={S.th}>Fecha</th><th style={S.th}>Proveedor</th><th style={S.th}>Total</th><th style={S.th}>Acciones</th></tr></thead>
              <tbody>{filteredDocuments(compras).map(c=>(
                <tr key={c.id}>
                  <td data-label="Documento" style={{...S.td,fontWeight:700}}>#{c.id}</td>
                  <td data-label="Fecha" style={S.td}>{DATE(c.fecha)}</td>
                  <td data-label="Proveedor" style={S.td}>{c.proveedor}</td>
                  <td data-label="Total" style={{...S.td,fontWeight:700}}>{COP(c.total)}</td>
                  <td data-label=""><Btn sm variant="secondary" onClick={()=>{setDetail(c);setModal("ver-compra");}}>Ver detalle</Btn> {c.anulada?"Anulada":isAdmin&&<Btn sm variant="secondary" onClick={()=>openReverse("compra",c)}>Anular</Btn>}</td>
                </tr>
              ))}</tbody>
            </table>{!filteredDocuments(compras).length&&<p className="empty-state">No hay compras para estos filtros.</p>}
          </div>
        </>}

        {/* === VENTAS === */}
        {view==="ventas" && <>
          {phRow("Ventas","Nueva venta",()=>{setVForm({fecha:TODAY()});setItems([]);setModal("venta");})}
          {documentFilterBar}
          <div className="table-card" style={S.card}>
            <table className="data-table" style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr><th style={S.th}>#</th><th style={S.th}>Fecha</th><th style={S.th}>Cliente</th><th style={S.th}>Importe neto</th><th style={S.th}>Acciones</th></tr></thead>
              <tbody>{filteredDocuments(ventas).map(v=>(
                <tr key={v.id}>
                  <td data-label="Documento" style={{...S.td,fontWeight:700}}>#{v.id}</td>
                  <td data-label="Fecha" style={S.td}>{DATE(v.fecha)}</td>
                  <td data-label="Cliente" style={S.td}>{v.cliente}</td>
                  <td data-label="Importe neto" style={{...S.td,fontWeight:700}}>{COP(netSale(v))}{v.detalles.some(d=>d.devuelto>0)&&<small>Con devolución</small>}</td>
                  <td data-label=""><Btn sm variant="secondary" onClick={()=>{setDetail(v);setModal("ver-venta");}}>Ver detalle</Btn> {v.anulada?"Anulada":isAdmin&&<><Btn sm variant="secondary" onClick={()=>openReverse("venta",v,true)}>Devolución</Btn> <Btn sm variant="secondary" onClick={()=>openReverse("venta",v)}>Anular</Btn></>}</td>
                </tr>
              ))}</tbody>
            </table>{!filteredDocuments(ventas).length&&<p className="empty-state">No hay ventas para estos filtros.</p>}
          </div>
        </>}

        {/* === SERVICIOS === */}
        {view==="servicios" && <>
          {phRow("Taller","Nuevo servicio",()=>{setSForm({fecha:TODAY()});setItems([]);setModal("servicio");})}
          {documentFilterBar}
          <div className="kanban-board">{[...ESTADOS_LIST,'anulado'].map(estado=>{const docs=filteredDocuments(servs).filter(s=>s.estado===estado);return <section className="kanban-column" key={estado}><h2>{ESTADOS_LABELS[estado]||'Anulados'} <span>{docs.length}</span></h2>{!docs.length&&<p className="empty-state">Sin trabajos</p>}{docs.map(s=><article className="service-card" key={s.id}><div className="toolbar"><strong>{s.placa}</strong><StatusPill estado={s.estado}/></div><small>{DATE(s.fecha)} · {s.marca_moto}</small><p>{s.descripcion_trabajo}</p><strong>{COP(s.total)}</strong><div className="toolbar"><Btn sm variant="secondary" onClick={()=>openDocument('servicio',s)}>Ver servicio</Btn>{s.estado!=='entregado'&&!s.anulada&&<Btn sm onClick={()=>avanzarEstado(s.id)}>Pasar a {ESTADOS_LABELS[ESTADOS_LIST[ESTADOS_LIST.indexOf(s.estado)+1]]}</Btn>}{isAdmin&&!s.anulada&&<Btn sm variant="danger" onClick={()=>openReverse('servicio',s)}>Anular</Btn>}</div></article>)}</section>})}</div>
        </>}
      </fieldset></main>

      <div onChangeCapture={()=>setDirty(true)} className="modal-host">
      {/* ============================= */}
      {/*          MODALS              */}
      {/* ============================= */}

      {modal==="importar" && <ModalWrap title="Importar productos" onClose={closeModal}><form onSubmit={e=>{e.preventDefault();commit('importar',{}, {items:importRows})}}><MBody><p>Selecciona un CSV con encabezados: nombre, precio_venta, precio_compra, stock, stock_minimo, categoria, referencia, marca, modelo, compatibilidad, codigo_barras. Máximo 1000 productos; se rechazan duplicados.</p><label>Archivo CSV<input type="file" accept=".csv,text/csv" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;const result=Papa.parse(await file.text(),{header:true,skipEmptyLines:true});if(result.errors.length){notify('CSV inválido: '+result.errors[0].message,'error');setImportRows([])}else setImportRows(result.data)}}/></label><p>{importRows.length} producto(s) listos para importar</p></MBody><MFoot><Btn variant="secondary" onClick={closeModal}>Cancelar</Btn><Btn type="submit" disabled={busy||!importRows.length}>Importar</Btn></MFoot></form></ModalWrap>}
      {modal==="usuario" && <ModalWrap title="Crear usuario" onClose={closeModal}><form onSubmit={async e=>{e.preventDefault();if(busyRef.current)return;busyRef.current=true;setBusy(true);try{const r=await fetch('/api/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...userForm,role:session.mode==='local'?'admin':userForm.role})});const result=await r.json();if(r.status===401)window.dispatchEvent(new Event('scorta:unauthorized'));if(!r.ok)throw Error(result.error);setUsers(result);resetModal();setUserForm({role:'operador'});if(session.mode==='local')window.dispatchEvent(new Event('scorta:unauthorized'));else notify('Usuario creado')}catch(e){notify(e.message,'error')}finally{busyRef.current=false;setBusy(false)}}}><MBody>{session.mode==='local'&&<p className="inline-message">La primera cuenta será administradora para que puedas gestionar el almacén. Al crearla deberás entrar con su usuario y contraseña.</p>}<p>Usuarios existentes: {users.map(x=>`${x.username} (${x.role})`).join(', ')||'ninguno'}</p><FG label="Usuario *"><MInput required value={userForm.username} onChange={e=>setUserForm(f=>({...f,username:e.target.value}))}/></FG><FG label="Contraseña de al menos 16 caracteres *"><MInput required type="password" minLength={16} maxLength={200} autoComplete="new-password" value={userForm.password} onChange={e=>setUserForm(f=>({...f,password:e.target.value}))}/></FG><label>Rol <select disabled={session.mode==='local'} value={session.mode==='local'?'admin':userForm.role} onChange={e=>setUserForm(f=>({...f,role:e.target.value}))}><option value="operador">Operador: ventas y servicios</option><option value="admin">Administrador: todas las operaciones</option></select></label></MBody><MFoot><Btn variant="secondary" onClick={closeModal}>Cancelar</Btn><Btn type="submit" disabled={busy}>Crear usuario</Btn></MFoot></form></ModalWrap>}
      {modal==="ajuste" && <ModalWrap title="Ajustar inventario" onClose={closeModal}><form onSubmit={e=>{e.preventDefault();if(confirm(`${adjust.producto.nombre}: las existencias pasarán de ${adjust.producto.stock} a ${adjust.stock}. Motivo: ${adjust.motivo}. ¿Confirmar ajuste?`))commit('ajuste',{stock:adjust.stock,motivo:adjust.motivo},{id:adjust.producto.id})}}><MBody><p>{adjust.producto.nombre} · Existencias actuales: {adjust.producto.stock}</p><FG label="Cantidad contada *"><MInput required type="number" min="0" step="1" value={adjust.stock} onChange={e=>setAdjust(a=>({...a,stock:e.target.value}))}/></FG><p>Las existencias pasarán de <strong>{adjust.producto.stock}</strong> a <strong>{adjust.stock||0}</strong>. Diferencia: {Number(adjust.stock)-adjust.producto.stock} unidades.</p><FG label="Motivo *"><MInput required value={adjust.motivo} onChange={e=>setAdjust(a=>({...a,motivo:e.target.value}))}/></FG></MBody><MFoot><Btn variant="secondary" onClick={closeModal}>Cancelar</Btn><Btn type="submit" disabled={busy}>Guardar ajuste</Btn></MFoot></form></ModalWrap>}
      {modal==="reversion" && <ModalWrap title={reverse.parcial?'Devolución de venta':'Anular '+reverse.tipo} onClose={closeModal} wide><form onSubmit={e=>{e.preventDefault();const changes=Object.entries(reverse.cantidades).filter(([,q])=>Number(q)>0).map(([index,cantidad])=>({index:Number(index),cantidad:Number(cantidad)}));if(confirm(`¿Confirmar ${reverse.parcial?'devolución':'anulación'} del documento ${reverse.doc.id}? Revisa las unidades indicadas. Motivo: ${reverse.motivo}`))commit('reversion',{tipo:reverse.tipo,parcial:reverse.parcial,motivo:reverse.motivo},{id:reverse.doc.id,items:changes})}}><MBody><p>Documento #{reverse.doc.id}. {reverse.tipo==='compra'?'La anulación descuenta las unidades de existencias.':'La operación devuelve las unidades al inventario.'}</p>{!reverse.parcial&&<ul>{reverse.doc.detalles.map((d,i)=><li key={i}>{d.nombre}: {reverse.tipo==='compra'?'−':'+'}{d.cantidad-(d.devuelto||0)} unidades</li>)}</ul>}{reverse.parcial&&reverse.doc.detalles.map((d,i)=><FG key={i} label={`${d.nombre} · disponibles para devolver: ${d.cantidad-(d.devuelto||0)}`}><MInput type="number" min="0" step="1" value={reverse.cantidades[i]??0} onChange={e=>setReverse(a=>({...a,cantidades:{...a.cantidades,[i]:e.target.value}}))}/></FG>)}<FG label="Motivo *"><MInput required value={reverse.motivo} onChange={e=>setReverse(a=>({...a,motivo:e.target.value}))}/></FG></MBody><MFoot><Btn variant="secondary" onClick={closeModal}>Cancelar</Btn><Btn type="submit" disabled={busy}>Confirmar {reverse.parcial?'devolución':'anulación'}</Btn></MFoot></form></ModalWrap>}
      {modal==='ver-producto'&&detail&&<ModalWrap title={detail.nombre} onClose={closeModal} wide><MBody><div className="detail-grid"><p>Referencia <strong>{detail.referencia||'Sin referencia'}</strong></p><p>Categoría <strong>{detail.categoria}</strong></p><p>Marca <strong>{detail.marca||'Sin especificar'}</strong></p><p>Modelo <strong>{detail.modelo||'Sin especificar'}</strong></p><p>Compatibilidad <strong>{detail.compatibilidad||'Sin especificar'}</strong></p><p>Código de barras <strong>{detail.codigo_barras||'Sin especificar'}</strong></p><p>Precio de venta <strong>{COP(detail.precio_venta)}</strong></p>{isAdmin&&<p>Costo de compra <strong>{COP(detail.precio_compra)}</strong></p>}<p>Existencias <StockPill stock={detail.stock} minimo={detail.stock_minimo}/></p><p>Mínimo de alerta <strong>{detail.stock_minimo}</strong></p></div><ProductHistory product={detail} onDocument={openMovementDocument}/></MBody><MFoot><Btn variant="secondary" onClick={closeModal}>Cerrar</Btn>{isAdmin&&<Btn onClick={()=>{setPForm({...detail});setModal('producto')}}>Editar producto</Btn>}</MFoot></ModalWrap>}
      {/* Producto */}
      {modal==="producto" && (
        <ModalWrap title={pForm.id?"✏️ Editar Producto":"📦 Nuevo Producto"} onClose={closeModal}>
          <form aria-busy={busy} onSubmit={saveProducto}>
            <MBody>
              <div className="form-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <FG label="Nombre *" span={2}><MInput value={pForm.nombre} onChange={e=>setPForm(f=>({...f,nombre:e.target.value}))} required placeholder="Ej: Aceite 10W-40 Castrol 1L"/></FG>
                <FG label="Precio de venta ($) *"><MInput type="number" value={pForm.precio_venta} onChange={e=>setPForm(f=>({...f,precio_venta:e.target.value}))} required min="0" step="any" placeholder="0"/></FG>
                <FG label="Existencias iniciales"><MInput type="number" value={pForm.stock??0} disabled={!!pForm.id} onChange={e=>setPForm(f=>({...f,stock:e.target.value}))} min="0" step="1"/></FG>
              </div>
              <details className="field-advanced" open={pForm.id?true:undefined}><summary>Referencia, clasificación y otros datos</summary><div className="form-grid">
                {[['referencia','Referencia / SKU'],['marca','Marca'],['modelo','Modelo'],['compatibilidad','Compatibilidad'],['codigo_barras','Código de barras']].map(([key,label])=><FG key={key} label={label}><MInput value={pForm[key]} onChange={e=>setPForm(f=>({...f,[key]:e.target.value}))}/></FG>)}
                <FG label="Categoría"><MInput value={pForm.categoria} onChange={e=>setPForm(f=>({...f,categoria:e.target.value}))} placeholder="General"/></FG>
                <FG label="Precio de compra ($)"><MInput type="number" value={pForm.precio_compra??0} onChange={e=>setPForm(f=>({...f,precio_compra:e.target.value}))} min="0" step="any"/></FG>
                <FG label="Mínimo de alerta"><MInput type="number" value={pForm.stock_minimo??5} onChange={e=>setPForm(f=>({...f,stock_minimo:e.target.value}))} min="0" step="1"/></FG>
              </div><p className="help-text">El mínimo activa una alerta; no se utiliza para calcular automáticamente un pedido.</p></details>
              {pForm.id && <p style={{fontSize:12,color:"#526479",marginTop:8}}>El stock se conserva al editar. Las compras agregan unidades; las ventas y los servicios descuentan unidades.</p>}
            </MBody>
            <MFoot><Btn variant="secondary" onClick={closeModal}>Cancelar</Btn><Btn type="submit" disabled={busy}>Guardar producto</Btn></MFoot>
          </form>
        </ModalWrap>
      )}

      {/* Compra */}
      {modal==="compra" && (
        <ModalWrap title="🛒 Nueva Compra" onClose={closeModal} wide>
          <form onSubmit={saveCompra}>
            <MBody>
              <div className="form-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
                <FG label="Fecha"><MInput type="date" value={cForm.fecha} onChange={e=>setCForm(f=>({...f,fecha:e.target.value}))}/></FG>
                <FG label="Proveedor"><MInput value={cForm.proveedor} onChange={e=>setCForm(f=>({...f,proveedor:e.target.value}))} placeholder="Nombre del proveedor"/></FG>
              </div>
              <div className="sale-layout"><AddItemRow prods={prods} tempItem={tempItem} setTempItem={setTempItem} onAdd={addItem} label="producto" compra/><section><h3>Productos de la compra</h3><ItemsList items={items} onRemove={removeItem} onQuantity={changeQuantity} prods={prods} checkStock={modal!=='compra'}/></section></div>
            </MBody>
            <MFoot><strong className="operation-total">Total: {COP(totalItems)}</strong><Btn variant="secondary" onClick={closeModal}>Cancelar</Btn><Btn type="submit" disabled={busy||!items.length}>Guardar compra</Btn></MFoot>
          </form>
        </ModalWrap>
      )}

      {/* Venta */}
      {modal==="venta" && (
        <ModalWrap title="💰 Nueva Venta" onClose={closeModal} wide>
          <form onSubmit={saveVenta}>
            <MBody>
              <FG label="Cliente (opcional)"><MInput value={vForm.cliente} onChange={e=>setVForm(f=>({...f,cliente:e.target.value}))} placeholder="Cliente general"/></FG>
              <details className="field-advanced"><summary>Fecha de la venta · {DATE(vForm.fecha)}</summary><FG label="Fecha"><MInput required type="date" value={vForm.fecha} onChange={e=>setVForm(f=>({...f,fecha:e.target.value}))}/></FG></details>
              <div className="sale-layout"><AddItemRow prods={prods.filter(p=>p.stock>0)} tempItem={tempItem} setTempItem={setTempItem} onAdd={addItem} label="producto"/><section><h3>Productos de la venta</h3><ItemsList items={items} onRemove={removeItem} onQuantity={changeQuantity} prods={prods} checkStock={modal!=='compra'}/></section></div>
            </MBody>
            <MFoot><strong className="operation-total">Total: {COP(totalItems)}</strong><Btn variant="secondary" onClick={closeModal}>Cancelar</Btn><Btn type="submit" disabled={busy||!items.length}>Guardar venta</Btn></MFoot>
          </form>
        </ModalWrap>
      )}

      {/* Servicio */}
      {modal==="servicio" && (
        <ModalWrap title="🔧 Nuevo Servicio Técnico" onClose={closeModal} wide>
          <form onSubmit={saveServicio}>
            <MBody>
              <div className="form-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:14}}>
                <FG label="Fecha"><MInput type="date" value={sForm.fecha} onChange={e=>setSForm(f=>({...f,fecha:e.target.value}))}/></FG>
                <FG label="Placa *"><MInput required value={sForm.placa} onChange={e=>setSForm(f=>({...f,placa:e.target.value.toUpperCase()}))} placeholder="Ej: ABC123"/></FG>
                <FG label="Marca / Modelo"><MInput value={sForm.marca_moto} onChange={e=>setSForm(f=>({...f,marca_moto:e.target.value}))} placeholder="Ej: Honda CB190R"/></FG>
                <FG label="Descripción del Trabajo *" span={3}><MInput value={sForm.descripcion_trabajo} onChange={e=>setSForm(f=>({...f,descripcion_trabajo:e.target.value}))} required rows={3} placeholder="Describe el trabajo a realizar..."/></FG>
                <FG label="Costo Mano de Obra ($)"><MInput type="number" value={sForm.costo_mano_obra} onChange={e=>setSForm(f=>({...f,costo_mano_obra:e.target.value}))} min="0" step="any" placeholder="0"/></FG>
              </div>
              <p>Los repuestos se descuentan del inventario al guardar el servicio.</p><div className="sale-layout"><AddItemRow prods={prods.filter(p=>p.stock>0)} tempItem={tempItem} setTempItem={setTempItem} onAdd={addItem} label="repuesto"/><section><h3>Repuestos utilizados</h3><ItemsList items={items} onRemove={removeItem} onQuantity={changeQuantity} prods={prods} checkStock={modal!=='compra'}/></section></div>
              <div style={{textAlign:"right",marginTop:12,fontSize:16,fontWeight:800,color:"#1E293B"}}>
                TOTAL: {COP((parseFloat(sForm.costo_mano_obra||0))+(items.reduce((s,i)=>s+i.cantidad*i.precio_unitario,0)))}
              </div>
            </MBody>
            <MFoot><strong className="operation-total">Total: {COP(totalItems+Number(sForm.costo_mano_obra||0))}</strong><Btn variant="secondary" onClick={closeModal}>Cancelar</Btn><Btn type="submit" disabled={busy}>Guardar servicio</Btn></MFoot>
          </form>
        </ModalWrap>
      )}

      {/* Ver Compra */}
      {modal==="ver-compra" && detail && (
        <ModalWrap title={`🛒 Compra #${detail.id}`} onClose={closeModal} wide>
          <MBody>
            <div className="form-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16,fontSize:13}}>
              <p><strong>Fecha:</strong> {DATE(detail.fecha)}</p>
              <p><strong>Proveedor:</strong> {detail.proveedor}</p>
            </div>
            <DetailTable detalles={detail.detalles}/>
            <DocumentSummary doc={detail} type="compra"/>
          </MBody>
          <MFoot><Btn variant="secondary" onClick={closeModal}>Cerrar</Btn></MFoot>
        </ModalWrap>
      )}

      {/* Ver Venta */}
      {modal==="ver-venta" && detail && (
        <ModalWrap title={`💰 Venta #${detail.id}`} onClose={closeModal} wide>
          <MBody>
            <div className="form-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16,fontSize:13}}>
              <p><strong>Fecha:</strong> {DATE(detail.fecha)}</p>
              <p><strong>Cliente:</strong> {detail.cliente}</p>
            </div>
            <DetailTable detalles={detail.detalles}/>
            <DocumentSummary doc={detail} type="venta"/>
          </MBody>
          <MFoot><Btn variant="secondary" onClick={closeModal}>Cerrar</Btn></MFoot>
        </ModalWrap>
      )}

      {/* Ver Servicio */}
      {modal==="ver-servicio" && detail && (
        <ModalWrap title={`🔧 Servicio #${detail.id} · ${detail.placa||""}`} onClose={closeModal} wide>
          <MBody>
            <div className="form-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14,fontSize:13}}>
              <p><strong>Fecha:</strong> {DATE(detail.fecha)}</p>
              <p><strong>Placa:</strong> {detail.placa||"-"}</p>
              <p><strong>Moto:</strong> {detail.marca_moto||"-"}</p>
              <div style={{gridColumn:"1/-1"}}><strong>Trabajo:</strong> {detail.descripcion_trabajo}</div>
              <p><strong>Estado:</strong> <StatusPill estado={detail.estado}/></p>
              <p><strong>Mano de Obra:</strong> {COP(detail.costo_mano_obra)}</p>
            </div>
            {detail.detalles.length>0 && <DetailTable detalles={detail.detalles}/>}
            {!detail.detalles.length && <p style={{color:"#526479",fontSize:13,marginBottom:12}}>Sin repuestos utilizados</p>}
            <DocumentSummary doc={detail} type="servicio"/><p style={{textAlign:"right",fontWeight:800,fontSize:16,marginTop:12}}>TOTAL SERVICIO: {COP(detail.total)}</p>
          </MBody>
          <MFoot><Btn variant="secondary" onClick={closeModal}>Cerrar</Btn></MFoot>
        </ModalWrap>
      )}
      </div>
    </div></ModalFeedback.Provider>
  );
}
