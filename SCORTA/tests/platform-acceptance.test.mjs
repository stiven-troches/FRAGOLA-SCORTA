import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPlatform, platformRequest, renewalProposal} from '../platform.mjs';

// Credentials belong only to isolated, fictitious acceptance-test fixtures.
const OWNER_PASSWORD = 'OwnerAcceptanceOnly-2026';
const EMPLOYEE_PASSWORD = 'EmployeeAcceptanceOnly-2026';
const NOW = '2026-11-19T15:00:00.000Z';
const success = response => assert.ok(response.status >= 200 && response.status < 300,
  `HTTP ${response.status}: ${JSON.stringify(response.body)}`);
const randomId = () => crypto.randomUUID();

async function fixture({now = NOW} = {}) {
  let privateState = await createPlatform({owner: {company: 'Fragola', username: 'Steven',
    name: 'Steven', password: OWNER_PASSWORD}});
  const tokens = new Map();
  let clock = now;
  const call = async (actor, path = '/api/v2/data', body, options = {}) => {
    const result = await platformRequest(privateState, {
      method: body === undefined ? 'GET' : 'POST', path, body,
      token: actor ? tokens.get(actor) : undefined,
    }, {now: options.now ?? clock, baseUrl: 'https://scorta.example'});
    privateState = result.state;
    if (actor && result.token !== undefined) {
      if (result.token) tokens.set(actor, result.token); else tokens.delete(actor);
    }
    return result;
  };
  const login = async (actor, company, username, password = EMPLOYEE_PASSWORD) => {
    const result = await call(actor, '/api/v2/login', {company, username, password});
    success(result); assert.ok(tokens.get(actor)); return result.body;
  };
  const action = async (actor, input) => {
    if(input.type==='sale.create'&&input.labor?.length){const actorData=await call(actor);input={...input,labor:input.labor.map(line=>({...line,mecanicoId:line.mecanicoId||actorData.body.state.mechanics.find(m=>m.name===line.mecanico)?.id}))};}

    const response = await call(actor, '/api/v2/action', {requestId: randomId(), ...input});
    success(response); return response.body;
  };
  await login('owner', 'Fragola', 'Steven', OWNER_PASSWORD);
  const createCompany = async (name, overrides = {}) => {
    const response = await action('owner', {type: 'company.create', form: {
      name, contact: 'Contacto ficticio', email: 'test@example.com', whatsapp: '+573001234567',
      startDate: '2026-11-01', endDate: '2026-11-28', monthlyFee: 99000,
      username: 'admin', password: EMPLOYEE_PASSWORD, adminName: `Admin ${name}`, ...overrides,
    }});
    return response.companies.find(company => company.name === name);
  };
  return {call, login, action, createCompany, setNow(value) {clock = value;},
    token: actor => tokens.get(actor), get state() {return privateState;}};
}
async function setupShop(f, {name = 'Moto Norte', seller = 'vendedor'} = {}) {
  const company = await f.createCompany(name);
  assert.ok(company?.id);
  await f.login('admin', company.slug, 'admin');
  await f.action('owner', {type: 'user.create', companyId: company.id,
    form: {username: seller, name: 'Vendedor de prueba', role: 'vendedor', password: EMPLOYEE_PASSWORD}});
  await f.login('seller', company.slug, seller);
  const data = await f.action('admin', {type: 'business.change', payload: {kind: 'producto',
    form: {nombre: 'Pastillas de freno', referencia: 'FRE-01', categoria: 'Frenos', marca: 'QA',
      codigo_barras: '7700000000012', stock: 5, stock_minimo: 2,
      precio_compra: 18000, precio_venta: 34000}}});
  for(const name of ['Carlos','Luis'])await f.action('admin',{type:'mechanic.create',form:{name,percentage:60}});
  return {company, product: data.state.prods.find(p => p.referencia === 'FRE-01')};
}
const sale = (product, extra = {}) => ({type: 'sale.create',
  form: {fecha: '2026-11-19', cliente: 'Ana Torres', telefono: '3001234567', placa: 'ABC12D', paymentMethod: 'efectivo'},
  items: [{producto_id: product.id, cantidad: 1, precio_unitario: 34000}], labor: [], ...extra});

