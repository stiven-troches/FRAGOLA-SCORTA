import {mkdir,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
await mkdir(new URL('../dist/',import.meta.url),{recursive:true});
for(const name of ['index.html','config.js'])await copyFile(root+'/'+name,root+'/dist/'+name);
console.log('Publicación preparada en dist/: solo index.html y config.js');
