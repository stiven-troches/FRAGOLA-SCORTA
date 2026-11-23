import React,{useEffect,useRef,useState} from 'react';
import Dialog from './Dialog.jsx';
import {UNSUPPORTED_SCANNER_MESSAGE,createRepeatGuard,detectorFormats,stopStream,beep} from './barcode-scanner.mjs';

const SOUND_KEY='scorta:scanner-sound';
const readSound=()=>{try{return globalThis.localStorage?.getItem(SOUND_KEY)!=='0'}catch{return true}};
const cameraError=error=>error?.name==='NotAllowedError'||error?.name==='SecurityError'?'No diste permiso para usar la cámara. Actívalo en la configuración del navegador para este sitio.':error?.name==='NotFoundError'||error?.name==='OverconstrainedError'?'No encontramos una cámara en este equipo.':error?.name==='NotReadableError'?'Otra aplicación está usando la cámara. Ciérrala e inténtalo de nuevo.':'No se pudo abrir la cámara.';

// FE-19: lector de códigos. onDetected(code) devuelve {ok,message}. La cámara se apaga
// siempre al cerrar, al desmontar o al ocultar la pestaña.
export default function BarcodeScanner({onDetected,onClose}){
 const video=useRef(null),handler=useRef(onDetected),closeRef=useRef(onClose);handler.current=onDetected;closeRef.current=onClose;
 const[status,setStatus]=useState('starting'),[message,setMessage]=useState(null),[sound,setSound]=useState(readSound);
 const soundRef=useRef(sound);soundRef.current=sound;
 useEffect(()=>{
  let stream=null,timer=null,stopped=false;const repeat=createRepeatGuard();
  const stop=()=>{stopped=true;clearTimeout(timer);stopStream(stream);stream=null;if(video.current)video.current.srcObject=null};
  const hidden=()=>{if(document.visibilityState==='hidden'){stop();closeRef.current?.()}};
  (async()=>{
   const Detector=globalThis.BarcodeDetector;
   if(typeof Detector!=='function'||!navigator.mediaDevices?.getUserMedia){setStatus('error');setMessage({ok:false,text:UNSUPPORTED_SCANNER_MESSAGE});return}
   try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
    if(stopped){stopStream(stream);return}
    video.current.srcObject=stream;await video.current.play().catch(()=>{});
    const formats=await detectorFormats(Detector),detector=formats?new Detector({formats}):new Detector();
    if(stopped)return;setStatus('scanning');
    const tick=async()=>{
     if(stopped)return;
     try{
      if(video.current?.readyState>=2){
       const codes=await detector.detect(video.current),raw=codes?.find(c=>c?.rawValue)?.rawValue;
       if(raw&&!stopped&&repeat(raw)){const result=handler.current?.(raw)||{ok:false,text:''};setMessage({ok:!!result.ok,text:result.message||''});if(result.ok&&soundRef.current)beep(window);navigator.vibrate?.(result.ok?60:[40,60,40])}
      }
     }catch{}
     if(!stopped)timer=setTimeout(tick,250);
    };
    tick();
   }catch(error){stop();setStatus('error');setMessage({ok:false,text:cameraError(error)})}
  })();
  document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',stop);
  return()=>{stop();document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',stop)};
 },[]);
 const toggleSound=value=>{setSound(value);try{globalThis.localStorage?.setItem(SOUND_KEY,value?'1':'0')}catch{}};
 return <Dialog title="Leer código con la cámara" onClose={onClose} className="cw-modal cw-scanner" backdropClassName="cw-modal-backdrop" bodyClassName="cw-modal-body" closeClassName="cw-icon-button" closeLabel="Cerrar cámara" initialFocus=".cw-scanner-done">
  <div className="cw-scanner-body">
   <div className="cw-scanner-view"><video ref={video} muted playsInline autoPlay aria-label="Vista de la cámara"/>{status==='scanning'&&<span className="cw-scanner-frame" aria-hidden="true"/>}{status==='starting'&&<p className="cw-scanner-hint" role="status">Abriendo la cámara…</p>}</div>
   <p className="cw-muted">Apunta al código de barras del producto. Se agrega al carrito al leerlo; puedes leer varios seguidos.</p>
   {message?.text&&<p className={message.ok?'cw-scanner-ok':'cw-error'} role={message.ok?'status':'alert'}>{message.text}</p>}
   <label className="cw-scanner-sound"><input type="checkbox" checked={sound} onChange={e=>toggleSound(e.target.checked)}/> Aviso sonoro al leer</label>
   <button type="button" className="cw-btn cw-btn-primary cw-scanner-done" onClick={onClose}>Listo</button>
  </div>
 </Dialog>;
}
