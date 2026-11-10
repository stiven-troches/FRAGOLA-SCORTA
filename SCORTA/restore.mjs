import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync,copyFileSync,mkdirSync} from 'node:fs';import {resolve,dirname} from 'node:path';import {fileURLToPath} from 'node:url';
const input=process.argv[2];if(!input)throw Error('Uso: node restore.mjs respaldo.json (servidor detenido)');
const s=JSON.parse(readFileSync(input,'utf8'));
for(const key of ['prods','compras','ventas','servs','movimientos'])if(!Array.isArray(s[key]))throw Error('Respaldo inválido: '+key);
if(!Number.isSafeInteger(s.revision)||s.revision<0)throw Error('Revisión inválida');
for(const p of s.prods)if(!p.id||typeof p.nombre!=='string'||!Number.isSafeInteger(p.stock)||p.stock<0)throw Error('Producto inválido');
const file=resolve(process.env.DATA_DIR||resolve(dirname(fileURLToPath(import.meta.url)),'data'),'motoshop.sqlite');mkdirSync(dirname(file),{recursive:true});
if(existsSync(file)){if(existsSync(file+'-wal'))throw Error('Hay un WAL pendiente. Detén el servidor y cierra la base antes de restaurar.');copyFileSync(file,file+'.'+Date.now()+'.bak')}
const db=new DatabaseSync(file);db.exec('CREATE TABLE IF NOT EXISTS app(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL)');db.prepare('INSERT OR REPLACE INTO app VALUES(1,?)').run(JSON.stringify(s));db.close();console.log('Respaldo restaurado');
