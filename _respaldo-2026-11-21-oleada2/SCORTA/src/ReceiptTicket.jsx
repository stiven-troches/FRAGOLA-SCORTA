import React,{useState} from 'react';
import {receiptDocument,receiptMarkup,receiptMoney,receiptTotals,safeReceiptUrl} from './receipt-ticket.mjs';
import './receipt-ticket.css';

const fileName=sale=>'ticket-'+String(sale.id||'venta').replace(/[^a-z0-9-]/gi,'').slice(0,80)+'.html';
function saveFile(html,sale){const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=fileName(sale);document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
// Opens the destination in a tab created inside the click, so popup blockers allow it even
// when the link arrives after a request.
function openPrepared(win,url){if(win){win.opener=null;win.location.href=url}else window.open(url,'_blank','noopener,noreferrer')}
/** onRenew() pide un enlace nuevo (acción sale.receipt) y devuelve {url,expiresAt} o la URL. */
export default function ReceiptTicket({sale={},company={},onError,onRenew,busy=false,publicView=false}){
 const[width,setWidth]=useState(80),[phone,setPhone]=useState(sale.telefono||sale.phone||''),[error,setError]=useState(''),[copied,setCopied]=useState(false);
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
 // The server keeps only a hash: a saved sale has no URL, so a new one is requested.
 const usable=expired?'':href,canLink=!!usable||!!onRenew;
 const ensureLink=async()=>{if(usable)return usable;if(!onRenew)return '';const result=await onRenew();return safeReceiptUrl(typeof result==='string'?result:result?.url||'',base)};
 const withLink=async(win,onReady,failure)=>{let link='';try{link=await ensureLink()}catch{link=''}if(!link){win?.close?.();report(failure);return}onReady(link)};
 const whatsapp=()=>{
  setError('');let number=phone.replace(/\D/g,'');if(/^3\d{9}$/.test(number)){number='57'+number;setPhone(number)}
  if(number.length<11||number.length>15){report('Escribe el WhatsApp con indicativo del país, por ejemplo 573001234567.');return}
  if(!canLink){report('El ticket no tiene un enlace válido. Descárgalo para adjuntarlo manualmente.');return}
  const win=usable?null:window.open('about:blank','_blank');
  return withLink(win,link=>{const text=`Hola ${sale.cliente||''}, este es tu ticket de ${company.name||company.nombre||'la empresa'} por ${receiptMoney(receiptTotals(sale).net)}: ${link}`;openPrepared(win,'https://wa.me/'+number+'?text='+encodeURIComponent(text))},'No se pudo obtener el enlace del ticket. Vuelve a intentar o descárgalo para adjuntarlo.');
 };
 const openOnline=()=>{setError('');const win=usable?null:window.open('about:blank','_blank');return withLink(win,link=>openPrepared(win,link),'No se pudo obtener el enlace del comprobante. Vuelve a intentar.')};
 const copyLink=()=>{setError('');return withLink(null,async link=>{try{await navigator.clipboard.writeText(link);setCopied(true);setTimeout(()=>setCopied(false),3000)}catch{report('No se pudo copiar el enlace. Ábrelo en línea y cópialo desde el navegador.')}},'No se pudo obtener el enlace del comprobante. Vuelve a intentar.')};
 const renew=()=>{setError('');return Promise.resolve(onRenew()).catch(failure=>report(failure?.message||'No se pudo renovar el enlace.'))};
 const expiresLabel=sale.receiptExpiresAt&&!expired?new Date(sale.receiptExpiresAt).toLocaleDateString('es-CO',{timeZone:'America/Bogota'}):'';
 return <section className="rt-view" aria-label="Ticket de venta"><div className="rt-options"><label>Formato<select value={width} onChange={e=>setWidth(Number(e.target.value))}><option value={80}>Ticket · 80 mm</option><option value={58}>Ticket · 58 mm</option></select></label><div className="rt-actions"><button type="button" className="rt-button rt-button-primary" onClick={print}>Imprimir / PDF</button><button type="button" className="rt-button" onClick={download}>Descargar ticket</button></div></div>{error&&<p className="rt-inline-error" role="alert">{error}</p>}<div className="rt-preview" dangerouslySetInnerHTML={{__html:receiptMarkup({sale,company,width})}}/><p className="rt-note">En impresión elige tu impresora o «Guardar como PDF». El archivo descargado conserva el mismo formato.</p>{!publicView&&<><section className="rt-share"><h3>Comprobante en línea</h3><div className="rt-actions"><button type="button" className="rt-button" disabled={busy||!canLink} onClick={openOnline}>Abrir comprobante en línea</button><button type="button" className="rt-button" disabled={busy||!canLink} onClick={copyLink}>{copied?'Enlace copiado':'Copiar enlace'}</button>{!usable&&onRenew&&<button type="button" className="rt-button" disabled={busy} onClick={renew}>{busy?'Renovando…':'Renovar enlace del ticket'}</button>}</div><p>{usable?(expiresLabel?`El enlace está vigente hasta el ${expiresLabel}.`:'El enlace está vigente.'):canLink?'Se generará un enlace nuevo de 7 días; el anterior dejará de funcionar.':'Sin enlace disponible. Descarga el ticket para compartirlo.'}</p></section><section className="rt-share"><h3>Enviar por WhatsApp <small>Opcional</small></h3><label>WhatsApp del cliente<input type="tel" autoComplete="tel" value={phone} placeholder="573001234567" maxLength={30} onChange={e=>setPhone(e.target.value)}/></label><div className="rt-actions"><button type="button" className="rt-button rt-button-primary" disabled={busy||!canLink} onClick={whatsapp}>Abrir WhatsApp</button></div><p>Se abrirá el enlace del ticket para que confirmes el envío. También puedes adjuntar el PDF guardado.</p></section></>}</section>;
}
