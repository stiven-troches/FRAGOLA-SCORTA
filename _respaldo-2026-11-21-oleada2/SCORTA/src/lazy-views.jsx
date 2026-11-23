import {lazy} from 'react';
// Carga por rol: el propietario, las herramientas de administración, el resumen y los
// documentos legales se descargan solo cuando se necesitan. En las compilaciones SSR
// (pruebas) vite.config.mjs sustituye este módulo por lazy-views.ssr.jsx (importación estática).
export const OwnerWorkspace=lazy(()=>import('./OwnerWorkspace.jsx'));
export const AdminTools=lazy(()=>import('./AdminTools.jsx'));
export const OverviewPanel=lazy(()=>import('./OverviewPanel.jsx'));
export const LegalDocuments=lazy(()=>import('./LegalDocuments.jsx'));
