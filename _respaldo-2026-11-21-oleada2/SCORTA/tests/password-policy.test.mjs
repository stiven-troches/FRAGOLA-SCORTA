import {test} from 'node:test';
import assert from 'node:assert/strict';
import {passwordPolicyError,PASSWORD_PATTERN} from '../password-policy.mjs';
import {createPlatform,platformRequest} from '../platform.mjs';

test('clave nueva: mínimo 8, máximo 200 y las cuatro categorías; el patrón del formulario coincide',()=>{
 const samples=[['Aa1!bcde',true],['Áñ1!bcde',true],['Aa1!'+ 'b'.repeat(196),true],['Aa1!bcd',false],['Aa1!'+ 'b'.repeat(197),false],['1234567890',false],['aa1!bcde',false],['AA1!BCDE',false],['Aa!!bcde',false],['Aa12bcde',false],['Aa1 bcde',false],['',false],[null,false]];
 const pattern=new RegExp('^(?:'+PASSWORD_PATTERN+')$','v');
 for(const [value,valid]of samples){assert.equal(passwordPolicyError(value)==='',valid,String(value));if(typeof value==='string')assert.equal(pattern.test(value),valid,value)}
});

test('creación, restablecimiento y cambio aceptan ocho caracteres completos y rechazan claves incompletas',async()=>{
 const owner={company:'Fragola',username:'owner',password:'Aa1!bcde'};
 let state=await createPlatform({owner}),token;
 const call=async(path,body)=>{const r=await platformRequest(state,{path,method:'POST',body,token});state=r.state;if(Object.hasOwn(r,'token'))token=r.token;return r};
 assert.equal((await call('/api/v2/login',owner)).status,200);
 const company={name:'Empresa clave corta',startDate:'2026-01-01',endDate:'2030-12-31',username:'admin',password:'1234567890'};
 let r=await call('/api/v2/action',{type:'company.create',form:company});assert.equal(r.status,400);assert.equal(r.body.code,'INVALID_PASSWORD');assert.equal(state.companies.length,0);
 r=await call('/api/v2/action',{type:'company.create',form:{...company,password:'Bb2@cdef'}});assert.equal(r.status,200,r.body.error);
 const id=r.body.users[0].id;
 assert.equal((await call('/api/v2/action',{type:'user.reset',userId:id,form:{password:'abcdefgh'}})).status,400);
 assert.equal((await call('/api/v2/action',{type:'user.reset',userId:id,form:{password:'Cc3#defg'}})).status,200);
 assert.equal((await call('/api/v2/login',{company:company.name,username:'admin',password:'Cc3#defg'})).status,200);
 assert.equal((await call('/api/v2/password',{currentPassword:'Cc3#defg',newPassword:'1234567890'})).status,400);
 assert.equal((await call('/api/v2/password',{currentPassword:'Cc3#defg',newPassword:'Dd4$efgh'})).status,200);
 assert.equal((await call('/api/v2/login',{company:company.name,username:'admin',password:'Dd4$efgh'})).status,200);
});

test('el acceso a hashes anteriores no exige retroactivamente la nueva composición',async()=>{
 const state=await createPlatform({owner:{company:'Fragola',username:'owner',password:'Aa1!bcde'}}),old='LegacyPassword123456';
 const salt=crypto.getRandomValues(new Uint8Array(16)),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(old),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:120000,hash:'SHA-256'},key,256);
 const base64=x=>btoa(String.fromCharCode(...new Uint8Array(x)));
 state.users[0].password={salt:base64(salt),digest:base64(bits),iterations:120000,algorithm:'PBKDF2-SHA256'};
 assert.ok(passwordPolicyError(old));
 const r=await platformRequest(state,{method:'POST',path:'/api/v2/login',body:{company:'Fragola',username:'owner',password:old}});
 assert.equal(r.status,200,r.body.error);
});
