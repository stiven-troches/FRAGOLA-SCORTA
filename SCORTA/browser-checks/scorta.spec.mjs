import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';

const password='SCORTA-QA-Password-12345';
const origin='http://127.0.0.1:19420';
async function ensureMenu(page){const summary=page.locator('.mobile-navigation > summary');if(await summary.isVisible()&&!(await page.locator('.mobile-navigation').getAttribute('open')!==null))await summary.click()}
async function navigate(page,name){await ensureMenu(page);await page.getByRole('navigation').getByRole('button',{name,exact:false}).click()}

async function login(page,username='admin',secret=password){
 await page.goto('/');
 await page.getByLabel('Usuario',{exact:true}).fill(username);
 await page.getByLabel('Contraseña',{exact:true}).fill(secret);
 await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await expect(page.getByRole('button',{name:'Cerrar sesión',exact:true})).toBeVisible();
 await expect(page.locator('.connection-bar')).toContainText('Datos actualizados');
}
async function state(page){const r=await page.request.get('/api/state');expect(r.ok()).toBeTruthy();return r.json()}
async function change(page,kind,form,extra={}){const before=await state(page);const r=await page.request.post('/api/change',{headers:{Origin:origin},data:{kind,form,revision:before.revision,requestId:crypto.randomUUID(),...extra}});expect(r.ok(),await r.text()).toBeTruthy();return r.json()}
async function seed(page,name,extra={}){const s=await change(page,'producto',{nombre:name,referencia:name.replaceAll(' ','-'),precio_venta:45000,precio_compra:25000,stock:3,stock_minimo:1,categoria:'Cascos',marca:'QA Moto',...extra});await page.getByText('Opciones',{exact:true}).click();await page.getByRole('button',{name:'Actualizar datos',exact:true}).click();return s.prods.find(p=>p.nombre===name)}
async function noPageOverflow(page){const size=await page.evaluate(()=>({document:document.documentElement.scrollWidth,viewport:innerWidth}));expect(size.document).toBeLessThanOrEqual(size.viewport+1)}
async function capture(page,name,info){mkdirSync(resolve('docs/capturas'),{recursive:true});await page.screenshot({path:resolve(`docs/capturas/${name}-${info.project.name}.png`),fullPage:!name.startsWith('venta'),scale:'css'})}

test('acceso, producto nuevo y cierre de sesión',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.getByLabel('Usuario',{exact:true}).fill('admin');await page.getByLabel('Contraseña',{exact:true}).fill('incorrecta');await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Usuario o contraseña incorrectos');
 await page.getByLabel('Contraseña',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.locator('.connection-bar')).toContainText('Datos actualizados');
 await navigate(page,'Inventario');
 await page.getByRole('button',{name:/Nuevo producto/i}).click();const dialog=page.getByRole('dialog');
 const name=`Guantes creación ${info.project.name}`;
 await dialog.getByLabel('Nombre *',{exact:true}).fill(name);await dialog.getByLabel(/Precio de venta/).fill('60000');await dialog.getByLabel('Existencias iniciales',{exact:true}).fill('5');
 await noPageOverflow(page);await dialog.getByRole('button',{name:/Guardar/}).click();await expect(dialog).not.toBeVisible();
 expect((await state(page)).prods.find(p=>p.nombre===name)?.stock).toBe(5);
 await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await expect(page.getByRole('heading',{name:'Entrar al almacén'})).toBeVisible();expect((await page.request.get('/api/state')).status()).toBe(401);expect(errors).toEqual([]);
});

