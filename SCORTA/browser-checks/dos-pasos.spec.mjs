// QA PUNTO 10(b): verificación en dos pasos (TOTP) del propietario de punta a punta, en escritorio y celular.
// Activar desde «Mi perfil», entrar con contraseña + código, rechazo de código incorrecto o repetido y
// desactivar. El código se calcula con totp.mjs a partir de la clave que muestra la pantalla.
// La cuenta del propietario es compartida por toda la suite: la prueba SIEMPRE la deja sin 2FA (finally).
import {test,expect,OWNER,ORIGIN,profile,totpSource,request,logout} from './fixtures.mjs';

async function typeLogin(page,{totp}={}){
 await page.getByLabel('Empresa',{exact:true}).fill(OWNER.company);await page.getByLabel('Usuario',{exact:true}).fill(OWNER.username);
 await page.getByLabel('Contraseña',{exact:true}).fill(OWNER.password);
 if(totp!=null)await page.getByLabel('Código de verificación',{exact:true}).fill(totp);
 await page.waitForTimeout(1100); // límite de intentos de acceso (ver fixtures.mjs)
 await page.getByRole('button',{name:'Ingresar',exact:true}).click();
}

test('propietario: activa 2FA, entra con código, rechaza códigos malos o repetidos y la desactiva',async({page,playwright})=>{
 test.setTimeout(120000);
 let secret='',next=null;
 try{
  // 1) Ingreso normal y activación desde «Mi perfil».
  await page.goto('/');await expect(page.getByLabel('Empresa',{exact:true})).toBeVisible();
  await typeLogin(page);
  await expect(page.getByRole('heading',{name:'Empresas',exact:true})).toBeVisible();
  await profile(page);
  const dialog=page.getByRole('dialog',{name:'Mi perfil'});
  await expect(dialog.getByText(/^Inactiva:/)).toBeVisible();
  await dialog.getByRole('button',{name:'Activar verificación en dos pasos',exact:true}).click();
  await expect(dialog.getByText('Clave para escribir a mano',{exact:true})).toBeVisible();
  secret=(await dialog.locator('.sp-twofa-secret code').innerText()).replace(/\s/g,'');
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  await expect(dialog.locator('.sp-twofa-qr svg, .sp-twofa-qr img').first()).toBeVisible();
  next=totpSource(secret);
  // Un código incorrecto no activa nada; el botón solo se habilita con 6 dígitos.
  const code=dialog.getByLabel('Código de verificación',{exact:true});
  await code.fill('12345');await expect(dialog.getByRole('button',{name:'Confirmar y activar',exact:true})).toBeDisabled();
  await code.fill('000000');await dialog.getByRole('button',{name:'Confirmar y activar',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('El código de verificación no es correcto');
  await expect(dialog.getByText(/^Inactiva:/)).toBeVisible();
  // Con el código bueno queda activa.
  await code.fill((await next()).code);await dialog.getByRole('button',{name:'Confirmar y activar',exact:true}).click();
  await expect(dialog.getByText('Verificación en dos pasos activada.',{exact:false})).toBeVisible();
  await expect(dialog.getByText(/^Activa:/)).toBeVisible();
  await dialog.getByRole('button',{name:'Cerrar ventana',exact:true}).click();
  await logout(page);
  // 2) Ahora el ingreso pide el código: sin él no entra, con uno malo tampoco.
  await typeLogin(page);
  await expect(page.getByRole('alert')).toContainText('Ingresa el código de verificación');
  const field=page.getByLabel('Código de verificación',{exact:true});await expect(field).toBeVisible();
  await expect(page.getByRole('heading',{name:'Empresas',exact:true})).toHaveCount(0);
  await field.fill('000000');await page.waitForTimeout(1100);await page.getByRole('button',{name:'Ingresar',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('no es correcto o ya fue usado');
  await expect(page.getByRole('heading',{name:'Empresas',exact:true})).toHaveCount(0);
  // 3) Con el código vigente entra.
  const login=await next();
  await field.fill(login.code);await page.waitForTimeout(1100);await page.getByRole('button',{name:'Ingresar',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Empresas',exact:true})).toBeVisible();
  // El mismo código no sirve otra vez (sin reutilización): una segunda sesión con el código ya usado es rechazada.
  const replay=await playwright.request.newContext({baseURL:ORIGIN});
  try{
   await page.waitForTimeout(1100);
   const response=await replay.post('/api/v2/login',{headers:{Origin:ORIGIN},data:{...OWNER,totp:login.code}});
   expect(response.status()).toBe(401);expect((await response.json()).code).toBe('TOTP_INVALID');
  }finally{await replay.dispose()}
  // 4) Desactivar pide contraseña y un código nuevo (no el que ya se usó).
  await profile(page);
  const settings=page.getByRole('dialog',{name:'Mi perfil'});
  await expect(settings.getByText(/^Activa:/)).toBeVisible();
  await settings.getByRole('button',{name:'Desactivar verificación en dos pasos',exact:true}).click();
  await settings.getByLabel('Contraseña',{exact:true}).fill('contraseña equivocada');
  await settings.getByLabel('Código de verificación',{exact:true}).fill((await next()).code);
  await settings.getByRole('button',{name:'Desactivar',exact:true}).click();
  await expect(settings.getByRole('alert')).toBeVisible();
  await expect(settings.getByText(/^Activa:/)).toBeVisible();
  await settings.getByLabel('Contraseña',{exact:true}).fill(OWNER.password);
  await settings.getByLabel('Código de verificación',{exact:true}).fill((await next()).code);
  await settings.getByRole('button',{name:'Desactivar',exact:true}).click();
  await expect(settings.getByText('Verificación en dos pasos desactivada.',{exact:false})).toBeVisible();
  await expect(settings.getByText(/^Inactiva:/)).toBeVisible();
  secret='';
 }finally{
  // Pase lo que pase, la cuenta compartida del propietario queda sin 2FA para el resto de la suite.
  if(secret){
   const api=await playwright.request.newContext({baseURL:ORIGIN});
   try{
    const code=await next();
    const session=await api.post('/api/v2/login',{headers:{Origin:ORIGIN},data:{...OWNER,totp:code.code}});
    if(session.ok()){
     const data=await request(api,'/api/v2/data');
     await request(api,'/api/v2/action',{method:'POST',body:{type:'twofa.disable',revision:data.revision,requestId:crypto.randomUUID(),form:{password:OWNER.password,code:(await next()).code}}});
    }
   }catch(error){console.error('No se pudo desactivar el 2FA del propietario:',error.message)}
   finally{await api.dispose()}
  }
 }
 // Comprobación final: otra vez se entra solo con contraseña.
 const check=await playwright.request.newContext({baseURL:ORIGIN});
 try{await request(check,'/api/v2/login',{method:'POST',body:OWNER})}finally{await check.dispose()}
});
