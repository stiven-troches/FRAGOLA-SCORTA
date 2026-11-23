import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createAuth} from '../auth.mjs';

const password = 'Una frase de prueba segura';
function fixture(options = {}) {
  let timestamp = 100_000;
  const users = options.users ?? [{username: 'admin', role: 'admin', active: 1, password}];
  const store = {
    listUsers: () => users.map(({password: _secret, ...user}) => user),
    verifyUser: (username, secret) => {
      const user = users.find(u => u.username === username && u.password === secret && u.active);
      return user ? {username: user.username, role: user.role} : null;
    },
    setUserPassword: (username, secret) => {users.find(u => u.username === username).password = secret;},
  };
  const auth = createAuth({store, now: () => timestamp, sessionTtlMs: 1000, ...options});
  const call = async (path, {body, cookie, origin = 'http://scorta.test', address = '127.0.0.1', type = 'application/json', method = body === undefined ? 'GET' : 'POST'} = {}) => {
    const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
    req.url = path; req.method = method; req.socket = {remoteAddress: address};
    req.headers = {host: 'scorta.test', origin, 'content-type': type, cookie};
    const res = {headers: {}, status: 200, setHeader(name, value) {this.headers[name.toLowerCase()] = value;},
      writeHead(status, headers) {this.status = status; for (const [name, value] of Object.entries(headers)) this.setHeader(name, value);},
      end(body) {this.body = JSON.parse(body);}};
    const actor = await auth.handle(req, res);
    return {...res, actor, cookie: res.headers['set-cookie']?.split(';')[0]};
  };
  const login = async () => call('/api/login', {body: {username: 'admin', password}, ...(options.production ? {origin: 'https://scorta.test'} : {})});
  return {auth, call, login, users, advance: milliseconds => {timestamp += milliseconds;}};
}

test('una sesión expira en el servidor y no permite reutilizar su cookie', async () => {
  const f = fixture(), signedIn = await f.login();
  assert.equal(signedIn.status, 200);
  assert.equal((await f.call('/api/state', {cookie: signedIn.cookie})).actor.username, 'admin');
  f.advance(1001);
  const expired = await f.call('/api/state', {cookie: signedIn.cookie});
  assert.equal(expired.status, 401); assert.equal(expired.actor, null);
  assert.match(expired.headers['set-cookie'], /Max-Age=0/);
});

test('la sesión consulta el rol y actividad actuales sin confiar en el cliente', async () => {
  const f = fixture(), signedIn = await f.login();
  f.users[0].role = 'operador';
  assert.equal((await f.call('/api/state', {cookie: signedIn.cookie})).actor.role, 'operador');
  f.users[0].active = 0;
  assert.equal((await f.call('/api/state', {cookie: signedIn.cookie})).status, 401);
});

test('el modo local solo admite loopback, desarrollo y ausencia de cuentas', async () => {
  const f = fixture({users: [], allowLocal: true});
  assert.deepEqual((await f.call('/api/session')).body, {username: 'local', role: 'admin', mode: 'local'});
  assert.equal((await f.call('/api/session', {address: '10.0.0.20'})).status, 401);
  const production = fixture({users: [], allowLocal: true, production: true});
  assert.equal((await production.call('/api/session')).status, 401);
  assert.equal((await fixture({allowLocal: true}).call('/api/session')).status, 401);
});

test('el límite de intentos se aplica por usuario y origen de red y vence', async () => {
  const f = fixture();
  for (let attempt = 0; attempt < 10; attempt++) {
    assert.equal((await f.call('/api/login', {body: {username: 'admin', password: 'incorrecta'}})).status, 401);
  }
  const blocked = await f.login();
  assert.equal(blocked.status, 429); assert.ok(blocked.headers['retry-after'] > 0);
  f.advance(15 * 60 * 1000 + 1);
  assert.equal((await f.login()).status, 200);
});

test('producción emite cookie Secure y exige el origen HTTPS incluso en login', async () => {
  const f = fixture({production: true});
  assert.equal((await f.call('/api/login', {body: {username: 'admin', password}})).status, 403);
  const signedIn = await f.login();
  for (const marker of ['HttpOnly', 'SameSite=Strict', 'Secure', 'Path=/']) assert.ok(signedIn.headers['set-cookie'].includes(marker));
  assert.equal((await f.call('/api/logout', {cookie: signedIn.cookie, body: {}, origin: 'https://scorta.test', type: 'text/plain'})).status, 415);
  assert.equal((await f.call('/api/logout', {cookie: signedIn.cookie, body: {}, origin: ''})).status, 403);
});

test('reiniciar las sesiones invalida cookies y las contraseñas no viajan en respuestas', async () => {
  const f = fixture(), signedIn = await f.login();
  assert.deepEqual(signedIn.body, {username: 'admin', role: 'admin', mode: 'session'});
  f.auth.close();
  assert.equal((await f.call('/api/session', {cookie: signedIn.cookie})).status, 401);
});
