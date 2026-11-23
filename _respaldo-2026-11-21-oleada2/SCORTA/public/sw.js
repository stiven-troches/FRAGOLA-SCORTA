// SCORTA · service worker mínimo (FE-17).
// Solo cachea los assets estáticos con versión (nombre con hash en /assets/).
// Nunca toca /api/, la página HTML ni otras rutas: esas siempre van a la red.
const CACHE='scorta-static-v1';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('scorta-static-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
const versioned=url=>url.origin===self.location.origin&&url.pathname.startsWith('/assets/')&&/-[A-Za-z0-9_-]{6,}\.(?:js|css|png|webp|jpe?g|svg|woff2?)$/.test(url.pathname);
self.addEventListener('fetch',event=>{
  const request=event.request;if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.pathname.startsWith('/api/')||!versioned(url))return;
  event.respondWith(caches.open(CACHE).then(async cache=>{
    const hit=await cache.match(request);if(hit)return hit;
    const response=await fetch(request);
    if(response.ok&&response.type==='basic')cache.put(request,response.clone());
    return response;
  }));
});
