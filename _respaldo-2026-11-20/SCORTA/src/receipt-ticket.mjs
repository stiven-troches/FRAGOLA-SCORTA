const asNumber=value=>Number.isFinite(Number(value))?Number(value):0;
export const receiptMoney=value=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(asNumber(value));
export const receiptEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function safeReceiptImage(value){
  if(typeof value!=='string'||!value||value.length>750000)return '';
  if(/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(value))return value;
  if(value.startsWith('/')&&!value.startsWith('//')&&!value.includes('\\'))return value;
  try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:''}catch{return ''}
}
export function safeReceiptUrl(value,base='https://scorta.example'){
  if(typeof value!=='string'||!value||value.includes('\\'))return '';
  try{const url=new URL(value,base);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:''}catch{return ''}
}
export function receiptLabor(sale){const lines=sale?.labor||sale?.mano_obra||sale?.servicios||[];return Array.isArray(lines)?lines:[]}
export function receiptTotals(sale={}){
  const products=(Array.isArray(sale.detalles)?sale.detalles:[]).reduce((n,line)=>n+asNumber(line.cantidad)*asNumber(line.precio_unitario),0);
  const labor=receiptLabor(sale).reduce((n,line)=>n+asNumber(line.importe??line.valor??line.precio),0)||asNumber(sale.costo_mano_obra||sale.laborTotal);
  const original=Number.isFinite(Number(sale.total))?Number(sale.total):products+labor;
  const returned=(Array.isArray(sale.detalles)?sale.detalles:[]).reduce((n,line)=>n+asNumber(line.devuelto)*asNumber(line.precio_unitario),0)+asNumber(sale.laborRefund||sale.devolucion_mano_obra);
  return {products,labor,original,returned,net:sale.anulada?0:Math.max(0,original-returned)};
}
export function receiptDate(value){
  if(!value)return '—';
  const parsed=new Date(String(value).length===10?value+'T12:00:00Z':value);
  return Number.isNaN(parsed.getTime())?String(value):parsed.toLocaleString('es-CO',{timeZone:'America/Bogota',...(String(value).length===10?{dateStyle:'short'}:{dateStyle:'short',timeStyle:'short'})});
}
const pair=(label,value)=>value?`<div><dt>${receiptEscape(label)}</dt><dd>${receiptEscape(value)}</dd></div>`:'';
export function receiptMarkup({sale={},company={},width=80}={}){
  const escape=receiptEscape,totals=receiptTotals(sale),logo=safeReceiptImage(company.logo),name=company.name||company.nombre||'Empresa';
  const products=Array.isArray(sale.detalles)?sale.detalles:[];
  const labor=receiptLabor(sale);
  const rows=products.map(line=>`<li class="rt-line"><div class="rt-line-title"><strong>${escape(line.nombre||'Producto')}</strong><strong>${escape(receiptMoney(asNumber(line.cantidad)*asNumber(line.precio_unitario)))}</strong></div><div class="rt-line-detail">${escape(line.cantidad)} × ${escape(receiptMoney(line.precio_unitario))}</div>${asNumber(line.devuelto)>0?`<div class="rt-returned">Devuelto: ${escape(line.devuelto)} ${asNumber(line.devuelto)===1?'unidad':'unidades'}</div>`:''}</li>`).join('');
  const services=labor.map(line=>`<li class="rt-line"><div class="rt-line-title"><strong>${escape(line.descripcion||line.trabajo||'Mano de obra')}</strong><strong>${escape(receiptMoney(line.importe??line.valor??line.precio))}</strong></div><div class="rt-line-detail">Mano de obra${line.mecanico?` · ${escape(line.mecanico)}`:''}</div></li>`).join('');
  const payment={efectivo:'Efectivo',transferencia:'Transferencia',tarjeta:'Tarjeta'}[sale.paymentMethod||sale.medio_pago]||sale.paymentMethod||sale.medio_pago||'No registrado';
  return `<article class="rt-paper rt-width-${Number(width)===58?58:80}" aria-label="Ticket de venta de ${escape(name)}"><header class="rt-company">${logo?`<img src="${escape(logo)}" alt="Logo de ${escape(name)}" referrerpolicy="no-referrer"/>`:''}<h1>${escape(name)}</h1>${company.nit||company.taxId?`<p>NIT: ${escape(company.nit||company.taxId)}</p>`:''}${company.address||company.direccion?`<p>${escape(company.address||company.direccion)}</p>`:''}${company.whatsapp?`<p>WhatsApp: ${escape(company.whatsapp)}</p>`:''}${company.email?`<p>${escape(company.email)}</p>`:''}</header><div class="rt-title">TICKET DE VENTA</div>${sale.anulada?'<p class="rt-cancelled">VENTA ANULADA</p>':''}<dl class="rt-meta">${pair('N.º',sale.id||'—')}${pair('Fecha',receiptDate(sale.fecha))}${pair('Vendedor',sale.usuario||sale.sellerName)}${pair('Cliente',sale.cliente||'Cliente general')}${pair('Teléfono',sale.telefono||sale.phone)}${pair('Placa',sale.placa)}</dl><ul class="rt-lines">${rows}${services}</ul><dl class="rt-totals">${products.length&&labor.length?pair('Productos',receiptMoney(totals.products))+pair('Mano de obra',receiptMoney(totals.labor)):''}${totals.returned>0?pair('Total original',receiptMoney(totals.original))+pair('Devuelto',receiptMoney(totals.returned)):''}<div class="rt-total"><dt>${totals.returned>0?'Total vigente':'TOTAL'}</dt><dd>${escape(receiptMoney(totals.net))}</dd></div>${pair('Medio de pago',payment)}</dl><footer class="rt-footer"><p>Gracias por tu compra</p><p>Valores en COP · Comprobante comercial.</p><p>No es factura electrónica DIAN.</p><small>SCORTA</small></footer></article>`;
}

