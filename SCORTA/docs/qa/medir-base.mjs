// QA-10: medición base del motor actual (estado JSON único + platformRequest) con una
// empresa sintética de 5.000 productos y 20.000 ventas. Línea base para comparar con Postgres.
//
// Uso (desde SCORTA):  node docs/qa/medir-base.mjs [--productos 5000] [--ventas 20000] [--muestras 200] [--completo] [--md docs/qa/MEDICION-BASE.md]
//
// Siembra: las primeras ventas (--semilla, 1.000 por defecto) se crean con platformRequest
// (sale.create real). Para no tardar horas (cada POST clona TODO el estado), el resto se
// replica a partir de esas ventas reales con ids y fechas nuevas. --completo crea las
// 20.000 con platformRequest (lento: puede tardar mucho).
import {writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import os from 'node:os';
import {createPlatform,platformRequest} from '../../platform.mjs';

const args=process.argv.slice(2),flag=(name,fallback)=>{const i=args.indexOf('--'+name);return i<0?fallback:args[i+1]};
const PRODUCTS=Number(flag('productos',5000)),SALES=Number(flag('ventas',20000)),SAMPLES=Number(flag('muestras',200));
const FULL=args.includes('--completo'),SEED=FULL?SALES:Math.min(SALES,Number(flag('semilla',1000))),MD=flag('md',null);
const PASSWORD='MedicionBase-2026!';
const NOW=Date.parse('2026-11-20T15:00:00.000Z');

let state=await createPlatform({owner:{company:'Fragola',username:'owner',name:'Owner',password:PASSWORD}});
const tokens={};
async function call(who,path,body,now=NOW){
 const result=await platformRequest(state,{method:body?'POST':'GET',path,body,token:tokens[who]},{now});
 state=result.state;if(result.token)tokens[who]=result.token;
 if(result.status!==200)throw Error(`${path} ${result.status}: ${JSON.stringify(result.body).slice(0,300)}`);
 return result.body;
}
const act=(who,body,now)=>call(who,'/api/v2/action',{requestId:crypto.randomUUID(),...body},now);
const pct=(values,p)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.ceil(p/100*sorted.length)-1)]};
const fmt=ms=>ms<10?ms.toFixed(2):ms.toFixed(1);
async function measure(label,count,fn){const times=[];for(let i=0;i<count;i++){const t=performance.now();await fn(i);times.push(performance.now()-t)}return {label,count,p50:pct(times,50),p95:pct(times,95),max:Math.max(...times)}}

const t0=performance.now();
await call('owner','/api/v2/login',{company:'Fragola',username:'owner',password:PASSWORD});
const company=(await act('owner',{type:'company.create',form:{name:'Medición Base',startDate:'2026-01-01',endDate:'2027-12-31',monthlyFee:0,username:'admin',password:PASSWORD}})).companies[0];
await call('admin','/api/v2/login',{company:company.slug,username:'admin',password:PASSWORD});
const items=Array.from({length:PRODUCTS},(_,i)=>({nombre:`Producto ${i} ${['Aceite','Filtro','Pastilla','Cadena','Bujía'][i%5]}`,referencia:'REF-'+String(i).padStart(5,'0'),categoria:['Lubricantes','Filtros','Frenos','Transmisión','Encendido'][i%5],stock:100000,stock_minimo:5,precio_compra:1000+(i%50)*100,precio_venta:2000+(i%50)*150}));
for(let i=0;i<items.length;i+=1000)await act('admin',{type:'business.change',payload:{kind:'importar',items:items.slice(i,i+1000)}}); // máximo 1.000 por importación
const products=state.businesses[company.id].prods;
const tImport=performance.now();
// Ventas reales: 1-3 líneas, medios de pago rotando y fechas en los 60 días previos.
const day=offset=>NOW-offset*86400000;
const saleBody=i=>({type:'sale.create',form:{cliente:'Cliente '+(i%500),telefono:'300'+String(1000000+i%500),paymentMethod:['efectivo','transferencia','tarjeta'][i%3]},items:Array.from({length:1+i%3},(_,k)=>{const p=products[(i*7+k*13)%products.length];return {producto_id:p.id,cantidad:1+(i+k)%2,precio_unitario:p.precio_venta}}),labor:[]});
for(let i=0;i<SEED;i++)await act('admin',saleBody(i),day(i%60));
const tSeed=performance.now();
if(!FULL&&SALES>SEED){
 const business=state.businesses[company.id],template=business.ventas.slice();
 const extra=[];
 for(let i=SEED;i<SALES;i++){const sale=structuredClone(template[i%template.length]);sale.id=crypto.randomUUID();sale.fecha=new Date(day(i%60)).toISOString().slice(0,10);delete sale.receiptToken;delete sale.receiptUrl;extra.push(sale)}
 business.ventas=[...extra.reverse(),...business.ventas];
}
const tReplicate=performance.now();
const business=state.businesses[company.id];
const stateMB=Buffer.byteLength(JSON.stringify(state))/1048576;

