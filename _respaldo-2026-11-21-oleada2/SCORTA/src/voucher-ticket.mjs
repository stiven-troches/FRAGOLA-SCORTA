// BE-15 / BE-16 / BE-34: comprobantes imprimibles de separados, abonos y movimientos de caja,
// y el estado de cuenta del cliente. Mismo papel y CSS que el ticket de venta (80 o 58 mm);
// el navegador imprime o guarda como PDF.
import {RECEIPT_LEGAL_NOTICE,receiptDate,receiptEscape as escape,receiptMoney as money,receiptPrintCSS,safeReceiptImage} from './receipt-ticket.mjs';
import {paymentLabel} from '../sale-pricing.mjs';
import {CASH_MOVEMENT_LABELS,LAYAWAY_STATUS} from '../caja-credito.mjs';

const pair=(label,value)=>value!==''&&value!=null?`<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`:'';
function header(company={},title){
  const logo=safeReceiptImage(company.logo),name=company.name||company.nombre||'Empresa',nit=company.nit||'';
  return `<header class="rt-company">${logo?`<img src="${escape(logo)}" alt="Logo de ${escape(name)}" referrerpolicy="no-referrer"/>`:''}<h1>${escape(name)}</h1>${nit?`<p>NIT: ${escape(nit)}</p>`:''}${company.address?`<p>${escape(company.address)}</p>`:''}${company.whatsapp?`<p>WhatsApp: ${escape(company.whatsapp)}</p>`:''}</header><div class="rt-title">${escape(title)}</div><p class="rt-legal"><strong>${escape(RECEIPT_LEGAL_NOTICE)}</strong><span>Emisor: ${escape(name)}${nit?` · NIT ${escape(nit)}`:''}</span></p>`;
}
const footer=note=>`<footer class="rt-footer">${note?`<p>${escape(note)}</p>`:''}<p>Valores en COP.</p><p class="rt-legal-footer">${escape(RECEIPT_LEGAL_NOTICE)}</p><small>SCORTA</small></footer>`;
const paper=(width,label,body)=>`<article class="rt-paper rt-width-${Number(width)===58?58:80}" aria-label="${escape(label)}">${body}</article>`;
const lines=detalles=>`<ul class="rt-lines">${(detalles||[]).map(line=>`<li class="rt-line"><div class="rt-line-title"><strong>${escape(line.nombre||'Producto')}</strong><strong>${escape(money(Number(line.cantidad)*Number(line.precio_unitario)))}</strong></div><div class="rt-line-detail">${escape(line.cantidad)} × ${escape(money(line.precio_unitario))}</div></li>`).join('')}</ul>`;

