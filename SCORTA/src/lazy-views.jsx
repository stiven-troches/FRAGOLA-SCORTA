import React,{lazy} from 'react';
import ErrorBoundary from './ErrorBoundary.jsx';
// Carga por rol: el propietario, las herramientas de administración, el resumen y los
// documentos legales se descargan solo cuando se necesitan. En las compilaciones SSR
// (pruebas) vite.config.mjs sustituye este módulo por lazy-views.ssr.jsx (importación estática).
// Cada vista va dentro de un ErrorBoundary: si su chunk ya no existe (deploy nuevo) o falla el render,
// se muestra «Algo falló · Recargar» en lugar de una pantalla en blanco. El Suspense sigue en quien la usa.
const guarded=(View,name)=>{
 const Guarded=props=><ErrorBoundary><View {...props}/></ErrorBoundary>;
 Guarded.displayName=name;return Guarded;
};
export const OwnerWorkspace=guarded(lazy(()=>import('./OwnerWorkspace.jsx')),'OwnerWorkspace');
export const AdminTools=guarded(lazy(()=>import('./AdminTools.jsx')),'AdminTools');
export const OverviewPanel=guarded(lazy(()=>import('./OverviewPanel.jsx')),'OverviewPanel');
export const LegalDocuments=guarded(lazy(()=>import('./LegalDocuments.jsx')),'LegalDocuments');
