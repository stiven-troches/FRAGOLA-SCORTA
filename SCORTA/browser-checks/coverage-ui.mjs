// Cobertura de la INTERFAZ (src/**) medida en el navegador real. `npm run test:coverage:ui`.
//
// Qué mide: los specs de Playwright (browser-checks/*.spec.mjs, proyecto «escritorio») se ejecutan contra una
// compilación SIN minificar y con mapas de fuente (dist-coverage, no toca dist/). Chromium entrega la cobertura V8
// de cada prueba (page.coverage); aquí se funden todas las pruebas por script (@bcoe/v8-coverage), se traducen a
// los archivos originales de src/ con los mapas (v8-to-istanbul) y se imprime líneas, funciones y ramas por archivo.
//
// Qué NO mide: la lógica de servidor ni los módulos de la raíz (eso es `npm run test:coverage`, 85 %/80 %); las
// segundas pestañas/contextos que abren algunas pruebas; la demo estática (dist-demo, `npm run test:demo:ui`).
// Las líneas de este código son muy largas (varias sentencias por línea): por eso se muestran también funciones y
// ramas (bloques), que no dependen del formato. Las cifras son las que salen: no se ajustan ni se excluyen archivos
// para subirlas, salvo la lista NO_BROWSER de abajo (código que por diseño no corre en la app del navegador).
//
// Uso: node browser-checks/coverage-ui.mjs [--no-run] [--no-build] [--keep-going] [--project=escritorio] [-- <args de playwright>]
import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,readdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {basename,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import v8toIstanbul from 'v8-to-istanbul';
import v8coverage from '@bcoe/v8-coverage';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const COVERAGE_DIR=join(root,'dist-coverage'),OUT_DIR=join(root,'test-results','ui-coverage'),RAW_DIR=join(OUT_DIR,'raw');
const PORT=process.env.SCORTA_UI_COVERAGE_PORT||'19440';

// Umbrales mínimos sobre los archivos de src/ que carga la app del navegador. Se fijaron un poco por debajo de la
// medición real (ver docs/qa/COBERTURA-INTERFAZ.md): si bajan, el comando falla. Súbelos cuando sube la cobertura.
export const THRESHOLDS={lines:75,functions:45,branches:60};
// Código de src/ que NO forma parte de la app del navegador de producción y por eso no cuenta en el denominador.
const NO_BROWSER={
 'lazy-views.ssr.jsx':'solo para pruebas SSR de Node (vite.config.mjs lo sustituye en el build SSR)',
 'platform-demo-main.jsx':'entrada de la demo estática (dist-demo, test:demo:ui)','platform-demo.mjs':'demo estática','demo-api.mjs':'demo estática',
 'demo-seed.mjs':'demo estática','je-trial-demo.mjs':'demo estática','je-trial-logo.mjs':'demo estática',
 'landing.mjs':'página landing.html (no la recorren estos specs)',
};

const args=process.argv.slice(2),flag=name=>args.includes(name);
const passThrough=args.includes('--')?args.slice(args.indexOf('--')+1):[];
const project=(args.find(a=>a.startsWith('--project='))||'--project=escritorio').slice('--project='.length);
const run=(command,commandArgs,env={})=>spawnSync(command,commandArgs,{cwd:root,stdio:'inherit',env:{...process.env,...env}});

let testStatus=0;
if(!flag('--no-run')){
 if(!flag('--no-build')){
  console.log('> Compilando dist-coverage (sin minificar, con mapas de fuente)…');
  const {build}=await import('vite');
  await build({root,logLevel:'warn',build:{outDir:'dist-coverage',emptyOutDir:true,sourcemap:true,minify:false}});
 }
 rmSync(OUT_DIR,{recursive:true,force:true});mkdirSync(RAW_DIR,{recursive:true});
 console.log('> Ejecutando los specs de Playwright con cobertura V8 (proyecto '+project+')…');
 const tests=run(process.execPath,[join(root,'node_modules','@playwright','test','cli.js'),'test','--project='+project,'--reporter=list',...passThrough],{SCORTA_UI_COVERAGE:'1',SCORTA_UI_PORT:PORT});
 testStatus=tests.status??1;
 if(testStatus!==0&&!flag('--keep-going')){console.error('Hay pruebas E2E fallidas: la cobertura no es representativa. Corrígelas (o usa --keep-going para ver la cifra igualmente).');process.exit(testStatus)}
}
if(!existsSync(RAW_DIR)||!readdirSync(RAW_DIR).length){console.error('No hay cobertura cruda en '+RAW_DIR+'. Ejecuta sin --no-run.');process.exit(1)}

// 1) Fundir la cobertura de todas las pruebas por script.
const processCovs=readdirSync(RAW_DIR).filter(f=>f.endsWith('.json')).map(f=>({result:JSON.parse(readFileSync(join(RAW_DIR,f),'utf8')).map((entry,index)=>({scriptId:String(index),url:entry.url,functions:entry.functions}))}));
const merged=v8coverage.mergeProcessCovs(processCovs);

// 2) Pasar de bytes de bundle a líneas/funciones/ramas de los archivos originales.
const files=new Map(); // ruta absoluta del original → {lines:Map<n,boolean>, fns:Map<clave,{name,line,hit}>, branches:Map<clave,boolean>}
const slot=path=>{let item=files.get(path);if(!item){item={lines:new Map(),fns:new Map(),branches:new Map()};files.set(path,item)}return item};
for(const script of merged.result){
 const name=basename(new URL(script.url).pathname),file=join(COVERAGE_DIR,'assets',name);
 if(!existsSync(file)||!existsSync(file+'.map'))continue;
 const converter=v8toIstanbul(file,0,{source:readFileSync(file,'utf8'),sourceMap:{sourcemap:JSON.parse(readFileSync(file+'.map','utf8'))}});
 await converter.load();converter.applyCoverage(script.functions);
 for(const [path,data] of Object.entries(converter.toIstanbul())){
  const item=slot(resolve(path));
  for(const [id,statement] of Object.entries(data.statementMap)){const line=statement.start.line;item.lines.set(line,(item.lines.get(line)||false)||data.s[id]>0)}
  for(const [id,fn] of Object.entries(data.fnMap)){const key=fn.name+'@'+fn.loc.start.line+':'+fn.loc.start.column;const old=item.fns.get(key);item.fns.set(key,{name:fn.name,line:fn.loc.start.line,hit:(old?.hit||false)||data.f[id]>0})}
  for(const [id,branch] of Object.entries(data.branchMap))branch.locations.forEach((location,index)=>{const key=location.start.line+':'+location.start.column+'-'+location.end.line+':'+location.end.column;item.branches.set(key,(item.branches.get(key)||false)||data.b[id][index]>0)});
 }
}

// 3) Totales por archivo de src/ (y de los módulos de la raíz que también viajan en el bundle).
const count=map=>{let hit=0;for(const value of map.values())if(value===true||value?.hit===true)hit++;return {hit,total:map.size}};
const pct=({hit,total})=>total?Math.round(hit*1000/total)/10:100;
const rows=[],shared=[];
for(const [path,item] of files){
 const rel=relative(root,path).split(sep).join('/');
 if(rel.startsWith('..')||rel.includes('node_modules')||!/.(jsx|mjs)$/.test(rel))continue; // sin imágenes (?url) ni código ajeno
 const row={file:rel,lines:count(item.lines),functions:count(item.fns),branches:count(item.branches),item};
 if(rel.startsWith('src/'))rows.push(row);else shared.push(row);
}
rows.sort((a,b)=>pct(a.lines)-pct(b.lines)||a.file.localeCompare(b.file));shared.sort((a,b)=>a.file.localeCompare(b.file));
const notLoaded=[];
const walk=dir=>{for(const entry of readdirSync(dir,{withFileTypes:true})){const full=join(dir,entry.name);if(entry.isDirectory()){if(entry.name!=='assets')walk(full)}else if(/\.(jsx|mjs)$/.test(entry.name)){const rel=relative(root,full).split(sep).join('/');if(!rows.some(r=>r.file===rel))notLoaded.push(rel)}}};
walk(join(root,'src'));
const excluded=rows.filter(r=>NO_BROWSER[basename(r.file)]);
const app=rows.filter(r=>!NO_BROWSER[basename(r.file)]);
const sum=(list,key)=>list.reduce((a,r)=>({hit:a.hit+r[key].hit,total:a.total+r[key].total}),{hit:0,total:0});
const missing=notLoaded.filter(f=>!NO_BROWSER[basename(f)]);
// Un archivo de la app que ningún spec cargó cuenta como 0 % de sus líneas con código (no blancas ni comentarios).
const codeLines=file=>readFileSync(join(root,file),'utf8').split(/\r?\n/).filter(line=>line.trim()&&!line.trim().startsWith('//')).length;
const unloaded={hit:0,total:missing.reduce((n,file)=>n+codeLines(file),0)};
const loadedLines=sum(app,'lines');
const totals={lines:{hit:loadedLines.hit+unloaded.hit,total:loadedLines.total+unloaded.total},functions:sum(app,'functions'),branches:sum(app,'branches')};

const cell=value=>(pct(value).toFixed(1)+' %').padStart(8)+(' ('+value.hit+'/'+value.total+')').padEnd(12);
const width=Math.max(...[...rows,...shared].map(r=>r.file.length),20);
const header='Archivo'.padEnd(width)+'  '+'Líneas'.padEnd(20)+'Funciones'.padEnd(20)+'Ramas';
const printRow=r=>console.log(r.file.padEnd(width)+'  '+cell(r.lines)+cell(r.functions)+cell(r.branches)+(NO_BROWSER[basename(r.file)]?'  [fuera del conteo: '+NO_BROWSER[basename(r.file)]+']':''));
console.log('\nCobertura de la INTERFAZ en el navegador (proyecto '+project+', '+processCovs.length+' pruebas, cobertura fundida)\n');
console.log(header);console.log('-'.repeat(header.length+8));
for(const row of rows)printRow(row);
console.log('-'.repeat(header.length+8));
console.log(('TOTAL src/ (app'+(missing.length?' + '+missing.length+' sin cargar':'')+')').padEnd(width)+'  '+cell(totals.lines)+cell(totals.functions)+cell(totals.branches));
if(shared.length){console.log('\nMódulos de la raíz que también corren en el navegador (informativo; su umbral es el de test:coverage):');for(const row of shared)printRow(row)}
if(missing.length)console.log('\nArchivos de src/ que ningún spec cargó (cuentan como 0 % de líneas en el total; sin funciones ni ramas medibles): '+missing.join(', '));
console.log('\nUmbral mínimo: líneas '+THRESHOLDS.lines+' %, funciones '+THRESHOLDS.functions+' %, ramas '+THRESHOLDS.branches+' %.');

// 4) Resúmenes para CI (json + lcov) y umbral.
const summary={generatedAt:new Date().toISOString(),project,tests:processCovs.length,thresholds:THRESHOLDS,totals:Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,{...v,pct:pct(v)}])),
 files:Object.fromEntries(rows.map(r=>[r.file,{lines:{...r.lines,pct:pct(r.lines)},functions:{...r.functions,pct:pct(r.functions)},branches:{...r.branches,pct:pct(r.branches)},excluded:NO_BROWSER[basename(r.file)]||undefined}])),notLoaded:missing};
