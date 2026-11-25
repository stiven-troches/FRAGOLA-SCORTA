import {catalogCompany,catalogProducts,publicCatalog,catalogCheckout,cleanCatalog,whatsappNumber} from './catalog.mjs';
import {overviewReport} from './overview-report.mjs';
import {activeMechanics,mechanicForLabor,applyAdminControl,reportDates} from './admin-controls.mjs';
import {salesReport} from './admin-reports.mjs';
import {passwordPolicyError} from './password-policy.mjs';
import {visibleTickets,applyTicketAction} from './support-tickets.mjs';
import {readDraft,writeDraft,assertDraftSale,finishDraftSale,draftKey} from './sale-drafts.mjs';
import {searchProducts,searchSales,searchCustomers} from './platform-search.mjs';
import {aplicarCambio, estadoVacio} from './inventory.mjs';
import {moneyAmount,roundMoney,sumMoney} from './money.mjs';
import {applyCashCreditAction,cashSettings,cleanCashSettings,creditFields,creditAccounts,creditCheck,creditTerms,refundFor,cashMethod} from './caja-credito.mjs';
import {PAYMENT_KEYS,CREDIT_METHOD,FAVOR_METHOD,DOCUMENT_TYPES,priceSaleItems,CUSTOMER_TYPES,customerType,saleSettings,cleanSaleSettings,listPrice,productVatRate,priceLines,discountPercent,normalizePayments,primaryMethod,saleVat} from './sale-pricing.mjs';
import {applyQuoteAction,prepareQuoteConversion,markQuoteConverted,cleanQuoteSettings} from './cotizaciones.mjs';
import {applyWarrantyAction} from './garantias.mjs';
import {applyPurchasingAction,attachPurchaseTerms,assertPurchaseCancellable,afterPurchaseCancelled,payableAccounts} from './compras-proveedores.mjs';
import {companyPlan,cleanPlan,assertFeature,assertLimit,photoCount} from './plan-limits.mjs';
import {generateTotpSecret,verifyTotp,otpauthUri,totpCounter} from './totp.mjs';
import {MEDIA_MAX_BYTES,MEDIA_PATH,clientImage,imageWeight,isMediaRef,mediaUrl,sniffImage} from './media-ref.mjs';
import {dateBogota,nextMonth,renewalProposal} from './src/renewal.mjs';
import {MAIL_DISABLED_MESSAGE,RECOVERY_REQUESTED_MESSAGE} from './src/recovery.mjs';
export {dateBogota,renewalProposal};

const encoder = new TextEncoder();
// BE-07: bump when the terms change; every company admin must accept the new version.
export const TERMS_VERSION = '2026-11-21';
// BE-06: per-company photo cap (BE-30 keeps it; size counted as base64-equivalent characters).
export const MAX_COMPANY_PHOTOS = 200, MAX_COMPANY_PHOTO_CHARS = 40 * 1024 * 1024;
const PASSWORD_WINDOW_MS=15*60000,PASSWORD_MAX_FAILURES=5,ACCOUNT_ALERT_FAILURES=5,MAX_SECURITY_EVENTS=500,MAX_OWNER_ORIGINS=50;
const MAX_IMAGE = 700000;
// Sessions survive browser/server restarts for up to 30 days; company/user checks still apply on every request.
export const PLATFORM_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_MS = PLATFORM_SESSION_TTL_MS;
// The owner controls every company: shorter session, and support access ends by itself.
export const OWNER_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const SUPPORT_TTL_MS = 2 * 60 * 60 * 1000;
const RECEIPT_MS = 7 * 86400000;
// Topes de crecimiento: sesiones abiertas por usuario y registros de auditoría que recibe el propietario.
export const MAX_SESSIONS_PER_USER=10,OWNER_AUDIT_LIMIT=1000;
const LOGIN_ACCOUNT_WINDOW_MS=15*60000,LOGIN_ORIGIN_WINDOW_MS=60000;
const LOGIN_ORIGIN_LIMIT=60,MAX_LOGIN_FAILURES=2000,MAX_LOGIN_ORIGINS=1000;
// SEG-13: recuperación de contraseña por correo y verificación del correo.
export const PASSWORD_RESET_TTL_MS=60*60000,EMAIL_CODE_TTL_MS=10*60000;
const RECOVERY_WINDOW_MS=15*60000,RECOVERY_ACCOUNT_LIMIT=3,RECOVERY_ORIGIN_LIMIT=10,RESET_ORIGIN_LIMIT=20;
const EMAIL_CODE_MAX_ATTEMPTS=5,EMAIL_CODE_RESEND_MS=60000,EMAIL_CODE_MAX_SENDS=5,EMAIL_CODE_WINDOW_MS=60*60000;
export {MAIL_DISABLED_MESSAGE,RECOVERY_REQUESTED_MESSAGE};
const fail = (message, status = 400, code) => {throw Object.assign(Error(message), {status, code});};
const stamp = value => {const n = typeof value === 'function' ? value() : value ?? Date.now(); const d = new Date(n); if (!Number.isFinite(d.getTime())) fail('Fecha inválida'); return d;};
const iso = now => stamp(now).toISOString();
const id = () => crypto.randomUUID();
const norm = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const text = (v, label, max = 200) => {if (typeof v !== 'string' || !v.trim() || v.length > max) fail(`${label}: dato obligatorio o demasiado largo`); return v.trim();};
const optionalText = (v, max = 200) => v == null ? '' : String(v).trim().slice(0,max);
const recoveryEmail = value => {if(value==null||value==='')return '';if(typeof value!=='string'||value.length>254)fail('Correo de recuperación inválido');const email=value.trim().toLowerCase();if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Correo de recuperación inválido');return email;};
const date = (v, label) => {if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0,10) !== v) fail(`${label}: fecha inválida`); return v;};
const token = () => toBase64(crypto.getRandomValues(new Uint8Array(32))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const toBase64 = bytes => btoa(Array.from(bytes, v => String.fromCharCode(v)).join(''));
const fromBase64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const hash = async value => toBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
const checkPassword = v => {const error=passwordPolicyError(v);if(error)fail(error,400,'INVALID_PASSWORD');return v;};
function pruneLoginTracking(state,now){
  for(const [field,max]of [['loginFailures',MAX_LOGIN_FAILURES],['loginOrigins',MAX_LOGIN_ORIGINS],['accountFailures',MAX_LOGIN_FAILURES],['passwordFailures',MAX_LOGIN_FAILURES],['recoveryLimits',MAX_LOGIN_FAILURES]]){
    const records=state[field]??={};
    for(const [key,value]of Object.entries(records))if(!value||!Number.isFinite(value.until)||value.until<=now)delete records[key];
    const entries=Object.entries(records);
    if(entries.length>max)for(const [key]of entries.sort((a,b)=>a[1].until-b[1].until).slice(0,entries.length-max))delete records[key];
  }
}
const REQUEST_RETENTION_MS=90*86400000;
// Bound the single JSON state: idempotency keys expire after 90 days and
// expired receipt links are dropped (the sale keeps its data; a new link can be issued).
function pruneStoredState(state,now){
  for(const [key,value]of Object.entries(state.requests||{})){const created=Date.parse(value?.createdAt);if(Number.isFinite(created)&&created+REQUEST_RETENTION_MS<=now)delete state.requests[key];}
  for(const [key,value]of Object.entries(state.receipts||{}))if(!value||value.expires<=now)delete state.receipts[key];
  for(const [key,value]of Object.entries(state.passwordResets||{}))if(!value||value.expires<=now)delete state.passwordResets[key];
  // SEG-03 one-time migration: receipt tokens/URLs were stored in clear on each sale.
  // Keep only the SHA-256 (state.receipts already indexes by it) and drop the secrets.
  if(!state.receiptSecretsDropped){for(const business of Object.values(state.businesses||{}))for(const sale of business?.ventas||[])dropReceiptSecret(sale);state.receiptSecretsDropped=true;}
}
const dropReceiptSecret=sale=>{delete sale.receiptToken;delete sale.receiptUrl;delete sale.receipt_url;};
const securityEvent=(state,tipo,details,now)=>{const events=state.securityEvents??=[];events.unshift({id:id(),fecha:iso(now),tipo,...details});if(events.length>MAX_SECURITY_EVENTS)events.length=MAX_SECURITY_EVENTS;};
const maskPhone=value=>typeof value==='string'?value.replace(/\d(?=(?:\D*\d){4})/g,'*'):value;
let dummyPassword=null;
// SEG-06: unknown accounts still pay one full PBKDF2 verification.
const dummyUser=async()=>({password:dummyPassword??=await passwordHash(token())});
function companySlug(value){return norm(value).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50)||'empresa'}
function normalizeContext(value){
  if(value===null||value==='@owner')return null;
  if(typeof value!=='string'||!value||value.length>100||value.trim()!==value)fail('Contexto de empresa inválido.',400,'INVALID_CONTEXT');
  return value;
}
async function actionFingerprint(actor,body){
  const action=structuredClone(body);delete action.revision;delete action.requestId;
  if(action.payload){delete action.payload.revision;delete action.payload.requestId;}
  const contextCompanyId=['support.start','support.end'].includes(body.type)?null:actor.companyId;
  return hash(JSON.stringify({contextCompanyId,action}));
}
async function assertRequestContext(state,actor,request,body,path){
  const fromRequest=Object.hasOwn(request,'expectedCompanyId'),fromBody=Object.hasOwn(body,'expectedCompanyId');
  if(!fromRequest&&!fromBody){
    // The initial session bootstrap is deliberately context-free. Internal pure
    // engine callers stay compatible; every browser/HTTP adapter opts in below.
    if(request.enforceContext&&path!=='/api/v2/session')fail('Recarga la aplicación para confirmar la empresa antes de continuar.',428,'CONTEXT_REQUIRED');
    return;
  }
  const expected=normalizeContext(fromRequest?request.expectedCompanyId:body.expectedCompanyId);
  if(fromRequest&&fromBody&&normalizeContext(body.expectedCompanyId)!==expected)fail('La solicitud contiene contextos de empresa diferentes.',400,'INVALID_CONTEXT');
  if(expected===(actor.companyId??null))return;
  // A transition may already have succeeded before its response was lost. Only
  // acknowledge its exact recorded request while still in its resulting scope.
  if(path==='/api/v2/action'&&['support.start','support.end'].includes(body.type)&&typeof body.requestId==='string'&&body.requestId.trim()&&body.requestId.length<=150){
    const previous=state.requests[actor.id+'|'+body.requestId.trim()];
    const inResult=body.type==='support.start'?actor.companyId===body.companyId&&actor.support?.reason===String(body.form?.motivo||'').trim():actor.companyId===null;
    if(inResult&&previous?.fingerprint===await actionFingerprint(actor,body))return;
  }
  fail('La empresa o sesión cambió en otra pestaña. Recarga para confirmar el contexto; no se aplicaron cambios.',409,'COMPANY_CONTEXT_CHANGED');
}
function publicReceiptSale(sale){
  const result={};
  for(const key of ['id','fecha','usuario','cliente','telefono','placa','paymentMethod','payments','efectivo_recibido','vueltas','descuentos','descuento_total','iva','tipoDocumento','numeroDocumento','anulada','total','subtotal_productos','subtotal_mano_obra','laborRefund','devolucion_mano_obra','credito','separadoNumero'])if(Object.hasOwn(sale,key))result[key]=structuredClone(sale[key]);
  result.detalles=(sale.detalles||[]).map(line=>Object.fromEntries(['nombre','cantidad','precio_lista','precio_modificado','descuento','precio_unitario','tarifa_iva','devuelto'].filter(key=>Object.hasOwn(line,key)).map(key=>[key,structuredClone(line[key])])));
  result.labor=(sale.labor||[]).map(line=>Object.fromEntries(['descripcion','mecanico','importe'].filter(key=>Object.hasOwn(line,key)).map(key=>[key,structuredClone(line[key])])));
  if(result.telefono)result.telefono=maskPhone(result.telefono);
  // The public link shows only the last digits of the customer's document (BE-19).
  if(result.numeroDocumento)result.numeroDocumento=maskPhone(result.numeroDocumento);
  return result;
}
async function passwordHash(password, salt = toBase64(crypto.getRandomValues(new Uint8Array(16)))) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const result = await crypto.subtle.deriveBits({name:'PBKDF2',salt:fromBase64(salt),iterations:120000,hash:'SHA-256'},key,256);
  return {salt,digest:toBase64(new Uint8Array(result)),iterations:120000,algorithm:'PBKDF2-SHA256'};
}
async function verifyPassword(user, password) {
  if (typeof password !== 'string' || password.length < 1 || password.length > 200) return false;
  const actual = await passwordHash(password,user.password.salt);
  const a=fromBase64(actual.digest),b=fromBase64(user.password.digest);let different=a.length^b.length;
  for(let i=0;i<a.length;i++)different|=a[i]^(b[i]||0);
  return different===0;
}
// BE-30: `known` are the images this company already has (references or legacy data URLs).
// An unchanged value is kept as is; the browser sends back /media/<companyId>/<id> for a stored one.
function image(v, known=[]) {
  if (!v) return '';
  if (known.includes(v)) return v;
  if (typeof v === 'string' && MEDIA_PATH.test(v)) {const ref=known.find(k=>isMediaRef(k)&&mediaUrl(k)===v);if(!ref)fail('La imagen ya no está disponible. Vuelve a elegirla.');return ref;}
  if (typeof v !== 'string' || v.length > MAX_IMAGE || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(v)) fail('La imagen debe ser PNG, JPEG o WebP de hasta 500 KB');
  const bytes=fromBase64(v.slice(v.indexOf(',')+1)),mime=v.slice(5,v.indexOf(';'));
  if(bytes.length>MEDIA_MAX_BYTES)fail('La imagen no puede superar 500 KB');
  if(sniffImage(bytes)!==mime)fail('El contenido de la imagen no coincide con su formato');
  return v;
}
function phone(v) {const value=optionalText(v,30);if(value&&!/^\+?[0-9 ()-]{6,30}$/.test(value))fail('Número de teléfono inválido');return value.replace(/[ ()-]/g,'');}
function period(form) {const startDate=date(form.startDate,'Inicio del contrato'),endDate=date(form.endDate,'Fin del contrato');if(endDate<startDate)fail('El fin del contrato debe ser igual o posterior al inicio');return {startDate,endDate};}
export function companyStatus(company, now) {const today=dateBogota(now);return !company.enabled?'disabled':today<company.startDate?'scheduled':today>company.endDate?'expired':'active';}
const publicUser = user => {const {password,version,totp,emailVerification,...safe}=user;return safe;};
const termsAccepted = company => !company || company.terms?.version===TERMS_VERSION;
const publicCompany = (company, now, baseUrl) => ({...company,logo:clientImage(company.logo),plan:companyPlan(company),status:companyStatus(company,now),daysRemaining:Math.max(0,Math.round((Date.parse(company.endDate)-Date.parse(dateBogota(now)))/86400000)),url:new URL('/c/'+encodeURIComponent(company.slug),baseUrl||'https://scorta.example').href});
const admin = actor => actor.role === 'admin' || actor.role === 'owner';
const owner = actor => {if(actor.role!=='owner')fail('Solo el propietario de SCORTA puede realizar esta acción',403,'FORBIDDEN');};
const audit = (state,actor,action,companyId,details,now) => {state.audit.unshift({id:id(),fecha:iso(now),usuario:actor.username,userId:actor.id,accion:action,companyId,...details});};
const businessAudit = (business,actor,action,details,now) => {business.auditoria??=[];business.auditoria.unshift({id:id(),fecha:iso(now),usuario:actor.label,userId:actor.id,accion:action,motivo:actor.support?.reason||details?.motivo||'',...details});};

