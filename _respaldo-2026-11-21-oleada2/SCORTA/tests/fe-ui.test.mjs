import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'vite';

// Static SSR only: no server or browser. The lazy views load statically in SSR builds.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
let directory,components;
before(async()=>{
 mkdirSync(join(root,'test-results'),{recursive:true});directory=mkdtempSync(join(root,'test-results','fe-ui-'));
 const entry=join(directory,'entry.mjs');
 writeFileSync(entry,`export {default as ClientWorkspace} from ${JSON.stringify(join(root,'src/ClientWorkspace.jsx'))};\nexport {default as Dialog} from ${JSON.stringify(join(root,'src/Dialog.jsx'))};\nexport {default as LegalDocuments} from ${JSON.stringify(join(root,'src/LegalDocuments.jsx'))};\nexport {default as SubscriptionPanel} from ${JSON.stringify(join(root,'src/SubscriptionPanel.jsx'))};\nexport {whatsappLink} from ${JSON.stringify(join(root,'src/OwnerWorkspace.jsx'))};\n`);
 const result=await build({root,logLevel:'silent',build:{ssr:entry,write:false,minify:false}});
 const output=(Array.isArray(result)?result[0]:result).output,chunk=output.find(item=>item.type==='chunk'&&item.isEntry);
 assert.equal(output.filter(item=>item.type==='chunk').length,1,'El bundle SSR no debe partirse en trozos perezosos');
 const modulePath=join(directory,'components.mjs');writeFileSync(modulePath,chunk.code);components=await import(pathToFileURL(modulePath).href);
});
after(()=>{if(directory)rmSync(directory,{recursive:true,force:true})});
const company={id:'c1',name:'Moto Nueva'};
const props=(role,state={})=>({session:{userId:'u1',username:'ana',name:'Ana',role,companyId:'c1',company},data:{revision:1,company,state:{prods:[],ventas:[],compras:[],servs:[],movimientos:[],mechanics:[],...state}},onAction:async()=>({}),onRefresh:async()=>({}),onProfile(){},onLogout(){}});

test('FE-08: el administrador de una empresa sin productos ve el asistente de primer uso',()=>{
 const html=renderToStaticMarkup(React.createElement(components.ClientWorkspace,props('admin')));
 for(const text of ['Primeros pasos','Logo de la empresa','Registrar mecánicos','Importar inventario','Crear el primer producto','Probar una venta','Ocultar asistente','0 de 5 pasos'])assert.ok(html.includes(text),text);
 assert.match(html,/Lo configura el propietario/);
 const seller=renderToStaticMarkup(React.createElement(components.ClientWorkspace,props('vendedor')));assert.doesNotMatch(seller,/Primeros pasos/);
});

test('FE-03 / FE-20: Nueva venta muestra el aviso de datos del cliente y los atajos de teclado',()=>{
 const html=renderToStaticMarkup(React.createElement(components.ClientWorkspace,props('vendedor')));
 assert.ok(html.includes('Si registras teléfono o placa, confirma en el cobro que el cliente autorizó el tratamiento de sus datos.'));
 assert.match(html,/aria-keyshortcuts="F9"/);assert.match(html,/F2 buscar/);assert.match(html,/Alt\+1/);
});

test('FE-15: el diálogo común enlaza el título con un id único y es modal',()=>{
 const html=renderToStaticMarkup(React.createElement(React.Fragment,null,
  React.createElement(components.Dialog,{title:'Uno',onClose(){}},'a'),React.createElement(components.Dialog,{title:'Dos',onClose(){}},'b')));
 const ids=[...html.matchAll(/aria-labelledby="([^"]+)"/g)].map(match=>match[1]);
 assert.equal(ids.length,2);assert.notEqual(ids[0],ids[1]);
 for(const id of ids)assert.ok(html.includes(`id="${id}"`));
 assert.match(html,/role="dialog"/);assert.match(html,/aria-modal="true"/);
});

test('FE-03: los textos legales se marcan como borrador pendiente de revisión jurídica',()=>{
 const html=renderToStaticMarkup(React.createElement(components.LegalDocuments,{company:{name:'Moto'},onClose(){},initialTab:'privacy'}));
 assert.match(html,/Borrador pendiente de revisión jurídica/);assert.match(html,/Política de privacidad/);
});

test('FE-04: la mensualidad muestra un solo indicador de moneda',()=>{
 const html=renderToStaticMarkup(React.createElement(components.SubscriptionPanel,{session:{role:'admin',company:{name:'Moto',status:'active',monthlyFee:80000}}}));
 assert.match(html.replace(/ /g,' '),/COP 80\.000/);assert.doesNotMatch(html,/\$/);
});

test('FE-09: el recordatorio abre wa.me con los dígitos y el mensaje codificado',()=>{
 assert.equal(components.whatsappLink('300 123 4567','Hola & pago'),'https://wa.me/573001234567?text=Hola%20%26%20pago');
 assert.equal(components.whatsappLink('','Hola'),'');
});
