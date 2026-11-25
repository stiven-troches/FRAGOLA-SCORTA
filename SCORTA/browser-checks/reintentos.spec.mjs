// FE-13: «Reintentar operación» (local en Nueva venta y global en el aviso de estado) reenvía
// la misma llave de idempotencia y no duplica el registro.
// FE-14: «Deshacer» al retirar una línea del carrito (ventana de 6 segundos).
import {test,expect,login,addProduct,waitSaved,request,action,OWNER,day} from './fixtures.mjs';

// Simula un corte de red en el primer POST que cumpla `matches`. Con reached=true el servidor
// sí recibe y registra la operación y solo se pierde la respuesta; con reached=false la petición
// no llega. Devuelve los cuerpos enviados para comparar las llaves de idempotencia.
async function cutFirst(page,matches,{reached}){
 const sent=[];let cut=false;
 await page.route('**/api/v2/action',async route=>{
  const body=route.request().postDataJSON();
  if(matches(body))sent.push(body);
  if(!cut&&matches(body)){cut=true;if(reached)await route.fetch();await route.abort('failed')}else await route.continue();
 });
 return sent;
}
const isSale=body=>body?.type==='sale.create';

test('FE-13 local: el cobro que no llegó queda pendiente y «Reintentar operación» lo envía con la misma llave',async({page,scenario})=>{
 await login(page,scenario.seller);await addProduct(page,scenario.product);await waitSaved(page);
 const sent=await cutFirst(page,isSale,{reached:false});
 await page.getByRole('button',{name:'Registrar venta',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:/No se pudo conectar/}).first()).toBeVisible();
 // El cobro es dueño de la operación pendiente: no aparece también el botón global.
 await expect(page.getByRole('complementary',{name:'Estado de operación'}).getByRole('button',{name:'Reintentar operación'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Comprobar cobro pendiente',exact:true}).first()).toBeEnabled();
 expect((await scenario.data()).state.ventas).toHaveLength(0);
 // La venta pendiente (con su llave) queda en el borrador: sobrevive a recargar la página y
 // el botón de cobro pasa a «Reintentar operación».
 await page.reload();await expect(page.getByText('Recuperando venta pendiente…',{exact:true})).toHaveCount(0);
 const retry=page.getByRole('button',{name:'Reintentar operación',exact:true});
 await expect(retry).toHaveCount(1);await expect(retry).toBeEnabled();
 await expect(page.getByRole('button',{name:'Registrar venta',exact:true})).toHaveCount(0);
 await retry.click();
 await expect(page.getByRole('dialog',{name:'Detalle de venta'})).toBeVisible();
 expect(sent).toHaveLength(2);expect(sent[1].requestId).toBe(sent[0].requestId);
 const data=await scenario.data();expect(data.state.ventas).toHaveLength(1);
 expect(data.state.prods.find(p=>p.id===scenario.product.id).stock).toBe(49);
 await expect(page.getByRole('button',{name:'Reintentar operación',exact:true})).toHaveCount(0);
 expect((await scenario.data()).state.ventas).toHaveLength(1);
});

test('FE-13 local: si se perdió solo la respuesta, recargar no ofrece repetir el cobro ni duplica la venta',async({page,scenario})=>{
 await login(page,scenario.seller);await addProduct(page,scenario.product);await waitSaved(page);
 await cutFirst(page,isSale,{reached:true});
 await page.getByRole('button',{name:'Registrar venta',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:/No se pudo conectar/}).first()).toBeVisible();
 await expect.poll(async()=>(await scenario.data()).state.ventas.length).toBe(1);
 // El servidor cerró el borrador junto con la venta: al recargar no queda nada por cobrar.
 await page.reload();await expect(page.getByText('Recuperando venta pendiente…',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Reintentar operación',exact:true})).toHaveCount(0);
 await expect(page.getByRole('spinbutton',{name:'Cantidad de '+scenario.product.nombre,exact:true})).toHaveCount(0);
 const data=await scenario.data();expect(data.state.ventas).toHaveLength(1);
 expect(data.state.prods.find(p=>p.id===scenario.product.id).stock).toBe(49);
});

test('FE-13 global: «Reintentar operación» del aviso de estado reenvía la misma llave sin duplicar',async({page,scenario})=>{
 const name='QA Reintento '+scenario.suffix;
 await login(page,OWNER);
 const sent=await cutFirst(page,body=>body?.type==='company.create',{reached:true});
 await page.getByRole('button',{name:/^Crear (nueva )?empresa$/}).first().click();
 const form=page.getByRole('dialog').filter({has:page.getByLabel('Nombre de la empresa',{exact:true})});
 await form.getByLabel('Nombre de la empresa',{exact:true}).fill(name);
 await form.getByLabel('Persona de contacto',{exact:true}).fill('Contacto Ficticio');
 // Las etiquetas con ayuda incluyen ese texto en el nombre accesible: se busca por el inicio.
 await form.getByRole('textbox',{name:/^WhatsApp con indicativo/}).fill('+573001112233');
 await form.getByRole('textbox',{name:/^Usuario de acceso/}).fill('qareintento');
 await form.locator('input[type=password]').fill('QA.Reintento!2026');
 await form.getByRole('spinbutton',{name:/^Mensualidad acordada/}).fill('80000');
 await form.getByRole('button',{name:'Crear empresa',exact:true}).click();
 const status=page.getByRole('complementary',{name:'Estado de operación'});
 await expect(status.getByText('Hay una operación sin confirmar. Compruébala antes de continuar.',{exact:true})).toBeVisible();
 const retry=status.getByRole('button',{name:'Reintentar operación',exact:true});await expect(retry).toBeEnabled();
 // El formulario sigue abierto con el error; se cierra para llegar al aviso global.
 await expect(form).toContainText(/No se pudo conectar/);
 page.on('dialog',prompt=>prompt.accept());
 await form.getByRole('button',{name:'Cancelar',exact:true}).click();await expect(form).toHaveCount(0);
 let companies=(await request(scenario.ownerApi,'/api/v2/data')).companies.filter(c=>c.name===name);
 try{
  expect(companies).toHaveLength(1);
  await retry.click();
  await expect(status.getByText('Operación comprobada. Los datos están actualizados.',{exact:true})).toBeVisible();
  await expect(status.getByRole('button',{name:'Reintentar operación',exact:true})).toHaveCount(0);
  expect(sent).toHaveLength(2);expect(sent[1].requestId).toBe(sent[0].requestId);
  companies=(await request(scenario.ownerApi,'/api/v2/data')).companies.filter(c=>c.name===name);
  expect(companies).toHaveLength(1);
 }finally{
  for(const company of companies)await action(scenario.ownerApi,{type:'company.delete',companyId:company.id,form:{confirmation:company.name}}).catch(()=>{});
 }
});

async function preparedCart(page,scenario){
 await login(page,scenario.admin);await addProduct(page,scenario.product);
 const name=scenario.product.nombre,quantity=page.getByRole('spinbutton',{name:'Cantidad de '+name,exact:true});
 await quantity.fill('3');
 const line=page.locator('.cw-line-adjust').filter({has:page.getByLabel('Precio por unidad de '+name,{exact:true})});
 await line.locator('summary').click();
 const price=page.getByLabel('Precio por unidad de '+name,{exact:true});await price.fill('33000');await price.blur();
 await expect(quantity).toHaveValue('3');
 await waitSaved(page);
 return {name,quantity,price,priceValue:await price.inputValue()};
}

test('FE-14: «Deshacer» dentro de 6 s restaura la línea con la misma cantidad y precio',async({page,scenario})=>{
 const {name,quantity,priceValue}=await preparedCart(page,scenario);
 await page.getByRole('button',{name:'Retirar '+name,exact:true}).click();
 await expect(quantity).toHaveCount(0);
 const undo=page.getByRole('status').filter({hasText:name+' retirado del carrito.'});
 await expect(undo).toBeVisible();
 await undo.getByRole('button',{name:'Deshacer',exact:true}).click();
 await expect(page.getByText('Se restauró en el carrito.',{exact:true})).toBeVisible();
 await expect(page.getByRole('spinbutton',{name:'Cantidad de '+name,exact:true})).toHaveValue('3');
 const line=page.locator('.cw-line-adjust').filter({has:page.getByLabel('Precio por unidad de '+name,{exact:true})});
 if(!await page.getByLabel('Precio por unidad de '+name,{exact:true}).isVisible())await line.locator('summary').click();
 await expect(page.getByLabel('Precio por unidad de '+name,{exact:true})).toHaveValue(priceValue);
 await expect(page.getByRole('button',{name:'Deshacer',exact:true})).toHaveCount(0);
 // El carrito restaurado se cobra con la cantidad y el precio editado.
 await waitSaved(page);
 await page.getByRole('button',{name:'Registrar venta',exact:true}).click();await expect(page.getByRole('dialog',{name:'Detalle de venta'})).toBeVisible();
 const sale=(await scenario.data()).state.ventas[0];
 expect(sale.detalles[0].cantidad).toBe(3);expect(sale.detalles[0].precio_unitario).toBe(33000);
});

test('FE-14: pasados 6 s sin «Deshacer» la línea queda retirada',async({page,scenario})=>{
 const {name,quantity}=await preparedCart(page,scenario);
 await page.getByRole('button',{name:'Retirar '+name,exact:true}).click();
 await expect(quantity).toHaveCount(0);
 const undoButton=page.getByRole('button',{name:'Deshacer',exact:true});
 await expect(undoButton).toBeVisible();
 // Sigue disponible poco antes del límite y desaparece después de los 6 s.
 await page.waitForTimeout(4500);await expect(undoButton).toBeVisible();
 await expect(undoButton).toHaveCount(0,{timeout:4000});
 await page.waitForTimeout(500);
 await expect(page.getByRole('spinbutton',{name:'Cantidad de '+name,exact:true})).toHaveCount(0);
 await waitSaved(page);await page.reload();
 await expect(page.getByRole('heading',{name:/Nueva venta|Resumen general/i}).first()).toBeVisible();
 await expect(page.getByText('Recuperando venta pendiente…',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('spinbutton',{name:'Cantidad de '+name,exact:true})).toHaveCount(0);
});
