import React,{useState} from 'react';
import {downloadExcel} from './excel.mjs';
export default function ExcelButton({options,name,className='ov-more',children='DESCARGAR EXCEL',disabled=false}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 return <span className="excel-control"><button type="button" className={className} disabled={busy||disabled} onClick={async()=>{if(busy)return;setBusy(true);setError('');try{await downloadExcel(options,name)}catch(failure){setError(failure.message||'No se pudo descargar el Excel.')}finally{setBusy(false)}}}>{busy?'PREPARANDO…':children}</button>{error&&<small className="excel-error" role="alert">{error}</small>}</span>;
}
