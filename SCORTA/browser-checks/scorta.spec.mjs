import {test,expect,login,navigate,profile,addProduct,noOverflow,waitSaved,request,OWNER,action,day} from './fixtures.mjs';

test('propietario administra empresa y credenciales sin exponerlas en tarjetas',async({page,scenario})=>{
 await login(page,OWNER);await expect(page.getByRole('button',{name:'Administrar '+scenario.company.name,exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Administrar '+scenario.company.name,exact:true}).click();
 await expect(page.getByRole('heading',{name:scenario.company.name,exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Acceder como soporte',exact:true})).toBeVisible();
 await expect(page.getByText(scenario.admin.password,{exact:true})).toHaveCount(0);await noOverflow(page);
});

for(const role of ['admin','seller'])test(`${role}: inventario y taller alimentan el mismo cobro y conservan el borrador`,async({page,scenario})=>{
 await login(page,scenario[role]);await addProduct(page,scenario.product);
 await page.getByRole('spinbutton',{name:'Cantidad de '+scenario.product.nombre,exact:true}).fill('2');
 await page.getByRole('button',{name:'Agregar una unidad de '+scenario.product.nombre,exact:true}).click();
 await expect(page.getByRole('spinbutton',{name:'Cantidad de '+scenario.product.nombre,exact:true})).toHaveValue('3');
 await navigate(page,'Taller');await page.getByLabel('Placa de la moto',{exact:true}).fill('QA123D');
 await page.getByLabel('Trabajo realizado',{exact:true}).fill('Cambio de aceite QA');
 await page.getByLabel('Mecánico',{exact:true}).selectOption(scenario.mechanic.id);await page.getByLabel('Valor de mano de obra (COP)',{exact:true}).fill('15000');
 await page.getByRole('button',{name:'Agregar al carrito',exact:true}).click();await navigate(page,'Nueva venta');
 await waitSaved(page);await page.reload();await expect(page.getByRole('spinbutton',{name:'Cantidad de '+scenario.product.nombre,exact:true})).toHaveValue('3');
 await expect(page.getByText('Cambio de aceite QA',{exact:true})).toBeVisible();await noOverflow(page);
 await page.getByRole('button',{name:'Registrar venta',exact:true}).click();await expect(page.getByRole('dialog',{name:'Detalle de venta'})).toBeVisible();
 const data=await scenario.data();const sale=data.state.ventas.find(item=>item.placa==='QA123D');expect(sale.total).toBe(120000);expect(data.state.prods.find(p=>p.id===scenario.product.id).stock).toBe(47);
});

test('vendedor sólo ve sus módulos y móvil usa cuatro pestañas sin estrechar contenido',async({page,scenario},info)=>{
 await login(page,scenario.seller);await navigate(page,'Inventario');await noOverflow(page);
 await expect(page.getByRole('button',{name:'Nuevo producto',exact:true})).toHaveCount(0);
 if(info.project.name.startsWith('movil')){
  await expect(page.getByRole('navigation',{name:'Módulos de la empresa'})).not.toBeVisible();
  const mobile=page.getByRole('navigation',{name:'Navegación móvil'});await expect(mobile.getByRole('button')).toHaveCount(4);
  await mobile.getByRole('button',{name:'Más',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Más opciones'});
  for(const label of ['Compras','Movimientos','Resumen general'])await expect(dialog.getByRole('button',{name:label,exact:true})).toHaveCount(0);
  await expect(dialog.getByRole('button',{name:'Perfil y soporte',exact:true})).toBeVisible();await page.keyboard.press('Escape');
 }
});

test('Escape solicita confirmación de datos sin guardar y conserva el formulario al cancelar',async({page,scenario})=>{
 await login(page,scenario.admin);await navigate(page,'Inventario');await page.getByRole('button',{name:'Nuevo producto',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Producto',exact:true});await dialog.getByLabel('Nombre del producto',{exact:true}).fill('Producto aún no guardado');
 const confirmation=page.waitForEvent('dialog');await page.keyboard.press('Escape');const prompt=await confirmation;expect(prompt.type()).toBe('confirm');await prompt.dismiss();
 await expect(dialog).toBeVisible();await expect(dialog.getByLabel('Nombre del producto',{exact:true})).toHaveValue('Producto aún no guardado');
 page.once('dialog',d=>d.accept());await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
});

test('reintento de cobro tras respuesta perdida registra una sola venta',async({page,scenario})=>{
 await login(page,scenario.seller);await addProduct(page,scenario.product);await waitSaved(page);
 let lost=false;await page.route('**/api/v2/action',async route=>{const body=route.request().postDataJSON();if(!lost&&body?.type==='sale.create'){lost=true;await route.fetch();await route.abort('failed')}else await route.continue()});
 await page.getByRole('button',{name:'Registrar venta',exact:true}).click();
 await expect(page.getByRole('button',{name:'Comprobar cobro pendiente',exact:true}).first()).toBeVisible();
 await page.getByRole('button',{name:'Comprobar cobro pendiente',exact:true}).first().click();
 await expect.poll(async()=>(await scenario.data()).state.ventas.length).toBe(1);
 await expect(page.getByRole('button',{name:'Comprobar cobro pendiente',exact:true})).toHaveCount(0);
 const data=await scenario.data();expect(data.state.prods.find(p=>p.id===scenario.product.id).stock).toBe(49);
});

test('compra pendiente bloquea cambios hasta confirmar el POST',async({page,scenario})=>{
 await login(page,scenario.admin);await navigate(page,'Compras');await page.getByRole('button',{name:'Ingresar mercancía',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Ingresar mercancía',exact:true});await dialog.getByLabel('Proveedor',{exact:true}).fill('Proveedor QA');
 await dialog.getByLabel('Producto',{exact:true}).selectOption(scenario.product.id);await dialog.getByLabel('Cantidad recibida',{exact:true}).fill('2');await dialog.getByLabel('Costo por unidad (COP)',{exact:true}).fill('20000');await dialog.getByRole('button',{name:'Agregar a la compra',exact:true}).click();
 let release;const blocked=new Promise(resolve=>{release=resolve});await page.route('**/api/v2/action',async route=>{if(route.request().postDataJSON()?.payload?.kind==='compra'){await blocked;await route.continue()}else await route.continue()});
 await dialog.getByRole('button',{name:'Registrar compra',exact:true}).click();
 await expect(dialog.getByLabel('Proveedor',{exact:true})).toBeDisabled();await expect(dialog.getByRole('button',{name:'Agregar a la compra',exact:true})).toBeDisabled();
 release();await expect(dialog).not.toBeVisible();expect((await scenario.data()).state.prods.find(p=>p.id===scenario.product.id).stock).toBe(52);
});

test('ticket y respuesta llegan al perfil del solicitante y a la campana del propietario',async({page,scenario,browser})=>{
 await login(page,scenario.seller);await profile(page);await page.getByRole('button',{name:'Crear ticket',exact:true}).click();
 const support=page.getByRole('dialog',{name:'Tickets de soporte'});await support.getByLabel('Asunto',{exact:true}).fill('Problema QA '+scenario.suffix);await support.getByLabel('Descripción del problema',{exact:true}).fill('Descripción ficticia para comprobar respuestas de soporte');await support.getByRole('button',{name:'Enviar ticket',exact:true}).click();
 await expect(support.getByRole('button',{name:new RegExp('Problema QA '+scenario.suffix)})).toBeVisible();
 const ownerContext=await browser.newContext();const ownerPage=await ownerContext.newPage();
 try{
  await login(ownerPage,OWNER);await ownerPage.getByRole('button',{name:new RegExp('Tickets de soporte de '+scenario.company.name+':')}).click();
  const ownerSupport=ownerPage.getByRole('dialog',{name:'Tickets de soporte'});await ownerSupport.getByRole('button',{name:new RegExp('Problema QA '+scenario.suffix)}).click();
  await ownerSupport.getByLabel(/Respuesta|Mensaje/).fill('Respuesta QA verificada');await ownerSupport.getByRole('button',{name:/Enviar respuesta|Enviar mensaje/}).click();
  await expect(ownerSupport.getByText('Respuesta QA verificada',{exact:true})).toBeVisible();
  await page.reload();await expect(page.getByRole('heading',{name:'Nueva venta',exact:true})).toBeVisible();if(await page.getByRole('navigation',{name:'Navegación móvil'}).isVisible())await expect(page.getByRole('button',{name:'Mi perfil, 1 respuestas sin leer',exact:true})).toBeVisible();else await expect(page.getByTitle(/^Mi perfil:/).getByLabel('1 respuestas sin leer',{exact:true})).toBeVisible();await profile(page);await page.getByRole('button',{name:/Ver tickets y respuestas/}).click();
  const response=page.getByRole('dialog',{name:'Tickets de soporte'});await response.getByRole('button',{name:new RegExp('Problema QA '+scenario.suffix)}).click();await expect(response.getByText('Respuesta QA verificada',{exact:true})).toBeVisible();
 }finally{await ownerContext.close()}
});

test('soporte en dos pestañas no cambia de empresa al operar con contexto anterior',async({page,scenario})=>{
 const created=await action(scenario.ownerApi,{type:'company.create',form:{name:'QA Segunda '+scenario.suffix,contact:'QA Contacto',startDate:day(-1),endDate:day(30),monthlyFee:80000,username:'qaadmin',password:'QA.Admin!2026'}});
 const other=created.companies.find(c=>c.name==='QA Segunda '+scenario.suffix);const stale=await page.context().newPage();
 try{
  await login(page,OWNER);await stale.goto('/');await expect(stale.getByRole('heading',{name:'Empresas',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Administrar '+scenario.company.name,exact:true}).click();await page.getByRole('button',{name:'Acceder como soporte',exact:true}).click();await page.getByLabel('Motivo de la solicitud del cliente',{exact:true}).fill('Prueba de soporte QA');await page.getByRole('button',{name:'Iniciar soporte',exact:true}).click();
  await expect(page.getByText(/Acceso de soporte/).first()).toBeVisible();
  await stale.getByRole('button',{name:'Administrar '+other.name,exact:true}).click();await stale.getByRole('button',{name:'Acceder como soporte',exact:true}).click();await stale.getByLabel('Motivo de la solicitud del cliente',{exact:true}).fill('Otra prueba de soporte QA');await stale.getByRole('button',{name:'Iniciar soporte',exact:true}).click();
  await expect(stale.getByRole('alert').first()).toContainText(/contexto|empresa|cambi/i);
  const actual=await request(page.request,'/api/v2/session',{companyId:scenario.company.id});expect(actual.session.companyId).toBe(scenario.company.id);
 }finally{await stale.close();await action(scenario.ownerApi,{type:'company.delete',companyId:other.id,form:{confirmation:other.name}})}
});
