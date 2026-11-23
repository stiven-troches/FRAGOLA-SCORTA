// QA-08: flujos completos de mostrador en escritorio y celular (todos los proyectos de
// playwright.config.mjs). Se verifica la interfaz y, después, el estado real por la API.
import {test,expect,login,navigate,addProduct,noOverflow,waitSaved} from './fixtures.mjs';

const stockOf=async(scenario)=>(await scenario.data()).state.prods.find(p=>p.id===scenario.product.id).stock;
const saleFor=(scenario,{cantidad=1,paymentMethod='efectivo',cliente='Cliente QA'}={})=>({type:'sale.create',form:{cliente,paymentMethod},items:[{producto_id:scenario.product.id,cantidad,precio_unitario:scenario.product.precio_venta}],labor:[]});

async function openSalesList(page){
 await navigate(page,'Nueva venta');
 await page.locator('summary',{hasText:'Más opciones'}).first().click();
 await page.getByRole('button',{name:/^(Consultar ventas|Mis ventas y servicios)$/}).click();
 await expect(page.getByRole('dialog',{name:/^(Ventas registradas|Mis ventas y servicios)$/})).toBeVisible();
}
async function openSale(page,cliente){
 await openSalesList(page);
 const list=page.getByRole('dialog',{name:/^(Ventas registradas|Mis ventas y servicios)$/});
 await list.getByRole('row').filter({hasText:cliente}).getByRole('button',{name:'Ver venta',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Detalle de venta'})).toBeVisible();
}

test('venta → cobro → comprobante con formatos 80/58 mm',async({page,scenario})=>{
 await login(page,scenario.seller);await addProduct(page,scenario.product);
 await page.getByRole('spinbutton',{name:'Cantidad de '+scenario.product.nombre,exact:true}).fill('2');
 await page.getByLabel('Medio de pago',{exact:true}).selectOption('transferencia');
 await waitSaved(page);await noOverflow(page);
 await page.getByRole('button',{name:'Registrar venta',exact:true}).click();
 const receipt=page.getByRole('dialog',{name:'Detalle de venta'});await expect(receipt).toBeVisible();
 await expect(receipt.getByText('TICKET DE VENTA',{exact:true})).toBeVisible();
 await expect(receipt.getByText(scenario.product.nombre,{exact:true}).first()).toBeVisible();
 await expect(receipt.getByText(/70\.000/).first()).toBeVisible();
 await expect(receipt.getByText('Transferencia',{exact:true}).first()).toBeVisible();
 for(const label of ['80 mm','58 mm'])await expect(receipt.getByText(label,{exact:true}).first()).toBeVisible();
 await expect(receipt.getByRole('button',{name:/Imprimir/}).first()).toBeVisible();
 await noOverflow(page);
 const data=await scenario.data();const sale=data.state.ventas[0];
 expect(data.state.ventas).toHaveLength(1);expect(sale.total).toBe(70000);expect(sale.paymentMethod).toBe('transferencia');
 expect(await stockOf(scenario)).toBe(48);
});

test('compra de mercancía actualiza existencias',async({page,scenario})=>{
 await login(page,scenario.admin);await navigate(page,'Compras');
 await page.getByRole('button',{name:'Ingresar mercancía',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Ingresar mercancía',exact:true});
 await dialog.getByLabel('Proveedor',{exact:true}).fill('Proveedor QA '+scenario.suffix);
 await dialog.getByRole('combobox',{name:'Producto',exact:true}).selectOption(scenario.product.id);
 await dialog.getByLabel('Cantidad recibida',{exact:true}).fill('4');await dialog.getByLabel('Costo por unidad (COP)',{exact:true}).fill('21000');
 await dialog.getByRole('button',{name:'Agregar a la compra',exact:true}).click();await noOverflow(page);
 await dialog.getByRole('button',{name:'Registrar compra',exact:true}).click();await expect(dialog).not.toBeVisible();
 const data=await scenario.data();
 expect(data.state.compras).toHaveLength(1);expect(data.state.compras[0].proveedor).toBe('Proveedor QA '+scenario.suffix);expect(data.state.compras[0].total).toBe(84000);
 expect(await stockOf(scenario)).toBe(54);
});

test('devolución parcial autorizada por el administrador',async({page,scenario})=>{
 await scenario.act(saleFor(scenario,{cantidad:3,cliente:'Cliente Parcial'}));
 await login(page,scenario.admin);await openSale(page,'Cliente Parcial');
 await page.getByRole('dialog',{name:'Detalle de venta'}).getByRole('button',{name:'Devolver / anular con autorización',exact:true}).click();
 const reverse=page.getByRole('dialog',{name:'Autorizar devolución o anulación'});await expect(reverse).toBeVisible();
 await reverse.getByLabel('Operación',{exact:true}).selectOption('partial');
 await reverse.getByLabel(new RegExp('Pendiente: 3$')).fill('1');
 await reverse.getByLabel('Motivo',{exact:true}).fill('Cliente devuelve una unidad (QA)');await noOverflow(page);
 page.once('dialog',prompt=>prompt.accept());
 await reverse.getByRole('button',{name:'Autorizar y registrar',exact:true}).click();await expect(reverse).not.toBeVisible();
 const data=await scenario.data();const sale=data.state.ventas[0];
 expect(sale.anulada).toBeFalsy();expect(sale.detalles[0].devuelto).toBe(1);expect(sale.reversiones).toHaveLength(1);
 expect(await stockOf(scenario)).toBe(48);
});

test('anulación completa de una venta',async({page,scenario})=>{
 await scenario.act(saleFor(scenario,{cantidad:2,cliente:'Cliente Anulado'}));
 await login(page,scenario.admin);await openSale(page,'Cliente Anulado');
 await page.getByRole('dialog',{name:'Detalle de venta'}).getByRole('button',{name:'Devolver / anular con autorización',exact:true}).click();
 const reverse=page.getByRole('dialog',{name:'Autorizar devolución o anulación'});
 await expect(reverse.getByLabel('Operación',{exact:true})).toHaveValue('full');
 await reverse.getByLabel('Motivo',{exact:true}).fill('Venta registrada por error (QA)');
 page.once('dialog',prompt=>{expect(prompt.message()).toContain('Anular');return prompt.accept()});
 await reverse.getByRole('button',{name:'Autorizar y registrar',exact:true}).click();await expect(reverse).not.toBeVisible();
 const data=await scenario.data();expect(data.state.ventas[0].anulada).toBe(true);expect(await stockOf(scenario)).toBe(50);
 await openSalesList(page);await expect(page.getByRole('dialog',{name:'Ventas registradas'}).getByText('Anulada',{exact:true}).first()).toBeVisible();
});

test('vendedor no ve la opción de devolver o anular',async({page,scenario})=>{
 await login(page,scenario.seller);await addProduct(page,scenario.product);await waitSaved(page);
 await page.getByRole('button',{name:'Registrar venta',exact:true}).click();
 const receipt=page.getByRole('dialog',{name:'Detalle de venta'});await expect(receipt).toBeVisible();
 await expect(receipt.getByRole('button',{name:'Devolver / anular con autorización',exact:true})).toHaveCount(0);
});

test('cierre de caja del día cuadra con las ventas por medio de pago',async({page,scenario})=>{
 await scenario.act(saleFor(scenario,{cantidad:1,paymentMethod:'efectivo',cliente:'Caja efectivo'}));
 await scenario.act(saleFor(scenario,{cantidad:2,paymentMethod:'tarjeta',cliente:'Caja tarjeta'}));
 await login(page,scenario.admin);await navigate(page,'Resumen general');
 await page.locator('summary',{hasText:'Administración'}).first().click();await page.getByRole('button',{name:'Cierre de caja',exact:true}).first().click();
 const cash=page.getByRole('dialog',{name:'Cierre de caja'});await expect(cash).toBeVisible();
 await cash.getByLabel('Recibido por efectivo (COP)',{exact:true}).fill('35000');
 await cash.getByLabel('Recibido por transferencia (COP)',{exact:true}).fill('0');
 await cash.getByLabel('Recibido por tarjeta (COP)',{exact:true}).fill('70000');
 await noOverflow(page);
 page.once('dialog',prompt=>{expect(prompt.type()).toBe('confirm');return prompt.accept()});
 await cash.getByRole('button',{name:'Registrar cierre',exact:true}).click();
 await expect(cash.getByText('Cierre registrado',{exact:true}).first()).toBeVisible();
 const data=await scenario.data();const closure=data.state.cashClosures[0];
 expect(data.state.cashClosures).toHaveLength(1);
 expect(closure.expected).toEqual({efectivo:35000,transferencia:0,tarjeta:70000});
 expect(closure.totals.difference).toBe(0);
});
