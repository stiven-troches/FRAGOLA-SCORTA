// QA PUNTO 10(b): crédito, cartera y abonos de punta a punta, en escritorio y celular.
// La interfaz hace la operación y después se comprueba el estado real por la API. El vendedor recibe
// teléfono y documento enmascarados (Ley 1581): el número completo no debe aparecer en pantalla.
import {test,expect,login,navigate,addProduct,noOverflow,waitSaved,pickCustomer,cop} from './fixtures.mjs';

const PHONE='3157788990',MASKED='•••8990';
const card=(scenario,extra={})=>scenario.act({type:'customer.create',form:{nombre:'Taller QA '+scenario.suffix,telefono:PHONE,numeroDocumento:'900123456',dataConsent:true,...extra}}).then(data=>data.state.customerRecords.find(c=>c.nombre==='Taller QA '+scenario.suffix));
const account=async(scenario,id)=>(await scenario.data()).state.creditAccounts.find(a=>a.customerId===id);

test('administrador: asigna cupo, vende a crédito, abona y consulta el estado de cuenta',async({page,scenario})=>{
 const customer=await card(scenario);
 await login(page,scenario.admin);await navigate(page,'Cartera');
 await expect(page.getByRole('heading',{name:'Cartera',exact:true})).toBeVisible();
 await expect(page.getByText(/Aún no hay ventas a crédito/)).toBeVisible();
 // 1) Cupo de crédito desde la cartera.
 await page.getByRole('button',{name:'Asignar cupo',exact:true}).click();
 const limit=page.getByRole('dialog',{name:'Cupo de crédito',exact:true});
 await limit.getByLabel('Buscar cliente',{exact:true}).fill('Taller QA '+scenario.suffix);
 await limit.getByRole('combobox',{name:/^Cliente/}).selectOption(customer.id);
 await limit.getByLabel('Cupo (COP)',{exact:true}).fill('200000');await limit.getByLabel(/^Plazo en días/).fill('15');
 await limit.getByRole('button',{name:'Guardar cupo',exact:true}).click();
 await expect(page.getByText('Cupo de crédito actualizado.',{exact:true})).toBeVisible();
 expect((await scenario.data()).state.customerRecords.find(c=>c.id===customer.id)).toMatchObject({creditLimit:200000,creditDays:15});
 // 2) Venta a crédito de 2 unidades ($ 70.000) con la ficha seleccionada.
 await navigate(page,'Nueva venta');await addProduct(page,scenario.product);
 await page.getByRole('spinbutton',{name:'Cantidad de '+scenario.product.nombre,exact:true}).fill('2');
 await pickCustomer(page,'Taller QA '+scenario.suffix);
 await page.getByLabel('Medio de pago',{exact:true}).selectOption('credito');
 await expect(page.getByRole('status').filter({hasText:/Cupo\s.*200\.000.*disponible/})).toBeVisible();
 // El administrador recibe la ficha completa (teléfono y documento), así que la venta pide la autorización de datos.
 await page.getByRole('checkbox',{name:'El cliente autorizó el tratamiento de sus datos',exact:true}).check();
 await waitSaved(page);await noOverflow(page);
 await page.getByRole('button',{name:'Registrar venta',exact:true}).click();
 const receipt=page.getByRole('dialog',{name:'Detalle de venta'});await expect(receipt).toBeVisible();
 let data=await scenario.data();const sale=data.state.ventas[0];
 expect(sale.credito).toMatchObject({monto:70000,saldo:70000,pagado:0,plazoDias:15});
 expect(data.state.prods.find(p=>p.id===scenario.product.id).stock).toBe(48);
 await receipt.getByRole('button',{name:'Cerrar ventana',exact:true}).click();
 // 3) La cartera muestra el saldo; un abono mayor al saldo se rechaza con un mensaje claro.
 await navigate(page,'Cartera');
 await expect(page.locator('.cc-metric',{hasText:'Cartera total'}).getByText(cop(70000))).toBeVisible();
 const row=page.getByRole('listitem').filter({hasText:'Taller QA '+scenario.suffix});
 await expect(row.getByText(cop(70000)).first()).toBeVisible();
 await row.getByRole('button',{name:'Registrar abono',exact:true}).click();
 const payment=page.getByRole('dialog',{name:'Abono de Taller QA '+scenario.suffix});
 await payment.getByLabel('Valor del abono (COP)',{exact:true}).fill('90000');
 await payment.getByRole('button',{name:'Registrar abono',exact:true}).click();
 await expect(payment.getByRole('alert')).toContainText('El abono no puede superar el saldo de');
 expect((await account(scenario,customer.id)).saldo).toBe(70000);
 // 4) Abono parcial de $ 30.000 por transferencia.
 await payment.getByLabel('Valor del abono (COP)',{exact:true}).fill('30000');await payment.getByRole('combobox',{name:/^Medio de pago/}).selectOption('transferencia');
 await noOverflow(page);
 await payment.getByRole('button',{name:'Registrar abono',exact:true}).click();
 const done=page.getByRole('dialog',{name:'Abono registrado',exact:true});await expect(done).toBeVisible();
 await expect(done).toContainText('AB-0001');await expect(done).toContainText(cop(30000));await expect(done).toContainText(/Saldo pendiente:\s*\$\s?40\.000/);
 await done.getByRole('button',{name:'Listo',exact:true}).click();
 await expect(page.locator('.cc-metric',{hasText:'Cartera total'}).getByText(cop(40000))).toBeVisible();
 data=await scenario.data();expect(data.state.creditPayments[0]).toMatchObject({numero:'AB-0001',amount:30000,saldoAntes:70000,saldoDespues:40000,method:'transferencia'});
 // 5) Estado de cuenta: factura con saldo y el abono aplicado.
 await row.getByRole('button',{name:'Estado de cuenta',exact:true}).click();
 const statement=page.getByRole('dialog',{name:'Estado de cuenta · Taller QA '+scenario.suffix});await expect(statement).toBeVisible();
 await expect(statement.getByRole('definition').filter({hasText:cop(40000)}).first()).toBeVisible();
 await expect(statement.getByText('AB-0001')).toBeVisible();await expect(statement.getByText(cop(30000)).first()).toBeVisible();
 await statement.getByRole('button',{name:'Cerrar ventana',exact:true}).click();
 // 6) «Pagar todo el saldo» deja la cuenta en cero.
 await row.getByRole('button',{name:'Registrar abono',exact:true}).click();
 await payment.getByRole('button',{name:'Pagar todo el saldo',exact:true}).click();
 await expect(payment.getByLabel('Valor del abono (COP)',{exact:true})).toHaveValue(/40\.000/);
 await payment.getByRole('button',{name:'Registrar abono',exact:true}).click();
 await expect(done).toContainText('AB-0002');await expect(done).toContainText(/Saldo pendiente:\s*\$\s?0(?!\d)/);
 await done.getByRole('button',{name:'Listo',exact:true}).click();
 await expect(page.locator('.cc-metric',{hasText:'Cartera total'}).getByText(cop(0))).toBeVisible();
 expect((await account(scenario,customer.id)).saldo).toBe(0);
});

