// FE-19: lógica del lector de códigos con la cámara (sin librerías externas).
// Usa la API nativa BarcodeDetector (Chrome/Android) y getUserMedia con la cámara trasera.
export const UNSUPPORTED_SCANNER_MESSAGE='Tu navegador no permite leer códigos con la cámara.';
export const PREFERRED_FORMATS=['ean_13','ean_8','upc_a','upc_e','code_128','code_39','code_93','codabar','itf','qr_code','data_matrix'];
const clean=value=>String(value??'').normalize('NFD').replace(/[̀-ͯ]/g,'').trim().toLowerCase();

/** 'camera' = lector disponible; 'unsupported' = hay cámara pero no BarcodeDetector (Safari/iOS); 'none' = sin cámara. */
export function scannerSupport(win=globalThis.window){
  if(!win)return 'none';
  const camera=typeof win.navigator?.mediaDevices?.getUserMedia==='function';
  if(!camera)return 'none';
  return typeof win.BarcodeDetector==='function'?'camera':'unsupported';
}

/** Coincidencia exacta del código leído con codigo_barras (primero) o referencia. */
export function matchScannedCode(prods,raw){
  const code=clean(raw);if(!code)return {status:'none',code:''};
  const list=Array.isArray(prods)?prods:[];
  const byBarcode=list.filter(p=>clean(p.codigo_barras)===code),byReference=byBarcode.length?[]:list.filter(p=>clean(p.referencia)===code);
  const found=byBarcode.length?byBarcode:byReference;
  if(!found.length)return {status:'none',code:String(raw).trim()};
  const product=found.find(p=>Number(p.stock)>0)||found[0];
  return {status:Number(product.stock)>0?'found':'out',product,code:String(raw).trim()};
}

/** Evita sumar el mismo código varias veces mientras sigue frente a la cámara. */
export function createRepeatGuard(windowMs=1500){
  let last='',at=-Infinity;
  return (code,now=Date.now())=>{if(code===last&&now-at<windowMs){at=now;return false}last=code;at=now;return true};
}

/** Formatos que el detector soporta, priorizando los usados en repuestos. */
export async function detectorFormats(Detector){
  try{const supported=await Detector.getSupportedFormats?.();if(Array.isArray(supported)&&supported.length){const preferred=PREFERRED_FORMATS.filter(f=>supported.includes(f));return preferred.length?preferred:supported;}}catch{}
  return undefined;
}

/** Detiene todas las pistas de un MediaStream (apaga la luz de la cámara). */
export function stopStream(stream){for(const track of stream?.getTracks?.()||[])try{track.stop()}catch{}}

/** Pitido corto opcional con Web Audio (sin archivos de audio). */
export function beep(win=globalThis.window){
  try{
    const Context=win?.AudioContext||win?.webkitAudioContext;if(!Context)return false;
    const context=new Context(),oscillator=context.createOscillator(),gain=context.createGain();
    oscillator.type='sine';oscillator.frequency.value=1046;gain.gain.value=0.08;
    oscillator.connect(gain);gain.connect(context.destination);oscillator.start();oscillator.stop(context.currentTime+0.09);
    oscillator.onended=()=>{try{context.close()}catch{}};return true;
  }catch{return false}
}
