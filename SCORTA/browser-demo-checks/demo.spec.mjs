import {test, expect} from '@playwright/test';

// Reproducible checks for an environment where browser execution is supported.
// This suite serves only dist-demo assets and must never use server.mjs.
const readState = page => page.evaluate(async () => {
  const response = await fetch('/api/state');
  if (!response.ok) throw Error('Demo state unavailable');
  return response.json();
});
async function navigate(page, section) {
  const button = page.getByRole('navigation', {name: 'Secciones'}).getByRole('button', {name: section, exact: false});
  if (!await button.isVisible()) await page.locator('.mobile-navigation > summary').click();
  await button.click();
}
async function addItem(page, product, quantity) {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('searchbox', {name: 'Buscar producto', exact: true}).fill(product.referencia);
  await dialog.getByRole('searchbox', {name: 'Buscar producto', exact: true}).press('Enter');
  await dialog.getByLabel('Cantidad a agregar', {exact: true}).fill(String(quantity));
  await dialog.getByRole('button', {name: 'Agregar a la lista', exact: true}).click();
}

test.beforeEach(async ({page}) => {
  await page.goto('/');
  await expect(page.getByText('Demo · Datos ficticios', {exact: true})).toBeVisible();
  await expect(page.locator('.connection-bar')).toContainText('Datos actualizados');
});

test.afterEach(async ({page}) => {
  const response = await page.request.get('/__qa/network');
  expect((await response.json()).unexpectedApi).toEqual([]);
});

