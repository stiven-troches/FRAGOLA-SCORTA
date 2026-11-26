// QA PUNTO 10(b): verificación del correo y recuperación de contraseña de punta a punta, en escritorio y celular.
// serve.mjs apunta el webhook de correo de la aplicación a un buzón local: la prueba lee los correos
// reales que genera el servidor (código de 6 dígitos y enlace /recuperar#token), sin salir a internet.
import {test,expect,login,profile,mails,clearMails,ORIGIN,logout} from './fixtures.mjs';

const NEW_PASSWORD='QA.Nueva!2027';
const lastMail=async(request,to,subject)=>{
 let found;
 await expect.poll(async()=>{found=(await mails(request)).filter(m=>m.to===to&&(!subject||subject.test(m.subject))).at(-1);return !!found},{timeout:15000,message:'llegó el correo a '+to}).toBe(true);
 return found;
};

test('verifica el correo con el código y recupera la contraseña con el enlace de un solo uso',async({page,scenario,request})=>{
 test.setTimeout(90000);
 const email=`admin-${scenario.suffix}@example.com`;
 await clearMails(request);
 // 1) El administrador registra su correo y lo verifica con el código que llega por correo.
 await login(page,scenario.admin);await profile(page);
 const dialog=page.getByRole('dialog',{name:'Mi perfil'});
 await dialog.getByRole('button',{name:/^(Registrar|Cambiar) correo$/}).click();
 await dialog.getByLabel('Correo',{exact:true}).fill(email);await dialog.getByLabel('Contraseña actual',{exact:true}).fill(scenario.admin.password);
 await dialog.getByRole('button',{name:'Guardar correo',exact:true}).click();
 await expect(dialog.getByText(/Sin verificar|Escribe el código que enviamos/).first()).toBeVisible();
 if(!(await dialog.getByLabel('Código de verificación',{exact:true}).isVisible()))await dialog.getByRole('button',{name:'Enviar código de verificación',exact:true}).click();
 const verification=await lastMail(request,email,/verific/i);
 const code=verification.text.match(/\b(\d{6})\b/)[1];
 const field=dialog.getByLabel('Código de verificación',{exact:true});
 await field.fill(code==='000000'?'111111':'000000');await dialog.getByRole('button',{name:'Verificar correo',exact:true}).click();
 await expect(dialog.getByRole('alert')).toBeVisible();
 await field.fill(code);await dialog.getByRole('button',{name:'Verificar correo',exact:true}).click();
 await expect(dialog.getByText(/Verificado: puedes recuperar tu contraseña por correo/)).toBeVisible();
 expect((await scenario.data()).session).toMatchObject({email,emailVerified:true});
 await dialog.getByRole('button',{name:'Cerrar ventana',exact:true}).click();
 await logout(page);
 // 2) «¿Olvidaste tu contraseña?»: la respuesta es igual exista o no la cuenta y solo el verdadero recibe correo.
 await clearMails(request);
 await page.getByLabel('Empresa',{exact:true}).fill(scenario.company.name);
 await page.getByRole('button',{name:'¿Olvidaste tu contraseña?',exact:true}).click();
 const recovery=page.getByRole('dialog',{name:'Recuperar contraseña',exact:true});await expect(recovery).toBeVisible();
 await expect(recovery.getByText('correo verificado',{exact:true})).toBeVisible();
 await expect(recovery.getByLabel('Empresa',{exact:true})).toHaveValue(scenario.company.name);
 await recovery.getByLabel('Usuario',{exact:true}).fill('no-existe-'+scenario.suffix);
 await recovery.getByRole('button',{name:'Enviar enlace',exact:true}).click();
 const generic=await recovery.getByRole('status').innerText();
 await expect(recovery.getByRole('heading',{name:'Revisa tu correo'})).toBeVisible();
 await page.waitForTimeout(500);expect(await mails(request)).toHaveLength(0);
 await recovery.getByRole('button',{name:'Volver al ingreso',exact:true}).click();
 await page.getByRole('button',{name:'¿Olvidaste tu contraseña?',exact:true}).click();
 const second=page.getByRole('dialog',{name:'Recuperar contraseña',exact:true});
 await second.getByLabel('Usuario',{exact:true}).fill(scenario.admin.username);await second.getByRole('button',{name:'Enviar enlace',exact:true}).click();
 await expect(second.getByRole('heading',{name:'Revisa tu correo'})).toBeVisible();
 expect(await second.getByRole('status').innerText()).toBe(generic);
 const reset=await lastMail(request,email,/contraseña|recuper/i);
 const link=reset.text.match(/https?:\/\/\S+\/recuperar#[A-Za-z0-9_-]{43}/)?.[0];expect(link,'el correo trae el enlace de recuperación').toBeTruthy();
 expect(link.startsWith(ORIGIN+'/recuperar#')).toBe(true);
 // 3) Nueva contraseña desde el enlace: valida coincidencia y política; el token sale de la barra de direcciones.
 await page.goto(link);
 await expect(page.getByRole('heading',{name:'Crea una nueva contraseña',exact:true})).toBeVisible();
 expect(new URL(page.url()).hash).toBe('');
 await page.locator('#reset-new').fill(NEW_PASSWORD);await page.locator('#reset-confirm').fill(NEW_PASSWORD+'x');
 await page.getByRole('button',{name:'Guardar contraseña',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Las contraseñas no coinciden.');
 await page.locator('#reset-confirm').fill(NEW_PASSWORD);
 await page.getByRole('button',{name:'Guardar contraseña',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Contraseña actualizada',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Ir al ingreso',exact:true}).click();
 await expect(page.getByLabel('Empresa',{exact:true})).toHaveValue(scenario.company.name);
 // 4) La contraseña vieja ya no sirve; la nueva sí.
 await page.getByLabel('Usuario',{exact:true}).fill(scenario.admin.username);await page.getByLabel('Contraseña',{exact:true}).fill(scenario.admin.password);
 await page.waitForTimeout(1100);await page.getByRole('button',{name:'Ingresar',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('incorrectos');
 await page.getByLabel('Contraseña',{exact:true}).fill(NEW_PASSWORD);
 await page.waitForTimeout(1100);await page.getByRole('button',{name:'Ingresar',exact:true}).click();
 await expect(page.getByRole('heading',{name:/Nueva venta|Resumen general/i}).first()).toBeVisible();
 // 5) El enlace sirve una sola vez: usarlo de nuevo es rechazado y la contraseña no cambia.
 await logout(page);
 await page.goto(link);
 await page.locator('#reset-new').fill('QA.Otra!2028');await page.locator('#reset-confirm').fill('QA.Otra!2028');
 await page.getByRole('button',{name:'Guardar contraseña',exact:true}).click();
 await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('heading',{name:'Contraseña actualizada',exact:true})).toHaveCount(0);
});

test('un enlace de recuperación incompleto muestra «Enlace no válido» y lleva al ingreso',async({page})=>{
 await page.goto('/recuperar');
 await expect(page.getByRole('heading',{name:'Enlace no válido',exact:true})).toBeVisible();
 await expect(page.getByRole('alert')).toContainText('incompleto o ya se usó');
 await page.getByRole('link',{name:'Ir al ingreso',exact:true}).click();
 await expect(page.getByLabel('Empresa',{exact:true})).toBeVisible();
});
