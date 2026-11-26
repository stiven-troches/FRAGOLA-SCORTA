// Enter dentro de un campo NO debe cobrar la venta ni registrar la compra. Solo cobran el clic en
// «Registrar venta», Tab + Enter/Espacio sobre el botón y F9. El buscador de producto sigue
// agregando con Enter (lector de códigos).
import {test,expect,login,navigate,addProduct,waitSaved,choosePurchaseProduct} from './fixtures.mjs';

const settle=page=>page.waitForTimeout(600); // da tiempo a que un envío indebido llegue al servidor

test('Enter en Cantidad, Cliente, Teléfono y Buscar cliente no cobra; F9 sí',async({page,scenario})=>{
 await login(page,scenario.seller);await addProduct(page,scenario.product);await waitSaved(page);
 const quantity=page.getByRole('spinbutton',{name:'Cantidad de '+scenario.product.nombre,exact:true});
 await quantity.focus();await quantity.press('Enter');
 await page.locator('summary',{hasText:'Agregar cliente (opcional)'}).click();
 for(const label of ['Cliente','Teléfono','Buscar cliente registrado']){
  const input=page.getByLabel(label,{exact:true});await input.fill('x');await input.press('Enter');
 }
 await settle(page);
 await expect(page.getByRole('dialog',{name:'Detalle de venta'})).toHaveCount(0);
 expect((await scenario.data()).state.ventas).toHaveLength(0);
 // F9 (fuera de un campo de texto) cobra.
 await page.getByLabel('Cliente',{exact:true}).fill('');await page.getByLabel('Teléfono',{exact:true}).fill('');
 await page.getByLabel('Buscar cliente registrado',{exact:true}).fill('');
 await page.locator('h2',{hasText:'Cobro'}).click();await page.keyboard.press('F9');
 await expect(page.getByRole('dialog',{name:'Detalle de venta'})).toBeVisible();
 expect((await scenario.data()).state.ventas).toHaveLength(1);
});

test('Tab hasta «Registrar venta» + Enter cobra; el buscador de producto agrega con Enter',async({page,scenario})=>{
 await login(page,scenario.seller);await navigate(page,'Nueva venta');
 const search=page.getByRole('searchbox',{name:'Buscar producto para agregar al carrito',exact:true});
 await search.fill(scenario.product.referencia);await search.press('Enter');
 await expect(page.getByRole('spinbutton',{name:'Cantidad de '+scenario.product.nombre,exact:true})).toBeVisible();
 await waitSaved(page);
 expect((await scenario.data()).state.ventas).toHaveLength(0);
 const button=page.getByRole('button',{name:'Registrar venta',exact:true});await button.focus();await expect(button).toBeFocused();
 await page.keyboard.press('Enter');
 await expect(page.getByRole('dialog',{name:'Detalle de venta'})).toBeVisible();
 expect((await scenario.data()).state.ventas).toHaveLength(1);
});

test('compra: Enter en Cantidad, Costo y Proveedor no registra; el botón sí',async({page,scenario})=>{
 await login(page,scenario.admin);await navigate(page,'Compras');
 await page.getByRole('button',{name:'Ingresar mercancía',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Ingresar mercancía',exact:true});
 await dialog.getByLabel('Proveedor',{exact:true}).fill('Proveedor Enter '+scenario.suffix);
 await choosePurchaseProduct(dialog,scenario.product);
 await dialog.getByLabel('Cantidad recibida',{exact:true}).fill('2');await dialog.getByLabel('Costo por unidad (COP)',{exact:true}).fill('21000');
 await dialog.getByRole('button',{name:'Agregar a la compra',exact:true}).click();
 for(const label of ['Cantidad recibida','Costo por unidad (COP)','Proveedor'])await dialog.getByLabel(label,{exact:true}).press('Enter');
 await settle(page);
 await expect(dialog).toBeVisible();
 expect((await scenario.data()).state.compras).toHaveLength(0);
 await dialog.getByRole('button',{name:'Registrar compra',exact:true}).click();await expect(dialog).not.toBeVisible();
 expect((await scenario.data()).state.compras).toHaveLength(1);
});
