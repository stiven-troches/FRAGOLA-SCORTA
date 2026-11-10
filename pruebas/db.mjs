// Base de datos de prueba: PostgreSQL real (PGlite) con una imitación mínima de lo que
// Supabase trae de fábrica (esquema auth, auth.uid(), auth.jwt(), roles anon/authenticated).
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const AUTH_STUB = `
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, phone text unique, pw text);
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
create role anon nologin; create role authenticated nologin;
grant usage on schema auth, public to anon, authenticated;
grant execute on function auth.jwt(), auth.uid() to anon, authenticated;
-- permisos de fábrica de Supabase: todo lo nuevo en "public" queda concedido EXPLÍCITAMENTE a anon y authenticated
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
`;

export const SCHEMA = readFileSync(fileURLToPath(new URL('../supabase/schema.sql', import.meta.url)), 'utf8');

export async function makeDb() {
  const db = await PGlite.create({ extensions: { btree_gist } });
  await db.exec(AUTH_STUB);
  await db.exec(SCHEMA);
  return db;
}

// ejecuta como lo haría la API de Supabase: rol + "token" (claims) de la persona
export async function as(db, who, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(who.claims || {})]);
    await tx.exec(`set local role ${who.role || 'anon'}`);
    return (await tx.query(sql, params)).rows;
  });
}

export async function newUser(db, email, phone) {
  const r = await db.query(`insert into auth.users (email, phone) values ($1, $2) returning id`, [email || null, phone || null]);
  const id = r.rows[0].id;
  return { id, role: 'authenticated', claims: { sub: id, role: 'authenticated', email, phone } };
}
export const ANON = { role: 'anon', claims: { role: 'anon' } };
