// Verifica que el JavaScript de index.html no tenga errores de sintaxis.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const code = html.match(/<script>([\s\S]*)<\/script>/)[1];
try { new vm.Script(code, { filename: 'index.html' }); console.log('SINTAXIS OK (' + code.length + ' caracteres)'); }
catch (e) { console.log('ERROR DE SINTAXIS:', e.message); console.log(e.stack.split('\n').slice(0, 3).join('\n')); process.exit(1); }
