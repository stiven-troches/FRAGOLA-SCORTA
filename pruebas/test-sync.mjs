import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('async function cloudSync(){'),html.indexOf('const syncText='));
let fail=true, inserted=0;
const persisted=new Set();
const rows=[{id:1,name:'Primero'},{id:2,name:'Segundo'}];
const C={mode:'biz',isAdmin:false,bid:'test',snap:{items:new Map(),other:new Map()},st:'',sb:{from(t){return {async insert(batch){
  if(t==='other'&&fail)return {error:new Error('Failed to fetch')};
  for(const row of batch){assert(!persisted.has(`${t}:${row.id}`),'Reintento duplicó una escritura confirmada');persisted.add(`${t}:${row.id}`);inserted++;}
  return {};
}};}}};
const ctx=vm.createContext({C,CT:[{t:'items',k:'id',rows:()=>rows},{t:'other',k:'id',rows:()=>[{id:3}]}],S:{audit:[]},syncBadge(){},syncMsg:()=> 'Sin conexión',toast(){},setTimeout(){},clearTimeout(){},cloudSchedule(){},console});
vm.runInContext(source,ctx);
await ctx.cloudSync();
assert.equal(C.st,'err');assert.equal(inserted,2);assert.equal(C.snap.items.size,2);
fail=false;await ctx.cloudSync();
assert.equal(C.st,'ok');assert.equal(inserted,3);
const flush=html.slice(html.indexOf('async function cloudFlush(){'),html.indexOf('async function cloudSync(){'));
vm.runInContext(flush,ctx);
ctx.cloudSync=async()=>{C.st='err';};
await assert.rejects(ctx.cloudFlush(),/sin guardar/);
console.log('SINCRONIZACIÓN: guardado parcial, reintento sin duplicados y cambio bloqueado OK');
