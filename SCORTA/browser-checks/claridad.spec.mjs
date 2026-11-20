import {test,expect} from '@playwright/test';
const origin='http://127.0.0.1:19420';
async function navigate(page,name){const menu=page.locator('.mobile-navigation');if(await menu.locator(':scope > summary').isVisible()&&await menu.getAttribute('open')===null)await menu.locator(':scope > summary').click();await page.getByRole('navigation').getByRole('button',{name,exact:false}).click()}
async function setup(page,suffix){
 await page.goto('/');await page.getByLabel('Usuario',{exact:true}).fill('admin');await page.getByLabel('Contraseña',{exact:true}).fill('SCORTA-QA-Password-12345');await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.locator('.connection-bar')).toContainText('Datos actualizados');
 for(const [name,brand,stock] of [[`Casco claro ${suffix}`,'Marca A',8],[`Casco agotado ${suffix}`,'Marca B',0]]){const state=await(await page.request.get('/api/state')).json();const r=await page.request.post('/api/change',{headers:{Origin:origin},data:{kind:'producto',revision:state.revision,form:{nombre:name,categoria:'Cascos',marca:brand,stock,stock_minimo:3,precio_compra:120000,precio_venta:180000},requestId:crypto.randomUUID()}});expect(r.ok()).toBeTruthy()}
 await navigate(page,'Inventario');await page.getByText('Opciones',{exact:true}).click();await page.getByRole('button',{name:'Actualizar datos',exact:true}).click();await expect(page.getByRole('button',{name:`Ver Casco claro ${suffix}`,exact:true})).toBeVisible();
}
async function noOverflow(page){expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(()=>innerWidth)+1)}
test('filtros resumidos conservan contexto y permiten recuperar todos los productos',async({page},info)=>{
 const suffix=`filtros-${info.project.name}`;await setup(page,suffix);
 const search=page.getByRole('searchbox',{name:'Buscar productos',exact:true});const panel=page.locator('.filter-panel');
 await expect(page.getByRole('combobox')).toHaveCount(0);await expect(page.locator('.data-table thead th')).toHaveCount(4);
 await search.fill(`Casco claro ${suffix}`);await panel.locator('summary').click();
 await page.getByRole('combobox',{name:'Categoría',exact:true}).selectOption('Cascos');await page.getByRole('combobox',{name:'Marca',exact:true}).selectOption('Marca A');await page.getByRole('combobox',{name:'Ordenar por',exact:true}).selectOption('stock');
 await panel.locator('summary').click();await expect(page.getByRole('combobox')).toHaveCount(0);await expect(panel.locator('summary')).toContainText('3');
 await expect(page.getByRole('button',{name:'Quitar Categoría: Cascos',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Quitar Marca: Marca A',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Quitar Marca: Marca A',exact:true}).click();await expect(panel.locator('summary')).toContainText('2');
 await page.getByRole('button',{name:'Restablecer filtros',exact:true}).click();await expect(search).toHaveValue(`Casco claro ${suffix}`);await expect(page.getByLabel('Filtros activos',{exact:true})).toHaveCount(0);
 await search.fill('ningun-producto-con-este-nombre');await expect(page.getByText('No encontramos coincidencias',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Mostrar todos',exact:true}).click();await expect(search).toHaveValue('');await expect(page.getByRole('button',{name:`Ver Casco claro ${suffix}`,exact:true})).toBeVisible();await noOverflow(page);
});
test('listado simple y ficha conservan acciones y navegación accesibles',async({page},info)=>{
 const suffix=`ficha-${info.project.name}`;await setup(page,suffix);
 if(info.project.name==='movil'){await expect(page.getByRole('navigation')).not.toBeVisible();await expect(page.locator('.mobile-navigation > summary')).toContainText('Inventario');await expect(page.getByRole('button',{name:'Cerrar sesión',exact:true})).toBeVisible()}
 await expect(page.getByRole('button',{name:/Ajustar existencias de/})).toHaveCount(0);await expect(page.getByRole('button',{name:/Retirar Casco/})).toHaveCount(0);await expect(page.getByRole('columnheader',{name:'Costo',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:`Ver Casco claro ${suffix}`,exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog).toContainText('Costo de compra');await expect(dialog).toContainText('Mínimo de alerta');await expect(dialog.getByRole('button',{name:'Editar producto',exact:true})).toBeVisible();await expect(dialog.getByRole('button',{name:/Ajustar existencias de/})).toBeVisible();await dialog.getByText('Más acciones',{exact:true}).click();await expect(dialog.getByRole('button',{name:`Retirar Casco claro ${suffix}`,exact:true})).toBeDisabled();await page.keyboard.press('Escape');await expect(dialog).toBeVisible();await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
 await navigate(page,'Taller');await expect(page.getByRole('heading',{name:'Taller',exact:true})).toBeVisible();await noOverflow(page);
});
test('un error de conexión sigue visible sin abrir filtros u opciones',async({page},info)=>{
 await setup(page,`conexion-${info.project.name}`);await page.route('**/api/state',route=>route.abort('failed'));await page.getByText('Opciones',{exact:true}).click();await page.getByRole('button',{name:'Actualizar datos',exact:true}).click();await expect(page.locator('.connection-bar')).toContainText('Sin conexión');await expect(page.locator('.connection-bar')).toBeVisible();await expect(page.locator('.filter-panel')).not.toHaveAttribute('open','');await page.unroute('**/api/state');await page.getByText('Opciones',{exact:true}).click();await page.getByRole('button',{name:'Actualizar datos',exact:true}).click();await expect(page.locator('.connection-bar')).toContainText('Datos actualizados');
});
