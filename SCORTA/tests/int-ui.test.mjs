import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'vite';
import {createPlatformDemoSeed,DEMO_ACCOUNTS,installPlatformDemoFetch} from '../src/platform-demo.mjs';
import {platformRequest,TERMS_VERSION} from '../platform.mjs';

// Static SSR of the real components (no browser, no server).
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
let directory,c,seed;
before(async()=>{
  mkdirSync(join(root,'test-results'),{recursive:true});
  directory=mkdtempSync(join(root,'test-results','int-ui-'));
  const entry=join(directory,'entry.mjs'),src=file=>JSON.stringify(join(root,'src',file));
  writeFileSync(entry,`export {Login,TermsGate,ForcedPasswordChange,TwoFactorSection,TwoFactorGate,Profile} from ${src('PlatformApp.jsx')};\nexport {default as OwnerWorkspace,MetricCards,SecurityEvents} from ${src('OwnerWorkspace.jsx')};\nexport {default as ClientWorkspace} from ${src('ClientWorkspace.jsx')};\nexport {default as ReceiptTicket} from ${src('ReceiptTicket.jsx')};\nexport {default as LegalDocuments} from ${src('LegalDocuments.jsx')};\n`);
  const result=await build({root,logLevel:'silent',build:{ssr:entry,write:false,minify:false}});
  const output=Array.isArray(result)?result[0].output:result.output,chunk=output.find(item=>item.type==='chunk'&&item.isEntry);
  const modulePath=join(directory,'components.mjs');writeFileSync(modulePath,chunk.code);
  c=await import(pathToFileURL(modulePath).href);seed=await createPlatformDemoSeed();
});
after(()=>{if(directory)rmSync(directory,{recursive:true,force:true})});
const h=(Component,props)=>renderToStaticMarkup(React.createElement(Component,props));
async function envelope(role,state=seed){const r=await platformRequest(state,{method:'POST',path:'/api/v2/login',body:DEMO_ACCOUNTS[role]},{baseUrl:'https://scorta.example'});assert.equal(r.status,200,JSON.stringify(r.body));return r.body;}

test('INT-UI-01: el login muestra el código de verificación solo cuando se requiere 2FA',()=>{
  const plain=h(c.Login,{onLogin(){},onRecovery(){},onLegal(){}});assert.ok(!plain.includes('Código de verificación'));
  const html=h(c.Login,{onLogin(){},onRecovery(){},onLegal(){},totpRequired:true,error:'Ingresa el código de verificación de tu aplicación autenticadora.'});
  assert.match(html,/Código de verificación/);assert.match(html,/inputMode="numeric"|inputmode="numeric"/);assert.match(html,/autoComplete="one-time-code"|autocomplete="one-time-code"/);assert.match(html,/maxLength="6"|maxlength="6"/);
});

test('INT-UI-01b: un único enlace de términos y privacidad, mostrar contraseña y estado de carga',()=>{
  const html=h(c.Login,{onLogin(){},onRecovery(){},onLegal(){},initialCompany:'moto-norte'});
  assert.equal(html.match(/Términos y privacidad/g).length,1);assert.doesNotMatch(html,/Ver política de privacidad/);
  assert.match(html,/value="moto-norte"/);assert.match(html,/Mostrar contraseña/);assert.match(html,/Empresa/);assert.match(html,/Usuario/);
  assert.match(h(c.Login,{onLogin(){},onRecovery(){},onLegal(){},busy:true}),/Ingresando…/);
});

test('INT-UI-01c: el propietario sin 2FA ve la pantalla obligatoria de activación',async()=>{
  const owner=await envelope('owner');
  const html=h(c.TwoFactorGate,{session:{...owner.session,twoFactorRequired:true},onAction:async()=>({}),onLogout(){}});
  assert.match(html,/Protege tu cuenta/);assert.match(html,/Activar verificación en dos pasos/);assert.match(html,/Cerrar sesión/);
});

