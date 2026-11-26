// QA PUNTO 10(b): cotizaciones. Crear desde Nueva venta, convertir en venta (con cambio de precio y falta de
// stock), anular, en escritorio y celular. El vendedor ve el teléfono enmascarado y el enlace de
// WhatsApp no filtra el número completo.
import {test,expect,login,navigate,addProduct,noOverflow,waitSaved,pickCustomer,cop} from './fixtures.mjs';

const PHONE='3157788990',MASKED='•••8990';
const productOf=async scenario=>(await scenario.data()).state.prods.find(p=>p.id===scenario.product.id);
const quoteBody=(scenario,{cantidad=2,cliente='Cliente Cotiza'}={})=>({type:'quote.create',form:{cliente:cliente+' '+scenario.suffix,telefono:PHONE,dataConsent:true},items:[{producto_id:scenario.product.id,cantidad,precio_unitario:scenario.product.precio_venta}]});
async function convertDialog(page,quote){
 const item=page.getByRole('listitem').filter({hasText:quote});
 await item.getByRole('button',{name:'Convertir en venta',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Convertir '+quote+' en venta',exact:true});await expect(dialog).toBeVisible();return dialog;
}

test('administrador: guarda una cotización desde Nueva venta sin tocar el inventario y la convierte en venta',async({page,scenario})=>{
 await login(page,scenario.admin);await addProduct(page,scenario.product);
 await page.getByRole('spinbutton',{name:'Cantidad de '+scenario.product.nombre,exact:true}).fill('2');
 await page.locator('summary',{hasText:'Agregar cliente (opcional)'}).click();
 await page.getByLabel('Cliente',{exact:true}).fill('Cliente Cotiza '+scenario.suffix);await page.getByLabel('Teléfono',{exact:true}).fill(PHONE);
 await waitSaved(page);
 // Con teléfono se exige la autorización de datos antes de guardar la cotización.
 await page.getByRole('button',{name:'Guardar como cotización',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:/autorizó el tratamiento/}).first()).toBeVisible();
 expect((await scenario.data()).state.quotes||[]).toHaveLength(0);
 await page.getByRole('checkbox',{name:'El cliente autorizó el tratamiento de sus datos',exact:true}).check();await noOverflow(page);
 await page.getByRole('button',{name:'Guardar como cotización',exact:true}).click();
 // Se abre «Cotizaciones» con el resumen; el inventario no cambia.
 const saved=page.getByRole('dialog',{name:'Cotización COT-0001',exact:true});await expect(saved).toBeVisible();
 await expect(saved).toContainText(cop(70000));await expect(saved).toContainText('No se descontó inventario');
 await expect(saved.getByRole('link',{name:'Enviar por WhatsApp',exact:true})).toHaveAttribute('href',new RegExp('^https://wa\\.me/57'+PHONE));
 await saved.getByRole('button',{name:'Listo',exact:true}).click();
 let data=await scenario.data();
 expect(data.state.quotes[0]).toMatchObject({numero:'COT-0001',total:70000,estado:'vigente',telefono:PHONE});expect((await productOf(scenario)).stock).toBe(50);
 await expect(page.getByRole('tab',{name:/^Vigentes/})).toContainText('1');
 // Convertir en venta en efectivo.
 const dialog=await convertDialog(page,'COT-0001');
 await expect(dialog).toContainText(cop(70000));await expect(dialog.getByLabel('Acepto los precios actuales')).toHaveCount(0);
 await dialog.getByLabel('Efectivo recibido (opcional)',{exact:true}).fill('50000');
 await dialog.getByRole('button',{name:'Registrar venta',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('El efectivo recibido debe cubrir');
 await dialog.getByLabel('Efectivo recibido (opcional)',{exact:true}).fill('100000');
 await dialog.getByRole('button',{name:'Registrar venta',exact:true}).click();
 const done=page.getByRole('dialog',{name:'Venta registrada',exact:true});await expect(done).toContainText('COT-0001');await expect(done).toContainText(cop(70000));
 await expect(page.getByText(/Cotización COT-0001 convertida en venta\./)).toBeVisible();
 data=await scenario.data();const sale=data.state.ventas[0];
 expect(sale).toMatchObject({total:70000,paymentMethod:'efectivo'});expect(data.state.quotes[0]).toMatchObject({estado:'convertida',saleId:sale.id});
 expect((await productOf(scenario)).stock).toBe(48);
 // El comprobante abre la venta real.
 await done.getByRole('button',{name:'Ver comprobante',exact:true}).click();
 const receipt=page.getByRole('dialog',{name:'Detalle de venta'});await expect(receipt).toBeVisible();await expect(receipt.getByText('TICKET DE VENTA',{exact:true})).toBeVisible();
 await receipt.getByRole('button',{name:'Cerrar ventana',exact:true}).click();
 await navigate(page,'Cotizaciones');
 await page.getByRole('tab',{name:/^Convertidas/}).click();
 const item=page.getByRole('listitem').filter({hasText:'COT-0001'});await expect(item.getByText('Convertida',{exact:true})).toBeVisible();
 await expect(item.getByRole('button',{name:'Convertir en venta',exact:true})).toHaveCount(0);await expect(item.getByRole('button',{name:'Ver venta',exact:true})).toBeVisible();
});

test('administrador: si el precio cambió exige aceptar los precios actuales; si falta stock no deja vender',async({page,scenario})=>{
 await scenario.act(quoteBody(scenario,{cantidad:2}));
 await scenario.act({type:'business.change',payload:{kind:'producto',form:{...scenario.product,precio_venta:40000}}});
 await login(page,scenario.admin);await navigate(page,'Cotizaciones');
 // Precio cambiado: cotizado $ 35.000, hoy $ 40.000.
 const dialog=await convertDialog(page,'COT-0001');
 await expect(dialog).toContainText(cop(35000));await expect(dialog).toContainText(cop(40000));await expect(dialog).toContainText(/Total a cobrar:\s*\$\s?80\.000/);await expect(dialog).toContainText(/cotizado\s*\$\s?70\.000/);
 await dialog.getByRole('button',{name:'Registrar venta',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('Los precios cambiaron');
 expect((await scenario.data()).state.ventas).toHaveLength(0);
 await dialog.getByLabel('Acepto los precios actuales').check();await noOverflow(page);
 await dialog.getByRole('button',{name:'Registrar venta',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Venta registrada',exact:true})).toContainText(cop(80000));
 let data=await scenario.data();expect(data.state.ventas[0].total).toBe(80000);expect(data.state.quotes[0].estado).toBe('convertida');
 await page.getByRole('dialog',{name:'Venta registrada',exact:true}).getByRole('button',{name:'Listo',exact:true}).click();
 // Falta de stock: cotización de 10 unidades y el stock baja a 3 por otra venta.
 await scenario.act(quoteBody(scenario,{cantidad:10,cliente:'Cliente Grande'}));
 await scenario.act({type:'sale.create',form:{cliente:'Otro cliente',paymentMethod:'efectivo'},items:[{producto_id:scenario.product.id,cantidad:45,precio_unitario:40000}],labor:[]});
 expect((await productOf(scenario)).stock).toBe(3);
 await page.reload();await expect(page.getByRole('heading',{name:/Nueva venta|Resumen general/i}).first()).toBeVisible();await navigate(page,'Cotizaciones');
 const short=await convertDialog(page,'COT-0002');
 await expect(short.getByRole('alert')).toContainText('No hay stock suficiente');await expect(short).toContainText('Disponibles: 3');
 await expect(short.getByRole('button',{name:'Registrar venta',exact:true})).toBeDisabled();
 data=await scenario.data();expect(data.state.quotes.find(q=>q.numero==='COT-0002').estado).toBe('vigente');
});

test('administrador: anula una cotización con motivo y queda en «Anuladas»',async({page,scenario})=>{
 await scenario.act(quoteBody(scenario));
 await login(page,scenario.admin);await navigate(page,'Cotizaciones');
 const item=page.getByRole('listitem').filter({hasText:'COT-0001'});
 await expect(item.getByRole('link',{name:'WhatsApp',exact:true})).toHaveAttribute('href',new RegExp('wa\\.me/57'+PHONE));
 await item.getByRole('button',{name:'Anular',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Anular COT-0001',exact:true});
 await dialog.getByLabel('Motivo',{exact:true}).fill('El cliente compró en otro lado (QA)');
 await dialog.getByRole('button',{name:'Anular cotización',exact:true}).click();
 await expect(page.getByText('Cotización COT-0001 anulada.',{exact:true})).toBeVisible();
 const data=await scenario.data();expect(data.state.quotes[0]).toMatchObject({estado:'anulada'});expect(data.state.quotes[0].anulacion.motivo).toBe('El cliente compró en otro lado (QA)');
 expect((await productOf(scenario)).stock).toBe(50);
 await page.getByRole('tab',{name:/^Anuladas/}).click();await expect(page.getByRole('listitem').filter({hasText:'COT-0001'}).getByText('Anulada',{exact:true})).toBeVisible();
 await expect(page.getByRole('tab',{name:/^Vigentes/})).toContainText('0');
});

test('vendedor: cotiza con una ficha enmascarada, el WhatsApp no filtra el número y convierte la venta',async({page,scenario})=>{
 const customer=(await scenario.act({type:'customer.create',form:{nombre:'Ficha Cotiza '+scenario.suffix,telefono:PHONE,dataConsent:true}})).state.customerRecords.find(c=>c.nombre==='Ficha Cotiza '+scenario.suffix);
 await login(page,scenario.seller);await addProduct(page,scenario.product);
 await page.getByRole('spinbutton',{name:'Cantidad de '+scenario.product.nombre,exact:true}).fill('2');
 await page.locator('summary',{hasText:'Agregar cliente (opcional)'}).click();
 await page.getByLabel('Buscar cliente registrado',{exact:true}).fill('Ficha Cotiza');
 const option=page.getByRole('button',{name:'Usar ficha de Ficha Cotiza '+scenario.suffix,exact:true});
 await expect(option).toContainText(MASKED);await expect(option).not.toContainText(PHONE);await option.click();
 await waitSaved(page);
 await page.getByRole('button',{name:'Guardar como cotización',exact:true}).click();
 const saved=page.getByRole('dialog',{name:'Cotización COT-0001',exact:true});await expect(saved).toBeVisible();
 const link=saved.getByRole('link',{name:'Enviar por WhatsApp',exact:true});
 await expect(link).toHaveAttribute('href',/^https:\/\/wa\.me\/\?text=/);
 expect(await link.getAttribute('href')).not.toContain('8990');
 await saved.getByRole('button',{name:'Listo',exact:true}).click();
 // El servidor conserva el teléfono completo en la ficha; el vendedor solo recibe el final.
 const seen=(await scenario.sellerData()).state.quotes[0];expect(seen).toMatchObject({numero:'COT-0001',customerId:customer.id,total:70000,telefono:MASKED});
 expect((await scenario.data()).state.quotes[0].telefono).toBe(PHONE);
 await expect(page.locator('body')).not.toContainText(PHONE);
 // Convierte la cotización por transferencia: la venta se registra a nombre de la ficha.
 const dialog=await convertDialog(page,'COT-0001');
 await dialog.getByRole('combobox',{name:/^Medio de pago/}).selectOption('transferencia');await noOverflow(page);
 await dialog.getByRole('button',{name:'Registrar venta',exact:true}).click();
 const done=page.getByRole('dialog',{name:'Venta registrada',exact:true});await expect(done).toContainText(cop(70000));await expect(done).toContainText('Ficha Cotiza '+scenario.suffix);
 const data=await scenario.data();
 expect(data.state.ventas[0]).toMatchObject({total:70000,paymentMethod:'transferencia',customerId:customer.id});expect(data.state.quotes[0].estado).toBe('convertida');
 expect((await productOf(scenario)).stock).toBe(48);
 await expect(page.locator('body')).not.toContainText(PHONE);
});
