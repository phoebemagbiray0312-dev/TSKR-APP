-- Tasker app part 1: home summary, online switch, service area, job list.

create or replace function public.get_booking(p_booking uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b public.bookings; c public.profiles; t public.profiles; tp public.tasker_profiles; revealed boolean; me_client boolean;
begin
  select * into b from public.bookings where id = p_booking;
  if b.id is null or auth.uid() not in (b.client_id, b.tasker_id) then raise exception 'not_your_booking'; end if;
  select * into c from public.profiles where id = b.client_id;
  select * into t from public.profiles where id = b.tasker_id;
  select * into tp from public.tasker_profiles where user_id = b.tasker_id;
  revealed := b.offer_accepted_at is not null; me_client := auth.uid() = b.client_id;
  return to_jsonb(b) - 'arrival_code' - 'address' - 'dropoff_address' || jsonb_build_object(
    'arrival_code', case when me_client then b.arrival_code end,
    'address', case when me_client or revealed then b.address else b.address - 'street' - 'unit' - 'landmark' end,
    'dropoff_address', b.dropoff_address,
    'client_name', case when revealed then c.first_name || ' ' || c.last_name else public.mask_name(c.first_name, c.last_name) end,
    'tasker_name', case when revealed then t.first_name || ' ' || t.last_name else public.mask_name(t.first_name, t.last_name) end,
    'client_initials', upper(left(c.first_name,1) || left(c.last_name,1)),
    'tasker_initials', upper(left(t.first_name,1) || left(t.last_name,1)),
    'tasker_photo', tp.photo_path,
    'tasker_qr', case when revealed and me_client then jsonb_build_object('path', tp.payment_qr_path, 'wallet', tp.qr_wallet_type) end,
    'items', (select coalesce(jsonb_agg(to_jsonb(i) order by i.name), '[]') from public.booking_items i where i.booking_id = b.id),
    'fee_coins_due', public.booking_fee_for(b),
    'client_rating', (select round(avg(rating)::numeric,1) from public.reviews where reviewee_id = b.client_id),
    'tasker_is_demo', t.is_demo,
    'me', case when me_client then 'client' else 'tasker' end);
end $$;

-- Home (design: tasker HOME + HEADER)
create or replace function public.tasker_home() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); p public.profiles; tp public.tasker_profiles; fee int := public.cfg_int('booking_fee');
begin
  select * into p from public.profiles where id = uid;
  if not p.is_tasker then raise exception 'tasker_only'; end if;
  select * into tp from public.tasker_profiles where user_id = uid;
  return jsonb_build_object(
    'full_name', p.first_name || ' ' || p.last_name, 'short_name', left(p.first_name,1) || '. ' || p.last_name,
    'nickname', tp.nickname, 'photo', tp.photo_path, 'online', tp.is_online, 'radius_km', tp.radius_km,
    'area_label', tp.area_label, 'base_set', tp.base_lat is not null, 'qr_status', tp.qr_status,
    'require_qr', coalesce((public.cfg('require_payment_qr') #>> '{}')::boolean, true),
    'rating', tp.rating_avg, 'rating_count', tp.rating_count, 'jobs_done', tp.jobs_done,
    'coins', public.coin_balance(uid), 'fee', fee, 'repeat_fee', public.cfg_int('repeat_client_fee'),
    'skills', (select count(*) from public.tasker_skills where tasker_id = uid and status = 'active'),
    'skills_pending', (select count(*) from public.tasker_skills where tasker_id = uid and status = 'pending_review'),
    'today_jobs', (select count(*) from public.bookings where tasker_id = uid and status = 'completed'
                   and (completed_at at time zone 'Asia/Manila')::date = public.manila_today()),
    'today_earned', (select coalesce(sum(coalesce(final_price, initial_offer)),0) from public.bookings where tasker_id = uid and status = 'completed'
                   and (completed_at at time zone 'Asia/Manila')::date = public.manila_today()),
    'requests', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', b.id, 'code', b.code, 'created_at', b.created_at, 'when_type', b.when_type, 'scheduled_at', b.scheduled_at,
                    'client', public.mask_name(c.first_name, c.last_name), 'area', b.address->>'barangay' || ', ' || (b.address->>'city'),
                    'km', case when tp.base_lat is not null then round(public.km_between(tp.base_lat, tp.base_lng, (b.address->>'lat')::float8, (b.address->>'lng')::float8)::numeric, 1) end,
                    'total', b.starting_total, 'repeat', b.is_repeat_client, 'delivery', b.is_delivery,
                    'service', (select string_agg(i.qty || '× ' || i.name, ', ') from public.booking_items i where i.booking_id = b.id))
                  order by b.created_at), '[]')
                 from public.bookings b join public.profiles c on c.id = b.client_id where b.tasker_id = uid and b.status = 'requested'),
    'active', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', b.id, 'code', b.code, 'status', b.status,
                    'client', case when b.offer_accepted_at is not null then c.first_name || ' ' || c.last_name else public.mask_name(c.first_name, c.last_name) end,
                    'area', b.address->>'barangay' || ', ' || (b.address->>'city'),
                    'total', coalesce(b.final_price, b.initial_offer, b.starting_total),
                    'service', (select string_agg(i.name, ', ') from public.booking_items i where i.booking_id = b.id))
                  order by b.updated_at desc), '[]')
                 from public.bookings b join public.profiles c on c.id = b.client_id
                 where b.tasker_id = uid and b.status not in ('requested','completed','cancelled','declined_by_tasker')));
