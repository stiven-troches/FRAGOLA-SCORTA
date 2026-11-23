import {useState} from 'react';
import {parseMoneyInput,formatMoneyInput} from './format.mjs';

// Campo de dinero en COP. Reemplaza <input type="number" step="0.01">, que leía «12.000» como 12.
// Acepta el separador de miles colombiano, muestra el valor agrupado al salir del campo y entrega
// al formulario el número en texto plano ('12000', '12000.5'), igual que antes: los llamadores no cambian.
const INVALID='Escribe el valor en pesos, por ejemplo 12.000 o 12.000,50.';

export default function MoneyInput({value,onChange,onFocus,onBlur,max,min,...props}){
 const [draft,setDraft]=useState(null);
 const check=(input,parsed,text)=>{
  if(!input?.setCustomValidity)return;
  const limit=max==null?null:Number(max);
  input.setCustomValidity(parsed===null&&text.trim()?INVALID:limit!=null&&parsed!==''&&parsed!==null&&Number(parsed)>limit?`El valor máximo es ${formatMoneyInput(limit)}.`:'');
 };
 return <input {...props} type="text" inputMode="decimal" autoComplete="off" value={draft??formatMoneyInput(value)}
  onFocus={event=>{setDraft(formatMoneyInput(value));onFocus?.(event)}}
  onBlur={event=>{setDraft(null);onBlur?.(event)}}
  onChange={event=>{
   const text=event.target.value,parsed=parseMoneyInput(text);
   setDraft(text);check(event.target,parsed,text);
   onChange?.({target:{value:parsed??text},currentTarget:event.currentTarget});
  }}/>;
}
