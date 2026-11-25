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
 mkdirSync(join(root,'test-results'),{recursive:true});temporary=mkdtempSync(join(root,'test-results','subscription-ui-'));
 const entry=join(temporary,'entry.mjs');writeFileSync(entry,`export {default as SubscriptionPanel} from ${JSON.stringify(join(root,'src/SubscriptionPanel.jsx'))};\n`);
 const result=await build({root,logLevel:'silent',build:{ssr:entry,write:false,minify:false}}),output=(Array.isArray(result)?result[0]:result).output,chunk=output.find(value=>value.type==='chunk'&&value.isEntry);
 const compiled=join(temporary,'components.mjs');writeFileSync(compiled,chunk.code);components=await import(pathToFileURL(compiled).href);
});
after(()=>{if(temporary)rmSync(temporary,{recursive:true,force:true})});
const render=(Component,props)=>renderToStaticMarkup(React.createElement(Component,props));
const company={id:'company-1',name:'Moto Norte',startDate:'2026-11-20',endDate:'2026-12-19',status:'active',daysRemaining:29,monthlyFee:80000,whatsapp:'+573205551234'};
const session={userId:'admin-1',name:'Laura',username:'admin',role:'admin',company,companyId:company.id,ownerContact:'Soporte · proveedor@example.com'};

test('SSR suscripción: administrador consulta vigencia, estado y mensualidad en una sección plegable',()=>{
 const html=render(components.SubscriptionPanel,{session,onContact(){}});
 assert.match(html,/Mi suscripción/);assert.match(html,/sub-panel/);assert.match(html,/Activa/);assert.match(html,/29 días/);assert.match(html,/80\.000/);assert.match(html,/COP/);
 assert.match(html,/[0-9]{1,2} nov 2026/);assert.match(html,/[0-9]{1,2} dic 2026/);assert.match(html,/Consultar por ticket de soporte/);
 assert.doesNotMatch(html,/<details[^>]*open/);
});

test('SSR suscripción: vendedores y propietario no reciben la sección de facturación del administrador',()=>{
 for(const role of ['vendedor','owner']){
  const html=render(components.SubscriptionPanel,{session:{...session,role},onContact(){}});
  assert.doesNotMatch(html,/Mi suscripción/);assert.doesNotMatch(html,/80\.000/);
 }
});

test('SSR suscripción: solo muestra el contacto suministrado del propietario y no controles de renovación o pago',()=>{
 const html=render(components.SubscriptionPanel,{session,onContact(){}});
 assert.match(html,/proveedor@example\.com/);assert.doesNotMatch(html,/573205551234/);
 assert.doesNotMatch(html,/<(?:input|select|textarea|form)\b/);
 assert.doesNotMatch(html,/Registrar pago|Renovar|Editar contrato|company\.renew|company\.update/);
 const empty=render(components.SubscriptionPanel,{session:{...session,ownerContact:''},onContact(){}});
 assert.match(empty,/contacto del propietario aún no está configurado/);assert.doesNotMatch(empty,/573205551234/);assert.match(empty,/Consultar por ticket de soporte/);
});

test('SSR suscripción: información ausente no se inventa y el texto del proveedor se escapa',()=>{
 const html=render(components.SubscriptionPanel,{session:{...session,company:{name:'Prueba',status:'active',daysRemaining:0},ownerContact:'<script>alert(1)</script>'}});
 assert.match(html,/Último día de vigencia/);assert.match(html,/Sin configurar/);assert.doesNotMatch(html,/80\.000|COP/);
 assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
});
