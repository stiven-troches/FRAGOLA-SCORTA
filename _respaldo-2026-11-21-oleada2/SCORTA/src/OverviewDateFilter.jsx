import React,{useEffect,useId,useRef} from 'react';
import {overviewDatesReducer} from './overview-filters.mjs';

export default function OverviewDateFilter({state,dispatch}){
 const id=useId(),root=useRef(null),trigger=useRef(null),first=useRef(null);
 useEffect(()=>{if(state.open)first.current?.focus()},[state.open]);
 useEffect(()=>{
  if(!state.open)return;
  const outside=event=>{if(!root.current?.contains(event.target))dispatch({type:'close'})};
  const escape=event=>{if(event.key==='Escape'){event.preventDefault();dispatch({type:'close'});trigger.current?.focus()}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)};
 },[state.open,dispatch]);
 const apply=event=>{event.preventDefault();const next=overviewDatesReducer(state,{type:'apply'});dispatch({type:'apply'});if(!next.error)trigger.current?.focus()};
 return <div className="ov-date-filter" ref={root}>
  <button ref={trigger} type="button" className="ov-date-trigger" aria-expanded={state.open} aria-controls={id} aria-haspopup="dialog" onClick={()=>dispatch({type:'toggle'})}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 11h18"/></svg>FECHA<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
  {state.open&&<div id={id} className="ov-date-popup" role="dialog" aria-label="Filtro de fecha por rango"><form noValidate onSubmit={apply}>
   <label htmlFor={id+'-from'}>DESDE<input ref={first} id={id+'-from'} type="date" required value={state.draft.from} aria-describedby={state.error?id+'-error':undefined} onChange={event=>dispatch({type:'edit',field:'from',value:event.target.value})}/></label>
   <label htmlFor={id+'-to'}>HASTA<input id={id+'-to'} type="date" required value={state.draft.to} aria-describedby={state.error?id+'-error':undefined} onChange={event=>dispatch({type:'edit',field:'to',value:event.target.value})}/></label>
   {state.error&&<p id={id+'-error'} className="ov-date-error" role="alert">{state.error}</p>}
   <div className="ov-date-actions"><button type="submit">FILTRAR</button><button type="button" onClick={()=>{dispatch({type:'clear'});trigger.current?.focus()}}>LIMPIAR</button></div>
  </form></div>}
 </div>;
}
