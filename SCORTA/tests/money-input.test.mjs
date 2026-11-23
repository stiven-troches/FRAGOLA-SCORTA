// Campos de dinero en COP: «12.000» es doce mil, no doce.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build,transformWithOxc} from 'vite';
import {mkdtempSync,writeFileSync,rmSync,mkdirSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseMoneyInput,formatMoneyInput} from '../src/format.mjs';

test('parseMoneyInput lee el formato colombiano y no adivina valores ambiguos',()=>{
 for(const [text,expected] of [['12.000','12000'],['12000','12000'],['1.250.000','1250000'],['$ 1.250.000','1250000'],['COP 80.000','80000'],['12.000,50','12000.5'],['12,5','12.5'],['12.5','12.5'],['12.50','12.5'],['0','0'],['007','7'],[' 35 000 ','35000'],['',''],['  ','']])
  assert.equal(parseMoneyInput(text),expected,text);
 for(const text of ['1,000','12.00.0','12.0000','1.2345','-5','abc','12,345','1e3','12..000'])assert.equal(parseMoneyInput(text),null,text);
});

test('formatMoneyInput agrupa miles y conserva los centavos',()=>{
 assert.equal(formatMoneyInput(12000),'12.000');assert.equal(formatMoneyInput('1250000'),'1.250.000');
 assert.equal(formatMoneyInput('12000.5'),'12.000,50');assert.equal(formatMoneyInput(''),'');assert.equal(formatMoneyInput(null),'');
 assert.equal(parseMoneyInput(formatMoneyInput('98765.43')),'98765.43','ida y vuelta');
});

test('MoneyInput entrega el número plano al formulario y muestra el valor agrupado',async()=>{
 const root=resolve(fileURLToPath(new URL('..',import.meta.url)));mkdirSync(join(root,'test-results'),{recursive:true});
 const directory=mkdtempSync(join(root,'test-results','money-input-'));
 try{
  const entry=join(directory,'entry.mjs');writeFileSync(entry,`export {default} from ${JSON.stringify(join(root,'src/MoneyInput.jsx'))};`);
  const result=await build({root,logLevel:'silent',build:{ssr:entry,write:false,minify:false}}),output=Array.isArray(result)?result[0].output:result.output;
  const file=join(directory,'compiled.mjs');writeFileSync(file,output.find(item=>item.type==='chunk'&&item.isEntry).code);
  const {default:MoneyInput}=await import(pathToFileURL(file).href);
  const html=renderToStaticMarkup(React.createElement(MoneyInput,{value:'1250000',onChange(){},required:true,'aria-label':'Valor'}));
  assert.match(html,/type="text"/);assert.match(html,/inputMode="decimal"/);assert.match(html,/value="1\.250\.000"/);assert.match(html,/required=""/);assert.doesNotMatch(html,/step=/);
  // El manejador real con un useState mínimo: «12.000» llega como 12000 y un texto ambiguo marca el campo inválido.
  const code=(await transformWithOxc(readFileSync(join(root,'src/MoneyInput.jsx'),'utf8'),'MoneyInput.jsx',{jsx:{runtime:'classic'}})).code.replace(/^import[^\n]*;\n/gm,'').replace(/export default function /,'function ');
  let draft=null;const useState=initial=>[draft??initial,next=>{draft=next}];
  const Live=new Function('React','useState','parseMoneyInput','formatMoneyInput',code+';return MoneyInput;')(React,useState,parseMoneyInput,formatMoneyInput);
  const received=[];let validity='';const input=value=>({value,setCustomValidity(message){validity=message}});
  const type=value=>{const target=input(value);Live({value:'',onChange:event=>received.push(event.target.value),max:'1000000'}).props.onChange({target,currentTarget:target})};
  type('12.000');assert.deepEqual(received,['12000']);assert.equal(validity,'');
  type('12.000,50');assert.equal(received.at(-1),'12000.5');
  type('1,000');assert.equal(received.at(-1),'1,000','un texto ambiguo pasa tal cual: el servidor lo rechaza');assert.match(validity,/por ejemplo 12\.000/);
  type('2.000.000');assert.match(validity,/máximo es 1\.000\.000/);
  assert.equal(Live({value:'',onChange(){}}).props.value,'2.000.000','mientras se edita se muestra lo escrito');
 }finally{rmSync(directory,{recursive:true,force:true})}
});
