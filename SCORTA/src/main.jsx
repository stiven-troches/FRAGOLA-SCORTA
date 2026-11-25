import React,{Suspense,lazy} from 'react';
import {createRoot} from 'react-dom/client';
import {installDetailsMenus} from './details-menus.mjs';
// Cada pantalla descarga solo su código: el visitante del catálogo no baja el POS completo.
const PlatformApp=lazy(()=>import('./PlatformApp.jsx'));
const PublicCatalog=lazy(()=>import('./PublicCatalog.jsx'));
installDetailsMenus();
const catalog=location.pathname.match(/^\/catalogo\/([^/]+)\/?$/);
// Una URL mal codificada (p. ej. «%E0») no debe dejar la pantalla en blanco.
const slugOf=value=>{try{return decodeURIComponent(value)}catch{return value}};
const loading=<main className="app-loading" role="status" aria-live="polite" style={{display:'grid',placeItems:'center',minHeight:'60vh',fontFamily:'system-ui,sans-serif',color:'#5b6472'}}>Cargando…</main>;
createRoot(document.getElementById('root')).render(<Suspense fallback={loading}>{catalog?<PublicCatalog slug={slugOf(catalog[1])}/>:<PlatformApp/>}</Suspense>);
// PWA: el service worker solo se registra en producción y solo cachea assets versionados.
if(import.meta.env.PROD&&'serviceWorker' in navigator&&location.protocol==='https:'){
 window.addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{})});
}