test('inventario ficticio, filtros compactos y navegación sin desbordamiento', async ({page}) => {
  const state = await readState(page);
  expect(state.prods.length).toBeGreaterThanOrEqual(24);
  await navigate(page, 'Inventario');
  await expect(page.locator('.filter-panel')).not.toHaveAttribute('open', '');
  await page.locator('.filter-panel > summary').click();
  await page.getByRole('combobox', {name: 'Existencias', exact: true}).selectOption('agotado');
  const expectedZero = state.prods.filter(p => p.stock === 0);
  await expect(page.locator('.results-count')).toHaveText(`${expectedZero.length} de ${state.prods.length} productos`);
  for (const product of expectedZero) await expect(page.getByRole('button', {name: `Ver ${product.nombre}`, exact: true})).toBeVisible();
  await page.getByRole('combobox', {name: 'Existencias', exact: true}).selectOption('bajo');
  const expectedLow = state.prods.filter(p => p.stock > 0 && p.stock <= p.stock_minimo);
  await expect(page.locator('.results-count')).toHaveText(`${expectedLow.length} de ${state.prods.length} productos`);
  for (const section of ['Ventas', 'Compras', 'Taller', 'Movimientos']) {
    await navigate(page, section);
    await expect(page.getByRole('heading', {level: 1})).toContainText(section);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
});

test('venta muestra total, descuenta una sola vez y sobrevive a recargar', async ({page}) => {
  const before = await readState(page), product = before.prods.find(p => p.stock >= 2);
  await page.getByRole('button', {name: 'Nueva venta', exact: true}).click();
  await page.getByLabel('Cliente (opcional)', {exact: true}).fill('Cliente ficticio QA navegador');
  await addItem(page, product, 2);
  const amount = new Intl.NumberFormat('es-CO', {style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0}).format(product.precio_venta * 2);
  await expect(page.locator('.operation-total')).toContainText(amount);
  await page.getByRole('button', {name: 'Guardar venta', exact: true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const after = await readState(page);
  expect(after.ventas).toHaveLength(before.ventas.length + 1);
  expect(after.ventas[0].total).toBe(product.precio_venta * 2);
  expect(after.prods.find(p => p.id === product.id).stock).toBe(product.stock - 2);
  await page.reload();
  await expect(page.locator('.connection-bar')).toContainText('Datos actualizados');
  expect(await readState(page)).toEqual(after);
});

test('nuevo producto, recepción de mercancía y ajuste mantienen el saldo', async ({page}) => {
  await navigate(page, 'Inventario');
  await page.getByRole('button', {name: '+ Nuevo producto', exact: true}).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre *', {exact: true}).fill('Accesorio QA navegador');
  await dialog.getByLabel('Precio de venta ($) *', {exact: true}).fill('10000');
  await dialog.getByLabel('Existencias iniciales', {exact: true}).fill('3');
  await dialog.locator('.field-advanced > summary').click();
  await dialog.getByLabel('Referencia / SKU', {exact: true}).fill('QA-BROWSER-001');
  await dialog.getByLabel('Precio de compra ($)', {exact: true}).fill('5000');
  await dialog.getByRole('button', {name: 'Guardar producto', exact: true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const product = (await readState(page)).prods.find(p => p.referencia === 'QA-BROWSER-001');
  expect(product.stock).toBe(3);
  await navigate(page, 'Compras');
  await page.getByRole('button', {name: '+ Nueva compra', exact: true}).click();
  await page.getByLabel('Proveedor', {exact: true}).fill('Proveedor ficticio QA navegador');
  await addItem(page, product, 4);
  await page.getByRole('button', {name: 'Guardar compra', exact: true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await readState(page)).prods.find(p => p.id === product.id).stock).toBe(7);
  await navigate(page, 'Inventario');
  await page.getByRole('searchbox', {name: 'Buscar productos', exact: true}).fill(product.referencia);
  await page.getByRole('button', {name: `Ver ${product.nombre}`, exact: true}).click();
  await page.getByRole('button', {name: `Ajustar existencias de ${product.nombre}`, exact: true}).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Cantidad contada *', {exact: true}).fill('6');
  await dialog.getByLabel('Motivo *', {exact: true}).fill('Una unidad dañada, prueba ficticia');
  page.once('dialog', prompt => prompt.accept());
  await dialog.getByRole('button', {name: 'Guardar ajuste', exact: true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const after = await readState(page);
  expect(after.prods.find(p => p.id === product.id).stock).toBe(6);
  expect(after.movimientos.filter(m => m.producto_id === product.id).reduce((sum, m) => sum + m.cantidad, 0)).toBe(6);
});

test('cantidad excesiva conserva el formulario y no modifica inventario', async ({page}) => {
  const before = await readState(page), product = before.prods.find(p => p.stock > 0);
  await page.getByRole('button', {name: 'Nueva venta', exact: true}).click();
  await page.getByLabel('Cliente (opcional)', {exact: true}).fill('Prueba de existencias');
  await addItem(page, product, product.stock + 1);
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Stock insuficiente');
  await expect(page.getByLabel('Cliente (opcional)', {exact: true})).toHaveValue('Prueba de existencias');
  expect(await readState(page)).toEqual(before);
});

test('reiniciar restaura la base ficticia y el API desconocido se resuelve localmente', async ({page}) => {
  const original = await readState(page);
  const result = await page.evaluate(async () => {
    const state = await (await fetch('/api/state')).json();
    const response = await fetch('/api/change', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({kind: 'producto', revision: state.revision, requestId: crypto.randomUUID(), form: {nombre: 'Solo para reiniciar', referencia: 'QA-RESET', stock: 1, precio_venta: 100}})});
    return {status: response.status, missing: (await fetch('/api/no-existe')).status};
  });
  expect(result).toEqual({status: 200, missing: 404});
  page.once('dialog', prompt => prompt.accept());
  await page.getByRole('button', {name: 'Reiniciar demo', exact: true}).click();
  await expect(page.getByText('Demo reiniciada. Puedes comenzar otra prueba.', {exact: true})).toBeVisible();
  const after = await readState(page);
  expect(after.prods).toHaveLength(original.prods.length);
  expect(after.prods.some(p => p.referencia === 'QA-RESET')).toBe(false);
  expect(after.prods.map(p => [p.referencia, p.stock]).sort()).toEqual(original.prods.map(p => [p.referencia, p.stock]).sort());
  expect(after.revision).toBeGreaterThan(original.revision);
});
