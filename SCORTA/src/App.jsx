import Papa from 'papaparse';
import React, { useState, useEffect, useRef } from "react";

/* ======= HELPERS ======= */
const COP = (v) => new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",minimumFractionDigits:0}).format(v||0);
const DATE = (d) => { if(!d) return "-"; return new Date(d+"T12:00").toLocaleDateString("es-CO"); };
const TODAY = () => new Intl.DateTimeFormat("en-CA",{timeZone:"America/Bogota",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());

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

function Btn({children,onClick,type="button",variant="primary",sm=false,disabled=false}) {
  const v={primary:{background:"#2563EB",color:"white"},secondary:{background:"#E2E8F0",color:"#1E293B"},success:{background:"#147A39",color:"white"}};
  return <button type={type} onClick={onClick} disabled={disabled}
    style={{padding:sm?"4px 10px":"8px 16px",borderRadius:6,fontSize:sm?11:13,fontWeight:600,cursor:disabled?"not-allowed":"pointer",border:"none",opacity:disabled?0.5:1,...v[variant]||v.primary}}>
    {children}
  </button>;
}

function FG({children,label,span=1}) {
  return <div style={{gridColumn:`span ${span}`}}>
    <label style={{display:"block",fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.04em",color:"#475569",marginBottom:4}}>{label}{children}</label>
  </div>;
}

function MInput({value,onChange,type="text",placeholder="",required=false,min,step,rows,disabled=false}) {
  const s=S.input;
  if (rows) return <textarea value={value??""} onChange={onChange} required={required} rows={rows} placeholder={placeholder} style={{...s,resize:"vertical"}}/>;
  return <input disabled={disabled} type={type} value={value??""} onChange={onChange} required={required} min={min} step={step} placeholder={placeholder} style={s}/>;
}

function MSelect({value,onChange,children,...rest}) {
  return <select {...rest} value={value||""} onChange={onChange} style={{...S.input,cursor:"pointer"}}>{children}</select>;
}

function ModalWrap({title,onClose,children,wide=false}) {
  const box=useRef(null);
  useEffect(()=>{const prior=document.activeElement;const el=box.current;el?.querySelector('input,select,textarea,button')?.focus();const key=e=>{if(e.key==='Escape'){e.preventDefault();onClose()}if(e.key==='Tab'){const controls=[...el.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]')];if(!controls.length)return;const first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);prior?.focus()}},[]);
  return (
    <div ref={box} role="dialog" aria-modal="true" aria-label={title} onClick={e=>e.target===e.currentTarget&&onClose()}
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:20}}>
      <div style={{background:"white",borderRadius:12,width:"100%",maxWidth:wide?820:540,maxHeight:"90vh",display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:"0 25px 70px rgba(0,0,0,0.25)"}}>
        <div style={{padding:"16px 20px",borderBottom:"1px solid #E2E8F0",display:"flex",alignItems:"center",justifyContent:"space-between",background:"#F8FAFC",flexShrink:0}}>
          <h2 style={{fontSize:16,fontWeight:700}}>{title}</h2>
          <button aria-label="Cerrar ventana" onClick={onClose} style={{background:"none",border:"none",fontSize:18,cursor:"pointer",color:"#526479",padding:"4px 8px",borderRadius:4}}>✕</button>
        </div>
        <div style={{overflowY:"auto",flex:1}}>{children}</div>
      </div>
    </div>
  );
}

function MBody({children}) { return <div style={{padding:20}}>{children}</div>; }
function MFoot({children}) { return <div style={{padding:"14px 20px",borderTop:"1px solid #E2E8F0",display:"flex",gap:8,justifyContent:"flex-end",background:"#F8FAFC",flexShrink:0}}>{children}</div>; }

function DetailTable({detalles}) {
  const total=detalles.reduce((s,i)=>s+i.cantidad*i.precio_unitario,0);
  return (
    <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
      <thead><tr><th style={S.th}>Producto</th><th style={S.th}>Cant.</th><th style={S.th}>Precio Unit.</th><th style={S.th}>Subtotal</th></tr></thead>
      <tbody>{detalles.map((d,i)=>(
        <tr key={i}><td style={S.td}>{d.nombre}</td><td style={S.td}>{d.cantidad}</td><td style={S.td}>{COP(d.precio_unitario)}</td><td style={{...S.td,fontWeight:700}}>{COP(d.cantidad*d.precio_unitario)}</td></tr>
      ))}</tbody>
      <tfoot><tr>
        <td colSpan={3} style={{padding:"12px 16px",textAlign:"right",fontWeight:700,background:"#F8FAFC",borderTop:"2px solid #E2E8F0",fontSize:14}}>TOTAL</td>
        <td style={{padding:"12px 16px",fontWeight:800,fontSize:15,background:"#F8FAFC",borderTop:"2px solid #E2E8F0"}}>{COP(total)}</td>
      </tr></tfoot>
    </table>
  );
}

function ItemsList({items,onRemove}) {
  const total=items.reduce((s,i)=>s+i.cantidad*i.precio_unitario,0);
  if (!items.length) return <p style={{color:"#526479",textAlign:"center",padding:16,fontStyle:"italic",fontSize:13}}>Sin productos agregados</p>;
  return (
    <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
      <thead><tr><th style={S.th}>Producto</th><th style={S.th}>Cant.</th><th style={S.th}>Precio Unit.</th><th style={S.th}>Subtotal</th><th style={S.th}></th></tr></thead>
      <tbody>{items.map((it,i)=>(
        <tr key={i}>
          <td style={S.td}>{it.nombre}</td><td style={S.td}>{it.cantidad}</td>
          <td style={S.td}>{COP(it.precio_unitario)}</td>
          <td style={{...S.td,fontWeight:700}}>{COP(it.cantidad*it.precio_unitario)}</td>
          <td style={S.td}><button aria-label={`Quitar ${it.nombre}`} onClick={()=>onRemove(i)} style={{background:"none",border:"none",cursor:"pointer",color:"#DC2626",fontWeight:900,fontSize:16}}>✕</button></td>
        </tr>
      ))}</tbody>
      <tfoot><tr>
        <td colSpan={3} style={{padding:"12px 16px",textAlign:"right",fontWeight:700,background:"#F8FAFC",borderTop:"2px solid #E2E8F0"}}>TOTAL</td>
        <td style={{padding:"12px 16px",fontWeight:800,fontSize:15,background:"#F8FAFC",borderTop:"2px solid #E2E8F0"}}>{COP(total)}</td>
        <td style={{background:"#F8FAFC",borderTop:"2px solid #E2E8F0"}}></td>
      </tr></tfoot>
    </table>
  );
}

function AddItemRow({prods,tempItem,setTempItem,onAdd,label="producto",compra=false}) {
  const prod = prods.find(p=>p.id===tempItem.producto_id);
  const ch = (k,v) => setTempItem(prev=>({...prev,[k]:v}));
  return (
    <div style={{background:"#F8FAFC",border:"1.5px dashed #CBD5E1",borderRadius:8,padding:14,marginBottom:14}}>
      <p style={{fontSize:11,fontWeight:700,color:"#526479",textTransform:"uppercase",marginBottom:10}}>Agregar {label}</p>
      <div style={{display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap"}}>
        <div style={{flex:2,minWidth:160}}>
          <MSelect aria-label="Seleccionar producto" value={tempItem.producto_id||""} onChange={e=>{
            const p=prods.find(pp=>pp.id===e.target.value);
            ch("producto_id",e.target.value);
            if(p) ch("precio_unitario",compra?p.precio_compra:p.precio_venta);
          }}>
            <option value="">Seleccionar {label}...</option>
            {prods.map(p=><option key={p.id} value={p.id}>{p.nombre} (Stock: {p.stock})</option>)}
          </MSelect>
        </div>
        <div style={{width:80}}><MInput type="number" value={tempItem.cantidad||""} onChange={e=>ch("cantidad",e.target.value)} placeholder="Cant." min="1"/></div>
        <div style={{width:110}}><MInput type="number" value={tempItem.precio_unitario||""} onChange={e=>ch("precio_unitario",e.target.value)} placeholder="Precio" min="0"/></div>
        <Btn onClick={onAdd} variant="success">+ Agregar</Btn>
      </div>
      {prod && <p style={{fontSize:11,color:"#526479",marginTop:6}}>Precio sugerido: {COP(compra?prod.precio_compra:prod.precio_venta)} · Stock disponible: {prod.stock}</p>}
    </div>
  );
}

function Toast({msg,type}) {
  if(!msg) return null;
  return <div role={type==="error"?"alert":"status"} style={{position:"fixed",top:20,right:20,zIndex:9999,padding:"12px 20px",borderRadius:8,fontWeight:700,fontSize:13,
    background:type==="error"?"#FEE2E2":"#DCFCE7",color:type==="error"?"#991B1B":"#166534",
    border:`1px solid ${type==="error"?"#FECACA":"#BBF7D0"}`,boxShadow:"0 4px 16px rgba(0,0,0,0.15)"}}>
    {msg}
  </div>;
}

/* ======= MAIN APP ======= */
export default function App() {
  const [view,setView]       = useState("dashboard");
  const [prods,setProds]     = useState([]);
  const [compras,setCompras] = useState([]);
  const [ventas,setVentas]   = useState([]);
  const [servs,setServs]     = useState([]);
  const [toast,setToast]     = useState(null);
  const [modal,setModal]     = useState(null);     // "producto"|"compra"|"venta"|"servicio"|"ver-*"
  const [detail,setDetail]   = useState(null);
  const [items,setItems]     = useState([]);
  const [tempItem,setTempItem] = useState({});
  const [pForm,setPForm]     = useState({});
  const [cForm,setCForm]     = useState({});
  const [vForm,setVForm]     = useState({});
  const [sForm,setSForm]     = useState({});
  const [adjust,setAdjust]=useState({}), [reverse,setReverse]=useState({});
  const [importRows,setImportRows]=useState([]);
  const [session,setSession]=useState(null),[users,setUsers]=useState([]),[userForm,setUserForm]=useState({role:'operador'}),[audit,setAudit]=useState([]);

  const notify = (msg,type="success") => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };
  const requestKey=useRef(null), openedRevision=useRef(null);
  const closeModal = () => { requestKey.current=null;openedRevision.current=null; setModal(null); setItems([]); setTempItem({}); setDetail(null); };


  const [revision,setRevision]=useState(0), [ready,setReady]=useState(false), [busy,setBusy]=useState(false), [query,setQuery]=useState(''), [movimientos,setMovimientos]=useState([]), [loadError,setLoadError]=useState('');
  const [lastSync,setLastSync]=useState(null);
  const hydrate=s=>{setLastSync(new Date());setLoadError('');setProds(s.prods);setCompras(s.compras);setVentas(s.ventas);setServs(s.servs);setMovimientos(s.movimientos);setAudit(s.auditoria||[]);setRevision(s.revision);setReady(true)};
  const reload=()=>fetch('/api/state').then(r=>{if(!r.ok)throw Error('No se pudo conectar al servidor');return r.json()}).then(hydrate).catch(e=>setLoadError(e.message));
  useEffect(()=>{reload();fetch('/api/session').then(r=>r.json()).then(setSession).catch(()=>{});const t=setInterval(reload,15000);return ()=>clearInterval(t)},[]);
  useEffect(()=>{if(modal){openedRevision.current=revision;requestKey.current=crypto.randomUUID()}},[modal]);
  const commit=async(kind,form={},extra={})=>{
    if(busy)return;setBusy(true);
    try{if(!requestKey.current)requestKey.current=crypto.randomUUID();const r=await fetch('/api/change',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,form,items,revision:modal?openedRevision.current:revision,requestId:requestKey.current,...extra})});const data=await r.json();if(!r.ok){requestKey.current=null;throw Error(data.error||'No se pudo guardar')} hydrate(data);notify('Guardado correctamente');closeModal();}
    catch(e){notify(e.message+' Revisa los datos; si hubo desconexión, reintenta sin modificar la operación.','error');await reload()}finally{setBusy(false)}
  };

  /* --- Item management --- */
  const addItem = () => {
    const {producto_id,cantidad,precio_unitario}=tempItem;
    if (!producto_id) return notify("Selecciona un producto","error");
    const qty=Number(cantidad), price=Number(precio_unitario);
    if (!Number.isSafeInteger(qty)||qty<1) return notify("Ingresa una cantidad válida","error");
    if (!Number.isFinite(price)||price<0) return notify("Ingresa un precio válido","error");
    const prod=prods.find(p=>p.id===producto_id);
    if (!prod) return;
    if (modal==="venta"||modal==="servicio") {
      const enLista=items.filter(i=>i.producto_id===producto_id).reduce((s,i)=>s+i.cantidad,0);
      if (enLista+qty>prod.stock) return notify(`Stock insuficiente para "${prod.nombre}". Disponible: ${prod.stock-enLista}`,"error");
    }
    const existIdx=items.findIndex(i=>i.producto_id===producto_id);
    if (existIdx>=0 && items[existIdx].precio_unitario===price) {
      setItems(its=>its.map((it,i)=>i===existIdx?{...it,cantidad:it.cantidad+qty}:it));
    } else {
      setItems(its=>[...its,{producto_id:producto_id,nombre:prod.nombre,cantidad:qty,precio_unitario:price}]);
    }
    setTempItem({});
  };
  const removeItem = (idx) => setItems(its=>its.filter((_,i)=>i!==idx));

  /* --- CRUD actions --- */
  const saveProducto = e=>{e.preventDefault();commit('producto',pForm)};
  const saveCompra = e=>{e.preventDefault();commit('compra',cForm)};
  const saveVenta = e=>{e.preventDefault();commit('venta',vForm)};
  const saveServicio = e=>{e.preventDefault();commit('servicio',sForm)};
  const openReverse=(tipo,doc,parcial=false)=>{setReverse({tipo,doc,parcial,motivo:'',cantidades:{}});setModal('reversion')};
  const avanzarEstado = (id)=>{if(confirm('¿Avanzar el estado del servicio?'))commit('estado',{}, {id})};
  /* --- Dashboard calcs --- */
  const ventasPeriodo=ventas.filter(v=>!v.anulada&&v.fecha.startsWith(TODAY().slice(0,7)));
  const entregados=servs.filter(v=>!v.anulada&&v.estado==='entregado'&&v.fecha_entrega?.startsWith(TODAY().slice(0,7)));
  const ventasMes=ventasPeriodo.reduce((s,v)=>s+v.total-v.detalles.reduce((n,d)=>n+(d.devuelto||0)*d.precio_unitario,0),0);
  const serviciosMes=entregados.reduce((s,sv)=>s+sv.total,0);
  const stockBajo    = prods.filter(p=>p.stock<=p.stock_minimo);

  /* --- Nav style helper --- */
  const navSt = (id) => ({display:"flex",alignItems:"center",gap:12,padding:"12px 18px",
    color:view===id?"white":"rgba(255,255,255,0.65)",cursor:"pointer",
    borderLeft:view===id?"3px solid #2563EB":"3px solid transparent",
    background:view===id?"rgba(37,99,235,0.25)":"transparent",
    fontWeight:view===id?600:400,transition:"all 0.15s",userSelect:"none"});

  const phRow = (title,btn,onBtn) => (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
      <h1 style={{fontSize:22,fontWeight:700}}>{title}</h1>
      {btn && <Btn onClick={onBtn}>{btn}</Btn>}
    </div>
  );

  return (
    <div style={{minHeight:"100vh",display:"flex",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",background:"#F1F5F9"}}>
      {toast && <Toast msg={toast.msg} type={toast.type}/>}

      {/* ===== SIDEBAR ===== */}
      <aside style={{width:220,background:"#1E293B",minHeight:"100vh",position:"sticky",top:0,display:"flex",flexDirection:"column",flexShrink:0}}>
        <div style={{padding:"20px 16px",display:"flex",alignItems:"center",gap:10,borderBottom:"1px solid rgba(255,255,255,0.1)"}}>
          <span style={{fontSize:24}}>🏍️</span>
          <span style={{color:"white",fontSize:17,fontWeight:700}}>SCORTA</span>
        </div>
        <nav style={{padding:"12px 0",flex:1}}>
          {[{id:"dashboard",i:"📊",l:"Dashboard"},{id:"inventario",i:"📦",l:"Inventario"},
            {id:"compras",i:"🛒",l:"Compras"},{id:"ventas",i:"💰",l:"Ventas"},{id:"servicios",i:"🔧",l:"Servicios"},{id:"movimientos",i:"↔",l:"Movimientos"},...(session?.role==='admin'?[{id:"usuarios",i:"👥",l:"Usuarios"}]:[])]
            .map(n=>(
              <button type="button" key={n.id} aria-current={view===n.id?'page':undefined} onClick={()=>setView(n.id)} style={{...navSt(n.id),width:'100%',borderTop:0,borderBottom:0,borderRight:0,textAlign:'left'}}>
                <span style={{fontSize:18}}>{n.i}</span><span>{n.l}</span>
              </button>
            ))}
        </nav>
        <div style={{padding:16,color:"rgba(255,255,255,0.3)",fontSize:11,borderTop:"1px solid rgba(255,255,255,0.08)"}}>
          🟢 Base de datos central · COP
        </div>
      </aside>

      {/* ===== MAIN ===== */}
      <main aria-busy={busy} style={{flex:1,padding:28,overflowY:"auto",minWidth:0}}>

        {!ready && <p role="alert">{loadError||'Conectando con la base de datos…'} <button onClick={reload}>Reintentar</button></p>}
        <div style={{display:'flex',gap:12,marginBottom:20,alignItems:'center',flexWrap:'wrap'}}>{session?.role==='admin'&&<a href="/api/backup">Descargar respaldo</a>}<button onClick={reload}>Actualizar datos</button><span>{busy?'Guardando…':loadError?'Sin conexión: '+loadError:lastSync?'Actualizado: '+lastSync.toLocaleTimeString('es-CO'):'Conectando…'}</span></div>
        <fieldset disabled={!ready||busy} style={{border:0,padding:0,minWidth:0}}>
        {/* === DASHBOARD === */}
        {view==="dashboard" && <>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
            <h1 style={{fontSize:22,fontWeight:700}}>📊 Dashboard</h1>
            <span style={{fontSize:13,color:"#526479"}}>{new Date().toLocaleDateString("es-CO",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:16,marginBottom:20}}>
            {[{icon:"💰",v:COP(ventasMes),l:"Ventas del Mes",s:`${ventasPeriodo.length} venta(s)`,b:"#2563EB"},
              {icon:"🔧",v:COP(serviciosMes),l:"Servicios entregados del mes",s:`${entregados.length} servicio(s)`,b:"#147A39"}].map((s,i)=>(
              <div key={i} style={{background:"white",borderRadius:8,padding:20,display:"flex",alignItems:"center",gap:16,boxShadow:"0 1px 3px rgba(0,0,0,0.1)",borderLeft:`4px solid ${s.b}`}}>
                <span style={{fontSize:34}}>{s.icon}</span>
                <div>
                  <div style={{fontSize:20,fontWeight:800}}>{s.v}</div>
                  <div style={{fontSize:11,color:"#526479",textTransform:"uppercase",fontWeight:600,letterSpacing:"0.04em"}}>{s.l}</div>
                  <div style={{fontSize:12,color:"#526479",marginTop:2}}>{s.s}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"260px 1fr",gap:16}}>
            <div style={S.card}>
              <div style={{padding:"14px 20px",borderBottom:"1px solid #E2E8F0",fontWeight:600,fontSize:14}}>⚠️ Stock Bajo / Agotado</div>
              <div style={{padding:"12px 16px"}}>
                {!stockBajo.length
                  ? <p style={{color:"#526479",textAlign:"center",padding:8,fontSize:13}}>{prods.length?'✅ Todo el inventario está bien':'Agrega tu primer producto para comenzar.'}</p>
                  : stockBajo.map(p=>(
                    <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"1px solid #E2E8F0",fontSize:13}}>
                      <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",paddingRight:8}}>{p.nombre}</span>
                      <StockPill stock={p.stock} minimo={p.stock_minimo}/>
                    </div>
                  ))}
              </div>
            </div>
            <div style={S.card}>
              <div style={{padding:"14px 20px",borderBottom:"1px solid #E2E8F0",fontWeight:600,fontSize:14}}>📋 Últimas Ventas</div>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr><th style={S.th}>Fecha</th><th style={S.th}>Cliente</th><th style={S.th}>Total</th></tr></thead>
                <tbody>{ventas.slice(0,5).map(v=>(
                  <tr key={v.id}><td style={S.td}>{DATE(v.fecha)}</td><td style={S.td}>{v.cliente}</td><td style={{...S.td,fontWeight:700}}>{COP(v.total)}</td></tr>
                ))}</tbody>
              </table>
            </div>
            <div style={{...S.card,gridColumn:"1/-1"}}>
              <div style={{padding:"14px 20px",borderBottom:"1px solid #E2E8F0",fontWeight:600,fontSize:14}}>🔧 Últimos Servicios</div>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr><th style={S.th}>Fecha</th><th style={S.th}>Placa</th><th style={S.th}>Moto</th><th style={S.th}>Estado</th><th style={S.th}>Total</th></tr></thead>
                <tbody>{servs.slice(0,5).map(s=>(
                  <tr key={s.id}>
                    <td style={S.td}>{DATE(s.fecha)}</td>
                    <td style={{...S.td,fontWeight:700}}>{s.placa||"-"}</td>
                    <td style={S.td}>{s.marca_moto||"-"}</td>
                    <td style={S.td}><StatusPill estado={s.estado}/></td>
                    <td style={{...S.td,fontWeight:700}}>{COP(s.total)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </>}

        {view==='movimientos'&&<>{phRow('Movimientos de inventario')}<div style={S.card}><table style={{width:'100%'}}><thead><tr>{['Fecha','Producto','Tipo','Unidades'].map(x=><th style={S.th} key={x}>{x}</th>)}</tr></thead><tbody>{movimientos.map(x=><tr key={x.id}><td style={S.td}>{new Date(x.fecha).toLocaleString('es-CO',{timeZone:'America/Bogota'})}</td><td style={S.td}>{x.nombre}</td><td style={S.td}>{x.tipo}{x.motivo?": "+x.motivo:""}</td><td style={S.td}>{x.cantidad}</td></tr>)}</tbody></table></div></>}
        {view==='usuarios'&&<><h1>Usuarios y actividad</h1><p>Sesión: {session?.username} · {session?.role}</p><Btn onClick={()=>{fetch('/api/users').then(r=>r.json()).then(setUsers);setUserForm({role:'operador'});setModal('usuario')}}>Crear usuario</Btn><h2>Actividad reciente</h2><div style={S.card}><table><thead><tr><th style={S.th}>Fecha</th><th style={S.th}>Usuario</th><th style={S.th}>Acción</th><th style={S.th}>Documento</th></tr></thead><tbody>{audit.map(x=><tr key={x.id}><td style={S.td}>{new Date(x.fecha).toLocaleString('es-CO')}</td><td style={S.td}>{x.usuario}</td><td style={S.td}>{x.accion}</td><td style={S.td}>{x.documento}</td></tr>)}</tbody></table></div></>}
        {/* === INVENTARIO === */}
        {view==="inventario" && <>
          {phRow("📦 Inventario","+ Nuevo Producto",()=>{setPForm({});setModal("producto");})}<Btn variant="secondary" onClick={()=>{setImportRows([]);setModal('importar')}}>Importar inventario CSV</Btn><input type="search" aria-label="Buscar productos" placeholder="Buscar por nombre, referencia, marca o código…" value={query} onChange={e=>setQuery(e.target.value)}/>{!prods.length&&<p>Tu inventario está vacío. Crea el primer producto para comenzar.</p>}
          <div style={S.card}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr><th style={S.th}>Nombre</th><th style={S.th}>Categoría</th><th style={S.th}>P. Compra</th><th style={S.th}>P. Venta</th><th style={S.th}>Stock</th><th style={S.th}>Mín.</th><th style={S.th}>Acciones</th></tr></thead>
              <tbody>{prods.filter(p=>[p.nombre,p.categoria,p.referencia,p.marca,p.modelo,p.compatibilidad,p.codigo_barras].join(' ').toLowerCase().includes(query.toLowerCase())).map(p=>(
                <tr key={p.id} style={{background:"white"}}>
                  <td style={{...S.td,fontWeight:600,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.nombre}</td>
                  <td style={S.td}>{p.categoria}</td>
                  <td style={S.td}>{COP(p.precio_compra)}</td>
                  <td style={S.td}>{COP(p.precio_venta)}</td>
                  <td style={S.td}><StockPill stock={p.stock} minimo={p.stock_minimo}/></td>
                  <td style={S.td}>{p.stock_minimo}</td>
                  <td style={S.td}>
                    <button title="Ajustar existencias" aria-label={`Ajustar existencias de ${p.nombre}`} onClick={()=>{setAdjust({producto:p,stock:p.stock,motivo:''});setModal('ajuste')}}>↔</button><button onClick={()=>{setPForm({...p});setModal("producto");}} style={{background:"none",border:"none",cursor:"pointer",fontSize:15,marginRight:6}} title="Editar" aria-label={`Editar ${p.nombre}`}>✏️</button>
                    <button onClick={()=>{if(confirm(`¿Eliminar "${p.nombre}"?`)){commit("eliminar",{}, {id:p.id});}}} style={{background:"none",border:"none",cursor:"pointer",fontSize:15}} title="Eliminar" aria-label={`Retirar ${p.nombre}`}>🗑️</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>}

        {/* === COMPRAS === */}
        {view==="compras" && <>
          {phRow("🛒 Compras","+ Nueva Compra",()=>{setCForm({fecha:TODAY()});setItems([]);setModal("compra");})}
          <div style={S.card}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr><th style={S.th}>#</th><th style={S.th}>Fecha</th><th style={S.th}>Proveedor</th><th style={S.th}>Total</th><th style={S.th}>Acciones</th></tr></thead>
              <tbody>{compras.map(c=>(
                <tr key={c.id}>
                  <td style={{...S.td,fontWeight:700}}>#{c.id}</td>
                  <td style={S.td}>{DATE(c.fecha)}</td>
                  <td style={S.td}>{c.proveedor}</td>
                  <td style={{...S.td,fontWeight:700}}>{COP(c.total)}</td>
                  <td style={S.td}><Btn sm variant="secondary" onClick={()=>{setDetail(c);setModal("ver-compra");}}>Ver detalle</Btn> {c.anulada?"Anulada":<Btn sm variant="secondary" onClick={()=>openReverse("compra",c)}>Anular</Btn>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>}

        {/* === VENTAS === */}
        {view==="ventas" && <>
          {phRow("💰 Ventas","+ Nueva Venta",()=>{setVForm({fecha:TODAY()});setItems([]);setModal("venta");})}
          <div style={S.card}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr><th style={S.th}>#</th><th style={S.th}>Fecha</th><th style={S.th}>Cliente</th><th style={S.th}>Total</th><th style={S.th}>Acciones</th></tr></thead>
              <tbody>{ventas.map(v=>(
                <tr key={v.id}>
                  <td style={{...S.td,fontWeight:700}}>#{v.id}</td>
                  <td style={S.td}>{DATE(v.fecha)}</td>
                  <td style={S.td}>{v.cliente}</td>
                  <td style={{...S.td,fontWeight:700}}>{COP(v.total)}</td>
                  <td style={S.td}><Btn sm variant="secondary" onClick={()=>{setDetail(v);setModal("ver-venta");}}>Ver detalle</Btn> {v.anulada?"Anulada":<><Btn sm variant="secondary" onClick={()=>openReverse("venta",v,true)}>Devolución</Btn> <Btn sm variant="secondary" onClick={()=>openReverse("venta",v)}>Anular</Btn></>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>}

        {/* === SERVICIOS === */}
        {view==="servicios" && <>
          {phRow("🔧 Servicios Técnicos","+ Nuevo Servicio",()=>{setSForm({fecha:TODAY()});setItems([]);setModal("servicio");})}
          <div style={{...S.card,overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
              <thead><tr><th style={S.th}>#</th><th style={S.th}>Fecha</th><th style={S.th}>Placa</th><th style={S.th}>Moto</th><th style={S.th}>Trabajo</th><th style={S.th}>Estado</th><th style={S.th}>Total</th><th style={S.th}>Acciones</th></tr></thead>
              <tbody>{servs.map(s=>(
                <tr key={s.id}>
                  <td style={{...S.td,fontWeight:700}}>#{s.id}</td>
                  <td style={S.td}>{DATE(s.fecha)}</td>
                  <td style={{...S.td,fontWeight:700}}>{s.placa||"-"}</td>
                  <td style={S.td}>{s.marca_moto||"-"}</td>
                  <td style={{...S.td,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={s.descripcion_trabajo}>{s.descripcion_trabajo}</td>
                  <td style={S.td}><StatusPill estado={s.estado}/></td>
                  <td style={{...S.td,fontWeight:700}}>{COP(s.total)}</td>
                  <td style={{...S.td,whiteSpace:"nowrap",display:"flex",gap:6}}>
                    <Btn sm onClick={()=>{setDetail(s);setModal("ver-servicio");}}>Ver</Btn>
                    {s.estado!=="entregado" && !s.anulada && <Btn sm variant="secondary" onClick={()=>avanzarEstado(s.id,s.estado)}>→ Estado</Btn>} {!s.anulada&&<Btn sm variant="secondary" onClick={()=>openReverse("servicio",s)}>Anular</Btn>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>}
      </fieldset></main>

      {/* ============================= */}
      {/*          MODALS              */}
      {/* ============================= */}

      {modal==="importar" && <ModalWrap title="Importar productos" onClose={closeModal}><form onSubmit={e=>{e.preventDefault();commit('importar',{}, {items:importRows})}}><MBody><p>Selecciona un CSV con encabezados: nombre, precio_venta, precio_compra, stock, stock_minimo, categoria, referencia, marca, modelo, compatibilidad, codigo_barras. Máximo 1000 productos; se rechazan duplicados.</p><label>Archivo CSV<input type="file" accept=".csv,text/csv" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;const result=Papa.parse(await file.text(),{header:true,skipEmptyLines:true});if(result.errors.length){notify('CSV inválido: '+result.errors[0].message,'error');setImportRows([])}else setImportRows(result.data)}}/></label><p>{importRows.length} producto(s) listos para importar</p></MBody><MFoot><Btn variant="secondary" onClick={closeModal}>Cancelar</Btn><Btn type="submit" disabled={busy||!importRows.length}>Importar</Btn></MFoot></form></ModalWrap>}
      {modal==="usuario" && <ModalWrap title="Crear usuario" onClose={closeModal}><form onSubmit={async e=>{e.preventDefault();setBusy(true);try{const r=await fetch('/api/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(userForm)});const result=await r.json();if(!r.ok)throw Error(result.error);setUsers(result);notify('Usuario creado');closeModal()}catch(e){notify(e.message,'error')}finally{setBusy(false)}}}><MBody><p>Usuarios existentes: {users.map(x=>`${x.username} (${x.role})`).join(', ')||'ninguno'}</p><FG label="Usuario *"><MInput required value={userForm.username} onChange={e=>setUserForm(f=>({...f,username:e.target.value}))}/></FG><FG label="Contraseña de al menos 16 caracteres *"><MInput required type="password" value={userForm.password} onChange={e=>setUserForm(f=>({...f,password:e.target.value}))}/></FG><label>Rol <select value={userForm.role} onChange={e=>setUserForm(f=>({...f,role:e.target.value}))}><option value="operador">Operador: ventas y servicios</option><option value="admin">Administrador: todas las operaciones</option></select></label></MBody><MFoot><Btn variant="secondary" onClick={closeModal}>Cancelar</Btn><Btn type="submit" disabled={busy}>Crear usuario</Btn></MFoot></form></ModalWrap>}
      {modal==="ajuste" && <ModalWrap title="Ajustar inventario" onClose={closeModal}><form onSubmit={e=>{e.preventDefault();commit('ajuste',{stock:adjust.stock,motivo:adjust.motivo},{id:adjust.producto.id})}}><MBody><p>{adjust.producto.nombre} · Existencias actuales: {adjust.producto.stock}</p><FG label="Cantidad contada *"><MInput required type="number" min="0" step="1" value={adjust.stock} onChange={e=>setAdjust(a=>({...a,stock:e.target.value}))}/></FG><p>Diferencia: {Number(adjust.stock)-adjust.producto.stock}</p><FG label="Motivo *"><MInput required value={adjust.motivo} onChange={e=>setAdjust(a=>({...a,motivo:e.target.value}))}/></FG></MBody><MFoot><Btn variant="secondary" onClick={closeModal}>Cancelar</Btn><Btn type="submit" disabled={busy}>Guardar ajuste</Btn></MFoot></form></ModalWrap>}
      {modal==="reversion" && <ModalWrap title={reverse.parcial?'Devolución de venta':'Anular '+reverse.tipo} onClose={closeModal} wide><form onSubmit={e=>{e.preventDefault();const changes=Object.entries(reverse.cantidades).filter(([,q])=>Number(q)>0).map(([index,cantidad])=>({index:Number(index),cantidad:Number(cantidad)}));commit('reversion',{tipo:reverse.tipo,parcial:reverse.parcial,motivo:reverse.motivo},{id:reverse.doc.id,items:changes})}}><MBody><p>Documento #{reverse.doc.id}. {reverse.tipo==='compra'?'La anulación descuenta las unidades de existencias.':'La operación devuelve las unidades al inventario.'}</p>{reverse.parcial&&reverse.doc.detalles.map((d,i)=><FG key={i} label={`${d.nombre} · disponibles para devolver: ${d.cantidad-(d.devuelto||0)}`}><MInput type="number" min="0" step="1" value={reverse.cantidades[i]??0} onChange={e=>setReverse(a=>({...a,cantidades:{...a.cantidades,[i]:e.target.value}}))}/></FG>)}<FG label="Motivo *"><MInput required value={reverse.motivo} onChange={e=>setReverse(a=>({...a,motivo:e.target.value}))}/></FG></MBody><MFoot><Btn variant="secondary" onClick={closeModal}>Cancelar</Btn><Btn type="submit" disabled={busy}>Confirmar {reverse.parcial?'devolución':'anulación'}</Btn></MFoot></form></ModalWrap>}
      {/* Producto */}
      {modal==="producto" && (
        <ModalWrap title={pForm.id?"✏️ Editar Producto":"📦 Nuevo Producto"} onClose={closeModal}>
          <form aria-busy={busy} onSubmit={saveProducto}>
            <MBody>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <FG label="Nombre *" span={2}><MInput value={pForm.nombre} onChange={e=>setPForm(f=>({...f,nombre:e.target.value}))} required placeholder="Ej: Aceite 10W-40 Castrol 1L"/></FG>
                {[['referencia','Referencia / SKU'],['marca','Marca'],['modelo','Modelo'],['compatibilidad','Compatibilidad'],['codigo_barras','Código de barras']].map(([key,label])=><FG key={key} label={label}><MInput value={pForm[key]} onChange={e=>setPForm(f=>({...f,[key]:e.target.value}))}/></FG>)}
                <FG label="Categoría"><MInput value={pForm.categoria} onChange={e=>setPForm(f=>({...f,categoria:e.target.value}))} placeholder="General"/></FG>
                <FG label="Precio Venta ($) *"><MInput type="number" value={pForm.precio_venta} onChange={e=>setPForm(f=>({...f,precio_venta:e.target.value}))} required min="0" step="100" placeholder="0"/></FG>
                <FG label="Precio Compra ($)"><MInput type="number" value={pForm.precio_compra} onChange={e=>setPForm(f=>({...f,precio_compra:e.target.value}))} min="0" step="100" placeholder="0"/></FG>
                <FG label="Stock Inicial"><MInput type="number" value={pForm.id?(pForm.stock??0):pForm.stock} disabled={!!pForm.id} onChange={e=>setPForm(f=>({...f,stock:e.target.value}))} min="0" placeholder="0"/></FG>
                <FG label="Stock Mínimo (alerta)"><MInput type="number" value={pForm.stock_minimo??5} onChange={e=>setPForm(f=>({...f,stock_minimo:e.target.value}))} min="0" placeholder="5"/></FG>
              </div>
              {pForm.id && <p style={{fontSize:12,color:"#526479",marginTop:8}}>El stock se conserva al editar. Las compras agregan unidades; las ventas y los servicios descuentan unidades.</p>}
            </MBody>
            <MFoot><Btn variant="secondary" onClick={closeModal}>Cancelar</Btn><Btn type="submit" disabled={busy}>💾 Guardar</Btn></MFoot>
          </form>
        </ModalWrap>
      )}

      {/* Compra */}
      {modal==="compra" && (
        <ModalWrap title="🛒 Nueva Compra" onClose={closeModal} wide>
          <form onSubmit={saveCompra}>
            <MBody>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
                <FG label="Fecha"><MInput type="date" value={cForm.fecha} onChange={e=>setCForm(f=>({...f,fecha:e.target.value}))}/></FG>
                <FG label="Proveedor"><MInput value={cForm.proveedor} onChange={e=>setCForm(f=>({...f,proveedor:e.target.value}))} placeholder="Nombre del proveedor"/></FG>
              </div>
              <AddItemRow prods={prods} tempItem={tempItem} setTempItem={setTempItem} onAdd={addItem} label="producto" compra/>
              <ItemsList items={items} onRemove={removeItem}/>
            </MBody>
            <MFoot><Btn variant="secondary" onClick={closeModal}>Cancelar</Btn><Btn type="submit" disabled={busy}>💾 Guardar Compra</Btn></MFoot>
          </form>
        </ModalWrap>
      )}

      {/* Venta */}
      {modal==="venta" && (
        <ModalWrap title="💰 Nueva Venta" onClose={closeModal} wide>
          <form onSubmit={saveVenta}>
            <MBody>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
                <FG label="Fecha"><MInput type="date" value={vForm.fecha} onChange={e=>setVForm(f=>({...f,fecha:e.target.value}))}/></FG>
                <FG label="Cliente"><MInput value={vForm.cliente} onChange={e=>setVForm(f=>({...f,cliente:e.target.value}))} placeholder="Cliente General"/></FG>
              </div>
              <AddItemRow prods={prods.filter(p=>p.stock>0)} tempItem={tempItem} setTempItem={setTempItem} onAdd={addItem} label="producto"/>
              <ItemsList items={items} onRemove={removeItem}/>
            </MBody>
            <MFoot><Btn variant="secondary" onClick={closeModal}>Cancelar</Btn><Btn type="submit" disabled={busy}>💾 Guardar Venta</Btn></MFoot>
          </form>
        </ModalWrap>
      )}

      {/* Servicio */}
      {modal==="servicio" && (
        <ModalWrap title="🔧 Nuevo Servicio Técnico" onClose={closeModal} wide>
          <form onSubmit={saveServicio}>
            <MBody>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:14}}>
                <FG label="Fecha"><MInput type="date" value={sForm.fecha} onChange={e=>setSForm(f=>({...f,fecha:e.target.value}))}/></FG>
                <FG label="Placa *"><MInput required value={sForm.placa} onChange={e=>setSForm(f=>({...f,placa:e.target.value.toUpperCase()}))} placeholder="Ej: ABC123"/></FG>
                <FG label="Marca / Modelo"><MInput value={sForm.marca_moto} onChange={e=>setSForm(f=>({...f,marca_moto:e.target.value}))} placeholder="Ej: Honda CB190R"/></FG>
                <FG label="Descripción del Trabajo *" span={3}><MInput value={sForm.descripcion_trabajo} onChange={e=>setSForm(f=>({...f,descripcion_trabajo:e.target.value}))} required rows={3} placeholder="Describe el trabajo a realizar..."/></FG>
                <FG label="Costo Mano de Obra ($)"><MInput type="number" value={sForm.costo_mano_obra} onChange={e=>setSForm(f=>({...f,costo_mano_obra:e.target.value}))} min="0" step="1000" placeholder="0"/></FG>
              </div>
              <p>Los repuestos se descuentan del inventario al guardar el servicio.</p><AddItemRow prods={prods.filter(p=>p.stock>0)} tempItem={tempItem} setTempItem={setTempItem} onAdd={addItem} label="repuesto"/>
              <ItemsList items={items} onRemove={removeItem}/>
              <div style={{textAlign:"right",marginTop:12,fontSize:16,fontWeight:800,color:"#1E293B"}}>
                TOTAL: {COP((parseFloat(sForm.costo_mano_obra||0))+(items.reduce((s,i)=>s+i.cantidad*i.precio_unitario,0)))}
              </div>
            </MBody>
            <MFoot><Btn variant="secondary" onClick={closeModal}>Cancelar</Btn><Btn type="submit" disabled={busy}>💾 Guardar Servicio</Btn></MFoot>
          </form>
        </ModalWrap>
      )}

      {/* Ver Compra */}
      {modal==="ver-compra" && detail && (
        <ModalWrap title={`🛒 Compra #${detail.id}`} onClose={closeModal} wide>
          <MBody>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16,fontSize:13}}>
              <p><strong>Fecha:</strong> {DATE(detail.fecha)}</p>
              <p><strong>Proveedor:</strong> {detail.proveedor}</p>
            </div>
            <DetailTable detalles={detail.detalles}/>
          </MBody>
          <MFoot><Btn variant="secondary" onClick={closeModal}>Cerrar</Btn></MFoot>
        </ModalWrap>
      )}

      {/* Ver Venta */}
      {modal==="ver-venta" && detail && (
        <ModalWrap title={`💰 Venta #${detail.id}`} onClose={closeModal} wide>
          <MBody>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16,fontSize:13}}>
              <p><strong>Fecha:</strong> {DATE(detail.fecha)}</p>
              <p><strong>Cliente:</strong> {detail.cliente}</p>
            </div>
            <DetailTable detalles={detail.detalles}/>
          </MBody>
          <MFoot><Btn variant="secondary" onClick={closeModal}>Cerrar</Btn></MFoot>
        </ModalWrap>
      )}

      {/* Ver Servicio */}
      {modal==="ver-servicio" && detail && (
        <ModalWrap title={`🔧 Servicio #${detail.id} · ${detail.placa||""}`} onClose={closeModal} wide>
          <MBody>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14,fontSize:13}}>
              <p><strong>Fecha:</strong> {DATE(detail.fecha)}</p>
              <p><strong>Placa:</strong> {detail.placa||"-"}</p>
              <p><strong>Moto:</strong> {detail.marca_moto||"-"}</p>
              <div style={{gridColumn:"1/-1"}}><strong>Trabajo:</strong> {detail.descripcion_trabajo}</div>
              <p><strong>Estado:</strong> <StatusPill estado={detail.estado}/></p>
              <p><strong>Mano de Obra:</strong> {COP(detail.costo_mano_obra)}</p>
            </div>
            {detail.detalles.length>0 && <DetailTable detalles={detail.detalles}/>}
            {!detail.detalles.length && <p style={{color:"#526479",fontSize:13,marginBottom:12}}>Sin repuestos utilizados</p>}
            <p style={{textAlign:"right",fontWeight:800,fontSize:16,marginTop:12}}>TOTAL SERVICIO: {COP(detail.total)}</p>
          </MBody>
          <MFoot><Btn variant="secondary" onClick={closeModal}>Cerrar</Btn></MFoot>
        </ModalWrap>
      )}
    </div>
  );
}
