// BE-11 + BE-33 + OPS-07: alertas operativas por correo al propietario de la plataforma.
// Usa el mismo mailer de ops/mailer.mjs (Resend o webhook); sin correo configurado o sin
// SCORTA_OWNER_EMAIL queda desactivado y las alertas siguen solo en el log.
//
// Reglas:
// - Como máximo un correo por tipo de alerta cada hora (throttleMs).
// - El texto se arma solo con campos permitidos: nunca secretos, cookies, tokens, IP ni
//   datos de clientes finales de los almacenes.
const EMAIL=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
export const ALERT_THROTTLE_MS=60*60*1000;

// Quita de un texto libre lo que pueda parecer una credencial o una dirección.
export function scrub(value,max=200){
  return String(value??'')
    .replace(/https?:\/\/\S+/gi,'[url]')
    .replace(/\b(?:bearer|authorization|cookie|token|key|secret|password|signature|credential)\b\s*[:=]?\s*\S+/gi,'[oculto]')
    .replace(/[A-Za-z0-9+/_-]{32,}={0,2}/g,'[oculto]')
    .replace(/[^\S\n]+/g,' ').replace(/[\r\n]+/g,' ').trim().slice(0,max);
}

export function createAlerter({mailer,to,clock=Date.now,throttleMs=ALERT_THROTTLE_MS,log=()=>{},version=''}={}){
  const recipient=String(to||'').trim(),enabled=!!(mailer?.enabled&&EMAIL.test(recipient)&&recipient.length<=254);
  const last=new Map();
  /** Envía (sin lanzar nunca) una alerta. Devuelve 'sent' | 'throttled' | 'disabled' | 'failed'. */
  async function notify(type,{subject,lines=[]}={}){
    if(!enabled)return 'disabled';
    const now=Number(clock()),previous=last.get(type);
    if(previous!=null&&now-previous<throttleMs){log({level:'info',event:'alert-mail-throttled',type});return 'throttled';}
    last.set(type,now);
    const text=['Alerta de SCORTA: '+subject,'',...lines.map(line=>'- '+line),'','Tipo: '+type,'Hora (UTC): '+new Date(now).toISOString(),...(version?['Versión: '+version]:[]),'','Revisa el panel del propietario y los logs del servidor. No recibirás otra alerta de este tipo durante una hora.'].join('\n');
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
  if(event?.empresa)lines.push('Empresa: '+scrub(event.empresa,100));
  if(event?.usuario)lines.push('Usuario: '+scrub(event.usuario,60));
  if(Number.isFinite(event?.intentos))lines.push('Intentos: '+event.intentos);
  if(event?.motivo)lines.push('Motivo: '+scrub(event.motivo,200));
  if(event?.fecha)lines.push('Fecha del evento: '+scrub(event.fecha,40));
  return {type:'security:'+tipo,subject:SECURITY_SUBJECTS[tipo]||'Evento de seguridad: '+scrub(tipo,40),lines};
}
