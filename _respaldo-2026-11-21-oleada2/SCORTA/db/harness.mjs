// Test harness: a fresh, isolated database per test file.
// - With SCORTA_TEST_DATABASE_URL (CI job postgres:16): a new schema with a random name,
//   so test files running in parallel never see each other; dropped at the end (it only
//   ever contains test data created here).
// - Without it: an in-memory PGlite.
import {openDatabase} from './client.mjs';
import {migrateUp} from './migrate.mjs';

export async function createTestDatabase({migrate = true, max} = {}) {
  const url = process.env.SCORTA_TEST_DATABASE_URL;
  let db, cleanup = async () => {};
  if (url) {
    const schema = 'scorta_test_' + crypto.randomUUID().replaceAll('-', '').slice(0, 16);
    const admin = await openDatabase({url, max: 1});
    await admin.exec(`CREATE SCHEMA ${schema}`);
    db = await openDatabase({url, schema, max});
    cleanup = async () => {
      await db.close();
      try { await admin.exec(`DROP SCHEMA ${schema} CASCADE`); } finally { await admin.close(); }
    };
  } else {
    db = await openDatabase({url: null});
    cleanup = () => db.close();
  }
  if (migrate) await migrateUp(db);
  return {db, engine: url ? 'postgres' : 'pglite', close: cleanup};
}