// These tests exercise complete requests and observable permissions/results rather than copying implementation helpers.
test('aceptación: empresas aisladas, varios administradores y permisos limitados por rol', async () => {
  const f = await fixture(); const {company, product} = await setupShop(f);
  const south = await f.createCompany('Moto Sur');
  await f.login('south', south.slug, 'admin');
  const other = await f.action('south', {type: 'business.change', payload: {kind: 'producto',
    form: {nombre: 'Producto privado Sur', referencia: 'SUR-01', stock: 3, precio_compra: 90000, precio_venta: 100000}}});
  const privateProduct = other.state.prods[0];
  const owner = (await f.call('owner')).body;
  assert.equal(owner.companies.length, 2);
  assert.ok(owner.companies.every(c => c.url.startsWith('https://scorta.example/c/')));
  const seller = (await f.call('seller')).body;
  assert.equal(seller.session.companyId, company.id);
  assert.ok(!seller.companies && !seller.users && !seller.payments);
  assert.equal(seller.state.prods.length, 1);
  assert.ok(!JSON.stringify(seller).includes('Producto privado Sur'));
  for (const key of ['precio_compra', 'costo_unitario', 'salt', 'digest', 'passwordHash'])
    assert.ok(!JSON.stringify(seller).includes('"' + key + '"'), key);
  for (const input of [
    {type: 'company.delete', companyId: south.id, form: {confirmation: south.name}},
    {type: 'user.create', companyId: company.id, form: {username: 'intruso', role: 'admin', password: EMPLOYEE_PASSWORD}},
    {type: 'business.change', payload: {kind: 'ajuste', id: product.id, form: {stock: 500, motivo: 'Sin permiso'}}},
  ]) assert.equal((await f.call('seller', '/api/v2/action', input)).status, 403);
  assert.equal((await f.call('admin', '/api/v2/action', {type: 'user.create', companyId: company.id,
    form: {username: 'otroadmin', name: 'Otro', role: 'admin', password: EMPLOYEE_PASSWORD}})).status, 403);
  await f.action('owner', {type: 'user.create', companyId: company.id,
    form: {username: 'admin2', name: 'Segunda administradora', role: 'admin', password: EMPLOYEE_PASSWORD}});
  const ownerData = (await f.call('owner')).body;
  assert.equal(ownerData.users.filter(u => u.companyId === company.id && u.role === 'admin').length, 2);
  const crossSale = await f.call('seller', '/api/v2/action', sale(privateProduct, {companyId: south.id}));
  assert.ok(crossSale.status >= 400);
  assert.equal((await f.call('south')).body.state.prods[0].stock, 3);
  assert.equal((await f.call('admin')).body.state.prods[0].stock, 5);
  for (const password of [OWNER_PASSWORD, EMPLOYEE_PASSWORD]) assert.ok(!JSON.stringify(ownerData).includes(password));
});

test('aceptación: último día inclusivo en Bogotá y bloqueo de una sesión abierta al vencer', async () => {
  const f = await fixture({now: '2026-11-28T22:00:00.000Z'});
  const company = await f.createCompany('Fin de contrato');
  await f.login('admin', company.slug, 'admin');
  const lastInstant = await f.call('admin', '/api/v2/data', undefined, {now: '2026-11-29T04:59:59.999Z'});
  assert.equal(lastInstant.status, 200);
  const expired = await f.call('admin', '/api/v2/data', undefined, {now: '2026-11-29T05:00:00.000Z'});
  assert.equal(expired.status, 403); assert.equal(expired.body.code, 'CONTRACT_EXPIRED');
  assert.equal(expired.body.company.name, 'Fin de contrato');
  assert.ok(!expired.body.state);
  const future = await f.createCompany('Contrato futuro', {startDate: '2026-11-29', endDate: '2026-12-28'});
  const scheduled = await f.call('future', '/api/v2/login', {company: future.slug, username: 'admin', password: EMPLOYEE_PASSWORD});
  assert.equal(scheduled.status, 403); assert.equal(scheduled.body.code, 'CONTRACT_NOT_STARTED');
});