writeFileSync(join(OUT_DIR,'summary.json'),JSON.stringify(summary,null,1));
const lcov=[...rows,...shared].map(r=>['TN:','SF:'+r.file,...[...r.item.fns.values()].map(f=>'FN:'+f.line+','+f.name),...[...r.item.fns.values()].map(f=>'FNDA:'+(f.hit?1:0)+','+f.name),'FNF:'+r.functions.total,'FNH:'+r.functions.hit,
 ...[...r.item.lines].sort((a,b)=>a[0]-b[0]).map(([n,hit])=>'DA:'+n+','+(hit?1:0)),'LF:'+r.lines.total,'LH:'+r.lines.hit,'end_of_record'].join('\n')).join('\n')+'\n';
writeFileSync(join(OUT_DIR,'lcov.info'),lcov);
console.log('Resumen: '+relative(root,join(OUT_DIR,'summary.json'))+' · lcov: '+relative(root,join(OUT_DIR,'lcov.info')));
const failed=Object.entries(THRESHOLDS).filter(([key,min])=>pct(totals[key])<min);
if(failed.length){for(const [key,min] of failed)console.error('FALLA: '+key+' '+pct(totals[key])+' % < '+min+' % (umbral mínimo de la interfaz).');process.exit(1)}
process.exit(testStatus);
