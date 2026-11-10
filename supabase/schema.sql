-- =====================================================================
-- FRAGOLA PRENOTA · Fase 4 · base de datos para Supabase (PostgreSQL)
-- Cómo usarlo: Supabase → SQL Editor → New query → pega TODO este
-- archivo → Run. Se puede ejecutar una sola vez en un proyecto nuevo.
--
-- Seguridad:
--  * Cada fila pertenece a un negocio (business_id). La seguridad por
--    filas (RLS) solo deja ver y cambiar datos del negocio propio.
--  * Los clientes (sin cuenta) NUNCA leen tablas: reservan con la
--    función public.book(), que valida todo en el servidor.
--  * Dos citas del mismo profesional no se pueden cruzar: lo impide la
--    propia base de datos (restricción de exclusión), aunque dos
--    personas reserven al mismo tiempo.
--  * Funciones internas en el esquema "app" (no se publican en la API).
-- =====================================================================

create extension if not exists btree_gist;
create schema if not exists app;

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------
create table public.businesses (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  name             text not null check (char_length(name) between 2 and 60),
  address          text not null default '' check (char_length(address) <= 120),
  whatsapp         text not null default '' check (whatsapp = '' or whatsapp ~ '^57[0-9]{10}$'),
  open_hour        int  not null default 9  check (open_hour between 0 and 23),
  close_hour       int  not null default 19 check (close_hour between 1 and 24),
  step_min         int  not null default 30 check (step_min in (15, 30, 60)),
  min_cancel_hours int  not null default 2  check (min_cancel_hours between 0 and 72),
  max_active       int  not null default 3  check (max_active between 1 and 10),
  min_advance_min  int  not null default 30 check (min_advance_min between 0 and 1440),
  max_advance_days int  not null default 14 check (max_advance_days between 1 and 90),
  auto_confirm     boolean not null default true,
  type             text not null default 'general' check (char_length(type) <= 30),
  features         jsonb not null default '{"buffers":false,"resources":false}',
  closed_dates     date[] not null default '{}',
  timezone         text not null default 'America/Bogota',
  created_at       timestamptz not null default now(),
  check (close_hour > open_hour)
);

-- quién puede entrar a cada negocio
create table public.members (
  business_id uuid not null references public.businesses on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  role        text not null check (role in ('owner', 'admin', 'staff')),
  pro_id      bigint,                       -- solo empleados: su perfil en "pros"
  created_at  timestamptz not null default now(),
  primary key (business_id, user_id),
  check (role <> 'staff' or pro_id is not null)
);

-- códigos de invitación (empleados o administradores)
create table public.invites (
  code        text primary key,
  business_id uuid not null references public.businesses on delete cascade,
  role        text not null check (role in ('admin', 'staff')),
  pro_id      bigint,
  expires_at  timestamptz not null default now() + interval '7 days',
  used_by     uuid,
  created_by  uuid,
  created_at  timestamptz not null default now()
);

create table public.services (
  business_id uuid not null references public.businesses on delete cascade,
  id      bigint not null,
  cat     text not null default 'Otros' check (char_length(cat) <= 30),
  name    text not null check (char_length(name) between 2 and 60),
  dur     int  not null check (dur between 5 and 480),
  price   int  not null check (price >= 0),
  active  boolean not null default true,
  descr   text not null default '' check (char_length(descr) <= 200),
  pre     int  not null default 0 check (pre between 0 and 120),
  post    int  not null default 0 check (post between 0 and 120),
  res     bigint not null default 0,
  demo    boolean not null default false,
  primary key (business_id, id)
);