test('aceptación: renovación anticipada conserva días y el pago no elimina suspensión manual', async () => {
  const f = await fixture(); const company = await f.createCompany('Renovación');
  assert.equal(renewalProposal(company, NOW).endDate, '2026-12-28');
  await f.action('owner', {type: 'company.access', companyId: company.id, form: {enabled: false}});
  const renewed = await f.action('owner', {type: 'company.renew', companyId: company.id,
    form: {endDate: '2026-12-28', amount: 99000, date: '2026-11-19'}});
  const current = renewed.companies.find(c => c.id === company.id);
  assert.equal(current.endDate, '2026-12-28'); assert.equal(current.enabled, false);
  assert.equal(renewed.payments.filter(p => p.companyId === company.id).length, 1);
  const denied = await f.call('admin', '/api/v2/login', {company: company.slug, username: 'admin', password: EMPLOYEE_PASSWORD});
  assert.equal(denied.status, 403); assert.equal(denied.body.code, 'COMPANY_DISABLED');
  await f.action('owner', {type: 'company.access', companyId: company.id, form: {enabled: true}});
  await f.login('admin', company.slug, 'admin');
  const expired = await f.createCompany('Ya vencida', {endDate: '2026-11-18'});
  assert.equal(renewalProposal(expired, NOW).startDate, '2026-11-19');
  const response = await f.action('owner', {type: 'company.renew', companyId: expired.id,
    form: {startDate: '2026-11-19', endDate: '2026-12-19', amount: 99000}});
  assert.equal(response.companies.find(c => c.id === expired.id).startDate, '2026-11-19');
});

test('aceptación: restablecimiento y cambio propio revocan todas las sesiones y conservan contraseñas privadas', async () => {
  const f = await fixture(); const company = await f.createCompany('Contraseñas');
  await f.login('admin', company.slug, 'admin'); await f.login('second', company.slug, 'admin');
  const user = (await f.call('owner')).body.users.find(u => u.companyId === company.id && u.username === 'admin');
  const nextPassword = 'ResetAcceptanceOnly-2026';
  await f.action('owner', {type: 'user.reset', userId: user.id, form: {password: nextPassword}});
  for (const actor of ['admin', 'second']) assert.equal((await f.call(actor)).status, 401);
  assert.equal((await f.call('old', '/api/v2/login', {company: company.slug, username: 'admin', password: EMPLOYEE_PASSWORD})).status, 401);
  await f.login('fresh', company.slug, 'admin', nextPassword); await f.login('fresh2', company.slug, 'admin', nextPassword);
  const change = await f.call('fresh', '/api/v2/password', {currentPassword: nextPassword, newPassword: 'ChangedAcceptanceOnly-2026'});
  success(change);
  assert.equal((await f.call('fresh2')).status, 401);
  const publicUser = (await f.call('owner')).body.users.find(u => u.id === user.id);
  assert.ok(publicUser.passwordChangedAt);
  const serialized = JSON.stringify(publicUser);
  for (const secret of [nextPassword, 'ChangedAcceptanceOnly-2026', 'salt', 'digest', 'passwordHash']) assert.ok(!serialized.includes(secret));
});

