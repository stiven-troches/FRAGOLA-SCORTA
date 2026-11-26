// QA PUNTO 10(b): separados (apartados con abonos). Reserva de stock, abonos, entrega como venta y
// cancelación con saldo a favor, en escritorio y celular. El vendedor ve el teléfono enmascarado.
import {test,expect,login,navigate,noOverflow,cop} from './fixtures.mjs';

const PHONE='3157788990',MASKED='•••8990';
const card=scenario=>scenario.act({type:'customer.create',form:{nombre:'Cliente Separa '+scenario.suffix,telefono:PHONE,dataConsent:true}}).then(data=>data.state.customerRecords.find(c=>c.nombre==='Cliente Separa '+scenario.suffix));
const productOf=async(scenario)=>(await scenario.data()).state.prods.find(p=>p.id===scenario.product.id);

async function newLayaway(page,scenario,{customer,units,deposit}){
 await page.getByRole('button',{name:'Nuevo separado',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Nuevo separado',exact:true});await expect(dialog).toBeVisible();
 if(customer){
  await dialog.getByLabel('Buscar ficha (opcional)',{exact:true}).fill(customer);
  await dialog.getByRole('button',{name:new RegExp('^'+customer)}).click();
  await expect(dialog.getByText('Ficha:',{exact:false})).toContainText(customer);
 }
 await dialog.getByLabel('Buscar producto',{exact:true}).fill(scenario.product.referencia);
 await dialog.getByRole('button',{name:new RegExp('^'+scenario.product.nombre)}).click();
 await dialog.getByRole('spinbutton',{name:'Cantidad de '+scenario.product.nombre,exact:true}).fill(String(units));
 await expect(dialog.locator('.cc-total')).toContainText(cop(units*35000));
 await dialog.getByLabel('Abono inicial (COP)',{exact:true}).fill(String(deposit));
 await noOverflow(page);
 return dialog;
}

test('administrador: separa con abono inicial, abona y entrega; se registra la venta y se libera la reserva',async({page,scenario})=>{
 const customer=await card(scenario);
 await login(page,scenario.admin);await navigate(page,'Separados');
 await expect(page.getByRole('heading',{name:'Separados',exact:true})).toBeVisible();
 await expect(page.getByText(/Aún no hay separados/)).toBeVisible();
 // 1) Nuevo separado: 2 unidades ($ 70.000) con $ 20.000 de abono inicial. Un abono mayor al total se rechaza.
 const dialog=await newLayaway(page,scenario,{customer:customer.nombre,units:2,deposit:90000});
 await dialog.getByRole('button',{name:'Separar mercancía',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('El abono inicial debe ser un valor entre cero y el total');
 expect((await scenario.data()).state.layaways||[]).toHaveLength(0);
 await dialog.getByLabel('Abono inicial (COP)',{exact:true}).fill('20000');await dialog.getByLabel('Vence en (días)',{exact:true}).fill('10');
 await dialog.getByRole('button',{name:'Separar mercancía',exact:true}).click();
 const created=page.getByRole('dialog',{name:'Separado SEP-0001',exact:true});await expect(created).toBeVisible();
 await expect(created).toContainText(cop(70000));await expect(created).toContainText(/abonado\s*\$\s?20\.000/);await expect(created).toContainText(/saldo\s*\$\s?50\.000/);
 await created.getByRole('button',{name:'Listo',exact:true}).click();
 await expect(page.getByText('Separado SEP-0001 creado. La mercancía quedó reservada.',{exact:true})).toBeVisible();
 let data=await scenario.data();let layaway=data.state.layaways[0];
 expect(layaway).toMatchObject({numero:'SEP-0001',total:70000,pagado:20000,saldo:50000,estado:'activo'});
 expect(data.state.prods.find(p=>p.id===scenario.product.id)).toMatchObject({stock:48,stock_reservado:2});
 const item=page.getByRole('listitem').filter({hasText:'SEP-0001'});
 await expect(item).toContainText('2 × '+scenario.product.nombre);await expect(item).toContainText(cop(50000));
 await expect(page.getByRole('tab',{name:/^Activos/})).toContainText('1');
 // 2) El inventario refleja las unidades separadas: el producto ya no ofrece las 2 unidades reservadas.
 await navigate(page,'Inventario');await page.getByRole('button',{name:'Tabla',exact:true}).click();
 await page.getByRole('searchbox',{name:'Buscar productos',exact:true}).fill(scenario.product.referencia);
 await expect(page.getByRole('row').filter({hasText:scenario.product.referencia})).toContainText('48');
 await navigate(page,'Separados');
 // 3) Abono parcial de $ 20.000 por Nequi; un abono mayor al saldo se rechaza.
 await item.getByRole('button',{name:'Registrar abono',exact:true}).click();
 const pay=page.getByRole('dialog',{name:'Abono · SEP-0001',exact:true});
 await pay.getByLabel('Valor (COP)',{exact:true}).fill('90000');await pay.getByRole('button',{name:'Registrar abono',exact:true}).click();
 await expect(pay.getByRole('alert')).toContainText('Escribe un abono entre 1 y');
 await pay.getByLabel('Valor (COP)',{exact:true}).fill('20000');await pay.getByRole('combobox',{name:/^Medio de pago/}).selectOption('nequi');
 await pay.getByRole('button',{name:'Registrar abono',exact:true}).click();
 const paid=page.getByRole('dialog',{name:'Separado SEP-0001',exact:true});await expect(paid).toContainText(/abonado\s*\$\s?40\.000/);await expect(paid).toContainText(/saldo\s*\$\s?30\.000/);
 await paid.getByRole('button',{name:'Listo',exact:true}).click();
 layaway=(await scenario.data()).state.layaways[0];expect(layaway).toMatchObject({pagado:40000,saldo:30000});expect(layaway.abonos).toHaveLength(2);
 // 4) «Pagar y entregar» liquida el saldo: queda entregado y la venta cuenta hoy.
 await item.getByRole('button',{name:'Pagar y entregar',exact:true}).click();
 const deliver=page.getByRole('dialog',{name:'Pagar y entregar · SEP-0001',exact:true});
 await expect(deliver.getByLabel('Valor (COP)',{exact:true})).toHaveValue(/30\.000/);
 await deliver.getByRole('button',{name:'Pagar y entregar',exact:true}).click();
 await expect(page.getByText('Separado SEP-0001 pagado y entregado.',{exact:true})).toBeVisible();
 await page.getByRole('dialog',{name:'Separado SEP-0001',exact:true}).getByRole('button',{name:'Listo',exact:true}).click();
 data=await scenario.data();layaway=data.state.layaways[0];
 expect(layaway).toMatchObject({estado:'entregado',saldo:0,pagado:70000});
 const sale=data.state.ventas.find(s=>s.id===layaway.saleId);expect(sale.total).toBe(70000);
 expect(data.state.prods.find(p=>p.id===scenario.product.id)).toMatchObject({stock:48,stock_reservado:0});
 await page.getByRole('tab',{name:/^Entregados/}).click();
 await expect(page.getByRole('listitem').filter({hasText:'SEP-0001'}).getByText('Entregado',{exact:true})).toBeVisible();
 await expect(page.getByRole('tab',{name:/^Activos/})).toContainText('0');
});

test('administrador: cancela un separado y el abono queda como saldo a favor; la mercancía vuelve al inventario',async({page,scenario})=>{
 const customer=await card(scenario);
 await scenario.act({type:'layaway.create',form:{customerId:customer.id,items:[{producto_id:scenario.product.id,cantidad:3}],deposit:{amount:30000,method:'efectivo'}}});
 expect(await productOf(scenario)).toMatchObject({stock:47,stock_reservado:3});
 await login(page,scenario.admin);await navigate(page,'Separados');
 const item=page.getByRole('listitem').filter({hasText:'SEP-0001'});await expect(item).toContainText(cop(75000));
 await item.getByRole('button',{name:'Cancelar',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Cancelar separado SEP-0001',exact:true});
 await expect(dialog).toContainText(cop(30000));
 await dialog.getByRole('button',{name:'Cancelar separado',exact:true}).click();
 await expect(dialog).toBeVisible(); // sin motivo no se cancela (campo obligatorio)
 expect((await scenario.data()).state.layaways[0].estado).toBe('activo');
 await dialog.getByRole('combobox',{name:/^¿Qué pasa con lo abonado\?/}).selectOption('saldo_a_favor');
 await dialog.getByLabel('Motivo',{exact:true}).fill('El cliente ya no lo necesita (QA)');await noOverflow(page);
 await dialog.getByRole('button',{name:'Cancelar separado',exact:true}).click();
 await expect(page.getByText('Separado SEP-0001 cancelado. La mercancía volvió al inventario.',{exact:true})).toBeVisible();
 const data=await scenario.data();
 expect(data.state.layaways[0]).toMatchObject({estado:'cancelado'});
 expect(data.state.prods.find(p=>p.id===scenario.product.id)).toMatchObject({stock:50,stock_reservado:0});
 expect(data.state.customerRecords.find(c=>c.id===customer.id).saldoAFavor).toBe(30000);
 await page.getByRole('tab',{name:/^Cancelados/}).click();
 await expect(page.getByRole('listitem').filter({hasText:'SEP-0001'}).getByText('Cancelado',{exact:true})).toBeVisible();
});

test('vendedor: separa mercancía de una ficha enmascarada, abona y no puede cancelar',async({page,scenario})=>{
 const customer=await card(scenario);
 await login(page,scenario.seller);await navigate(page,'Separados');
 const dialog=await (async()=>{
  await page.getByRole('button',{name:'Nuevo separado',exact:true}).click();
  const d=page.getByRole('dialog',{name:'Nuevo separado',exact:true});
  await d.getByLabel('Buscar ficha (opcional)',{exact:true}).fill(customer.nombre.slice(0,12));
  const pick=d.getByRole('button',{name:new RegExp('^'+customer.nombre)});
  await expect(pick).toContainText(MASKED);await expect(pick).not.toContainText(PHONE);await pick.click();
  await d.getByLabel('Buscar producto',{exact:true}).fill(scenario.product.nombre);
  await d.getByRole('button',{name:new RegExp('^'+scenario.product.nombre)}).click();
  await d.getByLabel('Abono inicial (COP)',{exact:true}).fill('15000');
  return d;
 })();
 await dialog.getByRole('button',{name:'Separar mercancía',exact:true}).click();
 const created=page.getByRole('dialog',{name:'Separado SEP-0001',exact:true});await expect(created).toContainText(/saldo\s*\$\s?20\.000/);
 await created.getByRole('button',{name:'Listo',exact:true}).click();
 // El servidor guarda el dato completo; al vendedor solo le llegan los últimos 4 dígitos.
 const seen=(await scenario.sellerData()).state.layaways[0];expect(seen).toMatchObject({numero:'SEP-0001',pagado:15000,saldo:20000});expect(seen.telefono).toBe(MASKED);
 expect((await scenario.data()).state.layaways[0].telefono).toBe(PHONE);
 await expect(page.locator('body')).not.toContainText(PHONE);
 const item=page.getByRole('listitem').filter({hasText:'SEP-0001'});
 await expect(item.getByRole('button',{name:'Cancelar',exact:true})).toHaveCount(0);
 await item.getByRole('button',{name:'Registrar abono',exact:true}).click();
 const pay=page.getByRole('dialog',{name:'Abono · SEP-0001',exact:true});
 await pay.getByLabel('Valor (COP)',{exact:true}).fill('5000');await pay.getByRole('button',{name:'Registrar abono',exact:true}).click();
 const paid=page.getByRole('dialog',{name:'Separado SEP-0001',exact:true});await expect(paid).toContainText(/saldo\s*\$\s?15\.000/);
 await paid.getByRole('button',{name:'Listo',exact:true}).click();
 expect((await scenario.data()).state.layaways[0]).toMatchObject({pagado:20000,saldo:15000});
 await expect(page.locator('body')).not.toContainText(PHONE);
});
