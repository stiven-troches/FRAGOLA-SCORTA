import {test,expect} from '@playwright/test';

async function selectRole(page,name){const button=page.getByRole('region',{name:'Demostración de SCORTA'}).getByRole('button',{name,exact:true});await button.click();await expect(button).toBeEnabled();await expect(page.getByRole('heading',{name:({Propietario:'Empresas',Administrador:'RESUMEN GENERAL',Vendedor:'Nueva venta'})[name],exact:true})).toBeVisible();if(name!=='Propietario')await expect(page.getByText('Recuperando venta pendiente…',{exact:true})).toHaveCount(0)}
async function navigate(page,name){
 const mobile=page.getByRole('navigation',{name:'Navegación móvil'});
 if(await mobile.isVisible()){
  const direct={'Nueva venta':'Venta',Inventario:'Inventario',Taller:'Taller'}[name];
  if(direct)await mobile.getByRole('button',{name:direct==='Venta'?/^Venta(?: \d+)?$/:direct,exact:true}).click();else{await mobile.getByRole('button',{name:'Más',exact:true}).click();await page.getByRole('dialog',{name:'Más opciones'}).getByRole('button',{name,exact:true}).click()}
 }else await page.getByRole('navigation',{name:'Módulos de la empresa'}).getByRole('button',{name:name==='Nueva venta'?/^Nueva venta(?: \d+)?$/:name,exact:true}).click();
}
async function demoData(page){await expect(page.getByRole('button',{name:'Propietario',exact:true})).toBeEnabled();return page.evaluate(async()=>{const session=await(await fetch('/api/v2/session')).json();const r=await fetch('/api/v2/data',{headers:{'X-SCORTA-Company':session.session.companyId||'@owner'}});if(!r.ok)throw Error('No se pudo leer la demo');return r.json()})}

test.beforeEach(async({page})=>{
 await page.goto('/');await expect(page.getByText('Demo con datos ficticios',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Propietario',exact:true})).toBeEnabled();
});
test.afterEach(async({page})=>{const r=await page.request.get('/__qa/network');expect((await r.json()).unexpectedApi).toEqual([])});

test('demo actual distingue propietario, administrador y vendedor sin usar API HTTP',async({page})=>{
 await selectRole(page,'Propietario');await expect(page.getByRole('heading',{name:'Empresas',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Crear nueva empresa',exact:true})).toBeVisible();
 await selectRole(page,'Administrador');await navigate(page,'Inventario');await expect(page.getByRole('button',{name:'Nuevo producto',exact:true})).toBeVisible();
 await selectRole(page,'Vendedor');await navigate(page,'Inventario');await expect(page.getByRole('button',{name:'Nuevo producto',exact:true})).toHaveCount(0);
 const data=await demoData(page);expect(data.session.role).toBe('vendedor');expect(data.state.prods.length).toBeGreaterThan(0);
});

test('demo recupera la venta guardada tras recargar, muestra cantidad correcta y cobra una vez',async({page})=>{
 await selectRole(page,'Vendedor');const before=await demoData(page),product=before.state.prods.find(p=>p.stock>=4);
 await navigate(page,'Inventario');await page.getByRole('searchbox',{name:'Buscar productos',exact:true}).fill(product.referencia||product.nombre);await page.getByRole('button',{name:'Agregar al carrito',exact:true}).first().click();await navigate(page,'Nueva venta');
 const quantity=page.getByRole('spinbutton',{name:'Cantidad de '+product.nombre,exact:true});await quantity.fill('2');await page.getByRole('button',{name:'Agregar una unidad de '+product.nombre,exact:true}).click();await expect(quantity).toHaveValue('3');
 await expect(page.getByText('Guardado',{exact:true}).first()).toBeVisible();await page.reload();await expect(page.getByRole('spinbutton',{name:'Cantidad de '+product.nombre,exact:true})).toHaveValue('3');
 await page.getByRole('button',{name:'Registrar venta',exact:true}).click();await expect(page.getByRole('dialog',{name:'Detalle de venta'})).toBeVisible();
 const after=await demoData(page);expect(after.state.ventas).toHaveLength(before.state.ventas.length+1);expect(after.state.prods.find(p=>p.id===product.id).stock).toBe(product.stock-3);
 await page.reload();const repeated=await demoData(page);expect(repeated.state.ventas).toHaveLength(after.state.ventas.length);
});

test('demo móvil dispone de navegación inferior y contenido sin desbordamiento',async({page},info)=>{
 await selectRole(page,'Vendedor');await navigate(page,'Inventario');expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(()=>innerWidth)+1);
 if(info.project.name.startsWith('movil')){const nav=page.getByRole('navigation',{name:'Navegación móvil'});await expect(nav).toBeVisible();await expect(nav.getByRole('button')).toHaveCount(4);await expect(page.getByRole('navigation',{name:'Módulos de la empresa'})).not.toBeVisible();}
});