test('aceptación: venta mixta, solo mano de obra y productos concilian cliente, placa, inventario y reversión', async () => {
  const f = await fixture(); const {product} = await setupShop(f);
  const mixed = await f.action('seller', sale(product, {
    items: [{producto_id: product.id, cantidad: 2, precio_unitario: 34000}],
    labor: [{descripcion: 'Cambio de frenos', mecanico: 'Carlos', importe: 30000},
      {descripcion: 'Ajuste de disco', mecanico: 'Luis', importe: 15000}],
  }));
  const mixedSale = mixed.state.ventas[0];
  assert.equal(mixedSale.total, 113000); assert.equal(mixedSale.subtotal_productos, 68000);
  assert.equal(mixedSale.subtotal_mano_obra, 45000);
  assert.equal(mixed.state.prods.find(p => p.id === product.id).stock, 3);
  assert.equal(mixed.state.servs.filter(s => s.venta_id === mixedSale.id).length, 1);
  const labor = await f.action('seller', sale(product, {items: [],
    labor: [{descripcion: 'Mantenimiento de prueba', mecanico: 'Carlos', importe: 60000}]}));
  const laborSale = labor.state.ventas[0];
  assert.equal(laborSale.total, 60000);
  assert.equal(labor.state.prods[0].stock, 3);
  await f.action('seller', sale(product, {form: {fecha: '2026-11-19', cliente: 'Ana Torres', telefono: '3001234567', placa: '', paymentMethod: 'tarjeta'}}));
  let all = (await f.call('admin')).body.state;
  let customer = all.customers.find(c => c.telefono === '3001234567');
  assert.equal(customer.purchaseCount, 3); assert.equal(customer.totalSpent, 207000);
  assert.ok(customer.placas.includes('ABC12D'));
  assert.equal(all.vehicles.find(v => v.placa === 'ABC12D').visitCount, 2);
  assert.equal((await f.call('seller', '/api/v2/action', {type: 'sale.reverse', id: mixedSale.id, form: {motivo: 'No autorizado'}})).status, 403);
  await f.action('admin', {type: 'sale.reverse', id: mixedSale.id,
    form: {motivo: 'Devolución autorizada de una pastilla', parcial: true}, items: [{index: 0, cantidad: 1}]});
  await f.action('admin', {type: 'sale.reverse', id: laborSale.id, form: {motivo: 'Servicio anulado autorizado'}});
  all = (await f.call('admin')).body.state;customer = all.customers.find(c => c.telefono === '3001234567');
  assert.equal(all.prods[0].stock, 3);
  assert.equal(customer.totalSpent, 113000); assert.equal(customer.purchaseCount, 2);
  const vehicle = all.vehicles.find(v => v.placa === 'ABC12D');
  assert.equal(vehicle.visitCount, 1); assert.equal(vehicle.totalSpent, 79000);
  const reversedService = all.servs.find(s => s.venta_id === laborSale.id);
  assert.ok(reversedService.anulada);
});

test('aceptación: errores de venta no mutan saldos, el reintento no duplica y la revisión obsoleta se rechaza', async () => {
  const f = await fixture(); const {product} = await setupShop(f);
  const before = (await f.call('admin')).body.state;
  for (const invalid of [
    sale(product, {items: [{producto_id: product.id, cantidad: 6, precio_unitario: 34000}]}),
    sale(product, {items: [{producto_id: product.id, cantidad: 1, precio_unitario: 1}]}),
    sale(product, {items: [], labor: [{descripcion: 'Trabajo', mecanico: 'Carlos', importe: -1}]}),
    sale(product, {items: [], labor: [{descripcion: 'Trabajo', mecanico: 'Carlos', importe: 5000}],
      form: {fecha: '2026-11-19', placa: '', paymentMethod: 'efectivo'}}),
  ]) {const result = await f.call('seller', '/api/v2/action', invalid); assert.ok(result.status >= 400);}
  assert.deepEqual((await f.call('admin')).body.state, before);
  const payload = {...sale(product), requestId: 'qa-unique-sale', revision: before.revision};
  success(await f.call('seller', '/api/v2/action', payload));
  success(await f.call('seller', '/api/v2/action', payload));
  const state = (await f.call('admin')).body.state;
  assert.equal(state.ventas.length, 1); assert.equal(state.prods[0].stock, 4);
  const reused = await f.call('seller', '/api/v2/action', {...payload, items: [{...payload.items[0], cantidad: 2}]});
  assert.ok(reused.status >= 400);
  const stale = await f.call('seller', '/api/v2/action', {...sale(product), revision: before.revision, requestId: randomId()});
  assert.equal(stale.status, 409);
  assert.equal((await f.call('admin')).body.state.prods[0].stock, 4);
});

test('aceptación: soporte mantiene identidad/motivo y deja intervención visible para el cliente', async () => {
  const f = await fixture(); const {company, product} = await setupShop(f);
  const reason = 'Cliente solicita corregir conteo físico';
  const support = await f.action('owner', {type: 'support.start', companyId: company.id, form: {motivo: reason}});
  assert.equal(support.session.role, 'owner'); assert.equal(support.session.support.companyId, company.id);
  await f.action('owner', {type: 'business.change', payload: {kind: 'ajuste', id: product.id,
    form: {stock: 4, motivo: 'Una unidad dañada reportada'}}});
  const visible = (await f.call('admin')).body.state;
  const movement = visible.movimientos.find(m => m.tipo === 'ajuste');
  assert.match(movement.usuario, /Steven.*Soporte/);
  assert.equal(movement.stock_antes, 5); assert.equal(movement.stock_despues, 4);
  assert.ok(JSON.stringify(visible.auditoria).includes(reason));
  const owner = await f.action('owner', {type: 'support.end'});
  assert.equal(owner.session.role, 'owner'); assert.ok(!owner.session.support); assert.ok(owner.companies);
});

