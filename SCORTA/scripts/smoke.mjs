#!/usr/bin/env node
// Prueba de humo de un despliegue de SCORTA (OPS-10).
// Uso: npm run smoke -- https://scorta.example.com   (o SMOKE_URL=... npm run smoke)
// Sale con código 0 si todo pasa y 1 si algo falla. No crea datos ni inicia sesión.

const base = (process.argv[2] || process.env.SMOKE_URL || '').trim();
if (!/^https?:\/\//i.test(base)) {
  console.error('Uso: npm run smoke -- <url>   (ejemplo: https://scorta-staging.onrender.com)');
  process.exit(2);
}
const origin = new URL(base);
const isHttps = origin.protocol === 'https:';
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 15000);
const retries = Number(process.env.SMOKE_RETRIES || 3);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures.push(label);
};

async function get(path) {
  const url = new URL(path, origin);
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: {accept: '*/*', 'user-agent': 'scorta-smoke'}});
      const body = await res.text();
      // Render puede devolver 502/503 unos segundos mientras cambia de instancia.
      if ((res.status === 502 || res.status === 503) && attempt < retries) { await new Promise(r => setTimeout(r, 3000 * attempt)); continue; }
      return {res, body};
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise(r => setTimeout(r, 3000 * attempt));
    }
  }
  throw lastError;
}

function securityHeaders(res, label) {
  const csp = res.headers.get('content-security-policy') || '';
  check(/default-src/i.test(csp), `${label}: Content-Security-Policy presente`);
  check((res.headers.get('x-content-type-options') || '').toLowerCase() === 'nosniff', `${label}: X-Content-Type-Options nosniff`);
  if (isHttps) check(/max-age=\d+/i.test(res.headers.get('strict-transport-security') || ''), `${label}: Strict-Transport-Security (HSTS)`);
}

try {
  // 1. /healthz → 200 con {"ok":true}
  const health = await get('/healthz');
  let healthOk = false;
  try { healthOk = JSON.parse(health.body).ok === true; } catch { healthOk = /\bok\b/i.test(health.body); }
  check(health.res.status === 200, 'GET /healthz responde 200', `estado ${health.res.status}`);
  check(healthOk, 'GET /healthz indica ok');

  // 2. / → HTML con <title>
  const home = await get('/');
  check(home.res.status === 200, 'GET / responde 200', `estado ${home.res.status}`);
  check((home.res.headers.get('content-type') || '').includes('text/html'), 'GET / devuelve HTML');
  const title = home.body.match(/<title[^>]*>([^<]*)<\/title>/i);
  check(!!title && title[1].trim().length > 0, 'GET / tiene <title>', title ? title[1].trim() : 'sin título');
  securityHeaders(home.res, 'GET /');

  // 3. /api/v2/session sin cookie → 401 en JSON
  const session = await get('/api/v2/session');
  check(session.res.status === 401, 'GET /api/v2/session sin sesión responde 401', `estado ${session.res.status}`);
  let json = false;
  try { JSON.parse(session.body); json = true; } catch {}
  check(json && (session.res.headers.get('content-type') || '').includes('application/json'), 'GET /api/v2/session responde JSON');
  securityHeaders(session.res, 'GET /api/v2/session');
} catch (error) {
  check(false, 'Conexión con el servidor', String(error?.cause?.code || error?.message || error));
}

if (failures.length) {
  console.error(`\nPrueba de humo FALLIDA en ${origin.origin}: ${failures.length} comprobación(es).`);
  process.exit(1);
}
console.log(`\nPrueba de humo correcta en ${origin.origin}.`);
