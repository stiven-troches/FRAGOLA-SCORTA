import React,{useCallback,useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {InventoryApp} from './App.jsx';
import {createDemoStore,installDemoFetch,exportDemoData} from './demo-api.mjs';
import {DEMO_PRODUCT_COUNT} from './demo-seed.mjs';
import './style.css';

const session={username:'Demo',role:'admin',mode:'demo'};
function Demo(){
 const [store,setStore]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[generation,setGeneration]=useState(0),[busy,setBusy]=useState(false);
 const work=useRef({dirty:false,pending:false,busy:false});
 const updateWork=useCallback(state=>{work.current=state},[]);
 useEffect(()=>{let active=true,restore,connection;createDemoStore({onStorageError:message=>{if(active)setError(message)}}).then(value=>{connection=value;if(!active){value.close();return}restore=installDemoFetch(value);setStore(value)}).catch(failure=>{if(active)setError(failure.message)});return()=>{active=false;restore?.();connection?.close()}},[]);
 const reset=async()=>{
  if(busy||work.current.busy)return;
  if(!window.confirm('¿Reiniciar la demo? Se borrarán tus ventas, productos y ajustes de prueba en este navegador y volverá el inventario ficticio inicial.'))return;
  setBusy(true);setError('');setNotice('');
  try{await store.reset();work.current={dirty:false,pending:false,busy:false};setGeneration(value=>value+1);setNotice('Demo reiniciada. Puedes comenzar otra prueba.')}catch(failure){setError(failure.message)}finally{setBusy(false)}
 };
 const download=async()=>{try{await exportDemoData(store)}catch(failure){setError(failure.message)}};
 if(!store)return <main className="demo-loading"><h1>SCORTA · Demo</h1>{error?<><p role="alert" className="demo-error">{error}</p><button className="btn btn-primary" onClick={()=>location.reload()}>Volver a intentar</button></>:<p role="status">Preparando tu inventario de prueba…</p>}</main>;
 return <>
  <section className="demo-banner" aria-label="Demostración de SCORTA">
   <div className="demo-banner-copy"><strong>Demo · Datos ficticios</strong><p>Vende, agrega productos y recibe mercancía. Tus cambios se guardan solo en este navegador.</p></div>
   <div className="demo-actions"><details className="demo-help"><summary>Qué puedo probar</summary><p>Empiezas con {DEMO_PRODUCT_COUNT} productos ficticios, compras, ventas y trabajos de ejemplo. Prueba Nueva venta, Nuevo producto o Compras. Usa Ajustar existencias en la ficha para registrar diferencias de conteo. Puedes volver al inicio con Reiniciar demo.</p></details><button className="btn btn-secondary" disabled={busy||work.current.busy} onClick={reset}>{busy?'Reiniciando…':'Reiniciar demo'}</button></div>
  </section>
  {error&&<div className="demo-error" role="alert">{error}</div>}{notice&&<p className="demo-status" role="status">{notice}</p>}
  <InventoryApp key={generation} session={session} onWorkStateChange={updateWork} onDemoExport={download}/>
 </>;
}
createRoot(document.getElementById('root')).render(<Demo/>);
