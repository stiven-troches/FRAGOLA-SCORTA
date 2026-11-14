import {test, expect} from '@playwright/test';

const password = 'SCORTA-QA-Password-12345';
async function state(page) {
  const response = await page.request.get('/api/state');
  expect(response.ok()).toBeTruthy();return response.json();
}
async function login(page) {
  await page.goto('/');
  await page.getByLabel('Usuario', {exact: true}).fill('admin');
  await page.getByLabel('Contraseña', {exact: true}).fill(password);
  await page.getByRole('button', {name: 'Entrar', exact: true}).click();
  await expect(page.locator('.connection-bar')).toContainText('Datos actualizados');
}
async function go(page, name) {
  const menu=page.locator('.mobile-navigation');const summary=menu.locator(':scope > summary');if(await summary.isVisible()&&await menu.getAttribute('open')===null)await summary.click();
  await page.getByRole('navigation').getByRole('button', {name, exact: false}).click();
}
async function product(page, name, stock, price, {reference, barcode, emptyOptionals = false} = {}) {
  await go(page, 'Inventario');
  await page.getByRole('button', {name: '+ Nuevo producto', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre *', {exact: true}).fill(name);
  await dialog.getByLabel('Precio de venta ($) *', {exact: true}).fill(String(price));
  await dialog.getByLabel('Existencias iniciales', {exact: true}).fill(String(stock));
  if (reference || barcode || emptyOptionals) {
    await dialog.getByText('Referencia, clasificación y otros datos', {exact: true}).click();
    if (reference) await dialog.getByLabel('Referencia / SKU', {exact: true}).fill(reference);
    if (barcode) await dialog.getByLabel('Código de barras', {exact: true}).fill(barcode);
    if (emptyOptionals) {
      await dialog.getByLabel('Precio de compra ($)', {exact: true}).fill('20000');
      await dialog.getByLabel('Precio de compra ($)', {exact: true}).fill('');
      await dialog.getByLabel('Mínimo de alerta', {exact: true}).fill('');
    }
  }
  await dialog.getByRole('button', {name: 'Guardar producto', exact: true}).click();
  return dialog;
}
async function add(page, name, quantity, price, label = 'producto') {
  const dialog = page.getByRole('dialog');
  const search = dialog.getByRole('searchbox', {name: `Buscar ${label}`, exact: true});
  await search.fill(name);await search.press('Enter');
  await dialog.getByLabel('Cantidad a agregar', {exact: true}).fill(String(quantity));
  await dialog.getByLabel('Precio unitario', {exact: true}).fill(String(price));
  await dialog.getByRole('button', {name: 'Agregar a la lista', exact: true}).click();
}
async function save(page, name) {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', {name, exact: true}).click();
  await expect(dialog).not.toBeVisible();
}
async function reverse(page, row, action, reason, quantityLabel) {
  await row.getByRole('button', {name: action, exact: true}).click();
  const dialog = page.getByRole('dialog');
  if (quantityLabel) await dialog.getByLabel(quantityLabel, {exact: true}).fill('1');
  await dialog.getByLabel('Motivo *', {exact: true}).fill(reason);
  await save(page, action === 'Devolución' ? 'Confirmar devolución' : 'Confirmar anulación');
}

test('jornada real de almacén: compras, ventas, merma, taller y reversiones', async ({page}, info) => {
  test.setTimeout(90000);
  const errors = [];page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await login(page);
  const names = {Casco: `Casco jornada ${info.project.name}`, Guantes: `Guantes jornada ${info.project.name}`, Aceite: `Aceite jornada ${info.project.name}`};
  const expected = {Casco: 10, Guantes: 20, Aceite: 30};
  const check = async () => {
    const s = await state(page);
    for (const name of Object.keys(expected)) {
      const p = s.prods.find(p => p.nombre === names[name]);expect(p.stock).toBe(expected[name]);
      expect(s.movimientos.filter(m => m.producto_id === p.id).reduce((sum, m) => sum + m.cantidad, 0)).toBe(expected[name]);
    }
    return s;
  };
  for (const [name, price] of [['Casco', 150000], ['Guantes', 50000], ['Aceite', 35000]]) {
    const dialog = await product(page, names[name], expected[name], price, {emptyOptionals: true});
    await expect(dialog).not.toBeVisible();
  }
  await check();
  await go(page, 'Compras');await page.getByRole('button', {name: '+ Nueva compra', exact: true}).click();
  await page.getByRole('dialog').getByLabel('Proveedor', {exact: true}).fill(`Proveedor jornada ${info.project.name}`);
  await add(page, names.Casco, 5, 80000);await add(page, names.Aceite, 8, 20000);
  await expect(page.getByRole('dialog').locator('.operation-total')).toContainText(/560[.,]000/);
  await save(page, 'Guardar compra');expected.Casco = 15;expected.Aceite = 38;await check();
  await go(page, 'Ventas');await page.getByRole('button', {name: 'Nueva venta', exact: true}).click();
  await page.getByRole('dialog').getByLabel('Cliente (opcional)', {exact: true}).fill(`Cliente jornada ${info.project.name}`);
  await add(page, names.Casco, 2, 150000);await add(page, names.Casco, 1, 140000);await add(page, names.Guantes, 2, 50000);await add(page, names.Aceite, 2, 35000);
  await expect(page.getByRole('dialog').locator('.item-line')).toHaveCount(4);
  await expect(page.getByRole('dialog').locator('.operation-total')).toContainText(/610[.,]000/);
  await save(page, 'Guardar venta');expected.Casco = 12;expected.Guantes = 18;expected.Aceite = 36;
  let s = await check();expect(s.ventas.find(v => v.cliente === `Cliente jornada ${info.project.name}`).total).toBe(610000);
  await go(page, 'Taller');await page.getByRole('button', {name: 'Nuevo servicio', exact: true}).click();
  const serviceDialog = page.getByRole('dialog');const plate = info.project.name === 'movil' ? 'OPM12A' : 'OPE12A';
  await serviceDialog.getByLabel('Placa *', {exact: true}).fill(plate);
  await serviceDialog.getByLabel('Descripción del Trabajo *', {exact: true}).fill('Cambio de aceite ficticio');
  await serviceDialog.getByLabel('Costo Mano de Obra ($)', {exact: true}).fill('25000');
  await add(page, names.Aceite, 2, 35000, 'repuesto');await save(page, 'Guardar servicio');expected.Aceite = 34;await check();
  await go(page, 'Inventario');
  await page.getByRole('button', {name: `Ver ${names.Guantes}`, exact: true}).click();
  await page.getByRole('dialog').getByRole('button', {name: `Ajustar existencias de ${names.Guantes}`, exact: true}).click();
  const adjustment = page.getByRole('dialog');await adjustment.getByLabel('Cantidad contada *', {exact: true}).fill('15');
  await adjustment.getByLabel('Motivo *', {exact: true}).fill('Merma de tres pares confirmada por conteo');await save(page, 'Guardar ajuste');expected.Guantes = 15;await check();
  await go(page, 'Ventas');const saleRow = page.locator('tr').filter({hasText: `Cliente jornada ${info.project.name}`});
  await reverse(page, saleRow, 'Devolución', 'Devolución ficticia de una unidad', `${names.Casco} · disponibles para devolver: 2`);expected.Casco = 13;await check();
  await reverse(page, saleRow, 'Anular', 'Anulación ficticia del resto');expected.Casco = 15;expected.Guantes = 17;expected.Aceite = 36;await check();
  await go(page, 'Taller');const serviceCard = page.locator('.service-card').filter({hasText: plate});
  await reverse(page, serviceCard, 'Anular', 'Servicio de prueba cancelado');expected.Aceite = 38;await check();
  await go(page, 'Compras');const purchaseRow = page.locator('tr').filter({hasText: `Proveedor jornada ${info.project.name}`});
  await reverse(page, purchaseRow, 'Anular', 'Compra de prueba devuelta');expected.Casco = 10;expected.Aceite = 30;s = await check();
  expect(s.movimientos.find(m => m.nombre === names.Guantes && m.tipo === 'ajuste').cantidad).toBe(-3);
  expect(errors).toEqual([]);
});

test('altas ambiguas se rechazan y la merma conserva la ficha histórica', async ({page}, info) => {
  test.setTimeout(60000);await login(page);page.on('dialog', dialog => dialog.accept());
  const name = `Visor operativo ${info.project.name}`, reference = `VIS-${info.project.name}`, barcode = `7712${info.project.name}`;
  let dialog = await product(page, name, 2, 25000, {reference, barcode});await expect(dialog).not.toBeVisible();
  dialog = await product(page, `Visor duplicado ${info.project.name}`, 0, 26000, {reference: reference.toLowerCase()});
  await expect(dialog.getByRole('alert')).toContainText(/referencia/);
  await dialog.getByLabel('Referencia / SKU', {exact: true}).fill(`OTRA-${info.project.name}`);
  await dialog.getByLabel('Código de barras', {exact: true}).fill(barcode);
  await dialog.getByRole('button', {name: 'Guardar producto', exact: true}).click();await expect(dialog.getByRole('alert')).toContainText(/código de barras/);
  await dialog.getByRole('button', {name: 'Cancelar', exact: true}).click();await expect(dialog).not.toBeVisible();
  expect((await state(page)).prods.filter(p => p.nombre === `Visor duplicado ${info.project.name}`)).toHaveLength(0);
  await page.getByRole('button', {name: `Ver ${name}`, exact: true}).click();
  await page.getByRole('dialog').getByRole('button', {name: `Ajustar existencias de ${name}`, exact: true}).click();dialog = page.getByRole('dialog');
  await dialog.getByLabel('Cantidad contada *', {exact: true}).fill('0');await dialog.getByLabel('Motivo *', {exact: true}).fill('Dos visores dañados: salida por merma');
  await save(page, 'Guardar ajuste');
  await page.getByRole('button', {name: `Ver ${name}`, exact: true}).click();dialog = page.getByRole('dialog');
  await dialog.getByText('Más acciones',{exact:true}).click();await expect(dialog.getByRole('button', {name: `Retirar ${name}`, exact: true})).toBeDisabled();
  await dialog.getByText('Historial de movimientos',{exact:true}).click();await expect(dialog).toContainText('Dos visores dañados');
  await dialog.getByRole('button', {name: 'Cerrar', exact: true}).click();
  await go(page, 'Taller');await page.getByRole('button', {name: 'Nuevo servicio', exact: true}).click();
  dialog = page.getByRole('dialog');const plate = info.project.name === 'movil' ? 'GRA12M' : 'GRA12E';
  await dialog.getByLabel('Placa *', {exact: true}).fill(plate);
  await dialog.getByLabel('Descripción del Trabajo *', {exact: true}).fill('Inspección gratuita de prueba');
  await dialog.getByLabel('Costo Mano de Obra ($)', {exact: true}).fill('25000');
  await dialog.getByLabel('Costo Mano de Obra ($)', {exact: true}).fill('');
  await save(page, 'Guardar servicio');
  const freeService = (await state(page)).servs.find(s => s.placa === plate);
  expect(freeService.costo_mano_obra).toBe(0);expect(freeService.total).toBe(0);
});
