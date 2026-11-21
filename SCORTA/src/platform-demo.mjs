import {installJETrial} from './je-trial-demo.mjs';
import {createPlatform, platformRequest} from '../platform.mjs';
import {crearSemillaDemo} from './demo-seed.mjs';
import {aplicarCambio, estadoVacio} from '../inventory.mjs';

// Número de WhatsApp comercial para «Pedir prueba por WhatsApp» (solo dígitos con indicativo, p. ej. 573001234567).
// TODO dueño: escribir aquí el número comercial. Mientras esté vacío, el botón no se muestra.
export const DEMO_CONTACT_WHATSAPP = '';
export const DEMO_CONTACT_MESSAGE = 'Hola, probé la demo de SCORTA y quiero una prueba para mi almacén de repuestos.';
export const demoWhatsappLink = (number = DEMO_CONTACT_WHATSAPP, message = DEMO_CONTACT_MESSAGE) => {const digits = String(number || '').replace(/\D/g, ''); return digits.length >= 11 && digits.length <= 15 ? 'https://wa.me/' + digits + '?text=' + encodeURIComponent(message) : '';};

// Public credentials are exclusively for this fictitious, browser-local demo.
// The production entry never imports this module or creates these accounts.
export const DEMO_ACCOUNTS = Object.freeze({
  owner: Object.freeze({company:'Fragola', username:'Steven', password:'Demo.Propietario.2026'}),
  admin: Object.freeze({company:'Moto Norte', username:'admin', password:'Demo.Administrador.2026'}),
  vendedor: Object.freeze({company:'Moto Norte', username:'vendedor', password:'Demo.Vendedor.2026'}),
});
export const PLATFORM_DEMO_DATABASE = 'scorta-platform-demo-v1';
const RECORD_KEY='platform';
const storageMessage='No se pudo guardar la demo en este navegador. Permite el almacenamiento del sitio y vuelve a intentar.';
const storageFailure=error=>Object.assign(Error(storageMessage),{status:507,storage:true,cause:error});
const date = value=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));

