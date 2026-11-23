import {quickOverviewRange} from '../overview-report.mjs';
import {reportDate} from '../admin-reports.mjs';

export function overviewRankingRows(overview,ranking,limit=10){
 return ranking==='noSales'?(overview?.noSales||[]).slice(0,limit):(overview?.rankings?.[ranking]||[]);
}

export function initialOverviewDates(now){
 const range=quickOverviewRange('month',now);
 return {range,draft:{...range},open:false,error:''};
}
// Input edits are staged: applied financial figures retain their stated period
// until FILTRAR succeeds. LIMPIAR explicitly removes both date limits.
export function overviewDatesReducer(state,action){
 switch(action.type){
  case 'toggle':return {...state,open:!state.open,draft:{...state.range},error:''};
  case 'close':return {...state,open:false,draft:{...state.range},error:''};
  case 'edit':return ['from','to'].includes(action.field)?{...state,draft:{...state.draft,[action.field]:action.value},error:''}:state;
  case 'clear':return {range:{from:'',to:''},draft:{from:'',to:''},open:false,error:''};
  case 'apply':{
   const {from,to}=state.draft;
   if(!from||!to)return {...state,error:'Selecciona las fechas Desde y Hasta.'};
   if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||!reportDate(from)||!reportDate(to))return {...state,error:'Revisa las fechas seleccionadas.'};
   if(from>to)return {...state,error:'Desde debe ser igual o anterior a Hasta.'};
   return {range:{from,to},draft:{from,to},open:false,error:''};
  }
  default:return state;
 }
}
