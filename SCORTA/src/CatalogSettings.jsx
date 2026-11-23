import React,{useState} from 'react';
import {catalogDefaults,whatsappNumber} from '../catalog.mjs';
import {contrastText,catalogUrl} from './catalog-ui.mjs';
import './catalog.css';

export default function CatalogSettings({company,onSave,busy=false,revision,onDirty}){
 const [editedRevision]=useState(revision);
 const [form,setForm]=useState({...catalogDefaults,...company.catalog,whatsapp:company.whatsapp||''}),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const field=(key,value)=>{setForm(f=>({...f,[key]:value}));onDirty?.()};
 const suggest=async()=>{
  setError('');try{
   const image=new Image();image.src=company.logo;await image.decode();
   const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,32,32);
   const pixels=ctx.getImageData(0,0,32,32).data,buckets=new Map();
   for(let i=0;i<pixels.length;i+=4){const rgb=[...pixels.slice(i,i+3)];if(pixels[i+3]<200||Math.max(...rgb)-Math.min(...rgb)<35)continue;const key=rgb.map(v=>Math.min(255,Math.round(v/32)*32).toString(16).padStart(2,'0')).join('');buckets.set(key,(buckets.get(key)||0)+1)}
   const color=[...buckets].sort((a,b)=>b[1]-a[1])[0]?.[0];if(!color)throw Error('El logo no tiene un color predominante. Elige los colores manualmente.');
   field('primary','#'+color);const soft=color.match(/../g).map(v=>Math.round(parseInt(v,16)*.1+255*.9).toString(16).padStart(2,'0')).join('');field('secondary','#'+soft);
  }catch(failure){setError(failure.message||'No pudimos leer los colores del logo.')}
 };
 const save=async event=>{event.preventDefault();setError('');setNotice('');if(form.enabled&&!whatsappNumber(form.whatsapp)){setError('Escribe un WhatsApp válido con indicativo del país.');return}try{await onSave({type:'catalog.update',companyId:company.id,revision:editedRevision,form});setNotice('Catálogo actualizado.')}catch(failure){setError(failure.message||'No se pudo guardar el catálogo.')}};
 const url=typeof location==='undefined'?catalogUrl(company):new URL(catalogUrl(company),location.origin).href;
 return <form className="catalog-settings" onSubmit={save}><p>Tu tienda se alimenta del inventario. Solo se publican productos con existencias, sin mostrar las cantidades disponibles.</p>
  <label><input type="checkbox" checked={form.enabled} disabled={busy} onChange={e=>field('enabled',e.target.checked)}/> Publicar catálogo</label>
  <label>WhatsApp del negocio<input type="tel" value={form.whatsapp} maxLength={30} disabled={busy} placeholder="+57 300 123 4567" onChange={e=>field('whatsapp',e.target.value)}/></label>
  <label>Título de la tienda<input value={form.headline} maxLength={100} disabled={busy} onChange={e=>field('headline',e.target.value)}/></label>
  <label>Presentación<textarea value={form.description} maxLength={300} disabled={busy} onChange={e=>field('description',e.target.value)}/></label>
  <div className="catalog-settings-colors"><label>Color principal<input type="color" value={form.primary} disabled={busy} onChange={e=>field('primary',e.target.value)}/></label><label>Color secundario<input type="color" value={form.secondary} disabled={busy} onChange={e=>field('secondary',e.target.value)}/></label></div>
  {company.logo&&<button className="cw-btn ow-button ow-secondary" type="button" disabled={busy} onClick={suggest}>Sugerir colores del logo</button>}
  <section className="catalog-brand-preview" style={{background:form.secondary,color:contrastText(form.secondary)}} aria-label="Vista previa de colores">{company.logo&&<img src={company.logo} alt="Logo del negocio"/>}<strong>{company.name}</strong><h3>{form.headline}</h3><p>{form.description}</p><span style={{background:form.primary,color:contrastText(form.primary)}}>Agregar al carrito</span></section>
  <label>Enlace público<input readOnly value={url}/></label><div className="catalog-settings-actions"><button type="button" className="cw-btn ow-button ow-secondary" onClick={async()=>{try{await navigator.clipboard.writeText(url);setNotice('Enlace copiado.')}catch{setNotice('Selecciona el enlace y cópialo.')}}}>Copiar enlace</button><a className="cw-btn ow-button ow-secondary" href={catalogUrl(company)} target="_blank" rel="noreferrer">Ver catálogo</a></div>
  <p>El logo y nombre se toman de la ficha de la empresa. Las compras se acuerdan por WhatsApp; el carrito no descuenta inventario ni registra ventas.</p>
  {error&&<p role="alert" className="cw-error ow-error">{error}</p>}{notice&&<p role="status">{notice}</p>}<button className="cw-btn cw-btn-primary ow-button ow-primary" type="submit" disabled={busy}>{busy?'Guardando…':'Guardar catálogo'}</button>
 </form>;
}