async function makeUser(form, companyId, role, now) {
  const username=text(form.username,'Usuario',60);if(!/^[A-Za-z0-9._-]{3,60}$/.test(username))fail('Usuario: utiliza de 3 a 60 letras, números, puntos o guiones');
  if(!['owner','admin','vendedor'].includes(role))fail('Rol inválido');
  return {id:id(),companyId,username,name:optionalText(form.name)||username,email:recoveryEmail(form.email),emailVerified:false,role,active:true,password:await passwordHash(checkPassword(form.password)),passwordChangedAt:iso(now),createdAt:iso(now),version:1};
}
export async function createPlatform({owner: config,ownerContact='',legacyState}={}) {
  if(!config)fail('Configura el propietario de SCORTA',503,'SETUP_REQUIRED');
  const state={schemaVersion:1,revision:0,ownerCompany:text(config.company||'Fragola','Empresa propietaria'),ownerContact:optionalText(ownerContact,200),companies:[],users:[],businesses:{},payments:[],requests:{},sessions:{},audit:[],receipts:{},loginFailures:{},receiptSecretsDropped:true};
  state.users.push(await makeUser({...config,name:config.name||config.username},null,'owner'));
  if(legacyState?.prods?.length || legacyState?.ventas?.length || legacyState?.compras?.length || legacyState?.servs?.length){
    const company={id:id(),name:'Almacén principal',slug:'almacen-principal',contact:'',email:'',whatsapp:'',logo:'',startDate:dateBogota(),endDate:nextMonth(dateBogota()),monthlyFee:0,enabled:true,createdAt:iso()};
    state.companies.push(company);state.businesses[company.id]=structuredClone(legacyState);
  }
  return state;
}
function companyFor(state, companyId) {const c=state.companies.find(c=>c.id===companyId);if(!c)fail('Empresa inexistente',404,'NOT_FOUND');return c;}
function assertAccess(company, now) {
  const status=companyStatus(company,now);
  if(status!=='active'){
    const error=Object.assign(Error(status==='disabled'?'El acceso de esta empresa está suspendido. Contacta al propietario.':status==='expired'?'El contrato de esta empresa venció. Contacta al propietario para renovar.':'El contrato de esta empresa aún no ha comenzado.'),{status:403,code:{disabled:'COMPANY_DISABLED',expired:'CONTRACT_EXPIRED',scheduled:'CONTRACT_NOT_STARTED'}[status],company:{name:company.name,status,endDate:company.endDate}});throw error;
  }
}
function resolveActor(state, session, now) {
  if(!session || session.expires<=stamp(now).getTime())fail('Tu sesión terminó. Vuelve a ingresar.',401,'UNAUTHORIZED');
  const user=state.users.find(u=>u.id===session.userId&&u.active&&u.version===session.version);
  if(!user)fail('Tu sesión terminó. Vuelve a ingresar.',401,'UNAUTHORIZED');
  const started=Date.parse(session.support?.startedAt);
  const support=session.support&&Number.isFinite(started)&&started+SUPPORT_TTL_MS>stamp(now).getTime()?session.support:null;
  const companyId=user.role==='owner'?support?.companyId||null:user.companyId;
  let company=null;
  if(companyId){company=companyFor(state,companyId);if(user.role!=='owner')assertAccess(company,now);}
  return {...publicUser(user),companyId,company,support,twoFactorEnabled:!!user.totp?.enabled,label:user.username+(support?' · Soporte':'')};
}
// SEG-09: company users see when the owner is operating inside their company.
function activeSupport(state,companyId,now){
  const t=stamp(now).getTime();let found=null;
  for(const s of Object.values(state.sessions||{})){const started=Date.parse(s?.support?.startedAt);if(s.support?.companyId===companyId&&s.expires>t&&Number.isFinite(started)&&started+SUPPORT_TTL_MS>t&&(!found||started>Date.parse(found.startedAt)))found=s.support;}
  return found;
}
const bogotaDaysAgo=(now,days)=>{const d=new Date(dateBogota(now)+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-days);return d.toISOString().slice(0,10);};
// BE-20: usage signals per company (sale dates are Bogotá business days).
function companyUsage(state,company,now){
  const from=bogotaDaysAgo(now,6);let lastSaleAt=null,sales7d=0;
  for(const sale of state.businesses[company.id]?.ventas||[]){if(sale.anulada)continue;if(!lastSaleAt||sale.fecha>lastSaleAt)lastSaleAt=sale.fecha;if(sale.fecha>=from)sales7d++;}
  // BE-37: uso frente al plan (usuarios activos, productos y fotos).
  const prods=state.businesses[company.id]?.prods||[];
  return {lastSaleAt,sales7d,lastLoginAt:company.lastLoginAt||null,users:state.users.filter(u=>u.companyId===company.id&&u.active).length,products:prods.length,photos:photoCount(prods)};
}
// BE-32: commercial metrics from existing statuses. "trial" = active without a monthly
// fee and without recorded payments; churn30d = companies not active today whose
// contract ended (or that were suspended with an end date) within the last 30 days.
function ownerMetrics(state,now){
  const today=dateBogota(now),since=bogotaDaysAgo(now,30),metrics={mrr:0,active:0,trial:0,expired:0,disabled:0,scheduled:0,churn30d:0},fees=[];
  for(const company of state.companies){
    const status=companyStatus(company,now),trial=status==='active'&&!Number(company.monthlyFee)&&!state.payments.some(p=>p.companyId===company.id);
    if(trial)metrics.trial++;else if(status==='active'){metrics.active++;fees.push(company.monthlyFee||0);}else metrics[status]++;
    if((status==='expired'||status==='disabled')&&company.endDate>=since&&company.endDate<=today)metrics.churn30d++;
  }
  metrics.mrr=sumMoney(fees);return metrics;
}
function aggregates(business) {
  const customers=new Map(),vehicles=new Map();
  for(const sale of business.ventas){
    if(sale.anulada)continue;
    const returned=(sale.detalles||[]).reduce((n,line)=>n+(line.devuelto||0)*line.precio_unitario,0);
    const spent=Math.max(0,sale.total-returned),cid=sale.customerId;
    if(cid){let c=customers.get(cid);if(!c){c={id:cid,nombre:sale.cliente,telefono:sale.telefono||'',placas:[],purchaseCount:0,totalSpent:0,lastVisit:sale.fecha};customers.set(cid,c);}c.purchaseCount++;c.totalSpent+=spent;c.lastVisit=c.lastVisit>sale.fecha?c.lastVisit:sale.fecha;if(sale.placa&&!c.placas.includes(sale.placa))c.placas.push(sale.placa);}
    if(sale.placa){let v=vehicles.get(sale.placa);if(!v){v={placa:sale.placa,customerIds:[],visitCount:0,totalSpent:0,lastVisit:sale.fecha};vehicles.set(sale.placa,v);}v.visitCount++;v.totalSpent+=spent;v.lastVisit=v.lastVisit>sale.fecha?v.lastVisit:sale.fecha;if(cid&&!v.customerIds.includes(cid))v.customerIds.push(cid);}
  }
  return {customers:[...customers.values()],vehicles:[...vehicles.values()]};
}
const maskTail=value=>{const text=String(value||'');return text?'•••'+text.slice(-4):''};
function removeCosts(value) {if(Array.isArray(value))return value.map(removeCosts);if(value&&typeof value==='object'){const next={};for(const [key,item]of Object.entries(value))if(!['precio_compra','costo_unitario','costo_compra','mecanicoPorcentaje','costHistory'].includes(key))next[key]=removeCosts(item);return next;}return value;}
// BE-19: reusable customer cards for Nueva venta (no e-mail or consent metadata).
const directoryCard=c=>({id:c.id,nombre:c.nombre,telefono:c.telefono||'',tipo:customerType(c.tipo),tipoDocumento:c.tipoDocumento||'',numeroDocumento:c.numeroDocumento||'',...(Number(c.creditLimit)>0?{creditLimit:Number(c.creditLimit)}:{}),...(c.creditDays?{creditDays:c.creditDays}:{}),...(Number(c.saldoAFavor)>0?{saldoAFavor:Number(c.saldoAFavor)}:{})});
// Ley 1581: el vendedor solo recibe los últimos 4 caracteres del teléfono y del documento.
const maskedCard=c=>({...c,telefono:maskTail(c.telefono),numeroDocumento:maskTail(c.numeroDocumento),masked:true});
function envelope(state, actor, now, baseUrl) {
  const support=actor.role!=='owner'&&actor.companyId?activeSupport(state,actor.companyId,now):null;
  const session={userId:actor.id,username:actor.username,name:actor.name,role:actor.role,companyId:actor.companyId,company:actor.company?publicCompany(actor.company,now,baseUrl):null,passwordChangedAt:actor.passwordChangedAt,email:actor.email||'',emailVerified:!!actor.emailVerified,support:actor.support||null,ownerContact:state.ownerContact,
    twoFactorEnabled:!!actor.twoFactorEnabled,mustChangePassword:!!actor.mustChangePassword,termsVersion:TERMS_VERSION,termsAccepted:actor.role==='owner'||termsAccepted(actor.company),
    supportActive:!!support,supportReason:support?.reason||'',supportStartedAt:support?.startedAt||null};
  if(actor.role==='owner'&&!actor.support)return {session,revision:state.revision,tickets:visibleTickets(state,actor),companies:state.companies.map(c=>({...publicCompany(c,now,baseUrl),usage:companyUsage(state,c,now)})),users:state.users.filter(u=>u.role!=='owner').map(publicUser),payments:structuredClone(state.payments),audit:structuredClone(state.audit.slice(0,OWNER_AUDIT_LIMIT)),auditTotal:state.audit.length,metrics:ownerMetrics(state,now),securityEvents:structuredClone(state.securityEvents||[])};
  const business=structuredClone(state.businesses[actor.companyId]||estadoVacio());
  business.mechanics??=[];business.cashClosures??=[];business.cashMovements??=[];business.creditPayments??=[];business.layaways??=[];
  // BE-17/35/40: cotizaciones y garantías (de todo el almacén); proveedores, órdenes y pagos solo admin.
  business.quotes??=[];business.warranties??=[];business.suppliers??=[];business.purchaseOrders??=[];business.supplierPayments??=[];
  // BE-16: cartera calculada sobre todas las ventas (el vendedor la necesita para cobrar abonos).
  business.creditAccounts=creditAccounts(business,dateBogota(now));
  for(const sale of business.ventas||[]){dropReceiptSecret(sale);delete sale.receiptHash;}
  for(const product of business.prods||[])if(isMediaRef(product.foto))product.foto=mediaUrl(product.foto);
  business.customerDirectory=(business.customerRecords||[]).filter(c=>!c.erasedAt).map(directoryCard);
  if(actor.role==='vendedor'){
    // Ley 1581: el vendedor busca y elige la ficha, pero no recibe el teléfono ni el documento
    // completos de todo el directorio; solo los últimos 4 caracteres. Al cobrar con la ficha,
    // el servidor completa los datos desde el registro.
    business.customerDirectory=business.customerDirectory.map(maskedCard);
    business.mechanics=activeMechanics(business);delete business.cashClosures;
    business.compras=[];
    business.ventas=business.ventas.filter(s=>s.userId===actor.id||!s.userId&&s.usuario===actor.username);
    // Customer/vehicle aggregates are computed only from the seller's own sales.
    Object.assign(business,aggregates(business));delete business.customerRecords;
    const own=new Set(business.ventas.map(s=>s.id));
    business.servs=business.servs.filter(s=>s.userId===actor.id||own.has(s.venta_id)||!s.userId&&s.usuario===actor.username);
    business.movimientos=[];business.auditoria=(business.auditoria||[]).filter(a=>a.userId===actor.id);
    // BE-15/16: el vendedor ve sus propios movimientos de caja y abonos; los separados son de todo el almacén.
    delete business.suppliers;delete business.purchaseOrders;delete business.supplierPayments;
    business.cashMovements=business.cashMovements.filter(m=>m.userId===actor.id);business.creditPayments=business.creditPayments.filter(p=>p.userId===actor.id);
    return {session,revision:business.revision,tickets:visibleTickets(state,actor),draftVersion:readDraft(state,actor).version,state:removeCosts(business)};
  }
  Object.assign(business,aggregates(business));
  business.payableAccounts=payableAccounts(business,dateBogota(now));
  return {session,revision:business.revision,tickets:visibleTickets(state,actor),draftVersion:readDraft(state,actor).version,state:business};
}
// BE-29: versión (ETag) del sobre de /api/v2/data para la recarga periódica. Se calcula sin
// armar el sobre, con todo lo que lo determina para ESTE usuario: identidad, rol, empresa y su
// estado público, contenido del negocio, tickets visibles, soporte activo, versión del borrador,
// día de Bogotá y la configuración del servidor. Así el 304 depende solo de los datos de la
// propia empresa (un cambio en otra empresa no obliga a descargar todo de nuevo) y, como el rol
// y el usuario forman parte de la versión, la copia de un vendedor nunca valida la de un
// administrador ni la de otra empresa. El contenido del negocio se resume una vez por objeto:
// el estado en caché es inmutable y cada escritura produce objetos nuevos. Para el propietario
// (que ve toda la plataforma) la versión es la identidad del estado guardado.
const BOOT_TAG=id(),contentTags=new WeakMap(),stateTags=new WeakMap();
async function contentTag(object){let tag=contentTags.get(object);if(!tag){tag=await hash(JSON.stringify(object));contentTags.set(object,tag);}return tag;}
function stateTag(state){let tag=stateTags.get(state);if(!tag){tag=id();stateTags.set(state,tag);}return tag;}
async function dataTag(state,actor,now,{baseUrl,mailEnabled,requireOwnerTwoFactor}){
  const {company,...who}=actor,parts=[BOOT_TAG,TERMS_VERSION,baseUrl||'',!!mailEnabled,!!requireOwnerTwoFactor,dateBogota(now),who,company?[await contentTag(company),companyStatus(company,now)]:null,state.ownerContact??null];
  if(actor.role==='owner'&&!actor.support)parts.push('owner',stateTag(state));
  else{const business=state.businesses[actor.companyId];parts.push('company',business?await contentTag(business):'empty',visibleTickets(state,actor),activeSupport(state,actor.companyId,now),state.saleDrafts?.[draftKey(actor)]?.version??0);}
  return 'W/"'+(await hash(JSON.stringify(parts))).replace(/[+/=]/g,c=>({'+':'-','/':'_','=':''})[c]).slice(0,32)+'"';
}
const tagMatches=(header,tag)=>typeof header==='string'&&header.length<=2000&&header.split(',').some(value=>value.trim()===tag);
// BE-28: búsqueda paginada (GET /api/v2/search/{products|sales|customers}?q=&offset=&limit=).
// Mismas reglas del sobre: el vendedor ve solo sus ventas, productos sin costos y clientes con
// teléfono y documento enmascarados; nadie recibe secretos de comprobantes.
const lightProduct=p=>{const next={...p};if(typeof next.foto==='string'&&next.foto.startsWith('data:')){delete next.foto;next.hasPhoto=true;}return next;};
function searchBusiness(state,actor,kind,params){
  if(!actor.companyId)fail('La búsqueda requiere entrar a una empresa.',403,'FORBIDDEN');
  const business=state.businesses[actor.companyId]||estadoVacio(),seller=actor.role==='vendedor';
  let result;
  if(kind==='products'){result=searchProducts(business.prods||[],params);result.items=result.items.map(p=>{const light=lightProduct(p);return seller?removeCosts(light):structuredClone(light);});}
  else if(kind==='sales'){
    const own=s=>s.userId===actor.id||!s.userId&&s.usuario===actor.username;
    result=searchSales(business.ventas||[],params,seller?{key:actor.id+'|'+actor.username,visible:own}:{});
    result.items=result.items.map(s=>{const sale=seller?removeCosts(s):structuredClone(s);dropReceiptSecret(sale);delete sale.receiptHash;return sale;});
  }else result=searchCustomers(business.customerRecords||[],params,seller?{key:'masked',card:c=>maskedCard(directoryCard(c))}:{card:directoryCard});
  return {...result,revision:business.revision};
}
function uniqueUser(state,companyId,username,exceptId) {if(state.users.some(u=>u.companyId===companyId&&norm(u.username)===norm(username)&&u.id!==exceptId))fail('Ese usuario ya existe en esta empresa');}
function companyForm(state,form,old,now) {
  const name=text(form.name??old?.name,'Nombre de empresa',100);
  if(norm(name)===norm(state.ownerCompany)||state.companies.some(c=>c.id!==old?.id&&(norm(c.name)===norm(name)||norm(c.slug)===norm(name))))fail('Ya existe una empresa con ese nombre');
  const email=optionalText(form.email??old?.email,254);if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Correo inválido');
  const fields={name,contact:optionalText(form.contact??old?.contact),nit:optionalText(form.nit??old?.nit,60),address:optionalText(form.address??old?.address,300),email,whatsapp:phone(form.whatsapp??old?.whatsapp),logo:image(form.logo??old?.logo,[old?.logo].filter(Boolean)),...period({startDate:form.startDate??old?.startDate,endDate:form.endDate??old?.endDate}),monthlyFee:moneyAmount(form.monthlyFee??old?.monthlyFee??0,'Mensualidad')};
  if(old)return {...old,...fields};
  const base=companySlug(name),reserved=new Set([norm(state.ownerCompany),companySlug(state.ownerCompany)]);let slug=base;while(reserved.has(norm(slug))||state.companies.some(c=>c.slug===slug||norm(c.name)===slug))slug=base+'-'+id().slice(0,6);
  return {id:id(),slug,...fields,enabled:true,createdAt:iso(now)};
}
const DOCUMENT_KEYS=DOCUMENT_TYPES.map(([key])=>key),CUSTOMER_TYPE_KEYS=CUSTOMER_TYPES.map(([key])=>key);
// BE-19: optional identity fields of a customer card. Empty strings mean "clear" on updates.
function customerFields(form){
  const result={};
  if(Object.hasOwn(form,'numeroDocumento')||Object.hasOwn(form,'tipoDocumento')){
    const numero=optionalText(form.numeroDocumento,40).toUpperCase().replace(/[\s.]/g,'');
    if(numero){
      if(!/^[A-Z0-9-]{3,20}$/.test(numero))fail('Número de documento inválido: usa de 3 a 20 letras, números o guiones.');
      const tipo=form.tipoDocumento||'CC';if(!DOCUMENT_KEYS.includes(tipo))fail('Tipo de documento inválido: usa CC, NIT, CE o PAS.');
      result.tipoDocumento=tipo;result.numeroDocumento=numero;
    }else{result.tipoDocumento='';result.numeroDocumento='';}
  }
  if(Object.hasOwn(form,'correo')){const correo=optionalText(form.correo,254).toLowerCase();if(correo&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo))fail('Correo del cliente inválido');result.correo=correo;}
  const key=Object.hasOwn(form,'tipoCliente')?'tipoCliente':Object.hasOwn(form,'tipo')?'tipo':null;
  if(key&&form[key]!==''&&form[key]!=null){if(!CUSTOMER_TYPE_KEYS.includes(form[key]))fail('Tipo de cliente inválido: usa mostrador, mecánico o mayorista.');result.tipo=form[key];}
  return result;
}
const customerSnapshot=record=>Object.fromEntries(['nombre','telefono','tipoDocumento','numeroDocumento','correo','tipo'].filter(key=>record[key]!=null&&record[key]!=='').map(key=>[key,record[key]]));
function customerFor(business,form,actor) {
  const registry=business.customerRecords??=[],extra=customerFields(form),doc=extra.numeroDocumento||'',isAdmin=admin(actor);
  const nombre=optionalText(form.cliente)||'Cliente general',telefono=phone(form.telefono);
  let c=null;
  if(form.customerId!=null&&form.customerId!==''){
    // A card selected in Nueva venta (BE-19).
    if(typeof form.customerId!=='string'||form.customerId.length>100)fail('Cliente inválido');
    c=registry.find(r=>r.id===form.customerId&&!r.erasedAt);
    if(!c)fail('El cliente seleccionado ya no existe. Búscalo de nuevo.',404,'CUSTOMER_NOT_FOUND');
    if(nombre!=='Cliente general'&&isAdmin)c.nombre=nombre;
  }else{
    if(nombre==='Cliente general'&&!telefono&&!doc){if(extra.tipo&&extra.tipo!=='mostrador')fail('Escribe el nombre del cliente para asignarle una lista de precios.');return {cliente:nombre,telefono,customerId:null,tipo:'mostrador',tipoDocumento:'',numeroDocumento:'',record:null};}
    if(nombre==='Cliente general'&&doc)fail('Escribe el nombre del cliente para guardar su documento.');
    c=(doc&&registry.find(r=>!r.erasedAt&&r.numeroDocumento===doc))||registry.find(r=>!r.erasedAt&&(telefono?r.telefono===telefono:norm(r.nombre)===norm(nombre)&&!r.telefono&&(!doc||!r.numeroDocumento)));
    if(!c){c={id:id(),nombre,telefono};registry.push(c);}
    // Only an administrator renames the shared customer record; a seller's sale keeps its own name snapshot.
    else if(nombre!=='Cliente general'&&isAdmin)c.nombre=nombre;
  }
  // Missing data is completed by anyone; an existing value is changed only by an administrator.
  if(telefono&&telefono!==c.telefono&&(!c.telefono||isAdmin)){if(registry.some(r=>r!==c&&!r.erasedAt&&r.telefono===telefono))fail('Ya existe otro cliente con ese teléfono');c.telefono=telefono;}
  if(doc&&doc!==c.numeroDocumento&&(!c.numeroDocumento||isAdmin)){if(registry.some(r=>r!==c&&!r.erasedAt&&r.numeroDocumento===doc))fail('Ya existe otro cliente con ese documento');c.tipoDocumento=extra.tipoDocumento;c.numeroDocumento=doc;}
  if(extra.correo&&extra.correo!==c.correo&&(!c.correo||isAdmin))c.correo=extra.correo;
  if(extra.tipo&&extra.tipo!==customerType(c.tipo)){
    // BE-36: the price list of a customer lowers prices, so only an administrator assigns it.
    if(!isAdmin)fail('Solo el administrador asigna la lista de precios del cliente.',403,'FORBIDDEN');
    if(extra.tipo==='mostrador')delete c.tipo;else c.tipo=extra.tipo;
  }
  // The price list applies when the card was selected (customerId) or assigned by an administrator;
  // a customer recognised only by phone or document keeps counter prices.
  const explicit=form.customerId!=null&&form.customerId!==''||isAdmin&&!!extra.tipo;
  return {cliente:nombre!=='Cliente general'?nombre:c.nombre,telefono:c.telefono||'',customerId:c.id,tipo:explicit?customerType(c.tipo):'mostrador',tipoDocumento:c.tipoDocumento||'',numeroDocumento:c.numeroDocumento||'',record:c};
}
// The server owns the sale date: sellers always register "today" (Bogotá) and an
// administrator may backdate only to a day without a confirmed cash closure.
function saleDate(business,actor,requested,now) {
  const today=dateBogota(now),closed=day=>(business.cashClosures||[]).some(c=>c.date===day);
  // Una venta en un día ya cerrado no entraría en ningún cierre: la misma fecha no se cierra dos veces.
  if(!requested||requested===today||actor.role==='vendedor'){
    if(closed(today))fail('La caja de hoy ya está cerrada. Registra la venta mañana o consulta al administrador.',409,'CASH_ALREADY_CLOSED');
    return today;
  }
  const fecha=date(requested,'Fecha de venta');
  if(fecha>today)fail('La fecha de venta no puede ser posterior a hoy');
  if((business.cashClosures||[]).some(c=>c.date===fecha))fail('La caja de esa fecha ya está cerrada; registra la venta con la fecha de hoy.',409,'CASH_ALREADY_CLOSED');
  return fecha;
}
function validatePlate(v) {const plate=optionalText(v,12).toUpperCase().replace(/[\s-]/g,'');if(plate&&!/^[A-Z0-9]{3,10}$/.test(plate))fail('Placa inválida');return plate;}
function businessContext(state, actor) {if(!actor.companyId)fail('Ingresa como soporte para operar en una empresa',403,'FORBIDDEN');return state.businesses[actor.companyId];}
// Removes every record of one company (shared by company.delete and company.purge).
function removeCompany(state,company){
  const ids=new Set(state.users.filter(u=>u.companyId===company.id).map(u=>u.id));
  state.companies=state.companies.filter(c=>c.id!==company.id);state.users=state.users.filter(u=>!ids.has(u.id));delete state.businesses[company.id];for(const key of Object.keys(state.saleDrafts||{}))if(JSON.parse(key)[0]===company.id)delete state.saleDrafts[key];state.payments=state.payments.filter(p=>p.companyId!==company.id);state.supportTickets=(state.supportTickets||[]).filter(t=>t.companyId!==company.id);
  for(const [key,s]of Object.entries(state.sessions))if(ids.has(s.userId)||s.support?.companyId===company.id)delete state.sessions[key];
  for(const [key,r]of Object.entries(state.receipts))if(r.companyId===company.id)delete state.receipts[key];
  for(const userId of ids)delete state.passwordFailures?.[userId];
}
const revokeReceipts=(state,companyId,saleId)=>{for(const [key,ref]of Object.entries(state.receipts))if(ref.companyId===companyId&&ref.saleId===saleId)delete state.receipts[key];};
// SEG-03: only the hash is stored (state.receipts + sale.receiptHash); the clear link is
// returned once, in the action response (receiptLink) and injected into that response's sale.
async function issueReceipt(state,companyId,sale,now,baseUrl){
  revokeReceipts(state,companyId,sale.id);dropReceiptSecret(sale);
  const value=token(),key=await hash(value),expires=stamp(now).getTime()+RECEIPT_MS;
  sale.receiptHash=key;sale.receiptExpiresAt=new Date(expires).toISOString();state.receipts[key]={companyId,saleId:sale.id,expires};
  return {saleId:sale.id,token:value,url:new URL('/receipt/'+value,baseUrl||'https://scorta.example').href,expiresAt:sale.receiptExpiresAt};
}
// BE-09 (Ley 1581, consulta): todo lo que el almacén guarda de un cliente final, sin costos
// internos ni enlaces/hashes de comprobantes.
export function customerDataExport(business,record,company,now){
  const id=record.id,sales=(business.ventas||[]).filter(s=>s.customerId===id),saleIds=new Set(sales.map(s=>s.id));
  const clean=list=>removeCosts(structuredClone(list)).map(doc=>{dropReceiptSecret(doc);delete doc.receiptHash;delete doc.receiptExpiresAt;return doc;});
  const {consentAt,consentBy,consentMedium,...ficha}=structuredClone(record);
  return {format:'scorta-customer-data',version:1,exportedAt:iso(now),
    responsable:{empresa:company.name,nit:company.nit||'',direccion:company.address||'',correo:company.email||'',whatsapp:company.whatsapp||''},
    cliente:ficha,
    autorizacionDatos:consentAt?{fecha:consentAt,registradaPor:consentBy||'',medio:consentMedium||''}:null,
    autorizacionesEnVentas:sales.filter(s=>s.dataConsent).map(s=>({venta:s.id,fecha:s.fecha,...structuredClone(s.dataConsent)})),
    ventas:clean(sales),
    servicios:clean((business.servs||[]).filter(s=>s.customerId===id||saleIds.has(s.venta_id))),
    credito:{cuenta:structuredClone(creditAccounts(business,dateBogota(now)).find(a=>a.customerId===id)||null),abonos:clean((business.creditPayments||[]).filter(p=>p.customerId===id))},
    separados:clean((business.layaways||[]).filter(l=>l.customerId===id)),
    cotizaciones:clean((business.quotes||[]).filter(q=>q.customerId===id)),
    garantias:clean((business.warranties||[]).filter(w=>w.customerId===id||saleIds.has(w.saleId))),
    historial:structuredClone((business.auditoria||[]).filter(e=>e.documento===id||saleIds.has(e.documento)))};
}
// BE-08: full company export without password hashes, TOTP secrets, sessions or receipt hashes.
export function exportCompany(state,companyId,now){
  const company=companyFor(state,companyId),business=structuredClone(state.businesses[companyId]||estadoVacio());
  for(const sale of business.ventas||[]){dropReceiptSecret(sale);delete sale.receiptHash;}
  for(const product of business.prods||[])if(isMediaRef(product.foto))product.foto=mediaUrl(product.foto);
  return {format:'scorta-company-export',version:1,exportedAt:iso(now),termsVersion:TERMS_VERSION,company:{...structuredClone(company),logo:clientImage(company.logo)},
    users:state.users.filter(u=>u.companyId===companyId).map(u=>structuredClone(publicUser(u))),business,
    payments:structuredClone(state.payments.filter(p=>p.companyId===companyId)),supportTickets:structuredClone((state.supportTickets||[]).filter(t=>t.companyId===companyId)),
    saleDrafts:Object.entries(state.saleDrafts||{}).filter(([key])=>JSON.parse(key)[0]===companyId).map(([,value])=>structuredClone(value)),
    audit:structuredClone(state.audit.filter(entry=>entry.companyId===companyId))};
}
// BE-17: sale.create y quote.convert registran la venta con el mismo código.
async function createSale(state,actor,a,now,baseUrl,options,extra){
    const form=a.form||{};
    assertDraftSale(state,actor,a);
    if(!Array.isArray(a.items||[])||!Array.isArray(a.labor||[])||(a.items||[]).length>1000||(a.labor||[]).length>100)fail('Lista de artículos o servicios inválida');
    const b=businessContext(state,actor),items=structuredClone(a.items||[]),labor=(a.labor||[]).map(line=>({...mechanicForLabor(b,line),descripcion:text(line?.descripcion,'Trabajo realizado',3000),importe:moneyAmount(line?.importe,'Mano de obra')}));
    if(!items.length&&!labor.length)fail('Agrega productos o mano de obra');
    const fecha=saleDate(b,actor,form.fecha,now),placa=validatePlate(form.placa);if(labor.length&&!placa)fail('Ingresa la placa para registrar el servicio');
    const splitPayments=Array.isArray(form.payments)&&form.payments.length>0;
    if(form.payments!=null&&!Array.isArray(form.payments))fail('Pagos inválidos');
    if(!splitPayments&&![...PAYMENT_KEYS,CREDIT_METHOD,FAVOR_METHOD].includes(form.paymentMethod))fail('Selecciona efectivo, transferencia, tarjeta, Nequi o Daviplata');
    const seller=actor.role==='vendedor',settings=saleSettings(b),customer=customerFor(b,form,actor);
    // BE-04/BE-36: every line is priced from the customer's list. A seller cannot change that
    // price; a lower price is a discount limited by the company cap. Legacy clients send only
    // the net precio_unitario; new clients send precio (before discount) and descuento.
    const {lines,priced}=priceSaleItems(b.prods,items,{tipo:customer.tipo,settings,seller,saleDiscount:form.descuento});
    const saleItems=lines.map((l,index)=>({producto_id:l.product.id,cantidad:l.sent.cantidad,precio_unitario:priced.lines[index].precio_unitario}));
    const base=structuredClone(b);let next,sale;
    if(items.length){
      next=aplicarCambio(base,{kind:'venta',revision:base.revision,form:{fecha,cliente:customer.cliente},items:saleItems},actor.label,stamp(now).getTime());sale=next.ventas[0];
      sale.detalles.forEach((detail,index)=>{const l=lines[index];detail.precio_lista=l.lista;if(l.precio!==l.lista)detail.precio_modificado=l.precio;detail.descuento=priced.lines[index].descuento;const rate=productVatRate(l.product,settings);if(rate!=null)detail.tarifa_iva=rate;});
    }
    else{next=base;next.revision++;sale={id:id(),fecha,usuario:actor.label,detalles:[],total:0};next.ventas.unshift(sale);businessAudit(next,actor,'venta',{documento:sale.id},now);}
    const subtotal_productos=sale.total,subtotal_mano_obra=sumMoney(labor.map(l=>l.importe)),total=sumMoney([subtotal_productos,subtotal_mano_obra]);
    // FE-06: split payment; paymentMethod stays as the main method (largest amount).
    const payments=splitPayments?normalizePayments(form.payments,total,{allow:[CREDIT_METHOD,FAVOR_METHOD]}):[{method:form.paymentMethod,amount:total}];
    // BE-16: crédito (fiado) y saldo a favor, solo con la ficha del cliente seleccionada.
    let overLimit=null;
    const creditAmount=sumMoney(payments.filter(p=>p.method===CREDIT_METHOD).map(p=>p.amount)),favorAmount=sumMoney(payments.filter(p=>p.method===FAVOR_METHOD).map(p=>p.amount));
    // BE-37: la venta a crédito es una función opcional del plan.
    if(creditAmount>0)assertFeature(companyFor(state,actor.companyId),'credito');
    if(creditAmount>0||favorAmount>0){
      const card=form.customerId&&next.customerRecords?.find(c=>c.id===customer.customerId&&!c.erasedAt);
      if(!card)fail('Selecciona la ficha del cliente para vender a crédito o usar su saldo a favor.',400,'CUSTOMER_REQUIRED');
      if(favorAmount>0){if(favorAmount>(Number(card.saldoAFavor)||0))fail('El saldo a favor del cliente es '+(Number(card.saldoAFavor)||0)+'.',400,'FAVOR_INSUFFICIENT');card.saldoAFavor=roundMoney((Number(card.saldoAFavor)||0)-favorAmount)}
      if(creditAmount>0){
        const check=creditCheck(next,card,creditAmount);
        if(check.exceeds){
          const message='La venta a crédito supera el cupo de '+card.nombre+': cupo '+check.limit+', saldo actual '+check.used+', nuevo saldo '+check.next+'.';
          if(seller)fail(message+' Pide al administrador que la autorice.',403,'CREDIT_LIMIT');
          extra.warning=message;overLimit={documento:sale.id,antes:{cupo:check.limit,saldo:check.used},despues:{saldo:check.next}};
        }
        sale.credito={monto:creditAmount,saldo:creditAmount,pagado:0,...creditTerms(next,card,fecha)};
      }
    }
    Object.assign(sale,{cliente:customer.cliente,telefono:customer.telefono,customerId:customer.customerId},{userId:actor.id,placa,labor,subtotal_productos,subtotal_mano_obra,paymentMethod:primaryMethod(payments),payments,total});
    if(customer.numeroDocumento){sale.tipoDocumento=customer.tipoDocumento;sale.numeroDocumento=customer.numeroDocumento;}
    if(customer.tipo!=='mostrador')sale.tipoCliente=customer.tipo;
    if(priced.descuentos>0){sale.descuentos=priced.descuentos;if(priced.descuentoTotal>0)sale.descuento_total=priced.descuentoTotal;}
    const cash=sumMoney(payments.filter(p=>p.method==='efectivo').map(p=>p.amount));
    if(cash>0&&form.efectivo_recibido!=null&&String(form.efectivo_recibido).trim()!==''){
      const received=moneyAmount(form.efectivo_recibido,'Efectivo recibido');
      if(received<cash)fail('El efectivo recibido es menor que el valor a pagar en efectivo.');
      sale.efectivo_recibido=received;sale.vueltas=roundMoney(received-cash);
    }
    // BE-18: VAT breakdown with the prices (VAT included) actually charged.
    if(settings.vat.enabled){sale.iva={incluido:true,preciosCatalogoConIva:settings.vat.pricesIncludeVat,tarifa_mano_obra:settings.vat.defaultRate};const vat=saleVat(sale);sale.iva.tarifas=vat.rows;sale.iva.total=vat.iva;}
    // BE-05 (Ley 1581): phone or plate of a customer without prior consent needs dataConsent.
    const record=customer.customerId?next.customerRecords?.find(c=>c.id===customer.customerId):null,personal=!!(customer.telefono||placa||customer.numeroDocumento);
    if(personal&&form.dataConsent!==true&&!record?.consentAt&&options.requireDataConsent)fail('Confirma que el cliente autorizó el tratamiento de sus datos (teléfono o placa).',400,'DATA_CONSENT_REQUIRED');
    if(personal&&form.dataConsent===true){const consent={consentAt:iso(now),consentBy:actor.label,consentMedium:optionalText(form.consentMedium,60)||'verbal'};sale.dataConsent=consent;if(record&&!record.consentAt)Object.assign(record,consent);}
    extra.receiptLink=await issueReceipt(state,actor.companyId,sale,now,baseUrl);
    if(labor.length)next.servs.unshift({id:id(),venta_id:sale.id,fecha,usuario:actor.label,userId:actor.id,cliente:customer.cliente,telefono:customer.telefono,customerId:customer.customerId,...(customer.numeroDocumento?{tipoDocumento:customer.tipoDocumento,numeroDocumento:customer.numeroDocumento}:{}),placa,labor:structuredClone(labor),descripcion_trabajo:labor.map(l=>l.descripcion).join('; '),mecanico:labor.map(l=>l.mecanico).join(', '),costo_mano_obra:subtotal_mano_obra,subtotal_productos,subtotal_mano_obra,total:sale.total,detalles:structuredClone(sale.detalles),estado:'completado',paymentMethod:sale.paymentMethod,payments:structuredClone(payments)});
    const log=next.auditoria?.[0];if(log){log.userId=actor.id;log.motivo=actor.support?.reason||'';log.despues={total:sale.total,placa,cliente:sale.cliente};}
    if(overLimit)businessAudit(next,actor,'credito_sobre_cupo',overLimit,now);
    // BE-04: every discount or administrator price change leaves its own audit entry.
    if(priced.descuentos>0||lines.some(l=>l.precio!==l.lista))businessAudit(next,actor,'descuento_venta',{documento:sale.id,
      antes:{lineas:lines.map(l=>({nombre:l.product.nombre,cantidad:Number(l.sent.cantidad),precio_lista:l.lista}))},
      despues:{lineas:lines.map((l,index)=>({nombre:l.product.nombre,cantidad:Number(l.sent.cantidad),precio:l.precio,descuento:priced.lines[index].descuento,precio_unitario:priced.lines[index].precio_unitario})),descuento_total:priced.descuentoTotal,descuentos:priced.descuentos,total:sale.total}},now);
    state.businesses[actor.companyId]=next;
    finishDraftSale(state,actor,a,sale.id,stamp(now).getTime());
    return sale;
}
async function applyAction(state,actor,session,a,now,baseUrl,options={}) {
  const form=a.form||{},extra={};let company,documentId,auditExtra={};
  if(a.type.startsWith('company.')||a.type.startsWith('user.')||a.type.startsWith('sessions.')||a.type.startsWith('twofa.'))owner(actor);
  if(a.type.startsWith('company.')&&a.type!=='company.create')company=companyFor(state,a.companyId);
  const before=a.companyId?structuredClone(state.companies.find(c=>c.id===a.companyId)):null;
  if(a.type.startsWith('mechanic.')||a.type==='cash.close'){
    const business=businessContext(state,actor),result=applyAdminControl(business,actor,a,{now:stamp(now).getTime(),today:dateBogota(now)});documentId=result.id;
    businessAudit(business,actor,a.type,{documento:result.id,antes:result.before,despues:result.after},now);
  }else if(a.type.startsWith('cash.')||a.type.startsWith('credit.')||a.type.startsWith('layaway.')){
    // BE-15 / BE-16 / BE-34: caja, abonos de cartera y separados (reglas en caja-credito.mjs).
    const business=businessContext(state,actor),result=applyCashCreditAction(business,actor,a,{now:stamp(now).getTime(),today:dateBogota(now),requireDataConsent:!!options.requireDataConsent});
    documentId=result.id;extra.document=result.document;
    if(result.sale)extra.receiptLink=await issueReceipt(state,actor.companyId,result.sale,now,baseUrl);
    businessAudit(business,actor,result.auditAction||a.type,{documento:result.id,antes:result.before,despues:result.after,...(result.motivo?{motivo:result.motivo}:{})},now);
  }else if(a.type.startsWith('quote.')){
    // BE-17: cotizaciones (reglas en cotizaciones.mjs). La conversión usa la venta común.
    const b=businessContext(state,actor),today=dateBogota(now);
    if(a.type!=='quote.cancel')assertFeature(companyFor(state,actor.companyId),'cotizaciones');
    if(a.type==='quote.convert'){
      const prepared=prepareQuoteConversion(b,actor,a.id??form.id,form,{today});
      const sale=await createSale(state,actor,prepared.action,now,baseUrl,options,extra);
      const next=state.businesses[actor.companyId],marked=markQuoteConverted(next,prepared.quote.id,sale,actor,stamp(now),prepared.changes);
      if(prepared.changes.length)extra.warning=[extra.warning,'La venta se registró con los precios actuales: el total pasó de '+prepared.quote.total+' a '+sale.total+'.'].filter(Boolean).join(' ');
      documentId=prepared.quote.id;extra.document={kind:'venta',id:sale.id,quoteId:prepared.quote.id};
      businessAudit(next,actor,'cotizacion_convertida',{documento:prepared.quote.id,antes:marked.before,despues:marked.after},now);
    }else{
      const result=applyQuoteAction(b,actor,a,{now:stamp(now).getTime(),today,requireDataConsent:!!options.requireDataConsent});
      documentId=result.id;extra.document=result.document;
      businessAudit(b,actor,result.auditAction,{documento:result.id,antes:result.before,despues:result.after,...(result.motivo?{motivo:result.motivo}:{})},now);
    }
  }else if(a.type.startsWith('warranty.')){
    // BE-35: garantías y reclamos al proveedor (reglas en garantias.mjs).
    const b=businessContext(state,actor);
    if(a.type==='warranty.create')assertFeature(companyFor(state,actor.companyId),'garantias');
    const result=applyWarrantyAction(b,actor,a,{now:stamp(now).getTime(),today:dateBogota(now)});
    documentId=result.id;extra.document=result.document;if(result.warning)extra.warning=result.warning;
    businessAudit(b,actor,result.auditAction,{documento:result.id,antes:result.before,despues:result.after},now);
  }else if(a.type.startsWith('supplier.')||a.type.startsWith('po.')||a.type.startsWith('payable.')){
    // BE-40: proveedores, órdenes de compra y cuentas por pagar (reglas en compras-proveedores.mjs).
    const b=businessContext(state,actor);
    if(a.type==='po.create')assertFeature(companyFor(state,actor.companyId),'ordenes_compra');
    const result=applyPurchasingAction(b,actor,a,{now:stamp(now).getTime(),today:dateBogota(now)});
    const target=result.business||b;if(result.business)state.businesses[actor.companyId]=result.business;
    documentId=result.id;extra.document=result.document;
    businessAudit(target,actor,result.auditAction,{documento:result.id,antes:result.before,despues:result.after,...(result.motivo?{motivo:result.motivo}:{})},now);
  }else if(a.type==='company.plan'){
    // BE-37: el propietario define límites y funciones del plan de la empresa.
    const previous=companyPlan(company),plan=cleanPlan(form.plan??form);company.plan=plan;
    const b=state.businesses[company.id];
    if(b){
      if(!plan.features.includes('iva')&&b.settings?.vat?.enabled)b.settings={...b.settings,vat:{...b.settings.vat,enabled:false}};
      b.revision++;businessAudit(b,{...actor,label:actor.username},'plan_actualizado',{documento:company.id,antes:previous,despues:plan},now);
    }
    auditExtra={plan:{antes:previous,despues:plan}};
  }else if(a.type.startsWith('ticket.')){
    const ticket=applyTicketAction(state,actor,a,iso(now));company=companyFor(state,ticket.companyId);documentId=ticket.id;
  }else if(a.type==='company.create'){
    company=companyForm(state,form,null,now);uniqueUser(state,company.id,form.username);
    const user=await makeUser({username:form.username,password:form.password,name:form.adminName||form.username,email:form.adminEmail},company.id,'admin',now);
    if(form.plan!=null)company.plan=cleanPlan(form.plan);
    state.companies.push(company);state.users.push(user);state.businesses[company.id]=estadoVacio();
  }else if(a.type==='catalog.update'){
    if(!admin(actor))fail('Solo el administrador puede configurar el catálogo',403,'FORBIDDEN');
    const companyId=actor.role==='owner'&&!actor.support?a.companyId:actor.companyId;
    if(a.companyId&&a.companyId!==companyId)fail('No puedes configurar otra empresa',403,'FORBIDDEN');
    company=companyFor(state,companyId);company.catalog=cleanCatalog(form,company.catalog);
    if(Object.hasOwn(form,'whatsapp'))company.whatsapp=phone(form.whatsapp);
    if(company.catalog.enabled&&!whatsappNumber(company.whatsapp))fail('Registra un WhatsApp con indicativo del país antes de publicar.');
    if(actor.companyId)state.businesses[companyId].revision++;
    auditExtra={catalog:company.catalog};
  }else if(a.type==='company.update'){
    const next=companyForm(state,form,company,now);if(form.plan!=null)next.plan=cleanPlan(form.plan);state.companies[state.companies.indexOf(company)]=next;company=next;
  }else if(a.type==='company.access'){
    if(typeof form.enabled!=='boolean')fail('Indica si habilitas o suspendes la empresa');company.enabled=form.enabled;
  }else if(a.type==='company.delete'){
    if(form.confirmation!==company.name)fail('Escribe el nombre exacto de la empresa para confirmar la eliminación');
    removeCompany(state,company);
  }else if(a.type==='company.export'){
    company.exportedAt=iso(now);extra.export=exportCompany(state,company.id,now);
  }else if(a.type==='company.purge'){
    // BE-09: verifiable deletion at contract end. Requires a prior export; the global
    // audit keeps a certificate with counts only (no customer data).
    if(!company.exportedAt)fail('Exporta los datos de la empresa antes de borrarlos definitivamente.',409,'EXPORT_REQUIRED');
    if(form.confirmation!==company.name)fail('Escribe el nombre exacto de la empresa para confirmar el borrado');
    const b=state.businesses[company.id]||{},counts={usuarios:state.users.filter(u=>u.companyId===company.id).length,productos:(b.prods||[]).length,ventas:(b.ventas||[]).length,compras:(b.compras||[]).length,servicios:(b.servs||[]).length,clientes:(b.customerRecords||[]).length,movimientos:(b.movimientos||[]).length,pagos:state.payments.filter(p=>p.companyId===company.id).length,tickets:(state.supportTickets||[]).filter(t=>t.companyId===company.id).length,cotizaciones:(b.quotes||[]).length,garantias:(b.warranties||[]).length,ordenesCompra:(b.purchaseOrders||[]).length,proveedores:(b.suppliers||[]).length};
    removeCompany(state,company);
    auditExtra={certificado:{empresa:company.name,companyId:company.id,exportadoEn:company.exportedAt,borradoEn:iso(now),borradoPor:actor.username,conteos:counts}};
  }else if(a.type==='sessions.revoke'){
    // BE-12: scope 'all' or one company; the caller's own session always survives.
    const scope=a.scope??form.scope,target=scope==='all'?null:a.companyId??form.companyId??scope?.companyId;
    if(scope!=='all'&&!target)fail('Indica la empresa o "all" para revocar sesiones');
    if(target)company=companyFor(state,target);
    const ids=target?new Set(state.users.filter(u=>u.companyId===target).map(u=>u.id)):null;let revoked=0;
    for(const [key,s]of Object.entries(state.sessions))if(s!==session&&(!ids||ids.has(s.userId)||s.support?.companyId===target)){delete state.sessions[key];revoked++;}
    auditExtra={alcance:target?'empresa':'all',revocadas:revoked};extra.revoked=revoked;
  }else if(a.type==='twofa.setup'){
    const user=state.users.find(u=>u.id===actor.id);if(user.totp?.enabled)fail('La verificación en dos pasos ya está activa. Desactívala antes de generar otro secreto.',409,'TOTP_ALREADY_ENABLED');
    const secret=generateTotpSecret();user.totp={enabled:false,pendingSecret:secret,pendingAt:iso(now)};
    extra.twoFactorSetup={secret,uri:otpauthUri(secret,state.ownerCompany+':'+user.username)};
  }else if(a.type==='twofa.enable'){
    const user=state.users.find(u=>u.id===actor.id);if(!user.totp?.pendingSecret)fail('Primero genera el secreto de verificación en dos pasos.',409,'TOTP_SETUP_REQUIRED');
    const counter=await verifyTotp(user.totp.pendingSecret,form.code,stamp(now).getTime());if(counter===null)fail('El código de verificación no es correcto.',400,'TOTP_INVALID');
    user.totp={enabled:true,secret:user.totp.pendingSecret,lastCounter:counter,enabledAt:iso(now)};
  }else if(a.type==='twofa.disable'){
    const user=state.users.find(u=>u.id===actor.id);if(!user.totp?.enabled)fail('La verificación en dos pasos no está activa.',409,'TOTP_NOT_ENABLED');
    if(!await verifyPassword(user,form.password))fail('La contraseña no es correcta.',400,'INVALID_CREDENTIALS');
    if(await verifyTotp(user.totp.secret,form.code,stamp(now).getTime(),{after:user.totp.lastCounter??-1})===null)fail('El código de verificación no es correcto.',400,'TOTP_INVALID');
    delete user.totp;
  }else if(a.type==='profile.email.update'){
    // SEG-13: cada usuario registra su propio correo de recuperación confirmando su contraseña.
    const user=state.users.find(u=>u.id===actor.id);
    if(!await verifyPassword(user,form.password))fail('La contraseña no es correcta.',400,'INVALID_CREDENTIALS');
    const email=recoveryEmail(form.email);
    if(email!==user.email){user.email=email;user.emailVerified=false;delete user.emailVerification;dropPasswordResets(state,user.id);}
    auditExtra={correo:maskEmail(email)};
  }else if(a.type==='profile.email.verify.request'){
    if(!options.mailEnabled)fail(MAIL_DISABLED_MESSAGE,503,'MAIL_DISABLED');
    const user=state.users.find(u=>u.id===actor.id),timestamp=stamp(now).getTime();
    if(!user.email)fail('Registra primero un correo de recuperación.',400,'EMAIL_REQUIRED');
    if(user.emailVerified)fail('Tu correo ya está verificado.',409,'EMAIL_ALREADY_VERIFIED');
    const previous=user.emailVerification,windowActive=previous?.windowUntil>timestamp,sends=windowActive?previous.sends:0;
    if(previous&&previous.sentAt+EMAIL_CODE_RESEND_MS>timestamp)fail('Espera un minuto antes de pedir otro código.',429,'RATE_LIMITED');
    if(sends>=EMAIL_CODE_MAX_SENDS)fail('Pediste demasiados códigos. Espera una hora e inténtalo de nuevo.',429,'RATE_LIMITED');
    const code=sixDigitCode();
    user.emailVerification={email:user.email,codeHash:await emailCodeHash(user.id,code),expires:timestamp+EMAIL_CODE_TTL_MS,attempts:0,sentAt:timestamp,sends:sends+1,windowUntil:windowActive?previous.windowUntil:timestamp+EMAIL_CODE_WINDOW_MS};
    extra.outbox=[verificationMail(user,code)];auditExtra={correo:maskEmail(user.email)};
  }else if(a.type==='profile.email.verify.confirm'){
    const user=state.users.find(u=>u.id===actor.id),pending=user.emailVerification,timestamp=stamp(now).getTime();
    if(user.emailVerified)fail('Tu correo ya está verificado.',409,'EMAIL_ALREADY_VERIFIED');
    if(!pending||pending.expires<=timestamp||pending.email!==user.email||pending.attempts>=EMAIL_CODE_MAX_ATTEMPTS)fail('El código venció o ya no es válido. Pide un código nuevo.',400,'EMAIL_CODE_EXPIRED');
    const code=String(form.code??'').replace(/\D/g,'');
    // A wrong code keeps the attempt counter (the request ends here without auditing).
    if(code.length!==6||await emailCodeHash(user.id,code)!==pending.codeHash){pending.attempts++;return {failure:{status:400,error:pending.attempts>=EMAIL_CODE_MAX_ATTEMPTS?'Demasiados intentos. Pide un código nuevo.':'El código no es correcto. Revisa el correo e inténtalo de nuevo.',code:'EMAIL_CODE_INVALID'}};}
    user.emailVerified=true;user.emailVerifiedAt=iso(now);delete user.emailVerification;auditExtra={correo:maskEmail(user.email)};
  }else if(a.type==='terms.accept'){
    // BE-07: accepted by the company administrator (legal representative) only.
    if(actor.role!=='admin'||!actor.companyId)fail('Solo el administrador de la empresa puede aceptar los términos.',403,'FORBIDDEN');
    if(form.version!=null&&form.version!==TERMS_VERSION)fail('Los términos cambiaron. Recarga para leer la versión vigente.',409,'TERMS_VERSION_CHANGED');
    company=companyFor(state,actor.companyId);company.terms={version:TERMS_VERSION,acceptedAt:iso(now),userId:actor.id,username:actor.username,name:actor.name||actor.username};
    auditExtra={version:TERMS_VERSION};
  }else if(a.type==='settings.update'){
    // BE-04/BE-18: per-company sale options (seller discount cap and VAT).
    if(!admin(actor))fail('Solo el administrador configura las opciones de venta',403,'FORBIDDEN');
    const b=businessContext(state,actor),antes={...saleSettings(b),caja:cashSettings(b)},despues=cleanSaleSettings(form,b.settings);
    // BE-15/16/34: tope de gastos del vendedor, plazo de crédito y vencimiento de separados.
    if(form.caja!=null){if(typeof form.caja!=='object'||Array.isArray(form.caja))fail('Opciones de caja inválidas');despues.caja=cleanCashSettings(form.caja,b)}
    // BE-17: vigencia de las cotizaciones. BE-37: el IVA es una función opcional del plan.
    if(form.cotizaciones!=null)despues.cotizaciones=cleanQuoteSettings(form.cotizaciones,b);
    if(despues.vat.enabled)assertFeature(companyFor(state,actor.companyId),'iva');
    b.settings={...(b.settings||{}),...despues};b.revision++;businessAudit(b,actor,'opciones_venta',{documento:'opciones-venta',antes,despues},now);documentId='opciones-venta';
  }else if(a.type==='customer.create'){
    // BE-19: reusable customer card created by the administrator.
    if(!admin(actor))fail('Solo el administrador crea fichas de clientes',403,'FORBIDDEN');
    const b=businessContext(state,actor),registry=b.customerRecords??=[];
    const nombre=text(form.nombre,'Nombre del cliente'),telefono=phone(form.telefono),extra=customerFields(form);
    if(telefono&&registry.some(c=>!c.erasedAt&&c.telefono===telefono))fail('Ya existe un cliente con ese teléfono');
    if(extra.numeroDocumento&&registry.some(c=>!c.erasedAt&&c.numeroDocumento===extra.numeroDocumento))fail('Ya existe un cliente con ese documento');
    const personal=!!(telefono||extra.numeroDocumento||extra.correo),credit=creditFields(form);
    if(credit.creditLimit>0)assertFeature(companyFor(state,actor.companyId),'credito');
    if(personal&&form.dataConsent!==true&&options.requireDataConsent)fail('Confirma que el cliente autorizó el tratamiento de sus datos.',400,'DATA_CONSENT_REQUIRED');
    const record={id:id(),nombre,telefono,...Object.fromEntries(Object.entries(extra).filter(([key,value])=>value&&!(key==='tipo'&&value==='mostrador'))),...(credit.creditLimit>0?{creditLimit:credit.creditLimit}:{}),...(credit.creditDays?{creditDays:credit.creditDays}:{})};
    if(personal&&form.dataConsent===true)Object.assign(record,{consentAt:iso(now),consentBy:actor.label,consentMedium:optionalText(form.consentMedium,60)||'verbal'});
    registry.push(record);b.revision++;businessAudit(b,actor,'cliente_creado',{documento:record.id,despues:{nombre,tipo:customerType(record.tipo),...(record.creditLimit?{cupo:record.creditLimit,plazo:record.creditDays??null}:{})}},now);documentId=record.id;
  }else if(a.type==='customer.update'||a.type==='customer.erase'){
    // BE-09 (Ley 1581): correction and erasure of an end customer on request.
    if(actor.role==='vendedor'||!admin(actor))fail('Solo el administrador puede corregir o borrar datos de clientes',403,'FORBIDDEN');
    const b=businessContext(state,actor),record=(b.customerRecords||[]).find(c=>c.id===a.id);if(!record||record.erasedAt)fail('Cliente inexistente',404,'NOT_FOUND');
    const sales=b.ventas.filter(s=>s.customerId===record.id),saleIds=new Set(sales.map(s=>s.id)),services=b.servs.filter(s=>s.customerId===record.id||saleIds.has(s.venta_id));
    if(a.type==='customer.update'){
      const nombre=Object.hasOwn(form,'nombre')?text(form.nombre,'Nombre del cliente'):record.nombre,telefono=Object.hasOwn(form,'telefono')?phone(form.telefono):record.telefono,extra=customerFields(form);
      if(telefono&&b.customerRecords.some(c=>c.id!==record.id&&c.telefono===telefono))fail('Ya existe otro cliente con ese teléfono');
      if(extra.numeroDocumento&&b.customerRecords.some(c=>c.id!==record.id&&!c.erasedAt&&c.numeroDocumento===extra.numeroDocumento))fail('Ya existe otro cliente con ese documento');
      const antes={nombre:record.nombre,telefono:record.telefono,...customerSnapshot(record)};record.nombre=nombre;record.telefono=telefono;
      // BE-16: cupo y plazo de crédito (solo administrador). Quedan en la auditoría.
      const credit=creditFields(form);
      if(credit.creditLimit>0)assertFeature(companyFor(state,actor.companyId),'credito');
      if(Object.hasOwn(credit,'creditLimit')){antes.cupo=Number(record.creditLimit)||0;if(credit.creditLimit>0)record.creditLimit=credit.creditLimit;else delete record.creditLimit}
      if(Object.hasOwn(credit,'creditDays')){antes.plazo=record.creditDays??null;if(credit.creditDays)record.creditDays=credit.creditDays;else delete record.creditDays}
      for(const key of ['tipoDocumento','numeroDocumento','correo'])if(Object.hasOwn(extra,key)){if(extra[key])record[key]=extra[key];else delete record[key];}
      if(Object.hasOwn(extra,'tipo')){if(extra.tipo==='mostrador')delete record.tipo;else record.tipo=extra.tipo;}
      for(const doc of [...sales,...services]){doc.cliente=nombre;doc.telefono=telefono;if(Object.hasOwn(extra,'numeroDocumento')){if(record.numeroDocumento){doc.tipoDocumento=record.tipoDocumento;doc.numeroDocumento=record.numeroDocumento;}else{delete doc.tipoDocumento;delete doc.numeroDocumento;}}}
      businessAudit(b,actor,'cliente_corregido',{documento:record.id,antes,despues:{nombre,telefono,...customerSnapshot(record),...(Object.hasOwn(antes,'cupo')?{cupo:Number(record.creditLimit)||0}:{}),...(Object.hasOwn(antes,'plazo')?{plazo:record.creditDays??null}:{})}},now);
    }else{
      for(const doc of [...sales,...services]){doc.cliente='Cliente eliminado';doc.telefono='';doc.placa='';delete doc.dataConsent;delete doc.tipoDocumento;delete doc.numeroDocumento;}
      for(const sale of sales){revokeReceipts(state,actor.companyId,sale.id);delete sale.receiptHash;delete sale.receiptExpiresAt;}
      for(const entry of b.auditoria||[])if(saleIds.has(entry.documento)||entry.documento===record.id)for(const side of ['antes','despues'])if(entry[side]&&typeof entry[side]==='object'){for(const key of ['cliente','nombre'])if(Object.hasOwn(entry[side],key))entry[side][key]='Cliente eliminado';for(const key of ['telefono','placa','numeroDocumento','correo','tipoDocumento'])if(Object.hasOwn(entry[side],key))entry[side][key]='';}
      for(const key of Object.keys(record))if(key!=='id')delete record[key];Object.assign(record,{nombre:'Cliente eliminado',telefono:'',erasedAt:iso(now),erasedBy:actor.label});
      businessAudit(b,actor,'cliente_borrado',{documento:record.id,ventas:sales.length,servicios:services.length},now);auditExtra={ventas:sales.length};
    }
    b.revision++;documentId=record.id;
  }else if(a.type==='customer.export'){
    // BE-09 (Ley 1581, consulta): descarga de todo lo guardado de un cliente final; queda auditada.
    if(actor.role==='vendedor'||!admin(actor))fail('Solo el administrador puede descargar los datos de un cliente',403,'FORBIDDEN');
    const b=businessContext(state,actor),record=(b.customerRecords||[]).find(c=>c.id===a.id);if(!record||record.erasedAt)fail('Cliente inexistente',404,'NOT_FOUND');
    extra.customerExport=customerDataExport(b,record,companyFor(state,actor.companyId),now);
    businessAudit(b,actor,'cliente_consultado',{documento:record.id,motivo:actor.support?.reason||optionalText(form.motivo,300)||'Consulta de datos personales (Ley 1581)'},now);
    b.revision++;documentId=record.id;
  }else if(a.type==='company.renew'){
    const proposal=renewalProposal(company,now),next=period({startDate:form.startDate||proposal.startDate,endDate:form.endDate});
    if(next.endDate<=company.endDate)fail('La nueva fecha debe ampliar el vencimiento actual');
    const payment={id:id(),companyId:company.id,date:date(form.date||dateBogota(now),'Fecha de pago'),amount:moneyAmount(form.amount??company.monthlyFee,'Importe'),previousEndDate:company.endDate,...next,username:actor.username};
    company.startDate=next.startDate;company.endDate=next.endDate;state.payments.unshift(payment);
  }else if(a.type==='user.create'){
    const target=companyFor(state,a.companyId);uniqueUser(state,a.companyId,form.username);
    // BE-37: usuarios activos según el plan.
    const activeUsers=state.users.filter(u=>u.companyId===a.companyId&&u.active).length;assertLimit(target,'maxUsers',activeUsers+1,activeUsers);
    if(!['admin','vendedor'].includes(form.role))fail('Rol inválido');state.users.push(await makeUser(form,a.companyId,form.role,now));
  }else if(a.type==='user.update'||a.type==='user.reset'){
    const user=state.users.find(u=>u.id===a.userId&&u.role!=='owner');if(!user)fail('Usuario inexistente',404);
    if(a.type==='user.reset'){user.password=await passwordHash(checkPassword(form.password));user.passwordChangedAt=iso(now);user.version++;user.mustChangePassword=true;}
    else{const role=form.role??user.role,active=form.active??user.active;if(!['admin','vendedor'].includes(role)||typeof active!=='boolean')fail('Rol o estado inválido');if(active&&!user.active){const activeUsers=state.users.filter(u=>u.companyId===user.companyId&&u.active).length;assertLimit(companyFor(state,user.companyId),'maxUsers',activeUsers+1,activeUsers);}if(user.role==='admin'&&user.active&&(role!=='admin'||!active)&&!state.users.some(u=>u.id!==user.id&&u.companyId===user.companyId&&u.role==='admin'&&u.active))fail('La empresa debe conservar al menos un administrador activo');if(form.name!=null)user.name=text(form.name,'Nombre');if(Object.hasOwn(form,'email')){const email=recoveryEmail(form.email);if(email!==user.email){user.email=email;user.emailVerified=false;delete user.emailVerification;dropPasswordResets(state,user.id);}}if(role!==user.role||active!==user.active)user.version++;user.role=role;user.active=active;}
  }else if(a.type==='support.start'){
    owner(actor);company=companyFor(state,a.companyId);const reason=text(form.motivo,'Motivo de soporte',500);session.support={companyId:company.id,reason,startedAt:iso(now)};
    const b=state.businesses[company.id];businessAudit(b,{...actor,label:actor.username+' · Soporte',support:session.support},'soporte_inicio',{motivo:reason},now);b.revision++;
    securityEvent(state,'support_start',{companyId:company.id,empresa:company.name,usuario:actor.username,motivo:reason},now);
  }else if(a.type==='support.end'){
    owner(actor);if(session.support){const b=state.businesses[session.support.companyId];if(b){businessAudit(b,{...actor,label:actor.username+' · Soporte'},'soporte_fin',{motivo:session.support.reason},now);b.revision++;}}delete session.support;
  }else if(a.type==='business.change'){
    if(!admin(actor))fail('Solo el administrador puede modificar inventario o taller',403,'FORBIDDEN');
    const b=businessContext(state,actor),payload=structuredClone(a.payload||{});
    if(!['producto','compra','ajuste','importar','eliminar','estado','reversion'].includes(payload.kind))fail('Operación inválida; registra ventas desde Nueva venta');
    if(payload.kind==='reversion'&&payload.form?.tipo==='venta')fail('Utiliza la autorización de devolución de venta');
    if(payload.kind==='reversion'&&payload.form?.tipo==='servicio'&&b.servs.some(s=>s.id===payload.id&&s.venta_id))fail('Este servicio está vinculado a una venta. Anula o devuelve desde esa venta.');
    const original=structuredClone(b),photo=payload.kind==='producto'?image(payload.form?.foto,original.prods.map(p=>p.foto).filter(Boolean)):null;
    // BE-13: browser/HTTP adapters (enforceContext) must send the revision they edited.
    if(options.enforceContext&&['ajuste','producto'].includes(payload.kind)&&a.revision==null)fail('Recarga los datos antes de guardar este cambio.',428,'REVISION_REQUIRED');
    // BE-40: una compra con pagos al proveedor no se anula; la compra a crédito es parte del plan.
    if(payload.kind==='reversion'&&payload.form?.tipo==='compra'){const purchase=b.compras.find(c=>c.id===payload.id);if(purchase)assertPurchaseCancellable(purchase);}
    if(payload.kind==='compra'&&payload.form?.credito===true)assertFeature(companyFor(state,actor.companyId),'ordenes_compra');
    payload.revision=b.revision;const next=aplicarCambio(b,payload,actor.label,stamp(now).getTime());
    if(payload.kind==='compra'){next.compras[0].userId=actor.id;attachPurchaseTerms(next,next.compras[0],payload.form||{},dateBogota(now));}
    if(payload.kind==='reversion'&&payload.form?.tipo==='compra')afterPurchaseCancelled(next,payload.id);
    // The legacy engine intentionally knows no image data. Preserve images on updates/imports.
    for(const p of next.prods){const prior=original.prods.find(old=>old.id===p.id);if(prior?.foto)p.foto=prior.foto;}
    if(payload.kind==='producto'){const p=next.prods.find(p=>payload.form?.id?p.id===payload.form.id:norm(p.nombre)===norm(payload.form?.nombre));if(p&&Object.hasOwn(payload.form||{},'foto'))p.foto=photo;}
    const summary=p=>p?Object.fromEntries(Object.entries(p).filter(([key])=>!['foto','detalles','labor','reversiones'].includes(key))):null;
    const last=next.auditoria[0];if(last){
      last.userId=actor.id;last.motivo=payload.form?.motivo||actor.support?.reason||'';last.supportReason=actor.support?.reason||'';
      if(['producto','ajuste','eliminar'].includes(payload.kind)){last.antes=summary(original.prods.find(p=>p.id===(payload.id||payload.form?.id)));last.despues=summary(next.prods.find(p=>p.id===(payload.id||payload.form?.id))||next.prods.find(p=>norm(p.nombre)===norm(payload.form?.nombre)));}
      else if(payload.kind==='estado'){last.antes=summary(original.servs.find(s=>s.id===payload.id));last.despues=summary(next.servs.find(s=>s.id===payload.id));}
      else if(payload.kind==='importar'){last.antes={productos:original.prods.length};last.despues={productos:next.prods.length};}
      else {last.antes={productos:original.prods.map(p=>({id:p.id,stock:p.stock}))};last.despues={productos:next.prods.map(p=>({id:p.id,stock:p.stock}))};}
    }
    if(['producto','importar'].includes(payload.kind)){const size=prods=>prods.reduce((n,p)=>({count:n.count+(p.foto?1:0),chars:n.chars+imageWeight(p.foto)}),{count:0,chars:0}),now_=size(next.prods),was=size(original.prods);
      if(now_.count>MAX_COMPANY_PHOTOS&&now_.count>was.count||now_.chars>MAX_COMPANY_PHOTO_CHARS&&now_.chars>was.chars)fail('La empresa alcanzó el límite de fotos ('+MAX_COMPANY_PHOTOS+' fotos o 40 MB en total). Quita o reduce fotos de otros productos antes de agregar más.',400,'PHOTO_LIMIT');
      // BE-37: productos y fotos según el plan de la empresa.
      const target=companyFor(state,actor.companyId);assertLimit(target,'maxProducts',next.prods.length,original.prods.length);assertLimit(target,'maxPhotos',now_.count,was.count);}
    const oldMovements=new Set(original.movimientos.map(m=>m.id));for(const m of next.movimientos)if(!oldMovements.has(m.id)){m.userId=actor.id;m.motivo=m.motivo||actor.support?.reason||'';m.supportReason=actor.support?.reason||'';}
    state.businesses[actor.companyId]=next;
  }else if(a.type==='sale.create'){
    await createSale(state,actor,a,now,baseUrl,options,extra);
  }else if(a.type==='sale.receipt'||a.type==='sale.receipt.revoke'){
    const b=businessContext(state,actor),sale=b.ventas.find(s=>s.id===a.id);if(!sale)fail('Venta inexistente',404);
    if(actor.role==='vendedor'&&sale.userId!==actor.id)fail('Solo puedes consultar tus propias ventas',403,'FORBIDDEN');
    if(a.type==='sale.receipt')extra.receiptLink=await issueReceipt(state,actor.companyId,sale,now,baseUrl);
    else{revokeReceipts(state,actor.companyId,sale.id);dropReceiptSecret(sale);delete sale.receiptHash;delete sale.receiptExpiresAt;}
    b.revision++;businessAudit(b,actor,a.type==='sale.receipt'?'comprobante_enlace':'comprobante_revocado',{documento:sale.id},now);
  }else if(a.type==='sale.reverse'){
    if(!admin(actor))fail('La devolución o anulación requiere autorización del administrador',403,'FORBIDDEN');
    const b=businessContext(state,actor),sale=b.ventas.find(s=>s.id===a.id);if(!sale||sale.anulada)fail('Venta inexistente o anulada');
    const motivo=text(form.motivo,'Motivo',500);let next;
    if(sale.detalles.length){next=aplicarCambio(b,{kind:'reversion',revision:b.revision,id:sale.id,form:{tipo:'venta',motivo,parcial:form.parcial===true},items:a.items},actor.label,stamp(now).getTime());}
    else{if(form.parcial)fail('La devolución parcial requiere productos');next=structuredClone(b);next.revision++;const rec=next.ventas.find(s=>s.id===a.id);rec.anulada=true;rec.reversiones??=[];rec.reversiones.push({id:id(),fecha:iso(now),usuario:actor.label,motivo,parcial:false,detalles:[]});businessAudit(next,actor,'reversion',{documento:a.id,motivo},now);}
    const updated=next.ventas.find(s=>s.id===a.id);updated.autorizadoPor=actor.label;
    // BE-14 rule: a return/cancellation is always booked against the ORIGINAL sale date
    // (reports stay sale-date based) and never rewrites a confirmed cash closure. The
    // reversal keeps the Bogotá day it actually happened (fechaComercial); when that sale
    // day was already closed it is flagged afterClosure:true so the closure shows its warning.
    // BE-15/BE-16: the money returned leaves the cash of the day it is paid (fechaComercial);
    // a credit sale first lowers its pending balance and only the rest is refunded.
    const refundMethod=form.refundMethod==null||form.refundMethod===''?null:cashMethod(form.refundMethod);
    const reversal=updated.reversiones?.at(-1);if(reversal){reversal.fechaComercial=dateBogota(now);if((next.cashClosures||[]).some(c=>c.date===updated.fecha))reversal.afterClosure=true;reversal.reembolso=refundFor(sale,updated,{method:refundMethod});}
    const service=next.servs.find(s=>s.venta_id===a.id);if(service){if(updated.anulada){service.anulada=true;service.estado='anulado';}service.detalles=structuredClone(updated.detalles);service.reversiones=structuredClone(updated.reversiones);}
    const log=next.auditoria?.[0];if(log){log.userId=actor.id;log.motivo=motivo;log.autorizadoPor=actor.label;}
    state.businesses[actor.companyId]=next;
  }else fail('Acción desconocida',404,'NOT_FOUND');
  // Marking a ticket as read is not an auditable change; skip it to keep the global log bounded.
  if(a.type!=='ticket.read')audit(state,actor,a.type,company?.id||actor.companyId||a.companyId,{documento:documentId||a.userId||a.id||company?.id||'',motivo:actor.support?.reason||form.motivo||'',antes:before?{name:before.name,startDate:before.startDate,endDate:before.endDate,enabled:before.enabled}:null,despues:company?{name:company.name,startDate:company.startDate,endDate:company.endDate,enabled:company.enabled}:null,...auditExtra},now);
  state.revision++;
  return extra;
}