test('inventario filtra, explica búsquedas vacías y abre ficha e historial',async({page},info)=>{
 await login(page);const name=`Casco búsqueda ${info.project.name}`;await seed(page,name,{codigo_barras:'770123'+info.project.name,stock:1});await seed(page,`Bombillo ${info.project.name}`,{categoria:'Luces',marca:'Otra marca',stock:0});
 await navigate(page,'Inventario');
 const search=page.getByRole('searchbox',{name:'Buscar productos',exact:true});await search.fill('770123'+info.project.name);await expect(page.getByRole('button',{name:`Ver ${name}`,exact:true})).toBeVisible();
 await search.fill('esto-no-existe-qa');await expect(page.getByText('No encontramos coincidencias',{exact:true})).toBeVisible();
 await search.fill('busqueda');await page.locator('.filter-panel > summary').click();await page.getByRole('combobox',{name:'Categoría',exact:true}).selectOption('Cascos');await page.getByRole('combobox',{name:'Existencias',exact:true}).selectOption('bajo');await expect(page.getByRole('button',{name:`Ver ${name}`,exact:true})).toBeVisible();
 await noPageOverflow(page);await capture(page,'inventario',info);
 await page.getByRole('button',{name:`Ver ${name}`,exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog).toContainText(name);await dialog.getByText('Historial de movimientos',{exact:true}).click();await expect(dialog).toContainText(/apertura/i);await noPageOverflow(page);
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
});

test('venta conserva datos ante exceso y respuesta perdida; reintento no duplica',async({page},info)=>{
 await login(page);const name=`Casco venta ${info.project.name}`,barcode='880123'+info.project.name;const p=await seed(page,name,{codigo_barras:barcode});await capture(page,'inicio',info);
 await page.getByRole('button',{name:'Nueva venta',exact:true}).click();const dialog=page.getByRole('dialog');
 await expect(dialog.getByRole('button',{name:'Guardar venta',exact:true})).toBeDisabled();
 await dialog.getByRole('searchbox',{name:'Buscar producto',exact:true}).fill(barcode);await dialog.getByRole('searchbox',{name:'Buscar producto',exact:true}).press('Enter');
 await dialog.getByLabel('Cantidad a agregar',{exact:true}).fill('2');await dialog.getByRole('button',{name:'Agregar a la lista',exact:true}).click();
 const quantity=dialog.getByRole('spinbutton',{name:`Cantidad de ${name}`,exact:true});await quantity.fill('4');await expect(quantity).toHaveAttribute('aria-invalid','true');await expect(dialog.locator('.field-error')).toContainText('quedan 3');await dialog.getByRole('button',{name:'Guardar venta',exact:true}).click();await expect(page.getByRole('alert')).toContainText(/intentas usar 4 unidades y quedan 3/);expect((await state(page)).ventas.some(v=>v.detalles.some(d=>d.producto_id===p.id))).toBe(false);
 await quantity.fill('2');await expect(dialog.locator('.operation-total')).toContainText(/90[.,]000/);await noPageOverflow(page);await capture(page,'venta',info);
 let lost=false;await page.route('**/api/change',async route=>{if(!lost){lost=true;await route.fetch();await route.abort('failed')}else await route.continue()});
 await dialog.getByRole('button',{name:'Guardar venta',exact:true}).click();await expect(page.getByRole('button',{name:'Reintentar operación',exact:true})).toBeVisible();await expect(quantity).toHaveValue('2');expect((await state(page)).prods.find(x=>x.id===p.id).stock).toBe(1);
 await page.getByRole('button',{name:'Reintentar operación',exact:true}).click();await expect(dialog).not.toBeVisible();const after=await state(page);expect(after.prods.find(x=>x.id===p.id).stock).toBe(1);expect(after.ventas.filter(v=>v.detalles.some(d=>d.producto_id===p.id))).toHaveLength(1);
});

test('operador ve sus acciones permitidas y puede iniciar venta',async({page},info)=>{
 await login(page);const user='operador_'+info.project.name;const response=await page.request.post('/api/users',{headers:{Origin:origin},data:{username:user,password,role:'operador'}});expect(response.ok()).toBeTruthy();
 await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await login(page,user);
 await ensureMenu(page);await expect(page.getByRole('navigation').getByRole('button',{name:'Compras'})).toHaveCount(0);await expect(page.getByRole('navigation').getByRole('button',{name:'Usuarios'})).toHaveCount(0);
 await navigate(page,'Inventario');await expect(page.getByRole('button',{name:/Nuevo producto/i})).toHaveCount(0);await expect(page.getByRole('button',{name:/Ajustar existencias de/})).toHaveCount(0);
 await navigate(page,'Ventas');await expect(page.getByRole('button',{name:'Anular',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Nueva venta',exact:true}).click();await expect(page.getByRole('searchbox',{name:'Buscar producto',exact:true})).toBeVisible();await noPageOverflow(page);
});

test('taller registra repuesto y avanza hasta entrega conservando existencias',async({page},info)=>{
 await login(page);const name=`Repuesto taller ${info.project.name}`;const p=await seed(page,name);await navigate(page,'Taller');await page.getByRole('button',{name:'Nuevo servicio',exact:true}).click();const dialog=page.getByRole('dialog');const plate=info.project.name==='movil'?'MOV12A':'ESC12A';
 await dialog.getByLabel('Placa *',{exact:true}).fill(plate);await dialog.getByLabel('Descripción del Trabajo *',{exact:true}).fill('Instalación de accesorio de prueba');await dialog.getByLabel('Costo Mano de Obra ($)',{exact:true}).fill('20000');
 await dialog.getByRole('searchbox',{name:'Buscar repuesto',exact:true}).fill(name);await dialog.getByRole('button').filter({has:page.getByText(name,{exact:true})}).click();await dialog.getByRole('button',{name:'Agregar a la lista',exact:true}).click();await dialog.getByRole('button',{name:'Guardar servicio',exact:true}).click();await expect(dialog).not.toBeVisible();
 const card=page.locator('.service-card').filter({hasText:plate});await expect(card).toBeVisible();page.on('dialog',d=>d.accept());
 for(const next of ['En Proceso','Completado','Entregado']){await card.getByRole('button',{name:`Pasar a ${next}`,exact:true}).click();await expect(card).toContainText(next)}
 const after=await state(page);expect(after.prods.find(x=>x.id===p.id).stock).toBe(2);const service=after.servs.find(s=>s.placa===plate);expect(service.estado).toBe('entregado');expect(service.fecha_entrega).toMatch(/^\d{4}-\d{2}-\d{2}$/);await noPageOverflow(page);
});

test('teclado mantiene foco dentro de la ventana y Escape lo devuelve',async({page})=>{
 await login(page);const open=page.getByRole('button',{name:'Nueva venta',exact:true});await open.click();const dialog=page.getByRole('dialog');const close=dialog.getByRole('button',{name:'Cerrar ventana',exact:true});await expect(close).toBeFocused();
 await page.keyboard.press('Shift+Tab');await expect(dialog.getByRole('button',{name:'Cancelar',exact:true})).toBeFocused();await page.keyboard.press('Tab');await expect(close).toBeFocused();await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(open).toBeFocused();
});

test('cambio de contraseña explica errores y exige volver a entrar',async({page},info)=>{
 await login(page);const user='clave_'+info.project.name,newPassword='SCORTA-QA-Nueva-Clave-12345';const response=await page.request.post('/api/users',{headers:{Origin:origin},data:{username:user,password,role:'operador'}});expect(response.ok()).toBeTruthy();await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await login(page,user);
 await page.getByRole('button',{name:'Cambiar contraseña',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Cambiar contraseña',exact:true});await expect(dialog.getByLabel('Contraseña actual',{exact:true})).toBeFocused();await dialog.getByLabel('Contraseña actual',{exact:true}).fill(password);await dialog.getByLabel('Nueva contraseña',{exact:true}).fill(newPassword);await dialog.getByLabel('Confirmar nueva contraseña',{exact:true}).fill('No-Coincide-Con-Nueva12345');await dialog.getByRole('button',{name:'Guardar contraseña',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('no coinciden');await dialog.getByLabel('Confirmar nueva contraseña',{exact:true}).fill(newPassword);await dialog.getByRole('button',{name:'Guardar contraseña',exact:true}).click();await expect(page.getByRole('heading',{name:'Entrar al almacén'})).toBeVisible();await expect(page.getByRole('status')).toContainText('Contraseña actualizada');
 await page.getByLabel('Usuario',{exact:true}).fill(user);await page.getByLabel('Contraseña',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Usuario o contraseña incorrectos');await page.getByLabel('Contraseña',{exact:true}).fill(newPassword);await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.getByRole('button',{name:'Cerrar sesión',exact:true})).toBeVisible();
});

test('venta de tres productos suma cantidades editadas sin concatenarlas',async({page},info)=>{
 await login(page);const products=[];
 for(const [name,price] of [['Casco',10000],['Visor',20000],['Guantes',30000]])products.push(await seed(page,`${name} múltiple ${info.project.name}`,{stock:10,precio_venta:price}));
 await page.getByRole('button',{name:'Nueva venta',exact:true}).click();const dialog=page.getByRole('dialog');
 const add=async(product,quantity)=>{const search=dialog.getByRole('searchbox',{name:'Buscar producto',exact:true});await search.fill(product.nombre);await search.press('Enter');await dialog.getByLabel('Cantidad a agregar',{exact:true}).fill(String(quantity));await dialog.getByRole('button',{name:'Agregar a la lista',exact:true}).click()};
 await add(products[0],1);await dialog.getByRole('spinbutton',{name:`Cantidad de ${products[0].nombre}`,exact:true}).fill('2');await add(products[0],1);await expect(dialog.getByRole('spinbutton',{name:`Cantidad de ${products[0].nombre}`,exact:true})).toHaveValue('3');
 await add(products[1],2);await add(products[2],1);await expect(dialog.locator('.item-line')).toHaveCount(3);await expect(dialog.locator('.operation-total')).toContainText(/100[.,]000/);await noPageOverflow(page);await capture(page,'venta-multiple',info);
 await dialog.getByRole('button',{name:'Guardar venta',exact:true}).click();await expect(dialog).not.toBeVisible();const after=await state(page),sale=after.ventas.find(v=>v.detalles.some(d=>d.producto_id===products[0].id));expect(sale.total).toBe(100000);expect(sale.detalles).toHaveLength(3);for(const [index,stock] of [7,8,9].entries())expect(after.prods.find(p=>p.id===products[index].id).stock).toBe(stock);
});

for(const expiry of ['focus','retry'])test(`sesión expirada por ${expiry} conserva operación incierta sin duplicar`,async({page},info)=>{
 await login(page);const name=`Casco sesión ${expiry} ${info.project.name}`;const product=await seed(page,name);await page.getByRole('button',{name:'Nueva venta',exact:true}).click();let dialog=page.getByRole('dialog');const search=dialog.getByRole('searchbox',{name:'Buscar producto',exact:true});await search.fill(name);await search.press('Enter');await dialog.getByLabel('Cantidad a agregar',{exact:true}).fill('2');await dialog.getByRole('button',{name:'Agregar a la lista',exact:true}).click();
 let lost=false;await page.route('**/api/change',async route=>{if(!lost){lost=true;await route.fetch();await route.abort('failed')}else await route.continue()});await dialog.getByRole('button',{name:'Guardar venta',exact:true}).click();await expect(page.getByRole('button',{name:'Reintentar operación',exact:true})).toBeVisible();expect((await state(page)).prods.find(p=>p.id===product.id).stock).toBe(1);
 const loggedOut=await page.request.post('/api/logout',{headers:{Origin:origin},data:{}});expect(loggedOut.ok()).toBeTruthy();if(expiry==='focus')await page.evaluate(()=>window.dispatchEvent(new Event('focus')));else await page.getByRole('button',{name:'Reintentar operación',exact:true}).click();await expect(page.getByRole('heading',{name:'Entrar al almacén'})).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByLabel('Usuario',{exact:true})).toHaveValue('admin');await expect(page.getByLabel('Usuario',{exact:true})).not.toBeEditable();
 await page.getByLabel('Contraseña',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar',exact:true}).click();dialog=page.getByRole('dialog');await expect(dialog.getByRole('spinbutton',{name:`Cantidad de ${name}`,exact:true})).toHaveValue('2');await page.getByRole('button',{name:'Reintentar operación',exact:true}).click();await expect(dialog).not.toBeVisible();const after=await state(page);expect(after.prods.find(p=>p.id===product.id).stock).toBe(1);expect(after.ventas.filter(v=>v.detalles.some(d=>d.producto_id===product.id))).toHaveLength(1);
});
