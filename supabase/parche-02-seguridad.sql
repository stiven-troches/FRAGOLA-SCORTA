-- =====================================================================
-- FRAGOLA PRENOTA · parche 02 · endurecimiento de seguridad (SEG-14)
-- Se puede ejecutar varias veces sin dañar nada (idempotente).
-- Cómo: Supabase → SQL Editor → New query → pega TODO este archivo → Run.
-- Antes: haz una copia (Database → Backups) y lee REVISION-SEGURIDAD.md.
-- Incluye y reemplaza al parche 01 (no hace falta ejecutar ambos).
--
-- Qué hace:
--   1. Se asegura de que TODAS las tablas de "public" tengan RLS activo.
--   2. Quita permisos de sobra a "anon" y "public" (tablas, secuencias,
--      funciones y el esquema interno "app") y deja solo los necesarios.
--   3. Fija search_path en TODAS las funciones propias (evita secuestro
--      de funciones/tablas por esquemas falsos).
--   4. Deja de publicar el código de las citas de otras personas.
--   5. Impide que cuentas sin correo (clientes por SMS, anónimos) creen negocios.
--   6. Evita que tablas/funciones nuevas queden abiertas a anon por defecto.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. RLS activo en todas las tablas de public
--    (si alguien crea una tabla nueva desde el panel y olvida RLS,
--     este paso la protege; sin políticas = nadie accede por la API).
-- ---------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity loop
    execute format('alter table public.%I enable row level security', t.relname);
    raise notice 'RLS activado en public.%', t.relname;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. Permisos mínimos
-- ---------------------------------------------------------------------
-- 2a. Tablas y secuencias: "anon" (visitantes) no necesita NINGUNA; las
--     reservas pasan por public.book(). "authenticated" recibe solo lo que usa la app.
revoke all on all tables    in schema public from anon, authenticated, public;
revoke all on all sequences in schema public from anon, authenticated, public;
grant select, insert, update, delete on public.services, public.pros, public.pro_private, public.resources, public.blocks,
  public.bookings, public.client_notes, public.notices to authenticated;
grant select, update on public.businesses to authenticated;
grant select, delete on public.members, public.invites to authenticated;
grant select, insert on public.audit_log to authenticated;

-- 2b. Esquema interno "app": ni siquiera es visible para anon.
revoke usage on schema app from anon, public;
grant  usage on schema app to authenticated;
revoke execute on all functions in schema app from public, anon, authenticated;
grant execute on function app.role_in(uuid), app.is_admin(uuid), app.is_member(uuid), app.my_pro(uuid),
  app.local_now(text) to authenticated;   -- las usan las políticas RLS y el disparador de citas

-- 2c. Funciones públicas (API): cada una solo para quien la necesita.
--     (Supabase concede EXECUTE a anon de forma explícita; hay que quitarlo a mano.)
revoke execute on function public.public_catalog(text), public.book(text, bigint[], bigint, date, int, text, text, text, text, boolean),
  public.my_bookings(text), public.cancel_my_booking(text, bigint), public.reschedule_my_booking(text, bigint, date, int),
  public.update_my_data(text, text, text), public.erase_my_data(text), public.my_businesses(), public.create_business(text, text),
  public.create_invite(uuid, text, bigint), public.accept_invite(text) from public, anon, authenticated;
grant execute on function public.public_catalog(text), public.book(text, bigint[], bigint, date, int, text, text, text, text, boolean)
  to anon, authenticated;                  -- visitantes: ver catálogo y reservar
grant execute on function public.my_bookings(text), public.cancel_my_booking(text, bigint), public.reschedule_my_booking(text, bigint, date, int),
  public.update_my_data(text, text, text), public.erase_my_data(text), public.my_businesses(), public.create_business(text, text),
  public.create_invite(uuid, text, bigint), public.accept_invite(text) to authenticated;  -- solo con sesión