-- perfil público del profesional (lo ven los clientes al reservar)
create table public.pros (
  business_id uuid not null references public.businesses on delete cascade,
  id          bigint not null,
  name        text not null check (char_length(name) between 1 and 60),
  active      boolean not null default true,
  deleted     boolean not null default false,
  del_at      date,
  service_ids bigint[] not null default '{}',
  color       int not null default 0,
  title       text not null default '' check (char_length(title) <= 40),
  specialties text[] not null default '{}',
  bio         text not null default '' check (char_length(bio) <= 200),
  photo       text not null default '' check (photo = '' or (photo ~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$' and char_length(photo) <= 220000)),
  sv          jsonb,                         -- versiones de horario (formato de la app)
  days        int[] not null default '{1,2,3,4,5,6}',
  from_h      int not null default 9,
  to_h        int not null default 18,
  owner       boolean not null default false,
  demo        boolean not null default false,
  primary key (business_id, id)
);

-- datos personales del empleado: solo los ve el administrador (Ley 1581)
create table public.pro_private (
  business_id uuid not null references public.businesses on delete cascade,
  pro_id  bigint not null,
  phone   text not null default '' check (phone = '' or phone ~ '^3[0-9]{9}$'),
  doc     text not null default '' check (doc = '' or doc ~ '^[0-9A-Za-z.\-]{5,20}$'),
  primary key (business_id, pro_id)
);

create table public.resources (
  business_id uuid not null references public.businesses on delete cascade,
  id      bigint not null,
  name    text not null check (char_length(name) between 2 and 40),
  qty     int not null check (qty between 1 and 50),
  active  boolean not null default true,
  primary key (business_id, id)
);

-- bloqueos, ausencias, vacaciones y días libres
create table public.blocks (
  business_id uuid not null references public.businesses on delete cascade,
  id        bigint not null,
  pro_id    bigint not null,
  date      date not null,
  date_to   date,
  start_min int not null check (start_min between 0 and 1440),
  end_min   int not null check (end_min between 0 and 1440),
  reason    text not null default '' check (char_length(reason) <= 60),
  type      text not null default 'bloqueo' check (type in ('bloqueo', 'ausencia', 'vacaciones', 'libre')),
  primary key (business_id, id),
  check (end_min > start_min),
  check (date_to is null or date_to >= date)
);

create table public.bookings (
  business_id uuid not null references public.businesses on delete cascade,
  id         bigint not null,
  code       text not null check (code ~ '^[A-Z0-9]{6}$'),
  date       date not null,
  start_min  int not null check (start_min between 0 and 1439),
  dur        int not null check (dur between 1 and 1440),
  pre        int not null default 0 check (pre between 0 and 120),
  post       int not null default 0 check (post between 0 and 120),
  pro_id     bigint not null,
  pro_name   text not null default '',
  lines      jsonb not null default '[]',
  total      int not null default 0,
  svc_ids    bigint[] not null default '{}',
  res        bigint[] not null default '{}',
  res_names  text[] not null default '{}',
  name       text not null check (char_length(name) <= 60),
  phone      text not null default '' check (phone = '' or phone ~ '^3[0-9]{9}$'),
  email      text not null default '' check (char_length(email) <= 254),
  notes      text not null default '' check (char_length(notes) <= 200),
  status     text not null default 'confirmada' check (status in ('pendiente', 'confirmada', 'en curso', 'completada', 'no asistió', 'cancelada')),
  paid       boolean not null default false,
  source     text not null default 'online' check (source in ('online', 'manual')),
  demo       boolean not null default false,
  reassigned jsonb,
  biz_cancel boolean not null default false,
  created_at timestamptz not null default now(),
  -- ocupación real en la agenda: preparación + servicio + limpieza (minutos del día)
  occ        int4range generated always as (int4range(start_min - pre, start_min + dur + post)) stored,
  primary key (business_id, id),
  unique (business_id, code),
  -- NUNCA dos citas activas del mismo profesional que se crucen
  constraint bookings_no_overlap exclude using gist (business_id with =, pro_id with =, date with =, occ with &&)
    where (status <> 'cancelada') deferrable initially deferred
);
create index bookings_by_date  on public.bookings (business_id, date);
create index bookings_by_phone on public.bookings (business_id, phone);

create table public.client_notes (
  business_id uuid not null references public.businesses on delete cascade,
  phone text not null check (phone ~ '^3[0-9]{9}$'),
  note  text not null default '' check (char_length(note) <= 200),
  primary key (business_id, phone)
);

create table public.notices (
  business_id uuid not null references public.businesses on delete cascade,
  id   bigint not null,
  ts   timestamptz not null default now(),
  text text not null check (char_length(text) <= 300),
  primary key (business_id, id)
);

-- registro de cambios: solo se agrega, nunca se edita ni se borra
create table public.audit_log (
  business_id uuid not null references public.businesses on delete cascade,
  id      bigint generated by default as identity,
  ts      timestamptz not null default now(),
  who     text not null check (char_length(who) <= 80),
  text    text not null check (char_length(text) <= 600),
  user_id uuid default auth.uid(),
  primary key (business_id, id)
);
create index audit_by_ts on public.audit_log (business_id, ts desc);

-- números de reservas en línea: desde mil millones, para no chocar con citas importadas de la versión local
create sequence app.booking_ids start 1000000000;

-- ---------------------------------------------------------------------
-- Funciones de apoyo (esquema app: no se publican en la API)
-- ---------------------------------------------------------------------
create or replace function app.role_in(p_bid uuid) returns text
language sql stable security definer set search_path = public, app as $$
  select role from public.members where business_id = p_bid and user_id = auth.uid()
$$;
create or replace function app.is_admin(p_bid uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select coalesce(app.role_in(p_bid) in ('owner', 'admin'), false)
$$;
create or replace function app.is_member(p_bid uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.role_in(p_bid) is not null
$$;
create or replace function app.my_pro(p_bid uuid) returns bigint
language sql stable security definer set search_path = public, app as $$
  select pro_id from public.members where business_id = p_bid and user_id = auth.uid()
$$;
-- celular (10 dígitos) del cliente que inició sesión con código por SMS
create or replace function app.my_phone() returns text
language sql stable as $$
  select case when p ~ '^3[0-9]{9}$' then p end
  from (select right(regexp_replace(coalesce(auth.jwt() ->> 'phone', ''), '[^0-9]', '', 'g'), 10) as p) x
$$;
create or replace function app.fmt_time(m int) returns text
language sql immutable as $$
  select (case when (m / 60) % 12 = 0 then 12 else (m / 60) % 12 end)::text || ':' || lpad((m % 60)::text, 2, '0')
         || case when m >= 720 then ' p. m.' else ' a. m.' end
$$;
create or replace function app.rid() returns bigint
language sql volatile as $$ select floor(random() * 70368744177664)::bigint + 1 $$;
create or replace function app.new_code(n int default 6) returns text
language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, n)
$$;
create or replace function app.local_now(p_tz text) returns timestamp
language sql stable as $$ select now() at time zone p_tz $$;

-- horario vigente de un profesional en una fecha (misma regla que la app)
create or replace function app.sched_at(p_sv jsonb, p_days int[], p_from int, p_to int, p_date date) returns jsonb
language plpgsql immutable as $$
declare v_cur jsonb; v jsonb; v_d jsonb := '{}'; i int;
begin
  if p_sv is null or jsonb_typeof(p_sv) <> 'array' or jsonb_array_length(p_sv) = 0 then
    for i in 0..6 loop
      v_d := v_d || jsonb_build_object(i::text, case when i = any(coalesce(p_days, '{}')) then jsonb_build_array(coalesce(p_from, 9) * 60, coalesce(p_to, 18) * 60) else 'null'::jsonb end);
    end loop;
    return jsonb_build_object('since', '', 'days', v_d, 'breaks', '[]'::jsonb);
  end if;
  v_cur := p_sv -> 0;
  for v in select value from jsonb_array_elements(p_sv) loop
    if coalesce(v ->> 'since', '') <= to_char(p_date, 'YYYY-MM-DD') then v_cur := v; end if;
  end loop;
  return v_cur;
end $$;

-- ¿se puede ocupar este horario? '' = sí; si no, el motivo (sin datos de otros clientes)
create or replace function app.slot_check(p_bid uuid, p_pro bigint, p_date date, p_start int, p_dur int,
  p_pre int, p_post int, p_res bigint[], p_svc bigint[], p_ignore bigint) returns text
language plpgsql stable security definer set search_path = public, app as $$
declare
  b public.businesses; p public.pros; v_cfg jsonb; v_w jsonb; v_dow int; v_a int; v_z int; v_s int; v_e int;
  v_br jsonb; v_k public.blocks; v_g public.resources; v_gid bigint; v_mx int; v_nm text; v_extra text;
begin
  select * into b from public.businesses where id = p_bid;
  select * into p from public.pros where business_id = p_bid and id = p_pro;
  if not found then return 'Elige un profesional.'; end if;
  v_nm := p.name;
  if not p.active or p.deleted then return v_nm || ' está inactivo.'; end if;
  if coalesce(p_dur, 0) <= 0 then return 'Elige al menos un servicio.'; end if;
  if p_date = any(b.closed_dates) then return 'El negocio está cerrado ese día.'; end if;
  v_s := p_start - coalesce(p_pre, 0); v_e := p_start + p_dur + coalesce(p_post, 0);
  v_extra := case when coalesce(p_pre, 0) + coalesce(p_post, 0) > 0 then ' (contando preparación y limpieza)' else '' end;
  v_cfg := app.sched_at(p.sv, p.days, p.from_h, p.to_h, p_date);
  v_dow := extract(dow from p_date)::int;
  v_w := v_cfg -> 'days' -> (v_dow::text);
  if v_w is null or jsonb_typeof(v_w) <> 'array' then return v_nm || ' no trabaja ese día.'; end if;
  v_a := greatest((v_w ->> 0)::int, b.open_hour * 60); v_z := least((v_w ->> 1)::int, b.close_hour * 60);
  if v_z <= v_a then return v_nm || ' no trabaja ese día.'; end if;
  if p_start < v_a or p_start + p_dur > v_z or v_s < v_a or v_e > v_z then
    return 'Fuera del horario de ' || v_nm || v_extra || ' (' || app.fmt_time(v_a) || ' a ' || app.fmt_time(v_z) || ').';
  end if;
  if exists (select 1 from unnest(coalesce(p_svc, '{}')) x where not (x = any(p.service_ids))) then
    return v_nm || ' no ofrece alguno de los servicios elegidos.';
  end if;
  for v_br in select value from jsonb_array_elements(coalesce(v_cfg -> 'breaks', '[]')) loop
    if (jsonb_typeof(v_br -> 'days') is distinct from 'array' or (v_br -> 'days') @> to_jsonb(v_dow))
       and v_s < (v_br ->> 'to')::int and (v_br ->> 'from')::int < v_e then
      return v_nm || ' está en descanso de ' || app.fmt_time((v_br ->> 'from')::int) || ' a ' || app.fmt_time((v_br ->> 'to')::int) || v_extra || '.';
    end if;
  end loop;
  select * into v_k from public.blocks
   where business_id = p_bid and pro_id = p_pro and date <= p_date and coalesce(date_to, date) >= p_date
     and ((start_min <= 0 and end_min >= 1440) or (v_s < end_min and start_min < v_e))
   limit 1;
  if found then
    return case v_k.type when 'vacaciones' then v_nm || ' está de vacaciones.'
                         when 'ausencia'   then v_nm || ' tiene una ausencia en ese horario.'
                         when 'libre'      then v_nm || ' tiene día libre.'
                         else v_nm || ' tiene ese horario bloqueado' || v_extra || '.' end;
  end if;
  if exists (select 1 from public.bookings
              where business_id = p_bid and pro_id = p_pro and date = p_date and status <> 'cancelada'
                and id is distinct from p_ignore and occ && int4range(v_s, v_e)) then
    return 'Ese horario ya está ocupado con ' || v_nm || '.';
  end if;
  if coalesce((b.features ->> 'resources')::boolean, false) then
    foreach v_gid in array coalesce(p_res, '{}') loop
      select * into v_g from public.resources where business_id = p_bid and id = v_gid;
      if not found then return 'El recurso requerido ya no existe.'; end if;
      if not v_g.active then return v_g.name || ' no está disponible (grupo desactivado).'; end if;
      -- máximo de citas simultáneas que usan el grupo dentro de [v_s, v_e)
      with o as (
        select greatest(lower(occ), v_s) as a, least(upper(occ), v_e) as z from public.bookings
         where business_id = p_bid and date = p_date and status <> 'cancelada' and id is distinct from p_ignore
           and v_gid = any(res) and occ && int4range(v_s, v_e)
      ), pts as (select v_s as t union select a from o)
      select coalesce(max((select count(*) from o where o.a <= pts.t and pts.t < o.z)), 0) into v_mx from pts;
      if v_mx + 1 > v_g.qty then
        return 'No hay ' || v_g.name || ' disponible en ese horario (capacidad: ' || v_g.qty || ').';
      end if;
    end loop;
  end if;
  return '';
end $$;

-- validaciones de tiempo comunes a reservar y reprogramar (las hace el servidor, no el navegador)
create or replace function app.check_when(b public.businesses, p_date date, p_start int, p_dur int) returns void
language plpgsql stable as $$
declare v_now timestamp := app.local_now(b.timezone);
begin
  if p_date is null or p_start is null then raise exception 'Elige fecha y hora.'; end if;
  if p_date + make_interval(mins => p_start) < v_now + make_interval(mins => b.min_advance_min) then
    raise exception 'Esa hora ya no está disponible (se reserva con al menos % min de anticipación).', b.min_advance_min;
  end if;
  if p_date > v_now::date + (b.max_advance_days - 1) then
    raise exception 'Solo se puede reservar hasta % días adelante.', b.max_advance_days;
  end if;
  if p_start < b.open_hour * 60 or p_start + p_dur > b.close_hour * 60 or (p_start - b.open_hour * 60) % b.step_min <> 0 then
    raise exception 'Esa hora no es válida para este negocio.';
  end if;
end $$;

-- cita en el formato que usa la app
create or replace function app.booking_json(k public.bookings, p_full boolean) returns jsonb
language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object('id', k.id, 'code', k.code, 'date', k.date, 'start', k.start_min, 'dur', k.dur, 'pre', k.pre,
    'post', k.post, 'proId', k.pro_id, 'res', k.res, 'status', k.status)
  || case when p_full then jsonb_build_object('proName',
        coalesce((select p.name from public.pros p where p.business_id = k.business_id and p.id = k.pro_id
                   and k.status in ('pendiente', 'confirmada', 'en curso') and not p.deleted), k.pro_name),
      'lines', k.lines, 'total', k.total, 'svcIds', k.svc_ids, 'resNames', k.res_names, 'name', k.name, 'phone', k.phone,
      'email', k.email, 'notes', k.notes, 'paid', k.paid, 'source', k.source, 'reassigned', k.reassigned, 'bizCancel', k.biz_cancel)
    else '{}'::jsonb end
$$;

-- ---------------------------------------------------------------------
-- API pública: clientes sin cuenta
-- ---------------------------------------------------------------------
-- catálogo y disponibilidad de un negocio (sin datos personales de nadie)
create or replace function public.public_catalog(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare b public.businesses; v_today date;
begin
  select * into b from public.businesses where slug = lower(p_slug);
  if not found then return null; end if;
  v_today := app.local_now(b.timezone)::date;
  return jsonb_build_object(
    'business', jsonb_build_object('id', b.id, 'slug', b.slug, 'name', b.name, 'address', b.address, 'whatsapp', b.whatsapp,
      'open', b.open_hour, 'close', b.close_hour, 'step', b.step_min, 'minCancelHours', b.min_cancel_hours,
      'maxActive', b.max_active, 'minAdvanceMin', b.min_advance_min, 'maxAdvanceDays', b.max_advance_days,
      'autoConfirm', b.auto_confirm, 'type', b.type, 'features', b.features, 'closedDates', to_jsonb(b.closed_dates),
      'timezone', b.timezone, 'today', v_today),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'cat', s.cat, 'name', s.name, 'dur', s.dur,
      'price', s.price, 'on', s.active, 'desc', s.descr, 'pre', s.pre, 'post', s.post, 'res', s.res) order by s.id)
      from public.services s where s.business_id = b.id and s.active), '[]'),
    'pros', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'active', p.active,
      'serviceIds', p.service_ids, 'color', p.color, 'title', p.title, 'specialties', p.specialties, 'bio', p.bio,
      'photo', p.photo, 'sv', p.sv, 'days', p.days, 'from', p.from_h, 'to', p.to_h, 'owner', p.owner) order by p.id)
      from public.pros p where p.business_id = b.id and p.active and not p.deleted), '[]'),
    -- solo horas ocupadas: sin motivo, sin nombres
    'blocks', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'proId', k.pro_id, 'date', k.date, 'dateTo', k.date_to,
      'start', k.start_min, 'end', k.end_min, 'type', k.type, 'reason', ''))
      from public.blocks k where k.business_id = b.id and coalesce(k.date_to, k.date) >= v_today), '[]'),
    'resources', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'qty', r.qty, 'active', r.active))
      from public.resources r where r.business_id = b.id), '[]'),
    'busy', coalesce((select jsonb_agg(app.booking_json(k, false))
      from public.bookings k where k.business_id = b.id and k.status <> 'cancelada'
       and k.date between v_today and v_today + b.max_advance_days), '[]'));
