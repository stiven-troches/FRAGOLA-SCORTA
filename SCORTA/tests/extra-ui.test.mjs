// SEG-13, FE-18 y FE-19: interfaz (SSR real con Vite) y lógica de cámara y conexión.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {compileSSR} from './ssr-build.mjs';
import {matchScannedCode,scannerSupport,createRepeatGuard,detectorFormats,stopStream,UNSUPPORTED_SCANNER_MESSAGE} from '../src/barcode-scanner.mjs';
import {createConnectivity,isOffline} from '../src/connectivity.mjs';
import {resetTokenFromHash,recoveryRequest,MAIL_DISABLED_MESSAGE} from '../src/recovery.mjs';
import {SaleDraftSync} from '../src/sale-draft-client.mjs';
import {PERMISSIONS_POLICY} from '../server.mjs';

let ui,cleanup;
before(async()=>{({module:ui,cleanup}=await compileSSR('extra-ui',{ClientWorkspace:'src/ClientWorkspace.jsx',RecoveryDialog:'src/RecoveryDialog.jsx',ResetPasswordScreen:'src/RecoveryDialog.jsx#ResetPasswordScreen',EmailSection:'src/PlatformApp.jsx#EmailSection',BarcodeScanner:'src/BarcodeScanner.jsx'}))});
after(()=>cleanup?.());
const render=(component,props)=>renderToStaticMarkup(React.createElement(ui[component],props));
const company={id:'c1',name:'Moto Nueva'};
const workspace=(state={})=>({session:{userId:'u1',username:'ana',name:'Ana',role:'vendedor',companyId:'c1',company},data:{revision:1,company,state:{prods:[],ventas:[],compras:[],servs:[],movimientos:[],mechanics:[],...state}},onAction:async()=>({}),onRefresh:async()=>({}),onProfile(){},onLogout(){}});

test('FE-19: coincidencia exacta por código de barras (primero) o referencia, sin acentos ni mayúsculas',()=>{
 const prods=[{id:'a',nombre:'Bujía',codigo_barras:'7701234567890',referencia:'BUJ-1',stock:3},{id:'b',nombre:'Filtro',codigo_barras:'',referencia:'FIL-Ñ2',stock:0},{id:'c',nombre:'Cadena',codigo_barras:'BUJ-1',referencia:'CAD',stock:2},{id:'d',nombre:'Filtro nuevo',referencia:'fil-ñ2',stock:4}];
 assert.equal(matchScannedCode(prods,' 7701234567890 ').product.id,'a');
 assert.equal(matchScannedCode(prods,'buj-1').product.id,'c','el código de barras gana sobre la referencia');
 const ref=matchScannedCode(prods,'FIL-N2');assert.equal(ref.status,'found');assert.equal(ref.product.id,'d','prefiere el que tiene existencias');
 assert.equal(matchScannedCode([prods[1]],'FIL-Ñ2').status,'out');
 assert.equal(matchScannedCode(prods,'770123').status,'none','no hay coincidencias parciales');
 assert.equal(matchScannedCode(prods,'').status,'none');assert.equal(matchScannedCode(null,'x').status,'none');
});

test('FE-19: soporte del navegador, repetición del mismo código y apagado de la cámara',async()=>{
 const camera={navigator:{mediaDevices:{getUserMedia(){}}}};
 assert.equal(scannerSupport(undefined),'none');assert.equal(scannerSupport({navigator:{}}),'none');
 assert.equal(scannerSupport(camera),'unsupported','Safari: cámara sin BarcodeDetector');
 assert.equal(scannerSupport({...camera,BarcodeDetector:function(){}}),'camera');
 const guard=createRepeatGuard(1500);assert.equal(guard('A',0),true);assert.equal(guard('A',500),false);assert.equal(guard('B',600),true);assert.equal(guard('A',700),true);assert.equal(guard('A',3000),true);
 assert.deepEqual(await detectorFormats({getSupportedFormats:async()=>['qr_code','ean_13','aztec']}),['ean_13','qr_code']);
 assert.equal(await detectorFormats({getSupportedFormats:async()=>{throw Error('x')}}),undefined);
 let stopped=0;stopStream({getTracks:()=>[{stop:()=>stopped++},{stop:()=>stopped++}]});assert.equal(stopped,2);stopStream(null);
});

