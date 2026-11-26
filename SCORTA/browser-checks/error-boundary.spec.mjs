// ErrorBoundary y recuperación de chunks: tras un deploy, un chunk con hash que ya no existe no
// debe dejar la pantalla en blanco. Un reintento automático (reload) y, si persiste, «Algo falló · Recargar».
import {test,expect,OWNER} from './fixtures.mjs';

const CHUNK='**/assets/OwnerWorkspace-*.js';

// El módulo se pide dos veces por carga (modulepreload + import), así que se cuentan las cargas de la página.
const countLoads=page=>{const counter={loads:0};page.on('load',()=>{counter.loads++});return counter};

test('chunk inexistente: recarga una sola vez y luego muestra «Algo falló» con botón Recargar',async({page})=>{
 const counter=countLoads(page);
 await page.route(CHUNK,route=>route.abort());
 await page.goto('/');
 await page.getByLabel('Empresa',{exact:true}).fill(OWNER.company);await page.getByLabel('Usuario',{exact:true}).fill(OWNER.username);await page.getByLabel('Contraseña',{exact:true}).fill(OWNER.password);
 await page.getByRole('button',{name:'Ingresar',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'Algo falló'})).toBeVisible({timeout:15000});
 await expect(page.getByRole('button',{name:'Recargar',exact:true})).toBeVisible();
 expect(await page.locator('body').innerText()).not.toMatch(/dynamically imported|OwnerWorkspace|TypeError/);
 expect(counter.loads,'carga inicial + exactamente un reintento automático').toBe(2);
 // Sin bucle: pasado un momento no hay más peticiones.
 await page.waitForTimeout(1500);expect(counter.loads).toBe(2);
 // Con el chunk disponible otra vez, «Recargar» devuelve la aplicación.
 await page.unroute(CHUNK);
 await page.getByRole('button',{name:'Recargar',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Empresas'}).first()).toBeVisible();
});

test('excepción al evaluar una vista: mensaje claro, sin detalles técnicos y sin bucle de recargas',async({page})=>{
 const counter=countLoads(page);
 await page.route(CHUNK,route=>route.fulfill({status:200,contentType:'text/javascript',body:'throw new Error("secreto-interno-de-prueba");'}));
 await page.goto('/');
 await page.getByLabel('Empresa',{exact:true}).fill(OWNER.company);await page.getByLabel('Usuario',{exact:true}).fill(OWNER.username);await page.getByLabel('Contraseña',{exact:true}).fill(OWNER.password);
 await page.getByRole('button',{name:'Ingresar',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'Algo falló'})).toBeVisible({timeout:15000});
 expect(await page.locator('body').innerText()).not.toContain('secreto-interno-de-prueba');
 // Vite puede tratar la precarga fallida como error de carga y consumir el único reintento; nunca más de uno.
 const loads=counter.loads;expect(loads).toBeLessThanOrEqual(2);
 await page.waitForTimeout(1500);expect(counter.loads).toBe(loads);
});