end $$;

-- reservar: TODA la validación ocurre aquí, dentro de una transacción
create or replace function public.book(p_slug text, p_svc bigint[], p_pro bigint, p_date date, p_start int,
  p_name text, p_phone text, p_email text default '', p_notes text default '', p_consent boolean default false) returns jsonb
language plpgsql volatile security definer set search_path = public, app as $$
declare
  b public.businesses; v_lines jsonb := '[]'; v_dur int := 0; v_total int := 0; v_pre int := 0; v_post int := 0;
  v_res bigint[] := '{}'; v_sv public.services; v_cand public.pros; v_chosen public.pros; v_err text; v_first text;
  v_code text; v_st text; v_n int; v_buf boolean; v_usr boolean; k public.bookings;
begin
  select * into b from public.businesses where slug = lower(p_slug);
  if not found then raise exception 'Negocio no encontrado.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(b.id::text, 0));  -- una reserva a la vez por negocio
  p_name  := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  p_phone := regexp_replace(coalesce(p_phone, ''), '[\s-]', '', 'g');
  p_email := btrim(coalesce(p_email, '')); p_notes := btrim(coalesce(p_notes, ''));
  if char_length(p_name) not between 2 and 60 then raise exception 'Escribe tu nombre (2 a 60 caracteres).'; end if;
  if p_phone !~ '^3[0-9]{9}$' then raise exception 'Celular colombiano de 10 dígitos que empiece por 3.'; end if;
  if p_email <> '' and p_email !~ '^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$' then raise exception 'Correo no válido.'; end if;
  if char_length(p_notes) > 200 then raise exception 'Las notas admiten máximo 200 caracteres.'; end if;
  if not coalesce(p_consent, false) then raise exception 'Debes aceptar el tratamiento de datos para reservar.'; end if;
  if p_svc is null or cardinality(p_svc) = 0 or cardinality(p_svc) > 10
     or (select count(distinct x) from unnest(p_svc) x) <> cardinality(p_svc) then
    raise exception 'Elige al menos un servicio.';
  end if;
  v_buf := coalesce((b.features ->> 'buffers')::boolean, false);
  v_usr := coalesce((b.features ->> 'resources')::boolean, false);
  for v_sv in select s.* from unnest(p_svc) with ordinality u(id, ord)
               join public.services s on s.business_id = b.id and s.id = u.id order by u.ord loop
    if not v_sv.active then raise exception 'El servicio % no está disponible.', v_sv.name; end if;
    v_lines := v_lines || jsonb_build_object('name', v_sv.name, 'price', v_sv.price, 'dur', v_sv.dur);
    v_dur := v_dur + v_sv.dur; v_total := v_total + v_sv.price;
    if v_buf then v_pre := greatest(v_pre, v_sv.pre); v_post := greatest(v_post, v_sv.post); end if;
    if v_usr and v_sv.res > 0 and not (v_sv.res = any(v_res)) then v_res := v_res || v_sv.res; end if;
  end loop;
  if jsonb_array_length(v_lines) <> cardinality(p_svc) then raise exception 'Algún servicio ya no existe. Actualiza la página.'; end if;
  perform app.check_when(b, p_date, p_start, v_dur);
  select count(*) into v_n from public.bookings
   where business_id = b.id and phone = p_phone and status in ('pendiente', 'confirmada', 'en curso')
     and date >= app.local_now(b.timezone)::date;
  if v_n >= b.max_active then
    raise exception 'Alcanzaste el máximo de % citas activas. Cancela o espera a que pase alguna.', b.max_active;
  end if;
  for v_cand in select * from public.pros
                 where business_id = b.id and active and not deleted and service_ids @> p_svc
                   and (coalesce(p_pro, 0) = 0 or id = p_pro) order by id loop
    v_err := app.slot_check(b.id, v_cand.id, p_date, p_start, v_dur, v_pre, v_post, v_res, p_svc, null);
    if v_err = '' then v_chosen := v_cand; exit; end if;
    v_first := coalesce(v_first, v_err);
  end loop;
  if v_chosen.id is null then
    raise exception '%', coalesce(v_first, 'Ningún profesional realiza todos esos servicios juntos.');
  end if;
  loop
    v_code := app.new_code();
    exit when not exists (select 1 from public.bookings x where x.business_id = b.id and x.code = v_code);
  end loop;
  v_st := case when b.auto_confirm then 'confirmada' else 'pendiente' end;
  insert into public.bookings (business_id, id, code, date, start_min, dur, pre, post, pro_id, pro_name, lines, total,
      svc_ids, res, res_names, name, phone, email, notes, status, source)
  values (b.id, nextval('app.booking_ids'), v_code, p_date, p_start, v_dur, v_pre, v_post, v_chosen.id, v_chosen.name,
      v_lines, v_total, p_svc, v_res,
      coalesce((select array_agg(r.name order by r.id) from public.resources r where r.business_id = b.id and r.id = any(v_res)), '{}'),
      p_name, p_phone, p_email, p_notes, v_st, 'online')
  returning * into k;
  insert into public.audit_log (business_id, who, text)
  values (b.id, 'Cliente ' || p_name, 'Nueva reserva ' || v_code || ' para ' || to_char(p_date, 'YYYY-MM-DD') || ' ' || app.fmt_time(p_start));
  if v_st = 'pendiente' then
    insert into public.notices (business_id, id, text)
    values (b.id, app.rid(), 'Nueva reserva pendiente de confirmar: ' || p_name || ' (' || to_char(p_date, 'DD/MM') || ' ' || app.fmt_time(p_start) || ').');
  end if;
  return app.booking_json(k, true);
