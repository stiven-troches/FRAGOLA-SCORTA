import {test,expect,login,navigate,noOverflow} from './fixtures.mjs';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1sAAAAASUVORK5CYII=';
test('negocio configura colores y comparte un catálogo público con carrito para WhatsApp',async({page,scenario})=>{
 await scenario.act({type:'business.change',payload:{kind:'producto',form:{...scenario.product,descripcion:'Aceite para cuidar el motor',foto:png}}});
 await scenario.act({type:'business.change',payload:{kind:'producto',form:{nombre:'Casco QA',categoria:'Accesorios',precio_venta:180000,stock:3}}});
 await scenario.act({type:'business.change',payload:{kind:'producto',form:{nombre:'Producto agotado',categoria:'Frenos',precio_venta:100,stock:0}}});
 await login(page,scenario.admin);await navigate(page,'Inventario');await page.getByRole('button',{name:'Mi catálogo',exact:true}).click();
 const settings=page.getByRole('dialog',{name:'Mi catálogo',exact:true});await expect(settings).toBeVisible();
 await settings.getByLabel('Publicar catálogo').check();await settings.getByLabel('Color principal',{exact:true}).fill('#123456');await settings.getByLabel('Color secundario',{exact:true}).fill('#eeeeff');
 await settings.getByLabel('Título de la tienda',{exact:true}).fill('Todo para tu moto');
 await settings.getByRole('button',{name:'Guardar catálogo',exact:true}).click();await expect(settings).not.toBeVisible();
 // La petición pública no lleva sesión y nunca expone costos ni existencias.
 const api=await page.request.get('/api/v2/catalog/'+scenario.company.slug),body=await api.json();expect(api.ok()).toBeTruthy();
 expect(body.products).toHaveLength(2);expect(body.products[0]).not.toHaveProperty('stock');expect(body.products[0]).not.toHaveProperty('precio_compra');
 const image=await page.request.get(body.products.find(p=>p.foto).foto);expect(image.ok()).toBeTruthy();expect(image.headers()['content-type']).toBe('image/png');
 await page.context().clearCookies();await page.goto('/catalogo/'+scenario.company.slug);
 await expect(page.getByRole('heading',{name:'Todo para tu moto',exact:true})).toBeVisible();
 await expect(page.getByText('Tecnología de Fragola',{exact:true})).toBeVisible();await expect(page.getByLabel('Empresa',{exact:true})).toHaveCount(0);
 await expect(page.getByText('Producto agotado',{exact:true})).toHaveCount(0);
 await page.getByRole('navigation',{name:'Categorías'}).getByRole('button',{name:'Accesorios',exact:true}).click();await expect(page.locator('.shop-card')).toHaveCount(1);
 await page.getByRole('searchbox',{name:'Buscar productos'}).fill('inexistente');await expect(page.getByRole('heading',{name:'No encontramos productos'})).toBeVisible();
 await page.getByRole('button',{name:'Ver todos los productos',exact:true}).click();await expect(page.locator('.shop-card')).toHaveCount(2);
 await page.getByRole('button',{name:'Ver '+scenario.product.nombre,exact:true}).click();await expect(page.getByText('Aceite para cuidar el motor',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Agregar al carrito',exact:true}).click();await page.getByRole('button',{name:'Ver carrito · 1',exact:true}).click();
 await page.getByRole('spinbutton',{name:'Cantidad de '+scenario.product.nombre,exact:true}).fill('2');
 await page.getByRole('button',{name:'Seguir explorando',exact:true}).click();await page.reload();
 await expect(page.getByRole('button',{name:'Carrito · 2',exact:true})).toBeVisible();await noOverflow(page);
 await page.screenshot({path:test.info().outputPath('catalogo.png'),fullPage:true});
 await page.getByRole('button',{name:'Carrito · 2',exact:true}).click();
 await page.route('https://wa.me/**',route=>route.fulfill({contentType:'text/html',body:'Pedido preparado, no enviado.'}));
 await page.getByRole('button',{name:'Comprar por WhatsApp',exact:true}).click();await page.waitForURL('https://wa.me/**');
 expect(page.url()).toContain('573001234567');expect(decodeURIComponent(page.url())).toContain('2 × '+scenario.product.nombre);
});

test('un cambio de existencias invalida el carrito sin registrar ventas',async({page,scenario})=>{
 await scenario.act({type:'catalog.update',form:{enabled:true}});await page.goto('/catalogo/'+scenario.company.slug);
 await page.getByRole('button',{name:'Agregar '+scenario.product.nombre,exact:true}).click();await page.getByRole('button',{name:'Carrito · 1',exact:true}).click();
 await scenario.act({type:'business.change',payload:{kind:'ajuste',id:scenario.product.id,form:{stock:0,motivo:'Agotado después de agregar al carrito'}}});
 await page.getByRole('button',{name:'Comprar por WhatsApp',exact:true}).click();await expect(page.getByText('Tu carrito está vacío. Explora el catálogo y agrega tus favoritos.',{exact:true})).toBeVisible();
 expect((await scenario.data()).state.ventas).toHaveLength(0);await page.getByRole('button',{name:'Seguir explorando',exact:true}).click();
 await scenario.act({type:'catalog.update',form:{enabled:false}});await page.reload();await expect(page.getByRole('heading',{name:'Catálogo no disponible',exact:true})).toBeVisible();
});
