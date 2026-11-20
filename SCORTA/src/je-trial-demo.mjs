import {estadoVacio} from '../inventory.mjs';
import {dateBogota} from '../platform.mjs';
import {JE_TRIAL_LOGO} from './je-trial-logo.mjs';

// This prepared client account exists only in the browser-local demonstration.
// The owner's production bootstrap and real databases never import this module.
export const JE_TRIAL_MIGRATION='jeTrialV1';
export const JE_TRIAL_PROFILE=Object.freeze({name:'JE Accesorios y Repuestos',contact:'Jhoan Monsalve',username:'joan',whatsapp:'+573205878749',monthlyFee:80000,trialDays:30});
const credential=Object.freeze({"salt":"c2H4hFJY8yWV5ZKjZJwL0g==","digest":"lnIRFkN5fvwrvmdXdaCn1DuY2aSUmmISDoTRCUQ9SNA=","iterations":120000,"algorithm":"PBKDF2-SHA256"});
const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();

/** One-time additive migration. Existing company records are never overwritten. */
export function installJETrial(input,{now=Date.now(),logo=JE_TRIAL_LOGO}={}){
  if(input.demoMigrations?.[JE_TRIAL_MIGRATION])return input;
  const state=structuredClone(input),timestamp=typeof now==='function'?now():now,at=new Date(timestamp).toISOString();
  let company=state.companies.find(item=>normalize(item.name)===normalize(JE_TRIAL_PROFILE.name));
  const existing=!!company;
  if(!company){
    const id=crypto.randomUUID(),startDate=dateBogota(timestamp),endDate=new Date(Date.parse(startDate+'T12:00:00Z')+(JE_TRIAL_PROFILE.trialDays-1)*86400000).toISOString().slice(0,10);
    const base='je-accesorios-y-repuestos';let slug=base;
    while(state.companies.some(item=>normalize(item.slug)===slug||normalize(item.name)===slug))slug=base+'-'+crypto.randomUUID().slice(0,6);
    company={id,name:JE_TRIAL_PROFILE.name,slug,contact:JE_TRIAL_PROFILE.contact,email:'',whatsapp:JE_TRIAL_PROFILE.whatsapp,logo,startDate,endDate,monthlyFee:JE_TRIAL_PROFILE.monthlyFee,enabled:true,createdAt:at};
    state.companies.push(company);
    state.users.push({id:crypto.randomUUID(),companyId:id,username:JE_TRIAL_PROFILE.username,name:JE_TRIAL_PROFILE.contact,email:'',emailVerified:false,role:'admin',active:true,password:structuredClone(credential),passwordChangedAt:at,createdAt:at,version:1});
    state.businesses[id]=estadoVacio();
  }
  state.demoMigrations??={};state.demoMigrations[JE_TRIAL_MIGRATION]={appliedAt:at,companyId:company.id,existing};
  state.revision++;
  const owner=state.users.find(user=>user.role==='owner');
  state.audit??=[];state.audit.unshift({id:crypto.randomUUID(),fecha:at,usuario:owner?.username||'Demo',userId:owner?.id||null,accion:'demo.company.prepare',companyId:company.id,documento:company.id,motivo:existing?'Se conserva la empresa de prueba existente.':'Empresa de prueba solicitada por el propietario; 30 días inclusivos, inventario vacío.'});
  return state;
}
