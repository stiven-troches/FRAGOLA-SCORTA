import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'vite';
import {createPlatformDemoSeed, DEMO_ACCOUNTS} from '../src/platform-demo.mjs';
import {platformRequest} from '../platform.mjs';

// Static React rendering only: this never starts a server, browser or preview.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let directory, components, seed;
before(async () => {
  mkdirSync(join(root, 'test-results'), {recursive: true});
  directory = mkdtempSync(join(root, 'test-results', 'qa-platform-render-'));
  const entry = join(directory, 'entry.mjs');
  writeFileSync(entry, `export {default as OwnerWorkspace, billingMessagePreview} from ${JSON.stringify(join(root, 'src/OwnerWorkspace.jsx'))};\nexport {default as ClientWorkspace} from ${JSON.stringify(join(root, 'src/ClientWorkspace.jsx'))};\nexport {default as LegalDocuments} from ${JSON.stringify(join(root, 'src/LegalDocuments.jsx'))};\nexport {default as RecoveryDialog} from ${JSON.stringify(join(root, 'src/RecoveryDialog.jsx'))};\n`);
  const result = await build({root, logLevel: 'silent', build: {ssr: entry, write: false, minify: false}});
  const output = Array.isArray(result) ? result[0].output : result.output;
  const chunk = output.find(item => item.type === 'chunk' && item.isEntry);
  assert.ok(chunk, 'Debe existir el bundle SSR de los componentes');
  const modulePath = join(directory, 'components.mjs');
  writeFileSync(modulePath, chunk.code);
  components = await import(pathToFileURL(modulePath).href);
  seed = await createPlatformDemoSeed();
});
after(() => {if (directory) rmSync(directory, {recursive: true, force: true});});
async function envelope(role) {
  const result = await platformRequest(seed, {method: 'POST', path: '/api/v2/login', body: DEMO_ACCOUNTS[role]}, {baseUrl: 'https://scorta.example'});
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return result.body;
}
function render(Component, data) {
  return renderToStaticMarkup(React.createElement(Component, {session: data.session, data,
    onAction: async () => data, onRefresh: async () => data,
    onProfile() {}, onLogout() {}, onEndSupport() {}}));
}

test('SSR: propietario ve empresas y creación, con URLs reales del envelope y sin contraseñas', async () => {
  const data = await envelope('owner');const html = render(components.OwnerWorkspace, data);
  assert.match(html, /Empresas/);assert.match(html, /Crear nueva empresa/);
  assert.match(html, /Moto Norte/);assert.match(html, /Moto Sur/);
  assert.ok(html.includes('/c/moto-norte'));
  for (const account of Object.values(DEMO_ACCOUNTS)) assert.ok(!html.includes(account.password));
  assert.ok(!html.includes('Demo.Vendedor.2026'));
});

test('SSR: vendedor inicia en venta y la navegación no expone módulos administrativos', async () => {
  const data = await envelope('vendedor');const html = render(components.ClientWorkspace, data);
  assert.match(html, /Nueva venta/);assert.match(html, /Inventario/);assert.match(html, /Taller/);assert.match(html, /Juan Pérez/);
  const navigation = html.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(navigation, 'La navegación debe existir desde el primer render');
  const sellerOrder=['Nueva venta','Inventario','Taller'].map(label=>navigation.indexOf(label));assert.ok(sellerOrder.every(index=>index>=0));assert.deepEqual([...sellerOrder].sort((a,b)=>a-b),sellerOrder);
  for (const label of ['Compras', 'Movimientos', 'Dashboard']) assert.ok(!navigation.includes(label), label);
  assert.ok(!/>Mi perfil</.test(html), 'El nombre debe ser el único acceso al perfil');
  assert.ok(!html.includes('Costo de compra'));
  assert.ok(!html.includes('Nombre, referencia o código de barras'),'La búsqueda y carga de productos pertenece a Inventario');
  assert.ok(!html.includes('Trabajo realizado'),'El formulario de mano de obra pertenece a Taller');
});