// ---------------------------------------------------------------------------------
// SEG-13: recuperación de contraseña por correo. Funciones puras: reciben `now` y el
// estado (ya clonado por platformRequest) y devuelven un outbox [{to,subject,text}] que
// solo el adaptador HTTP envía después de confirmar la escritura.
const maskEmail=value=>String(value||'').replace(/^(.)[^@]*(@.*)$/,'$1***$2');
const emailCodeHash=(userId,code)=>hash('email-code|'+userId+'|'+code);
const resetKey=secret=>hash('password-reset|'+secret);
function dropPasswordResets(state,userId){for(const [key,value]of Object.entries(state.passwordResets||{}))if(value?.userId===userId)delete state.passwordResets[key];}
// Uniform 6-digit code (rejection sampling avoids modulo bias).
function sixDigitCode(){const buffer=new Uint32Array(1);for(;;){crypto.getRandomValues(buffer);if(buffer[0]<4294000000)return String(buffer[0]%1000000).padStart(6,'0');}}
// One counter per key and window; returns false once the limit is reached.
function takeRecoverySlot(state,key,limit,timestamp){
  const records=state.recoveryLimits??={},previous=records[key],active=previous?.until>timestamp;
  if(active&&previous.count>=limit)return {ok:false,retryAfterSeconds:Math.max(1,Math.ceil((previous.until-timestamp)/1000))};
  records[key]={count:active?previous.count+1:1,until:active?previous.until:timestamp+RECOVERY_WINDOW_MS};return {ok:true};
}
function loginAccount(state,companyInput,usernameInput){
  const companyName=norm(companyInput),username=norm(usernameInput),isOwner=companyName===norm(state.ownerCompany);
  const company=isOwner?null:state.companies.find(c=>norm(c.name)===companyName||norm(c.slug)===companyName);
  if(!isOwner&&!company)return {};
  return {company,user:state.users.find(u=>u.companyId===(isOwner?null:company.id)&&norm(u.username)===username&&u.active)};
}
const greeting=user=>`Hola ${String(user.name||user.username).replace(/[\r\n]+/g,' ').slice(0,80)},`;
function resetMail(state,user,company,link){
  return {to:user.email,subject:'SCORTA · Crea una nueva contraseña',text:[greeting(user),'',`Recibimos una solicitud para restablecer la contraseña del usuario «${user.username}» en ${company?.name||state.ownerCompany}.`,'','Para crear una contraseña nueva abre este enlace. Vence en 1 hora y solo se puede usar una vez:',link,'','Si no pediste el cambio, ignora este mensaje: tu contraseña actual sigue funcionando y nadie más puede usar el enlace.','','SCORTA · Gestión de inventario'].join('\n')};
}
function resetDoneMail(state,user,company,now){
  return {to:user.email,subject:'SCORTA · Tu contraseña cambió',text:[greeting(user),'',`La contraseña del usuario «${user.username}» en ${company?.name||state.ownerCompany} se cambió el ${new Date(stamp(now)).toLocaleString('es-CO',{timeZone:'America/Bogota'})} con un enlace de recuperación. Se cerraron todas las sesiones abiertas.`,'','Si no fuiste tú, avisa de inmediato a tu administrador para que bloquee la cuenta.','','SCORTA · Gestión de inventario'].join('\n')};
}
function verificationMail(user,code){
  return {to:user.email,subject:'SCORTA · Código para verificar tu correo',text:[greeting(user),'',`Tu código para verificar este correo en SCORTA es: ${code}`,'','Escríbelo en «Mi perfil». Vence en 10 minutos. Si no lo pediste, ignora este mensaje.','','SCORTA · Gestión de inventario'].join('\n')};
}
/** POST /api/v2/password/forgot. Always answers the same, whether the account exists or not. */
export async function requestPasswordReset(state,body,{now,clientKey,mailEnabled=false,resetBaseUrl}={}){
  const timestamp=stamp(now).getTime(),outbox=[];
  const origin=takeRecoverySlot(state,await hash('recovery-origin|'+optionalText(clientKey||'unknown',100)),RECOVERY_ORIGIN_LIMIT,timestamp);
  if(!origin.ok)return {status:429,body:{error:'Demasiadas solicitudes de recuperación desde este origen. Espera unos minutos.',code:'RATE_LIMITED',retryAfterSeconds:origin.retryAfterSeconds}};
  const valid=typeof body?.company==='string'&&body.company.length<=200&&typeof body?.username==='string'&&body.username.length<=60;
  if(valid&&mailEnabled&&resetBaseUrl){
    // Per account: silently stop after 3 links in 15 minutes (the answer never changes).
    const account=takeRecoverySlot(state,await hash('recovery-account|'+norm(body.company)+'|'+norm(body.username)),RECOVERY_ACCOUNT_LIMIT,timestamp);
    const {user,company}=account.ok?loginAccount(state,body.company,body.username):{};
    if(user?.email&&user.emailVerified&&(!company||companyStatus(company,now)==='active')){
      dropPasswordResets(state,user.id);
      const secret=token();(state.passwordResets??={})[await resetKey(secret)]={userId:user.id,version:user.version,expires:timestamp+PASSWORD_RESET_TTL_MS,createdAt:iso(now)};
      outbox.push(resetMail(state,user,company,new URL('/recuperar#'+secret,resetBaseUrl).href));
      audit(state,user,'password.reset.request',user.companyId,{documento:user.id,correo:maskEmail(user.email)},now);
    }
  }
  return {status:200,body:{ok:true,message:mailEnabled?RECOVERY_REQUESTED_MESSAGE:MAIL_DISABLED_MESSAGE,emailRecovery:!!mailEnabled},outbox};
}
/** POST /api/v2/password/reset: one-time token, password policy, every session closed. */
export async function resetPassword(state,body,{now,clientKey}={}){
  const timestamp=stamp(now).getTime();
  const origin=takeRecoverySlot(state,await hash('reset-origin|'+optionalText(clientKey||'unknown',100)),RESET_ORIGIN_LIMIT,timestamp);
  if(!origin.ok)return {status:429,body:{error:'Demasiados intentos. Espera unos minutos.',code:'RATE_LIMITED',retryAfterSeconds:origin.retryAfterSeconds}};
  const secret=typeof body?.token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(body.token)?body.token:null;
  const key=secret?await resetKey(secret):null,record=key?state.passwordResets?.[key]:null;
  const user=record&&record.expires>timestamp?state.users.find(u=>u.id===record.userId&&u.active&&u.version===record.version):null;
  if(!user)return {status:400,body:{error:'El enlace de recuperación no es válido, ya se usó o venció. Solicita uno nuevo.',code:'RESET_INVALID'}};
  const company=user.companyId?companyFor(state,user.companyId):null;
  checkPassword(body.newPassword);
  if(await verifyPassword(user,body.newPassword))fail('Elige una contraseña diferente a la actual');
  user.password=await passwordHash(body.newPassword);user.passwordChangedAt=iso(now);user.version++;delete user.mustChangePassword;
  dropPasswordResets(state,user.id);if(state.passwordFailures)delete state.passwordFailures[user.id];
  for(const [sessionKey,s]of Object.entries(state.sessions))if(s.userId===user.id)delete state.sessions[sessionKey];
  state.revision++;
  audit(state,user,'password.reset',user.companyId,{documento:user.id,medio:'correo'},now);
  return {status:200,body:{ok:true,message:'Contraseña actualizada. Ingresa con tu nueva contraseña.',company:company?.name||state.ownerCompany,username:user.username},outbox:user.email?[resetDoneMail(state,user,company,now)]:[]};
}

