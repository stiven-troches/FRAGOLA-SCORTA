import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import React from 'react';
import {build} from 'vite';
import {createPlatform,platformRequest} from '../platform.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
let temporary,components;
before(async()=>{
 mkdirSync(join(root,'test-results'),{recursive:true});temporary=mkdtempSync(join(root,'test-results','owner-concurrency-'));
 const entry=join(temporary,'entry.mjs'),ownerFile=join(root,'src/OwnerWorkspace.jsx');
 // Exercise the actual component handlers across renders/prop refreshes without
 // mounting a browser. Child dialogs remain React elements; DOM effects are not run.
 // The hooks live in one virtual module so the component and the test share the
 // same instance on every OS (a file path could be loaded twice with \ and / on Windows).
 const hooksId='\0owner-hooks-fixture',hooksCode=`import React from 'react';\nlet slots=[],cursor=0;\nexport default React;\nexport function reset(){slots=[];cursor=0}\nexport function begin(){cursor=0}\nexport function useState(initial){const at=cursor++;if(!(at in slots))slots[at]=typeof initial==='function'?initial():initial;return [slots[at],value=>{slots[at]=typeof value==='function'?value(slots[at]):value}]}\nexport function useRef(initial){const at=cursor++;if(!(at in slots))slots[at]={current:initial};return slots[at]}\nexport function useEffect(){cursor++}\n`;
 writeFileSync(entry,`export {default as OwnerWorkspace} from ${JSON.stringify(ownerFile)};\nexport {reset,begin} from 'owner-hooks-fixture';\n`);
 const result=await build({root,logLevel:'silent',plugins:[{name:'owner-hooks-fixture',enforce:'pre',resolveId(source,importer){if(source==='owner-hooks-fixture')return hooksId;if(source==='react'&&importer&&importer!==hooksId&&resolve(importer)===resolve(ownerFile))return hooksId},load(id){if(id===hooksId)return hooksCode}}],build:{ssr:entry,write:false,minify:false}});
 const output=(Array.isArray(result)?result[0]:result).output,chunk=output.find(value=>value.type==='chunk'&&value.isEntry);
 const compiled=join(temporary,'components.mjs');writeFileSync(compiled,chunk.code);components=await import(pathToFileURL(compiled).href);
});
after(()=>{if(temporary)rmSync(temporary,{recursive:true,force:true})});

function nodes(element){
 const result=[];
 const visit=value=>{if(Array.isArray(value)){value.forEach(visit);return}if(!React.isValidElement(value))return;result.push(value);visit(value.props.children);visit(value.props.footer)};
 visit(element);return result;
}
function textOf(value){return Array.isArray(value)?value.map(textOf).join(''):React.isValidElement(value)?textOf(value.props.children):typeof value==='string'||typeof value==='number'?String(value):''}
function button(tree,text){const node=nodes(tree).find(item=>item.type==='button'&&textOf(item)===text);assert.ok(node,'Debe existir el botón '+text);return node}
function input(tree,value){const node=nodes(tree).find(item=>item.type==='input'&&item.props.value===value);assert.ok(node,'Debe existir el campo de la ficha esperado');return node}
const turn=()=>new Promise(resolve=>setImmediate(resolve));