export async function createPlatformDemoSeed({now=Date.now()}={}) {
  const timestamp=typeof now==='function'?now():Number(now);
  let state=await createPlatform({owner:{...DEMO_ACCOUNTS.owner,name:'Steven'},ownerContact:'Demostración de SCORTA · datos ficticios'});
  let token;
  const perform=async(method,path,body,authToken=token)=>{
    const result=await platformRequest(state,{method,path,body,token:authToken},{now:timestamp,baseUrl:'https://demo.example'});
    if(result.status>=400)throw Error('No se pudo preparar la demo: '+(result.body?.error||result.status));
    state=result.state;
    if(Object.hasOwn(result,'token'))token=result.token;
    return result.body;
  };
  await perform('POST','/api/v2/login',DEMO_ACCOUNTS.owner);
  const startDate=date(timestamp-86400000),endDate=date(timestamp+90*86400000);
  let owner=await perform('POST','/api/v2/action',{type:'company.create',requestId:'seed-company-norte',form:{name:'Moto Norte',contact:'Laura Gómez',email:'laura@example.com',whatsapp:'+573001234567',startDate,endDate,monthlyFee:79000,username:'admin',password:DEMO_ACCOUNTS.admin.password,adminName:'Laura Gómez'}});
  const north=owner.companies.find(company=>company.name==='Moto Norte');
  await perform('POST','/api/v2/action',{type:'user.create',companyId:north.id,requestId:'seed-vendedor',form:{username:'vendedor',password:DEMO_ACCOUNTS.vendedor.password,name:'Juan Pérez',role:'vendedor'}});
  owner=await perform('POST','/api/v2/action',{type:'company.create',requestId:'seed-company-sur',form:{name:'Moto Sur',contact:'Camilo Ruiz',email:'camilo@example.com',whatsapp:'+573009876543',startDate,endDate,monthlyFee:79000,username:'adminsur',password:'Demo.MotoSur.2026',adminName:'Camilo Ruiz'}});
  const south=owner.companies.find(company=>company.name==='Moto Sur');
  // BE-37: ejemplo de plan con límites y sin garantías ni órdenes de compra (Moto Norte queda sin límites).
  await perform('POST','/api/v2/action',{type:'company.plan',companyId:south.id,requestId:'seed-plan-sur',form:{maxUsers:3,maxProducts:100,maxPhotos:20,features:['credito','cotizaciones','iva']}});
  // Seeding is the only point at which a private business state is attached directly.
  // Its stock and opening ledger come from the same inventory engine as production.
  const legacy=crearSemillaDemo();
  state.businesses[north.id]={...legacy,customers:[],vehicles:[]};
  // A second isolated catalog makes cross-company separation visible in the demo.
  let other=estadoVacio();
  for(const product of legacy.prods.slice(0,4))other=aplicarCambio(other,{kind:'producto',revision:other.revision,form:{...product,id:undefined}},'Demo');
  state.businesses[south.id]={...other,customers:[],vehicles:[]};
  await perform('POST','/api/v2/logout',{});
  // The fictitious administrators accept the current terms so the demo opens directly.
  await perform('POST','/api/v2/login',{company:'Moto Sur',username:'adminsur',password:'Demo.MotoSur.2026'});
  await perform('POST','/api/v2/action',{type:'terms.accept',requestId:'seed-terms-sur',form:{}});
  await perform('POST','/api/v2/logout',{});
  await perform('POST','/api/v2/login',DEMO_ACCOUNTS.admin);
  await perform('POST','/api/v2/action',{type:'terms.accept',requestId:'seed-terms-norte',form:{}});
  const withMechanic=await perform('POST','/api/v2/action',{type:'mechanic.create',requestId:'seed-mechanic-carlos',form:{name:'Carlos Ramírez',percentage:60}});
  const mechanic=withMechanic.state.mechanics.find(item=>item.name==='Carlos Ramírez');
  // BE-19 / BE-36: ficha reutilizable de un taller con precios de mecánico (datos ficticios).
  const withCustomer=await perform('POST','/api/v2/action',{type:'customer.create',requestId:'seed-customer-taller',form:{nombre:'Taller El Pistón (ficticio)',telefono:'+573005550101',tipoDocumento:'NIT',numeroDocumento:'900123456-1',tipo:'mecanico',dataConsent:true,consentMedium:'escrito',creditLimit:800000,creditDays:30}});
  const workshop=withCustomer.state.customerRecords.find(item=>item.numeroDocumento==='900123456-1');
  // BE-15: apertura de caja del día con base en efectivo.
  await perform('POST','/api/v2/action',{type:'cash.open',requestId:'seed-cash-open',form:{amount:150000,motivo:'Base del día'}});
  // BE-35: plazo de garantía de las pastillas de freno y del kit LED.
  for(const [reference,days] of [['REP-001',90],['LED-001',180]]){const current=state.businesses[north.id],item=current.prods.find(p=>p.referencia===reference);await perform('POST','/api/v2/action',{type:'business.change',requestId:'seed-warranty-days-'+reference,revision:current.revision,payload:{kind:'producto',form:{...item,garantia_dias:days}}});}
  // BE-40: proveedores ficticios, orden desde «Preparar reposición» recibida en parte a crédito y otra en borrador.
  const withSuppliers=await perform('POST','/api/v2/action',{type:'supplier.create',requestId:'seed-supplier-motor',form:{nombre:'Distribuidora Motor Uno (ficticia)',nit:'900765432-1',contacto:'Andrés Pardo',telefono:'+573105550202',correo:'pedidos@example.com',plazoDias:30}});
  const motor=withSuppliers.state.suppliers[0];
  await perform('POST','/api/v2/action',{type:'supplier.create',requestId:'seed-supplier-moto-sur',form:{nombre:'Importadora Vía (ficticia)',nit:'901222333-4',contacto:'Diana Rojas',telefono:'+573115550303',plazoDias:0}});
  const low=state.businesses[north.id].prods.filter(p=>['VIS-001','SEG-002','ESP-002','REP-002'].includes(p.referencia)).map(p=>({producto_id:p.id,cantidad:Math.max(1,p.stock_minimo*2-p.stock),costo:p.precio_compra}));
  const ordered=await perform('POST','/api/v2/action',{type:'po.create',requestId:'seed-po-reposicion',form:{supplierId:motor.id,origen:'reposicion',enviar:true,nota:'Pedido de reposición (ejemplo)',items:low}});
  const order=ordered.state.purchaseOrders[0];
  await perform('POST','/api/v2/action',{type:'po.receive',requestId:'seed-po-recepcion',id:order.id,form:{factura:'FV-1001',credito:true,items:order.items.slice(0,2).map(item=>({producto_id:item.producto_id,cantidad:item.cantidad}))}});
  await perform('POST','/api/v2/action',{type:'payable.payment',requestId:'seed-pago-proveedor',form:{supplierId:motor.id,amount:50000,method:'transferencia',nota:'Abono de ejemplo'}});
  const led=state.businesses[north.id].prods.find(p=>p.referencia==='LED-001');
  await perform('POST','/api/v2/action',{type:'po.create',requestId:'seed-po-borrador',form:{proveedor:'Luz Moto (ficticio)',items:[{producto_id:led.id,cantidad:6,costo:46000}]}});
  await perform('POST','/api/v2/logout',{});
  await perform('POST','/api/v2/login',DEMO_ACCOUNTS.vendedor);
  const product=state.businesses[north.id].prods.find(product=>product.referencia==='REP-001');
  await perform('POST','/api/v2/action',{type:'sale.create',requestId:'seed-sale-service',form:{fecha:date(timestamp),cliente:'Ana Torres',telefono:'+573001112233',placa:'ABC12D',paymentMethod:'efectivo',dataConsent:true,consentMedium:'verbal'},items:[{producto_id:product.id,cantidad:1,precio_unitario:product.precio_venta}],labor:[{descripcion:'Cambio de pastillas de freno delanteras',mecanico:'Carlos Ramírez',mecanicoId:mechanic.id,importe:30000}]});
  // BE-04 / FE-06: venta al taller con su lista de precios, descuento de 5 % (dentro del tope
  // del vendedor) y pago dividido entre efectivo y Nequi con vueltas.
  const oil=state.businesses[north.id].prods.find(product=>product.referencia==='ACE-001');
  await perform('POST','/api/v2/action',{type:'sale.create',requestId:'seed-sale-workshop',form:{fecha:date(timestamp),cliente:workshop.nombre,telefono:workshop.telefono,placa:'',customerId:workshop.id,paymentMethod:'efectivo',payments:[{method:'efectivo',amount:40000},{method:'nequi',amount:24600}],efectivo_recibido:50000},items:[{producto_id:oil.id,cantidad:2,precio:oil.precios.mecanico,descuento:{tipo:'porcentaje',valor:5},precio_unitario:32300}],labor:[]});
  await perform('POST','/api/v2/action',{type:'sale.create',requestId:'seed-sale-labor',form:{fecha:date(timestamp),cliente:'Ana Torres',telefono:'+573001112233',placa:'ABC12D',paymentMethod:'transferencia'},items:[],labor:[{descripcion:'Revisión y ajuste de frenos',mecanico:'Carlos Ramírez',mecanicoId:mechanic.id,importe:20000}]});
  // BE-16: venta al taller parte de contado y parte a crédito, y un abono a su cuenta.
  const pads=state.businesses[north.id].prods.find(product=>product.referencia==='REP-001');
  await perform('POST','/api/v2/action',{type:'sale.create',requestId:'seed-sale-credit',form:{fecha:date(timestamp),cliente:workshop.nombre,telefono:workshop.telefono,placa:'',customerId:workshop.id,paymentMethod:'credito',payments:[{method:'efectivo',amount:20000},{method:'credito',amount:100000}]},items:[{producto_id:pads.id,cantidad:4,precio:pads.precios.mecanico,precio_unitario:pads.precios.mecanico}],labor:[]});
  await perform('POST','/api/v2/action',{type:'credit.payment',requestId:'seed-credit-payment',form:{customerId:workshop.id,amount:40000,method:'nequi'}});
  // BE-15: gasto menor del vendedor (dentro del tope).
  await perform('POST','/api/v2/action',{type:'cash.expense',requestId:'seed-cash-expense',form:{amount:12000,method:'efectivo',motivo:'Almuerzo del mostrador'}});
  // BE-34: casco separado con abono inicial; la unidad queda reservada.
  const helmet=state.businesses[north.id].prods.find(product=>product.referencia==='CAS-002');
  await perform('POST','/api/v2/action',{type:'layaway.create',requestId:'seed-layaway',form:{cliente:'Sofía Martínez',telefono:'+573004445566',dataConsent:true,items:[{producto_id:helmet.id,cantidad:1}],deposit:{amount:100000,method:'efectivo'}}});
  // BE-17: cotización vigente para el taller (precios de mecánico) y otra convertida en venta.
  const lube=state.businesses[north.id].prods.find(product=>product.referencia==='LUB-001');
  await perform('POST','/api/v2/action',{type:'quote.create',requestId:'seed-quote-taller',form:{customerId:workshop.id,nota:'Pedido mensual del taller (ejemplo)',items:[{producto_id:oil.id,cantidad:6,precio:oil.precios.mecanico},{producto_id:lube.id,cantidad:2,precio:lube.precios.mecanico}]}});
  const quoted=await perform('POST','/api/v2/action',{type:'quote.create',requestId:'seed-quote-ana',form:{cliente:'Ana Torres',telefono:'+573001112233',dataConsent:true,items:[{producto_id:led.id,cantidad:1,precio:led.precio_venta}]}});
  await perform('POST','/api/v2/action',{type:'quote.convert',requestId:'seed-quote-convert',id:quoted.state.quotes[0].id,form:{paymentMethod:'nequi'}});
  // BE-35: garantía recibida por el vendedor sobre la venta con servicio (pastillas de freno).
  const serviceSale=state.businesses[north.id].ventas.find(sale=>sale.placa==='ABC12D'&&sale.detalles.length);
  await perform('POST','/api/v2/action',{type:'warranty.create',requestId:'seed-warranty',form:{saleId:serviceSale.id,lineIndex:0,cantidad:1,motivo:'Las pastillas chillan al frenar (ejemplo)'}});
  await perform('POST','/api/v2/logout',{});
  // El administrador decide la garantía (cambio) y la envía al proveedor.
  await perform('POST','/api/v2/login',DEMO_ACCOUNTS.admin);
  const warranty=state.businesses[north.id].warranties[0];
  await perform('POST','/api/v2/action',{type:'warranty.decide',requestId:'seed-warranty-decide',id:warranty.id,form:{decision:'cambio',nota:'Se entregó otro juego'}});
  await perform('POST','/api/v2/action',{type:'warranty.status',requestId:'seed-warranty-send',id:warranty.id,form:{estado:'enviada',supplierId:motor.id,nota:'Guía de ejemplo 001'}});
  await perform('POST','/api/v2/logout',{});
  // No signed-in session is shipped in the prepared seed.
  return installJETrial(state,{now:timestamp});
}

