import {test,expect,login,navigate,noOverflow} from './fixtures.mjs';

async function editProduct(page,scenario){
 const data=await scenario.data();await scenario.act({type:'terms.accept',form:{version:data.session.termsVersion}});
 await login(page,scenario.admin);await navigate(page,'Inventario');await page.getByRole('button',{name:'Tabla',exact:true}).click();
 await page.locator('.cw-product-link').filter({hasText:scenario.product.nombre}).click();
 await page.getByRole('button',{name:'Editar producto',exact:true}).click();
 await page.getByText('Referencia, clasificación, costo y foto',{exact:true}).click();
 return page.getByRole('dialog',{name:'Producto',exact:true});
}
// BE-30: la foto se guarda fuera de la base; el estado trae la URL /media/... y se compara el contenido servido.
const mediaBase64=(page,url)=>page.evaluate(async url=>{const r=await fetch(url);if(!r.ok)throw Error('media '+r.status);const b=new Uint8Array(await r.arrayBuffer());let s='';for(const x of b)s+=String.fromCharCode(x);return btoa(s);},url);
async function fakeCamera(page,{deferred=false}={}){
 await page.addInitScript(({deferred})=>{
  window.photoTracks=[];
  navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{
   const deliver=()=>{
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
    const ctx=canvas.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,640,480);
    const stream=canvas.captureStream(5);window.photoTracks.push(...stream.getTracks());resolve(stream);
   };
   if(deferred)window.deliverPhotoCamera=deliver;else deliver();
  });
 },{deferred});
}

test('foto de producto: cámara, repetir, guardar y cargar archivo',async({page,scenario})=>{
 await fakeCamera(page);const dialog=await editProduct(page,scenario);
 await expect(dialog.getByRole('button',{name:'Cargar foto',exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'Tomar foto',exact:true}).click();
 await expect(dialog.getByRole('button',{name:'Guardar producto',exact:true})).toBeDisabled();
 await expect.poll(()=>page.locator('video[aria-label="Cámara para foto del producto"]').evaluate(v=>v.videoWidth)).toBeGreaterThan(0);
 await dialog.getByRole('button',{name:'Capturar foto',exact:true}).click();
 await expect(dialog.getByAltText('Vista previa de la foto tomada')).toBeVisible();
 expect(await page.evaluate(()=>window.photoTracks.every(t=>t.readyState==='ended'))).toBe(true);
 await dialog.getByRole('button',{name:'Repetir foto',exact:true}).click();
 await expect(dialog.getByRole('button',{name:'Capturar foto',exact:true})).toBeEnabled();
 await dialog.getByRole('button',{name:'Cancelar cámara',exact:true}).click();
 expect(await page.evaluate(()=>window.photoTracks.every(t=>t.readyState==='ended'))).toBe(true);
 await dialog.getByRole('button',{name:'Tomar foto',exact:true}).click();
 await expect.poll(()=>dialog.locator('video').evaluate(v=>v.videoWidth)).toBeGreaterThan(0);
 await dialog.getByRole('button',{name:'Capturar foto',exact:true}).click();
 await dialog.getByRole('button',{name:'Usar foto',exact:true}).click();
 await expect(dialog.getByAltText('Vista previa del producto')).toBeVisible();await noOverflow(page);
 const cameraPhoto=await dialog.getByAltText('Vista previa del producto').getAttribute('src');
 expect(cameraPhoto.length).toBeLessThan(666000);
 await dialog.getByRole('button',{name:'Guardar producto',exact:true}).click();
 await expect(dialog).not.toBeVisible();
 const savedPhoto=(await scenario.data()).state.prods.find(p=>p.id===scenario.product.id).foto;
 expect(savedPhoto).toMatch(/^\/media\/[\w-]+\/[0-9a-f]{64}\.(jpg|png|webp)$/);
 expect(await mediaBase64(page,savedPhoto)).toBe(cameraPhoto.split(',')[1]);
 // El selector de archivos sigue disponible y permite elegir el mismo archivo otra vez.
 await page.locator('.cw-product-link').filter({hasText:scenario.product.nombre}).click();
 await page.getByRole('button',{name:'Editar producto',exact:true}).click();
 await page.getByText('Referencia, clasificación, costo y foto',{exact:true}).click();
 const bytes=await page.evaluate(()=>{
  const c=document.createElement('canvas');c.width=2200;c.height=1800;
  c.getContext('2d').fillRect(0,0,c.width,c.height);return c.toDataURL('image/png').split(',')[1];
 });
 for(let i=0;i<2;i++){
  const chooser=page.waitForEvent('filechooser');await dialog.getByRole('button',{name:'Cargar foto',exact:true}).click();
  await (await chooser).setFiles({name:'producto.png',mimeType:'image/png',buffer:Buffer.from(bytes,'base64')});
  await expect(dialog.getByRole('button',{name:'Guardar producto',exact:true})).toBeEnabled();
  await expect(dialog.getByAltText('Vista previa del producto')).not.toHaveAttribute('src',cameraPhoto);
 }
 await dialog.getByRole('button',{name:'Guardar producto',exact:true}).click();await expect(dialog).not.toBeVisible();
 const filePhoto=(await scenario.data()).state.prods.find(p=>p.id===scenario.product.id).foto;
 expect(filePhoto).toMatch(/^\/media\//);expect(filePhoto).not.toBe(savedPhoto);
 expect((await mediaBase64(page,filePhoto)).length).toBeLessThan(666000);
});

test('cámara denegada ofrece cargar foto y permite guardar sin cambiarla',async({page,scenario})=>{
 await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('denied','NotAllowedError')}});
 const dialog=await editProduct(page,scenario);await dialog.getByRole('button',{name:'Tomar foto',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('Permite el acceso');
 await expect(dialog.getByRole('button',{name:'Cargar foto',exact:true})).toBeEnabled();
 await expect(dialog.getByRole('button',{name:'Guardar producto',exact:true})).toBeEnabled();
});

test('cerrar formulario con permiso de cámara pendiente apaga la cámara al concederlo',async({page,scenario})=>{
 await fakeCamera(page,{deferred:true});const dialog=await editProduct(page,scenario);
 await dialog.getByRole('button',{name:'Tomar foto',exact:true}).click();
 await expect(dialog.getByText('Abriendo la cámara…')).toBeVisible();
 await dialog.getByRole('button',{name:'Cerrar ventana',exact:true}).click();await expect(dialog).not.toBeVisible();
 await page.evaluate(()=>window.deliverPhotoCamera());
 await expect.poll(()=>page.evaluate(()=>window.photoTracks.length===1&&window.photoTracks.every(t=>t.readyState==='ended'))).toBe(true);
});
