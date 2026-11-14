-- Background jobs (pg_cron): expire unanswered requests, detect no-shows, weekly skill charge, cleanup.
create extension if not exists pg_cron;

insert into public.app_config(key, value, description, status) values
  ('request_expiry_minutes', '15', 'A request the tasker doesn’t reply to is closed after this many minutes', 'agreed'),
  ('no_show_minutes', '60', 'Minutes past the ETA before an on-the-way tasker who never arrived counts as a no-show (2 strikes)', 'placeholder')
on conflict (key) do nothing;

-- 1. requests nobody replied to
create or replace function public.job_expire_requests() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select b.id, b.tasker_id from public.bookings b
           where b.status = 'requested' and b.created_at < now() - make_interval(mins => public.cfg_int('request_expiry_minutes'))
           for update skip locked loop
    update public.bookings set cancel_reason = 'tasker_no_reply', cancelled_at = now() where id = r.id;
    perform public._move(r.id, 'cancelled', 'The tasker didn’t reply in time. Nobody is charged. Please book another tasker.');
    perform public.notify(r.tasker_id, 'request_expired', 'Request expired', 'You didn’t reply within ' || public.cfg_int('request_expiry_minutes') || ' minutes. No strike.', jsonb_build_object('booking_id', r.id));
    n := n + 1;
  end loop;
  return n;
end $$;

-- 2. taskers who never arrived (skipped when the tasker's phone shows them at the address, and for demo clients)
create or replace function public.job_detect_no_shows() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select b.id from public.bookings b join public.profiles c on c.id = b.client_id
           where b.status = 'on_the_way' and not c.is_demo
             and coalesce(b.eta_at, b.offer_accepted_at + interval '60 minutes') + make_interval(mins => public.cfg_int('no_show_minutes')) < now()
             and not exists (select 1 from public.location_pings p where p.booking_id = b.id and p.user_id = b.tasker_id
                             and p.created_at > now() - interval '30 minutes'
                             and public.km_between(p.lat, p.lng, (b.address->>'lat')::float8, (b.address->>'lng')::float8) <= 0.15)
           for update of b skip locked loop
    perform public.mark_no_show(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- 3. housekeeping
create or replace function public.job_cleanup() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.otp_codes where expires_at < now() - interval '1 day';
  delete from public.location_pings p using public.bookings b
   where b.id = p.booking_id and b.status in ('completed','cancelled','declined_by_tasker') and p.created_at < now() - interval '1 day';
end $$;

revoke execute on function public.job_expire_requests() from public, anon, authenticated;
revoke execute on function public.job_detect_no_shows() from public, anon, authenticated;
revoke execute on function public.job_cleanup() from public, anon, authenticated;
revoke execute on function public.charge_weekly_skills() from public, anon, authenticated;
revoke execute on function public.mark_no_show(uuid) from public, anon;

-- schedules (UTC). Manila = UTC+8.
select cron.schedule('tskr-expire-requests', '* * * * *', 'select public.job_expire_requests()');
select cron.schedule('tskr-no-shows', '*/5 * * * *', 'select public.job_detect_no_shows()');
select cron.schedule('tskr-weekly-skills', '5 16 * * 0', 'select public.charge_weekly_skills()'); -- Mon 00:05 Manila
select cron.schedule('tskr-cleanup', '0 19 * * *', 'select public.job_cleanup()');             -- 03:00 Manila