function publicExport(state) {
  const scrub=value=>Array.isArray(value)?value.map(scrub):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key])=>!/(?:password|salt|digest|hash|token|session|request|receiptUrl|receipt_url)/i.test(key)).map(([key,item])=>[key,scrub(item)])):value;
  return {demostracion:true,descripcion:'Datos ficticios de SCORTA guardados únicamente en este navegador.',exportedAt:new Date().toISOString(),revision:state.revision,companies:scrub(state.companies||[]),users:(state.users||[]).map(({id,companyId,username,name,role,active,createdAt})=>({id,companyId,username,name,role,active,createdAt})),businesses:scrub(state.businesses||{}),payments:scrub(state.payments||[]),audit:scrub(state.audit||[])};
}

export async function createPlatformDemoStore({indexedDBFactory=globalThis.indexedDB,name=PLATFORM_DEMO_DATABASE,onStorageError=()=>{},seedFactory=createPlatformDemoSeed,requestFactory=platformRequest,lockManager=globalThis.navigator?.locks,tokenStorage}={}) {
  if(!indexedDBFactory)throw storageFailure(Error('IndexedDB no disponible'));
  const db=await new Promise((resolve,reject)=>{
    let settled=false;
    const opening=indexedDBFactory.open(name,1);
    opening.onupgradeneeded=()=>opening.result.createObjectStore('records');
    opening.onsuccess=()=>{if(settled){opening.result.close();return}settled=true;resolve(opening.result)};
    opening.onerror=()=>{settled=true;reject(storageFailure(opening.error))};
    opening.onblocked=()=>{settled=true;reject(Object.assign(Error('Cierra las otras pestañas de esta demo y vuelve a intentar.'),{storage:true,status:503}))};
  });
  db.onversionchange=()=>db.close();
  // Only the opaque DEMO session credential is remembered here. Production uses an HttpOnly cookie.
  const tokenKey='scorta:demo-session:'+name;
  let remember=null;
  try{remember=tokenStorage===null?null:tokenStorage??globalThis.localStorage??null}catch{onStorageError('No se pudo recordar la sesión de prueba. El acceso se conservará solo mientras esta pestaña esté abierta.');}
  let token=null,closed=false,queue=Promise.resolve();
  try{const saved=remember?.getItem(tokenKey);if(/^[A-Za-z0-9_-]{43}$/.test(saved||''))token=saved;else if(saved)remember.removeItem(tokenKey)}catch{onStorageError('No se pudo leer la sesión de prueba guardada. Vuelve a ingresar.');}
  const setToken=(next,{forceClear=false}={})=>{
    const previous=token;
    token=typeof next==='string'&&/^[A-Za-z0-9_-]{43}$/.test(next)?next:null;
    try{
      if(token)remember?.setItem(tokenKey,token);
      else if(forceClear||remember?.getItem(tokenKey)===previous)remember?.removeItem(tokenKey);
    }catch{onStorageError('No se pudo recordar la sesión de prueba. El acceso se conservará solo mientras esta pestaña esté abierta.');}
  };
  const report=error=>{const failure=error?.storage?error:storageFailure(error);onStorageError(failure.message);return failure;};
  const serial=work=>{const run=()=>{if(closed)throw report(Error('La demo está cerrada'));return work()};const result=queue.then(()=>lockManager?.request?lockManager.request('scorta-demo:'+name,{mode:'exclusive'},run):run());queue=result.catch(()=>{});return result;};
  const transaction=(mode,run)=>new Promise((resolve,reject)=>{
    let tx,result,failure;
    try{tx=db.transaction('records',mode)}catch(error){reject(report(error));return}
    tx.oncomplete=()=>resolve(result);
    tx.onabort=()=>reject(failure||report(tx.error));
    tx.onerror=()=>{};
    try{run(tx.objectStore('records'),value=>{result=value},error=>{failure=error;try{tx.abort()}catch{reject(error)}})}catch(error){failure=error;try{tx.abort()}catch{reject(error)}}
  });
  const read=()=>transaction('readonly',(records,done)=>{const get=records.get(RECORD_KEY);get.onsuccess=()=>done(get.result)});
  const compareAndSet=(expected,next)=>transaction('readwrite',(records,done)=>{
    const get=records.get(RECORD_KEY);
    get.onsuccess=()=>{
      if((get.result?.storageVersion??null)!==expected){done(false);return}
      records.put({storageVersion:(expected??0)+1,state:next},RECORD_KEY);done(true);
    };
  });
  try{
    // Add the approved trial company without resetting an existing demo or session.
    let prepared=false;
    for(let attempt=0;attempt<12;attempt++){
      const existing=await read();
      if(!existing){await compareAndSet(null,await seedFactory());continue;}
      const next=installJETrial(existing.state);
      if(next===existing.state||await compareAndSet(existing.storageVersion,next)){prepared=true;break;}
    }
    if(!prepared)throw Object.assign(Error('La demo cambió en otra pestaña. Recarga para preparar la empresa de prueba.'),{storage:true,status:409});
  }catch(error){db.close();throw error}

  const request=(input,{baseUrl=globalThis.location?.origin||'https://demo.example',now}={})=>serial(async()=>{
    const snapshotInput=structuredClone(input);
    for(let attempt=0;attempt<12;attempt++){
      const record=await read();
      if(!record)throw report(Error('La demo no está preparada'));
      // Same customer-data rule as production (BE-05): phone or plate needs dataConsent.
      const result=await requestFactory(record.state,{...snapshotInput,token},{baseUrl,requireDataConsent:true,...(now===undefined?{}:{now})});
      // GETs that return the same immutable state need no write or transaction upgrade.
      if(result.state!==record.state&&!await compareAndSet(record.storageVersion,result.state))continue;
      if(Object.hasOwn(result,'token'))setToken(result.token);
      if(result.status===401&&snapshotInput.path!=='/api/v2/login')setToken(null);
      return {status:result.status,body:structuredClone(result.body)};
    }
    return {status:409,body:{error:'La demo cambió en otra pestaña. Actualiza los datos y vuelve a intentar.'}};
  });
  const reset=()=>serial(async()=>{
    const seed=await seedFactory();
    await transaction('readwrite',(records,done)=>{const get=records.get(RECORD_KEY);get.onsuccess=()=>{records.put({storageVersion:(get.result?.storageVersion||0)+1,state:seed},RECORD_KEY);done(true)}});
    setToken(null,{forceClear:true});
  });
  const exportData=()=>serial(async()=>publicExport((await read()).state));
  const loginAs=async role=>{
    if(!Object.hasOwn(DEMO_ACCOUNTS,role))throw Error('Perfil de demostración desconocido');
    const result=await request({method:'POST',path:'/api/v2/login',body:DEMO_ACCOUNTS[role]});
    if(result.status>=400)throw Error((result.body?.error||'No se pudo abrir el perfil')+'. Si cambiaste su contraseña de prueba, entra manualmente o reinicia la demo.');
    return result.body;
  };
  return {request,reset,loginAs,exportData,close(){closed=true;token=null;db.close()}};
}

