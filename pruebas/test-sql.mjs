// Pruebas de la base de datos (supabase/schema.sql) en PostgreSQL real.
// Ejecutar:  cd pruebas  &&  npm install  &&  node test-sql.mjs
import { makeDb, as, newUser, ANON } from './db.mjs';

const db = await makeDb();
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) pass++; else fail++; console.log((cond ? 'OK   ' : 'FAIL ') + name + (cond || !extra ? '' : '  → ' + extra)); };
const err = async (fn) => { try { await fn(); return ''; } catch (e) { return e.message; } };
const one = async (who, sql, p) => (await as(db, who, sql, p))[0];

// ---------- preparación ----------
const owner = await newUser(db, 'duena@ejemplo.test');
const other = await newUser(db, 'otro@ejemplo.test');
const staffU = await newUser(db, 'empleado@ejemplo.test');
const client = await newUser(db, null, '573001112233');
const client2 = await newUser(db, null, '573004445566');

ok('slug inválido rechazado', /dirección corta/.test(await err(() => as(db, owner, `select public.create_business('Mi barbería','A B')`))));
const biz = (await one(owner, `select public.create_business('Barbería Centro','barberia-centro') r`)).r;
ok('negocio creado', biz.slug === 'barberia-centro' && biz.role === 'owner');
ok('slug repetido rechazado', /ya está en uso/.test(await err(() => as(db, other, `select public.create_business('Copia','barberia-centro')`))));
const biz2 = (await one(other, `select public.create_business('Spa Norte','spa-norte') r`)).r;
const B = biz.id;

// horario: lunes a sábado 9-19, almuerzo 13-14
const sv = JSON.stringify([{ since: '', days: { 0: null, 1: [540, 1140], 2: [540, 1140], 3: [540, 1140], 4: [540, 1140], 5: [540, 1140], 6: [540, 1140] }, breaks: [{ from: 780, to: 840, label: 'Almuerzo', days: [1, 2, 3, 4, 5, 6] }] }]);
await as(db, owner, `
  insert into public.services (business_id,id,cat,name,dur,price) values ($1,1,'Cortes','Corte',30,25000),($1,2,'Barba','Barba',30,18000),($1,3,'Rostro','Facial',60,35000);
  `.trim(), [B]);
await as(db, owner, `insert into public.pros (business_id,id,name,service_ids,sv) values ($1,10,'Andrés','{1,2,3}',$2::jsonb),($1,20,'Camilo','{1,2}',$2::jsonb)`, [B, sv]);
await as(db, owner, `insert into public.pro_private (business_id,pro_id,phone,doc) values ($1,10,'3101234567','1020304050')`, [B]);
await as(db, owner, `update public.businesses set close_hour = 19 where id = $1`, [B]);

// fecha de prueba: el próximo martes con al menos 2 días de margen (siempre dentro de 14 días)
const D = (await db.query(`select (d + ((9 - extract(dow from d)::int) % 7))::text t from (select (now() at time zone 'America/Bogota')::date + 2 as d) x`)).rows[0].t;
const dow = (await db.query(`select extract(dow from $1::date)::int n`, [D])).rows[0].n;
ok('fecha de prueba es martes (' + D + ')', dow === 2);
const book = (who, a) => one(who, `select public.book($1,$2::bigint[],$3,$4::date,$5,$6,$7,$8,$9,$10) r`,
  ['barberia-centro', a.svc || [1], a.pro ?? 0, a.date || D, a.start, a.name || 'Cliente Prueba', a.phone || '3001112233', '', '', a.consent ?? true]).then(x => x.r);

// ---------- visitantes (anónimos) ----------
ok('anónimo NO lee citas', /permission denied/.test(await err(() => as(db, ANON, `select * from public.bookings`))));
ok('anónimo NO lee servicios directo', /permission denied/.test(await err(() => as(db, ANON, `select * from public.services`))));
ok('anónimo NO lee datos privados', /permission denied/.test(await err(() => as(db, ANON, `select * from public.pro_private`))));
const cat = (await one(ANON, `select public.public_catalog('barberia-centro') r`)).r;
ok('catálogo público: 3 servicios y 2 profesionales', cat.services.length === 3 && cat.pros.length === 2);
ok('catálogo público sin documento ni celular', !JSON.stringify(cat).includes('1020304050') && !JSON.stringify(cat).includes('3101234567'));
for (const f of [`create_business('x','xxx')`, `my_businesses()`, `accept_invite('X')`, `my_bookings('barberia-centro')`, `erase_my_data('barberia-centro')`]) {
  ok('anónimo sin permiso de ejecutar ' + f.split('(')[0], /permission denied/.test(await err(() => as(db, ANON, `select public.${f}`))));
}
ok('catálogo de negocio inexistente = null', (await one(ANON, `select public.public_catalog('no-existe') r`)).r === null);

