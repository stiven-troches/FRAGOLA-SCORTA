import {overviewReport} from './overview-report.mjs';
import {activeMechanics,mechanicForLabor,applyAdminControl,reportDates} from './admin-controls.mjs';
import {salesReport} from './admin-reports.mjs';
import {passwordPolicyError} from './password-policy.mjs';
import {visibleTickets,applyTicketAction} from './support-tickets.mjs';
import {readDraft,writeDraft,assertDraftSale,finishDraftSale} from './sale-drafts.mjs';
import {aplicarCambio, estadoVacio} from './inventory.mjs';

const encoder = new TextEncoder();
const MAX_IMAGE = 700000;
// Sessions survive browser/server restarts for up to 30 days; company/user checks still apply on every request.
export const PLATFORM_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_MS = PLATFORM_SESSION_TTL_MS;
const RECEIPT_MS = 7 * 86400000;
const fail = (message, status = 400, code) => {throw Object.assign(Error(message), {status, code});};
const stamp = value => {const n = typeof value === 'function' ? value() : value ?? Date.now(); const d = new Date(n); if (!Number.isFinite(d.getTime())) fail('Fecha inválida'); return d;};
export const dateBogota = now => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(stamp(now));
const iso = now => stamp(now).toISOString();
const id = () => crypto.randomUUID();
const norm = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const text = (v, label, max = 200) => {if (typeof v !== 'string' || !v.trim() || v.length > max) fail(`${label}: dato obligatorio o demasiado largo`); return v.trim();};
const optionalText = (v, max = 200) => v == null ? '' : String(v).trim().slice(0,max);
const recoveryEmail = value => {if(value==null||value==='')return '';if(typeof value!=='string'||value.length>254)fail('Correo de recuperación inválido');const email=value.trim().toLowerCase();if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Correo de recuperación inválido');return email;};
const number = (v, label, integer = false) => {const n = Number(v); if (v === '' || v == null || !Number.isFinite(n) || n < 0 || n > 1e12 || integer && !Number.isSafeInteger(n)) fail(`${label}: valor inválido`); return n;};
const date = (v, label) => {if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0,10) !== v) fail(`${label}: fecha inválida`); return v;};
const token = () => toBase64(crypto.getRandomValues(new Uint8Array(32))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const toBase64 = bytes => btoa(Array.from(bytes, v => String.fromCharCode(v)).join(''));
const fromBase64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const hash = async value => toBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
const checkPassword = v => {const error=passwordPolicyError(v);if(error)fail(error,400,'INVALID_PASSWORD');return v;};
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
function image(v) {
  if (!v) return '';
  if (typeof v !== 'string' || v.length > MAX_IMAGE || !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(v)) fail('La imagen debe ser PNG, JPEG, WebP o GIF de hasta 500 KB');
  const encoded=v.slice(v.indexOf(',')+1),bytes=fromBase64(encoded),mime=v.slice(5,v.indexOf(';'));
  if(bytes.length>512000)fail('La imagen no puede superar 500 KB');
  const starts=signature=>signature.every((n,i)=>bytes[i]===n);
  const valid=mime==='image/png'?starts([137,80,78,71,13,10,26,10]):mime==='image/jpeg'?starts([255,216,255]):mime==='image/gif'?String.fromCharCode(...bytes.slice(0,6))==='GIF87a'||String.fromCharCode(...bytes.slice(0,6))==='GIF89a':mime==='image/webp'?String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP':false;
  if(!valid)fail('El contenido de la imagen no coincide con su formato');
  return v;
}
function phone(v) {const value=optionalText(v,30);if(value&&!/^\+?[0-9 ()-]{6,30}$/.test(value))fail('Número de teléfono inválido');return value.replace(/[ ()-]/g,'');}
function period(form) {const startDate=date(form.startDate,'Inicio del contrato'),endDate=date(form.endDate,'Fin del contrato');if(endDate<startDate)fail('El fin del contrato debe ser igual o posterior al inicio');return {startDate,endDate};}
export function companyStatus(company, now) {const today=dateBogota(now);return !company.enabled?'disabled':today<company.startDate?'scheduled':today>company.endDate?'expired':'active';}
function nextMonth(value) {
  const [y,m,d]=value.split('-').map(Number),last=new Date(Date.UTC(y,m+1,0)).getUTCDate();
  return new Date(Date.UTC(y,m,Math.min(d,last))).toISOString().slice(0,10);
}
export function renewalProposal(company, now) {const today=dateBogota(now),active=company.endDate>=today;return {startDate:active?company.startDate:today,endDate:nextMonth(active?company.endDate:today),amount:company.monthlyFee};}
const publicUser = user => {const {password,version,...safe}=user;return safe;};
const publicCompany = (company, now, baseUrl) => ({...company,status:companyStatus(company,now),daysRemaining:Math.max(0,Math.round((Date.parse(company.endDate)-Date.parse(dateBogota(now)))/86400000)),url:new URL('/c/'+encodeURIComponent(company.slug),baseUrl||'https://scorta.example').href});
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
  const state={schemaVersion:1,revision:0,ownerCompany:text(config.company||'Fragola','Empresa propietaria'),ownerContact:optionalText(ownerContact,200),companies:[],users:[],businesses:{},payments:[],requests:{},sessions:{},audit:[],receipts:{},loginFailures:{}};
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
  const companyId=user.role==='owner'?session.support?.companyId||null:user.companyId;
  let company=null;
  if(companyId){company=companyFor(state,companyId);if(user.role!=='owner')assertAccess(company,now);}
  return {...publicUser(user),companyId,company,support:session.support||null,label:user.username+(session.support?' · Soporte':'')};
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
function removeCosts(value) {if(Array.isArray(value))return value.map(removeCosts);if(value&&typeof value==='object'){const next={};for(const [key,item]of Object.entries(value))if(!['precio_compra','costo_unitario','costo_compra'].includes(key))next[key]=removeCosts(item);return next;}return value;}
function envelope(state, actor, now, baseUrl) {
  const session={userId:actor.id,username:actor.username,name:actor.name,role:actor.role,companyId:actor.companyId,company:actor.company?publicCompany(actor.company,now,baseUrl):null,passwordChangedAt:actor.passwordChangedAt,email:actor.email||'',emailVerified:!!actor.emailVerified,support:actor.support||null,ownerContact:state.ownerContact};
  if(actor.role==='owner'&&!actor.support)return {session,revision:state.revision,tickets:visibleTickets(state,actor),companies:state.companies.map(c=>publicCompany(c,now,baseUrl)),users:state.users.filter(u=>u.role!=='owner').map(publicUser),payments:structuredClone(state.payments),audit:structuredClone(state.audit)};
  const business=structuredClone(state.businesses[actor.companyId]||estadoVacio());
  const aggregate=aggregates(business);Object.assign(business,aggregate);
  business.mechanics??=[];business.cashClosures??=[];
  if(actor.role==='vendedor'){
    business.mechanics=activeMechanics(business);delete business.cashClosures;
    business.compras=[];
    business.ventas=business.ventas.filter(s=>s.userId===actor.id||!s.userId&&s.usuario===actor.username);
    const own=new Set(business.ventas.map(s=>s.id));
    business.servs=business.servs.filter(s=>s.userId===actor.id||own.has(s.venta_id)||!s.userId&&s.usuario===actor.username);
    business.movimientos=[];business.auditoria=(business.auditoria||[]).filter(a=>a.userId===actor.id);
    return {session,revision:business.revision,tickets:visibleTickets(state,actor),draftVersion:readDraft(state,actor).version,state:removeCosts(business)};
  }
  return {session,revision:business.revision,tickets:visibleTickets(state,actor),draftVersion:readDraft(state,actor).version,state:business};
}
function uniqueUser(state,companyId,username,exceptId) {if(state.users.some(u=>u.companyId===companyId&&norm(u.username)===norm(username)&&u.id!==exceptId))fail('Ese usuario ya existe en esta empresa');}
function companyForm(state,form,old,now) {
  const name=text(form.name??old?.name,'Nombre de empresa',100);
  if(norm(name)===norm(state.ownerCompany)||state.companies.some(c=>c.id!==old?.id&&(norm(c.name)===norm(name)||norm(c.slug)===norm(name))))fail('Ya existe una empresa con ese nombre');
  const email=optionalText(form.email??old?.email,254);if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Correo inválido');
  const fields={name,contact:optionalText(form.contact??old?.contact),nit:optionalText(form.nit??old?.nit,60),address:optionalText(form.address??old?.address,300),email,whatsapp:phone(form.whatsapp??old?.whatsapp),logo:image(form.logo??old?.logo),...period({startDate:form.startDate??old?.startDate,endDate:form.endDate??old?.endDate}),monthlyFee:number(form.monthlyFee??old?.monthlyFee??0,'Mensualidad')};
  if(old)return {...old,...fields};
  const base=norm(name).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50)||'empresa';let slug=base;while(state.companies.some(c=>c.slug===slug||norm(c.name)===slug))slug=base+'-'+id().slice(0,6);
  return {id:id(),slug,...fields,enabled:true,createdAt:iso(now)};
}
function customerFor(business,form) {
  const nombre=optionalText(form.cliente)||'Cliente general',telefono=phone(form.telefono);
  if(nombre==='Cliente general'&&!telefono)return {cliente:nombre,telefono,customerId:null};
  const registry=business.customerRecords??=[];
  let c=registry.find(c=>telefono?c.telefono===telefono:norm(c.nombre)===norm(nombre)&&!c.telefono);
  if(!c){c={id:id(),nombre,telefono};registry.push(c);}else if(nombre!=='Cliente general')c.nombre=nombre;
  return {cliente:c.nombre,telefono:c.telefono,customerId:c.id};
}
function validatePlate(v) {const plate=optionalText(v,12).toUpperCase().replace(/[\s-]/g,'');if(plate&&!/^[A-Z0-9]{3,10}$/.test(plate))fail('Placa inválida');return plate;}
function businessContext(state, actor) {if(!actor.companyId)fail('Ingresa como soporte para operar en una empresa',403,'FORBIDDEN');return state.businesses[actor.companyId];}
async function applyAction(state,actor,session,a,now,baseUrl) {
  const form=a.form||{};let company,documentId;
  if(a.type.startsWith('company.')||a.type.startsWith('user.'))owner(actor);
  if(a.type.startsWith('company.')&&a.type!=='company.create')company=companyFor(state,a.companyId);
  const before=a.companyId?structuredClone(state.companies.find(c=>c.id===a.companyId)):null;
  if(a.type.startsWith('mechanic.')||a.type==='cash.close'){
    const business=businessContext(state,actor),result=applyAdminControl(business,actor,a,{now:stamp(now).getTime(),today:dateBogota(now)});documentId=result.id;
    businessAudit(business,actor,a.type,{documento:result.id,antes:result.before,despues:result.after},now);
  }else if(a.type.startsWith('ticket.')){
    const ticket=applyTicketAction(state,actor,a,iso(now));company=companyFor(state,ticket.companyId);documentId=ticket.id;
  }else if(a.type==='company.create'){
    company=companyForm(state,form,null,now);uniqueUser(state,company.id,form.username);
    const user=await makeUser({username:form.username,password:form.password,name:form.adminName||form.username,email:form.adminEmail},company.id,'admin',now);
    state.companies.push(company);state.users.push(user);state.businesses[company.id]=estadoVacio();
  }else if(a.type==='company.update'){
    const next=companyForm(state,form,company,now);state.companies[state.companies.indexOf(company)]=next;company=next;
  }else if(a.type==='company.access'){
    if(typeof form.enabled!=='boolean')fail('Indica si habilitas o suspendes la empresa');company.enabled=form.enabled;
  }else if(a.type==='company.delete'){
    if(form.confirmation!==company.name)fail('Escribe el nombre exacto de la empresa para confirmar la eliminación');
    const ids=new Set(state.users.filter(u=>u.companyId===company.id).map(u=>u.id));
    state.companies=state.companies.filter(c=>c.id!==company.id);state.users=state.users.filter(u=>!ids.has(u.id));delete state.businesses[company.id];for(const key of Object.keys(state.saleDrafts||{}))if(JSON.parse(key)[0]===company.id)delete state.saleDrafts[key];state.payments=state.payments.filter(p=>p.companyId!==company.id);state.supportTickets=(state.supportTickets||[]).filter(t=>t.companyId!==company.id);
    for(const [key,s]of Object.entries(state.sessions))if(ids.has(s.userId)||s.support?.companyId===company.id)delete state.sessions[key];
    for(const [key,r]of Object.entries(state.receipts))if(r.companyId===company.id)delete state.receipts[key];
  }else if(a.type==='company.renew'){
    const proposal=renewalProposal(company,now),next=period({startDate:form.startDate||proposal.startDate,endDate:form.endDate});
    if(next.endDate<=company.endDate)fail('La nueva fecha debe ampliar el vencimiento actual');
    const payment={id:id(),companyId:company.id,date:date(form.date||dateBogota(now),'Fecha de pago'),amount:number(form.amount??company.monthlyFee,'Importe'),previousEndDate:company.endDate,...next,username:actor.username};
    company.startDate=next.startDate;company.endDate=next.endDate;state.payments.unshift(payment);
  }else if(a.type==='user.create'){
    companyFor(state,a.companyId);uniqueUser(state,a.companyId,form.username);
    if(!['admin','vendedor'].includes(form.role))fail('Rol inválido');state.users.push(await makeUser(form,a.companyId,form.role,now));
  }else if(a.type==='user.update'||a.type==='user.reset'){
    const user=state.users.find(u=>u.id===a.userId&&u.role!=='owner');if(!user)fail('Usuario inexistente',404);
    if(a.type==='user.reset'){user.password=await passwordHash(checkPassword(form.password));user.passwordChangedAt=iso(now);user.version++;}
    else{const role=form.role??user.role,active=form.active??user.active;if(!['admin','vendedor'].includes(role)||typeof active!=='boolean')fail('Rol o estado inválido');if(user.role==='admin'&&user.active&&(role!=='admin'||!active)&&!state.users.some(u=>u.id!==user.id&&u.companyId===user.companyId&&u.role==='admin'&&u.active))fail('La empresa debe conservar al menos un administrador activo');if(form.name!=null)user.name=text(form.name,'Nombre');if(Object.hasOwn(form,'email')){const email=recoveryEmail(form.email);if(email!==user.email){user.email=email;user.emailVerified=false;}}if(role!==user.role||active!==user.active)user.version++;user.role=role;user.active=active;}
  }else if(a.type==='support.start'){
    owner(actor);company=companyFor(state,a.companyId);const reason=text(form.motivo,'Motivo de soporte',500);session.support={companyId:company.id,reason,startedAt:iso(now)};
    const b=state.businesses[company.id];businessAudit(b,{...actor,label:actor.username+' · Soporte',support:session.support},'soporte_inicio',{motivo:reason},now);b.revision++;
  }else if(a.type==='support.end'){
    owner(actor);if(session.support){const b=state.businesses[session.support.companyId];if(b){businessAudit(b,{...actor,label:actor.username+' · Soporte'},'soporte_fin',{motivo:session.support.reason},now);b.revision++;}}delete session.support;
  }else if(a.type==='business.change'){
    if(!admin(actor))fail('Solo el administrador puede modificar inventario o taller',403,'FORBIDDEN');
    const b=businessContext(state,actor),payload=structuredClone(a.payload||{});
    if(!['producto','compra','ajuste','importar','eliminar','estado','reversion'].includes(payload.kind))fail('Operación inválida; registra ventas desde Nueva venta');
    if(payload.kind==='reversion'&&payload.form?.tipo==='venta')fail('Utiliza la autorización de devolución de venta');
    if(payload.kind==='reversion'&&payload.form?.tipo==='servicio'&&b.servs.some(s=>s.id===payload.id&&s.venta_id))fail('Este servicio está vinculado a una venta. Anula o devuelve desde esa venta.');
    const original=structuredClone(b),photo=payload.kind==='producto'?image(payload.form?.foto):null;
    payload.revision=b.revision;const next=aplicarCambio(b,payload,actor.label);
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
    const oldMovements=new Set(original.movimientos.map(m=>m.id));for(const m of next.movimientos)if(!oldMovements.has(m.id)){m.userId=actor.id;m.motivo=m.motivo||actor.support?.reason||'';m.supportReason=actor.support?.reason||'';}
    state.businesses[actor.companyId]=next;
  }else if(a.type==='sale.create'){
    assertDraftSale(state,actor,a);
    if(!Array.isArray(a.items||[])||!Array.isArray(a.labor||[])||(a.items||[]).length>1000||(a.labor||[]).length>100)fail('Lista de artículos o servicios inválida');
    const b=businessContext(state,actor),items=structuredClone(a.items||[]),labor=(a.labor||[]).map(line=>{const mechanic=mechanicForLabor(b,line);return {descripcion:text(line?.descripcion,'Trabajo realizado',3000),mecanico:mechanic?.mecanico||text(line?.mecanico,'Mecánico'),importe:number(line?.importe,'Mano de obra'),...(mechanic?{mecanicoId:mechanic.mecanicoId}:{})}});
    if(!items.length&&!labor.length)fail('Agrega productos o mano de obra');
    const fecha=date(form.fecha||dateBogota(now),'Fecha de venta'),placa=validatePlate(form.placa);if(labor.length&&!placa)fail('Ingresa la placa para registrar el servicio');
    if(!['efectivo','transferencia','tarjeta'].includes(form.paymentMethod))fail('Selecciona efectivo, transferencia o tarjeta');
    for(const line of items){const product=b.prods.find(p=>p.id===line.producto_id);if(!product)fail('Producto inexistente');if(actor.role==='vendedor'&&Number(line.precio_unitario)!==product.precio_venta)fail('El vendedor no puede cambiar el precio del producto',403,'FORBIDDEN');}
    const customer=customerFor(b,form),base=structuredClone(b);let next,sale;
    if(items.length){next=aplicarCambio(base,{kind:'venta',revision:base.revision,form:{fecha,cliente:customer.cliente},items},actor.label);sale=next.ventas[0];}
    else{next=base;next.revision++;sale={id:id(),fecha,usuario:actor.label,detalles:[],total:0};next.ventas.unshift(sale);businessAudit(next,actor,'venta',{documento:sale.id},now);}
    const subtotal_productos=sale.total,subtotal_mano_obra=labor.reduce((n,l)=>n+l.importe,0),receiptToken=token();
    Object.assign(sale,customer,{userId:actor.id,placa,labor,subtotal_productos,subtotal_mano_obra,paymentMethod:form.paymentMethod,total:subtotal_productos+subtotal_mano_obra,receiptToken,receiptUrl:new URL('/receipt/'+receiptToken,baseUrl||'https://scorta.example').href,receiptExpiresAt:new Date(stamp(now).getTime()+RECEIPT_MS).toISOString()});
    if(labor.length)next.servs.unshift({id:id(),venta_id:sale.id,fecha,usuario:actor.label,userId:actor.id,...customer,placa,labor:structuredClone(labor),descripcion_trabajo:labor.map(l=>l.descripcion).join('; '),mecanico:labor.map(l=>l.mecanico).join(', '),costo_mano_obra:subtotal_mano_obra,subtotal_productos,subtotal_mano_obra,total:sale.total,detalles:structuredClone(sale.detalles),estado:'completado',paymentMethod:sale.paymentMethod});
    const log=next.auditoria?.[0];if(log){log.userId=actor.id;log.motivo=actor.support?.reason||'';log.despues={total:sale.total,placa,cliente:sale.cliente};}
    state.receipts[await hash(receiptToken)]={companyId:actor.companyId,saleId:sale.id,expires:stamp(now).getTime()+RECEIPT_MS};state.businesses[actor.companyId]=next;
    finishDraftSale(state,actor,a,sale.id,stamp(now).getTime());
  }else if(a.type==='sale.receipt'){
    const b=businessContext(state,actor),sale=b.ventas.find(s=>s.id===a.id);if(!sale)fail('Venta inexistente',404);
    if(actor.role==='vendedor'&&sale.userId!==actor.id)fail('Solo puedes consultar tus propias ventas',403,'FORBIDDEN');
    const nextToken=token();sale.receiptToken=nextToken;sale.receiptUrl=new URL('/receipt/'+nextToken,baseUrl||'https://scorta.example').href;sale.receiptExpiresAt=new Date(stamp(now).getTime()+RECEIPT_MS).toISOString();
    state.receipts[await hash(nextToken)]={companyId:actor.companyId,saleId:sale.id,expires:stamp(now).getTime()+RECEIPT_MS};b.revision++;businessAudit(b,actor,'comprobante_enlace',{documento:sale.id},now);
  }else if(a.type==='sale.reverse'){
    if(!admin(actor))fail('La devolución o anulación requiere autorización del administrador',403,'FORBIDDEN');
    const b=businessContext(state,actor),sale=b.ventas.find(s=>s.id===a.id);if(!sale||sale.anulada)fail('Venta inexistente o anulada');
    const motivo=text(form.motivo,'Motivo',500);let next;
    if(sale.detalles.length){next=aplicarCambio(b,{kind:'reversion',revision:b.revision,id:sale.id,form:{tipo:'venta',motivo,parcial:form.parcial===true},items:a.items},actor.label);}
    else{if(form.parcial)fail('La devolución parcial requiere productos');next=structuredClone(b);next.revision++;const rec=next.ventas.find(s=>s.id===a.id);rec.anulada=true;rec.reversiones??=[];rec.reversiones.push({id:id(),fecha:iso(now),usuario:actor.label,motivo,parcial:false,detalles:[]});businessAudit(next,actor,'reversion',{documento:a.id,motivo},now);}
    const updated=next.ventas.find(s=>s.id===a.id);updated.autorizadoPor=actor.label;
    const service=next.servs.find(s=>s.venta_id===a.id);if(service){if(updated.anulada){service.anulada=true;service.estado='anulado';}service.detalles=structuredClone(updated.detalles);service.reversiones=structuredClone(updated.reversiones);}
    const log=next.auditoria?.[0];if(log){log.userId=actor.id;log.motivo=motivo;log.autorizadoPor=actor.label;}
    state.businesses[actor.companyId]=next;
  }else fail('Acción desconocida',404,'NOT_FOUND');
  audit(state,actor,a.type,company?.id||actor.companyId||a.companyId,{documento:documentId||a.userId||a.id||company?.id||'',motivo:actor.support?.reason||form.motivo||'',antes:before?{name:before.name,startDate:before.startDate,endDate:before.endDate,enabled:before.enabled}:null,despues:company?{name:company.name,startDate:company.startDate,endDate:company.endDate,enabled:company.enabled}:null},now);
  state.revision++;
}

