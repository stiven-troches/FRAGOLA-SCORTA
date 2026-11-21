import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPlatform, platformRequest, renewalProposal} from '../platform.mjs';

// Entirely fictitious accounts; these requests do not contact any outside service.
const OWNER_PASSWORD='Review2.Owner.Fixture.2026';
const USER_PASSWORD='Review2.Admin.Fixture.2026';
const start='2026-11-15T15:00:00.000Z';
async function fixture(){
  let state=await createPlatform({owner:{company:'Fragola',username:'Steven',password:OWNER_PASSWORD}});
  const tokens=new Map();let now=start;
  const request=async(actor,path='/api/v2/data',body)=>{
    const result=await platformRequest(state,{method:body===undefined?'GET':'POST',path,body,token:tokens.get(actor)},{now,baseUrl:'https://scorta.example'});
    state=result.state;
    if(Object.hasOwn(result,'token'))result.token?tokens.set(actor,result.token):tokens.delete(actor);
    return result;
  };
  const ok=response=>{assert.equal(response.status,200,JSON.stringify(response.body));return response.body;};
  const act=async(action)=>ok(await request('owner','/api/v2/action',{requestId:crypto.randomUUID(),...action}));
  ok(await request('owner','/api/v2/login',{company:'Fragola',username:'Steven',password:OWNER_PASSWORD}));
  const created=await act({type:'company.create',form:{name:'Empresa revisión dos',contact:'Contacto de prueba',email:'fixture@example.com',whatsapp:'+573001234567',startDate:'2026-11-01',endDate:'2026-11-19',monthlyFee:90000,username:'admin',password:USER_PASSWORD}});
  const company=created.companies[0];
  const login=async(actor='admin',password=USER_PASSWORD)=>ok(await request(actor,'/api/v2/login',{company:company.slug,username:'admin',password}));
  await login();
  return {request,act,ok,company,login,setNow:value=>{now=value;},get state(){return state;}};
}

test('revisión2: recordar sesión no permite operar vencido; pago tardío reactiva esa sesión y respeta el bloqueo manual',async()=>{
  const f=await fixture();
  f.setNow('2026-11-20T05:00:00.000Z');
  const expired=await f.request('admin');assert.equal(expired.status,403);assert.equal(expired.body.code,'CONTRACT_EXPIRED');assert.ok(!expired.body.state);
  f.setNow('2026-11-25T15:00:00.000Z');
  // The owner's session lasts 12 hours, so the owner signs in again days later.
  assert.equal((await f.request('owner')).status,401);
  f.ok(await f.request('owner','/api/v2/login',{company:'Fragola',username:'Steven',password:OWNER_PASSWORD}));
  const proposal=renewalProposal(f.company,'2026-11-25T15:00:00.000Z');
  assert.equal(proposal.startDate,'2026-11-25');assert.equal(proposal.endDate,'2026-12-25');
  await f.act({type:'company.renew',companyId:f.company.id,form:{...proposal,date:'2026-11-25'}});
  const resumed=f.ok(await f.request('admin'));assert.equal(resumed.session.role,'admin');assert.equal(resumed.session.company.endDate,'2026-12-25');
  await f.act({type:'company.access',companyId:f.company.id,form:{enabled:false}});
  const disabled=await f.request('admin');assert.equal(disabled.status,403);assert.equal(disabled.body.code,'COMPANY_DISABLED');
  await f.act({type:'company.renew',companyId:f.company.id,form:{endDate:'2027-01-25',amount:90000,date:'2026-11-25'}});
  assert.equal((await f.request('admin')).body.code,'COMPANY_DISABLED');
  await f.act({type:'company.access',companyId:f.company.id,form:{enabled:true}});
  assert.equal((await f.request('admin')).status,200);
});

test('revisión2: renovación del 15 conserva corte del 19, y una sesión recordada se revoca por usuario o contraseña',async()=>{
  const f=await fixture();
  const proposal=renewalProposal(f.company,start);assert.equal(proposal.endDate,'2026-12-19');
  const updated=await f.act({type:'company.renew',companyId:f.company.id,form:{...proposal,date:'2026-11-15'}});
  assert.equal(updated.companies[0].endDate,'2026-12-19');
  await f.act({type:'user.create',companyId:f.company.id,form:{username:'admin2',name:'Segunda administradora',role:'admin',password:'Review2.Second.Admin.2026'}});
  const users=f.ok(await f.request('owner')).users;
  const admin=users.find(user=>user.companyId===f.company.id&&user.username==='admin');
  await f.act({type:'user.update',userId:admin.id,form:{active:false}});
  assert.equal((await f.request('admin')).status,401);
  await f.act({type:'user.update',userId:admin.id,form:{active:true}});
  assert.equal((await f.request('admin')).status,401,'Rehabilitar la cuenta no resucita la sesión revocada');
  await f.login();
  const newPassword='Review2.Reset.Only.2026';
  await f.act({type:'user.reset',userId:admin.id,form:{password:newPassword}});
  assert.equal((await f.request('admin')).status,401);
  const active=f.ok(await f.request('admin','/api/v2/login',{company:f.company.slug,username:'admin',password:newPassword}));
  assert.equal(active.session.companyId,f.company.id);
  const publicText=JSON.stringify(active);
  for(const forbidden of [USER_PASSWORD,newPassword,'"digest"','"salt"','"sessions"'])assert.ok(!publicText.includes(forbidden));
});