// ---------- reservas ----------
const b1 = await book(ANON, { start: 600, pro: 10 });
ok('reserva válida confirmada con Andrés', b1.status === 'confirmada' && b1.proId === 10 && /^[A-Z0-9]{6}$/.test(b1.code));
ok('catálogo muestra la hora ocupada SIN nombre', (await one(ANON, `select public.public_catalog('barberia-centro') r`)).r.busy.some(x => x.start === 600 && x.name === undefined));
ok('cruce con el mismo profesional rechazado', /ocupado/.test(await err(() => book(ANON, { start: 600, pro: 10, phone: '3002223344' }))));
const b2 = await book(ANON, { start: 600, phone: '3002223344' });
ok('"cualquiera" asigna al profesional libre (Camilo)', b2.proId === 20);
ok('en el almuerzo rechazado', /descanso/.test(await err(() => book(ANON, { start: 780, phone: '3003334455' }))));
ok('servicio que el profesional no ofrece rechazado', /no ofrece|Ningún profesional/.test(await err(() => book(ANON, { svc: [3], pro: 20, start: 900, phone: '3003334455' }))));
ok('hora pasada rechazada', /anticipación/.test(await err(() => book(ANON, { date: '2020-01-07', start: 600, phone: '3003334455' }))));
ok('más allá de 14 días rechazado', /días adelante/.test(await err(() => book(ANON, { date: '2099-01-06', start: 600, phone: '3003334455' }))));
ok('hora fuera de la grilla (10:10) rechazada', /no es válida/.test(await err(() => book(ANON, { start: 610, phone: '3003334455' }))));
ok('fuera del horario (18:45 + 30 min) rechazado', /no es válida|Fuera del horario/.test(await err(() => book(ANON, { start: 1125, phone: '3003334455' }))));
ok('sin autorización de datos rechazado', /tratamiento de datos/.test(await err(() => book(ANON, { start: 900, consent: false, phone: '3003334455' }))));
ok('celular inválido rechazado', /10 dígitos/.test(await err(() => book(ANON, { start: 900, phone: '12345' }))));
await book(ANON, { start: 660 }); await book(ANON, { start: 720 });
ok('máximo de 3 citas activas por celular', /máximo de 3/.test(await err(() => book(ANON, { start: 900 }))));

// ---------- la base de datos impide cruces aunque se escriba directo ----------
ok('administrador NO puede crear cita cruzada (restricción)', /no_overlap|exclusion/.test(await err(() => as(db, owner,
  `insert into public.bookings (business_id,id,code,date,start_min,dur,pro_id,name) values ($1,999,'ZZZZZZ',$2,620,30,10,'X')`, [B, D]))));
await as(db, owner, `update public.bookings set status='cancelada' where business_id=$1 and id=$2`, [B, b1.id]);
const b3 = await book(ANON, { start: 600, pro: 10, phone: '3005556677' });
ok('cita cancelada libera el horario', b3.proId === 10);

// ---------- recursos (capacidad) ----------
await as(db, owner, `update public.businesses set features='{"buffers":true,"resources":true}' where id=$1`, [B]);
await as(db, owner, `insert into public.resources (business_id,id,name,qty) values ($1,7,'Cabinas',1)`, [B]);
await as(db, owner, `update public.services set res=7, post=10 where business_id=$1 and id=1`, [B]);
const r1 = await book(ANON, { start: 960, pro: 10, phone: '3006667788' });
ok('cita con recurso guarda limpieza y recurso', r1.post === 10 && r1.res[0] === 7 && r1.resNames[0] === 'Cabinas');
ok('sin cabina libre: otro profesional a la misma hora rechazado', /No hay Cabinas/.test(await err(() => book(ANON, { start: 960, pro: 20, phone: '3007778899' }))));
ok('limpieza cuenta: 16:30 con el mismo profesional rechazado', /ocupado|Cabinas/.test(await err(() => book(ANON, { start: 990, pro: 10, phone: '3007778899' }))));
const r2 = await book(ANON, { start: 1020, pro: 20, phone: '3007778899' });
ok('17:00 (después de la limpieza) sí se puede', r2.proId === 20);

