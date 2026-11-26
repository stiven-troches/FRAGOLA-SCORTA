// OPS-02 · Ensayo local de restauración (sin tocar datos reales). Uso: npm run ensayo:restauracion
// Arranca SCORTA con datos ficticios en una carpeta temporal, lo respalda cifrado, lo descifra con la CLI,
// lo restaura con --offline, arranca sobre lo restaurado y compara empresas y usuarios. Borra todo al final.
import {spawn, execFileSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath, pathToFileURL} from 'node:url';

const APP = resolve(fileURLToPath(new URL('..', import.meta.url)));
const {encryptBackup} = await import(pathToFileURL(join(APP, 'ops/offsite-backup.mjs')).href);
const {savePlatformBackup} = await import(pathToFileURL(join(APP, 'platform-backup.mjs')).href);
const root = mkdtempSync(join(tmpdir(), 'scorta-ensayo-'));
const prod = join(root, 'prod'), rest = join(root, 'restaurado');
const key = randomBytes(32).toString('base64');
const t = {}; const now = () => performance.now();
const env = (dir, port) => ({...process.env, NODE_ENV: 'development', HOST: '127.0.0.1', PORT: String(port), DATA_DIR: dir,
  SCORTA_OWNER_COMPANY: 'Ensayo', SCORTA_OWNER_USER: 'dueno', SCORTA_OWNER_NAME: 'Dueño ensayo',
  SCORTA_OWNER_PASSWORD: 'Ensayo#2026x', SCORTA_TEST_COMPANY: '1', SCORTA_BACKUP_KEY: ''});

async function up(dir, port) {
  const p = spawn(process.execPath, ['server.mjs'], {cwd: APP, env: env(dir, port), stdio: ['ignore', 'pipe', 'pipe']});
  let out = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/healthz`); if (r.ok) return {p, body: await r.json(), out: () => out}; } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  p.kill(); throw Error('no arrancó:\n' + out);
}
async function down(s) { s.p.kill('SIGTERM'); await new Promise(r => s.p.once('exit', r)); }
const count = file => { const db = new DatabaseSync(file, {readOnly: true}); try { const s = JSON.parse(db.prepare('SELECT data FROM platform WHERE id=1').get().data);
  const cs = Object.values(s.companies || {}); return {empresas: cs.length, usuarios: Object.keys(s.users || s.accounts || {}).length, bytes: readFileSync(file).length}; } finally { db.close(); } };

let ok = false;
try {
  let s = await up(prod, 3311); console.log('1. servidor original:', JSON.stringify(s.body)); await down(s);
  const original = count(join(prod, 'platform.sqlite')); console.log('   datos originales:', original);

  t.a = now(); const copia = await savePlatformBackup(join(prod, 'platform.sqlite'), join(root, 'bk'));
  const enc = join(root, 'respaldo.sqlite.enc'); writeFileSync(enc, encryptBackup(readFileSync(copia), key));
  console.log('2. respaldo cifrado:', readFileSync(enc).length, 'bytes', `(${Math.round(now() - t.a)} ms)`);

  t.b = now(); const plano = join(root, 'descifrado.sqlite');
  execFileSync(process.execPath, ['platform-backup.mjs', 'decrypt', enc, plano], {cwd: APP, env: {...process.env, SCORTA_BACKUP_KEY: key}});
  console.log('3. descifrado con la CLI', `(${Math.round(now() - t.b)} ms)`);
  try { execFileSync(process.execPath, ['platform-backup.mjs', 'decrypt', enc, plano + '.x'], {cwd: APP, env: {...process.env, SCORTA_BACKUP_KEY: randomBytes(32).toString('base64')}, stdio: 'pipe'}); console.log('   ERROR: descifró con llave equivocada'); }
  catch { console.log('   llave equivocada rechazada: OK'); }

  t.c = now(); const r = execFileSync(process.execPath, ['platform-backup.mjs', 'restore', plano, join(rest, 'platform.sqlite'), '--offline'], {cwd: APP}).toString().trim();
  console.log('4. restaurado --offline', `(${Math.round(now() - t.c)} ms)`, r.length > 120 ? '' : r);

  t.d = now(); s = await up(rest, 3312); console.log('5. servidor sobre lo restaurado:', JSON.stringify(s.body), `(${Math.round(now() - t.d)} ms)`); await down(s);
  const restaurado = count(join(rest, 'platform.sqlite')); console.log('   datos restaurados:', restaurado);
  ok = original.empresas === restaurado.empresas && original.usuarios === restaurado.usuarios;
  console.log(ok ? 'RESULTADO: OK, los datos coinciden' : 'RESULTADO: NO COINCIDEN');
  console.log('   respaldos al arrancar:', existsSync(join(rest, 'backups')) ? readdirSync(join(rest, 'backups')) : 'ninguno');
  if (!ok) process.exitCode = 1;
} finally { rmSync(root, {recursive: true, force: true}); }
