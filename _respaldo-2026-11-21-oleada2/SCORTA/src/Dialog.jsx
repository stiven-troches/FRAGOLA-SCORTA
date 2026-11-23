import React,{useEffect,useId,useRef} from 'react';

// Diálogo accesible único: título enlazado con id único, foco inicial configurable,
// cierre con Escape (solo el diálogo superior), foco atrapado con Tab, devolución
// del foco al cerrar y bloqueo del scroll del documento mientras está abierto.
const stack=[];
let lockCount=0,savedOverflow='';
const FOCUSABLE='button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
function lockScroll(){if(typeof document==='undefined')return;if(lockCount++===0){savedOverflow=document.body.style.overflow;document.body.style.overflow='hidden'}}
function unlockScroll(){if(typeof document==='undefined')return;if(--lockCount<=0){lockCount=0;document.body.style.overflow=savedOverflow}}
const visible=node=>!node.disabled&&!node.closest?.('fieldset[disabled]')&&(node.getClientRects?node.getClientRects().length>0:true);
function focusInitial(panel,initialFocus){
 if(!panel||initialFocus===false)return;
 const target=typeof initialFocus==='string'?panel.querySelector(initialFocus):initialFocus?.current;
 (target||panel.querySelector('input:not([disabled]):not([type=file]):not([type=checkbox]),select:not([disabled]),textarea:not([disabled])')||panel.querySelector('button:not([disabled])')||panel)?.focus?.();
}

export default function Dialog({title,onClose,children,footer,busy=false,initialFocus,closeOnBackdrop=true,className='sp-dialog',backdropClassName='sp-dialog-backdrop',bodyClassName='',closeLabel='Cerrar ventana',closeClassName='sp-icon-button',closeIcon='×',describedBy,wide=false,headingLevel=2}){
 const panel=useRef(null),current=useRef({onClose,busy}),titleId=useId();
 current.current={onClose,busy};
 useEffect(()=>{
  const previous=document.activeElement,token={};stack.push(token);lockScroll();
  const timer=setTimeout(()=>focusInitial(panel.current,initialFocus),0);
  const keydown=event=>{
   if(stack.at(-1)!==token)return;
   if(event.key==='Escape'){event.preventDefault();if(!current.current.busy)current.current.onClose?.();return}
   if(event.key!=='Tab'||!panel.current)return;
   const nodes=[...panel.current.querySelectorAll(FOCUSABLE)].filter(visible);
   if(!nodes.length){event.preventDefault();return}
   if(event.shiftKey&&document.activeElement===nodes[0]){event.preventDefault();nodes.at(-1).focus()}
   else if(!event.shiftKey&&document.activeElement===nodes.at(-1)){event.preventDefault();nodes[0].focus()}
  };
  document.addEventListener('keydown',keydown);
  return()=>{clearTimeout(timer);document.removeEventListener('keydown',keydown);const index=stack.indexOf(token);if(index>=0)stack.splice(index,1);unlockScroll();if(previous?.isConnected!==false)previous?.focus?.()};
 },[]);
 const Heading=`h${headingLevel}`;
 return <div className={backdropClassName} onMouseDown={event=>{if(closeOnBackdrop&&event.target===event.currentTarget&&!current.current.busy)current.current.onClose?.()}}>
  <section ref={panel} className={`${className}${wide?' is-wide':''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={describedBy} aria-busy={busy||undefined} tabIndex={-1}>
   <header><Heading id={titleId}>{title}</Heading><button type="button" className={closeClassName} aria-label={closeLabel} onClick={()=>current.current.onClose?.()} disabled={busy}>{closeIcon}</button></header>
   {bodyClassName?<div className={bodyClassName}>{children}</div>:children}
   {footer&&<footer>{footer}</footer>}
  </section>
 </div>;
}
