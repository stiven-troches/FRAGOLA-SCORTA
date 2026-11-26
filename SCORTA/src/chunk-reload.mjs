// Recuperación de «pantalla en blanco» tras un deploy: una pestaña abierta pide un chunk con hash
// que ya no existe. La decisión de recargar vive aquí, pura, para probarla sin navegador.
export const CHUNK_RELOAD_KEY='scorta:chunk-reload-at';
// Un solo reintento automático por ventana: si tras recargar vuelve a fallar, se muestra el mensaje.
export const CHUNK_RELOAD_WINDOW_MS=60_000;

const CHUNK_PATTERNS=[
 /failed to fetch dynamically imported module/i, // Chrome / Edge
 /error loading dynamically imported module/i, // Firefox
 /importing a module script failed/i, // Safari
 /loading (?:css )?chunk [\w-]+ failed/i, // webpack/rollup
 /unable to preload css/i, // Vite
];
/** ¿El error es de carga de un módulo/chunk dinámico (y no una excepción de render)? */
export function isChunkLoadError(error){
 if(!error)return false;
 if(error.name==='ChunkLoadError')return true;
 const text=typeof error==='string'?error:String(error.message||'');
 return CHUNK_PATTERNS.some(pattern=>pattern.test(text));
}

/** Decide si se permite recargar solo con la marca de tiempo del último reintento. */
export function canAutoReload({now,lastReloadAt,windowMs=CHUNK_RELOAD_WINDOW_MS}){
 if(lastReloadAt==null||lastReloadAt==='')return true;
 const last=Number(lastReloadAt);
 if(!Number.isFinite(last))return true; // marca corrupta: se ignora
 if(last>now)return false; // marca «del futuro» (reloj movido): por prudencia no recargar
 return now-last>=windowMs;
}

/**
 * Hace UN reintento automático (reload) protegido contra bucles. Devuelve true si recargó.
 * Sin sessionStorage utilizable no se puede garantizar que no haya bucle: no recarga.
 */
export function reloadOnceForChunkError({storage,now=Date.now(),reload,windowMs=CHUNK_RELOAD_WINDOW_MS}={}){
 if(typeof reload!=='function')return false;
 let last;
 try{last=storage.getItem(CHUNK_RELOAD_KEY)}catch{return false}
 if(!canAutoReload({now,lastReloadAt:last,windowMs}))return false;
 // La marca se escribe ANTES de recargar; si no se puede escribir, tampoco se recarga.
 try{storage.setItem(CHUNK_RELOAD_KEY,String(now))}catch{return false}
 reload();
 return true;
}

/** Acceso seguro a sessionStorage (puede lanzar en modo privado o con datos bloqueados). */
export function safeSessionStorage(scope=globalThis){try{return scope.sessionStorage||null}catch{return null}}

/** Instala el evento «vite:preloadError» (Vite lo emite si falla la precarga de un chunk). */
export function installChunkErrorRecovery(scope=globalThis){
 if(!scope?.addEventListener)return ()=>{};
 const handler=event=>{
  const storage=safeSessionStorage(scope);
  if(storage&&reloadOnceForChunkError({storage,reload:()=>scope.location.reload()}))event.preventDefault?.();
 };
 scope.addEventListener('vite:preloadError',handler);
 return ()=>scope.removeEventListener('vite:preloadError',handler);
}