/** Pure request dispatcher shared by the Node server and browser-local demonstration. */
export async function platformRequest(input,request,{now,baseUrl='https://scorta.example'}={}) {
  let state=input;
  const response=(status,body,extra={})=>({state,status,body,...extra});
  try{
    if(!input)fail('Configura SCORTA_OWNER_PASSWORD para preparar la plataforma',503,'SETUP_REQUIRED');
    const method=(request.method||'GET').toUpperCase(),url=new URL(request.path,'https://scorta.example'),path=url.pathname,body=request.body||{};
    const receipt=path.match(/^\/api\/v2\/receipt\/([A-Za-z0-9_-]{43})$/);
    if(method==='GET'&&receipt){const ref=state.receipts[await hash(receipt[1])];if(!ref||ref.expires<=stamp(now).getTime())fail('El enlace del comprobante venció o no existe',404,'RECEIPT_EXPIRED');const company=companyFor(state,ref.companyId),sale=state.businesses[company.id]?.ventas.find(s=>s.id===ref.saleId);if(!sale)fail('Comprobante inexistente',404);return response(200,{company:{name:company.name,logo:company.logo,email:company.email,whatsapp:company.whatsapp,nit:company.nit||'',address:company.address||''},sale:removeCosts(structuredClone(sale)),expiresAt:new Date(ref.expires).toISOString()});}
    if(method==='POST'){
      if(!body||typeof body!=='object'||Array.isArray(body))fail('Datos inválidos');
      state=structuredClone(input);
      for(const [key,s]of Object.entries(state.sessions))if(s.expires<=stamp(now).getTime())delete state.sessions[key];
    }
    const sessionKey=request.token?await hash(request.token):null,session=sessionKey?state.sessions[sessionKey]:null;
    if(path==='/api/v2/login'&&method==='POST'){
      const companyName=norm(body.company),username=norm(body.username),company=state.companies.find(c=>norm(c.name)===companyName||norm(c.slug)===companyName);
      const companyId=companyName===norm(state.ownerCompany)?null:company?.id;
      const key=await hash(companyName+'|'+username+'|'+optionalText(request.clientKey,100));
      const previous=state.loginFailures[key],timestamp=stamp(now).getTime();
      if(previous?.until>timestamp&&previous.count>=10)fail('Demasiados intentos. Espera unos minutos antes de volver a ingresar.',429,'RATE_LIMITED');
      const user=companyId!==undefined?state.users.find(u=>u.companyId===companyId&&norm(u.username)===username&&u.active):null;
      const valid=user&&await verifyPassword(user,body.password);
      if(!valid){state.loginFailures[key]={count:previous?.until>timestamp?previous.count+1:1,until:previous?.until>timestamp?previous.until:timestamp+15*60000};return response(401,{error:'Empresa, usuario o contraseña incorrectos',code:'INVALID_CREDENTIALS'});}
      if(company)assertAccess(company,now);
      delete state.loginFailures[key];if(sessionKey)delete state.sessions[sessionKey];
      const nextToken=token(),nextKey=await hash(nextToken);state.sessions[nextKey]={userId:user.id,version:user.version,expires:timestamp+SESSION_MS};
      return response(200,envelope(state,resolveActor(state,state.sessions[nextKey],now),now,baseUrl),{token:nextToken});
    }
    if(method==='POST'&&path==='/api/v2/logout'){delete state.sessions[sessionKey];return response(200,{ok:true},{token:null});}
    const actor=resolveActor(state,session,now);
    if(method==='GET'&&(path==='/api/v2/reports'||path==='/api/v2/overview')){
      if(!admin(actor))fail('Los reportes requieren un administrador de la empresa.',403,'FORBIDDEN');
      const business=businessContext(state,actor),period=reportDates(url.searchParams.get('from'),url.searchParams.get('to'),dateBogota(now));
      return response(200,{...period,report:path==='/api/v2/overview'?overviewReport(business,period):salesReport(business,period)});
    }
    if(path==='/api/v2/draft'&&method==='GET')return response(200,readDraft(state,actor));
    if(path==='/api/v2/draft'&&method==='POST')return response(200,writeDraft(state,actor,body,stamp(now).getTime()));
    if(method==='GET'&&(path==='/api/v2/session'||path==='/api/v2/data'))return response(200,envelope(state,actor,now,baseUrl));
    if(method==='POST'&&path==='/api/v2/logout'){delete state.sessions[sessionKey];return response(200,{ok:true},{token:null});}
    if(method==='POST'&&path==='/api/v2/password'){
      const user=state.users.find(u=>u.id===actor.id);if(!await verifyPassword(user,body.currentPassword))fail('La contraseña actual no es correcta');
      if(body.newPassword===body.currentPassword)fail('Elige una contraseña diferente a la actual');user.password=await passwordHash(checkPassword(body.newPassword));user.passwordChangedAt=iso(now);user.version++;
      for(const [key,s]of Object.entries(state.sessions))if(s.userId===user.id)delete state.sessions[key];state.revision++;
      audit(state,actor,'password.change',actor.companyId,{documento:actor.id},now);return response(200,{ok:true},{token:null});
    }
    if(method==='POST'&&path==='/api/v2/action'){
      if(typeof body.type!=='string')fail('Acción inválida');
      const fingerprintBody=structuredClone(body);delete fingerprintBody.revision;delete fingerprintBody.requestId;if(fingerprintBody.payload){delete fingerprintBody.payload.revision;delete fingerprintBody.payload.requestId;}
      const contextCompanyId=['support.start','support.end'].includes(body.type)?null:actor.companyId;
      const fingerprint=await hash(JSON.stringify({contextCompanyId,action:fingerprintBody}));
      const requestKey=body.requestId?actor.id+'|'+text(body.requestId,'Identificador',150):null;
      if(requestKey&&state.requests[requestKey]){if(state.requests[requestKey].fingerprint!==fingerprint)fail('El identificador de operación ya fue usado con otros datos');return response(200,envelope(state,actor,now,baseUrl));}
      const expected=actor.companyId?state.businesses[actor.companyId].revision:state.revision;
      if(!body.type.startsWith('ticket.')&&body.revision!=null&&body.revision!==expected)fail('Otro usuario modificó los datos. Actualiza y vuelve a intentar.',409,'REVISION_CONFLICT');
      await applyAction(state,actor,session,body,now,baseUrl);
      if(requestKey)state.requests[requestKey]={fingerprint,createdAt:iso(now)};
      return response(200,envelope(state,resolveActor(state,session,now),now,baseUrl));
    }
    fail('Ruta inexistente',404,'NOT_FOUND');
  }catch(error){
    // A rejected request never leaks or persists partially changed business data.
    state=input;
    const body={error:error.message||'No se pudo completar la operación',...(error.code?{code:error.code}:{})};
    if(error.company){body.company=error.company;body.ownerContact=input?.ownerContact||'';}
    return response(error.status||400,body);
  }
}
