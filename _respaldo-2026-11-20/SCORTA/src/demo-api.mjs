import {aplicarCambio} from '../inventory.mjs';
import {consultarProductos, consultarMovimientos} from '../consultas.mjs';
import {crearSemillaDemo} from './demo-seed.mjs';

const STATE_KEY='current';
const stores=['state','requests'];
const storageMessage='No se pudo guardar la demo en este navegador. Comprueba que permita almacenar datos del sitio y vuelve a intentar.';
const storageFailure=error=>Object.assign(Error(storageMessage),{status:507,cause:error,storage:true});
const fingerprint=async payload=>{
  const bytes=new TextEncoder().encode(JSON.stringify({kind:payload.kind,form:payload.form,items:payload.items,id:payload.id}));
  return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
};

export async function createDemoStore({indexedDBFactory=globalThis.indexedDB,name='scorta-demo-v1',onStorageError=()=>{}}={}) {
  if(!indexedDBFactory)throw storageFailure(Error('IndexedDB no disponible'));
  const db=await new Promise((resolve,reject)=>{
    let settled=false;
    const request=indexedDBFactory.open(name,1);
    request.onupgradeneeded=()=>{const connection=request.result;connection.createObjectStore('state');connection.createObjectStore('requests',{keyPath:'id'});};
    request.onsuccess=()=>{if(settled){request.result.close();return}settled=true;resolve(request.result)};
    request.onerror=()=>{settled=true;reject(storageFailure(request.error))};
    request.onblocked=()=>{settled=true;reject(Object.assign(Error('Cierra las otras pestañas de esta demo y vuelve a abrirla.'),{status:503,storage:true}))};
  });
  db.onversionchange=()=>db.close();
  const report=error=>{const failure=error?.storage?error:storageFailure(error);onStorageError(failure.message);return failure;};
  // All reads and writes use a transaction shared by both stores. This also serializes tabs.
  const transact=(mode,run)=>new Promise((resolve,reject)=>{
    let tx,value,failure;
    try{tx=db.transaction(stores,mode)}catch(error){reject(report(error));return}
    const fail=error=>{failure=error;try{tx.abort()}catch{reject(error)}};
    tx.oncomplete=()=>resolve(structuredClone(value));
    tx.onabort=()=>reject(failure||report(tx.error));
    tx.onerror=()=>{};
    try{run(tx,{done:result=>{value=result},fail})}catch(error){fail(error)}
  });
  const readState=()=>transact('readonly',(tx,{done,fail})=>{
    const get=tx.objectStore('state').get(STATE_KEY);
    get.onsuccess=()=>{if(!get.result){fail(Error('La demo no está preparada. Vuelve a abrirla.'));return}done(get.result)};
  });
  const initialize=()=>transact('readwrite',(tx,{done,fail})=>{
    const store=tx.objectStore('state'),get=store.get(STATE_KEY);
    get.onsuccess=()=>{try{if(get.result){done(get.result);return}const seed=crearSemillaDemo();store.put(seed,STATE_KEY);done(seed)}catch(error){fail(error)}};
  });
  const change=async payload=>{
    payload=structuredClone(payload);
    const fp=await fingerprint(payload);
    return transact('readwrite',(tx,{done,fail})=>{
      const stateStore=tx.objectStore('state'),requestStore=tx.objectStore('requests');
      const get=stateStore.get(STATE_KEY);
      get.onsuccess=()=>{
        const prior=payload.requestId?requestStore.get(payload.requestId):null;
        const apply=record=>{try{
          if(record){if(record.fingerprint!==fp)throw Error('El identificador de operación ya fue usado con otros datos');done(get.result);return}
          const next=aplicarCambio(get.result,payload,'Demo');
          stateStore.put(next,STATE_KEY);
          if(payload.requestId)requestStore.put({id:payload.requestId,fingerprint:fp});
          done(next);
        }catch(error){fail(error)}};
        if(prior)prior.onsuccess=()=>apply(prior.result);else apply(null);
      };
    });
  };
  const reset=()=>transact('readwrite',(tx,{done,fail})=>{
    const stateStore=tx.objectStore('state'),get=stateStore.get(STATE_KEY);
    get.onsuccess=()=>{try{
      const seed=crearSemillaDemo();
      seed.revision=Math.max(seed.revision,(get.result?.revision||0)+1);
      stateStore.put(seed,STATE_KEY);tx.objectStore('requests').clear();done(seed);
    }catch(error){fail(error)}};
  });
  try{await initialize()}catch(error){db.close();throw error}
  return {readState,change,reset,close:()=>db.close()};
}

export function installDemoFetch(store,{target=globalThis}={}) {
  const originalFetch=target.fetch.bind(target);
  const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
  const actor={username:'Demo',role:'admin',mode:'demo'};
  const replacement=async(input,init={})=>{
    const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,target.location.href);
    if(url.origin!==target.location.origin||!url.pathname.startsWith('/api/'))return originalFetch(input,init);
    const method=(init.method||(typeof input==='object'&&input.method)||'GET').toUpperCase();
    try{
      if(method==='GET'&&url.pathname==='/api/session')return json(actor);
      if(method==='GET'&&url.pathname==='/api/state')return json(await store.readState());
      if(method==='POST'&&url.pathname==='/api/change'){
        const body=init.body??(input instanceof Request?await input.clone().text():'');
        let payload;try{payload=JSON.parse(body)}catch{throw Error('Datos inválidos: envía un objeto JSON')}
        if(!payload||Array.isArray(payload)||typeof payload!=='object')throw Error('Datos inválidos: envía un objeto JSON');
        return json(await store.change(payload));
      }
      if(method==='GET'&&url.pathname==='/api/backup')return json(await store.readState());
      if(method==='GET'&&url.pathname==='/api/productos')return json(consultarProductos(await store.readState(),url.searchParams));
      if(method==='GET'&&url.pathname==='/api/movimientos')return json(consultarMovimientos(await store.readState(),url.searchParams));
      const match=url.pathname.match(/^\/api\/productos\/([^/]+)(\/movimientos)?$/);
      if(method==='GET'&&match){const state=await store.readState(),id=decodeURIComponent(match[1]),product=state.prods.find(p=>p.id===id);if(!product)return json({error:'Producto inexistente'},404);return json(match[2]?consultarMovimientos(state,url.searchParams,id):product)}
      return json({error:'Esta función de cuentas o respaldo del servidor no se utiliza en la demo. Usa las opciones de datos de prueba.'},404);
    }catch(error){return json({error:error.message||'No se pudo completar la operación de prueba'},error.status||400)}
  };
  target.fetch=replacement;
  return()=>{if(target.fetch===replacement)target.fetch=originalFetch};
}

export async function exportDemoData(store) {
  const state=await store.readState();
  const payload={...state,demostracion:true,descripcion:'Datos ficticios de SCORTA; no son inventario real.'};
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download='scorta-demo-'+new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())+'.json';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
