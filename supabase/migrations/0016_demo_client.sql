-- TEST BUILD: a demo client so a tasker can test the whole job flow on one phone
-- (design/tasker: "Simulate a new request (demo)", "Client accepts the initial offer (demo)").
-- Works only while otp_demo_mode is on. The demo client is profiles.is_demo = true; purge before launch.

do $$
declare uid uuid := extensions.uuid_generate_v5('6f1c2a7e-0000-4000-8000-000000000001'::uuid, 'demo-client');
begin
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values ('00000000-0000-0000-0000-000000000000',uid,'authenticated','authenticated','demo.client@tskr.demo',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}',
    '{"given_name":"Carla","family_name":"Reyes"}'::jsonb,now(),now())
  on conflict (id) do nothing;
  update public.profiles set is_demo = true, signup_role = 'client', email_verified_at = now(), phone_verified_at = now(),
    plan = 'plus', plus_until = now() + interval '5 years' where id = uid;
end $$;

create or replace function public.demo_client_id() returns uuid language sql immutable as
$$ select extensions.uuid_generate_v5('6f1c2a7e-0000-4000-8000-000000000001'::uuid, 'demo-client') $$;

-- Tasker Home › "Simulate a new request (demo)": the demo client books my first active skill near my base.
create or replace function public.demo_client_request() returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare me uuid := auth.uid(); c uuid := public.demo_client_id(); tp public.tasker_profiles; sk uuid; aid uuid; bid uuid;
        claims text := current_setting('request.jwt.claims', true);
begin
  if not coalesce((public.cfg('otp_demo_mode') #>> '{}')::boolean, false) then raise exception 'Demo mode is off.'; end if;
  select * into tp from public.tasker_profiles where user_id = me;
  if tp.user_id is null or tp.base_lat is null then raise exception 'Set your service area first.'; end if;
  if not tp.is_online then raise exception 'Go online first.'; end if;
  select id into sk from public.tasker_skills where tasker_id = me and status = 'active' order by slot limit 1;
  if sk is null then raise exception 'Add a skill first.'; end if;
  if (select count(*) from public.bookings where client_id = c and tasker_id = me
        and status not in ('completed','cancelled','declined_by_tasker')) >= 3 then
    raise exception 'Finish or decline your other test requests first.'; end if;

  -- a demo address about 1 km from the tasker's base
  select id into aid from public.addresses where user_id = c and abs(lat - (tp.base_lat + 0.008)) < 0.0001 and abs(lng - (tp.base_lng + 0.004)) < 0.0001;
  if aid is null then
    insert into public.addresses(user_id, label, street, unit, barangay, city, landmark, lat, lng, is_default)
    values (c, 'home', '45 Sample St (demo)', 'Unit 3A', 'Demo Barangay', coalesce(split_part(tp.area_label, ' · ', 1), 'Mandaluyong'),
            'Green gate (test address)', tp.base_lat + 0.008, tp.base_lng + 0.004, false)
    returning id into aid;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  bid := public.create_booking(me, jsonb_build_array(jsonb_build_object('tasker_skill_id', sk, 'qty', 1)), aid);
  perform set_config('request.jwt.claims', claims, true);
  return bid;
end $$;

-- Tasker Job › "Client accepts (demo)": the demo client answers whatever is waiting for them.
create or replace function public.demo_client_act(p_booking uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare b public.bookings; claims text := current_setting('request.jwt.claims', true); done text;
begin
  if not coalesce((public.cfg('otp_demo_mode') #>> '{}')::boolean, false) then raise exception 'Demo mode is off.'; end if;
  select * into b from public.bookings where id = p_booking;
  if b.id is null or b.tasker_id <> auth.uid() then raise exception 'not_your_booking'; end if;
  if b.client_id <> public.demo_client_id() then raise exception 'Only the demo client can be moved from the tasker app.'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', b.client_id, 'role', 'authenticated')::text, true);
  case b.status
    when 'offer_sent' then perform public.accept_offer(b.id, 20); done := 'Carla accepted your offer. Head over!';
    when 'final_price_sent' then perform public.respond_final_price(b.id, true); done := 'Carla accepted the final price. Tap Start job.';
    else raise exception 'Nothing for the client to do right now.';
  end case;
  perform set_config('request.jwt.claims', claims, true);
  return done;
end $$;

revoke execute on function public.demo_client_request() from public, anon;
revoke execute on function public.demo_client_act(uuid) from public, anon;

-- TEST BUILD: a demo tasker "drives" toward the client so the live map moves (demo mode + demo taskers only).
create or replace function public.demo_tasker_ping(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings; tp public.tasker_profiles; last record; tlat float8; tlng float8; nlat float8; nlng float8;
begin
  if not coalesce((public.cfg('otp_demo_mode') #>> '{}')::boolean, false) then return; end if;
  select * into b from public.bookings where id = p_booking;
  if b.id is null or b.client_id <> auth.uid() or b.status <> 'on_the_way' then return; end if;
  if not exists (select 1 from public.profiles where id = b.tasker_id and is_demo) then return; end if;
  select * into tp from public.tasker_profiles where user_id = b.tasker_id;
  tlat := (b.address->>'lat')::float8; tlng := (b.address->>'lng')::float8;
  select lat, lng into last from public.location_pings where booking_id = b.id order by created_at desc limit 1;
  if last is null then nlat := tp.base_lat; nlng := tp.base_lng;
  else nlat := last.lat + (tlat - last.lat) * 0.25; nlng := last.lng + (tlng - last.lng) * 0.25; end if;
  insert into public.location_pings(booking_id, user_id, lat, lng) values (b.id, b.tasker_id, nlat, nlng);
end $$;
revoke execute on function public.demo_tasker_ping(uuid) from public, anon;
