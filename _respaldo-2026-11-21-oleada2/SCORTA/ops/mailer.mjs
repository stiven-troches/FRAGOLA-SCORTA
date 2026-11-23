// SEG-13: envío de correos transaccionales (recuperación de contraseña y verificación).
// Sin dependencias: usa fetch contra la API HTTP de Resend o, como alternativa genérica,
// un webhook HTTP propio. Sin configuración queda desactivado y no envía nada.
//
//   Resend:  RESEND_API_KEY + SCORTA_MAIL_FROM ("SCORTA <no-responder@tudominio.com>")
//   Webhook: SCORTA_MAIL_WEBHOOK_URL (+ SCORTA_MAIL_WEBHOOK_SECRET opcional, va como Bearer)
//
// RESEND_API_URL solo existe para pruebas con un servidor falso local.
const RESEND_URL='https://api.resend.com/emails';
const TIMEOUT_MS=10000;
const EMAIL=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const local=url=>['localhost','127.0.0.1','[::1]'].includes(url.hostname);
function safeUrl(value){
  if(!value)return null;
  let url;try{url=new URL(value);}catch{throw Error('URL de correo inválida: '+value);}
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&local(url)))throw Error('La URL de correo debe usar https (http solo en localhost)');
  return url.href;
}
export const maskEmail=value=>String(value||'').replace(/^(.)[^@]*(@.*)$/,'$1***$2');

/** Lee la configuración. Devuelve {provider:null} cuando el correo no está configurado. */
export function mailConfig(env=process.env){
  const from=String(env.SCORTA_MAIL_FROM||'').trim();
  if(env.RESEND_API_KEY){
    if(!from)throw Error('Configura SCORTA_MAIL_FROM para enviar correos con Resend');
    return {provider:'resend',url:safeUrl(env.RESEND_API_URL)||RESEND_URL,key:String(env.RESEND_API_KEY),from};
  }
  if(env.SCORTA_MAIL_WEBHOOK_URL)return {provider:'webhook',url:safeUrl(env.SCORTA_MAIL_WEBHOOK_URL),key:String(env.SCORTA_MAIL_WEBHOOK_SECRET||''),from};
  return {provider:null};
}

export function createMailer({env=process.env,fetchImpl=globalThis.fetch,log=()=>{}}={}){
  const config=mailConfig(env);
  if(!config.provider)return {enabled:false,provider:null,async send(){return false;},async sendAll(){return [];}};
  async function send(message){
    const to=String(message?.to||'').trim(),subject=String(message?.subject||'').slice(0,200),text=String(message?.text||'');
    if(!EMAIL.test(to)||to.length>254)throw Error('Destinatario inválido');
    const body=config.provider==='resend'?{from:config.from,to:[to],subject,text}:{...(config.from?{from:config.from}:{}),to,subject,text};
    const headers={'Content-Type':'application/json','User-Agent':'SCORTA-mailer'};
    if(config.key)headers.Authorization='Bearer '+config.key;
    const response=await fetchImpl(config.url,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(TIMEOUT_MS),redirect:'error'});
    if(!response.ok){let detail='';try{detail=(await response.text()).slice(0,200);}catch{}throw Error(`El proveedor de correo respondió ${response.status}${detail?': '+detail:''}`);}
    return true;
  }
  // Nunca lanza: registra cada resultado (con el destinatario enmascarado) y sigue.
  async function sendAll(outbox=[]){
    const results=[];
    for(const message of outbox){
      try{await send(message);results.push(true);log({level:'info',event:'mail-sent',provider:config.provider,to:maskEmail(message.to),subject:message.subject});}
      catch(error){results.push(false);log({level:'error',event:'mail-failed',provider:config.provider,to:maskEmail(message?.to),error:String(error?.message||error)});}
    }
    return results;
  }
  return {enabled:true,provider:config.provider,send,sendAll};
}
