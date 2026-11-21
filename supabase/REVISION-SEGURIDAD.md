# Revisión de seguridad de PRENOTA (tarea SEG-14)

Se revisaron `supabase/schema.sql`, `supabase/parche-01-permisos.sql`, `index.html` y `config.js`.
**No se tuvo acceso a la base real**: lo que sigue sale de leer los archivos. Para comprobar cómo está
la base de verdad, ejecuta las consultas del final (sección "Cómo verificar").

## Resumen en una frase

La clave `anon` de `config.js` **no permite leer ni modificar tablas**: el diseño es bueno (RLS activo en las 12 tablas,
los visitantes solo reservan por funciones que validan todo). No hay hallazgos críticos en el diseño. Hay detalles
que endurecer y un par de ajustes en el panel de Supabase que SQL no puede hacer.

## Qué puede hacer hoy la clave anon

| Pieza | Resultado |
|---|---|
| Leer o escribir tablas | **No** (RLS activo y `revoke all` a anon). |
| Funciones que sí puede ejecutar | Solo `public_catalog(slug)` y `book(...)`. Es lo que necesita la página de reservas. |
| Funciones de cuenta (`my_bookings`, `create_business`, `accept_invite`...) | Bloqueadas para anon (lo hacía `schema.sql`; el parche 01 lo repetía). |
| Esquema interno `app` | Anon tenía permiso de entrada innecesario (ver hallazgo 4). |
| Vistas | No existen vistas: nada se salta RLS. |
| Storage (buckets) | `schema.sql` no crea ninguno y `index.html` no usa Storage (las fotos van como texto en `pros.photo`). Confirma en el panel que no existan buckets públicos. |
| `service_role` o claves secretas | No aparecen en `index.html` ni en `config.js`. |

Qué usa realmente `index.html`: tablas `businesses`, `services`, `pros`, `pro_private`, `resources`, `blocks`, `bookings`,
`client_notes`, `notices`, `audit_log` (siempre filtradas por `business_id`, solo con sesión de administrador o empleado),
tiempo real en `bookings`, `blocks` y `notices`, y las RPC `public_catalog`, `book`, `my_bookings`, `cancel_my_booking`,
`reschedule_my_booking`, `update_my_data`, `erase_my_data`, `my_businesses`, `create_business`, `create_invite`, `accept_invite`.
No usa `members` ni `invites` directamente salvo lectura/borrado por las políticas. Los permisos del parche cubren exactamente eso.

## Hallazgos, de más a menos grave

### 1. MEDIO: cualquiera con un celular puede crear negocios falsos
`create_business` está abierta a cualquier cuenta con sesión, incluidos los **clientes que entran con código SMS** (y
usuarios anónimos si activas esa opción). Con muchas cuentas, alguien puede llenar la base de negocios falsos y "apartar"
direcciones cortas. **Corregido en el parche (sección 5):** solo cuentas con correo.

### 2. MEDIO: abuso de las reservas y del SMS (no se arregla con SQL)
- `book()` la puede llamar cualquiera sin límite por ritmo: con muchos celulares inventados se puede llenar la agenda de
  citas falsas. El tope de citas por celular no lo impide.
- El inicio de sesión por SMS cuesta dinero por mensaje: un abusador puede generar facturas de SMS.
**Qué hacer (panel de Supabase):** Authentication → Attack Protection: activar **CAPTCHA** (hCaptcha o Turnstile) y revisar los
límites de SMS en Authentication → Rate Limits. Para reservas: vigilar las citas "pendiente", o desactivar `auto_confirm` si hay abuso.

### 3. BAJO: el catálogo público mostraba el código de las citas de otros
`public_catalog` devolvía en `busy` el código de 6 caracteres de cada cita (con fecha, hora y profesional). El código no
da acceso a nada por sí solo (las citas del cliente se piden por su celular verificado), pero no hay motivo para publicarlo.
**Corregido (sección 4).** La pantalla del cliente no lo necesita (usa el código solo de sus propias citas).

### 4. BAJO: permisos de sobra para anon en el esquema interno `app`
Anon tenía `usage` en el esquema `app` y `execute` sobre `local_now` y las funciones de disparador. No daba acceso a datos,
pero amplía la superficie sin necesidad. **Corregido (sección 2b):** `app` queda solo para `authenticated`.

### 5. BAJO: `search_path` sin fijar
Las funciones `SECURITY DEFINER` **sí** tenían `search_path` fijo. Quedaban sin fijar las funciones de apoyo sin
`SECURITY DEFINER` (`fmt_time`, `rid`, `new_code`, `local_now`, `my_phone`, `sched_at`, `check_when`, `bookings_guard`,
`audit_append_only`), que el Security Advisor de Supabase marca como alerta. Además, el `search_path` de las demás no incluía `pg_temp`
al final. **Corregido (sección 3):** se fija en todas las funciones propias, sin tocar las de extensiones.

