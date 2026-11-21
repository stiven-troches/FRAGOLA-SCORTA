// Shared helper (not a test file): compiles JSX modules with Vite for SSR snapshot tests.
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'vite';

export const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
/** exports: {'ClientWorkspace':'src/ClientWorkspace.jsx#default', ...}. Returns {module, cleanup}. */
export async function compileSSR(name,exports){
 mkdirSync(join(root,'test-results'),{recursive:true});
 const directory=mkdtempSync(join(root,'test-results',name+'-')),entry=join(directory,'entry.mjs');
 writeFileSync(entry,Object.entries(exports).map(([alias,spec])=>{const [file,member='default']=spec.split('#');return `export {${member} as ${alias}} from ${JSON.stringify(join(root,file))};`}).join('\n'));
 const result=await build({root,logLevel:'silent',build:{ssr:entry,write:false,minify:false}}),chunk=(Array.isArray(result)?result[0]:result).output.find(item=>item.type==='chunk'&&item.isEntry);
 const file=join(directory,'compiled.mjs');writeFileSync(file,chunk.code);
 return {module:await import(pathToFileURL(file).href),cleanup:()=>rmSync(directory,{recursive:true,force:true})};
}