end $$;

-- ---------------------------------------------------------------------
-- API del cliente con sesión (código por SMS): sus propias citas
-- ---------------------------------------------------------------------
create or replace function app.client_ctx(p_slug text) returns public.businesses
language plpgsql stable security definer set search_path = public, app as $$
declare b public.businesses;
begin
  if app.my_phone() is null then raise exception 'Inicia sesión con tu celular.'; end if;
  select * into b from public.businesses where slug = lower(p_slug);
  if not found then raise exception 'Negocio no encontrado.'; end if;
  return b;
end $$;

create or replace function public.my_bookings(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare b public.businesses := app.client_ctx(p_slug);
begin
  return coalesce((select jsonb_agg(app.booking_json(k, true) order by k.date desc, k.start_min desc)
    from public.bookings k where k.business_id = b.id and k.phone = app.my_phone()), '[]');
end $$;

create or replace function app.my_open_booking(b public.businesses, p_id bigint) returns public.bookings
language plpgsql volatile security definer set search_path = public, app as $$
declare k public.bookings;
begin
  select * into k from public.bookings where business_id = b.id and id = p_id and phone = app.my_phone() for update;
  if not found then raise exception 'Cita no encontrada.'; end if;
  if k.status not in ('pendiente', 'confirmada') or k.date < app.local_now(b.timezone)::date then
    raise exception 'Esta cita ya no se puede cambiar.';
  end if;
  if k.date + make_interval(mins => k.start_min) - app.local_now(b.timezone) < make_interval(hours => b.min_cancel_hours) then
    raise exception 'Faltan menos de % h para tu cita: para cambios, escribe al negocio.', b.min_cancel_hours;
  end if;
  return k;
end $$;

create or replace function public.cancel_my_booking(p_slug text, p_id bigint) returns jsonb
language plpgsql volatile security definer set search_path = public, app as $$
declare b public.businesses := app.client_ctx(p_slug); k public.bookings;
begin
  perform pg_advisory_xact_lock(hashtextextended(b.id::text, 0));
  k := app.my_open_booking(b, p_id);
  update public.bookings set status = 'cancelada' where business_id = b.id and id = k.id returning * into k;
  insert into public.audit_log (business_id, who, text) values (b.id, 'Cliente ' || k.name, 'Cita ' || k.code || ' (' || k.name || ') pasó a "cancelada"');
  insert into public.notices (business_id, id, text) values (b.id, app.rid(),
    'El cliente ' || k.name || ' canceló la cita del ' || to_char(k.date, 'DD/MM') || ' ' || app.fmt_time(k.start_min) || '.');
  return app.booking_json(k, true);
end $$;

create or replace function public.reschedule_my_booking(p_slug text, p_id bigint, p_date date, p_start int) returns jsonb
language plpgsql volatile security definer set search_path = public, app as $$
declare b public.businesses := app.client_ctx(p_slug); k public.bookings; v_err text; v_old text;
begin
  perform pg_advisory_xact_lock(hashtextextended(b.id::text, 0));
  k := app.my_open_booking(b, p_id);
  perform app.check_when(b, p_date, p_start, k.dur);
  v_err := app.slot_check(b.id, k.pro_id, p_date, p_start, k.dur, k.pre, k.post, k.res, '{}', k.id);
  if v_err <> '' then raise exception '%', v_err; end if;
  v_old := to_char(k.date, 'YYYY-MM-DD') || ' ' || app.fmt_time(k.start_min);
  update public.bookings set date = p_date, start_min = p_start where business_id = b.id and id = k.id returning * into k;
  insert into public.audit_log (business_id, who, text) values (b.id, 'Cliente ' || k.name, 'Reprogramó la cita ' || k.code || ' (antes ' || v_old || ')');
  return app.booking_json(k, true);
end $$;

create or replace function public.update_my_data(p_slug text, p_name text, p_email text) returns void
language plpgsql volatile security definer set search_path = public, app as $$
declare b public.businesses := app.client_ctx(p_slug);
begin
  p_name := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')); p_email := btrim(coalesce(p_email, ''));
  if char_length(p_name) not between 2 and 60 then raise exception 'Nombre de 2 a 60 caracteres.'; end if;
  if p_email <> '' and p_email !~ '^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$' then raise exception 'Correo no válido.'; end if;
  update public.bookings set name = p_name, email = p_email where business_id = b.id and phone = app.my_phone();
  insert into public.audit_log (business_id, who, text) values (b.id, 'Cliente ' || p_name, 'Corrigió sus datos');
end $$;

-- derecho de supresión (Ley 1581): cancela citas futuras y borra nombre, celular, correo y notas
create or replace function public.erase_my_data(p_slug text) returns void
language plpgsql volatile security definer set search_path = public, app as $$
declare b public.businesses := app.client_ctx(p_slug); v_ph text := app.my_phone();
begin
  update public.bookings set status = 'cancelada'
   where business_id = b.id and phone = v_ph and status in ('pendiente', 'confirmada') and date >= app.local_now(b.timezone)::date;
  update public.bookings set name = 'Cliente eliminado', phone = '', email = '', notes = '' where business_id = b.id and phone = v_ph;
  delete from public.client_notes where business_id = b.id and phone = v_ph;
  insert into public.audit_log (business_id, who, text) values (b.id, 'Cliente', 'Solicitud de eliminación de datos atendida');
  insert into public.notices (business_id, id, text) values (b.id, app.rid(), 'Un cliente eliminó sus datos personales.');
end $$;

-- ---------------------------------------------------------------------
-- API del negocio (usuarios con cuenta)
-- ---------------------------------------------------------------------
create or replace function public.my_businesses() returns jsonb
language sql stable security definer set search_path = public, app as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'slug', b.slug, 'name', b.name, 'role', m.role, 'proId', m.pro_id)
         order by m.created_at), '[]')
  from public.members m join public.businesses b on b.id = m.business_id where m.user_id = auth.uid()
