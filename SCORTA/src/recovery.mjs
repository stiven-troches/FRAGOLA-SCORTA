// SEG-13: textos y utilidades compartidos por el servidor (platform.mjs) y la interfaz.
export const MAIL_DISABLED_MESSAGE='La recuperación por correo no está configurada; pide a tu administrador que restablezca tu contraseña.';
export const RECOVERY_REQUESTED_MESSAGE='Si los datos corresponden a una cuenta con correo verificado, enviaremos un enlace para crear una nueva contraseña. Revisa tu bandeja de entrada y la carpeta de correo no deseado.';
export const RESET_PATH='/recuperar';
/** Token del enlace /recuperar#<token> (43 caracteres base64url) o null. */
export const resetTokenFromHash=hash=>{const value=String(hash||'').replace(/^#/,'');return /^[A-Za-z0-9_-]{43}$/.test(value)?value:null;};
/** POST/GET JSON a las rutas públicas de recuperación; devuelve {ok,status,body}. */
export async function recoveryRequest(path,body,{fetchImpl=globalThis.fetch}={}){
  let response;
  try{response=await fetchImpl(path,{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});}
  catch{return {ok:false,status:0,body:{error:'No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.'}};}
  let value;try{value=await response.json();}catch{value={error:'El servidor no respondió correctamente. Inténtalo de nuevo.'};}
  return {ok:response.ok,status:response.status,body:value||{}};
}