end $$;

-- Online / Offline (header toggle). Going online needs a skill, a service area, a payment QR and coins.
create or replace function public.set_online(p_on boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); tp public.tasker_profiles;
begin
  select * into tp from public.tasker_profiles where user_id = uid;
  if tp.user_id is null or not exists (select 1 from public.profiles where id = uid and is_tasker and tasker_status = 'active') then
    raise exception 'Your tasker account isn''t active yet.'; end if;
  if p_on then
    if not exists (select 1 from public.tasker_skills where tasker_id = uid and status = 'active') then raise exception 'Add at least 1 skill first.'; end if;
    if tp.base_lat is null then raise exception 'Set your service area first.'; end if;
    if coalesce((public.cfg('require_payment_qr') #>> '{}')::boolean, true) and tp.qr_status <> 'approved' then
      raise exception 'Upload your payment QR first (Me › Payment QR).'; end if;
    if public.coin_balance(uid) < public.cfg_int('booking_fee') then raise exception 'Buy coins first.'; end if;
  end if;
  update public.tasker_profiles set is_online = p_on, updated_at = now() where user_id = uid;
  return p_on;
end $$;

-- Service area: where the tasker starts from (kept private) and how far they travel
create or replace function public.set_service_area(p_lat double precision, p_lng double precision, p_area_label text, p_radius_km numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_radius_km < 1 or p_radius_km > 6 then raise exception 'Radius must be 1 to 6 km.'; end if;
  if coalesce(trim(p_area_label),'') = '' then raise exception 'Add your area, e.g. Mandaluyong · Pasig.'; end if;
  update public.tasker_profiles set base_lat = p_lat, base_lng = p_lng, area_label = trim(p_area_label), radius_km = p_radius_km, updated_at = now()
  where user_id = auth.uid();
  if not found then raise exception 'tasker_only'; end if;
end $$;

-- Job tab / history
create or replace function public.tasker_jobs() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'active')::boolean desc, x->>'created_at' desc), '[]'::jsonb) from (
    select jsonb_build_object('id', b.id, 'code', b.code, 'status', b.status, 'created_at', b.created_at,
      'active', b.status not in ('completed','cancelled','declined_by_tasker'),
      'total', coalesce(b.final_price, b.initial_offer, b.starting_total),
      'client', case when b.offer_accepted_at is not null then c.first_name || ' ' || c.last_name else public.mask_name(c.first_name, c.last_name) end,
      'service', (select string_agg(i.name, ', ') from public.booking_items i where i.booking_id = b.id)) x
    from public.bookings b join public.profiles c on c.id = b.client_id
    where b.tasker_id = auth.uid() order by b.created_at desc limit 50) z
$$;

revoke execute on function public.tasker_home() from public, anon;
revoke execute on function public.set_online(boolean) from public, anon;
revoke execute on function public.set_service_area(double precision,double precision,text,numeric) from public, anon;
revoke execute on function public.tasker_jobs() from public, anon;
