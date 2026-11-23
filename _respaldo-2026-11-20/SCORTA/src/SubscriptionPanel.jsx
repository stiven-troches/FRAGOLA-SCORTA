import React from 'react';
import './subscription-panel.css';

const statusNames={active:'Activa',disabled:'Suspendida',expired:'Vencida',scheduled:'Aún no inicia'};
const dateLabel=value=>{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return 'Sin configurar';
 const parsed=new Date(value+'T12:00:00Z');
 return Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==value?'Sin configurar':parsed.toLocaleDateString('es-CO',{timeZone:'America/Bogota',year:'numeric',month:'long',day:'numeric'});
};
const monthlyLabel=value=>{
 if(value==null||value===''||!Number.isFinite(Number(value))||Number(value)<0)return 'Sin configurar';
 return new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(value))+' COP';
};
const contactLines=value=>{
 if(typeof value==='string')return value.trim()?[value.trim()]:[];
 if(!value||typeof value!=='object'||Array.isArray(value))return [];
 return [value.name,value.email,value.whatsapp].filter(item=>typeof item==='string'&&item.trim()).map(item=>item.trim());
};

/** Company administrators may consult their contract; only the owner changes it. */
export default function SubscriptionPanel({session={},onContact,busy=false}){
 if(session.role!=='admin'||!session.company)return null;
 const company=session.company,status=statusNames[company.status]||'Sin información',contact=contactLines(session.ownerContact);
 const days=company.daysRemaining;
 const remaining=typeof days==='number'&&Number.isSafeInteger(days)&&days>=0
  ?company.status==='active'&&days===0?'Último día de vigencia':`${days} ${days===1?'día':'días'}`
  :'Sin información';
 return <details className="sub-panel"><summary><span>Mi suscripción</span><span className={`sub-status sub-status-${Object.hasOwn(statusNames,company.status)?company.status:'unknown'}`}>{status}</span></summary><div className="sub-content"><dl><div><dt>Empresa</dt><dd>{company.name||'Sin configurar'}</dd></div><div><dt>Inicio</dt><dd>{dateLabel(company.startDate)}</dd></div><div><dt>Vigente hasta</dt><dd>{dateLabel(company.endDate)}</dd></div><div><dt>Días restantes</dt><dd>{remaining}</dd></div><div><dt>Mensualidad</dt><dd>{monthlyLabel(company.monthlyFee)}</dd></div></dl><p className="sub-note">La vigencia y los pagos los gestiona el propietario del software.</p><div className="sub-contact"><h4>Contacto del propietario</h4>{contact.length?contact.map((line,index)=><p className="sub-contact-value" key={index}>{line}</p>):<p className="sub-note">El contacto del propietario aún no está configurado.</p>}{typeof onContact==='function'&&<button type="button" className="sub-support-button" disabled={busy} onClick={onContact}>Consultar por ticket de soporte</button>}</div></div></details>;
}
