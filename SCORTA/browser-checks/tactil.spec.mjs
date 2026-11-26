// FE-01: en celular (≤ 760 px) los controles principales miden al menos 44 px de alto y los
// campos usan 16 px o más para que iOS no haga zoom (src/touch.css).
import {test,expect,login,addProduct,waitSaved} from './fixtures.mjs';

test.beforeEach(({},info)=>{test.skip(!info.project.name.startsWith('movil'),'Solo aplica a los proyectos de celular')});

// Mide los controles visibles dentro de `scope` y devuelve los que no cumplen.
async function touchFailures(page,scope){
 return page.locator(scope).first().evaluate(root=>{
  const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&!el.closest('[hidden],[aria-hidden="true"]')};
  const name=el=>(el.getAttribute('aria-label')||el.labels?.[0]?.textContent||el.textContent||el.getAttribute('placeholder')||el.name||el.type||el.tagName).trim().replace(/\s+/g,' ').slice(0,60);
  const failures=[],checked=[];
  const controls='button,summary,[role=button],[role=tab],a.cw-btn,a.ow-button,a.sp-primary,a.sp-secondary,input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=hidden]),select,textarea';
  for(const el of root.querySelectorAll(controls)){
   if(!visible(el))continue;
   const r=el.getBoundingClientRect(),s=getComputedStyle(el),label=el.tagName.toLowerCase()+' «'+name(el)+'»';checked.push(label);
   if(el.tagName!=='TEXTAREA'&&r.height<43.5)failures.push(label+': alto '+r.height.toFixed(1)+' px');
   if(['INPUT','SELECT','TEXTAREA'].includes(el.tagName)&&parseFloat(s.fontSize)<16)failures.push(label+': letra '+s.fontSize);
  }
  return {failures,checked:checked.length};
 });
}

test('FE-01: ingreso con controles táctiles de 44 px y campos de 16 px',async({page})=>{
 await page.goto('/');await expect(page.getByLabel('Empresa',{exact:true})).toBeVisible();
 const result=await touchFailures(page,'body');
 expect(result.checked).toBeGreaterThanOrEqual(4);expect(result.failures).toEqual([]);
 for(const label of ['Empresa','Usuario','Contraseña']){
  const box=await page.getByLabel(label,{exact:true}).boundingBox();expect(box.height,label).toBeGreaterThanOrEqual(43.5);
 }
 expect((await page.getByRole('button',{name:'Ingresar',exact:true}).boundingBox()).height).toBeGreaterThanOrEqual(43.5);
});

test('FE-01: Nueva venta y carrito con controles táctiles de 44 px y campos de 16 px',async({page,scenario})=>{
 await login(page,scenario.seller);
 const empty=await touchFailures(page,'main');expect(empty.failures).toEqual([]);
 await addProduct(page,scenario.product);await waitSaved(page);
 const name=scenario.product.nombre;
 for(const control of [page.getByRole('button',{name:'Restar una unidad de '+name,exact:true}),page.getByRole('spinbutton',{name:'Cantidad de '+name,exact:true}),page.getByRole('button',{name:'Agregar una unidad de '+name,exact:true}),page.getByRole('button',{name:'Retirar '+name,exact:true}),page.getByRole('button',{name:'Registrar venta',exact:true}),page.getByLabel('Medio de pago',{exact:true})]){
  await control.scrollIntoViewIfNeeded();const box=await control.boundingBox();expect(box.height).toBeGreaterThanOrEqual(43.5);
 }
 const cart=await touchFailures(page,'main');
 expect(cart.checked).toBeGreaterThan(empty.checked);expect(cart.failures).toEqual([]);
 const bottom=page.getByRole('navigation',{name:'Navegación móvil'});
 if(await bottom.isVisible()){const nav=await touchFailures(page,'nav[aria-label="Navegación móvil"]');expect(nav.failures).toEqual([])}
});