$$;

create or replace function public.create_business(p_name text, p_slug text) returns jsonb
language plpgsql volatile security definer set search_path = public, app as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Inicia sesión primero.'; end if;
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

create or replace function public.create_invite(p_bid uuid, p_role text, p_pro bigint) returns text
language plpgsql volatile security definer set search_path = public, app as $$
declare v_code text;
begin
  if not app.is_admin(p_bid) then raise exception 'Solo el administrador puede invitar.'; end if;
  if p_role not in ('admin', 'staff') then raise exception 'Rol no válido.'; end if;
  if p_role = 'staff' and not exists (select 1 from public.pros where business_id = p_bid and id = p_pro and not deleted) then
    raise exception 'Empleado no encontrado.';
  end if;
  delete from public.invites where business_id = p_bid and used_by is null and (expires_at < now() or (p_role = 'staff' and pro_id = p_pro));
  loop
    v_code := app.new_code(8);
    exit when not exists (select 1 from public.invites where code = v_code);
  end loop;
  insert into public.invites (code, business_id, role, pro_id, created_by)
  values (v_code, p_bid, p_role, case when p_role = 'staff' then p_pro end, auth.uid());
  insert into public.audit_log (business_id, who, text) values (p_bid, 'Administrador',
    'Creó un código de invitación (' || case when p_role = 'staff' then 'empleado' else 'administrador' end || ')');
  return v_code;
