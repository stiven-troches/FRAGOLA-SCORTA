-- FRAGOLA PRENOTA · parche 01 · solo para proyectos que ya ejecutaron una versión anterior de schema.sql
-- Supabase concede a "anon" (visitantes sin cuenta) permiso de ejecutar funciones de forma explícita.
-- Esto se lo quita en las funciones que exigen sesión. Se puede ejecutar más de una vez.
-- Cómo: Supabase → SQL Editor → New query → pega este archivo → Run.
revoke execute on function
  public.my_bookings(text), public.cancel_my_booking(text, bigint), public.reschedule_my_booking(text, bigint, date, int),
  public.update_my_data(text, text, text), public.erase_my_data(text), public.my_businesses(), public.create_business(text, text),
  public.create_invite(uuid, text, bigint), public.accept_invite(text)
from anon;
