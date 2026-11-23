// BE-15 / BE-16 / BE-34: SSR del espacio de la empresa con los módulos Caja, Cartera y Separados.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'vite';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
let directory,components;
before(async()=>{
 mkdirSync(join(root,'test-results'),{recursive:true});directory=mkdtempSync(join(root,'test-results','credito-ui-'));
 const entry=join(directory,'entry.mjs');writeFileSync(entry,`export {default as ClientWorkspace,MobileMoreMenu} from ${JSON.stringify(join(root,'src/ClientWorkspace.jsx'))};`);
 const result=await build({root,logLevel:'silent',build:{ssr:entry,write:false,minify:false}}),chunk=(Array.isArray(result)?result[0]:result).output.find(item=>item.type==='chunk'&&item.isEntry);
 const module=join(directory,'compiled.mjs');writeFileSync(module,chunk.code);components=await import(pathToFileURL(module).href);
});
after(()=>{if(directory)rmSync(directory,{recursive:true,force:true})});
const company={id:'c1',name:'Moto Crédito'};
const props=role=>({session:{userId:'u1',username:'ana',name:'Ana',role,companyId:'c1',company},data:{revision:1,company,state:{prods:[],ventas:[],compras:[],servs:[],movimientos:[],layaways:[],creditAccounts:[],customerDirectory:[]}},onAction:async()=>({}),onRefresh:async()=>({})});

test('SSR navegación: vendedor y administrador acceden a Caja, Cartera y Separados',()=>{
 const seller=renderToStaticMarkup(React.createElement(components.ClientWorkspace,props('vendedor')));
 for(const label of ['>Caja<','>Cartera<','>Separados<'])assert.ok(seller.includes(label),label);
 assert.ok(!seller.includes('>Compras<'),'el vendedor no ve compras');
 const admin=renderToStaticMarkup(React.createElement(components.ClientWorkspace,props('admin')));
 for(const label of ['>Caja<','>Cartera<','>Separados<','>Compras<'])assert.ok(admin.includes(label),label);
 const menu=renderToStaticMarkup(React.createElement(components.MobileMoreMenu,{admin:false,onNavigate(){},onProfile(){},onLogout(){}}));
 for(const label of ['Caja','Cartera','Separados'])assert.match(menu,new RegExp(label));assert.doesNotMatch(menu,/Compras/);
});
