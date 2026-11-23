// Thin database adapter shared by migrations, import, verification and the repository.
// One interface for two engines:
//   - `pg` Pool against a real Postgres (Render, CI postgres:16), selected by a URL.
//   - PGlite (Postgres compiled to WASM) for local tests and measurements without a server.
// Both return rows with the same value types:
//   date -> 'YYYY-MM-DD' string, timestamptz -> ISO string, numeric -> string (exact),
//   int8 -> Number (quantities and counters stay far below 2^53).

const DATE = 1082, TIMESTAMPTZ = 1184, TIMESTAMP = 1114, NUMERIC = 1700, INT8 = 20;
const toIso = value => value == null ? value : new Date(value.includes('T') || value.includes(' ') ? value.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00') : value).toISOString();
const parsers = {
  [DATE]: value => value,
  [TIMESTAMPTZ]: toIso,
  [TIMESTAMP]: value => value,
  [NUMERIC]: value => value,
  [INT8]: value => value == null ? value : Number(value),
};

function wrapPglite(handle) {
  return {
    async query(text, params = []) {
      const result = await handle.query(text, params);
      // PGlite reports affectedRows = 0 for SELECT: a row count is the larger of both.
      return {rows: result.rows, rowCount: Math.max(result.affectedRows ?? 0, result.rows.length)};
    },
    async exec(sql) { await handle.exec(sql); },
  };
}

async function openPglite({dataDir} = {}) {
  const [{PGlite}, {pg_trgm}] = await Promise.all([
    import('@electric-sql/pglite'),
    import('@electric-sql/pglite/contrib/pg_trgm'),
  ]);
  const pglite = new PGlite({...(dataDir ? {dataDir} : {}), extensions: {pg_trgm}, parsers});
  await pglite.waitReady;
  const base = wrapPglite(pglite);
  return {
    kind: 'pglite',
    ...base,
    // PGlite has a single connection: transactions are serialized, which is the
    // same observable outcome as row locks for the conditional stock UPDATE.
    transaction: fn => pglite.transaction(tx => fn({kind: 'pglite', ...wrapPglite(tx)})),
    close: () => pglite.close(),
  };
}

async function openPg({url, schema, max = 10, statementTimeoutMs = 15000}) {
  const {default: pg} = await import('pg');
  const options = [`-c statement_timeout=${statementTimeoutMs}`, '-c TimeZone=UTC'];
  if (schema) options.push(`-c search_path=${schema},public`);
  const pool = new pg.Pool({
    connectionString: url,
    max,
    options: options.join(' '),
    types: {getTypeParser: (oid, format) => parsers[oid] ?? pg.types.getTypeParser(oid, format)},
  });
  const wrap = handle => ({
    async query(text, params = []) {
      const result = await handle.query(text, params);
      return {rows: result.rows, rowCount: result.rowCount ?? 0};
    },
    async exec(sql) { await handle.query(sql); },
  });
  return {
    kind: 'pg',
    ...wrap(pool),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({kind: 'pg', ...wrap(client)});
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch {}
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
    pool,
  };
}

/**
 * Opens a database.
 * - `url` (or SCORTA_DATABASE_URL): real Postgres through `pg`.
 * - otherwise PGlite; `dataDir` persists it on disk, omitted = in memory.
 */
export async function openDatabase({url = process.env.SCORTA_DATABASE_URL, schema, dataDir, max, statementTimeoutMs} = {}) {
  if (url) return openPg({url, schema, max, statementTimeoutMs});
  return openPglite({dataDir});
}

/** Inserts many rows with multi-row VALUES, in batches under the 65535-parameter limit. */
export async function insertMany(db, table, columns, rows, {onConflict = ''} = {}) {
  if (!rows.length) return 0;
  const perRow = columns.length, batch = Math.max(1, Math.floor(30000 / perRow));
  let inserted = 0;
  for (let start = 0; start < rows.length; start += batch) {
    const slice = rows.slice(start, start + batch), params = [];
    const values = slice.map(row => '(' + columns.map(column => {
      const value = row[column];
      params.push(value === undefined ? null : value !== null && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value) ? JSON.stringify(value) : value);
      return '$' + params.length;
    }).join(',') + ')');
    const result = await db.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${values.join(',')} ${onConflict}`, params);
    inserted += result.rowCount;
  }
  return inserted;
}
