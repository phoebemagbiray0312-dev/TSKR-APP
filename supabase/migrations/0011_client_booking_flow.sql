-- Client app part 2: addresses, chat, my bookings, and a demo stand-in for the tasker side.

-- ---------- addresses ----------
create or replace function public.save_address(
  p_label text, p_street text, p_barangay text, p_city text, p_lat double precision, p_lng double precision,
  p_unit text default null, p_landmark text default null, p_custom_label text default null,
  p_default boolean default false, p_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); aid uuid; first_one boolean;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if coalesce(trim(p_street),'') = '' or coalesce(trim(p_barangay),'') = '' or coalesce(trim(p_city),'') = '' then
    raise exception 'Fill in the street, barangay and city.'; end if;
  if p_label not in ('home','work','partner','other') then raise exception 'Pick a label.'; end if;
  first_one := not exists (select 1 from public.addresses where user_id = uid);
  if p_default or first_one then update public.addresses set is_default = false where user_id = uid; end if;
  if p_id is null then
    insert into public.addresses(user_id, label, custom_label, street, unit, barangay, city, landmark, lat, lng, is_default)
    values (uid, p_label, nullif(trim(p_custom_label),''), trim(p_street), nullif(trim(p_unit),''), trim(p_barangay), trim(p_city),
            nullif(trim(p_landmark),''), p_lat, p_lng, p_default or first_one)
    returning id into aid;
  else
    update public.addresses set label = p_label, custom_label = nullif(trim(p_custom_label),''), street = trim(p_street),
      unit = nullif(trim(p_unit),''), barangay = trim(p_barangay), city = trim(p_city), landmark = nullif(trim(p_landmark),''),
      lat = p_lat, lng = p_lng, is_default = p_default or is_default
    where id = p_id and user_id = uid returning id into aid;
    if aid is null then raise exception 'Address not found.'; end if;
  end if;
  return aid;
end $$;

-- ---------- chat: text messages, with the "no contact numbers" rule (design: CHAT note) ----------
create or replace function public.send_message(p_booking uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare b public.bookings := public._load(p_booking, 'party'); txt text := trim(coalesce(p_body,'')); digits text; mid uuid;
begin
  if txt = '' then raise exception 'Type a message.'; end if;
  if length(txt) > 1000 then raise exception 'Message is too long.'; end if;
  if b.status in ('completed','cancelled','declined_by_tasker') then raise exception 'This chat is closed.'; end if;
  digits := regexp_replace(lower(txt), '[^0-9]', '', 'g');
  if digits ~ '(09|639)[0-9]{9}' or txt ~* '(zero|oh)\s*nine' or txt ~* '\m(viber|whatsapp|telegram|messenger|fb\.com|facebook\.com)\M' then
    raise exception 'Contact numbers and other apps aren’t allowed in chat. Use the in-app call button instead.';
  end if;
  insert into public.messages(booking_id, sender_id, kind, body) values (b.id, auth.uid(), 'text', txt) returning id into mid;
  return mid;
end $$;

-- ---------- Bookings tab ----------
create or replace function public.my_bookings() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'active')::boolean desc, x->>'created_at' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', b.id, 'code', b.code, 'status', b.status, 'created_at', b.created_at, 'scheduled_at', b.scheduled_at,
      'active', b.status not in ('completed','cancelled','declined_by_tasker'),
      'total', coalesce(b.final_price, b.initial_offer, b.starting_total),
      'tasker_id', b.tasker_id,
      'tasker_name', case when b.offer_accepted_at is not null then t.first_name || ' ' || t.last_name else public.mask_name(t.first_name, t.last_name) end,
      'tasker_initials', upper(left(t.first_name,1) || left(t.last_name,1)),
      'tasker_color', tp.color,
      'service', (select string_agg(i.name, ', ' order by i.name) from public.booking_items i where i.booking_id = b.id),
      'reviewed', exists (select 1 from public.reviews r where r.booking_id = b.id and r.direction = 'client_to_tasker')) x
    from public.bookings b join public.profiles t on t.id = b.tasker_id left join public.tasker_profiles tp on tp.user_id = b.tasker_id
    where b.client_id = auth.uid()
    order by b.created_at desc limit 50) z
$$;

-- ---------- TEST BUILD ONLY: demo taskers act on their own ----------
-- Until the Tasker app exists, a client testing with a demo tasker can press "Tasker's next step (demo)".
-- It runs the real tasker RPCs as that demo tasker, so every rule (offer, arrival code, final price,
-- coins charged at start) is exercised. Works only when otp_demo_mode is on AND the tasker is_demo.
create or replace function public.demo_tasker_act(p_booking uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare b public.bookings; me uuid := auth.uid(); claims text := current_setting('request.jwt.claims', true);
        first text; done text;
begin
  if not coalesce((public.cfg('otp_demo_mode') #>> '{}')::boolean, false) then raise exception 'Demo mode is off.'; end if;
  select * into b from public.bookings where id = p_booking;
  if b.id is null or b.client_id <> me then raise exception 'not_your_booking'; end if;
  if not exists (select 1 from public.profiles where id = b.tasker_id and is_demo) then raise exception 'Only demo taskers can be moved from the client app.'; end if;
  select first_name into first from public.profiles where id = b.tasker_id;

  perform set_config('request.jwt.claims', json_build_object('sub', b.tasker_id, 'role', 'authenticated')::text, true);
  case b.status
    when 'requested' then
      perform public.tasker_reply(b.id);
      insert into public.messages(booking_id, sender_id, kind, body)
      values (b.id, b.tasker_id, 'text', 'Hi! This is ' || first || '. Thanks for booking. Can you tell me a bit more, or send a photo of the work?');
      done := first || ' replied';
    when 'chatting' then
      perform public.send_offer(b.id, b.starting_total, false);
      done := first || ' sent an offer';
    when 'on_the_way' then
      perform public.confirm_arrival(b.id, b.arrival_code);
      done := first || ' arrived and entered your code';
    when 'arrived' then
      if b.is_delivery then perform public.confirm_items_ok(b.id); end if;
      perform public.send_final_price(b.id, b.initial_offer, null, null);
      done := first || ' sent the final price';
    when 'ready' then
      perform public.start_job(b.id);
      done := first || ' started the job';
    when 'in_progress' then
      if b.is_delivery then perform public.set_proof_of_delivery(b.id, 'demo/proof.jpg'); end if;
      perform public.complete_job(b.id, 'cash', null);
      done := first || ' finished the job';
    else
      raise exception 'Waiting for you: %', replace(b.status::text, '_', ' ');
  end case;
  perform set_config('request.jwt.claims', claims, true);
  return done;
end $$;

-- demo taskers need coins (booking fee is charged when the job starts) and an approved QR
insert into public.coin_ledger(tasker_id, amount, kind, note)
select p.id, 100000, 'adjustment', 'Demo tasker coins (test build)'
from public.profiles p where p.is_demo
  and not exists (select 1 from public.coin_ledger c where c.tasker_id = p.id and c.note = 'Demo tasker coins (test build)');

revoke execute on function public.save_address(text,text,text,text,double precision,double precision,text,text,text,boolean,uuid) from public, anon;
revoke execute on function public.send_message(uuid,text) from public, anon;
revoke execute on function public.my_bookings() from public, anon;
revoke execute on function public.demo_tasker_act(uuid) from public, anon;