test('vendedor: vende a crédito dentro del cupo, no puede pasarse ni asignar cupos y ve el teléfono enmascarado',async({page,scenario})=>{
 const customer=await card(scenario,{creditLimit:100000,creditDays:15});
 // El directorio que recibe el vendedor ya llega enmascarado desde el servidor.
 const directory=(await scenario.sellerData()).state.customerDirectory.find(c=>c.id===customer.id);
 expect(directory).toMatchObject({telefono:MASKED,numeroDocumento:'•••3456',masked:true});
 await login(page,scenario.seller);await addProduct(page,scenario.product);
 await page.getByRole('spinbutton',{name:'Cantidad de '+scenario.product.nombre,exact:true}).fill('2');
 // La ficha se busca por el final del teléfono y se muestra enmascarada.
 const summary=page.locator('summary',{hasText:/Agregar cliente/});await summary.click();
 await page.getByLabel('Buscar cliente registrado',{exact:true}).fill('8990');
 const option=page.getByRole('button',{name:'Usar ficha de Taller QA '+scenario.suffix,exact:true});
 await expect(option).toContainText(MASKED);await expect(option).not.toContainText(PHONE);
 await option.click();await expect(page.getByText('Ficha del cliente',{exact:true})).toBeVisible();
 await page.getByLabel('Medio de pago',{exact:true}).selectOption('credito');
 await waitSaved(page);
 await page.getByRole('button',{name:'Registrar venta',exact:true}).click();
 const receipt=page.getByRole('dialog',{name:'Detalle de venta'});await expect(receipt).toBeVisible();
 await expect(receipt).not.toContainText(PHONE);
 expect((await scenario.sellerData()).state.creditAccounts.find(a=>a.customerId===customer.id)).toMatchObject({saldo:70000,disponible:30000});
 await receipt.getByRole('button',{name:'Cerrar ventana',exact:true}).click();
 // Segunda venta de 2 unidades: 70.000 + 70.000 supera el cupo de 100.000 y el vendedor no puede.
 await addProduct(page,scenario.product);
 await page.getByRole('spinbutton',{name:'Cantidad de '+scenario.product.nombre,exact:true}).fill('2');
 await pickCustomer(page,'Taller QA '+scenario.suffix);
 await page.getByLabel('Medio de pago',{exact:true}).selectOption('credito');
 await waitSaved(page);
 await page.getByRole('button',{name:'Registrar venta',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:/supera el cupo/i}).first()).toBeVisible();
 await expect(page.getByRole('dialog',{name:'Detalle de venta'})).toHaveCount(0);
 expect((await scenario.data()).state.ventas).toHaveLength(1);
 // Cartera del vendedor: teléfono enmascarado, sin «Asignar cupo», y registra su abono.
 await navigate(page,'Cartera');
 const row=page.getByRole('listitem').filter({hasText:'Taller QA '+scenario.suffix});
 await expect(row).toContainText(MASKED);await expect(page.locator('body')).not.toContainText(PHONE);
 await expect(page.getByRole('button',{name:'Asignar cupo',exact:true})).toHaveCount(0);
 await row.getByRole('button',{name:'Registrar abono',exact:true}).click();
 const payment=page.getByRole('dialog',{name:'Abono de Taller QA '+scenario.suffix});
 await payment.getByLabel('Valor del abono (COP)',{exact:true}).fill('20000');await noOverflow(page);
 await payment.getByRole('button',{name:'Registrar abono',exact:true}).click();
 const done=page.getByRole('dialog',{name:'Abono registrado',exact:true});await expect(done).toContainText(/Saldo pendiente:\s*\$\s?50\.000/);
 await done.getByRole('button',{name:'Listo',exact:true}).click();
 await expect(page.locator('.cc-metric',{hasText:'Cartera total'}).getByText(cop(50000))).toBeVisible();
 await expect(page.locator('body')).not.toContainText(PHONE);
 expect((await scenario.data()).state.creditPayments[0]).toMatchObject({amount:20000,saldoDespues:50000});
});
