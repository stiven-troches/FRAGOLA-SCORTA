import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import PlatformApp from './PlatformApp.jsx';
import {createPlatformDemoStore,installPlatformDemoFetch,exportPlatformDemoData,DEMO_ACCOUNTS,demoWhatsappLink} from './platform-demo.mjs';
import './platform.css';
import './touch.css';
import {JE_TRIAL_PROFILE} from './je-trial-demo.mjs';
import {installDetailsMenus} from './details-menus.mjs';
import Dialog from './Dialog.jsx';

installDetailsMenus();
// Vacío mientras el dueño no configure DEMO_CONTACT_WHATSAPP: entonces el botón no aparece.
const trialLink=demoWhatsappLink();

// FE-22: términos breves propios de la demo.
function DemoTerms({onClose}){return <Dialog title="Términos de la demo" onClose={onClose} bodyClassName="sp-profile-data">
  <p>Esta demo sirve solo para conocer SCORTA. Funciona en tu navegador y no envía tus pruebas a ningún servidor.</p>
  <ul>
    <li>Las empresas, productos, clientes y ventas son <strong>datos ficticios</strong>. No escribas datos reales de personas (nombres, teléfonos o placas de clientes reales).</li>
    <li>La empresa de prueba <strong>{JE_TRIAL_PROFILE.name}</strong> se incluye con autorización de su propietario y usa una cuenta propia.</li>
    <li>Los datos se guardan solo en este navegador y puedes borrarlos con «Reiniciar demo».</li>
    <li>La demo no es una oferta ni un contrato. Las condiciones del servicio real se acuerdan aparte.</li>
  </ul>
  <button type="button" className="sp-primary sp-wide" onClick={onClose}>Entendido</button>
</Dialog>}