test('INT-UI-02: verificación en dos pasos en el perfil del propietario (activar con QR y clave, desactivar)',async()=>{
  const owner=await envelope('owner');
  let html=h(c.TwoFactorSection,{session:owner.session,onAction:async()=>({})});assert.match(html,/Verificación en dos pasos/);assert.match(html,/Activar verificación en dos pasos/);
  const setup={secret:'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',uri:'otpauth://totp/SCORTA:Fragola%3ASteven?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=SCORTA&algorithm=SHA1&digits=6&period=30'};
  html=h(c.TwoFactorSection,{session:owner.session,onAction:async()=>({}),initialSetup:setup});
  assert.match(html,/<svg [^>]*viewBox/);assert.ok(html.includes('JBSW Y3DP EHPK 3PXP'));assert.match(html,/Confirmar y activar/);assert.match(html,/one-time-code/);
  html=h(c.TwoFactorSection,{session:{...owner.session,twoFactorEnabled:true},onAction:async()=>({})});assert.match(html,/Activa:/);assert.match(html,/Desactivar verificación en dos pasos/);
  const profile=h(c.Profile,{session:owner.session,data:owner,onAction:async()=>({}),onClose(){},onChange(){},onLegal(){}});assert.match(profile,/Verificación en dos pasos/);
  const admin=await envelope('admin');assert.doesNotMatch(h(c.Profile,{session:admin.session,data:admin,onAction:async()=>({}),onClose(){},onChange(){},onLegal(){}}),/Verificación en dos pasos/);
});

test('INT-UI-03/04: pantalla de términos para el admin, aviso para el vendedor y cambio de contraseña obligatorio',async()=>{
  const admin=await envelope('admin'),session={...admin.session,termsAccepted:false,termsVersion:TERMS_VERSION};
  let html=h(c.TermsGate,{session,onAccept(){},onLogout(){},onRefresh(){}});
  for(const text of ['Aceptar términos de servicio','Leer contrato, términos y privacidad','He leído y acepto','Aceptar y continuar',TERMS_VERSION])assert.ok(html.includes(text),text);
  assert.match(html,/type="checkbox"/);assert.match(html,/disabled=""[^>]*>Aceptar y continuar|Aceptar y continuar/);
  html=h(c.TermsGate,{session:{...session,role:'vendedor'},onAccept(){},onLogout(){},onRefresh(){}});assert.match(html,/Tu administrador debe aceptar los términos/);assert.doesNotMatch(html,/Aceptar y continuar/);
  html=h(c.ForcedPasswordChange,{session:{...session,mustChangePassword:true},onChange(){},onLogout(){}});assert.match(html,/Cambia tu contraseña/);assert.match(html,/Contraseña temporal/);assert.match(html,/Guardar nueva contraseña/);
  const docs=h(c.LegalDocuments,{company:session.company,onClose(){},acceptance:false});assert.match(docs,/Volver a la aceptación/);assert.doesNotMatch(docs,/Vista previa de la aceptación/);
});

test('INT-UI-05/06: banner de soporte activo y casilla de consentimiento en Nueva venta',async()=>{
  const seller=await envelope('vendedor');
  const session={...seller.session,supportActive:true,supportReason:'Ajuste de inventario',supportStartedAt:'2026-11-21T14:05:00.000Z'};
  const html=h(c.ClientWorkspace,{session,data:{...seller,session},onAction:async()=>seller,onRefresh:async()=>seller});
  assert.ok(html.includes('El soporte de SCORTA está trabajando en tu cuenta · Ajuste de inventario · desde 09:05'),'hora de Bogotá');
  assert.match(html,/confirma en el cobro que el cliente autorizó/);
});