end $$;

create or replace function public.accept_invite(p_code text) returns jsonb
language plpgsql volatile security definer set search_path = public, app as $$
declare i public.invites; b public.businesses; v_role text;
begin
  if auth.uid() is null then raise exception 'Inicia sesión primero.'; end if;
  select * into i from public.invites where code = upper(btrim(coalesce(p_code, ''))) for update;
  if not found or i.used_by is not null or i.expires_at < now() then raise exception 'El código no es válido o ya venció.'; end if;
  v_role := app.role_in(i.business_id);
  if v_role = 'owner' then raise exception 'Ya eres el dueño de este negocio.'; end if;
  insert into public.members (business_id, user_id, role, pro_id) values (i.business_id, auth.uid(), i.role, i.pro_id)
  on conflict (business_id, user_id) do update set role = excluded.role, pro_id = excluded.pro_id;
  update public.invites set used_by = auth.uid() where code = i.code;
  select * into b from public.businesses where id = i.business_id;
  insert into public.audit_log (business_id, who, text) values (b.id, 'Sistema',
    'Una cuenta se unió como ' || case when i.role = 'staff' then 'empleado' else 'administrador' end);
  return jsonb_build_object('id', b.id, 'slug', b.slug, 'name', b.name, 'role', i.role, 'proId', i.pro_id);
