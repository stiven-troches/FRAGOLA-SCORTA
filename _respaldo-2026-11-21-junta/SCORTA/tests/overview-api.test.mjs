import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPlatformDemoSeed,DEMO_ACCOUNTS} from '../src/platform-demo.mjs';
import {platformRequest} from '../platform.mjs';
import {overviewReport} from '../overview-report.mjs';

const now='2026-11-20T15:00:00.000Z';
async function fixture(){
 let state=await createPlatformDemoSeed({now:Date.parse(now)}),token;
 const request=async(method,path,body,clock=now)=>{const r=await platformRequest(state,{method,path,body,token},{now:clock});state=r.state;if(Object.hasOwn(r,'token'))token=r.token;return r};
 const login=async role=>{const r=await request('POST','/api/v2/login',DEMO_ACCOUNTS[role]);assert.equal(r.status,200,r.body.error);return r.body};
 return {request,login,getState:()=>state};
}

test('resumen API: administrador consulta solo su empresa y no modifica datos',async()=>{
 const f=await fixture(),data=await f.login('admin'),before=f.getState();
 const other=before.companies.find(company=>company.id!==data.session.companyId);
 const result=await f.request('GET','/api/v2/overview?from=2026-11-01&to=2026-11-30&companyId='+other.id);
 assert.equal(result.status,200,result.body.error);
 assert.deepEqual(result.body.report,overviewReport(before.businesses[data.session.companyId],{from:'2026-11-01',to:'2026-11-30'}));
 assert.equal(result.state,before,'La consulta es de solo lectura');
 const serialized=JSON.stringify(result.body);for(const field of ['"digest"','"salt"','"sessions"','"receiptToken"'])assert.ok(!serialized.includes(field));
});

test('resumen API: exige sesión y administrador; valida rango de fechas',async()=>{
 const f=await fixture();assert.equal((await f.request('GET','/api/v2/overview')).status,401);
 await f.login('vendedor');assert.equal((await f.request('GET','/api/v2/overview')).status,403);
 await f.login('owner');assert.equal((await f.request('GET','/api/v2/overview')).status,403,'El propietario debe entrar al negocio como soporte');
 await f.login('admin');
 for(const query of ['from=2026-11-31','from=2026-11-21&to=2026-11-20','to=incorrecto'])assert.equal((await f.request('GET','/api/v2/overview?'+query)).status,400);
});

test('resumen API: fecha predeterminada usa Bogotá y conserva reportes existentes',async()=>{
 const f=await fixture();await f.login('admin');
 let result=await f.request('GET','/api/v2/overview',undefined,'2026-11-20T04:59:59.000Z');
 assert.equal(result.status,200,result.body.error);assert.equal(result.body.from,'2026-11-19');assert.equal(result.body.to,'2026-11-19');
 result=await f.request('GET','/api/v2/reports?from=2026-11-20&to=2026-11-20');
 assert.equal(result.status,200);assert.equal(result.body.report.kind,'sales');
});