test('FE-19: el botón de cámara no aparece en SSR ni sin cámara; el lector se dibuja con su cierre',()=>{
 const html=render('ClientWorkspace',workspace());
 assert.match(html,/Nombre, referencia o código y Enter/);assert.doesNotMatch(html,/Leer código de barras con la cámara/);
 const scanner=render('BarcodeScanner',{onDetected:()=>({ok:true}),onClose(){}});
 for(const text of ['Leer código con la cámara','Abriendo la cámara','Aviso sonoro al leer','Cerrar cámara','Listo','playsInline'.toLowerCase()])assert.ok(scanner.toLowerCase().includes(text.toLowerCase()),text);
 assert.equal(UNSUPPORTED_SCANNER_MESSAGE,'Tu navegador no permite leer códigos con la cámara.');
});

test('FE-19: Permissions-Policy permite la cámara solo al propio sitio',()=>{
 assert.match(PERMISSIONS_POLICY,/(^|, )camera=\(self\)/);assert.match(PERMISSIONS_POLICY,/microphone=\(\)/);assert.match(PERMISSIONS_POLICY,/geolocation=\(\)/);
});

test('FE-18: eventos online/offline cambian el estado y avisan solo cuando cambia',()=>{
 const target=new EventTarget(),nav={onLine:true},seen=[];
 const connectivity=createConnectivity({target,navigatorRef:nav});const off=connectivity.subscribe(v=>seen.push(v));
 assert.equal(connectivity.online,true);
 target.dispatchEvent(new Event('offline'));target.dispatchEvent(new Event('offline'));assert.equal(connectivity.online,false);
 target.dispatchEvent(new Event('online'));assert.deepEqual(seen,[false,true]);
 off();target.dispatchEvent(new Event('offline'));assert.deepEqual(seen,[false,true]);
 connectivity.stop();target.dispatchEvent(new Event('online'));assert.equal(connectivity.online,false,'tras stop ya no escucha');
 assert.equal(createConnectivity({target,navigatorRef:{onLine:false}}).online,false);
 assert.equal(isOffline({onLine:false}),true);assert.equal(isOffline({onLine:true}),false);assert.equal(isOffline(undefined),false);
});

test('FE-18: sin conexión el borrador no se envía; al volver se sincroniza con el mismo contenido',async()=>{
 const sent=[],statuses=[];
 const sync=new SaleDraftSync({request:async(method,body)=>{if(method==='POST'){sent.push(structuredClone(body));return {version:body.version+1};}return {version:3,draft:null};},onStatus:s=>statuses.push(s.status)});
 await sync.load();
 sync.setOnline(false);assert.equal(statuses.at(-1),'offline');
 sync.update({cart:[{producto_id:'p1',cantidad:1}]});sync.update({cart:[{producto_id:'p1',cantidad:2}]});
 await new Promise(r=>setTimeout(r,500));
 assert.equal(sent.length,0,'nada sale mientras no hay conexión');assert.equal(sync.unsaved,true);assert.equal(statuses.at(-1),'offline');
 sync.setOnline(true);await sync.flight;await new Promise(r=>setTimeout(r,10));
 assert.equal(sent.length,1);assert.deepEqual(sent[0].draft,{cart:[{producto_id:'p1',cantidad:2}]});assert.equal(sent[0].version,3);
 assert.equal(sync.unsaved,false);assert.equal(statuses.at(-1),'saved');sync.dispose();
});

test('FE-18: la venta muestra el estado en línea por defecto y el botón de cobro activo en SSR',()=>{
 const html=render('ClientWorkspace',workspace({prods:[{id:'p',nombre:'Aceite',precio_venta:1000,stock:2}]}));
 assert.doesNotMatch(html,/Sin conexión/);assert.match(html,/Registrar venta/);
});