/** Pure request dispatcher shared by the Node server and browser-local demonstration. */
/** Options: requireTerms (BE-07), requireDataConsent (BE-05) and requireOwnerTwoFactor are off in the pure API and enabled by production adapters. */
export async function platformRequest(input,request,{now,baseUrl='https://scorta.example',requireTerms=false,requireDataConsent=false,requireOwnerTwoFactor=false,mailEnabled=false,resetBaseUrl}={}) {
  let state=input;
  // SEG-13: the session tells the UI whether e-mail recovery is configured on this server.
  const response=(status,body,extra={})=>{if(body?.session&&typeof body.session==='object'){body.session.emailRecovery=!!mailEnabled;if(body.session.role==='owner')body.session.twoFactorRequired=!!requireOwnerTwoFactor;}return {state,status,body,...extra};};
  try{
    if(!input)fail('Configura SCORTA_OWNER_PASSWORD para preparar la plataforma',503,'SETUP_REQUIRED');
    const method=(request.method||'GET').toUpperCase(),url=new URL(request.path,'https://scorta.example'),path=url.pathname,body=request.body||{};
    const catalog=path.match(/^\/api\/v2\/catalog\/([^/]+)(?:\/photo\/([^/]+)|(\/checkout)|(\/logo))?$/);
    if(catalog){
      const company=catalogCompany(state,decodeURIComponent(catalog[1]),stamp(now));
      if(method==='GET'&&catalog[4]){if(!company.logo)fail('Imagen no disponible',404);return response(200,{image:company.logo});}
      if(method==='GET'&&catalog[2]){const product=catalogProducts(state,company).find(p=>p.id===decodeURIComponent(catalog[2]));if(!product?.foto)fail('Imagen no disponible',404);return response(200,{image:product.foto});}
      if(method==='GET'&&!catalog[3])return response(200,publicCatalog(state,company));
      if(method==='POST'&&catalog[3])return response(200,catalogCheckout(state,company,body.items));
      fail('Método no permitido',405);
    }
    const receipt=path.match(/^\/api\/v2\/receipt\/([A-Za-z0-9_-]{43})$/);
    if(method==='GET'&&receipt){const ref=state.receipts[await hash(receipt[1])];if(!ref||ref.expires<=stamp(now).getTime())fail('El enlace del comprobante venció o no existe',404,'RECEIPT_EXPIRED');const company=companyFor(state,ref.companyId),sale=state.businesses[company.id]?.ventas.find(s=>s.id===ref.saleId);if(!sale)fail('Comprobante inexistente',404);return response(200,{company:{name:company.name,logo:company.logo,email:company.email,whatsapp:company.whatsapp,nit:company.nit||'',address:company.address||''},sale:publicReceiptSale(sale),expiresAt:new Date(ref.expires).toISOString()});}
    // BE-30: /media/<companyId>/<mediaId>. Public when the image is in an open catalog (or is its logo);
    // otherwise only a session of that company (the owner, in support, too) sees it. The owner also
    // sees every company logo. Anything else is 404, so other tenants learn nothing.
    const media=method==='GET'&&path.match(MEDIA_PATH);
    if(media){
      const [,companyId,mediaId]=media,company=state.companies.find(c=>c.id===companyId),unavailable=()=>fail('Imagen no disponible',404,'NOT_FOUND');
      if(!company)unavailable();
      const same=value=>isMediaRef(value)&&value.mediaId===mediaId,isLogo=same(company.logo);
      const ref=isLogo?company.logo:(state.businesses[companyId]?.prods||[]).find(p=>same(p.foto))?.foto;
      if(!ref)unavailable();
      let open=false;try{const shop=catalogCompany(state,company.slug,stamp(now));open=isLogo||catalogProducts(state,shop).some(p=>same(p.foto));}catch{}
      if(open)return response(200,{media:ref,public:true});
      const viewer=resolveActor(state,request.token?state.sessions[await hash(request.token)]:null,now);
      if(viewer.companyId!==companyId&&!(viewer.role==='owner'&&!viewer.support&&isLogo))unavailable();
      return response(200,{media:ref,public:false});
    }
    if(method==='POST'){
      if(!body||typeof body!=='object'||Array.isArray(body))fail('Datos inválidos');
      state=structuredClone(input);
      for(const [key,s]of Object.entries(state.sessions))if(s.expires<=stamp(now).getTime())delete state.sessions[key];
      pruneLoginTracking(state,stamp(now).getTime());pruneStoredState(state,stamp(now).getTime());
    }
    const sessionKey=request.token?await hash(request.token):null,session=sessionKey?state.sessions[sessionKey]:null;
    if(path==='/api/v2/login'&&method==='POST'){
      const timestamp=stamp(now).getTime(),originKey=await hash('origin|'+optionalText(request.clientKey||'unknown',100));
      const origin=state.loginOrigins[originKey];
      if(origin?.until>timestamp&&origin.count>=LOGIN_ORIGIN_LIMIT)return response(429,{error:'Demasiados intentos desde este origen. Espera un minuto antes de volver a ingresar.',code:'RATE_LIMITED',retryAfterSeconds:Math.max(1,Math.ceil((origin.until-timestamp)/1000))});
      state.loginOrigins[originKey]={count:origin?.until>timestamp?origin.count+1:1,until:origin?.until>timestamp?origin.until:timestamp+LOGIN_ORIGIN_WINDOW_MS};
      const validFields=typeof body.company==='string'&&body.company.length<=200&&typeof body.username==='string'&&body.username.length<=60&&typeof body.password==='string'&&body.password.length<=200;
      if(!validFields){pruneLoginTracking(state,timestamp);return response(401,{error:'Empresa, usuario o contraseña incorrectos',code:'INVALID_CREDENTIALS'});}
      const companyName=norm(body.company),username=norm(body.username),isOwner=companyName===norm(state.ownerCompany);
      // The owner namespace never resolves through a tenant's legacy slug.
      const company=isOwner?null:state.companies.find(c=>norm(c.name)===companyName||norm(c.slug)===companyName);
      const companyId=isOwner?null:company?.id;
      const key=await hash(companyName+'|'+username+'|'+optionalText(request.clientKey,100));
      const previous=state.loginFailures[key];
      if(previous?.until>timestamp&&previous.count>=10)return response(429,{error:'Demasiados intentos. Espera unos minutos antes de volver a ingresar.',code:'RATE_LIMITED',retryAfterSeconds:Math.max(1,Math.ceil((previous.until-timestamp)/1000))});
      const user=companyId!==undefined?state.users.find(u=>u.companyId===companyId&&norm(u.username)===username):null;
      const valid=user?await verifyPassword(user,body.password):(await verifyPassword(await dummyUser(),body.password),false);
      const reject=async(error,code)=>{
        state.loginFailures[key]={count:previous?.until>timestamp?previous.count+1:1,until:previous?.until>timestamp?previous.until:timestamp+LOGIN_ACCOUNT_WINDOW_MS};
        // BE-33: account-wide failures (any origin); one alert per 15-minute window.
        const accountKey=await hash('account|'+companyName+'|'+username),failures=state.accountFailures??={},account=failures[accountKey],active=account?.until>timestamp;
        const next=failures[accountKey]={count:active?account.count+1:1,until:active?account.until:timestamp+LOGIN_ACCOUNT_WINDOW_MS,alerted:!!(active&&account.alerted)};
        if(next.count>=ACCOUNT_ALERT_FAILURES&&!next.alerted){next.alerted=true;securityEvent(state,'login_failures',{companyId:companyId??null,empresa:company?.name||(isOwner?state.ownerCompany:optionalText(body.company,100)),usuario:optionalText(body.username,60),intentos:next.count},now);}
        pruneLoginTracking(state,timestamp);return response(401,{error,code});
      };
      if(!valid)return reject('Empresa, usuario o contraseña incorrectos','INVALID_CREDENTIALS');
      // Only after proving the password: a disabled account gets its own message (no enumeration).
      if(!user.active){pruneLoginTracking(state,timestamp);return response(403,{error:'Tu cuenta está deshabilitada. Pide al administrador de tu empresa que la habilite.',code:'ACCOUNT_DISABLED'});}
      // SEG-01: the owner with 2FA must also send a current TOTP code (no replay).
      if(user.totp?.enabled){
        if(body.totp==null||body.totp==='')return response(401,{error:'Ingresa el código de verificación de tu aplicación autenticadora.',code:'TOTP_REQUIRED'});
        const counter=await verifyTotp(user.totp.secret,String(body.totp),timestamp,{after:user.totp.lastCounter??-1});
        if(counter===null)return reject('El código de verificación no es correcto o ya fue usado.','TOTP_INVALID');
        user.totp.lastCounter=counter;
      }
      if(company)assertAccess(company,now);
      delete state.loginFailures[key];if(sessionKey)delete state.sessions[sessionKey];
      pruneLoginTracking(state,timestamp);
      user.lastLoginAt=iso(now);if(company)company.lastLoginAt=user.lastLoginAt;
      if(user.role==='owner'){
        // BE-33: owner login from an origin key never seen before (the very first login only records it).
        const originHash=await hash('owner-origin|'+optionalText(request.clientKey||'unknown',100)),known=state.ownerOrigins??=[];
        if(!known.includes(originHash)){if(known.length)securityEvent(state,'owner_new_origin',{companyId:null,usuario:user.username},now);known.unshift(originHash);if(known.length>MAX_OWNER_ORIGINS)known.length=MAX_OWNER_ORIGINS;}
      }
      const nextToken=token(),nextKey=await hash(nextToken);state.sessions[nextKey]={userId:user.id,version:user.version,expires:timestamp+(user.role==='owner'?OWNER_SESSION_TTL_MS:SESSION_MS)};
      // Al superar el tope se cierran las sesiones más antiguas del mismo usuario.
      const mine=Object.entries(state.sessions).filter(([,s])=>s.userId===user.id).sort((a,b)=>a[1].expires-b[1].expires);for(const [key]of mine.slice(0,Math.max(0,mine.length-MAX_SESSIONS_PER_USER)))delete state.sessions[key];
      return response(200,envelope(state,resolveActor(state,state.sessions[nextKey],now),now,baseUrl),{token:nextToken});
    }
    if(method==='POST'&&path==='/api/v2/logout'){delete state.sessions[sessionKey];return response(200,{ok:true},{token:null});}
    // SEG-13: public recovery routes (no session). The outbox is sent by the adapter only.
    if(method==='GET'&&path==='/api/v2/password/status')return response(200,{emailRecovery:!!mailEnabled,message:mailEnabled?'':MAIL_DISABLED_MESSAGE});
    if(method==='POST'&&path==='/api/v2/password/forgot'){const result=await requestPasswordReset(state,body,{now,clientKey:request.clientKey,mailEnabled,resetBaseUrl:resetBaseUrl??baseUrl});return response(result.status,result.body,result.outbox?.length?{outbox:result.outbox}:{});}
    if(method==='POST'&&path==='/api/v2/password/reset'){const result=await resetPassword(state,body,{now,clientKey:request.clientKey});return response(result.status,result.body,result.outbox?.length?{outbox:result.outbox}:{});}
    const actor=resolveActor(state,session,now);
    await assertRequestContext(state,actor,request,body,path);
    // SEG-08: after an administrator reset only the session, password change and logout work.
    if(actor.mustChangePassword&&!(method==='GET'&&['/api/v2/session','/api/v2/data'].includes(path))&&!(method==='POST'&&path==='/api/v2/password'))fail('Debes cambiar tu contraseña antes de continuar.',403,'PASSWORD_CHANGE_REQUIRED');
    // The platform owner must enrol an authenticator app before doing anything else.
    if(requireOwnerTwoFactor&&actor.role==='owner'&&!actor.twoFactorEnabled&&!(method==='GET'&&['/api/v2/session','/api/v2/data'].includes(path))&&!(method==='POST'&&(path==='/api/v2/password'||path==='/api/v2/action'&&['twofa.setup','twofa.enable'].includes(body.type))))fail('Activa la verificación en dos pasos con tu aplicación autenticadora antes de continuar.',403,'TWO_FACTOR_SETUP_REQUIRED');
    // BE-07: business writes wait for the company to accept the current terms (owner never blocked).
    if(requireTerms&&method==='POST'&&actor.role!=='owner'&&actor.companyId&&!termsAccepted(actor.company)&&(path==='/api/v2/draft'||path==='/api/v2/action'&&body.type!=='terms.accept'&&!String(body.type).startsWith('ticket.')))fail('El administrador de la empresa debe aceptar los términos vigentes antes de continuar.',403,'TERMS_REQUIRED');
    if(method==='GET'&&path==='/api/v2/export'){
      if(actor.role!=='admin'||!actor.companyId)fail('La exportación requiere un administrador de la empresa.',403,'FORBIDDEN');
      return response(200,exportCompany(state,actor.companyId,now));
    }
    if(method==='GET'&&(path==='/api/v2/reports'||path==='/api/v2/overview')){
      if(!admin(actor))fail('Los reportes requieren un administrador de la empresa.',403,'FORBIDDEN');
      const business=businessContext(state,actor),period=reportDates(url.searchParams.get('from'),url.searchParams.get('to'),dateBogota(now));
      return response(200,{...period,report:path==='/api/v2/overview'?overviewReport(business,period):salesReport(business,period)});
    }
    if(path==='/api/v2/draft'&&method==='GET')return response(200,readDraft(state,actor));
    if(path==='/api/v2/draft'&&method==='POST')return response(200,writeDraft(state,actor,body,stamp(now).getTime()));
    const search=path.match(/^\/api\/v2\/search\/(products|sales|customers)$/);
    if(method==='GET'&&search)return response(200,searchBusiness(state,actor,search[1],url.searchParams));
    // BE-29: con request.etag el sobre lleva su versión; si coincide con If-None-Match, 304 sin cuerpo.
    if(method==='GET'&&path==='/api/v2/data'&&request.etag){
      const etag=await dataTag(state,actor,now,{baseUrl,mailEnabled,requireOwnerTwoFactor});
      if(tagMatches(request.ifNoneMatch,etag))return response(304,null,{etag});
      return response(200,envelope(state,actor,now,baseUrl),{etag});
    }
    if(method==='GET'&&(path==='/api/v2/session'||path==='/api/v2/data'))return response(200,envelope(state,actor,now,baseUrl));
    if(method==='POST'&&path==='/api/v2/logout'){delete state.sessions[sessionKey];return response(200,{ok:true},{token:null});}
    if(method==='POST'&&path==='/api/v2/password'){
      // SEG-07: 5 wrong current passwords per user in 15 minutes, then 429.
      const user=state.users.find(u=>u.id===actor.id),timestamp=stamp(now).getTime(),failures=state.passwordFailures??={},previous=failures[user.id],active=previous?.until>timestamp;
      if(active&&previous.count>=PASSWORD_MAX_FAILURES)return response(429,{error:'Demasiados intentos de cambio de contraseña. Espera unos minutos.',code:'RATE_LIMITED',retryAfterSeconds:Math.max(1,Math.ceil((previous.until-timestamp)/1000))});
      if(!await verifyPassword(user,body.currentPassword)){failures[user.id]={count:active?previous.count+1:1,until:active?previous.until:timestamp+PASSWORD_WINDOW_MS};return response(400,{error:'La contraseña actual no es correcta'});}
      if(body.newPassword===body.currentPassword)fail('Elige una contraseña diferente a la actual');user.password=await passwordHash(checkPassword(body.newPassword));user.passwordChangedAt=iso(now);user.version++;delete failures[user.id];delete user.mustChangePassword;
      for(const [key,s]of Object.entries(state.sessions))if(s.userId===user.id)delete state.sessions[key];state.revision++;
      audit(state,actor,'password.change',actor.companyId,{documento:actor.id},now);return response(200,{ok:true},{token:null});
    }
    if(method==='POST'&&path==='/api/v2/action'){
      if(typeof body.type!=='string')fail('Acción inválida');
      const fingerprint=await actionFingerprint(actor,body);
      const requestKey=body.requestId?actor.id+'|'+text(body.requestId,'Identificador',150):null;
      if(requestKey&&state.requests[requestKey]){if(state.requests[requestKey].fingerprint!==fingerprint)fail('El identificador de operación ya fue usado con otros datos');return response(200,envelope(state,actor,now,baseUrl));}
      const expected=actor.companyId?state.businesses[actor.companyId].revision:state.revision;
      if(!body.type.startsWith('ticket.')&&body.revision!=null&&body.revision!==expected)fail('Otro usuario modificó los datos. Actualiza y vuelve a intentar.',409,'REVISION_CONFLICT');
      // BE-13: company.update from browser/HTTP adapters must carry the edited revision.
      if(request.enforceContext&&['company.update','catalog.update'].includes(body.type)&&body.revision==null)fail('Recarga los datos antes de guardar este cambio.',428,'REVISION_REQUIRED');
      const extra=await applyAction(state,actor,session,body,now,baseUrl,{enforceContext:!!request.enforceContext,requireDataConsent,mailEnabled});
      if(extra.failure)return response(extra.failure.status,{error:extra.failure.error,code:extra.failure.code});
      if(requestKey)state.requests[requestKey]={fingerprint,createdAt:iso(now)};
      const nextActor=resolveActor(state,session,now),result=envelope(state,nextActor,now,baseUrl);
      // SEG-03: the clear receipt link exists only in this response (never stored).
      if(extra.receiptLink){result.receiptLink=extra.receiptLink;const sale=result.state?.ventas?.find(s=>s.id===extra.receiptLink.saleId);if(sale)Object.assign(sale,{receiptToken:extra.receiptLink.token,receiptUrl:extra.receiptLink.url,receiptExpiresAt:extra.receiptLink.expiresAt});}
      const extraKeys=['twoFactorSetup','export','customerExport','revoked','warning','document'].filter(key=>Object.hasOwn(extra,key));
      for(const key of extraKeys)result[key]=extra[key];
      // BE-29: la respuesta de una acción es el mismo sobre de /api/v2/data; con su versión la
      // siguiente recarga ya puede responder 304. No se versiona si lleva datos de un solo uso.
      const tagged=request.etag&&!extra.receiptLink&&!extraKeys.length?{etag:await dataTag(state,nextActor,now,{baseUrl,mailEnabled,requireOwnerTwoFactor})}:{};
      return response(200,result,{...(extra.outbox?.length?{outbox:extra.outbox}:{}),...tagged});
    }
    fail('Ruta inexistente',404,'NOT_FOUND');
  }catch(error){
    // A rejected request never leaks or persists partially changed business data.
    state=input;
    // Un fallo de programación (TypeError, etc.) no es culpa del usuario: 500 sin detalles internos
    // y con la traza en el log. Las validaciones (fail / Error con mensaje) siguen siendo 400.
    if(!error?.status&&(error instanceof TypeError||error instanceof ReferenceError||error instanceof RangeError||error instanceof SyntaxError&&!/JSON/.test(error.message))){
      console.error(JSON.stringify({level:'error',at:new Date().toISOString(),event:'internal-error',method:request?.method,path:String(request?.path||'').split('?')[0],error:String(error?.stack||error)}));
      return response(500,{error:'Error interno del servidor. Intenta de nuevo.',code:'INTERNAL_ERROR'});
    }
    const body={error:error.message||'No se pudo completar la operación',...(error.code?{code:error.code}:{}),...(error.details?{details:error.details}:{})};
    if(error.company){body.company=error.company;body.ownerContact=input?.ownerContact||'';}
    return response(error.status||400,body);
  }
}