// ---------- aislamiento entre negocios ----------
ok('otro negocio NO ve mis citas', (await as(db, other, `select * from public.bookings where business_id=$1`, [B])).length === 0);
ok('otro negocio NO puede escribir en el mío', /row-level security/.test(await err(() => as(db, other,
  `insert into public.services (business_id,id,name,dur,price) values ($1,50,'Intruso',30,1)`, [B]))));
ok('otro negocio NO puede cambiar mis ajustes', (await as(db, other, `update public.businesses set name='Hackeado' where id=$1 returning id`, [B])).length === 0);

// ---------- empleados ----------
ok('solo el admin crea invitaciones', /Solo el administrador/.test(await err(() => as(db, other, `select public.create_invite($1,'staff',10)`, [B]))));
const code = (await one(owner, `select public.create_invite($1,'staff',10) r`, [B])).r;
ok('código inválido rechazado', /no es válido/.test(await err(() => as(db, staffU, `select public.accept_invite('XXXXXXXX')`))));
const acc = (await one(staffU, `select public.accept_invite($1) r`, [code])).r;
ok('empleado se une con el código', acc.role === 'staff' && acc.proId === 10);
ok('el código no se puede reusar', /no es válido/.test(await err(() => as(db, other, `select public.accept_invite($1)`, [code]))));
const mine = await as(db, staffU, `select id, pro_id from public.bookings where business_id=$1`, [B]);
ok('empleado ve solo SUS citas', mine.length > 0 && mine.every(x => Number(x.pro_id) === 10));
ok('empleado NO ve datos privados', (await as(db, staffU, `select * from public.pro_private`)).length === 0);
ok('empleado NO ve el registro', (await as(db, staffU, `select * from public.audit_log`)).length === 0);
ok('empleado NO cambia precios de su cita', /solo puedes cambiar el estado/.test(await err(() => as(db, staffU,
  `update public.bookings set total=1 where business_id=$1 and id=$2`, [B, b3.id]))));
ok('empleado NO completa una cita de día futuro', /día futuro/.test(await err(() => as(db, staffU,
  `update public.bookings set status='completada' where business_id=$1 and id=$2`, [B, b3.id]))));
const today = (await db.query(`select (now() at time zone 'America/Bogota')::date::text t`)).rows[0].t;
await as(db, owner, `insert into public.bookings (business_id,id,code,date,start_min,dur,pro_id,name,phone) values ($1,5001,'HOY001',$2,0,15,10,'Hoy','3009990000'),($1,5002,'HOY002',$2,0,15,20,'Hoy2','3009990001')`, [B, today]);
const upd = await as(db, staffU, `update public.bookings set status='completada' where business_id=$1 and id=5001 returning status`, [B]);
ok('empleado completa su cita de hoy', upd.length === 1 && upd[0].status === 'completada');
ok('empleado NO pasa de completada a pendiente', /no permitido/.test(await err(() => as(db, staffU,
  `update public.bookings set status='pendiente' where business_id=$1 and id=5001`, [B]))));
ok('empleado NO toca citas de otro', (await as(db, staffU, `update public.bookings set status='completada' where business_id=$1 and id=5002 returning id`, [B])).length === 0);
ok('empleado NO crea citas', /row-level security|propias/.test(await err(() => as(db, staffU,
  `insert into public.bookings (business_id,id,code,date,start_min,dur,pro_id,name) values ($1,6001,'NUEVA1',$2,900,30,10,'X')`, [B, D]))));
await as(db, staffU, `insert into public.blocks (business_id,id,pro_id,date,start_min,end_min,type) values ($1,71,10,$2,1080,1140,'bloqueo')`, [B, D]);
ok('empleado crea su bloqueo', (await as(db, staffU, `select id from public.blocks where business_id=$1 and id=71`, [B])).length === 1);
ok('empleado NO se pone vacaciones', /row-level security/.test(await err(() => as(db, staffU,
  `insert into public.blocks (business_id,id,pro_id,date,start_min,end_min,type) values ($1,72,10,$2,0,1440,'vacaciones')`, [B, D]))));