export function receiptPrintCSS(width=80){
  const pageWidth=Number(width)===58?58:80;
  return `@page{size:${pageWidth}mm 297mm;margin:3mm}*{box-sizing:border-box}html,body{margin:0;padding:0;color:#111;background:#fff;font-family:Arial,Helvetica,sans-serif;font-size:14px}body{width:${pageWidth-6}mm;max-width:100%;margin:0 auto}.rt-paper{width:100%;margin:0;padding:0;color:#111;font-size:inherit;line-height:1.4;overflow-wrap:anywhere}.rt-company{text-align:center;border-bottom:1px dashed #777;padding:0 0 10px}.rt-company img{display:block;max-width:100%;width:auto;max-height:27mm;margin:0 auto 7px;object-fit:contain}.rt-company h1{font-size:1.2em;margin:0 0 5px;font-weight:700}.rt-company p{margin:2px 0}.rt-title{text-align:center;font-weight:700;padding:8px 0}.rt-meta,.rt-totals{margin:0}.rt-meta>div,.rt-totals>div{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin:3px 0}.rt-meta dt,.rt-totals dt{flex-shrink:0}.rt-meta dd,.rt-totals dd{margin:0;text-align:right;min-width:0;overflow-wrap:anywhere}.rt-lines{padding:0;margin:10px 0;list-style:none;border-top:1px dashed #777;border-bottom:1px dashed #777}.rt-line{padding:8px 0;border-bottom:1px dotted #aaa}.rt-line:last-child{border-bottom:0}.rt-line-title{display:flex;justify-content:space-between;gap:10px}.rt-line-title>strong:first-child{min-width:0;flex:1;overflow-wrap:anywhere}.rt-line-title>strong:last-child{text-align:right;max-width:45%;flex-shrink:0}.rt-line-detail,.rt-returned{font-size:.95em;margin-top:2px}.rt-total{font-size:1.25em;font-weight:700;border-top:1px dashed #777;padding-top:8px;margin-top:8px!important}.rt-footer{text-align:center;margin-top:14px;font-size:.9em}.rt-footer p{margin:3px 0}.rt-footer small{display:block;margin-top:8px;color:#555}.rt-cancelled{text-align:center;font-weight:700;border:2px solid #111;padding:7px}.rt-file-hint{font-size:12px;color:#555;margin:16px 0}@media print{html,body{font-size:${pageWidth===58?11:12}px}body{width:auto;margin:0}.rt-paper,.rt-lines,.rt-meta,.rt-totals{height:auto!important;max-height:none!important;overflow:visible!important}.rt-line{break-inside:avoid;page-break-inside:avoid}.rt-file-hint{display:none}.rt-company img{max-height:24mm}}`;
}
export function receiptDocument({sale={},company={},width=80}={}){
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Ticket ${receiptEscape(sale.id||'venta')}</title><style>${receiptPrintCSS(width)}</style></head><body>${receiptMarkup({sale,company,width})}<p class="rt-file-hint">Usa Imprimir para imprimir este ticket o guardarlo como PDF.</p></body></html>`;
}
