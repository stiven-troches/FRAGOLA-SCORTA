/* Imitación de supabase-js para PRUEBAS: corre PostgreSQL real (PGlite) dentro del navegador con
   supabase/schema.sql, roles anon/authenticated y RLS. Solo implementa lo que usa la app.
   Se inyecta antes que la app (Playwright addInitScript) junto con window.__FRAGOLA_CLOUD. */
(function () {
  const BASE = '/pruebas/node_modules/@electric-sql/pglite/dist/';
  const AUTH_STUB = `
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, phone text unique, pw text);
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
create role anon nologin; create role authenticated nologin;
grant usage on schema auth, public to anon, authenticated;
grant execute on function auth.jwt(), auth.uid() to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;`;
  const name = sessionStorage.getItem('mockdb') || (sessionStorage.setItem('mockdb', 'm' + Date.now()), sessionStorage.getItem('mockdb'));
  let db = null;
  const ready = (async () => {
    const { PGlite } = await import(BASE + 'index.js');
    const { btree_gist } = await import(BASE + 'contrib/btree_gist.js');
    db = await PGlite.create('idb://' + name, { extensions: { btree_gist } });
    if (!(await db.query(`select to_regclass('public.bookings') r`)).rows[0].r) {
      await db.exec(AUTH_STUB);
      await db.exec(await (await fetch('/supabase/schema.sql')).text());
    }
  })();
  window.__mockReady = ready;
  window.__mockDb = () => db;

  const SKEY = 'mock-session:' + name;
  let session = JSON.parse(localStorage.getItem(SKEY) || 'null');
  const listeners = [];
  const save = (ev) => { localStorage.setItem(SKEY, JSON.stringify(session)); listeners.forEach(f => f(ev, session)); };
  const mk = (u) => ({ access_token: 'mock', user: { id: u.id, email: u.email || undefined, phone: u.phone || undefined } });
  const claims = () => session ? { sub: session.user.id, role: 'authenticated', email: session.user.email, phone: session.user.phone } : { role: 'anon' };
  async function run(sql, params) {
    await ready;
    return db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims())]);
      await tx.exec(`set local role ${session ? 'authenticated' : 'anon'}`);
      return (await tx.query(sql, params)).rows;
    });
  }
  const err = (e) => ({ message: e.message, code: e.code, details: e.detail || null, hint: e.hint || null });
  const ident = (c) => { if (!/^[a-z_]+$/.test(c)) throw new Error('columna inválida ' + c); return c; };
  const arrLit = (a) => '{' + a.map(v => v == null ? 'NULL' : '"' + String(v).replace(/["\\]/g, '\\$&') + '"').join(',') + '}';

  class Q {
    constructor(t) { this.t = ident(t); this.op = 'select'; this.conds = []; this.ord = null; this.lim = null; this.off = 0; }
    select() { return this; }
    insert(rows) { this.op = 'insert'; this.payload = Array.isArray(rows) ? rows : [rows]; return this; }
    update(p) { this.op = 'update'; this.payload = p; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(c, v) { this.conds.push([ident(c), '=', v]); return this; }
    gte(c, v) { this.conds.push([ident(c), '>=', v]); return this; }
    in(c, a) { this.conds.push([ident(c), 'in', a]); return this; }
    order(c, o) { this.ord = [ident(c), o && o.ascending === false ? 'desc' : 'asc']; return this; }
    range(a, b) { this.off = a; this.lim = b - a + 1; return this; }
    then(res, rej) { return this.exec().then(res, rej); }
    where(params) {
      if (!this.conds.length) return '';
      return ' where ' + this.conds.map(([c, op, v]) => {
        if (op === 'in') { params.push(arrLit(v)); return `tt.${c}::text = any($${params.length}::text[])`; }
        params.push(String(v)); return `tt.${c}::text ${op} $${params.length}`;
      }).join(' and ');
    }
    async exec() {
      try {
        const T = 'public.' + this.t, p = [];
        if (this.op === 'select') {
          const w = this.where(p);
          const sql = `select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) r from (select tt.* from ${T} tt${w}` +
            (this.ord ? ` order by tt.${this.ord[0]} ${this.ord[1]}` : '') + (this.lim != null ? ` limit ${this.lim} offset ${this.off}` : '') + ') x';
          return { data: (await run(sql, p))[0].r, error: null };
        }
        if (this.op === 'insert') {
          const cols = [...new Set(this.payload.flatMap(Object.keys))].map(ident).join(',');
          p.push(JSON.stringify(this.payload));
          await run(`insert into ${T} (${cols}) select ${cols} from jsonb_populate_recordset(null::${T}, $1::jsonb)`, p);
          return { data: null, error: null };
        }
        if (this.op === 'update') {
          const cols = Object.keys(this.payload).map(ident);
          p.push(JSON.stringify(this.payload));
          const w = this.where(p);
          await run(`update ${T} as tt set ${cols.map(c => `${c} = r.${c}`).join(', ')} from jsonb_populate_record(null::${T}, $1::jsonb) r${w}`, p);
          return { data: null, error: null };
        }
        if (this.op === 'delete') { const w = this.where(p); await run(`delete from ${T} as tt${w}`, p); return { data: null, error: null }; }
      } catch (e) { return { data: null, error: err(e) }; }
    }
  }
  const sigs = {};
  async function rpc(fn, args) {
    try {
      await ready;
      if (!sigs[fn]) {
        const r = (await db.query(`select p.proargnames n, p.proargtypes::regtype[]::text[] t, p.prorettype::regtype::text ret
          from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = $1`, [fn])).rows[0];
        if (!r) return { data: null, error: { message: 'Could not find the function public.' + fn } };
        sigs[fn] = r;
      }
      const sg = sigs[fn], p = [], parts = [];
      Object.entries(args || {}).forEach(([k, v]) => {
        const i = (sg.n || []).indexOf(k); if (i < 0) throw new Error('argumento desconocido ' + k);
        p.push(v == null ? null : Array.isArray(v) ? arrLit(v) : String(v));
        parts.push(`${ident(k)} => $${p.length}::${sg.t[i]}`);
      });
      const rows = await run(`select public.${fn}(${parts.join(', ')}) r`, p);
      return { data: sg.ret === 'void' ? null : rows[0].r, error: null };
    } catch (e) { return { data: null, error: err(e) }; }
  }
  const auth = {
    async getSession() { await ready; return { data: { session } }; },
    onAuthStateChange(cb) { listeners.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
    async signUp({ email, password }) {
      await ready;
      if ((await db.query(`select 1 from auth.users where email = $1`, [email])).rows.length) return { data: { session: null }, error: { message: 'User already registered' } };
      const u = (await db.query(`insert into auth.users (email, pw) values ($1, $2) returning id, email`, [email, password])).rows[0];
      session = mk(u); save('SIGNED_IN'); return { data: { session, user: session.user }, error: null };
    },
    async signInWithPassword({ email, password }) {
      await ready;
      const u = (await db.query(`select id, email from auth.users where email = $1 and pw = $2`, [email, password])).rows[0];
      if (!u) return { data: { session: null }, error: { message: 'Invalid login credentials' } };
      session = mk(u); save('SIGNED_IN'); return { data: { session, user: session.user }, error: null };
    },
    async signInWithOtp() { await ready; return { data: {}, error: null }; },
    async verifyOtp({ phone, token }) {
      await ready;
      if (token !== '123456') return { data: { session: null }, error: { message: 'Token has expired or is invalid' } };
      const ph = String(phone).replace(/\D/g, '');
      const u = (await db.query(`insert into auth.users (phone) values ($1) on conflict (phone) do update set phone = excluded.phone returning id, phone`, [ph])).rows[0];
      session = mk(u); save('SIGNED_IN'); return { data: { session, user: session.user }, error: null };
    },
    async signOut() { session = null; save('SIGNED_OUT'); return { error: null }; },
    async updateUser({ password }) { await ready; await db.query(`update auth.users set pw = $1 where id = $2`, [password, session.user.id]); return { data: { user: session.user }, error: null }; },
    async resetPasswordForEmail() { return { data: {}, error: null }; },
  };
  const channel = () => ({ on() { return this; }, subscribe() { return this; } });
  window.supabase = { createClient: () => ({ from: (t) => new Q(t), rpc, auth, channel, removeChannel() {} }) };
  window.__FRAGOLA_CLOUD = { url: 'http://mock.local', anonKey: 'mock' };
})();
