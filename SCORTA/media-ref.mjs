// BE-30: referencias a fotos de productos y logos guardados fuera del estado JSON.
// Módulo puro (sin node:*): lo usan el servidor, el motor de plataforma y la demo del navegador.
//
// En el estado, `company.logo` y `prod.foto` son '' / ausentes, un data URL heredado (antes de la
// migración o en la demo local) o una referencia {mediaId,companyId,type,bytes}. El cliente nunca
// recibe la referencia: ve la URL /media/<companyId>/<mediaId> (clientImage).
export const MEDIA_TYPES=Object.freeze({'image/webp':'webp','image/png':'png','image/jpeg':'jpg'});
const EXT_TYPES=Object.freeze(Object.fromEntries(Object.entries(MEDIA_TYPES).map(([type,ext])=>[ext,type])));
/** Mismo tope por imagen que antes (500 KB). */
export const MEDIA_MAX_BYTES=512000;
export const MEDIA_PATH=/^\/media\/([A-Za-z0-9_-]{1,100})\/([a-f0-9]{64}\.(?:webp|png|jpg))$/;
export const validMediaId=value=>typeof value==='string'&&/^[a-f0-9]{64}\.(?:webp|png|jpg)$/.test(value);
export const validCompanyId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
export const mediaTypeOf=mediaId=>EXT_TYPES[String(mediaId).split('.').pop()]||'';
export const isMediaRef=value=>!!value&&typeof value==='object'&&!Array.isArray(value)&&validMediaId(value.mediaId)&&validCompanyId(value.companyId)&&mediaTypeOf(value.mediaId)===value.type&&Number.isSafeInteger(value.bytes)&&value.bytes>0&&value.bytes<=MEDIA_MAX_BYTES;
export const mediaUrl=ref=>'/media/'+ref.companyId+'/'+ref.mediaId;
/** Valor que ve el navegador: la URL servida por la aplicación o el valor heredado tal cual. */
export const clientImage=value=>isMediaRef(value)?mediaUrl(value):value;
/** Peso equivalente en caracteres base64 (el tope de 40 MB por empresa se mantiene igual). */
export const imageWeight=value=>isMediaRef(value)?Math.ceil(value.bytes/3)*4+23:typeof value==='string'?value.length:0;
/** Tipo real por la firma de los bytes (PNG, JPEG, WebP); '' si no es ninguno. */
export function sniffImage(bytes){
  const at=(i,n)=>bytes[i]===n,ascii=(from,to)=>String.fromCharCode(...bytes.slice(from,to));
  if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>at(i,n)))return 'image/png';
  if(bytes.length>=3&&at(0,255)&&at(1,216)&&at(2,255))return 'image/jpeg';
  if(bytes.length>=12&&ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP')return 'image/webp';
  return '';
}
