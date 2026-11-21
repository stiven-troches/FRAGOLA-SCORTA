import React,{useEffect,useId,useRef,useState} from 'react';
import './legal-documents.css';
import {formatCOP} from './format.mjs';

export const LEGAL_PREVIEW_VERSION='BORRADOR-2026-11-19';
const tabs=[['contract','Contrato'],['terms','Términos de uso'],['privacy','Privacidad']];
const currency=formatCOP;
export const LEGAL_DRAFT_LABEL='Borrador pendiente de revisión jurídica';
const dateLabel=value=>{if(!value)return 'Por definir';const parsed=new Date(String(value).length===10?value+'T12:00:00Z':value);return Number.isNaN(parsed.getTime())?'Por definir':parsed.toLocaleDateString('es-CO',{timeZone:'America/Bogota',day:'2-digit',month:'long',year:'numeric'})};
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function draftSections(company){return [
  {key:'contract',title:'Contrato del servicio',paragraphs:[
    'Este borrador presenta la estructura del acuerdo entre el proveedor de SCORTA y una empresa cliente. El documento definitivo deberá identificar a las partes y a la persona autorizada para contratar.',
    'El servicio permite utilizar las funciones contratadas de inventario, ventas y taller durante el período habilitado. La mensualidad y las fechas indicadas abajo deberán confirmarse en el contrato definitivo.',
    'La fecha de vencimiento incluye todo ese día en Colombia. Una renovación anticipada conserva los días pagados; una renovación después del vencimiento propone un mes desde la fecha del pago. Una suspensión manual requiere que el propietario la retire expresamente.',
    'Las condiciones de cancelación, soporte, disponibilidad, tratamiento de los datos al terminar el servicio y responsabilidades de las partes están pendientes de definición y revisión legal.'
  ]},
  {key:'terms',title:'Términos de uso',paragraphs:[
    'Cada persona utilizará una cuenta individual. Sus funciones dependerán del rol asignado por el propietario de SCORTA y de la empresa a la que pertenece.',
    'La empresa será responsable de revisar los datos que registre y de mantener sus credenciales protegidas. El acceso a otras empresas no forma parte de los permisos de sus empleados.',
    'El flujo definitivo explicará cómo se identifican los ajustes, anulaciones, devoluciones e intervenciones de soporte en el historial, así como las reglas de uso y los canales de atención.',
    'Este texto no establece todavía obligaciones contractuales finales. Las condiciones completas y su mecanismo de aceptación deben aprobarse antes de habilitar una aceptación real.'
  ]},
  {key:'privacy',title:'Política de privacidad',paragraphs:[
    'El documento definitivo identificará al responsable y, cuando corresponda, al encargado del tratamiento de la información, así como sus datos de contacto.',
    'Deberá explicar para qué se utilizan los datos de empresas, usuarios y clientes del almacén, qué información es necesaria y cómo se atienden consultas sobre ella.',
    'También se definirán los tiempos de conservación, las condiciones de eliminación o entrega al finalizar el servicio y el tratamiento de los datos cuando se usen proveedores externos.',
    'Las autorizaciones que correspondan y los canales para ejercer derechos están pendientes de revisión legal. Esta vista previa no solicita ni registra una autorización real de tratamiento de datos.'
  ]}
];}

