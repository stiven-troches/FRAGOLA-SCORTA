// QA PUNTO 10(b): garantías. Recepción del reclamo, decisión del administrador, reclamo al proveedor y
// cierre, en escritorio y celular. Se comprueba stock vendible, stock en garantía y dinero devuelto.
import {test,expect,login,navigate,noOverflow} from './fixtures.mjs';

const PHONE='3157788990',MASKED='•••8990';
const stock=async scenario=>(await scenario.data()).state.prods.find(p=>p.id===scenario.product.id);
// Producto con 90 días de garantía y una venta de 3 unidades a un cliente (la hace el vendedor o el administrador).
async function sold(scenario,{by='act',cliente='Cliente Garantia'}={}){
 await scenario.act({type:'business.change',payload:{kind:'producto',form:{...scenario.product,garantia_dias:90}}});
 const sale=await scenario[by]({type:'sale.create',form:{cliente:cliente+' '+scenario.suffix,telefono:PHONE,dataConsent:true,paymentMethod:'efectivo'},items:[{producto_id:scenario.product.id,cantidad:3,precio_unitario:scenario.product.precio_venta}],labor:[]});
 return sale.state.ventas[0];
}
async function receive(page,scenario,{cliente='Cliente Garantia',motivo,units='1',decision}){
 await page.getByRole('button',{name:'Recibir garantía',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Recibir garantía',exact:true});await expect(dialog).toBeVisible();
 await dialog.getByLabel(/^Buscar la venta/).fill(cliente+' '+scenario.suffix);
 await dialog.getByRole('button',{name:new RegExp('^'+cliente+' '+scenario.suffix)}).click();
 await expect(dialog.getByText('Garantía de 90 días, vigente hasta el',{exact:false})).toBeVisible();
 await dialog.getByLabel('Unidades',{exact:true}).fill(units);
 await dialog.getByLabel('Motivo del reclamo',{exact:true}).fill(motivo);
 if(decision)await dialog.getByRole('combobox',{name:/^Decisión/}).selectOption(decision);
 await noOverflow(page);
 await dialog.getByRole('button',{name:'Recibir pieza',exact:true}).click();
 return dialog;
}

test('administrador: recibe el reclamo, decide cambio, lo envía al proveedor y lo cierra con reposición',async({page,scenario})=>{
 await sold(scenario);
 expect(await stock(scenario)).toMatchObject({stock:47});
 await login(page,scenario.admin);await navigate(page,'Garantías');
 await expect(page.getByRole('heading',{name:'Garantías',exact:true})).toBeVisible();
 await expect(page.getByText(/Aún no hay garantías/)).toBeVisible();
 // 1) Recepción: validaciones y registro. La pieza no vuelve al stock vendible.
 await page.getByRole('button',{name:'Recibir garantía',exact:true}).click();
 const blank=page.getByRole('dialog',{name:'Recibir garantía',exact:true});
 await expect(blank.getByRole('button',{name:'Recibir pieza',exact:true})).toBeDisabled();
 await blank.getByRole('button',{name:'Cancelar',exact:true}).click();
 await receive(page,scenario,{motivo:'No enciende (QA)'});
 const done=page.getByRole('dialog',{name:'Garantía GAR-0001',exact:true});await expect(done).toBeVisible();
 await expect(done).toContainText('Aceite QA');await expect(done).toContainText('Recibida del cliente');
 await done.getByRole('button',{name:'Listo',exact:true}).click();
 await expect(page.getByText(/Garantía GAR-0001 recibida\. La pieza quedó fuera del stock vendible\./)).toBeVisible();
 let product=await stock(scenario);expect(product).toMatchObject({stock:47,stock_garantia:1});
 const item=page.getByRole('listitem').filter({hasText:'GAR-0001'});
 await expect(item).toContainText('Motivo: No enciende (QA)');await expect(item.getByText('Por decidir',{exact:true})).toBeVisible();
 // 2) Decisión: cambio por otra unidad (sale del stock vendible).
 await item.getByRole('button',{name:'Decidir',exact:true}).click();
 const decide=page.getByRole('dialog',{name:'Decidir GAR-0001',exact:true});
 await decide.getByRole('combobox',{name:/^Decisión/}).selectOption('cambio');
 await expect(decide).toContainText('Se entrega otra unidad del stock vendible');
 await decide.getByLabel('Nota (opcional)',{exact:true}).fill('Se entregó otra unidad');
 await decide.getByRole('button',{name:'Guardar decisión',exact:true}).click();
 await expect(page.getByText(/Garantía GAR-0001: cambio por otra unidad\./)).toBeVisible();
 product=await stock(scenario);expect(product).toMatchObject({stock:46,stock_garantia:1});
 await expect(item.getByText('Cambio por otra unidad',{exact:true})).toBeVisible();await expect(item.getByRole('button',{name:'Decidir',exact:true})).toHaveCount(0);
 // 3) Reclamo al proveedor: recibida → enviada → aprobada → cerrada con reposición.
 await item.getByRole('button',{name:'Enviar al proveedor',exact:true}).click();
 const send=page.getByRole('dialog',{name:/^GAR-0001: Enviada al proveedor/});
 await send.getByRole('button',{name:'Guardar',exact:true}).click();
 await expect(send.getByRole('alert')).toContainText('Indica el proveedor.');
 await send.getByLabel('Proveedor',{exact:true}).fill('Distribuidora QA');await send.getByLabel('Nota (opcional)',{exact:true}).fill('Guía 123');
 await send.getByRole('button',{name:'Guardar',exact:true}).click();
 await expect(item.getByText('Enviada al proveedor',{exact:true})).toBeVisible();await expect(item).toContainText('Proveedor: Distribuidora QA');
 await item.getByRole('button',{name:'Aprobada',exact:true}).click();
 await page.getByRole('dialog',{name:/^GAR-0001: Aprobada por el proveedor/}).getByRole('button',{name:'Guardar',exact:true}).click();
 await expect(item.getByText('Aprobada por el proveedor',{exact:true})).toBeVisible();
 await item.getByRole('button',{name:'Cerrar',exact:true}).click();
 const close=page.getByRole('dialog',{name:/^GAR-0001: Cerrada/});
 await close.getByRole('combobox',{name:/^Resultado/}).selectOption('reposicion');
 await close.getByRole('button',{name:'Guardar',exact:true}).click();
 await expect(page.getByText(/Garantía GAR-0001: cerrada\./)).toBeVisible();
 const data=await scenario.data();const warranty=data.state.warranties[0];
 expect(warranty).toMatchObject({numero:'GAR-0001',estado:'cerrada',resultado:'reposicion',proveedor:'Distribuidora QA'});
 expect(data.state.prods.find(p=>p.id===scenario.product.id)).toMatchObject({stock:47,stock_garantia:0});
 await page.getByRole('tab',{name:/^Cerradas/}).click();
 await expect(page.getByRole('listitem').filter({hasText:'GAR-0001'}).getByText('Cerrada',{exact:true})).toBeVisible();
 // 4) Reporte del período (solo administrador).
 await page.getByRole('tab',{name:'Reporte',exact:true}).click();
 await expect(page.locator('.cc-metric',{hasText:'Garantías del período'}).getByText('1',{exact:true})).toBeVisible();
 await expect(page.getByRole('row').filter({hasText:'Distribuidora QA'})).toBeVisible();
});

test('administrador: devolución de dinero baja la venta y rechazo devuelve la pieza al cliente',async({page,scenario})=>{
 const sale=await sold(scenario);
 await login(page,scenario.admin);await navigate(page,'Garantías');
 // Devolución: el dinero de la unidad se devuelve como devolución parcial de la venta; la pieza no vuelve al stock.
 await receive(page,scenario,{motivo:'Se partió al instalar (QA)',decision:'devolucion'});
 await page.getByRole('dialog',{name:'Garantía GAR-0001',exact:true}).getByRole('button',{name:'Listo',exact:true}).click();
 let data=await scenario.data();
 expect(data.state.ventas.find(s=>s.id===sale.id).detalles[0].devuelto).toBe(1);
 expect(data.state.prods.find(p=>p.id===scenario.product.id)).toMatchObject({stock:47,stock_garantia:1});
 expect(data.state.warranties[0].decision.tipo).toBe('devolucion');
 const first=page.getByRole('listitem').filter({hasText:'GAR-0001'});await expect(first.getByText('Devolución de dinero',{exact:true})).toBeVisible();
 // Rechazo: la garantía se cierra y la pieza vuelve al cliente.
 await receive(page,scenario,{motivo:'Mal uso (QA)'});
 await page.getByRole('dialog',{name:'Garantía GAR-0002',exact:true}).getByRole('button',{name:'Listo',exact:true}).click();
 const second=page.getByRole('listitem').filter({hasText:'GAR-0002'});
 await second.getByRole('button',{name:'Decidir',exact:true}).click();
 const decide=page.getByRole('dialog',{name:'Decidir GAR-0002',exact:true});
 await decide.getByRole('combobox',{name:/^Decisión/}).selectOption('rechazo');await expect(decide).toContainText('La pieza se devuelve al cliente y la garantía queda cerrada.');
 await decide.getByRole('button',{name:'Guardar decisión',exact:true}).click();
 await expect(page.getByText(/Garantía GAR-0002: rechazada\./)).toBeVisible();
 data=await scenario.data();const rejected=data.state.warranties.find(w=>w.numero==='GAR-0002');
 expect(rejected).toMatchObject({estado:'cerrada',resultado:'devuelta_cliente'});
 expect(data.state.prods.find(p=>p.id===scenario.product.id)).toMatchObject({stock_garantia:1});
 // Quedan 2 unidades reclamables: 3 vendidas − 1 devuelta (la devolución no se resta dos veces; la rechazada queda libre).
 await page.getByRole('button',{name:'Recibir garantía',exact:true}).click();
 const again=page.getByRole('dialog',{name:'Recibir garantía',exact:true});
 await again.getByLabel(/^Buscar la venta/).fill('Cliente Garantia '+scenario.suffix);await again.getByRole('button',{name:/^Cliente Garantia/}).click();
 await expect(again.getByRole('combobox',{name:/^Producto con falla/})).toContainText('2 por reclamar');
});

test('vendedor: recibe garantía de su venta con teléfono enmascarado y no puede decidir',async({page,scenario})=>{
 const sale=await sold(scenario,{by:'sellerAct'});
 expect((await scenario.sellerData()).state.ventas.find(s=>s.id===sale.id).telefono).toBe(MASKED);
 await login(page,scenario.seller);await navigate(page,'Garantías');
 await expect(page.getByRole('button',{name:'Reporte',exact:true})).toHaveCount(0);
 await receive(page,scenario,{motivo:'Falla de fábrica (QA)'});
 const done=page.getByRole('dialog',{name:'Garantía GAR-0001',exact:true});await expect(done).toBeVisible();
 await done.getByRole('button',{name:'Listo',exact:true}).click();
 const item=page.getByRole('listitem').filter({hasText:'GAR-0001'});
 await expect(item.getByText('Por decidir',{exact:true})).toBeVisible();
 for(const name of ['Decidir','Enviar al proveedor','Aprobada','Cerrar'])await expect(item.getByRole('button',{name,exact:true})).toHaveCount(0);
 await expect(page.locator('body')).not.toContainText(PHONE);
 expect((await scenario.data()).state.warranties[0]).toMatchObject({numero:'GAR-0001',estado:'recibida',telefono:PHONE});
 expect((await scenario.sellerData()).state.warranties[0].telefono).toBe(MASKED);
 // El administrador decide (API) y el vendedor ve el resultado al recargar.
 await scenario.act({type:'warranty.decide',id:(await scenario.data()).state.warranties[0].id,form:{decision:'rechazo',nota:'Mal uso'}});
 await page.reload();await expect(page.getByRole('heading',{name:'Nueva venta',exact:true})).toBeVisible();await navigate(page,'Garantías');await expect(page.getByRole('heading',{name:'Garantías',exact:true})).toBeVisible();
 await page.getByRole('tab',{name:/^Cerradas/}).click();
 await expect(page.getByRole('listitem').filter({hasText:'GAR-0001'}).getByText('Rechazada',{exact:true})).toBeVisible();
});