/** Comprobante del separado (con todos sus abonos) o de un abono puntual (paymentId). */
export function layawayMarkup({layaway={},company={},paymentId=null,width=80}={}){
  const payment=paymentId?(layaway.abonos||[]).find(item=>item.id===paymentId):null;
  const title=payment?'ABONO A SEPARADO':'SEPARADO DE MERCANCÍA';
  const abonos=(layaway.abonos||[]).map(item=>pair(`${receiptDate(item.fecha)} · ${paymentLabel(item.method)}`,money(item.amount))).join('');
  const state=layaway.estado==='activo'&&layaway.vence?`Vence el ${receiptDate(layaway.vence)}`:LAYAWAY_STATUS[layaway.estado]||'';
  const body=header(company,title)+`<dl class="rt-meta">${pair('N.º',payment?payment.numero:layaway.numero)}${pair('Separado',payment?layaway.numero:'')}${pair('Fecha',receiptDate(payment?payment.createdAt||payment.fecha:layaway.createdAt||layaway.fecha))}${pair('Cliente',layaway.cliente)}${pair('Teléfono',layaway.telefono)}${pair('Atendió',payment?payment.usuario:layaway.usuario)}${pair('Estado',state)}</dl>`+
    lines(layaway.detalles)+`<dl class="rt-totals"><div class="rt-total"><dt>Total separado</dt><dd>${escape(money(layaway.total))}</dd></div>${payment?pair('Valor de este abono',money(payment.amount))+pair('Medio de pago',paymentLabel(payment.method))+pair('Saldo anterior',money(payment.saldoAntes)):''}${!payment&&abonos?`<div class="rt-subtitle"><dt>Abonos</dt><dd></dd></div>${abonos}`:''}${pair('Total abonado',money(layaway.pagado))}${pair('Saldo pendiente',money(payment?payment.saldoDespues:layaway.saldo))}</dl>`+
    footer('La mercancía queda separada hasta la fecha de vencimiento. Presenta este comprobante para recibirla.');
  return paper(width,title+' '+(layaway.numero||''),body);
}
/** Comprobante de un abono de cartera, con las facturas que pagó. */
export function creditPaymentMarkup({payment={},company={},width=80}={}){
  const applied=(payment.aplicado||[]).map(item=>pair(`Factura del ${receiptDate(item.fecha)}`,money(item.amount))).join('');
  const body=header(company,'ABONO A CRÉDITO')+`<dl class="rt-meta">${pair('N.º',payment.numero||payment.id)}${pair('Fecha',receiptDate(payment.createdAt||payment.fecha))}${pair('Cliente',payment.cliente)}${pair('Recibió',payment.usuario)}${pair('Medio de pago',paymentLabel(payment.method))}</dl>`+
    `<dl class="rt-totals">${applied?`<div class="rt-subtitle"><dt>Aplicado a</dt><dd></dd></div>${applied}`:''}<div class="rt-total"><dt>Abono</dt><dd>${escape(money(payment.amount))}</dd></div>${pair('Saldo anterior',money(payment.saldoAntes))}${pair('Saldo pendiente',money(payment.saldoDespues))}</dl>`+footer('Gracias por tu pago');
  return paper(width,'Abono '+(payment.numero||''),body);
}
/** Comprobante de un movimiento de caja (apertura, gasto, retiro o ingreso). */
export function cashMovementMarkup({movement={},company={},width=80}={}){
  const title=(CASH_MOVEMENT_LABELS[movement.tipo]||'Movimiento de caja').toUpperCase();
  const body=header(company,title)+`<dl class="rt-meta">${pair('Fecha',receiptDate(movement.createdAt||movement.fecha))}${pair('Registró',movement.usuario)}${pair('Motivo',movement.motivo)}${pair('Medio',paymentLabel(movement.method))}</dl><dl class="rt-totals"><div class="rt-total"><dt>Valor</dt><dd>${escape(money(movement.amount))}</dd></div></dl>`+footer('');
  return paper(width,title,body);
}
/** Estado de cuenta del cliente: facturas a crédito, abonos y saldo. */
export function statementMarkup({account={},company={},today='',width=80}={}){
  const invoices=(account.facturas||[]).filter(item=>!item.anulada).map(item=>`<li class="rt-line"><div class="rt-line-title"><strong>Factura del ${escape(receiptDate(item.fecha))}</strong><strong>${escape(money(item.saldo))}</strong></div><div class="rt-line-detail">Crédito ${escape(money(item.monto))} · vence ${escape(receiptDate(item.vence))}${item.vencida?` · <b>vencida hace ${escape(item.diasVencida)} días</b>`:''}${item.pagado>0?` · abonado ${escape(money(item.pagado))}`:''}</div></li>`).join('');
  const payments=(account.abonos||[]).slice(0,30).map(item=>pair(`${receiptDate(item.fecha)} · ${paymentLabel(item.method)}`,money(item.amount))).join('');
  const body=header(company,'ESTADO DE CUENTA')+`<dl class="rt-meta">${pair('Cliente',account.nombre)}${pair('Documento',account.numeroDocumento?[account.tipoDocumento,account.numeroDocumento].filter(Boolean).join(' '):'')}${pair('Teléfono',account.telefono)}${pair('Corte',receiptDate(today))}${account.creditLimit?pair('Cupo',money(account.creditLimit)):''}</dl>`+
    `<ul class="rt-lines">${invoices||'<li class="rt-line">Sin facturas a crédito.</li>'}</ul><dl class="rt-totals">${payments?`<div class="rt-subtitle"><dt>Abonos recibidos</dt><dd></dd></div>${payments}`:''}${account.vencido?pair('Vencido',money(account.vencido)):''}<div class="rt-total"><dt>Saldo pendiente</dt><dd>${escape(money(account.saldo))}</dd></div>${account.saldoAFavor?pair('Saldo a favor',money(account.saldoAFavor)):''}</dl>`+footer('Consulta cualquier diferencia con el almacén.');
  return paper(width,'Estado de cuenta de '+(account.nombre||''),body);
}
// ---------------------------------------------------------------- BE-17 / BE-35 / BE-40
const discountText=line=>Number(line.descuento)>0?` · desc. ${money(line.descuento)} c/u`:'';
/** Cotización imprimible (no descuenta stock ni es factura). */
export function quoteMarkup({quote={},company={},width=80}={}){
  const rows=(quote.detalles||[]).map(line=>`<li class="rt-line"><div class="rt-line-title"><strong>${escape(line.nombre||'Producto')}</strong><strong>${escape(money(Number(line.cantidad)*Number(line.precio_unitario)))}</strong></div><div class="rt-line-detail">${escape(line.cantidad)} × ${escape(money(line.precio_unitario))}${line.referencia?` · Ref. ${escape(line.referencia)}`:''}${escape(discountText(line))}</div></li>`).join('');
  const vat=(quote.iva?.tarifas||[]).map(row=>pair(`IVA ${row.tarifa} % (base ${money(row.base)})`,money(row.iva))).join('');
  const body=header(company,'COTIZACIÓN')+`<dl class="rt-meta">${pair('N.º',quote.numero)}${pair('Fecha',receiptDate(quote.createdAt||quote.fecha))}${pair('Válida hasta',receiptDate(quote.vence))}${pair('Cliente',quote.cliente)}${pair('Documento',quote.numeroDocumento?[quote.tipoDocumento,quote.numeroDocumento].filter(Boolean).join(' '):'')}${pair('Teléfono',quote.telefono)}${pair('Atendió',quote.usuario)}</dl>`+
    `<ul class="rt-lines">${rows}</ul><dl class="rt-totals">${Number(quote.descuentos)>0?pair('Descuentos',money(quote.descuentos)):''}${vat}<div class="rt-total"><dt>Total cotizado</dt><dd>${escape(money(quote.total))}</dd></div></dl>`+
    `${quote.nota?`<p class="rt-legal"><span>${escape(quote.nota)}</span></p>`:''}`+footer('Precios sujetos a disponibilidad. Esta cotización no reserva mercancía ni es factura.');
  return paper(width,'Cotización '+(quote.numero||''),body);
}
/** Recepción de una pieza en garantía (copia para el cliente). */
export function warrantyMarkup({warranty={},company={},width=80,labels={}}={}){
  const decision=warranty.decision?labels.decisions?.[warranty.decision.tipo]||warranty.decision.tipo:'Pendiente de revisión';
  const body=header(company,'RECEPCIÓN DE GARANTÍA')+`<dl class="rt-meta">${pair('N.º',warranty.numero)}${pair('Fecha',receiptDate(warranty.createdAt||warranty.fecha))}${pair('Cliente',warranty.cliente)}${pair('Teléfono',warranty.telefono)}${pair('Venta del',receiptDate(warranty.saleFecha))}${pair('Recibió',warranty.usuario)}</dl>`+
    `<ul class="rt-lines"><li class="rt-line"><div class="rt-line-title"><strong>${escape(warranty.nombre)}</strong><strong>${escape(warranty.cantidad)} und.</strong></div><div class="rt-line-detail">Motivo: ${escape(warranty.motivo)}</div></li></ul>`+
    `<dl class="rt-totals">${pair('Plazo de garantía',warranty.garantiaDias?`${warranty.garantiaDias} días (hasta ${receiptDate(warranty.venceGarantia)})`:'Sin plazo registrado')}${warranty.fueraDePlazo?pair('Aviso','Fuera del plazo de garantía'):''}${pair('Estado',labels.status?.[warranty.estado]||warranty.estado)}${pair('Decisión',decision)}${warranty.decision?.reembolso?.total?pair('Dinero devuelto',money(warranty.decision.reembolso.total)):''}</dl>`+
    footer('Conserva este comprobante para reclamar la pieza o la respuesta de la garantía.');
  return paper(width,'Garantía '+(warranty.numero||''),body);
}
/** Orden de compra para enviar o imprimir (sin precios de venta). */
export function purchaseOrderMarkup({order={},company={},supplier={},width=80,status=''}={}){
  const rows=(order.items||[]).map(item=>`<li class="rt-line"><div class="rt-line-title"><strong>${escape(item.nombre)}</strong><strong>${escape(item.cantidad)} und.</strong></div><div class="rt-line-detail">${item.referencia?`Ref. ${escape(item.referencia)} · `:''}${item.costo!=null?`Costo esperado ${escape(money(item.costo))}`:'Costo por confirmar'}${Number(item.recibido)>0?` · recibidas ${escape(item.recibido)}`:''}</div></li>`).join('');
  const body=header(company,'ORDEN DE COMPRA')+`<dl class="rt-meta">${pair('N.º',order.numero)}${pair('Fecha',receiptDate(order.createdAt||order.fecha))}${pair('Proveedor',order.proveedor)}${pair('NIT',supplier.nit)}${pair('Contacto',supplier.contacto)}${pair('Entrega esperada',order.fechaEntrega?receiptDate(order.fechaEntrega):'')}${pair('Estado',status)}${pair('Elaboró',order.usuario)}</dl>`+
    `<ul class="rt-lines">${rows}</ul><dl class="rt-totals"><div class="rt-total"><dt>Total estimado</dt><dd>${escape(money(order.total))}</dd></div></dl>${order.nota?`<p class="rt-legal"><span>${escape(order.nota)}</span></p>`:''}`+footer('Confirma disponibilidad, precios y fecha de entrega.');
  return paper(width,'Orden de compra '+(order.numero||''),body);
}
/** Comprobante de pago a proveedor, con las compras que pagó. */
export function supplierPaymentMarkup({payment={},company={},width=80}={}){
  const applied=(payment.aplicado||[]).map(item=>pair(`Compra del ${receiptDate(item.fecha)}${item.factura?' · '+item.factura:''}`,money(item.amount))).join('');
  const body=header(company,'PAGO A PROVEEDOR')+`<dl class="rt-meta">${pair('N.º',payment.numero)}${pair('Fecha',receiptDate(payment.createdAt||payment.fecha))}${pair('Proveedor',payment.proveedor)}${pair('Registró',payment.usuario)}${pair('Medio de pago',paymentLabel(payment.method))}</dl>`+
    `<dl class="rt-totals">${applied?`<div class="rt-subtitle"><dt>Aplicado a</dt><dd></dd></div>${applied}`:''}<div class="rt-total"><dt>Pago</dt><dd>${escape(money(payment.amount))}</dd></div>${pair('Saldo anterior',money(payment.saldoAntes))}${pair('Saldo pendiente',money(payment.saldoDespues))}</dl>`+footer(payment.nota||'');
  return paper(width,'Pago '+(payment.numero||''),body);
}
export function voucherDocument(markup,title='Comprobante',width=80){
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escape(title)}</title><style>${receiptPrintCSS(width)}.rt-subtitle{margin-top:8px!important;font-weight:700}</style></head><body>${markup}<p class="rt-file-hint">Usa Imprimir para imprimir este comprobante o guardarlo como PDF.</p></body></html>`;
}
/** Abre la ventana de impresión del navegador (imprimir o guardar como PDF). Devuelve false si se bloqueó. */
export function printVoucher(markup,title,width=80){
  const win=globalThis.window?.open?.('','_blank');if(!win)return false;
  win.opener=null;win.document.write(voucherDocument(markup,title,width));win.document.close();
  setTimeout(()=>{try{win.focus();win.print()}catch{}},300);return true;
}