test('aceptación: comprobante comparte sólo datos de venta, tokens inválidos y expirados no acceden', async () => {
  const f = await fixture(); const {product} = await setupShop(f);
  const sold = await f.action('seller', sale(product)); const document = sold.state.ventas[0];
  assert.ok(document.receiptToken?.length >= 24);
  assert.ok(document.receiptUrl.startsWith('https://scorta.example/receipt/'));
  const receipt = await f.call(null, '/api/v2/receipt/' + document.receiptToken);
  success(receipt); assert.equal(receipt.body.sale.id, document.id); assert.equal(receipt.body.sale.total, 34000);
  const printable = JSON.stringify(receipt.body);
  for (const key of ['precio_compra', 'costo_unitario', 'digest', 'passwordHash', 'sessions']) assert.ok(!printable.includes('"' + key + '"'), key);
  const unknown = await f.call(null, '/api/v2/receipt/' + 'a'.repeat(43));
  assert.ok([404, 410].includes(unknown.status));
  const expired = await f.call(null, '/api/v2/receipt/' + document.receiptToken, undefined, {now: '2026-11-27T15:00:00.000Z'});
  assert.ok([404, 410].includes(expired.status)); assert.ok(!expired.body.sale);
});

test('aceptación: vendedor no obtiene ventas de otro vendedor de la misma empresa', async () => {
  const f = await fixture(); const {company, product} = await setupShop(f);
  await f.action('seller', sale(product));
  await f.action('owner', {type: 'user.create', companyId: company.id,
    form: {username: 'vendedor2', name: 'Segundo vendedor', role: 'vendedor', password: EMPLOYEE_PASSWORD}});
  await f.login('seller2', company.slug, 'vendedor2');
  const before = (await f.call('seller2')).body.state;
  assert.equal(before.ventas.length, 0); assert.equal(before.servs.length, 0);
  await f.action('seller2', sale(product));
  assert.equal((await f.call('seller')).body.state.ventas.length, 1);
  assert.equal((await f.call('seller2')).body.state.ventas.length, 1);
  assert.equal((await f.call('admin')).body.state.ventas.length, 2);
});

test('aceptación: un servicio con venta vinculada no permite una reversión legacy que desajuste el cobro', async () => {
  const f = await fixture();const {product} = await setupShop(f);
  const sold = await f.action('seller', sale(product, {
    labor: [{descripcion: 'Cambio de frenos', mecanico: 'Carlos', importe: 30000}],
  }));
  const service = sold.state.servs.find(s => s.venta_id === sold.state.ventas[0].id);
  const before = (await f.call('admin')).body.state;
  const bypass = await f.call('admin', '/api/v2/action', {type: 'business.change',
    payload: {kind: 'reversion', id: service.id, form: {tipo: 'servicio', motivo: 'Reversión por ruta equivocada'}}});
  assert.ok(bypass.status >= 400, 'El servicio vinculado se debe revertir desde su venta');
  assert.deepEqual((await f.call('admin')).body.state, before);
});

test('aceptación: formatos equivalentes del teléfono mantienen un solo historial de cliente', async () => {
  const f = await fixture();const {product} = await setupShop(f);
  await f.action('seller', sale(product));
  await f.action('seller', sale(product, {form: {
    fecha: '2026-11-19', cliente: 'Ana Torres', telefono: '300 123-4567', placa: 'ABC12D', paymentMethod: 'efectivo',
  }}));
  const all = (await f.call('admin')).body.state;
  const customers = all.customers.filter(c => c.nombre === 'Ana Torres');
  assert.equal(customers.length, 1, 'El formato del teléfono no debe dividir la fidelización');
  assert.equal(customers[0].purchaseCount, 2);assert.equal(customers[0].totalSpent, 68000);
  assert.equal(all.vehicles.find(v => v.placa === 'ABC12D').customerIds.length, 1);
});