function Demo() {
  const [store,setStore]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[generation,setGeneration]=useState(0),[work,setWork]=useState({busy:false,pending:false,dirty:false}),[terms,setTerms]=useState(false);
  useEffect(()=>{
    let active=true,restore,connection;
    createPlatformDemoStore({onStorageError:message=>{if(active)setError(message)}}).then(value=>{
      connection=value;if(!active){value.close();return}
      restore=installPlatformDemoFetch(value);setStore(value);
    }).catch(failure=>{if(active)setError(failure.message)});
    return()=>{active=false;restore?.();connection?.close()};
  },[]);
  useEffect(()=>{const update=event=>setWork({busy:!!event.detail?.busy,pending:!!event.detail?.pending,dirty:!!event.detail?.dirty});window.addEventListener('scorta:work-state',update);return()=>window.removeEventListener('scorta:work-state',update)},[]);
  const changing=busy||work.busy||work.pending;
  const changeSession=()=>{setWork({busy:false,pending:false,dirty:false});setGeneration(value=>value+1);window.dispatchEvent(new Event('scorta:session-updated'))};
  const login=async role=>{
    if(changing)return;
    if(work.dirty&&!window.confirm('¿Cambiar de perfil? Se descartará el formulario o carrito que no hayas guardado.'))return;
    setBusy(true);setError('');setNotice('');
    try{await store.loginAs(role);changeSession()}catch(failure){setError(failure.message)}finally{setBusy(false)}
  };
  const reset=async()=>{
    if(changing||!window.confirm('¿Reiniciar la demo? Se borrarán las empresas, usuarios, ventas y ajustes que hayas probado en este navegador y volverán los datos ficticios iniciales.'))return;
    setBusy(true);setError('');setNotice('');
    try{await store.reset();changeSession();setNotice('Demo reiniciada. Elige un perfil de prueba para comenzar.')}catch(failure){setError(failure.message)}finally{setBusy(false)}
  };
  const download=async()=>{if(busy)return;try{await exportPlatformDemoData(store)}catch(failure){setError(failure.message)}};
  const bannerStyle={display:'flex',gap:12,alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',padding:'10px 18px',background:'#fff9dd',borderBottom:'1px solid #e3cd61',color:'#1c1c1c',fontSize:14};
  const buttonStyle={padding:'7px 12px',border:'1px solid #b5a457',borderRadius:7,background:'#fff',color:'#1c1c1c',font:'inherit',minHeight:44,minWidth:44,cursor:'pointer'};
  const trialStyle={...buttonStyle,display:'inline-flex',alignItems:'center',background:'#128c4a',borderColor:'#0d6b38',color:'#fff',fontWeight:700,textDecoration:'none'};
  const linkStyle={...buttonStyle,border:0,background:'transparent',textDecoration:'underline',padding:'7px 4px'};
  if(!store)return <main style={{padding:'40px 24px',fontFamily:'system-ui,sans-serif',maxWidth:680,margin:'auto'}}><h1>SCORTA · Demo</h1>{error?<><p role="alert">{error}</p><button onClick={()=>location.reload()}>Volver a intentar</button></>:<p role="status">Preparando las empresas y el inventario de prueba…</p>}</main>;
  return <>
    <section style={bannerStyle} aria-label="Demostración de SCORTA">
      <div><strong>Demo con datos ficticios</strong><div>Los cambios se guardan solo en este navegador. No es el inventario real; la empresa de prueba {JE_TRIAL_PROFILE.name} se incluye con autorización. <button type="button" style={linkStyle} onClick={()=>setTerms(true)}>Términos de la demo</button></div></div>
      <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
        {trialLink&&<a style={trialStyle} href={trialLink} target="_blank" rel="noopener noreferrer">Pedir prueba por WhatsApp</a>}
        <span>Probar como:</span>
        <button style={buttonStyle} disabled={changing} onClick={()=>login('owner')}>Propietario</button>
        <button style={buttonStyle} disabled={changing} onClick={()=>login('admin')}>Administrador</button>
        <button style={buttonStyle} disabled={changing} onClick={()=>login('vendedor')}>Vendedor</button>
        <details data-menu style={{position:'relative'}}><summary style={{...buttonStyle,listStyle:'none'}}>Datos de prueba</summary><div style={{position:'absolute',zIndex:1000,right:0,top:'100%',background:'#fff',border:'1px solid #b5a457',padding:16,width:'min(360px,90vw)',borderRadius:8,boxShadow:'0 8px 24px #0002'}}>
          <p style={{marginTop:0}}>Accesos públicos exclusivos de las empresas ficticias:</p>
          {Object.entries(DEMO_ACCOUNTS).map(([role,account])=><div key={role} style={{marginBottom:12}}><strong>{({owner:'Propietario',admin:'Administrador',vendedor:'Vendedor'})[role]}</strong><div>{account.company} · {account.username}</div><code style={{overflowWrap:'anywhere'}}>{account.password}</code></div>)}
          <p><strong>{JE_TRIAL_PROFILE.name}</strong> está preparada con su cuenta propia; entra desde el formulario de ingreso. Sus credenciales no aparecen en estos accesos públicos.</p><p>Los enlaces de comprobante de esta demo funcionan solo en este navegador. La instalación real comparte los datos desde el servidor.</p>
          <button style={buttonStyle} onClick={download}>Exportar datos ficticios</button>
        </div></details>
        <button style={buttonStyle} disabled={changing} onClick={reset}>{busy?'Procesando…':'Reiniciar demo'}</button>
      </div>
    </section>
    {error&&<p role="alert" style={{margin:0,padding:'10px 18px',background:'#fff9dd',color:'#302b17'}}>{error}</p>}
    {notice&&<p role="status" style={{margin:0,padding:'8px 18px',background:'#fff9dd',color:'#302b17'}}>{notice}</p>}
    <div inert={busy?true:undefined} aria-busy={busy}><PlatformApp key={generation}/></div>
    {terms&&<DemoTerms onClose={()=>setTerms(false)}/>}
  </>;
}
createRoot(document.getElementById('root')).render(<Demo/>);