test('SSR: administrador ve dashboard y el orden completo de navegación acordado', async () => {
  const data = await envelope('admin');const html = render(components.ClientWorkspace, data);
  assert.match(html, /Dashboard/);assert.match(html, /Laura Gómez/);
  const navigation = html.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(navigation);
  const order = ['Nueva venta', 'Taller', 'Inventario', 'Compras', 'Movimientos', 'Dashboard'].map(label => navigation.indexOf(label));
  assert.ok(order.every(index => index >= 0));
  assert.deepEqual([...order].sort((a,b) => a-b), order);
  assert.ok(!/>Mi perfil</.test(html));
});


test('vista previa de cobro: aviso único tres días antes y último día del contrato incluido', () => {
  const company={name:'Moto Norte',endDate:'2026-12-19',enabled:true,monthlyFee:90000};
  const preview=components.billingMessagePreview(company,{now:'2026-12-16T15:00:00.000Z'});
  assert.equal(preview.reminderDate,'2026-12-16');assert.equal(preview.blockDate,'2026-12-20');
  assert.equal(preview.reminderDue,true);assert.ok(preview.reminderText.includes('19'));
  for(const now of ['2026-12-15T15:00:00.000Z','2026-12-17T15:00:00.000Z'])
    assert.equal(components.billingMessagePreview(company,{now}).reminderDue,false);
  assert.equal(components.billingMessagePreview({...company,enabled:false},{now:'2026-12-16T15:00:00.000Z'}).reminderDue,false);
});

test('vista previa de cobro: pago anticipado elimina el aviso anterior y confirma la nueva vigencia', () => {
  const company={name:'Moto Norte',endDate:'2027-01-19',enabled:true,monthlyFee:90000};
  const payment={date:'2026-12-15',amount:90000,endDate:'2027-01-19'};
  const before=components.billingMessagePreview(company,{payment,now:'2026-12-16T15:00:00.000Z'});
  assert.equal(before.reminderDue,false);assert.equal(before.reminderDate,'2027-01-16');
  assert.equal(before.paymentEnd,'2027-01-19');assert.ok(before.paymentText);
  const next=components.billingMessagePreview(company,{now:'2027-01-16T15:00:00.000Z'});
  assert.equal(next.reminderDue,true);assert.equal(next.blockDate,'2027-01-20');
});


test('SSR: recuperación de contraseña distingue la vista previa del envío por correo no conectado', () => {
  const html=renderToStaticMarkup(React.createElement(components.RecoveryDialog,{initialCompany:'Moto Norte',onClose(){}}));
  assert.match(html,/Recuperar contraseña/);assert.match(html,/role="dialog"/);
  assert.match(html,/envío por correo está pendiente de conectar/);
  assert.match(html,/no se envían enlaces ni se cambian contraseñas reales/);
  assert.match(html,/30 minutos/);assert.match(html,/una sola vez/);
  assert.match(html,/Moto Norte/);assert.match(html,/Usuario/);
});

test('SSR: términos muestran borradores y las casillas de aceptación empiezan sin marcar', () => {
  const html=renderToStaticMarkup(React.createElement(components.LegalDocuments,{company:{name:'Moto Norte'},user:{name:'Laura Gómez',role:'admin'},onClose(){},preview:true}));
  assert.match(html,/Contrato, términos y privacidad/);assert.match(html,/pendientes de revisión legal/);
  assert.match(html,/Aquí no se firma un contrato ni se guarda una aceptación real/);
  const boxes=html.match(/<input[^>]*type="checkbox"[^>]*>/g)||[];
  assert.equal(boxes.length,2);assert.ok(boxes.every(box=>!box.includes('checked')));
  assert.match(html,/<button[^>]*type="submit"[^>]*disabled=""/);
  assert.match(html,/Descargar borradores/);
});
