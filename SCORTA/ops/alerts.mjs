// BE-11 + BE-33 + OPS-07: alertas operativas por correo al propietario de la plataforma.
// Usa el mismo mailer de ops/mailer.mjs (Resend o webhook); sin correo configurado o sin
// SCORTA_OWNER_EMAIL queda desactivado y las alertas siguen solo en el log.
//
// Reglas:
// - Como máximo un correo por tipo de alerta y empresa/cuenta real cada hora (throttleMs) y, en total,
//   ALERT_MAX_PER_WINDOW correos por hora: un ataque señuelo no silencia la alerta de otra cuenta ni
//   inunda el buzón (SEG-10).
// - El texto se arma solo con campos permitidos: nunca secretos, cookies, tokens, IP ni
//   datos de clientes finales de los almacenes.
const EMAIL=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
export const ALERT_THROTTLE_MS=60*60*1000,ALERT_MAX_PER_WINDOW=10;
// Dominios sueltos (www.x.co, x.com/ruta); no los nombres de archivo habituales en los errores.
const BARE_DOMAIN=/\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?!(?:mjs|cjs|js|json|sqlite|db|enc|tmp|log|txt|png|jpe?g|webp|gif|html?|css|md)\b)[a-z]{2,24}\b(?:\/\S*)?/gi;

// Quita de un texto libre lo que pueda parecer una credencial o una dirección.
export function scrub(value,max=200){
  return String(value??'')
    .replace(/https?:\/\/\S+/gi,'[url]')
    .replace(BARE_DOMAIN,'[url]')
    .replace(/\b(?:bearer|authorization|cookie|token|key|secret|password|signature|credential)\b\s*[:=]?\s*\S+/gi,'[oculto]')
    .replace(/[A-Za-z0-9+/_-]{32,}={0,2}/g,'[oculto]')
    .replace(/[^\S\n]+/g,' ').replace(/[\r\n]+/g,' ').trim().slice(0,max);
}

export function createAlerter({mailer,to,clock=Date.now,throttleMs=ALERT_THROTTLE_MS,maxPerWindow=ALERT_MAX_PER_WINDOW,log=()=>{},version=''}={}){
  const recipient=String(to||'').trim(),enabled=!!(mailer?.enabled&&EMAIL.test(recipient)&&recipient.length<=254);
  const last=new Map(),sent=[];
  /** Envía (sin lanzar nunca) una alerta. Devuelve 'sent' | 'throttled' | 'disabled' | 'failed'. */
  // key: empresa/cuenta real de la alerta (securityAlert); sin key, el tipo solo.
  async function notify(type,{subject,lines=[],key=''}={}){
    if(!enabled)return 'disabled';
    const now=Number(clock()),slot=key?type+'|'+key:type,previous=last.get(slot);
    for(const [k,at]of last)if(now-at>=throttleMs)last.delete(k);
    while(sent.length&&now-sent[0]>=throttleMs)sent.shift();
    if(previous!=null&&now-previous<throttleMs||sent.length>=maxPerWindow){log({level:'info',event:'alert-mail-throttled',type});return 'throttled';}
    last.set(slot,now);sent.push(now);
    const text=['Alerta de SCORTA: '+subject,'',...lines.map(line=>'- '+line),'','Tipo: '+type,'Hora (UTC): '+new Date(now).toISOString(),...(version?['Versión: '+version]:[]),'','Revisa el panel del propietario y los logs del servidor. No recibirás otra alerta igual durante una hora.'].join('\n');
    try{await mailer.send({to:recipient,subject:'[SCORTA] '+subject,text});log({level:'info',event:'alert-mail-sent',type});return 'sent';}
    catch(error){log({level:'error',event:'alert-mail-failed',type,error:scrub(error?.message||error)});return 'failed';}
  }
  return {enabled,notify};
}

// Ráfaga de errores 5xx: true una sola vez cuando se alcanzan `threshold` errores dentro de
// `windowMs`; se rearma cuando la ventana vuelve a quedar por debajo del umbral.
export function errorBurst({threshold=10,windowMs=5*60*1000,clock=Date.now}={}){
  const times=[];let firing=false;
  return {
    record(){
      const now=Number(clock());times.push(now);
      while(times.length&&times[0]<=now-windowMs)times.shift();
      if(times.length>=threshold){if(firing)return false;firing=true;return true;}
      firing=false;return false;
    },
    count(){const now=Number(clock());while(times.length&&times[0]<=now-windowMs)times.shift();return times.length;},
  };
}

const SECURITY_SUBJECTS={
  login_failures:'Muchos intentos fallidos de ingreso',
  owner_new_origin:'Ingreso del propietario desde un origen nuevo',
  support_start:'Se inició un modo soporte',
};
// Convierte un evento de seguridad de la plataforma en una alerta con campos permitidos.
export function securityAlert(event){
  const tipo=String(event?.tipo||'evento');
  const lines=[];
  // SEG-10: si la empresa o la cuenta no existen, el texto lo escribió quien intentó ingresar: no se copia.
  const empresa=event?.empresaInexistente?'(empresa inexistente)':event?.empresa?scrub(event.empresa,100):'';
  const usuario=event?.usuarioInexistente?'(usuario inexistente)':event?.usuario?scrub(event.usuario,60):'';
  if(empresa)lines.push('Empresa: '+empresa);
  if(usuario)lines.push('Usuario: '+usuario);
  if(Number.isFinite(event?.intentos))lines.push('Intentos: '+event.intentos);
  if(event?.motivo)lines.push('Motivo: '+scrub(event.motivo,200));
  if(event?.fecha)lines.push('Fecha del evento: '+scrub(event.fecha,40));
  // Llave de agrupación: empresa real (o «inexistente», todas juntas) + cuenta; nunca sale en el correo.
  const key=(event?.empresaInexistente?'(empresa inexistente)':String(event?.companyId||'@plataforma'))+'|'+(event?.usuarioInexistente?'(usuario inexistente)':String(event?.usuario||'').trim().toLowerCase().slice(0,60));
  return {type:'security:'+tipo,key,subject:SECURITY_SUBJECTS[tipo]||'Evento de seguridad: '+scrub(tipo,40),lines};
}