ok('empleado NO bloquea a otro', /row-level security/.test(await err(() => as(db, staffU,
  `insert into public.blocks (business_id,id,pro_id,date,start_min,end_min,type) values ($1,73,20,$2,600,660,'bloqueo')`, [B, D]))));
ok('el bloqueo impide reservar a esa hora', /bloqueado/.test(await err(() => book(ANON, { start: 1080, pro: 10, phone: '3008889900' }))));

// ---------- clientes con sesión por SMS ----------
const myb = (await one(client, `select public.my_bookings('barberia-centro') r`)).r;
ok('cliente ve solo sus citas', myb.length === 3 && myb.every(x => x.phone === '3001112233'));
ok('otro cliente no ve citas ajenas', (await one(client2, `select public.my_bookings('barberia-centro') r`)).r.length === 0);
ok('sin sesión no hay "mis citas"', /permission denied|Inicia sesión/.test(await err(() => as(db, ANON, `select public.my_bookings('barberia-centro')`))));
ok('cliente NO cancela cita ajena', /no encontrada/.test(await err(() => as(db, client, `select public.cancel_my_booking('barberia-centro',$1)`, [b2.id]))));
const target = myb.find(x => x.status === 'confirmada');
const moved = (await one(client, `select public.reschedule_my_booking('barberia-centro',$1,$2::date,$3) r`, [target.id, D, 900])).r;
ok('cliente reprograma a una hora libre', moved.start === 900);
ok('cliente NO reprograma a hora ocupada', /ocupado|Cabinas/.test(await err(() => as(db, client,
  `select public.reschedule_my_booking('barberia-centro',$1,$2::date,$3)`, [target.id, D, 960]))));
// cita de mañana (creada por el negocio): con plazo de 72 h ya no se puede cancelar en línea
const tomorrow = (await db.query(`select ((now() at time zone 'America/Bogota')::date + 1)::text t`)).rows[0].t;
await as(db, owner, `insert into public.bookings (business_id,id,code,date,start_min,dur,pro_id,name,phone) values ($1,5003,'MANANA',$2,1380,15,20,'Cliente Prueba','3001112233')`, [B, tomorrow]);
await as(db, owner, `update public.businesses set min_cancel_hours=72 where id=$1`, [B]);
ok('dentro del plazo mínimo NO se puede cancelar', /Faltan menos/.test(await err(() => as(db, client, `select public.cancel_my_booking('barberia-centro',5003)`))));
await as(db, owner, `update public.businesses set min_cancel_hours=2 where id=$1`, [B]);
const c = (await one(client, `select public.cancel_my_booking('barberia-centro',$1) r`, [target.id])).r;
ok('cliente cancela con anticipación', c.status === 'cancelada');
ok('el negocio recibe aviso de la cancelación', (await as(db, owner, `select text from public.notices where business_id=$1`, [B])).some(n => /canceló/.test(n.text)));
await as(db, client, `select public.erase_my_data('barberia-centro')`);
const after = await as(db, owner, `select name, phone, status from public.bookings where business_id=$1 and name='Cliente eliminado'`, [B]);
ok('borrar mis datos anonimiza y cancela las futuras', after.length === 4 && after.every(x => x.phone === '' && x.status === 'cancelada'));

// ---------- registro ----------
ok('el registro existe', (await as(db, owner, `select count(*)::int n from public.audit_log where business_id=$1`, [B]))[0].n > 5);
ok('el registro NO se puede editar', /no se puede modificar|permission denied/.test(await err(() => as(db, owner, `update public.audit_log set text='x' where business_id=$1`, [B]))));
ok('el registro NO se puede borrar', /no se puede modificar|permission denied/.test(await err(() => as(db, owner, `delete from public.audit_log where business_id=$1`, [B]))));
ok('no se puede firmar el registro como otra persona', /row-level security/.test(await err(() => as(db, owner,
  `insert into public.audit_log (business_id,who,text,user_id) values ($1,'x','y',$2)`, [B, other.id]))));
ok('mis negocios: dueño ve el suyo', (await one(owner, `select public.my_businesses() r`)).r.map(x => x.slug).join() === 'barberia-centro');

console.log(`\n${pass} OK, ${fail} con fallas`);
process.exit(fail ? 1 : 0);
