import {PASSWORD_MIN_LENGTH,PASSWORD_PATTERN,PASSWORD_HELP} from '../password-policy.mjs';
import React,{useEffect,useState} from 'react';
import Dialog from './Dialog.jsx';
import Brand from './Brand.jsx';
import {MAIL_DISABLED_MESSAGE,RECOVERY_REQUESTED_MESSAGE,RESET_PATH,resetTokenFromHash,recoveryRequest} from './recovery.mjs';

// SEG-13: solicitud del enlace de recuperación. La respuesta es siempre la misma para no
// revelar si la cuenta existe. `initialStatus` permite renderizar sin red (pruebas SSR).
export default function RecoveryDialog({initialCompany='',onClose,initialStatus=null,request=recoveryRequest}){
 const[status,setStatus]=useState(initialStatus),[company,setCompany]=useState(initialCompany),[username,setUsername]=useState(''),[sent,setSent]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{if(status)return;let active=true;request('/api/v2/password/status').then(r=>{if(active)setStatus(r.ok?r.body:{emailRecovery:false,message:r.body.error||MAIL_DISABLED_MESSAGE,offline:r.status===0})});return()=>{active=false}},[]);
 const submit=async e=>{e.preventDefault();if(busy)return;setBusy(true);setError('');const r=await request('/api/v2/password/forgot',{company:company.trim(),username:username.trim()});setBusy(false);if(r.ok)setSent(r.body.message||RECOVERY_REQUESTED_MESSAGE);else setError(r.body.error||'No se pudo enviar la solicitud. Inténtalo de nuevo.')};
 return <Dialog title="Recuperar contraseña" onClose={onClose} busy={busy} className="sp-dialog sp-recovery" closeLabel="Cerrar recuperación" bodyClassName="sp-profile-data">
  {!status&&<p role="status">Comprobando el servicio de correo…</p>}
  {status&&!status.emailRecovery&&<><p className="sp-notice" role="status">{status.offline?status.message:MAIL_DISABLED_MESSAGE}</p><p className="sp-muted">El administrador de tu empresa (o el propietario de SCORTA, si eres administrador) puede asignarte una contraseña temporal desde Usuarios.</p><button type="button" className="sp-primary sp-wide" onClick={onClose}>Volver al ingreso</button></>}
  {status?.emailRecovery&&!sent&&<form onSubmit={submit}><p>Te enviaremos un enlace al <strong>correo verificado</strong> de tu cuenta. Vence en 30 minutos y se puede usar una sola vez.</p><label className="sp-field">Empresa<input value={company} onChange={e=>setCompany(e.target.value)} maxLength={120} autoComplete="organization" required/></label><label className="sp-field">Usuario<input value={username} onChange={e=>setUsername(e.target.value)} maxLength={60} autoComplete="username" required/></label>{error&&<p className="sp-error" role="alert">{error}</p>}<button className="sp-primary sp-wide" disabled={busy}>{busy?'Enviando…':'Enviar enlace'}</button><p className="sp-muted">Si no tienes un correo verificado, pide a tu administrador que restablezca tu contraseña.</p></form>}
  {sent&&<><h3>Revisa tu correo</h3><p role="status">{sent}</p><button type="button" className="sp-primary sp-wide" onClick={onClose}>Volver al ingreso</button></>}
 </Dialog>;
}

function NewPassword({id,label,value,onChange}){const[show,setShow]=useState(false);return <label className="sp-field" htmlFor={id}>{label}<span className="sp-password"><input id={id} type={show?'text':'password'} value={value} onChange={e=>onChange(e.target.value)} autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} pattern={PASSWORD_PATTERN} title={PASSWORD_HELP} maxLength={200} required/><button type="button" aria-label={show?'Ocultar contraseña':'Mostrar contraseña'} onClick={()=>setShow(!show)}>{show?'Ocultar':'Ver'}</button></span></label>}

// Pantalla /recuperar#<token>: el token sale de la barra de direcciones al abrirla.
export function ResetPasswordScreen({initialToken,request=recoveryRequest}){
 const[token]=useState(()=>initialToken!==undefined?initialToken:resetTokenFromHash(typeof location==='undefined'?'':location.hash));
 const[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(null);
 useEffect(()=>{try{if(location.hash)history.replaceState(null,'',RESET_PATH)}catch{}},[]);
 const submit=async e=>{e.preventDefault();if(busy)return;setError('');if(password!==confirmation){setError('Las contraseñas no coinciden.');return}setBusy(true);const r=await request('/api/v2/password/reset',{token,newPassword:password});setBusy(false);if(r.ok){setPassword('');setConfirmation('');setDone(r.body)}else setError(r.body.error||'No se pudo cambiar la contraseña.')};
 const login=()=>{location.href=done?.company?'/?empresa='+encodeURIComponent(done.company):'/'};
 return <main className="sp-login"><section className="sp-login-card"><Brand/>
  {!token&&!done&&<><div className="sp-login-heading"><h1>Enlace no válido</h1><p>Recuperar contraseña</p></div><p role="alert">El enlace está incompleto o ya se usó. Solicita uno nuevo desde «¿Olvidaste tu contraseña?».</p><a className="sp-primary sp-wide" href="/">Ir al ingreso</a></>}
  {token&&!done&&<form onSubmit={submit}><div className="sp-login-heading"><h1>Crea una nueva contraseña</h1><p>El enlace sirve una sola vez</p></div><NewPassword id="reset-new" label="Nueva contraseña" value={password} onChange={setPassword}/><small>{PASSWORD_HELP} Al guardarla se cerrarán todas tus sesiones abiertas.</small><NewPassword id="reset-confirm" label="Confirmar nueva contraseña" value={confirmation} onChange={setConfirmation}/>{error&&<p className="sp-error" role="alert">{error}</p>}<button className="sp-primary sp-wide" disabled={busy}>{busy?'Guardando…':'Guardar contraseña'}</button><a className="sp-login-link" href="/">Volver al ingreso</a></form>}
  {done&&<><div className="sp-login-heading"><h1>Contraseña actualizada</h1><p>{[done.company,done.username].filter(Boolean).join(' · ')}</p></div><p role="status">{done.message||'Ingresa con tu nueva contraseña.'}</p><button type="button" className="sp-primary sp-wide" onClick={login}>Ir al ingreso</button></>}
 </section><footer>SCORTA · Gestión de inventario</footer></main>;
}
