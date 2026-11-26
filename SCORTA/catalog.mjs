import {sumMoney,roundMoney} from './money.mjs';
import {listPrice,saleSettings} from './sale-pricing.mjs';
import {isMediaRef,mediaUrl} from './media-ref.mjs';

const fail=(message,status=400)=>{throw Object.assign(Error(message),{status,code:'CATALOG_ERROR'})};
const text=(v,max=300)=>String(v??'').trim().slice(0,max);
export const catalogDefaults={enabled:false,primary:'#1644d8',secondary:'#edf2ff',headline:'Encuentra lo que necesitas.',description:'Explora nuestros productos y haz tu pedido por WhatsApp.'};
// El enlace compartido y la pestaña también pertenecen al negocio, sin iconos de SCORTA.
export function catalogHead(html,company){
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const name=escape(company?.name||'Catálogo'),description=escape(company?.catalog?.description||'Explora los productos de este negocio.');
 // El logo va por URL (con caché) y no incrustado en base64 en cada página.
 const icon=company?.logo&&company?.slug?'/api/v2/catalog/'+encodeURIComponent(company.slug)+'/logo':'';
 return html.replace(/<title>[^<]*<\/title>/,'<title>'+name+' · Catálogo</title>')
  .replace(/<meta name="description"[^>]*>/,'<meta name="description" content="'+description+'">')
  .replace(/<link\b[^>]*rel="(?:manifest|icon|apple-touch-icon)"[^>]*>/g,'')
  .replace('</head>','<meta property="og:title" content="'+name+'"><meta property="og:description" content="'+description+'">'+(icon?'<link rel="icon" href="'+escape(icon)+'">':'')+'</head>');
}
export function whatsappNumber(value){const n=String(value||'').replace(/\D/g,'');return /^3\d{9}$/.test(n)?'57'+n:/^[1-9]\d{10,14}$/.test(n)?n:''}
export function cleanCatalog(form,previous={}){
 const value={...catalogDefaults,...previous,...form};
 if(typeof value.enabled!=='boolean')fail('Indica si publicas el catálogo.');
 for(const key of ['primary','secondary'])if(!/^#[0-9a-f]{6}$/i.test(value[key]))fail('Elige colores válidos.');
 return {enabled:value.enabled,primary:value.primary,secondary:value.secondary,headline:text(value.headline,100)||catalogDefaults.headline,description:text(value.description,300)};
}
export function catalogCompany(state,slug,now){
 const company=state.companies.find(c=>c.slug===slug);
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 if(!company||!company.enabled||!company.catalog?.enabled||company.startDate>day||company.endDate<day)fail('Este catálogo no está disponible en este momento.',404);
 return company;
}
export function catalogProducts(state,company){return (state.businesses[company.id]?.prods||[]).filter(p=>Number(p.stock)>0&&p.active!==false&&!p.archived)}
// El catálogo muestra el mismo precio final que cobra la caja: con IVA sumado si la empresa
// registra sus precios sin IVA incluido.
const publicPrice=(state,company)=>{const settings=saleSettings(state.businesses[company.id]);return p=>listPrice(p,'mostrador',settings)};
// BE-30: imágenes ya movidas al almacén de medios: URL /media inmutable; las heredadas siguen por la API.
export function publicCatalog(state,company){
 const base='/api/v2/catalog/'+encodeURIComponent(company.slug),price=publicPrice(state,company);
 return {company:{name:company.name,logo:isMediaRef(company.logo)?mediaUrl(company.logo):company.logo?base+'/logo':'',slug:company.slug,address:company.address||'',whatsapp:whatsappNumber(company.whatsapp),catalog:cleanCatalog({},company.catalog)},
 products:catalogProducts(state,company).map(p=>({id:p.id,nombre:p.nombre,categoria:p.categoria||'General',referencia:p.referencia||'',marca:p.marca||'',descripcion:p.descripcion||p.compatibilidad||'',modelo:p.modelo||'',precio_venta:price(p),foto:isMediaRef(p.foto)?mediaUrl(p.foto):p.foto?base+'/photo/'+encodeURIComponent(p.id):''}))};
}
export function catalogCheckout(state,company,items){
 const phone=whatsappNumber(company.whatsapp);if(!phone)fail('El negocio todavía no ha configurado su WhatsApp.');
 if(!Array.isArray(items)||!items.length||items.length>50)fail('Agrega entre 1 y 50 productos al carrito.');
 const available=catalogProducts(state,company),price=publicPrice(state,company),seen=new Set();
 // La cantidad no se compara con las existencias: así nadie puede averiguar el inventario
 // probando cantidades. El negocio confirma la disponibilidad por WhatsApp.
 const lines=items.map(item=>{
  const p=available.find(p=>p.id===item?.id),qty=Number(item?.quantity);
  if(!p||!Number.isSafeInteger(qty)||qty<1||qty>999||seen.has(item.id))fail('Un producto o cantidad ya no está disponible. Revisa tu carrito.',409);
  seen.add(item.id);const unit=price(p);return {id:p.id,name:p.nombre,quantity:qty,price:unit,total:roundMoney(qty*unit)};
 });
 const total=sumMoney(lines.map(l=>l.total)),money=v=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:2}).format(v);
 const message=['Hola, estoy interesado en comprar estos productos en '+company.name+':','',...lines.map(l=>`${l.quantity} × ${l.name} — ${money(l.price)} c/u — ${money(l.total)}`),'',`Total: ${money(total)}`,'¿Me confirman disponibilidad y cómo realizar el pago?'].join('\n');
 return {url:'https://wa.me/'+phone+'?text='+encodeURIComponent(message),lines,total};
}
