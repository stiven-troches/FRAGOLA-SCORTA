// PUNTO 7: decisión de recarga única ante un error de carga de chunk (sin navegador).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isChunkLoadError,canAutoReload,reloadOnceForChunkError,installChunkErrorRecovery,CHUNK_RELOAD_KEY,CHUNK_RELOAD_WINDOW_MS} from '../src/chunk-reload.mjs';

const memoryStorage=(initial={})=>{const data={...initial};return {data,getItem:key=>key in data?data[key]:null,setItem:(key,value)=>{data[key]=String(value)}}};

test('isChunkLoadError reconoce los mensajes de Chrome, Firefox, Safari, webpack y Vite, y no confunde errores de render',()=>{
 assert.ok(isChunkLoadError(Object.assign(new Error('x'),{name:'ChunkLoadError'})));
 assert.ok(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x.test/assets/OwnerWorkspace-abc123.js')));
 assert.ok(isChunkLoadError(new TypeError('error loading dynamically imported module: https://x.test/a.js')));
 assert.ok(isChunkLoadError(new TypeError('Importing a module script failed.')));
 assert.ok(isChunkLoadError(new Error('Loading chunk 42 failed.')));
 assert.ok(isChunkLoadError(new Error('Unable to preload CSS for /assets/x.css')));
 assert.ok(isChunkLoadError('Failed to fetch dynamically imported module'));
 for(const value of [null,undefined,new Error('Cannot read properties of undefined (reading "map")'),new TypeError('x is not a function'),{},''])assert.equal(isChunkLoadError(value),false);
});

test('canAutoReload: sin marca o con marca vieja o corrupta sí; marca reciente o del futuro no',()=>{
 const now=1_000_000_000;
 assert.equal(canAutoReload({now,lastReloadAt:null}),true);
 assert.equal(canAutoReload({now,lastReloadAt:undefined}),true);
 assert.equal(canAutoReload({now,lastReloadAt:'basura'}),true);
 assert.equal(canAutoReload({now,lastReloadAt:String(now-CHUNK_RELOAD_WINDOW_MS)}),true);
 assert.equal(canAutoReload({now,lastReloadAt:String(now-CHUNK_RELOAD_WINDOW_MS+1)}),false);
 assert.equal(canAutoReload({now,lastReloadAt:String(now-1000)}),false);
 assert.equal(canAutoReload({now,lastReloadAt:String(now+5000)}),false);
});

test('reloadOnceForChunkError recarga UNA vez y deja la marca antes de recargar',()=>{
 const storage=memoryStorage();let reloads=0,markAtReload;const now=5_000_000;
 const reload=()=>{reloads++;markAtReload=storage.data[CHUNK_RELOAD_KEY]};
 assert.equal(reloadOnceForChunkError({storage,now,reload}),true);assert.equal(reloads,1);assert.equal(markAtReload,String(now),'la marca se escribe antes de recargar');
 // Tras recargar, el mismo error ya no vuelve a recargar (sin bucle)...
 assert.equal(reloadOnceForChunkError({storage,now:now+1000,reload}),false);
 assert.equal(reloadOnceForChunkError({storage,now:now+CHUNK_RELOAD_WINDOW_MS-1,reload}),false);assert.equal(reloads,1);
 // ...hasta que pasa la ventana (otro deploy más tarde).
 assert.equal(reloadOnceForChunkError({storage,now:now+CHUNK_RELOAD_WINDOW_MS,reload}),true);assert.equal(reloads,2);
});

test('sin sessionStorage utilizable no recarga (no se puede garantizar que no haya bucle)',()=>{
 let reloads=0;const reload=()=>reloads++;
 const noRead={getItem(){throw new Error('SecurityError')},setItem(){}};
 const noWrite={getItem:()=>null,setItem(){throw new Error('QuotaExceededError')}};
 assert.equal(reloadOnceForChunkError({storage:noRead,reload}),false);
 assert.equal(reloadOnceForChunkError({storage:noWrite,reload}),false);
 assert.equal(reloadOnceForChunkError({storage:null,reload}),false);
 assert.equal(reloadOnceForChunkError({storage:memoryStorage(),reload:undefined}),false);
 assert.equal(reloads,0);
});

test('installChunkErrorRecovery: vite:preloadError recarga una vez y cancela el error; la segunda vez lo deja pasar',()=>{
 const handlers=new Map();let reloads=0;const storage=memoryStorage();
 const scope={sessionStorage:storage,location:{reload:()=>reloads++},addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener:name=>handlers.delete(name)};
 const dispose=installChunkErrorRecovery(scope);
 const fire=()=>{let prevented=false;handlers.get('vite:preloadError')({preventDefault(){prevented=true}});return prevented};
 assert.equal(fire(),true);assert.equal(reloads,1);
 assert.equal(fire(),false,'segundo fallo en la ventana: no recarga ni oculta el error');assert.equal(reloads,1);
 dispose();assert.equal(handlers.has('vite:preloadError'),false);
});
