import {cashExpected,salesReport} from './admin-reports.mjs';

const fail=(message,status=400,code='INVALID_ADMIN_OPERATION')=>{throw Object.assign(Error(message),{status,code})};
const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const name=value=>{if(typeof value!=='string'||!value.trim()||value.length>100)fail('Escribe el nombre del mecánico (hasta 100 caracteres).');return value.trim()};
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const amount=(value,label)=>{if(value==null||value===''||!['string','number'].includes(typeof value)||!Number.isFinite(Number(value))||Number(value)<0||Number(value)>1e12)fail(`${label}: indica un importe entre 0 y 1.000.000.000.000.`);return Number(value)};
const methods=['efectivo','transferencia','tarjeta'];
const rounded=value=>Math.round((Number(value)+Number.EPSILON)*100)/100;

/** Public selector data never includes inactive staff or administrative metadata. */
export function activeMechanics(business){return (business.mechanics||[]).filter(item=>item.active!==false).map(({id,name})=>({id,name}))}

/** A sale keeps the mechanic's historical display name even after catalog edits. */
export function mechanicForLabor(business,line){
  if(!Object.hasOwn(line||{},'mecanicoId')||line.mecanicoId==null||line.mecanicoId==='')return null;
  if(typeof line.mecanicoId!=='string'||line.mecanicoId.length>100)fail('Selecciona un mecánico válido.');
  const selected=(business.mechanics||[]).find(item=>item.id===line.mecanicoId&&item.active!==false);
  if(!selected)fail('El mecánico seleccionado no está activo o no pertenece a esta empresa.',400,'INVALID_MECHANIC');
  return {mecanicoId:selected.id,mecanico:selected.name};
}

export function applyAdminControl(business,actor,action,{now,today}){
  if(!actor.companyId||!['admin','owner'].includes(actor.role))fail('Esta operación requiere un administrador de la empresa.',403,'FORBIDDEN');
  const form=action.form||{},at=new Date(now).toISOString();
  if(action.type.startsWith('mechanic.')){
    const records=business.mechanics||[];
    if(action.type==='mechanic.create'){
      const nextName=name(form.name);
      if(records.some(item=>normalize(item.name)===normalize(nextName)))fail('Ya existe un mecánico con ese nombre. Puedes editarlo o volver a activarlo.');
      const record={id:crypto.randomUUID(),name:nextName,active:true,createdAt:at,updatedAt:at};
      business.mechanics=[...records,record];business.revision++;
      return {id:record.id,before:null,after:structuredClone(record)};
    }
    const record=records.find(item=>item.id===action.id);if(!record)fail('Mecánico inexistente.',404,'MECHANIC_NOT_FOUND');
    const before=structuredClone(record);
    if(action.type==='mechanic.update'){
      const nextName=Object.hasOwn(form,'name')?name(form.name):record.name;
      const active=Object.hasOwn(form,'active')?form.active:record.active!==false;
      if(typeof active!=='boolean')fail('Indica si el mecánico está activo.');
      if(records.some(item=>item.id!==record.id&&normalize(item.name)===normalize(nextName)))fail('Ya existe otro mecánico con ese nombre.');
      Object.assign(record,{name:nextName,active,updatedAt:at});
    }else if(action.type==='mechanic.archive')Object.assign(record,{active:false,updatedAt:at});
    else fail('Operación de mecánicos desconocida.',404,'NOT_FOUND');
    business.revision++;
    return {id:record.id,before,after:structuredClone(record)};
  }
  if(action.type==='cash.close'){
    if(!validDate(form.date)||form.date>today)fail('Selecciona una fecha válida, de hoy o anterior.');
    const records=business.cashClosures||[];
    if(records.some(item=>item.date===form.date))fail('Esta fecha ya tiene un cierre registrado. Puedes consultar su comprobación, pero no sobrescribirlo.',409,'CASH_ALREADY_CLOSED');
    if(!form.actual||typeof form.actual!=='object'||Array.isArray(form.actual))fail('Registra lo recibido por cada medio de pago.');
    const actual=Object.fromEntries(methods.map(method=>[method,amount(form.actual[method],method)]));
    if(form.note!=null&&(typeof form.note!=='string'||form.note.length>1000))fail('La observación puede tener hasta 1000 caracteres.');
    const report=salesReport(business,{from:form.date,to:form.date});
    if(Number(report.unknownPaymentCount||report.totals?.unknownPaymentCount||0)>0)fail('Hay ventas sin un medio de pago definido. Revisa el reporte antes de cerrar esta fecha.',400,'UNKNOWN_PAYMENT_METHOD');
    const expected=cashExpected(business,form.date);
    for(const method of methods)if(!Number.isFinite(expected[method]))fail('No se pudo calcular el importe esperado. Revisa el reporte.');
    const differences=Object.fromEntries(methods.map(method=>[method,rounded(actual[method]-expected[method])]));
    const sum=object=>rounded(methods.reduce((total,method)=>total+Number(object[method]||0),0));
    const summary=Object.fromEntries(['gross','returns','cancellations','net','products','labor','productMargin'].filter(key=>typeof report.totals?.[key]==='number').map(key=>[key,report.totals[key]]));
    const record={id:crypto.randomUUID(),date:form.date,createdAt:at,userId:actor.id,username:actor.username,name:actor.name||actor.username,
      expected:structuredClone(expected),actual,differences,totals:{expected:sum(expected),actual:sum(actual),difference:sum(differences)},
      note:(form.note||'').trim(),businessRevision:business.revision,summary};
    business.cashClosures=[record,...records];business.revision++;
    return {id:record.id,before:null,after:structuredClone(record)};
  }
  fail('Operación administrativa desconocida.',404,'NOT_FOUND');
}

export function reportDates(from,to,today){
  const start=from||today,end=to||today;
  if(!validDate(start)||!validDate(end)||start>end)fail('Selecciona un rango de fechas válido.');
  return {from:start,to:end};
}
