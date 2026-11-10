import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {server} from './server.mjs';
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||"chromium"});
try{
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
    const page=await browser.newPage({viewport});const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/config.js',route=>route.fulfill({contentType:'text/javascript',body:"window.__FRAGOLA_CLOUD={url:'',anonKey:''};"}));
    await page.goto(base);await page.waitForSelector('button');
    await page.evaluate(()=>{loadDemo();saveNow();render();});
    assert(await page.evaluate(()=>S.services.length>0&&S.pros.length>0));
    await page.reload();await page.waitForSelector('button');
    assert(await page.evaluate(()=>S.services.length>0),'Los datos locales no persistieron');
    console.log('UI: catálogo y persistencia',viewport.width);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Desbordamiento horizontal');
    assert.deepEqual(errors,[]);
    await mkdir(new URL('../docs/capturas/',import.meta.url),{recursive:true});
    await page.screenshot({path:fileURLToPath(new URL(`../docs/capturas/inicio-${viewport.width}.png`,import.meta.url)),fullPage:true});
    await page.evaluate(()=>{S.role='admin';render();});
    await page.locator('#lg-pin').fill('0000');await page.getByRole('button',{name:'Entrar',exact:true}).click();
    assert((await page.locator('body').innerText()).includes('PIN incorrecto'));
    await page.locator('#lg-pin').fill('1234');await page.getByRole('button',{name:'Entrar',exact:true}).click();
    assert(await page.evaluate(()=>S.auth.admin));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Panel desborda');
    assert.deepEqual(errors,[]);
    console.log('UI: PIN incorrecto y acceso administrador',viewport.width);
    await page.close();
  }
  console.log('UI escritorio y móvil OK');
}finally{await browser.close();await new Promise(r=>server.close(r));}


