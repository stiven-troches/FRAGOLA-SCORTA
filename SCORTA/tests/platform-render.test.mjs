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
  writeFileSync(entry, `export {default as OwnerWorkspace} from ${JSON.stringify(join(root, 'src/OwnerWorkspace.jsx'))};\nexport {default as ClientWorkspace} from ${JSON.stringify(join(root, 'src/ClientWorkspace.jsx'))};\n`);
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
  assert.match(html, /Nueva venta/);assert.match(html, /Inventario/);assert.match(html, /Juan Pérez/);
  const navigation = html.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(navigation, 'La navegación debe existir desde el primer render');
  for (const label of ['Taller', 'Compras', 'Movimientos', 'Dashboard']) assert.ok(!navigation.includes(label), label);
  assert.ok(!/>Mi perfil</.test(html), 'El nombre debe ser el único acceso al perfil');
  assert.ok(!html.includes('Costo de compra'));
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