test('INT-UI-07: comprobante sin enlace guardado pide uno nuevo; el público no muestra controles privados',()=>{
  const sale={id:'v1',fecha:'2026-11-21',cliente:'Ana',telefono:'3001234567',detalles:[{nombre:'Aceite',cantidad:1,precio_unitario:1000}],total:1000};
  let html=h(c.ReceiptTicket,{sale,company:{name:'Moto Norte'},onRenew:async()=>({url:'https://scorta.example/receipt/x'})});
  for(const text of ['Abrir comprobante en línea','Copiar enlace','Renovar enlace del ticket','Abrir WhatsApp','Se generará un enlace nuevo'])assert.ok(html.includes(text),text);
  html=h(c.ReceiptTicket,{sale:{...sale,receiptUrl:'https://scorta.example/receipt/'+'a'.repeat(43),receiptExpiresAt:new Date(Date.now()+86400000).toISOString()},company:{name:'Moto Norte'},onRenew:async()=>null});
  assert.ok(!html.includes('Renovar enlace del ticket'));assert.match(html,/El enlace está vigente hasta/);
  html=h(c.ReceiptTicket,{sale,company:{name:'Moto Norte'},publicView:true});assert.ok(!html.includes('Comprobante en línea'));assert.ok(!html.includes('Renovar enlace'));
});

test('INT-UI-08: panel del propietario con métricas, uso por empresa, «Sin uso» y eventos de seguridad',async()=>{
  const owner=await envelope('owner');
  owner.securityEvents=[{id:'e1',fecha:'2026-11-21T14:00:00Z',tipo:'login_failures',empresa:'Moto Norte',usuario:'admin',intentos:5}];
  const html=h(c.OwnerWorkspace,{session:owner.session,data:owner,onAction:async()=>owner,onRefresh:async()=>owner,onProfile(){},onLogout(){}});
  for(const text of ['Ingreso mensual','Activas','En prueba','Vencidas','Suspendidas','Bajas en 30 días','Último acceso','Última venta','Ventas 7 días','Sin uso','Eventos de seguridad','Intentos fallidos de ingreso','5 intentos','Cerrar todas las sesiones'])assert.ok(html.includes(text),text);
  assert.ok(owner.metrics&&html.includes('$'),'ingreso mensual en COP');
});

test('INT-UI-09: la demo reescribe receiptLink.url al formato #/receipt/ y exige consentimiento',async()=>{
  const target={location:{href:'https://demo.example/',origin:'https://demo.example'},fetch:async()=>{throw Error('no debe salir a la red')}};
  const token='b'.repeat(43);
  const store={request:async()=>({status:200,body:{receiptLink:{saleId:'s1',token,url:'https://demo.example/receipt/'+token},state:{ventas:[{id:'s1',receiptToken:token,receiptUrl:'https://demo.example/receipt/'+token}]}}})};
  const restore=installPlatformDemoFetch(store,{target});
  try{const body=await (await target.fetch('/api/v2/action',{method:'POST',body:'{}'})).json();assert.equal(body.receiptLink.url,'https://demo.example/#/receipt/'+token);assert.equal(body.state.ventas[0].receiptUrl,body.receiptLink.url)}finally{restore()}
});

test('INT-UI-10: la demo exige consentimiento de datos y su semilla ya aceptó los términos',async()=>{
  const {IDBFactory}=await import('fake-indexeddb');const {createPlatformDemoStore}=await import('../src/platform-demo.mjs');
  const store=await createPlatformDemoStore({indexedDBFactory:new IDBFactory(),name:'int-ui-'+crypto.randomUUID(),lockManager:null,tokenStorage:null});
  try{
    const data=await store.loginAs('vendedor');assert.equal(data.session.termsAccepted,true);
    const product=data.state.prods.find(p=>p.stock>0),items=[{producto_id:product.id,cantidad:1,precio_unitario:product.precio_venta}];
    const send=form=>store.request({method:'POST',path:'/api/v2/action',body:{type:'sale.create',requestId:crypto.randomUUID(),form:{cliente:'Prueba',paymentMethod:'efectivo',...form},items,labor:[]}});
    let r=await send({telefono:'3009998877'});assert.equal(r.status,400);assert.equal(r.body.code,'DATA_CONSENT_REQUIRED');
    r=await send({telefono:'3009998877',dataConsent:true,consentMedium:'verbal'});assert.equal(r.status,200,r.body.error);assert.ok(r.body.receiptLink.url);
  }finally{store.close()}
});