end $$;

-- ---------------------------------------------------------------------
-- Empleados: solo pueden cambiar el ESTADO de SUS citas, en orden lógico
-- ---------------------------------------------------------------------
create or replace function app.bookings_guard() returns trigger
language plpgsql as $$
declare v_ok boolean;
begin
  -- dentro de las funciones del servidor (security definer) current_user es el dueño: se confía en ellas
  if current_user not in ('authenticated', 'anon') or app.is_admin(new.business_id) then return new; end if;
  if tg_op <> 'UPDATE' or old.pro_id is distinct from app.my_pro(old.business_id) then
    raise exception 'Solo puedes cambiar tus propias citas.';
  end if;
  if (to_jsonb(new) - 'status' - 'occ') <> (to_jsonb(old) - 'status' - 'occ') then
    raise exception 'Como empleado solo puedes cambiar el estado de la cita.';
  end if;
  v_ok := (old.status, new.status) in (('pendiente', 'confirmada'), ('confirmada', 'en curso'), ('confirmada', 'completada'),
           ('confirmada', 'no asistió'), ('en curso', 'completada'), ('en curso', 'no asistió'));
  if not v_ok then raise exception 'Cambio de estado no permitido: % → %.', old.status, new.status; end if;
  if new.status in ('en curso', 'completada', 'no asistió')
     and old.date > (select app.local_now(timezone)::date from public.businesses where id = old.business_id) then
    raise exception 'No se puede iniciar ni cerrar una cita de un día futuro.';
  end if;
  return new;
end $$;
create trigger bookings_guard before insert or update on public.bookings
  for each row execute function app.bookings_guard();

-- el registro de cambios no se edita
create or replace function app.audit_append_only() returns trigger
language plpgsql as $$ begin raise exception 'El registro de cambios no se puede modificar.'; end $$;
create trigger audit_append_only before update or delete on public.audit_log
  for each row when (current_user in ('authenticated', 'anon')) execute function app.audit_append_only();