const results=[];
results.push(await measure('sale.create (POST /api/v2/action)',SAMPLES,i=>act('admin',saleBody(SALES+i))));
results.push(await measure('GET /api/v2/data (carga y búsqueda de catálogo)',Math.max(20,SAMPLES/4),async i=>{const data=await call('admin','/api/v2/data');const q=norm('Producto '+(i*37%PRODUCTS));data.state.prods.filter(p=>norm(p.nombre).includes(q)||norm(p.referencia).includes(q))}));
results.push(await measure('GET /api/v2/reports (ventas, 1 día)',Math.max(20,SAMPLES/4),()=>call('admin','/api/v2/reports?from=2026-11-20&to=2026-11-20')));
results.push(await measure('GET /api/v2/reports (ventas, 30 días)',Math.max(20,SAMPLES/4),()=>call('admin','/api/v2/reports?from=2026-10-22&to=2026-11-20')));
results.push(await measure('GET /api/v2/overview (resumen, 30 días)',Math.max(20,SAMPLES/4),()=>call('admin','/api/v2/overview?from=2026-10-22&to=2026-11-20')));
function norm(v){return String(v).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase()}

const env={node:process.version,platform:`${os.platform()} ${os.release()}`,cpu:os.cpus()[0]?.model?.trim(),cores:os.cpus().length,memGB:(os.totalmem()/1073741824).toFixed(1)};
const lines=[
 `| Operación | Muestras | p50 (ms) | p95 (ms) | máx. (ms) |`,`|---|---:|---:|---:|---:|`,
 ...results.map(r=>`| ${r.label} | ${r.count} | ${fmt(r.p50)} | ${fmt(r.p95)} | ${fmt(r.max)} |`)];
const summary={productos:business.prods.length,ventas:business.ventas.length,ventasReales:SEED+SAMPLES,estadoMB:Number(stateMB.toFixed(1)),siembraSegundos:{importar:((tImport-t0)/1000).toFixed(1),ventasReales:((tSeed-tImport)/1000).toFixed(1),replicadas:((tReplicate-tSeed)/1000).toFixed(1)}};
console.log(JSON.stringify({env,summary},null,1));console.log(lines.join('\n'));
if(MD)writeFileSync(MD,`# Medición base SQLite / estado JSON (QA-10)

Generado por \`node docs/qa/medir-base.mjs${args.length?' '+args.join(' '):''}\` el ${new Date().toISOString().slice(0,16).replace('T',' ')} UTC.

## Entorno

- Node ${env.node} · ${env.platform} · ${env.cpu} (${env.cores} núcleos) · ${env.memGB} GB RAM
- Motor medido: \`platformRequest\` en memoria (sin E/S de SQLite). En producción se suma la
  lectura/parseo y la escritura del JSON completo en SQLite por cada POST (ver nota).

## Datos

- ${summary.productos.toLocaleString('es-CO')} productos (importación real con \`business.change\` / \`importar\`).
- ${summary.ventas.toLocaleString('es-CO')} ventas: ${SEED.toLocaleString('es-CO')} creadas con \`sale.create\` real${FULL?'':` y ${(SALES-SEED).toLocaleString('es-CO')} replicadas a partir de ellas (ids y fechas nuevos)`}; 1-3 líneas por venta, 60 días, 3 medios de pago.
- Tamaño del estado JSON: **${summary.estadoMB} MB**.
- Tiempo de siembra: importar ${summary.siembraSegundos.importar} s · ventas reales ${summary.siembraSegundos.ventasReales} s · réplica ${summary.siembraSegundos.replicadas} s.

## Resultados

${lines.join('\n')}

## Lectura

- Cada POST clona el estado completo (\`structuredClone\`), por eso el costo de \`sale.create\`
  crece con el número total de ventas de **todas** las empresas, no solo con la venta.
- \`GET /api/v2/data\` envía el negocio completo al navegador; la búsqueda ocurre en el cliente.
- Con SQLite real se añade: \`JSON.parse\` del estado por solicitud y \`JSON.stringify\` +
  \`UPDATE\` por cada escritura (≈ tamaño del estado). Repetir esta medición con el mismo
  script tras la migración a Postgres y comparar p50/p95.
`);
