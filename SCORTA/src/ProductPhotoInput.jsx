import React,{useEffect,useId,useRef,useState} from 'react';
import {stopStream} from './barcode-scanner.mjs';

// Mantiene el archivo enviado por debajo de 500 KB, también con fotos del celular.
function photoFrom(source,width,height){
 if(!width||!height)throw Error('La cámara todavía no está lista. Intenta de nuevo.');
 const canvas=document.createElement('canvas');
 const scale=Math.min(1,1280/Math.max(width,height));
 canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
 const ctx=canvas.getContext('2d');
 if(!ctx)throw Error('No se pudo preparar la foto.');
 ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.drawImage(source,0,0,canvas.width,canvas.height);
 for(const quality of [.85,.7,.55,.4]){
  const value=canvas.toDataURL('image/jpeg',quality);
  if(value.startsWith('data:image/jpeg;base64,')&&value.length<666000)return value;
 }
 throw Error('No se pudo reducir la foto a 500 KB. Elige una imagen más pequeña.');
}
const cameraMessage=error=>['NotAllowedError','SecurityError'].includes(error?.name)?'Permite el acceso a la cámara en el navegador o utiliza Cargar foto.':error?.name==='NotFoundError'?'No encontramos una cámara. Puedes utilizar Cargar foto.':error?.name==='NotReadableError'?'La cámara está ocupada. Cierra la otra aplicación e intenta de nuevo.':'No se pudo abrir la cámara. Puedes utilizar Cargar foto.';

export default function ProductPhotoInput({value='',onChange,disabled=false,onBusyChange}){
 const id=useId(),fileInput=useRef(null),video=useRef(null),stream=useRef(null),generation=useRef(0);
 const [mode,setMode]=useState('idle'),[error,setError]=useState(''),[preview,setPreview]=useState('');
 const current=useRef({onChange,disabled});current.current={onChange,disabled};
 const working=mode!=='idle';
 useEffect(()=>{onBusyChange?.(working);return()=>onBusyChange?.(false)},[working,onBusyChange]);
 const stop=()=>{stopStream(stream.current);stream.current=null;if(video.current)video.current.srcObject=null};
 const cancel=()=>{++generation.current;stop();setPreview('');setMode('idle')};
 useEffect(()=>{
  const hidden=()=>{if(document.visibilityState==='hidden')cancel()};
  document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',cancel);
  return()=>{++generation.current;stop();document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',cancel)};
 },[]);
 useEffect(()=>{if(disabled)cancel()},[disabled]);
 const start=async()=>{
  const token=++generation.current;setError('');setPreview('');setMode('starting');
  if(!navigator.mediaDevices?.getUserMedia){setMode('idle');setError('La cámara necesita un navegador compatible y una conexión HTTPS. Puedes utilizar Cargar foto.');return}
  try{
   const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:960}},audio:false});
   if(token!==generation.current){stopStream(media);return}
   stream.current=media;video.current.srcObject=media;await video.current.play();
   if(token===generation.current)setMode('camera');
  }catch(failure){if(token===generation.current){stop();setMode('idle');setError(cameraMessage(failure))}}
 };
 const capture=()=>{
  try{const image=video.current;setPreview(photoFrom(image,image.videoWidth,image.videoHeight));stop();setMode('preview');setError('')}
  catch(failure){setError(failure.message)}
 };
 const upload=async file=>{
  if(!file||current.current.disabled)return;
  const token=++generation.current;setError('');
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20*1024*1024){setError('Elige una imagen PNG, JPG o WebP de hasta 20 MB.');return}
  setMode('processing');
  try{
   const source=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('No se pudo leer la imagen.'));reader.readAsDataURL(file)});
   if(token!==generation.current)return;
   const image=new Image();image.src=source;await image.decode();
   if(token===generation.current&&!current.current.disabled)current.current.onChange(photoFrom(image,image.naturalWidth,image.naturalHeight));
  }catch(failure){if(token===generation.current)setError(failure.message.startsWith('No se pudo reducir')?failure.message:'No se pudo leer la imagen. Elige otra foto.')}
  finally{if(token===generation.current)setMode('idle')}
 };
 return <section className="cw-product-photo-input" aria-labelledby={id}>
  <span id={id}>Foto del producto</span>
  <p className="cw-footnote">Elige una imagen PNG, JPG o WebP, o toma una foto. Se ajustará automáticamente a un máximo de 500 KB.</p>
  <input ref={fileInput} hidden type="file" accept="image/png,image/jpeg,image/webp" aria-label="Archivo de foto del producto" disabled={disabled||working} onChange={event=>{const file=event.target.files?.[0];event.target.value='';upload(file)}}/>
  <div className="cw-actions">
   <button type="button" className="cw-btn" disabled={disabled||working} onClick={()=>fileInput.current.click()}>Cargar foto</button>
   <button type="button" className="cw-btn" disabled={disabled||working} onClick={start}>Tomar foto</button>
  </div>
  {(mode==='starting'||mode==='camera')&&<div className="cw-product-camera">
   <video ref={video} muted playsInline autoPlay aria-label="Cámara para foto del producto"/>
   {mode==='starting'&&<p role="status">Abriendo la cámara…</p>}
   <div className="cw-actions"><button type="button" className="cw-btn cw-btn-primary" disabled={mode!=='camera'} onClick={capture}>Capturar foto</button><button type="button" className="cw-btn" onClick={cancel}>Cancelar cámara</button></div>
  </div>}
  {mode==='preview'&&<div className="cw-product-camera">
   <img src={preview} alt="Vista previa de la foto tomada"/>
   <div className="cw-actions"><button type="button" className="cw-btn cw-btn-primary" onClick={()=>{current.current.onChange(preview);cancel()}}>Usar foto</button><button type="button" className="cw-btn" onClick={start}>Repetir foto</button><button type="button" className="cw-btn" onClick={cancel}>Cancelar foto</button></div>
  </div>}
  {mode==='processing'&&<p role="status">Preparando foto…</p>}
  {error&&<p className="cw-error" role="alert">{error}</p>}
  {value&&<div className="cw-photo-preview"><img src={value} alt="Vista previa del producto"/><button type="button" className="cw-btn cw-btn-small" disabled={disabled||working} onClick={()=>onChange('')}>Retirar foto</button></div>}
 </section>;
}
