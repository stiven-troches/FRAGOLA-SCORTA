import React from 'react';
import {createRoot} from 'react-dom/client';
import PlatformApp from './PlatformApp.jsx';
import PublicCatalog from './PublicCatalog.jsx';
import {installDetailsMenus} from './details-menus.mjs';
installDetailsMenus();
const catalog=location.pathname.match(/^\/catalogo\/([^/]+)\/?$/);
createRoot(document.getElementById('root')).render(catalog?<PublicCatalog slug={decodeURIComponent(catalog[1])}/>:<PlatformApp/>);
// PWA: el service worker solo se registra en producción y solo cachea assets versionados.
if(import.meta.env.PROD&&'serviceWorker' in navigator&&location.protocol==='https:'){
 window.addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{})});
}
