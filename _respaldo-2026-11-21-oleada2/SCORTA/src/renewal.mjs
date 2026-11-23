// Módulo puro compartido por la interfaz y el servidor (sin dependencias de Node).
// Fuente única: platform.mjs importa dateBogota, nextMonth y renewalProposal desde aquí.
const stamp=value=>{const n=typeof value==='function'?value():value??Date.now();const d=new Date(n);if(!Number.isFinite(d.getTime()))throw Object.assign(Error('Fecha inválida'),{status:400});return d};
export const dateBogota=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(stamp(now));
export function nextMonth(value){
 const [y,m,d]=value.split('-').map(Number),last=new Date(Date.UTC(y,m+1,0)).getUTCDate();
 return new Date(Date.UTC(y,m,Math.min(d,last))).toISOString().slice(0,10);
}
export function renewalProposal(company,now){const today=dateBogota(now),active=company.endDate>=today;return {startDate:active?company.startDate:today,endDate:nextMonth(active?company.endDate:today),amount:company.monthlyFee};}
