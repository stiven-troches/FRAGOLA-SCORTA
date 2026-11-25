// FE-22: la demo pública muestra sus propios términos y nunca llama a la API real /api/v2:
// todo vive en IndexedDB del navegador.
import {test,expect} from '@playwright/test';

const banner=page=>page.getByRole('region',{name:'Demostración de SCORTA'});
async function selectRole(page,name,heading){
 const button=banner(page).getByRole('button',{name,exact:true});await button.click();await expect(button).toBeEnabled();
 await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();
}

test.beforeEach(async({page})=>{
 await page.goto('/');await expect(page.getByText('Demo con datos ficticios',{exact:true})).toBeVisible();
 await expect(banner(page).getByRole('button',{name:'Propietario',exact:true})).toBeEnabled();
});

test('FE-22: la demo abre sus propios términos y no los del servicio real',async({page})=>{
 await banner(page).getByRole('button',{name:'Términos de la demo',exact:true}).click();
 const terms=page.getByRole('dialog',{name:'Términos de la demo'});await expect(terms).toBeVisible();
 for(const text of ['Esta demo sirve solo para conocer SCORTA','datos ficticios','La demo no es una oferta ni un contrato','Reiniciar demo'])await expect(terms).toContainText(text);
 // No es el borrador legal del servicio real (política de privacidad / términos del servicio).
 await expect(terms).not.toContainText('Borrador pendiente de revisión jurídica');
 await expect(page.getByRole('dialog',{name:/Términos y condiciones|Política de privacidad/})).toHaveCount(0);
 await terms.getByRole('button',{name:'Entendido',exact:true}).click();await expect(terms).toHaveCount(0);
});

test('FE-22: recorrido completo sin peticiones de red a /api/v2; los datos quedan en IndexedDB',async({page})=>{
 const network=[];
 page.on('request',req=>{const url=new URL(req.url());if(url.pathname.startsWith('/api/'))network.push(req.method()+' '+url.pathname)});
 await selectRole(page,'Propietario','Empresas');
 await selectRole(page,'Administrador','RESUMEN GENERAL');
 await selectRole(page,'Vendedor','Nueva venta');
 await expect(page.getByText('Recuperando venta pendiente…',{exact:true})).toHaveCount(0);
 // La app sí usa fetch('/api/v2/...'), pero la demo lo atiende en el navegador.
 const data=await page.evaluate(async()=>{const s=await(await fetch('/api/v2/session')).json();const r=await fetch('/api/v2/data',{headers:{'X-SCORTA-Company':s.session.companyId||'@owner'}});return {ok:r.ok,role:s.session.role,prods:(await r.json()).state.prods.length}});
 expect(data).toEqual({ok:true,role:'vendedor',prods:expect.any(Number)});expect(data.prods).toBeGreaterThan(0);
 const databases=await page.evaluate(async()=>(await indexedDB.databases()).map(db=>db.name));
 expect(databases.length).toBeGreaterThan(0);
 await page.reload();await expect(banner(page).getByRole('button',{name:'Propietario',exact:true})).toBeEnabled();
 expect(network).toEqual([]);
 const server=await(await page.request.get('/__qa/network')).json();expect(server.unexpectedApi).toEqual([]);
});