/** UI preview only. No network request, legal signature, or persisted acceptance. */
// acceptance=false: lectura desde la pantalla real «Aceptar términos de servicio» (sin la constancia de ejemplo).
export default function LegalDocuments({company={},user={},onClose,preview=true,initialTab='contract',acceptance=true}){
  const [active,setActive]=useState(()=>tabs.some(([key])=>key===initialTab)?initialTab:'contract'),[reviewed,setReviewed]=useState(false),[authorized,setAuthorized]=useState(false),[example,setExample]=useState(null);
  const root=useRef(null),closeRef=useRef(onClose),uid=useId();
  closeRef.current=onClose;
  const sections=draftSections(company),section=sections.find(item=>item.key===active);
  const companyName=company?.name||company?.nombre||'Empresa de ejemplo';
  const representative=typeof user==='string'?user:user?.name||user?.username||'Persona autorizada de ejemplo';
  const canPreview=preview!==false;
  useEffect(()=>{
    const previous=document.activeElement,oldOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    root.current?.querySelector('[data-legal-initial-focus]')?.focus();
    const keydown=event=>{
      if(event.key==='Escape'){event.preventDefault();closeRef.current?.();return;}
      if(event.key!=='Tab')return;
      const items=[...root.current.querySelectorAll('button,input,a[href],[tabindex]')].filter(node=>!node.disabled&&node.tabIndex>=0&&node.offsetParent!==null);
      if(!items.length){event.preventDefault();return;}
      if(event.shiftKey&&document.activeElement===items[0]){event.preventDefault();items.at(-1).focus();}
      else if(!event.shiftKey&&document.activeElement===items.at(-1)){event.preventDefault();items[0].focus();}
    };
    document.addEventListener('keydown',keydown);
    return()=>{document.body.style.overflow=oldOverflow;document.removeEventListener('keydown',keydown);if(previous?.isConnected)previous.focus?.();};
  },[]);
  const activateTab=(event,index)=>{
    let next;
    if(event.key==='ArrowRight')next=(index+1)%tabs.length;
    else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;
    else if(event.key==='Home')next=0;
    else if(event.key==='End')next=tabs.length-1;
    else return;
    event.preventDefault();setActive(tabs[next][0]);document.getElementById(`${uid}-tab-${tabs[next][0]}`)?.focus();
  };
  const download=()=>{
    const plan=`<dl><dt>Empresa</dt><dd>${escapeHTML(companyName)}</dd><dt>Mensualidad de referencia</dt><dd>${company?.monthlyFee==null?'Por definir':escapeHTML(currency(company.monthlyFee))}</dd><dt>Inicio de referencia</dt><dd>${escapeHTML(dateLabel(company?.startDate))}</dd><dt>Vencimiento de referencia</dt><dd>${escapeHTML(dateLabel(company?.endDate))}</dd></dl>`;
    const content=`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SCORTA · Borradores de documentos</title><style>body{font:16px/1.6 system-ui,sans-serif;color:#111;max-width:760px;margin:32px auto;padding:0 20px}h1,h2{line-height:1.25}.notice{padding:16px;border:1px solid #aaa;background:#fff8d9}dt{font-weight:600}dd{margin:0 0 10px}footer{margin-top:32px;border-top:1px solid #ddd;padding-top:16px}</style></head><body><h1>SCORTA · Documentos en preparación</h1><p class="notice"><strong>${LEGAL_DRAFT_LABEL.toUpperCase()}</strong><br>Esta descarga es informativa: no es un contrato firmado, una constancia de aceptación ni una autorización de tratamiento de datos.</p><p>Versión de vista previa: ${LEGAL_PREVIEW_VERSION}</p>${plan}${sections.map(item=>`<section><h2>${escapeHTML(item.title)}</h2>${item.paragraphs.map(text=>`<p>${escapeHTML(text)}</p>`).join('')}</section>`).join('')}<footer>Documento de revisión de interfaz. La aceptación real y su registro se habilitarán después de aprobar los textos definitivos y el flujo correspondiente.</footer></body></html>`;
    const objectUrl=URL.createObjectURL(new Blob([content],{type:'text/html;charset=utf-8'}));
    const anchor=document.createElement('a');anchor.href=objectUrl;anchor.download='SCORTA-documentos-BORRADOR.html';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
  };
  return <div className="ld-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)closeRef.current?.()}}>
    <section ref={root} className="ld-dialog" role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`} aria-describedby={`${uid}-notice`}>
      <header className="ld-header"><div><p className="ld-eyebrow">SCORTA · Documentos del servicio</p><h2 id={`${uid}-title`}>Contrato, términos y privacidad</h2></div><button type="button" className="ld-close" aria-label="Cerrar documentos" data-legal-initial-focus onClick={()=>closeRef.current?.()}>×</button></header>
      <div className="ld-content">
        <p className="ld-draft-label" role="note">{LEGAL_DRAFT_LABEL}</p>
        <p id={`${uid}-notice`} className="ld-notice"><strong>Vista previa · documentos pendientes de revisión legal</strong><span>{acceptance?'Los textos son borradores. Aquí no se firma un contrato ni se guarda una aceptación real.':'La aceptación se registra en la pantalla anterior, con tu usuario, la fecha y la versión vigente.'}</span></p>
        {example?<section className="ld-example" aria-labelledby={`${uid}-example`}>
          <p className="ld-badge">Ejemplo de constancia · no tiene validez como aceptación</p>
          <h3 id={`${uid}-example`}>Así se mostraría la constancia</h3>
          <dl className="ld-summary"><div><dt>Empresa</dt><dd>{companyName}</dd></div><div><dt>Persona autorizada</dt><dd>{representative}</dd></div><div><dt>Fecha de la vista previa</dt><dd>{example}</dd></div><div><dt>Versión del borrador</dt><dd>{LEGAL_PREVIEW_VERSION}</dd></div></dl>
          <p className="ld-muted">En el flujo definitivo, la aceptación de documentos aprobados y su constancia se guardarán en el servidor. Esta demostración solo permanece mientras está abierta la ventana.</p>
          <div className="ld-actions"><button type="button" className="ld-button ld-secondary" onClick={()=>setExample(null)}>Volver a los documentos</button><button type="button" className="ld-button ld-primary" onClick={()=>closeRef.current?.()}>Cerrar vista previa</button></div>
        </section>:<>
          <div className="ld-tabs" role="tablist" aria-label="Documentos del servicio">{tabs.map(([key,title],index)=><button key={key} id={`${uid}-tab-${key}`} type="button" role="tab" aria-selected={active===key} aria-controls={`${uid}-panel-${key}`} tabIndex={active===key?0:-1} onKeyDown={event=>activateTab(event,index)} onClick={()=>setActive(key)}>{title}</button>)}</div>
          <section className="ld-document" id={`${uid}-panel-${active}`} role="tabpanel" aria-labelledby={`${uid}-tab-${active}`} tabIndex={0}>
            <div className="ld-document-heading"><h3>{section.title}</h3><span>{LEGAL_DRAFT_LABEL}</span></div>
            {active==='contract'&&<dl className="ld-plan"><div><dt>Empresa</dt><dd>{companyName}</dd></div><div><dt>Mensualidad de referencia</dt><dd>{company?.monthlyFee==null?'Por definir':currency(company.monthlyFee)}</dd></div><div><dt>Inicio</dt><dd>{dateLabel(company?.startDate)}</dd></div><div><dt>Vencimiento</dt><dd>{dateLabel(company?.endDate)}</dd></div></dl>}
            {section.paragraphs.map((text,index)=><p key={index}>{text}</p>)}
          </section>
          <p className="ld-version">Versión de vista previa: {LEGAL_PREVIEW_VERSION}</p>
          {!acceptance&&<div className="ld-actions"><button type="button" className="ld-button ld-secondary" onClick={download}>Descargar documentos</button><button type="button" className="ld-button ld-primary" onClick={()=>closeRef.current?.()}>Volver a la aceptación</button></div>}
          {acceptance&&<form className="ld-acceptance" onSubmit={event=>{event.preventDefault();if(!canPreview||!reviewed||!authorized)return;setExample(new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',dateStyle:'long',timeStyle:'short'}).format(new Date()));}}>
            <h3>Vista previa de la aceptación</h3>
            <label><input type="checkbox" checked={reviewed} onChange={event=>setReviewed(event.target.checked)}/><span>He revisado los borradores mostrados, únicamente para evaluar esta pantalla.</span></label>
            <label><input type="checkbox" checked={authorized} onChange={event=>setAuthorized(event.target.checked)}/><span>Represento a la empresa en este ejemplo. En la aceptación real deberá intervenir una persona autorizada.</span></label>
            <p className="ld-muted">Continuar muestra una constancia de ejemplo. No registra una firma ni una autorización.</p>
            <div className="ld-actions"><button type="button" className="ld-button ld-secondary" onClick={download}>Descargar borradores</button><button type="submit" className="ld-button ld-primary" disabled={!canPreview||!reviewed||!authorized}>Continuar (vista previa)</button></div>
          </form>}
        </>}
      </div>
    </section>
  </div>;
}
