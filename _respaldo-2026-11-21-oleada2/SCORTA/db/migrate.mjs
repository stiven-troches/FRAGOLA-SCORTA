// DM-03: numbered, transactional migrations with a down file for each one.
//   db/migrations/NNN_nombre.sql       -> applies
//   db/migrations/NNN_nombre.down.sql  -> undoes (mandatory)
// Every migration runs in its own transaction together with its schema_migrations row,
// under a database-wide advisory lock (several instances may start at the same time).
// CLI: node db/migrate.mjs up|down|status [--to=NNN]   (uses SCORTA_DATABASE_URL)
import {createHash} from 'node:crypto';
import {readdirSync, readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {openDatabase} from './client.mjs';

export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
const LOCK_KEY = 72620271; // arbitrary constant shared by every SCORTA instance

const sha256 = text => createHash('sha256').update(text).digest('hex');

/** Reads and validates the migration files (sorted, contiguous numbers, a down per up). */
export function loadMigrations(dir = MIGRATIONS_DIR) {
  const files = readdirSync(dir), migrations = [];
  for (const file of files) {
    const match = file.match(/^(\d{3})_([a-z0-9_]+)\.sql$/);
    if (!match) continue;
    const downFile = `${match[1]}_${match[2]}.down.sql`;
    if (!files.includes(downFile)) throw Error(`Falta ${downFile}: cada migración necesita su archivo para deshacerla.`);
    const up = readFileSync(join(dir, file), 'utf8');
    migrations.push({version: match[1], name: match[2], file, up, down: readFileSync(join(dir, downFile), 'utf8'), checksum: sha256(up)});
  }
  migrations.sort((a, b) => a.version.localeCompare(b.version));
  migrations.forEach((m, index) => {
    if (Number(m.version) !== index + 1) throw Error(`Numeración de migraciones discontinua en ${m.file}.`);
  });
  return migrations;
}

async function prepare(tx) {
  await tx.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);
  await tx.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY, name text NOT NULL, checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now())`);
  const {rows} = await tx.query('SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version');
  return rows;
}

/** Applied and pending migrations. */
export async function migrationStatus(db, {dir} = {}) {
  const migrations = loadMigrations(dir);
  const applied = await db.transaction(prepare);
  const done = new Set(applied.map(row => row.version));
  return {applied, pending: migrations.filter(m => !done.has(m.version)).map(m => m.version + '_' + m.name)};
}

/**
 * Applies pending migrations up to `to` (default: all). A migration already applied
 * whose file changed is an error: published migrations are never edited.
 */
export async function migrateUp(db, {dir, to, log = () => {}} = {}) {
  const migrations = loadMigrations(dir).filter(m => !to || m.version <= String(to).padStart(3, '0'));
  const applied = [];
  for (const migration of migrations) {
    const done = await db.transaction(async tx => {
      const rows = await prepare(tx), prior = rows.find(row => row.version === migration.version);
      if (prior) {
        if (prior.checksum !== migration.checksum) throw Error(`La migración ${migration.file} cambió después de aplicarse. Crea una migración nueva.`);
        return false;
      }
      await tx.exec(migration.up);
      await tx.query('INSERT INTO schema_migrations(version, name, checksum) VALUES($1, $2, $3)', [migration.version, migration.name, migration.checksum]);
      return true;
    });
    if (done) { applied.push(migration.version); log(`aplicada ${migration.file}`); }
  }
  return applied;
}

/**
 * Undoes applied migrations, newest first, down to (but not including) `to`
 * (default: only the last one; `to: 0` undoes all). Each down file protects real data
 * by itself (001 refuses when the base contains companies or users).
 */
export async function migrateDown(db, {dir, to, log = () => {}} = {}) {
  const migrations = loadMigrations(dir), undone = [];
  const applied = (await db.transaction(prepare)).map(row => row.version).sort().reverse();
  const targets = to == null ? applied.slice(0, 1) : applied.filter(version => version > String(to).padStart(3, '0'));
  for (const version of targets) {
    const migration = migrations.find(m => m.version === version);
    if (!migration) throw Error(`No existe el archivo de la migración aplicada ${version}.`);
    await db.transaction(async tx => {
      await prepare(tx);
      await tx.exec(migration.down);
      await tx.query('DELETE FROM schema_migrations WHERE version = $1', [version]);
    });
    undone.push(version); log(`deshecha ${migration.file}`);
  }
  return undone;
}

async function main(argv) {
  const command = argv[0] || 'status', to = argv.find(arg => arg.startsWith('--to='))?.slice(5);
  if (!process.env.SCORTA_DATABASE_URL) throw Error('Define SCORTA_DATABASE_URL.');
  const db = await openDatabase();
  try {
    if (command === 'up') await migrateUp(db, {to, log: console.log});
    else if (command === 'down') await migrateDown(db, {to, log: console.log});
    else if (command === 'status') console.log(JSON.stringify(await migrationStatus(db), null, 2));
    else throw Error('Uso: node db/migrate.mjs up|down|status [--to=NNN]');
  } finally {
    await db.close();
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
