import React from 'react';
import {isChunkLoadError,reloadOnceForChunkError,safeSessionStorage} from './chunk-reload.mjs';

// Límite de errores: evita la pantalla en blanco. Nunca muestra detalles técnicos al usuario
// (solo van a la consola). Ante un error de carga de chunk tras un deploy recarga UNA vez.
const box={display:'grid',placeItems:'center',minHeight:'60vh',padding:'24px',fontFamily:'system-ui,sans-serif',color:'#1f2937',textAlign:'center'};
const button={marginTop:'12px',padding:'12px 24px',minHeight:'44px',fontSize:'16px',fontWeight:600,border:0,borderRadius:'8px',background:'#b3261e',color:'#fff',cursor:'pointer'};

export default class ErrorBoundary extends React.Component{
 constructor(props){super(props);this.state={failed:false,reloading:false}}
 static getDerivedStateFromError(){return {failed:true}}
 componentDidCatch(error,info){
  try{console.error('SCORTA: error de interfaz',error,info?.componentStack)}catch{}
  if(!isChunkLoadError(error))return;
  const storage=safeSessionStorage();
  const reloading=!!storage&&reloadOnceForChunkError({storage,reload:()=>this.reload()});
  if(reloading)this.setState({reloading:true});
 }
 reload=()=>{try{window.location.reload()}catch{}};
 render(){
  const {failed,reloading}=this.state;
  if(!failed)return this.props.children;
  if(reloading)return <main className="app-error" role="status" aria-live="polite" style={box}><p>Actualizando SCORTA…</p></main>;
  return <main className="app-error" role="alert" style={box}><div>
   <h1 style={{fontSize:'22px',margin:'0 0 8px'}}>Algo falló</h1>
   <p style={{margin:0}}>Recarga la página para continuar. Si el problema sigue, avisa a soporte.</p>
   <button type="button" style={button} onClick={this.reload}>Recargar</button>
  </div></main>;
 }
}