### 6. BAJO: tablas y funciones nuevas quedarían abiertas
Supabase concede por defecto permisos a `anon` sobre todo lo que se cree después en `public`. Si mañana alguien crea una tabla
desde el panel y olvida RLS, quedaría legible con la clave anon. **Corregido (secciones 1 y 6):** el parche activa RLS en
cualquier tabla sin RLS y cambia los permisos por defecto. Efecto: si creas objetos nuevos, deberás conceder permisos a mano.

### 7. INFORMATIVO (sin cambio automático)
- **Invitaciones:** el código de 8 caracteres da rol de administrador o empleado; tiene ~10^12 combinaciones y caduca en 7 días,
  aceptable. No hay límite de intentos por usuario.
- **Registro de cambios (`audit_log`):** un empleado puede escribir líneas con el nombre (`who`) que quiera. No puede editar
  ni borrar las existentes.
- **Administradores** pueden borrar a otros administradores (no al dueño). Es una decisión de negocio.
- **`btree_gist`** está instalada en `public` (aviso menor del Advisor). Moverla no es necesario y es arriesgado.
- **Realtime:** solo `bookings`, `blocks` y `notices`, y respeta RLS (un visitante no recibe nada).
- **`config.js`:** la clave `anon` es pública por diseño (viaja en `index.html`). Es segura mientras RLS esté bien, que es lo que
  garantiza este parche. Nunca pongas la `service_role` ahí.

## Pasos para aplicar el parche (dueño)

1. Supabase → **Database → Backups**: confirma que hay una copia reciente (o descarga una).
2. Supabase → **SQL Editor → New query**.
3. Abre `supabase/parche-02-seguridad.sql`, copia **todo** el contenido, pégalo y pulsa **Run**. Debe terminar en "Success".
   Se puede ejecutar más de una vez. Reemplaza al parche 01.
4. Ejecuta las consultas de "Cómo verificar" (abajo): todas deben dar el resultado esperado.
5. Prueba la app: abre la página de reservas (debe cargar y reservar), entra como administrador (debe ver su agenda) y como cliente por SMS.
6. En el panel, configura lo que SQL no puede:
   - **Authentication → Attack Protection:** activar CAPTCHA.
   - **Authentication → Providers → Email:** dejar **Confirm email** activado.
   - **Authentication → Sign In / Providers:** mantener **Anonymous sign-ins** desactivado.
   - **Storage:** confirmar que no hay buckets públicos.
   - **Advisors → Security Advisor:** ejecutar y revisar que no queden alertas rojas.

## Si `config.js` llegó a GitHub: rotar la clave

El `.gitignore` de la raíz ya excluye `config.js` (y `dist*/`), pero **eso no borra lo que ya se subió**: queda en el historial.
Revisa en GitHub (busca el archivo en el historial del repositorio). Si estuvo ahí:

1. Supabase → **Settings → API** (en proyectos nuevos: **API Keys**) → regenera la clave `anon` (rota el secreto JWT, o
   crea una clave publicable nueva y desactiva la anterior).
2. Pon la clave nueva en `config.js` local (copia de `config.example.js`) y vuelve a publicar (`dist/` se genera con el build).
3. Si rotaste el secreto JWT, las sesiones abiertas se cierran: es normal.
4. Aunque la clave anon es pública por diseño, rotarla corta cualquier uso externo ya conocido. Si alguna vez se subió una
   clave `service_role`, rótala de inmediato: esa sí da control total.
5. Opcional: limpiar el historial de Git (`git filter-repo`) y hacer push forzado; sin rotar, limpiar no basta.

Nota: `dist/config.js` se publica en el sitio a propósito (el navegador necesita la clave); no es una fuga.

## Cómo verificar (SQL Editor, solo lectura)

```sql
-- 1. Tablas sin RLS: debe devolver 0 filas
select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity;

-- 2. Permisos de anon sobre tablas: debe devolver 0 filas
select table_name, privilege_type from information_schema.role_table_grants
 where grantee in ('anon','PUBLIC') and table_schema = 'public';

-- 3. Funciones que anon puede ejecutar: solo public_catalog y book
select routine_name from information_schema.routine_privileges
 where grantee = 'anon' and routine_schema in ('public','app');

-- 4. Funciones propias sin search_path fijo: debe devolver 0 filas
select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('app','public') and p.prokind = 'f' and p.proconfig is null
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');

-- 5. Vistas en public (se saltan RLS si no son security_invoker): debe devolver 0 filas
select c.relname, c.reloptions from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('v','m');

-- 6. Buckets de Storage: debe devolver 0 filas, o ninguno con public = true
select id, public from storage.buckets;
```

## Validación del parche

El parche se probó con `pruebas/test-sql.mjs` (PostgreSQL real vía PGlite, sin red de ejecución) en una copia fuera del proyecto:
`schema.sql` + parche (aplicado dos veces) → **69 pruebas OK, 0 fallas**. Pruebas extra: cliente SMS y usuario anónimo ya no pueden
crear negocios; anon no entra al esquema `app` ni lee tablas; el catálogo no muestra códigos; 0 funciones sin `search_path`;
0 tablas sin RLS; 0 permisos de tabla para anon. No se ejecutó nada contra la base real.
