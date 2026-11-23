import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'vite';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
let temporary,components;
before(async()=>{
 mkdirSync(join(root,'test-results'),{recursive:true});temporary=mkdtempSync(join(root,'test-results','support-ui-'));
 const entry=join(temporary,'entry.mjs');writeFileSync(entry,`export {default as SupportTickets,supportUnread} from ${JSON.stringify(join(root,'src/SupportTickets.jsx'))};\nexport {Profile} from ${JSON.stringify(join(root,'src/PlatformApp.jsx'))};\nexport {default as OwnerWorkspace} from ${JSON.stringify(join(root,'src/OwnerWorkspace.jsx'))};\n`);
 const result=await build({root,logLevel:'silent',build:{ssr:entry,write:false,minify:false}}),output=(Array.isArray(result)?result[0]:result).output,chunk=output.find(value=>value.type==='chunk'&&value.isEntry);
 const compiled=join(temporary,'components.mjs');writeFileSync(compiled,chunk.code);components=await import(pathToFileURL(compiled).href);
});
after(()=>{if(temporary)rmSync(temporary,{recursive:true,force:true})});
const render=(Component,props)=>renderToStaticMarkup(React.createElement(Component,props));
const session={userId:'seller-1',username:'vendedor',name:'Juan Pérez',role:'vendedor',company:{id:'company-1',name:'Moto Norte'},companyId:'company-1'};
const ticket={id:'ticket-1',companyId:'company-1',createdBy:'seller-1',creatorName:'Juan Pérez',title:'La venta no termina',description:'Se conservó el carrito',status:'open',createdAt:'2026-11-20T12:00:00Z',updatedAt:'2026-11-20T12:00:00Z',messages:[],unreadCount:2};

test('SSR soporte: administrador y vendedor pueden crear ticket desde perfil y ven el contador',()=>{
 for(const role of ['admin','vendedor']){
  const html=render(components.Profile,{session:{...session,role},data:{tickets:[ticket]},onClose(){},onAction(){}});
  assert.match(html,/Crear ticket/);assert.match(html,/Ver tickets y respuestas/);assert.match(html,/2 sin leer/);
 }
 const owner=render(components.Profile,{session:{username:'Steven',role:'owner'},data:{tickets:[ticket]},onClose(){}});assert.doesNotMatch(owner,/Crear ticket/);
});

test('SSR soporte: formulario accesible identifica al usuario y empresa sin pedirlos de nuevo',()=>{
 const html=render(components.SupportTickets,{session,tickets:[],initialMode:'new',onClose(){},onAction(){}});
 assert.match(html,/role="dialog"/);assert.match(html,/aria-modal="true"/);assert.match(html,/Asunto/);assert.match(html,/Descripción del problema/);assert.match(html,/Enviar ticket/);
 assert.match(html,/Juan Pérez/);assert.match(html,/Moto Norte/);assert.match(html,/maxLength="160"/i);assert.match(html,/maxLength="5000"/i);
 assert.doesNotMatch(html,/type="password"/);
});

test('SSR soporte: propietario ve campanas separadas por empresa con pendientes y sin leer',()=>{
 const companies=[{id:'company-1',name:'Moto Norte',slug:'moto-norte',startDate:'2026-01-01',endDate:'2030-12-31',enabled:true},{id:'company-2',name:'Moto Sur',slug:'moto-sur',startDate:'2026-01-01',endDate:'2030-12-31',enabled:true}];
 const html=render(components.OwnerWorkspace,{session:{username:'Steven',role:'owner'},data:{companies,tickets:[ticket,{...ticket,id:'ticket-2',status:'resolved',unreadCount:0}]},onAction(){}});
 assert.ok(html.includes('Tickets de soporte de Moto Norte: 1 pendientes, 1 sin leer'));
 assert.ok(html.includes('Tickets de soporte de Moto Sur: 0 pendientes, 0 sin leer'));
 assert.equal(components.supportUnread([ticket]),2);
});

test('SSR soporte: texto recibido se escapa y un usuario no ve acciones de propietario en la lista',()=>{
 const html=render(components.SupportTickets,{session,tickets:[{...ticket,title:'<script>alert(1)</script>'}],onClose(){},onAction(){}});
 assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.doesNotMatch(html,/Estado del ticket/);assert.match(html,/2 sin leer/);
});
