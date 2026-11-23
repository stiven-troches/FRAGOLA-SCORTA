// FE-18: estado de conexión del navegador (eventos online/offline) sin dependencias.
// La app sigue funcionando con los datos ya cargados; el cobro y las acciones exigen servidor.
import {useSyncExternalStore} from 'react';

export const OFFLINE_ACTION_MESSAGE='Sin conexión: esta operación necesita el servidor. Tus datos siguen en pantalla; inténtalo cuando vuelva la conexión.';
export const OFFLINE_SALE_MESSAGE='Sin conexión: el cobro necesita el servidor para confirmar las existencias. El carrito se conserva; cobra cuando vuelva la conexión.';

/** Observa online/offline sobre `target` (window). `onChange(online)` solo se llama cuando cambia. */
export function createConnectivity({target=globalThis.window,navigatorRef=globalThis.navigator}={}){
  let online=navigatorRef?.onLine!==false;const listeners=new Set();
  const set=value=>{if(value===online)return;online=value;for(const listener of [...listeners])try{listener(online)}catch{}};
  const up=()=>set(true),down=()=>set(false);
  target?.addEventListener?.('online',up);target?.addEventListener?.('offline',down);
  return {
    get online(){return online},
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener)},
    stop(){target?.removeEventListener?.('online',up);target?.removeEventListener?.('offline',down);listeners.clear()},
  };
}

let shared=null;
const sharedConnectivity=()=>shared??=createConnectivity();
const serverSnapshot=()=>true;
/** Hook React: true mientras haya conexión. En SSR siempre true. */
export function useOnline(){
  return useSyncExternalStore(
    listener=>typeof window==='undefined'?()=>{}:sharedConnectivity().subscribe(listener),
    ()=>typeof window==='undefined'?true:sharedConnectivity().online,
    serverSnapshot);
}
/** Para código fuera de React (p. ej. antes de enviar una acción). */
export const isOffline=(navigatorRef=globalThis.navigator)=>navigatorRef?.onLine===false;
