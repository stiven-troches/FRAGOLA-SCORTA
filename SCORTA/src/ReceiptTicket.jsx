import React,{useState} from 'react';
import {receiptDocument,receiptMarkup,receiptMoney,receiptTotals,safeReceiptUrl} from './receipt-ticket.mjs';
import './receipt-ticket.css';

const fileName=sale=>'ticket-'+String(sale.id||'venta').replace(/[^a-z0-9-]/gi,'').slice(0,80)+'.html';
function saveFile(html,sale){const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=fileName(sale);document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
export default function ReceiptTicket({sale={},company={},onError,onRenew,busy=false,publicView=false}){
 const[width,setWidth]=useState(80),[phone,setPhone]=useState(sale.telefono||sale.phone||''),[error,setError]=useState('');
 const report=message=>{setError(message);onError?.(message)};
 const html=()=>receiptDocument({sale,company,width});
 const download=()=>{setError('');saveFile(html(),sale)};
 const print=async()=>{
  setError('');const win=window.open('','_blank');
  if(!win){report('Permite abrir la ventana de impresión o descarga el ticket para imprimirlo desde el archivo.');return}
  win.opener=null;win.document.write(html());win.document.close();
  // Wait for the original logo before the browser captures the printable document.
  const images=[...win.document.images];
  await Promise.race([Promise.all(images.map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true})}))),new Promise(resolve=>setTimeout(resolve,2000))]);
  try{win.focus();win.print()}catch{report('Abre el ticket descargado y elige Imprimir o Guardar como PDF.')}
 };
 const expired=!!sale.receiptExpiresAt&&new Date(sale.receiptExpiresAt).getTime()<=Date.now();
 const base=globalThis.location?.origin||'https://scorta.example';
 const href=safeReceiptUrl(sale.receiptUrl||sale.receipt_url||sale.comprobante_url||(sale.receiptToken?'/receipt/'+encodeURIComponent(sale.receiptToken):''),base);
 const whatsapp=()=>{
  setError('');let number=phone.replace(/\D/g,'');if(/^3\d{9}$/.test(number)){number='57'+number;setPhone(number)}
  if(number.length<11||number.length>15){report('Escribe el WhatsApp con indicativo del país, por ejemplo 573001234567.');return}
  if(expired){report('El enlace del ticket venció. Renueva el enlace antes de enviarlo.');return}
  if(!href){report('El ticket no tiene un enlace válido. Descárgalo para adjuntarlo manualmente.');return}
  const text=`Hola ${sale.cliente||''}, este es tu ticket de ${company.name||company.nombre||'la empresa'} por ${receiptMoney(receiptTotals(sale).net)}: ${href}`;
  window.open('https://wa.me/'+number+'?text='+encodeURIComponent(text),'_blank','noopener,noreferrer');
 };
 return <section className="rt-view" aria-label="Ticket de venta"><div className="rt-options"><label>Formato<select value={width} onChange={e=>setWidth(Number(e.target.value))}><option value={80}>Ticket · 80 mm</option><option value={58}>Ticket · 58 mm</option></select></label><div className="rt-actions"><button type="button" className="rt-button rt-button-primary" onClick={print}>Imprimir / PDF</button><button type="button" className="rt-button" onClick={download}>Descargar ticket</button></div></div>{error&&<p className="rt-inline-error" role="alert">{error}</p>}<div className="rt-preview" dangerouslySetInnerHTML={{__html:receiptMarkup({sale,company,width})}}/><p className="rt-note">En impresión elige tu impresora o «Guardar como PDF». El archivo descargado conserva el mismo formato.</p>{!publicView&&<section className="rt-share"><h3>Enviar por WhatsApp <small>Opcional</small></h3><label>WhatsApp del cliente<input type="tel" autoComplete="tel" value={phone} placeholder="573001234567" maxLength={30} onChange={e=>setPhone(e.target.value)}/></label><div className="rt-actions">{(expired||!href)&&onRenew&&<button type="button" className="rt-button" disabled={busy} onClick={onRenew}>{busy?'Renovando…':'Renovar enlace del ticket'}</button>}<button type="button" className="rt-button rt-button-primary" disabled={busy||expired||!href} onClick={whatsapp}>Abrir WhatsApp</button></div><p>Se abrirá el enlace del ticket para que confirmes el envío. También puedes adjuntar el PDF guardado.</p></section>}</section>;
}