-- ---------------------------------------------------------------------
-- Seguridad por filas (RLS)
-- ---------------------------------------------------------------------
alter table public.businesses   enable row level security;
alter table public.members      enable row level security;
alter table public.invites      enable row level security;
alter table public.services     enable row level security;
alter table public.pros         enable row level security;
alter table public.pro_private  enable row level security;
alter table public.resources    enable row level security;
alter table public.blocks       enable row level security;
alter table public.bookings     enable row level security;
alter table public.client_notes enable row level security;
alter table public.notices      enable row level security;
alter table public.audit_log    enable row level security;

create policy biz_read   on public.businesses for select to authenticated using (app.is_member(id));
create policy biz_write  on public.businesses for update to authenticated using (app.is_admin(id)) with check (app.is_admin(id));

create policy mem_read   on public.members for select to authenticated using (user_id = auth.uid() or app.is_admin(business_id));
create policy mem_del    on public.members for delete to authenticated using (app.is_admin(business_id) and role <> 'owner');

create policy inv_read   on public.invites for select to authenticated using (app.is_admin(business_id));
create policy inv_del    on public.invites for delete to authenticated using (app.is_admin(business_id));

-- catálogo: lo leen todos los miembros, lo cambia el administrador
create policy svc_read   on public.services  for select to authenticated using (app.is_member(business_id));
create policy svc_write  on public.services  for all    to authenticated using (app.is_admin(business_id)) with check (app.is_admin(business_id));
create policy pro_read   on public.pros      for select to authenticated using (app.is_member(business_id));
create policy pro_write  on public.pros      for all    to authenticated using (app.is_admin(business_id)) with check (app.is_admin(business_id));
create policy res_read   on public.resources for select to authenticated using (app.is_member(business_id));
create policy res_write  on public.resources for all    to authenticated using (app.is_admin(business_id)) with check (app.is_admin(business_id));

create policy priv_all   on public.pro_private for all to authenticated using (app.is_admin(business_id)) with check (app.is_admin(business_id));

-- bloqueos: el administrador todo; el empleado ve los suyos y crea/quita sus "bloqueos" (no vacaciones)
create policy blk_admin  on public.blocks for all to authenticated using (app.is_admin(business_id)) with check (app.is_admin(business_id));
create policy blk_read   on public.blocks for select to authenticated using (pro_id = app.my_pro(business_id));
create policy blk_ins    on public.blocks for insert to authenticated with check (pro_id = app.my_pro(business_id) and type = 'bloqueo');
create policy blk_del    on public.blocks for delete to authenticated using (pro_id = app.my_pro(business_id) and type = 'bloqueo');

-- citas: el administrador todo; el empleado solo las suyas (y el disparador limita qué cambia)
create policy bk_admin   on public.bookings for all to authenticated using (app.is_admin(business_id)) with check (app.is_admin(business_id));
create policy bk_read    on public.bookings for select to authenticated using (pro_id = app.my_pro(business_id));
create policy bk_upd     on public.bookings for update to authenticated using (pro_id = app.my_pro(business_id)) with check (pro_id = app.my_pro(business_id));

create policy cn_all     on public.client_notes for all to authenticated using (app.is_admin(business_id)) with check (app.is_admin(business_id));

create policy nt_admin   on public.notices for all to authenticated using (app.is_admin(business_id)) with check (app.is_admin(business_id));
create policy nt_ins     on public.notices for insert to authenticated with check (app.is_member(business_id));

create policy au_read    on public.audit_log for select to authenticated using (app.is_admin(business_id));
create policy au_ins     on public.audit_log for insert to authenticated with check (app.is_member(business_id) and user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
grant select, insert, update, delete on public.services, public.pros, public.pro_private, public.resources, public.blocks,
  public.bookings, public.client_notes, public.notices to authenticated;
grant select, update on public.businesses to authenticated;
grant select, delete on public.members, public.invites to authenticated;
grant select, insert on public.audit_log to authenticated;

grant usage on schema app to anon, authenticated;
revoke execute on all functions in schema app from public, anon, authenticated;
grant execute on function app.role_in(uuid), app.is_admin(uuid), app.is_member(uuid), app.my_pro(uuid) to authenticated;
grant execute on function app.bookings_guard(), app.audit_append_only(), app.local_now(text) to anon, authenticated;

revoke execute on function public.public_catalog(text), public.book(text, bigint[], bigint, date, int, text, text, text, text, boolean),
  public.my_bookings(text), public.cancel_my_booking(text, bigint), public.reschedule_my_booking(text, bigint, date, int),
  public.update_my_data(text, text, text), public.erase_my_data(text), public.my_businesses(), public.create_business(text, text),
  public.create_invite(uuid, text, bigint), public.accept_invite(text) from public, anon, authenticated;  -- Supabase concede a anon explícitamente
grant execute on function public.public_catalog(text), public.book(text, bigint[], bigint, date, int, text, text, text, text, boolean)
  to anon, authenticated;
grant execute on function public.my_bookings(text), public.cancel_my_booking(text, bigint), public.reschedule_my_booking(text, bigint, date, int),
  public.update_my_data(text, text, text), public.erase_my_data(text), public.my_businesses(), public.create_business(text, text),
  public.create_invite(uuid, text, bigint), public.accept_invite(text) to authenticated;

-- ---------------------------------------------------------------------
-- Tiempo real: la agenda se actualiza sola cuando otro usuario cambia algo
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.bookings, public.blocks, public.notices;
  end if;
end $$;
