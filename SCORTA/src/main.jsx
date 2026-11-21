import React from 'react';
import {createRoot} from 'react-dom/client';
import PlatformApp from './PlatformApp.jsx';
import {installDetailsMenus} from './details-menus.mjs';
installDetailsMenus();
createRoot(document.getElementById('root')).render(<PlatformApp/>);
// PWA: el service worker solo se registra en producción y solo cachea assets versionados.
if(import.meta.env.PROD&&'serviceWorker' in navigator&&location.protocol==='https:'){
 window.addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{})});
}
