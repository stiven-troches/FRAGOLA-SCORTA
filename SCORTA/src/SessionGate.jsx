import React, {useCallback, useEffect, useRef, useState} from 'react';

async function request(path, data) {
  const response = await fetch(path, {credentials: 'same-origin', cache: 'no-store',
    ...(data === undefined ? {} : {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)})});
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = Error(result.error || 'No se pudo completar la solicitud. Intenta de nuevo.');
    error.status = response.status;
    throw error;
  }
  return result;
}

function PasswordDialog({onClose, onChanged, onExpired}) {
  const box = useRef(null);
  const [form, setForm] = useState({currentPassword: '', newPassword: '', confirmation: ''});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const prior = document.activeElement;
    box.current?.querySelector('input')?.focus();
    return () => prior?.focus();
  }, []);
  const keyDown = event => {
    if (event.key === 'Escape' && !busy) { event.preventDefault(); onClose(); }
    if (event.key !== 'Tab') return;
    const controls = [...box.current.querySelectorAll('input:not(:disabled),button:not(:disabled)')];
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last?.focus();}
    else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first?.focus();}
  };
  const submit = async event => {
    event.preventDefault();
    if (busy) return;
    if (form.newPassword !== form.confirmation) {setError('Las contraseñas nuevas no coinciden.'); return;}
    setBusy(true); setError('');
    try {
      await request('/api/password', {currentPassword: form.currentPassword, newPassword: form.newPassword});
      onChanged();
    } catch (failure) {
      if (failure.status === 401) onExpired();
      else setError(failure.message);
    } finally {setBusy(false);}
  };
  return <div className="session-overlay" style={{position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(15,23,42,.55)', display: 'grid', placeItems: 'center', padding: 20}}>
    <section className="session-card" role="dialog" aria-modal="true" aria-labelledby="password-title" ref={box} onKeyDown={keyDown} style={{maxWidth: 460, width: '100%', maxHeight: '90vh', overflowY: 'auto'}}>
      <h2 id="password-title">Cambiar contraseña</h2>
      <p className="session-help">Al guardar se cerrarán tus sesiones en todos los dispositivos. Luego podrás entrar con tu nueva contraseña.</p>
      <form onSubmit={submit} aria-busy={busy}>
        <label htmlFor="password-current">Contraseña actual</label>
        <input id="password-current" type="password" autoComplete="current-password" value={form.currentPassword} required maxLength={200} disabled={busy} onChange={e => setForm({...form, currentPassword: e.target.value})}/>
        <label htmlFor="password-new">Nueva contraseña</label>
        <input id="password-new" type="password" autoComplete="new-password" value={form.newPassword} required minLength={16} maxLength={200} disabled={busy} aria-describedby="password-help" onChange={e => setForm({...form, newPassword: e.target.value})}/>
        <p id="password-help" className="session-help">Usa entre 16 y 200 caracteres. Puedes utilizar una frase larga.</p>
        <label htmlFor="password-confirmation">Confirmar nueva contraseña</label>
        <input id="password-confirmation" type="password" autoComplete="new-password" value={form.confirmation} required minLength={16} maxLength={200} disabled={busy} onChange={e => setForm({...form, confirmation: e.target.value})}/>
        {error && <p className="session-error" role="alert">{error}</p>}
        <div className="session-actions">
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar contraseña'}</button>
        </div>
      </form>
    </section>
  </div>;
}

export default function SessionGate({children}) {
  const [session, setSession] = useState(null);
  const [mountedSession, setMountedSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const checking = useRef(false);
  const sessionVersion = useRef(0);
  const activeSession = useRef(null);
  const retainedSession = useRef(null);
  const workState = useRef({dirty: false, pending: false, busy: false});
  const hasProtectedWork = () => Object.values(workState.current).some(Boolean);
  const activate = value => {activeSession.current = value; setSession(value);};
  const retain = value => {retainedSession.current = value; setMountedSession(value);};
  const onWorkStateChange = useCallback(value => {
    workState.current = {dirty: !!value.dirty, pending: !!value.pending, busy: !!value.busy};
    if (!Object.values(workState.current).some(Boolean) && !activeSession.current) {
      retainedSession.current = null;
      setMountedSession(null);
    }
  }, []);
  const expire = () => {
    sessionVersion.current++;
    const owner = retainedSession.current;
    activate(null); setPasswordOpen(false); setPassword('');
    if (owner && owner.mode !== 'local' && hasProtectedWork()) {
      setUsername(owner.username);
      setNotice('Tu sesión terminó. Entra con la misma cuenta para recuperar el trabajo conservado y confirmar cualquier operación pendiente.');
    } else {
      retain(null);
      setNotice('Tu sesión terminó. Vuelve a entrar para continuar.');
    }
  };
  const acceptSession = current => {
    const owner = retainedSession.current;
    if (owner && owner.mode !== 'local' && hasProtectedWork() && current.username !== owner.username) {
      expire();
      setError('Hay trabajo conservado de ' + owner.username + '. Entra con esa cuenta para continuar.');
      return false;
    }
    retain(current); activate(current); setError('');
    return true;
  };
  const checkSession = async () => {
    if (checking.current) return;
    checking.current = true;
    const version = sessionVersion.current;
    try {
      const current = await request('/api/session');
      if (version === sessionVersion.current) acceptSession(current);
    } catch (failure) {
      if (version !== sessionVersion.current) return;
      if (failure.status === 401) {
        // Initial unauthenticated loads need no expiry warning.
        if (retainedSession.current) expire();
        else {activate(null); setPasswordOpen(false);}
      } else setError('No se pudo conectar con SCORTA. Comprueba la conexión y vuelve a intentar.');
    } finally {checking.current = false; setLoading(false);}
  };
  useEffect(() => {
    checkSession();
    const timer = setInterval(checkSession, 60_000);
    window.addEventListener('focus', checkSession);
    window.addEventListener('scorta:unauthorized', expire);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', checkSession);
      window.removeEventListener('scorta:unauthorized', expire);
    };
  }, []);
  const login = async event => {
    event.preventDefault();
    if (busy) return;
    sessionVersion.current++;
    setBusy(true); setError(''); setNotice('');
    const owner = retainedSession.current;
    const loginUsername = owner && hasProtectedWork() ? owner.username : username.trim();
    try {
      const current = await request('/api/login', {username: loginUsername, password});
      acceptSession(current); setPassword('');
    } catch (failure) {setError(failure.message);}
    finally {setBusy(false);}
  };
  const logout = async () => {
    if (busy) return;
    if (workState.current.pending || workState.current.busy) {
      setError('Confirma la operación pendiente antes de cerrar sesión.');
      return;
    }
    sessionVersion.current++;
    setBusy(true); setError('');
    try {
      await request('/api/logout', {});
      activate(null); retain(null); setPasswordOpen(false); setPassword('');
      workState.current = {dirty: false, pending: false, busy: false};
      setNotice('Sesión cerrada.');
    } catch (failure) {
      if (failure.status === 401) expire(); else setError(failure.message);
    } finally {setBusy(false);}
  };
  const openPassword = () => {
    if (hasProtectedWork()) {
      setError('Termina o cierra el formulario actual antes de cambiar la contraseña.');
      return;
    }
    setPasswordOpen(true);
  };
  // The keyed container and child keep their React position across reauthentication.
  // Pending operation IDs and draft data remain only in memory, hidden and inert.
  return <>
    <div key={mountedSession ? 'work:' + mountedSession.username : 'empty'} hidden={!session} inert={!session} aria-hidden={!session ? true : undefined}>
      {session && error && <p className="session-error" role="alert">{error}</p>}
      {mountedSession && children({session: mountedSession, sessionActive: !!session,
        onLogout: logout, onPasswordChange: openPassword, onWorkStateChange})}
    </div>
    {!session && <main className="session-gate">
      <section className="session-card" aria-labelledby="session-title">
        <div className="session-brand">FRAGOLA · SCORTA</div>
        <h1 id="session-title">Entrar al almacén</h1>
        <p className="session-help">Inventario, ventas y taller en un solo lugar.</p>
        {loading ? <p role="status">Comprobando sesión…</p> : <form onSubmit={login} aria-busy={busy}>
          <label htmlFor="login-username">Usuario</label>
          <input id="login-username" name="username" autoComplete="username" autoCapitalize="none" spellCheck="false" value={mountedSession ? mountedSession.username : username} readOnly={!!mountedSession} onChange={e => setUsername(e.target.value)} required maxLength={60} disabled={busy}/>
          {mountedSession && <p className="session-help">El trabajo pendiente pertenece a esta cuenta y se conserva mientras esta página permanezca abierta.</p>}
          <label htmlFor="login-password">Contraseña</label>
          <input id="login-password" name="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required maxLength={200} disabled={busy}/>
          {notice && <p role="status">{notice}</p>}
          {error && <p className="session-error" role="alert">{error}</p>}
          <div className="session-actions">
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
            {error && <button className="btn btn-secondary" type="button" disabled={busy} onClick={checkSession}>Reintentar conexión</button>}
          </div>
        </form>}
      </section>
    </main>}
    {session && passwordOpen && <PasswordDialog onClose={() => setPasswordOpen(false)} onExpired={expire} onChanged={() => {
      sessionVersion.current++;
      activate(null); retain(null); setPasswordOpen(false); setPassword(''); setError('');
      setNotice('Contraseña actualizada. Entra con tu nueva contraseña.');
    }}/>}
  </>;
}