export function installPlatformDemoFetch(store,{target=globalThis}={}) {
  const original=target.fetch.bind(target);
  const json=(body,status)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
  const replacement=async(input,init={})=>{
    const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,target.location.href);
    if(url.origin!==target.location.origin||(!url.pathname.startsWith('/api/')&&!url.pathname.startsWith('/receipt/')))return original(input,init);
    if(!url.pathname.startsWith('/api/v2/')&&!url.pathname.startsWith('/receipt/'))return json({error:'Esta ruta no pertenece a la demo de plataforma.'},404);
    const method=String(init.method||(input instanceof Request?input.method:'GET')).toUpperCase();
    let body;
    try{
      if(!['GET','HEAD'].includes(method)){
        const raw=init.body??(input instanceof Request?await input.clone().text():'{}');
        body=typeof raw==='string'?JSON.parse(raw):raw;
        if(!body||Array.isArray(body)||typeof body!=='object')return json({error:'Datos inválidos: envía un objeto JSON.'},400);
      }
      const path=url.pathname.startsWith('/receipt/')?'/api/v2'+url.pathname:url.pathname;
      const headers=new Headers(init.headers||(input instanceof Request?input.headers:undefined));
      const context=headers.get('X-SCORTA-Company');
      const result=await store.request({method,path:url.search?path+url.search:path,body,enforceContext:true,...(context!==null?{expectedCompanyId:context}:{})},{baseUrl:target.location.origin});
      // Static hosting needs links that open the same index entry rather than a server route.
      const shape=structuredClone(result.body);
      if(shape?.companies)for(const company of shape.companies)company.url=target.location.origin+'/?empresa='+encodeURIComponent(company.slug);
      if(shape?.session?.company)shape.session.company.url=target.location.origin+'/?empresa='+encodeURIComponent(shape.session.company.slug);
      if(shape?.state?.ventas)for(const sale of shape.state.ventas)if(sale.receiptToken)sale.receiptUrl=target.location.origin+'/#/receipt/'+encodeURIComponent(sale.receiptToken);
      if(shape?.receiptLink?.token)shape.receiptLink.url=target.location.origin+'/#/receipt/'+encodeURIComponent(shape.receiptLink.token);
      return json(shape,result.status);
    }catch(error){return json({error:error.message||'No se pudo completar la operación de prueba.'},error.status||400)}
  };
  target.fetch=replacement;
  return()=>{if(target.fetch===replacement)target.fetch=original};
}

export async function exportPlatformDemoData(store) {
  const payload=await store.exportData();
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download='scorta-demo-'+date(Date.now())+'.json';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
