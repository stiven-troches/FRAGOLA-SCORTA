// Página de presentación (landing.html). Constantes configurables por el dueño.
// TODO dueño: número comercial de WhatsApp (solo dígitos con indicativo, p. ej. 573001234567).
// Mientras esté vacío, los botones de WhatsApp permanecen ocultos.
export const LANDING_WHATSAPP='';
export const LANDING_WHATSAPP_MESSAGE='Hola, quiero conocer SCORTA para mi almacén de repuestos de moto.';
// Dirección pública de la demo. Por defecto /demo/ (el servidor debe publicarla ahí).
export const LANDING_DEMO_URL='/demo/';

export function landingWhatsappLink(number=LANDING_WHATSAPP,message=LANDING_WHATSAPP_MESSAGE){
 const digits=String(number||'').replace(/\D/g,'');
 return digits.length>=11&&digits.length<=15?'https://wa.me/'+digits+'?text='+encodeURIComponent(message):'';
}

if(typeof document!=='undefined'){
 const link=landingWhatsappLink();
 for(const anchor of document.querySelectorAll('[data-whatsapp-link]')){
  if(!link){anchor.remove();continue}
  anchor.href=link;anchor.target='_blank';anchor.rel='noopener noreferrer';anchor.hidden=false;
 }
 for(const anchor of document.querySelectorAll('[data-demo-link]')){
  if(LANDING_DEMO_URL)anchor.href=LANDING_DEMO_URL;else anchor.remove();
 }
}