-- ---------------------------------------------------------------------
-- 3. search_path fijo en todas las funciones propias (app y public)
--    Se excluyen las que pertenecen a extensiones (btree_gist).
--    pg_temp al final: nadie puede "sombrear" tablas con tablas temporales.
-- ---------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('app', 'public') and p.prokind = 'f'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter function %s set search_path = public, app, pg_temp', f.sig);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. El catálogo público ya no entrega el código de las citas ajenas
--    (la parte "busy" solo necesita saber qué horas están ocupadas).
--    El código sigue viéndolo su dueño (p_full = true).
-- ---------------------------------------------------------------------
create or replace function app.booking_json(k public.bookings, p_full boolean) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  select jsonb_build_object('id', k.id, 'date', k.date, 'start', k.start_min, 'dur', k.dur, 'pre', k.pre,
    'post', k.post, 'proId', k.pro_id, 'res', k.res, 'status', k.status)
  || case when p_full then jsonb_build_object('code', k.code, 'proName',
        coalesce((select p.name from public.pros p where p.business_id = k.business_id and p.id = k.pro_id
                   and k.status in ('pendiente', 'confirmada', 'en curso') and not p.deleted), k.pro_name),
      'lines', k.lines, 'total', k.total, 'svcIds', k.svc_ids, 'resNames', k.res_names, 'name', k.name, 'phone', k.phone,
      'email', k.email, 'notes', k.notes, 'paid', k.paid, 'source', k.source, 'reassigned', k.reassigned, 'bizCancel', k.biz_cancel)
    else '{}'::jsonb end
$$;
revoke execute on function app.booking_json(public.bookings, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. create_business: solo cuentas con correo (no clientes por SMS ni anónimos)
--    Evita que cualquiera con un celular o un acceso anónimo cree decenas de
--    negocios falsos y "reserve" direcciones cortas. Mismo cuerpo que schema.sql
--    más la comprobación nueva.
-- ---------------------------------------------------------------------
create or replace function public.create_business(p_name text, p_slug text) returns jsonb
language plpgsql volatile security definer set search_path = public, app, pg_temp as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Inicia sesión primero.'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) or coalesce(auth.jwt() ->> 'email', '') = '' then
    raise exception 'Para crear un negocio entra con tu correo y contraseña.';
  end if;
  p_name := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')); p_slug := lower(btrim(coalesce(p_slug, '')));
  if char_length(p_name) not between 2 and 60 then raise exception 'El nombre debe tener de 2 a 60 caracteres.'; end if;
  if p_slug !~ '^[a-z0-9][a-z0-9-]{2,39}$' then
    raise exception 'La dirección corta usa de 3 a 40 letras minúsculas, números o guiones (ej.: barberia-centro).';
  end if;
  if exists (select 1 from public.businesses where slug = p_slug) then raise exception 'Esa dirección ya está en uso. Prueba otra.'; end if;
  if (select count(*) from public.members where user_id = auth.uid() and role = 'owner') >= 5 then
    raise exception 'Máximo 5 negocios por cuenta.';
  end if;
  insert into public.businesses (name, slug) values (p_name, p_slug) returning id into v_id;
  insert into public.members (business_id, user_id, role) values (v_id, auth.uid(), 'owner');
  insert into public.audit_log (business_id, who, text) values (v_id, 'Sistema', 'Negocio creado: ' || p_name);
  return jsonb_build_object('id', v_id, 'slug', p_slug, 'name', p_name, 'role', 'owner');
end $$;
-- create or replace conserva los permisos de la sección 2c; se repiten por si acaso
revoke execute on function public.create_business(text, text) from public, anon;
grant  execute on function public.create_business(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Valores por defecto: lo que se cree DESPUÉS en "public" no queda abierto a anon
--    (Supabase concede todo a anon/authenticated por defecto). Si más adelante
--    creas una tabla o función nueva, concede el permiso a mano y solo a quien lo necesite.
-- ---------------------------------------------------------------------
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