test('SEG-13: diálogo de recuperación según la configuración del correo',()=>{
 const off=render('RecoveryDialog',{initialStatus:{emailRecovery:false},onClose(){}});
 assert.ok(off.includes(MAIL_DISABLED_MESSAGE));assert.doesNotMatch(off,/Enviar enlace|Vista previa/);
 const on=render('RecoveryDialog',{initialCompany:'Moto Norte',initialStatus:{emailRecovery:true},onClose(){}});
 for(const text of ['Enviar enlace','correo verificado','Vence en 1 hora','value="Moto Norte"'])assert.ok(on.includes(text),text);
 assert.doesNotMatch(on,/Vista previa|no se envían/);
});

test('SEG-13: pantalla /recuperar con y sin token, y lectura del token del enlace',()=>{
 const token='A'.repeat(43);
 assert.equal(resetTokenFromHash('#'+token),token);assert.equal(resetTokenFromHash('#corto'),null);assert.equal(resetTokenFromHash(''),null);assert.equal(resetTokenFromHash('#'+token+'x'),null);
 const form=render('ResetPasswordScreen',{initialToken:token});
 for(const text of ['Crea una nueva contraseña','Nueva contraseña','Confirmar nueva contraseña','autoComplete="new-password"'.toLowerCase(),'cerrarán todas tus sesiones'])assert.ok(form.toLowerCase().includes(text.toLowerCase()),text);
 assert.ok(!form.includes(token),'el token no se pinta en la página');
 const missing=render('ResetPasswordScreen',{initialToken:null});assert.match(missing,/Enlace no válido/);
});

test('SEG-13: sección de correo del perfil',()=>{
 const base={username:'ana',role:'admin',companyId:'c1',emailRecovery:true};
 const none=render('EmailSection',{session:{...base,email:''},onAction:async()=>({})});assert.match(none,/Registrar correo/);assert.doesNotMatch(none,/Enviar código/);
 const pending=render('EmailSection',{session:{...base,email:'ana@example.com',emailVerified:false},onAction:async()=>({})});assert.match(pending,/Enviar código de verificación/);assert.match(pending,/Sin verificar/);
 const verified=render('EmailSection',{session:{...base,email:'ana@example.com',emailVerified:true},onAction:async()=>({})});assert.match(verified,/Verificado/);assert.doesNotMatch(verified,/Enviar código/);
 const disabled=render('EmailSection',{session:{...base,email:'ana@example.com',emailVerified:false,emailRecovery:false},onAction:async()=>({})});
 assert.ok(disabled.includes(MAIL_DISABLED_MESSAGE));assert.doesNotMatch(disabled,/Enviar código/);
 const code=render('EmailSection',{session:{...base,email:'ana@example.com',emailVerified:false},onAction:async()=>({}),initialMode:'code'});assert.match(code,/Verificar correo/);assert.match(code,/one-time-code/);
});

test('SEG-13: recoveryRequest nunca lanza y devuelve el cuerpo del servidor',async()=>{
 const ok=await recoveryRequest('/api/v2/password/forgot',{company:'a',username:'b'},{fetchImpl:async(path,init)=>{assert.equal(init.method,'POST');assert.equal(JSON.parse(init.body).company,'a');return new Response(JSON.stringify({ok:true,message:'m'}),{status:200});}});
 assert.deepEqual(ok,{ok:true,status:200,body:{ok:true,message:'m'}});
 const down=await recoveryRequest('/api/v2/password/status',undefined,{fetchImpl:async()=>{throw TypeError('offline')}});assert.equal(down.ok,false);assert.equal(down.status,0);assert.match(down.body.error,/conectar/);
 const html=await recoveryRequest('/x',undefined,{fetchImpl:async()=>new Response('<html>',{status:502})});assert.equal(html.status,502);assert.match(html.body.error,/servidor/);
});