async function fixture(){
 const credential='Aa1!'+crypto.randomUUID(),owner={company:'Auditoría',username:'owner',password:credential};
 let state=await createPlatform({owner}),token,data,actionPromise,failRefresh=false,refreshes=0;const actions=[];
 const request=async(method,path,body)=>{const r=await platformRequest(state,{method,path,body,token},{now:'2026-11-20T15:00:00Z'});state=r.state;if(Object.hasOwn(r,'token'))token=r.token;return r};
 let r=await request('POST','/api/v2/login',owner);assert.equal(r.status,200);
 r=await request('POST','/api/v2/action',{type:'company.create',form:{name:'Moto Prueba',contact:'Contacto anterior',username:'admin',password:credential,startDate:'2026-11-01',endDate:'2026-11-30',monthlyFee:80000}});assert.equal(r.status,200);data=r.body;
 const companyId=data.companies[0].id;
 const props=()=>({session:data.session,data,onProfile(){},onLogout(){},onRefresh:async()=>{refreshes++;return failRefresh?null:data},onAction:action=>{
  actions.push(action);
  actionPromise=(async()=>{
   // Same contract as PlatformSession.run: explicit captured revisions win;
   // absent revisions use the latest refreshed envelope.
   const r=await request('POST','/api/v2/action',{...action,revision:action.revision??data.revision});
   if(r.status>=400){data=(await request('GET','/api/v2/data')).body;throw Object.assign(Error(r.body.error),{status:r.status,code:r.body.code})}
   data=r.body;return data;
  })();return actionPromise;
 }});
 components.reset();
 const render=()=>{components.begin();return components.OwnerWorkspace(props())};
 let tree=render();nodes(tree).find(node=>node.type==='button'&&node.props['aria-label']==='Administrar Moto Prueba').props.onClick();tree=render();button(tree,'Editar').props.onClick();tree=render();
 const openedRevision=data.revision;
 input(tree,'Contacto anterior').props.onChange({target:{value:'Contacto escrito en el formulario'}});tree=render();
 const renew=async()=>{const r=await request('POST','/api/v2/action',{type:'company.renew',companyId,form:{startDate:'2026-11-01',endDate:'2026-12-30',date:'2026-11-20',amount:80000}});assert.equal(r.status,200);data=(await request('GET','/api/v2/data')).body;return render()};
 const submit=async()=>{const current=render(),form=nodes(current).find(node=>node.type==='form'&&node.props.id==='ow-company-form');assert.ok(form);form.props.onSubmit({preventDefault(){}});if(actionPromise)await actionPromise.catch(()=>{});await turn();return render()};
 return {render,renew,submit,openedRevision,actions,setFailRefresh:value=>{failRefresh=value},get refreshes(){return refreshes},get state(){return state}};
}

test('formulario de empresa conserva revisión original y no pisa una renovación tras refresco',async()=>{
 const f=await fixture();await f.renew();const tree=await f.submit();
 assert.equal(f.actions[0].revision,f.openedRevision);
 assert.equal(f.state.companies[0].endDate,'2026-12-30');assert.equal(f.state.payments[0].endDate,'2026-12-30');
 assert.ok(nodes(tree).some(node=>node.type==='input'&&node.props.value==='Contacto escrito en el formulario'),'El rechazo conserva el texto local');
 assert.ok(button(tree,'Guardar cambios').props.disabled);assert.ok(button(tree,'Revisar datos actuales'));
 assert.ok(nodes(tree).some(node=>node.props?.role==='alert'&&textOf(node).includes('Los datos cambiaron')));
 await f.submit();assert.equal(f.actions.length,1,'Un segundo envío no adopta silenciosamente la revisión del refresco');
 assert.equal(f.state.companies[0].endDate,'2026-12-30');
});

test('recuperar ficha requiere decisión explícita; cancelar o fallar conserva cambios; recargar usa datos y revisión nuevos',async()=>{
 const f=await fixture();await f.renew();let tree=await f.submit();const previousWindow=globalThis.window;
 try{
  globalThis.window={confirm:()=>false};await button(tree,'Revisar datos actuales').props.onClick();tree=f.render();
  assert.equal(f.refreshes,0);assert.ok(input(tree,'Contacto escrito en el formulario'));
  globalThis.window={confirm:()=>true};f.setFailRefresh(true);await button(tree,'Revisar datos actuales').props.onClick();tree=f.render();assert.ok(input(tree,'Contacto escrito en el formulario'));assert.ok(button(tree,'Guardar cambios').props.disabled);
  f.setFailRefresh(false);await button(tree,'Revisar datos actuales').props.onClick();tree=f.render();assert.ok(input(tree,'2026-12-30'));assert.ok(input(tree,'Contacto anterior'));assert.equal(button(tree,'Guardar cambios').props.disabled,false);
  input(tree,'Contacto anterior').props.onChange({target:{value:'Contacto revisado'}});await f.submit();
  assert.ok(f.actions[1].revision>f.openedRevision);assert.equal(f.state.companies[0].contact,'Contacto revisado');assert.equal(f.state.companies[0].endDate,'2026-12-30');assert.equal(f.state.payments.length,1);
 }finally{if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow}
});

test('guardar sin otra actualización conserva el comportamiento normal',async()=>{
 const f=await fixture();await f.submit();assert.equal(f.actions[0].revision,f.openedRevision);assert.equal(f.state.companies[0].contact,'Contacto escrito en el formulario');assert.equal(f.state.companies[0].endDate,'2026-11-30');assert.equal(f.state.payments.length,0);
});
