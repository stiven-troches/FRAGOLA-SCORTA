import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SaleDraftSync,draftRequest} from '../src/sale-draft-client.mjs';
import {readDraft,writeDraft} from '../sale-drafts.mjs';

const validDraft=()=>({cart:[],labor:[],laborDraft:{descripcion:'Trabajo',mecanico:'Prueba',importe:'1000'},saleForm:{cliente:'Cliente',telefono:'',placa:'ABC12D',fecha:'2026-11-20',paymentMethod:'efectivo'},pendingSale:null});
function fixture(){
  const state={},actor={companyId:'company',id:'user'},writes=[];
  const sync=new SaleDraftSync({request:async(method,body)=>{if(!method)return readDraft(state,actor);writes.push(structuredClone(body));return writeDraft(state,actor,body)}});
  return {sync,writes,remote:()=>readDraft(state,actor)};
}
test('a definitive validation rejection permits correcting and saving without losing current edits',async()=>{
  const f=fixture();try{
    await f.sync.load();const invalid=validDraft();invalid.laborDraft.importe='1'.repeat(31);f.sync.update(invalid);
    await assert.rejects(f.sync.flush(),error=>error.status===400&&error.code==='INVALID_DRAFT');
    assert.equal(f.sync.status,'error');assert.equal(f.sync.attempt,null);assert.equal(f.sync.unsaved,true);
    const corrected=validDraft();corrected.saleForm.cliente='Edición conservada';f.sync.update(corrected);await f.sync.flush();
    assert.notEqual(f.writes[0].writeId,f.writes[1].writeId);assert.equal(f.writes[1].version,0);
    assert.deepEqual(f.remote().draft,corrected);assert.equal(f.sync.unsaved,false);
  }finally{f.sync.dispose();}
});
test('a validation rejection also permits clearing a previously saved draft',async()=>{
  const f=fixture();try{
    await f.sync.load();f.sync.update(validDraft());await f.sync.flush();
    const invalid=validDraft();invalid.laborDraft.importe='1'.repeat(31);f.sync.update(invalid);await assert.rejects(f.sync.flush());
    f.sync.update(null);await f.sync.flush();assert.equal(f.remote().draft,null);assert.equal(f.remote().version,2);assert.equal(f.sync.unsaved,false);
  }finally{f.sync.dispose();}
});
test('edits made while a rejected request is in flight are retained for the next save',async()=>{
  let release,started;const gate=new Promise(resolve=>{release=resolve}),sent=new Promise(resolve=>{started=resolve});let count=0;
  const sync=new SaleDraftSync({request:async(method,body)=>{if(!method)return {version:0,draft:null};if(++count===1){started();await gate;throw Object.assign(Error('Invalid'),{status:400,code:'INVALID_DRAFT'})}return {version:1,draft:body.draft}}});
  try{await sync.load();sync.update({value:'invalid'});const failed=sync.flush();await sent;sync.update({value:'corrected'});release();await assert.rejects(failed);await sync.flush();assert.equal(sync.saved,JSON.stringify({value:'corrected'}));assert.equal(count,2);}finally{sync.dispose();}
});
test('the draft HTTP client fixes company context on reads and writes',async t=>{
  const calls=[];t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push({url,...options});return new Response(JSON.stringify({version:0,draft:null}),{status:200,headers:{'Content-Type':'application/json'}})});
  await draftRequest('GET',undefined,'fixed-company');await draftRequest('POST',{version:0,draft:null,writeId:'id'},'fixed-company');
  assert.equal(calls[0].headers['X-SCORTA-Company'],'fixed-company');assert.equal(calls[1].headers['X-SCORTA-Company'],'fixed-company');assert.equal(calls[1].headers['Content-Type'],'application/json');
});
test('pending sale round trips its original revision, including zero, and accepts old drafts without one',()=>{
  for(const revision of [undefined,0,42]){
    const state={},actor={companyId:'company',id:'user'},draft=validDraft();
    draft.pendingSale={type:'sale.create',requestId:'sale-id',draftRequestId:'sale-id',...(revision===undefined?{}:{revision}),form:structuredClone(draft.saleForm),items:[],labor:[]};
    const body={version:0,draft,writeId:'save-id'};const saved=writeDraft(state,actor,body);
    assert.deepEqual(readDraft(state,actor).draft.pendingSale,draft.pendingSale);
    assert.deepEqual(writeDraft(state,actor,body),saved,'A replay keeps the persisted operation, including its original revision');
  }
});
test('pending sale rejects negative, string and noninteger revisions without changing its saved version',()=>{
  const state={},actor={companyId:'company',id:'user'};
  for(const revision of [-1,'42',1.5,null,Number.MAX_SAFE_INTEGER+1]){
    const draft=validDraft();draft.pendingSale={type:'sale.create',requestId:'sale-id',draftRequestId:'sale-id',revision,form:structuredClone(draft.saleForm),items:[],labor:[]};
    assert.throws(()=>writeDraft(state,actor,{version:0,draft,writeId:'save-id'}),error=>error.status===400&&error.code==='INVALID_DRAFT'&&/revisión/.test(error.message));
    assert.deepEqual(readDraft(state,actor),{version:0,draft:null});
  }
});
