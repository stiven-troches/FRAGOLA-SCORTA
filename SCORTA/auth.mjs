import {createHash, randomBytes} from 'node:crypto';

const COOKIE = 'scorta_session';
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const json = (res, status, value) => {
  res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'});
  res.end(JSON.stringify(value));
  return null;
};

// Sessions deliberately live only on the server. Restarting closes every session.
export function createAuth({store, production = false, allowLocal = false,
  sessionTtlMs = 8 * 60 * 60 * 1000, now = Date.now}) {
  const sessions = new Map();
  const failures = new Map();
  const cookie = (value, maxAge) => `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${production ? '; Secure' : ''}`;
  const digest = token => createHash('sha256').update(token).digest('hex');
  const clearCookie = res => res.setHeader('Set-Cookie', cookie('', 0));
  const getToken = req => {
    const entry = String(req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE + '='));
    const token = entry?.slice(COOKIE.length + 1);
    return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
  };
  const invalidateUser = username => {
    for (const [key, value] of sessions) if (value.username === username) sessions.delete(key);
  };
  async function readBody(req) {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body) > 8192) throw Error('La solicitud es demasiado grande');
    }
    const value = JSON.parse(body || '{}');
    if (!value || Array.isArray(value) || typeof value !== 'object') throw Error('Datos inválidos');
    return value;
  }
  async function handle(req, res) {
    const timestamp = now();
    for (const [key, value] of sessions) if (value.expires <= timestamp) sessions.delete(key);
    for (const [key, value] of failures) if (value.until <= timestamp) failures.delete(key);
    const path = new URL(req.url, 'http://localhost').pathname;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const protocol = production || req.socket.encrypted ? 'https' : 'http';
      if (req.headers.origin !== `${protocol}://${req.headers.host}`) {
        return json(res, 403, {error: 'Origen no autorizado. Abre SCORTA desde su dirección habitual.'});
      }
      if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
        return json(res, 415, {error: 'La solicitud debe utilizar JSON'});
      }
    }
    const users = store.listUsers();
    const local = !production && allowLocal && !users.length && LOOPBACK.has(req.socket.remoteAddress);
    const token = getToken(req);
    const saved = token ? sessions.get(digest(token)) : null;
    const user = saved && users.find(u => u.username === saved.username && u.active !== 0);
    const actor = local ? {username: 'local', role: 'admin', mode: 'local'}
      : user ? {username: user.username, role: user.role, mode: 'session'} : null;

    if (path === '/api/login' && req.method === 'POST') {
      if (local) return json(res, 400, {error: 'El modo local de pruebas no necesita contraseña.'});
      let body;
      try { body = await readBody(req); } catch { return json(res, 400, {error: 'Datos de acceso inválidos'}); }
      const username = typeof body.username === 'string' ? body.username.trim() : '';
      const password = body.password;
      const key = `${req.socket.remoteAddress}|${username.toLowerCase().slice(0, 60)}`;
      const attempts = failures.get(key);
      if (attempts?.count >= 10) {
        res.setHeader('Retry-After', Math.max(1, Math.ceil((attempts.until - timestamp) / 1000)));
        return json(res, 429, {error: 'Demasiados intentos. Espera unos minutos antes de volver a entrar.'});
      }
      const verified = username.length <= 60 && typeof password === 'string' && password.length <= 200
        ? store.verifyUser(username, password) : null;
      if (!verified) {
        failures.set(key, {count: (attempts?.count || 0) + 1, until: attempts?.until || timestamp + 15 * 60 * 1000});
        return json(res, 401, {error: 'Usuario o contraseña incorrectos'});
      }
      failures.delete(key);
      if (token) sessions.delete(digest(token));
      const nextToken = randomBytes(32).toString('base64url');
      sessions.set(digest(nextToken), {username: verified.username, expires: timestamp + sessionTtlMs});
      res.setHeader('Set-Cookie', cookie(nextToken, Math.floor(sessionTtlMs / 1000)));
      return json(res, 200, {...verified, mode: 'session'});
    }
    if (!actor) {
      if (token) clearCookie(res);
      return json(res, 401, {error: 'Tu sesión terminó. Vuelve a entrar para continuar.'});
    }
    if (path === '/api/session' && req.method === 'GET') return json(res, 200, actor);
    if (path === '/api/logout' && req.method === 'POST') {
      if (token) sessions.delete(digest(token));
      clearCookie(res);
      return json(res, 200, {ok: true});
    }
    if (path === '/api/password' && req.method === 'POST') {
      if (local) return json(res, 400, {error: 'Crea una cuenta antes de cambiar su contraseña.'});
      let body;
      try { body = await readBody(req); } catch { return json(res, 400, {error: 'Datos de contraseña inválidos'}); }
      if (typeof body.currentPassword !== 'string' || body.currentPassword.length > 200 ||
          !store.verifyUser(actor.username, body.currentPassword)) {
        return json(res, 400, {error: 'La contraseña actual no es correcta'});
      }
      if (typeof body.newPassword !== 'string' || body.newPassword.length < 16 || body.newPassword.length > 200) {
        return json(res, 400, {error: 'La nueva contraseña debe tener entre 16 y 200 caracteres'});
      }
      if (body.newPassword === body.currentPassword) return json(res, 400, {error: 'Elige una contraseña diferente a la actual'});
      try { store.setUserPassword(actor.username, body.newPassword); }
      catch { return json(res, 400, {error: 'No se pudo cambiar la contraseña. Revisa los datos.'}); }
      invalidateUser(actor.username);
      clearCookie(res);
      return json(res, 200, {ok: true});
    }
    return actor;
  }
  return {handle, close() { sessions.clear(); failures.clear(); }};
}
