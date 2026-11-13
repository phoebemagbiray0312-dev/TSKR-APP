-- ======================================================================
-- TSKR booking engine: every state change goes through these functions.
-- Apps never update bookings/coins directly (section 12).
-- ======================================================================

create or replace function public.km_between(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable set search_path = public as $$
  select 6371 * 2 * asin(sqrt(power(sin(radians(lat2-lat1)/2),2) + cos(radians(lat1))*cos(radians(lat2))*power(sin(radians(lng2-lng1)/2),2)))
$$;

create or replace function public.manila_today() returns date language sql stable as
$$ select (now() at time zone 'Asia/Manila')::date $$;

create or replace function public.contains_banned(p_text text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.banned_terms t where lower(coalesce(p_text,'')) ~ ('\m' || t.term || '\M'))
$$;

create or replace function public.tasker_is_paused(p_tasker uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.tasker_pauses where tasker_id = p_tasker and now() between starts_at and ends_at) $$;

create or replace function public.booking_fee_for(b public.bookings) returns int
language sql stable security definer set search_path = public as $$
  select case when b.is_delivery then public.cfg_int('delivery_fee')
              when b.is_repeat_client then public.cfg_int('repeat_client_fee')
              else public.cfg_int('booking_fee') end
$$;

-- internal: move a booking, log it, notify the other side
create or replace function public._move(p_booking uuid, p_to public.booking_status, p_note text default null)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare b public.bookings; other uuid; title text;
begin
  select * into b from public.bookings where id = p_booking for update;
  insert into public.booking_events(booking_id, from_status, to_status, actor_id, note) values (b.id, b.status, p_to, auth.uid(), p_note);
  update public.bookings set status = p_to where id = b.id returning * into b;
  other := case when auth.uid() = b.client_id then b.tasker_id else b.client_id end;
  title := case p_to
    when 'chatting' then 'Your tasker replied'
    when 'declined_by_tasker' then 'Your request was declined'
    when 'offer_sent' then 'You received an offer'
    when 'on_the_way' then 'Your tasker is on the way'
    when 'arrived' then 'Your tasker has arrived'
    when 'final_price_sent' then 'Final price sent'
    when 'ready' then 'Final price accepted'
    when 'in_progress' then 'Job started'
    when 'completed' then 'Job completed'
    when 'cancelled' then 'Booking cancelled'
    else 'Booking update' end;
  if other is not null then
    perform public.notify(other, 'booking_' || p_to::text, title, p_note, jsonb_build_object('booking_id', b.id, 'status', p_to));
  end if;
  return b;
end $$;

create or replace function public._load(p_booking uuid, p_as text) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id = p_booking for update;
  if b.id is null then raise exception 'booking_not_found'; end if;
  if p_as = 'client' and b.client_id <> auth.uid() then raise exception 'not_your_booking'; end if;
  if p_as = 'tasker' and b.tasker_id <> auth.uid() then raise exception 'not_your_booking'; end if;
  if p_as = 'party'  and auth.uid() not in (b.client_id, b.tasker_id) then raise exception 'not_your_booking'; end if;
  return b;
end $$;

create or replace function public._expect(b public.bookings, variadic p_states public.booking_status[]) returns void
language plpgsql as $$
begin
  if not (b.status = any(p_states)) then raise exception 'This booking is now %, refresh and try again.', replace(b.status::text,'_',' '); end if;
end $$;

-- ---------------- client gating (3.3, 8.1) ----------------
create or replace function public.client_booking_block(p_client uuid, p_scheduled boolean default false) returns text
language plpgsql stable security definer set search_path = public as $$
declare p public.profiles; active_n int; today_n int;
begin
  select * into p from public.profiles where id = p_client;
  if p.email_verified_at is null or p.phone_verified_at is null then return 'verify_account'; end if;
  if exists (select 1 from public.cancellation_fees where client_id = p_client and status in ('unpaid','not_received')) then return 'unpaid_fee'; end if;
  if p.plan = 'plus' and coalesce(p.plus_until, now()) >= now() then
    select count(*) into active_n from public.bookings where client_id = p_client
      and status not in ('completed','cancelled','declined_by_tasker');
    if active_n >= public.cfg_int('plus_active_bookings') then return 'plus_limit'; end if;
  else
    if p_scheduled then return 'needs_plus'; end if;
    select count(*) into today_n from public.bookings where client_id = p_client
      and (created_at at time zone 'Asia/Manila')::date = public.manila_today()
      and status <> 'declined_by_tasker' and not (status = 'cancelled' and offer_accepted_at is null);
    if today_n >= public.cfg_int('free_bookings_per_day') then return 'free_limit'; end if;
  end if;
  return null;
end $$;

-- ---------------- 1-2. review booking -> request ----------------
create or replace function public.create_booking(
  p_tasker uuid, p_items jsonb, p_address_id uuid,
  p_dropoff_address_id uuid default null, p_when_type text default 'now',
  p_scheduled_at timestamptz default null, p_delivery_ack boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); blk text; tp public.tasker_profiles; tpr public.profiles;
        a public.addresses; d public.addresses; it jsonb; ts record; total numeric := 0;
        is_deliv boolean := false; bid uuid; repeat boolean;
begin
  if uid = p_tasker then raise exception 'You cannot book yourself.'; end if;
  blk := public.client_booking_block(uid, p_when_type = 'scheduled');
  if blk is not null then raise exception '%', blk; end if;

  select * into tpr from public.profiles where id = p_tasker;
  select * into tp  from public.tasker_profiles where user_id = p_tasker;
  if tpr.tasker_status <> 'active' or tpr.status <> 'active' or public.tasker_is_paused(p_tasker) then
    raise exception 'This tasker is not taking bookings right now.'; end if;
  if p_when_type = 'now' and not tp.is_online then raise exception 'This tasker is offline right now.'; end if;
  if exists (select 1 from public.blocks where (blocker_id = uid and blocked_id = p_tasker) or (blocker_id = p_tasker and blocked_id = uid)) then
    raise exception 'This tasker is not available.'; end if;

  select * into a from public.addresses where id = p_address_id and user_id = uid;
  if a.id is null then raise exception 'Choose a service address.'; end if;
  if tp.base_lat is not null and public.km_between(a.lat, a.lng, tp.base_lat, tp.base_lng) > tp.radius_km then
    raise exception 'This address is outside the tasker''s service area.'; end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one service.'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    select t.*, coalesce(s.name, t.custom_name) as nm, coalesce(s.is_delivery,false) as deliv into ts
    from public.tasker_skills t left join public.skills s on s.id = t.skill_id
    where t.id = (it->>'tasker_skill_id')::uuid and t.tasker_id = p_tasker and t.status = 'active';
    if ts.id is null then raise exception 'A selected service is no longer available.'; end if;
    total := total + ts.base_fee * greatest(coalesce((it->>'qty')::int,1),1);
    is_deliv := is_deliv or ts.deliv;
  end loop;

  if is_deliv then
    if not p_delivery_ack then raise exception 'Please confirm your items are not on the prohibited list.'; end if;
    select * into d from public.addresses where id = p_dropoff_address_id and user_id = uid;
    if d.id is null then raise exception 'Add a drop-off address (TO).'; end if;
    if d.id = a.id then raise exception 'Drop-off must be different from pickup.'; end if;
  end if;

  if p_when_type = 'scheduled' then
    if p_scheduled_at is null or p_scheduled_at < now() or p_scheduled_at > now() + interval '7 days' then
      raise exception 'Pick a time within the next 7 days.'; end if;
  end if;

  repeat := exists (select 1 from public.bookings where client_id = uid and tasker_id = p_tasker and status = 'completed');

  insert into public.bookings(client_id, tasker_id, when_type, scheduled_at, address, dropoff_address,
                              is_delivery, delivery_ack, is_repeat_client, starting_total)
  values (uid, p_tasker, p_when_type, p_scheduled_at, to_jsonb(a), case when is_deliv then to_jsonb(d) end,
          is_deliv, p_delivery_ack, repeat, total)
  returning id into bid;

  for it in select * from jsonb_array_elements(p_items) loop
    insert into public.booking_items(booking_id, tasker_skill_id, name, qty, unit_price)
    select bid, t.id, coalesce(s.name, t.custom_name), greatest(coalesce((it->>'qty')::int,1),1), t.base_fee
    from public.tasker_skills t left join public.skills s on s.id = t.skill_id where t.id = (it->>'tasker_skill_id')::uuid;
  end loop;

  insert into public.booking_events(booking_id, to_status, actor_id) values (bid, 'requested', uid);
  insert into public.messages(booking_id, kind, body) values (bid, 'system',
    'New booking request' || case when is_deliv then ' · FROM ' || a.street || ', ' || a.city || ' → TO ' || d.street || ', ' || d.city else '' end);
  perform public.notify(p_tasker, 'booking_requested', 'New booking request', null, jsonb_build_object('booking_id', bid));
  return bid;
end $$;

-- ---------------- tasker can operate? ----------------
create or replace function public.tasker_ready_to_offer(p_tasker uuid, b public.bookings) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce((public.cfg('require_payment_qr') #>> '{}')::boolean, true)
     and not exists (select 1 from public.tasker_profiles where user_id = p_tasker and qr_status = 'approved') then
    raise exception 'Upload your payment QR first (Me › Payment QR).'; end if;
  if public.coin_balance(p_tasker) < public.booking_fee_for(b) then raise exception 'Buy coins first.'; end if;
end $$;

-- ---------------- 2. tasker reply / decline ----------------
create or replace function public.tasker_reply(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings := public._load(p_booking, 'tasker');
begin perform public._expect(b, 'requested'); perform public._move(b.id, 'chatting'); end $$;

create or replace function public.tasker_decline(p_booking uuid, p_reason text default null, p_prohibited boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings := public._load(p_booking, 'tasker');
begin
  perform public._expect(b, 'requested', 'chatting', 'offer_sent');
  update public.bookings set cancel_reason = coalesce(p_reason, case when p_prohibited then 'prohibited_item' end) where id = b.id;
  if p_prohibited then
    insert into public.tickets(kind, reporter_id, reported_id, booking_id, reasons) values ('prohibited_item', auth.uid(), b.client_id, b.id, array['prohibited_item']);
  end if;
  perform public._move(b.id, 'declined_by_tasker', p_reason);   -- never a strike before offer accepted
end $$;

-- ---------------- 3-4. offers ----------------
create or replace function public.send_offer(p_booking uuid, p_amount numeric, p_photo_verified boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings := public._load(p_booking, 'tasker');
begin
  perform public._expect(b, 'requested', 'chatting', 'offer_sent');
  if p_amount is null or p_amount <= 0 then raise exception 'Enter a price.'; end if;
  perform public.tasker_ready_to_offer(auth.uid(), b);
  update public.bookings set initial_offer = p_amount, offer_photo_verified = p_photo_verified where id = b.id;
  insert into public.messages(booking_id, sender_id, kind, amount, body) values (b.id, auth.uid(), 'offer', p_amount, case when p_photo_verified then 'PHOTO-VERIFIED' end);
  perform public._move(b.id, 'offer_sent', 'Initial offer ₱' || p_amount);
end $$;

create or replace function public.negotiate_offer(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings := public._load(p_booking, 'client');
begin perform public._expect(b, 'offer_sent'); perform public._move(b.id, 'chatting', 'Client wants to negotiate'); end $$;

-- ---------------- 5-6. accept -> on the way ----------------
create or replace function public.accept_offer(p_booking uuid, p_eta_minutes int default 30) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings := public._load(p_booking, 'client'); v_code text;
begin
  perform public._expect(b, 'offer_sent');
  v_code := case when coalesce((public.cfg('otp_demo_mode') #>> '{}')::boolean, true)
               then public.cfg('demo_arrival_code') #>> '{}' else lpad((floor(random()*10000))::int::text, 4, '0') end;
  update public.bookings set arrival_code = v_code, offer_accepted_at = now(),
         eta_at = now() + make_interval(mins => greatest(coalesce(p_eta_minutes,30),5)) where id = b.id;
  insert into public.booking_events(booking_id, from_status, to_status, actor_id) values (b.id, b.status, 'offer_accepted', auth.uid());
  update public.bookings set status = 'offer_accepted' where id = b.id;
  perform public._move(b.id, 'on_the_way', 'Offer accepted');
end $$;

create or replace function public.update_eta(p_booking uuid, p_eta_minutes int) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings := public._load(p_booking, 'tasker');
begin perform public._expect(b, 'on_the_way');
  update public.bookings set eta_at = now() + make_interval(mins => p_eta_minutes) where id = b.id; end $$;

-- ---------------- 7. arrival code ----------------
create or replace function public.confirm_arrival(p_booking uuid, p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings := public._load(p_booking, 'tasker');
begin
  perform public._expect(b, 'on_the_way');
  if p_code is distinct from b.arrival_code then raise exception 'Wrong code. Ask the client for the 4-digit code in their app.'; end if;
  update public.bookings set arrived_at = now() where id = b.id;
  perform public._move(b.id, 'arrived');
end $$;

-- deliveries: check the items before final price / start
create or replace function public.confirm_items_ok(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings := public._load(p_booking, 'tasker');
begin perform public._expect(b, 'arrived');
  if not b.is_delivery then raise exception 'not_a_delivery'; end if;
  update public.bookings set items_checked = true where id = b.id; end $$;

-- ---------------- 8. final price ----------------
create or replace function public.send_final_price(p_booking uuid, p_amount numeric, p_reason text default null, p_photo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings := public._load(p_booking, 'tasker');
begin
  perform public._expect(b, 'arrived', 'final_price_sent');
  if b.is_delivery and not b.items_checked then raise exception 'Check the items first.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter the final price.'; end if;
  if p_amount <> b.initial_offer and coalesce(trim(p_reason),'') = '' then raise exception 'Add a reason for the price change.'; end if;
  update public.bookings set final_price = p_amount, final_price_reason = p_reason, final_price_photo = p_photo where id = b.id;
  insert into public.messages(booking_id, sender_id, kind, amount, body, photo_path) values (b.id, auth.uid(), 'final_price', p_amount, p_reason, p_photo);
  perform public._move(b.id, 'final_price_sent', 'Final price ₱' || p_amount);
end $$;

create or replace function public.respond_final_price(p_booking uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings := public._load(p_booking, 'client');
begin
  perform public._expect(b, 'final_price_sent');
  if p_accept then perform public._move(b.id, 'ready', 'Final price accepted');
  else
    update public.bookings set cancelled_by = auth.uid(), cancel_reason = 'final_price_declined', cancel_result = 'free', cancelled_at = now() where id = b.id;
    perform public._move(b.id, 'cancelled', 'Client declined the final price. Nobody is charged.');
  end if;
end $$;

-- ---------------- 9. start job: the ONLY place coins are charged ----------------
create or replace function public.start_job(p_booking uuid) returns int
language plpgsql security definer set search_path = public as $$
declare b public.bookings := public._load(p_booking, 'tasker'); fee int;
begin
  perform public._expect(b, 'ready');
  fee := public.booking_fee_for(b);
  perform pg_advisory_xact_lock(hashtext(b.tasker_id::text));
  if public.coin_balance(b.tasker_id) < fee then raise exception 'Buy coins first.'; end if;
  insert into public.coin_ledger(tasker_id, amount, kind, booking_id, note)
  values (b.tasker_id, -fee, case when b.is_delivery then 'delivery_fee' else 'booking_fee' end::public.coin_kind, b.id,
          case when b.is_delivery then 'Delivery fee' when b.is_repeat_client then 'Booking fee · repeat client' else 'Booking fee' end);
  update public.bookings set fee_coins = fee, started_at = now() where id = b.id;
  perform public._move(b.id, 'in_progress', 'Job started');
  return fee;
end $$;

create or replace function public.set_proof_of_delivery(p_booking uuid, p_path text) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings := public._load(p_booking, 'tasker');
begin perform public._expect(b, 'in_progress');
  update public.bookings set proof_of_delivery_path = p_path where id = b.id; end $$;

-- ---------------- 10. complete ----------------
create or replace function public.complete_job(p_booking uuid, p_payment_method text, p_reference text default null) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings := public._load(p_booking, 'tasker');
begin
  perform public._expect(b, 'in_progress');
  if p_payment_method not in ('cash','qr') then raise exception 'Pick Cash or To my QR.'; end if;
  if b.is_delivery and b.proof_of_delivery_path is null then raise exception 'Take the proof-of-delivery photo first.'; end if;
  update public.bookings set payment_method = p_payment_method, payment_reference = p_reference, completed_at = now() where id = b.id;
  update public.tasker_profiles set jobs_done = jobs_done + 1 where user_id = b.tasker_id;
  perform public._move(b.id, 'completed', 'Please pay your tasker ₱' || coalesce(b.final_price, b.initial_offer) || ' directly.');
  delete from public.location_pings where booking_id = b.id;     -- live tracking not kept after the job (12.2.6)
  -- referral reward hook: first completed booking of a referred client
  update public.referrals set rewarded_at = now() where referee_id = b.client_id and rewarded_at is null;
end $$;

create or replace function public.client_mark_paid(p_booking uuid, p_reference text) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings := public._load(p_booking, 'client');
begin perform public._expect(b, 'completed');
  update public.bookings set payment_reference = p_reference where id = b.id;
  perform public.notify(b.tasker_id, 'client_paid', 'Client says they paid', 'Ref: ' || p_reference, jsonb_build_object('booking_id', b.id)); end $$;

-- ---------------- strikes (8.2) ----------------
create or replace function public._add_strike(p_tasker uuid, p_booking uuid, p_reason text, p_weight int default 1) returns void
language plpgsql security definer set search_path = public as $$
declare n30 int; n90 int; s int;
begin
  for s in 1..p_weight loop
    insert into public.strikes(tasker_id, booking_id, reason) values (p_tasker, p_booking, p_reason);
    select count(*) into n30 from public.strikes where tasker_id = p_tasker and created_at > now() - interval '30 days';
    if n30 = 1 then
      insert into public.coin_ledger(tasker_id, amount, kind, booking_id, note) values (p_tasker, -public.cfg_int('strike1_coins'), 'penalty', p_booking, 'Strike 1 penalty');
    elsif n30 = 2 then
      insert into public.coin_ledger(tasker_id, amount, kind, booking_id, note) values (p_tasker, -public.cfg_int('strike2_coins'), 'penalty', p_booking, 'Strike 2 penalty · lower ranking for 7 days');
    elsif n30 >= 3 then
      insert into public.tasker_pauses(tasker_id, reason, ends_at) values (p_tasker, 'strike_3', now() + make_interval(days => public.cfg_int('strike3_pause_days')));
      update public.tasker_profiles set is_online = false where user_id = p_tasker;
    end if;
  end loop;
  select count(*) into n90 from public.strikes where tasker_id = p_tasker and created_at > now() - interval '90 days';
  if n90 >= 5 then
    insert into public.tickets(kind, priority, reporter_id, reported_id, booking_id, body)
    values ('other', 'high', p_tasker, p_tasker, p_booking, 'Account review: 5 strikes in 90 days');
  end if;
  perform public.notify(p_tasker, 'strike', 'You received a strike', p_reason, jsonb_build_object('booking_id', p_booking, 'strikes_30d', n30));
end $$;

-- was the tasker within ~150 m of the address for 15+ minutes? (live location proof)
create or replace function public._tasker_waited(b public.bookings) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.location_pings p where p.booking_id = b.id and p.user_id = b.tasker_id
                  and public.km_between(p.lat, p.lng, (b.address->>'lat')::float8, (b.address->>'lng')::float8) <= 0.15
                  and p.created_at <= now() - make_interval(mins => public.cfg_int('tasker_wait_minutes')))
     and exists (select 1 from public.location_pings p where p.booking_id = b.id and p.user_id = b.tasker_id
                  and public.km_between(p.lat, p.lng, (b.address->>'lat')::float8, (b.address->>'lng')::float8) <= 0.15
                  and p.created_at >= now() - interval '5 minutes')
$$;

-- ---------------- cancellations (8.1 / 8.2) ----------------
-- client reasons: plans_changed | found_someone | other | tasker_late | cant_reach | asked_outside
-- tasker reasons: unsafe | client_asked | client_absent | emergency | changed_mind
create or replace function public.cancel_preview(p_booking uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b public.bookings := public._load(p_booking, 'party'); late_n int; em_n int;
begin
  if b.status in ('completed','cancelled','declined_by_tasker','in_progress') then raise exception 'This booking can''t be cancelled here. Use Help center.'; end if;
  if auth.uid() = b.client_id then
    if b.offer_accepted_at is null then return jsonb_build_object('result','free'); end if;
    if p_reason = 'tasker_late' then
      if now() < b.eta_at + make_interval(mins => public.cfg_int('tasker_late_minutes')) then raise exception 'Your tasker is not yet 15 minutes late.'; end if;
      return jsonb_build_object('result','free','flag_tasker',true,'priority_rematch',true);
    elsif p_reason in ('cant_reach','asked_outside') then return jsonb_build_object('result','free','flag_tasker',true);
    end if;
    select count(*) into late_n from public.bookings where client_id = b.client_id and cancel_result in ('free_this_month','fee_100')
      and date_trunc('month', cancelled_at at time zone 'Asia/Manila') = date_trunc('month', now() at time zone 'Asia/Manila');
    if late_n < public.cfg_int('free_late_cancels_per_month') then return jsonb_build_object('result','free_this_month'); end if;
    return jsonb_build_object('result','fee_100','amount', public.cfg_int('late_cancel_fee_php'));
  else
    if b.offer_accepted_at is null then return jsonb_build_object('result','no_strike'); end if;
    if p_reason in ('unsafe','client_asked') then return jsonb_build_object('result','no_strike');
    elsif p_reason = 'client_absent' then
      return jsonb_build_object('result', case when public._tasker_waited(b) then 'no_strike' else 'strike' end);
    elsif p_reason = 'emergency' then
      select count(*) into em_n from public.bookings where tasker_id = b.tasker_id and cancelled_by = b.tasker_id and cancel_reason = 'emergency'
        and cancelled_at > date_trunc('month', now());
      return jsonb_build_object('result', case when em_n = 0 then 'no_strike' else 'strike' end);
    else return jsonb_build_object('result','strike');
    end if;
  end if;
end $$;

create or replace function public.cancel_booking(p_booking uuid, p_reason text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pv jsonb := public.cancel_preview(p_booking, p_reason); b public.bookings := public._load(p_booking, 'party'); res text := pv->>'result';
begin
  update public.bookings set cancelled_by = auth.uid(), cancel_reason = p_reason, cancel_note = p_note,
         cancel_result = res, cancelled_at = now() where id = b.id;
  if auth.uid() = b.client_id then
    if res = 'fee_100' then
      insert into public.cancellation_fees(booking_id, client_id, tasker_id, amount_php) values (b.id, b.client_id, b.tasker_id, (pv->>'amount')::numeric);
    end if;
    if coalesce((pv->>'flag_tasker')::boolean, false) then
      insert into public.tickets(kind, reporter_id, reported_id, booking_id, reasons, body) values ('report_user', b.client_id, b.tasker_id, b.id, array[p_reason], p_note);
    end if;
  else
    if res = 'strike' then perform public._add_strike(b.tasker_id, b.id, 'Cancelled: ' || p_reason); end if;
    if p_reason = 'unsafe' then
      insert into public.tickets(kind, priority, reporter_id, reported_id, booking_id, reasons, body) values ('unsafe','high', b.tasker_id, b.client_id, b.id, array['unsafe'], p_note);
    end if;
    if b.offer_accepted_at is not null then
      perform public.notify(b.client_id, 'priority_rematch', 'We''ll find you another tasker', 'Your booking was cancelled by the tasker. You get a priority rematch.', jsonb_build_object('booking_id', b.id));
    end if;
  end if;
  perform public._move(b.id, 'cancelled', p_reason);
  delete from public.location_pings where booking_id = b.id;
  return pv;
end $$;

-- no-show: tasker never reached the address (run by scheduler or support)
create or replace function public.mark_no_show(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings;
begin
  -- scheduler runs with no JWT (auth.uid() is null); app users must be admins
  if auth.uid() is not null and not public.is_admin() then raise exception 'admin_only'; end if;
  select * into b from public.bookings where id = p_booking for update;
  if b.status <> 'on_the_way' then raise exception 'not_on_the_way'; end if;
  update public.bookings set cancelled_by = b.tasker_id, cancel_reason = 'no_show', cancel_result = 'strike', cancelled_at = now() where id = b.id;
  perform public._add_strike(b.tasker_id, b.id, 'No-show', 2);
  perform public._move(b.id, 'cancelled', 'Tasker no-show');
end $$;

-- ---------------- late-cancel fee paid to tasker QR (8.1) ----------------
create or replace function public.submit_fee_reference(p_fee uuid, p_reference text) returns void
language plpgsql security definer set search_path = public as $$
declare f public.cancellation_fees;
begin
  select * into f from public.cancellation_fees where id = p_fee and client_id = auth.uid() for update;
  if f.id is null then raise exception 'fee_not_found'; end if;
  if f.status not in ('unpaid','not_received') then raise exception 'Already submitted.'; end if;
  if coalesce(trim(p_reference),'') = '' then raise exception 'Enter the reference number.'; end if;
  update public.cancellation_fees set status = 'submitted', reference_no = trim(p_reference), submitted_at = now() where id = f.id;
  perform public.notify(f.tasker_id, 'fee_submitted', '₱' || f.amount_php || ' cancellation fee sent', 'Ref: ' || trim(p_reference), jsonb_build_object('fee_id', f.id));
end $$;

create or replace function public.answer_fee(p_fee uuid, p_received boolean) returns void
language plpgsql security definer set search_path = public as $$
declare f public.cancellation_fees;
begin
  select * into f from public.cancellation_fees where id = p_fee and tasker_id = auth.uid() for update;
  if f.id is null or f.status <> 'submitted' then raise exception 'fee_not_pending'; end if;
  update public.cancellation_fees set status = case when p_received then 'received' else 'not_received' end, answered_at = now() where id = f.id;
  if not p_received then
    insert into public.tickets(kind, reporter_id, reported_id, reasons, body) values ('other', f.tasker_id, f.client_id, array['fee_not_received'], 'Ref: ' || f.reference_no);
  end if;
end $$;

-- ---------------- reviews (10) ----------------
create or replace function public.submit_review(p_booking uuid, p_rating int, p_tags text[] default '{}', p_body text default null,
                                                p_photos text[] default '{}', p_save_favorite boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings := public._load(p_booking, 'party'); dir text; reviewee uuid;
begin
  perform public._expect(b, 'completed');
  if auth.uid() = b.client_id then dir := 'client_to_tasker'; reviewee := b.tasker_id; else dir := 'tasker_to_client'; reviewee := b.client_id; end if;
  if coalesce(array_length(p_photos,1),0) > 4 then raise exception 'Up to 4 photos.'; end if;
  insert into public.reviews(booking_id, reviewer_id, reviewee_id, direction, rating, tags, body, photos)
  values (b.id, auth.uid(), reviewee, dir, p_rating, coalesce(p_tags,'{}'), p_body, coalesce(p_photos,'{}'));
  if dir = 'client_to_tasker' then
    update public.tasker_profiles tp set
      rating_avg = (select round(avg(rating)::numeric,2) from public.reviews where reviewee_id = b.tasker_id and direction = 'client_to_tasker'),
      rating_count = (select count(*) from public.reviews where reviewee_id = b.tasker_id and direction = 'client_to_tasker')
    where tp.user_id = b.tasker_id;
    if p_save_favorite then insert into public.favorites(client_id, tasker_id) values (b.client_id, b.tasker_id) on conflict do nothing; end if;
  end if;
end $$;

-- ---------------- tasker skills (4.1, 3.2) ----------------
create or replace function public.add_tasker_skill(p_skill_id int default null, p_custom_name text default null,
                                                   p_base_fee numeric default null, p_duration_min int default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n int; sk public.skills; st text := 'active'; nm text; id_ uuid;
begin
  if not exists (select 1 from public.profiles where id = uid and is_tasker) then raise exception 'tasker_only'; end if;
  if p_base_fee is null or p_base_fee <= 0 then raise exception 'Enter a base fee.'; end if;
  select count(*) into n from public.tasker_skills where tasker_id = uid and status <> 'rejected';
  if n >= public.cfg_int('max_skills') then raise exception 'You can have up to % skills.', public.cfg_int('max_skills'); end if;
  if p_skill_id is not null then
    select * into sk from public.skills where id = p_skill_id and is_active;
    if sk.id is null then raise exception 'Skill not found.'; end if;
    nm := sk.name; if sk.needs_license then st := 'pending_review'; end if;
  else
    nm := trim(coalesce(p_custom_name,''));
    if length(nm) < 3 then raise exception 'Please specify the skill.'; end if;
    st := 'pending_review';
  end if;
  if public.contains_banned(nm) then raise exception 'This service is not allowed on TSKR.'; end if;
  if exists (select 1 from public.tasker_skills t left join public.skills s on s.id = t.skill_id
             where t.tasker_id = uid and t.status <> 'rejected' and lower(coalesce(s.name, t.custom_name)) = lower(nm)) then
    raise exception 'You already added this skill.'; end if;
  insert into public.tasker_skills(tasker_id, skill_id, custom_name, base_fee, duration_min, status, slot)
  values (uid, p_skill_id, case when p_skill_id is null then nm end, p_base_fee, p_duration_min, st, n + 1) returning id into id_;
  return id_;
end $$;

create or replace function public.remove_tasker_skill(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.tasker_skills where id = p_id and tasker_id = auth.uid()
    and not exists (select 1 from public.booking_items i join public.bookings b on b.id = i.booking_id
                    where i.tasker_skill_id = p_id and b.status not in ('completed','cancelled','declined_by_tasker'));
  if not found then raise exception 'This skill is in an active booking.'; end if;
  -- renumber slots so extras are always slots 3..5
  update public.tasker_skills t set slot = r.rn from (
    select id, row_number() over (order by created_at) rn from public.tasker_skills where tasker_id = auth.uid()) r where r.id = t.id;
end $$;

-- weekly extra-skill charge (run weekly by pg_cron)
create or replace function public.charge_weekly_skills() returns int
language plpgsql security definer set search_path = public as $$
declare r record; fee int; n int := 0; free_n int := public.cfg_int('free_skills');
begin
  for r in select tasker_id, count(*) filter (where slot > free_n and status in ('active','hidden')) extra
           from public.tasker_skills group by tasker_id having count(*) filter (where slot > free_n and status in ('active','hidden')) > 0 loop
    fee := r.extra * public.cfg_int('extra_skill_fee');
    if public.coin_balance(r.tasker_id) >= fee then
      insert into public.coin_ledger(tasker_id, amount, kind, note) values (r.tasker_id, -fee, 'skill_charge', 'Weekly skill charge · ' || r.extra || ' extra skills × ' || public.cfg_int('extra_skill_fee'));
      update public.tasker_skills set status = 'active' where tasker_id = r.tasker_id and slot > free_n and status = 'hidden';
    else
      update public.tasker_skills set status = 'hidden' where tasker_id = r.tasker_id and slot > free_n and status = 'active';
      perform public.notify(r.tasker_id, 'skills_hidden', 'Extra skills hidden', 'Buy coins to show your extra skills to clients again.');
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------- coins & payment QR ----------------
create or replace function public.buy_coins_demo(p_method text default 'gcash') returns int
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); pid uuid; coins int := public.cfg_int('coin_pack_coins');
begin
  if not coalesce((public.cfg('payments_demo_mode') #>> '{}')::boolean, false) then raise exception 'Demo payments are off.'; end if;
  if not exists (select 1 from public.profiles where id = uid and is_tasker) then raise exception 'tasker_only'; end if;
  insert into public.payments(user_id, purpose, amount_php, coins, gateway, gateway_txn_id, method, status, paid_at)
  values (uid, 'coins', public.cfg_int('coin_pack_php'), coins, 'demo', 'DEMO-' || upper(substr(md5(random()::text),1,10)), p_method, 'paid', now())
  returning id into pid;
  insert into public.coin_ledger(tasker_id, amount, kind, reference, note) values (uid, coins, 'purchase', pid::text, 'Bought ' || coins || ' coins');
  update public.tasker_skills set status = 'active' where tasker_id = uid and status = 'hidden';
  return public.coin_balance(uid);
end $$;

create or replace function public.set_payment_qr(p_path text, p_wallet text, p_account_name text) returns text
language plpgsql security definer set search_path = public as $$
declare p public.profiles; norm_qr text; norm_id text; st text;
begin
  select * into p from public.profiles where id = auth.uid() and is_tasker;
  if p.id is null then raise exception 'tasker_only'; end if;
  norm_qr := regexp_replace(upper(coalesce(p_account_name,'')), '[^A-Z]', '', 'g');
  norm_id := regexp_replace(upper(coalesce(p.first_name,'') || coalesce(p.last_name,'')), '[^A-Z]', '', 'g');
  st := case when norm_qr = norm_id and norm_qr <> '' then 'approved' else 'pending' end;   -- mismatch -> admin review
  update public.tasker_profiles set payment_qr_path = p_path, qr_wallet_type = p_wallet, qr_account_name = p_account_name, qr_status = st
  where user_id = p.id;
  return st;
end $$;

-- ---------------- Become a Tasker (2.2) ----------------
create or replace function public.submit_tasker_verification(
  p_id1_type text, p_id1_path text, p_id1_ocr jsonb, p_id2_type text, p_id2_path text, p_id2_ocr jsonb,
  p_selfie_path text, p_face_score numeric) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); p public.profiles; fl text[] := '{}'; st text; norm text;
begin
  select * into p from public.profiles where id = uid;
  if not exists (select 1 from public.consents c join public.policy_documents d on d.id = c.document_id
                 where c.user_id = uid and d.doc_type = 'id_consent' and d.is_current) then
    raise exception 'Please give ID consent first.'; end if;
  if p_id1_type = p_id2_type then raise exception 'Use 2 different ID types.'; end if;
  norm := regexp_replace(upper(coalesce(p.first_name,'') || coalesce(p.last_name,'')), '[^A-Z]', '', 'g');
  if regexp_replace(upper(coalesce(p_id1_ocr->>'name','')), '[^A-Z]', '', 'g') <> norm then fl := fl || 'id1_name_mismatch'; end if;
  if regexp_replace(upper(coalesce(p_id2_ocr->>'name','')), '[^A-Z]', '', 'g') <> norm then fl := fl || 'id2_name_mismatch'; end if;
  if (p_id1_ocr->>'birthdate') is distinct from (p_id2_ocr->>'birthdate') then fl := fl || 'birthday_mismatch'; end if;
  if coalesce(p_face_score,0) < coalesce((public.cfg('face_match_threshold') #>> '{}')::numeric, 0.8) then fl := fl || 'face_mismatch'; end if;
  st := case when cardinality(fl) > 0 then 'flagged' else 'submitted' end;   -- flag, never auto-reject
  insert into public.tasker_verifications(user_id, id1_type, id1_image_path, id1_ocr, id2_type, id2_image_path, id2_ocr,
                                          selfie_path, face_match_score, flags, status, submitted_at)
  values (uid, p_id1_type, p_id1_path, p_id1_ocr, p_id2_type, p_id2_path, p_id2_ocr, p_selfie_path, p_face_score, fl, st, now());
  update public.profiles set tasker_status = 'pending' where id = uid;
  return st;
end $$;

create or replace function public.admin_review_verification(p_id uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v public.tasker_verifications;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  select * into v from public.tasker_verifications where id = p_id for update;
  update public.tasker_verifications set status = case when p_approve then 'approved' else 'rejected' end,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note where id = p_id;
  insert into public.kyc_access_log(admin_id, verification_id, action) values (auth.uid(), p_id, case when p_approve then 'approve' else 'reject' end);
  if p_approve then
    update public.profiles set is_tasker = true, tasker_status = 'active' where id = v.user_id;
    insert into public.tasker_profiles(user_id) values (v.user_id) on conflict do nothing;
    if not exists (select 1 from public.coin_ledger where tasker_id = v.user_id and kind = 'signup_bonus') then
      insert into public.coin_ledger(tasker_id, amount, kind, note) values (v.user_id, public.cfg_int('signup_bonus'), 'signup_bonus', 'Welcome bonus');
    end if;
    perform public.notify(v.user_id, 'tasker_approved', 'You''re verified!', 'You can now receive bookings. 1,000 coins added.');
  else
    update public.profiles set tasker_status = 'rejected' where id = v.user_id;
    perform public.notify(v.user_id, 'tasker_rejected', 'Verification not approved', p_note);
  end if;
end $$;

-- ---------------- discovery (5) ----------------
create or replace function public.search_taskers(
  p_lat double precision, p_lng double precision, p_query text default null, p_category text default null,
  p_max_km numeric default 6, p_min_rating numeric default 0, p_max_price numeric default null,
  p_available_now boolean default false, p_multi_skill boolean default false, p_favorites boolean default false,
  p_sort text default 'recommended', p_limit int default 30)
returns table (tasker_id uuid, masked_name text, initials text, title text, photo_path text, rating_avg numeric, rating_count int,
               jobs_done int, distance_km numeric, area_label text, is_online boolean, starts_at numeric, skills text[],
               categories text[], skill_count int, is_favorite boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if p_query is not null and public.contains_banned(p_query) then return; end if;
  return query
  with base as (
    select p.id, p.first_name, p.last_name, tp.*,
           public.km_between(p_lat, p_lng, tp.base_lat, tp.base_lng) as dist,
           (select count(*) from public.strikes s where s.tasker_id = p.id and s.created_at > now() - interval '7 days') as recent_strikes
    from public.profiles p join public.tasker_profiles tp on tp.user_id = p.id
    where p.is_tasker and p.tasker_status = 'active' and p.status = 'active' and p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000')
      and not public.tasker_is_paused(p.id) and tp.base_lat is not null
      and not exists (select 1 from public.blocks bl where (bl.blocker_id = auth.uid() and bl.blocked_id = p.id) or (bl.blocker_id = p.id and bl.blocked_id = auth.uid()))
  ), sk as (
    select t.tasker_id, array_agg(coalesce(s.name, t.custom_name) order by t.slot) names, array_agg(distinct c.name) cats,
           min(t.base_fee) min_fee, count(*)::int n
    from public.tasker_skills t left join public.skills s on s.id = t.skill_id left join public.skill_categories c on c.id = s.category_id
    where t.status = 'active' group by t.tasker_id
  )
  select b.id, public.mask_name(b.first_name, b.last_name), upper(left(b.first_name,1) || left(b.last_name,1)), b.title, b.photo_path,
         b.rating_avg, b.rating_count, b.jobs_done, round(b.dist::numeric, 1), b.area_label, b.is_online, sk.min_fee, sk.names, sk.cats, sk.n,
         exists (select 1 from public.favorites f where f.client_id = auth.uid() and f.tasker_id = b.id)
  from base b join sk on sk.tasker_id = b.id
  where b.dist <= least(b.radius_km, coalesce(p_max_km, 6))
    and b.rating_avg >= coalesce(p_min_rating, 0)
    and (p_max_price is null or sk.min_fee <= p_max_price)
    and (not p_available_now or b.is_online)
    and (not p_multi_skill or sk.n >= 3)
    and (not p_favorites or exists (select 1 from public.favorites f where f.client_id = auth.uid() and f.tasker_id = b.id))
    and (p_category is null or p_category = any(sk.cats))
    and (p_query is null or b.title ilike '%'||p_query||'%' or b.first_name ilike '%'||p_query||'%'
         or exists (select 1 from unnest(sk.names) nm where nm ilike '%'||p_query||'%')
         or exists (select 1 from unnest(sk.cats) ct where ct ilike '%'||p_query||'%'))
  order by
    case when p_sort = 'top_rated' then -b.rating_avg end,
    case when p_sort = 'nearest' then b.dist end,
    case when p_sort = 'lowest_price' then sk.min_fee end,
    (b.recent_strikes >= 2),                                       -- strike 2: lower ranking for 7 days
    (not b.is_online), -(b.rating_avg * ln(2 + b.rating_count)), b.dist
  limit p_limit;
end $$;

-- one booking with names masked/unmasked by stage (7.1) and QR only after accept (10.6)
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
    'client_rating', (select round(avg(rating)::numeric,1) from public.reviews where reviewee_id = b.client_id));
end $$;

-- tasker "me" summary for the header & wallet (3.1 UI states)
create or replace function public.tasker_wallet() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); bal int := public.coin_balance(uid); fee int := public.cfg_int('booking_fee');
begin
  return jsonb_build_object('balance', bal, 'booking_fee', fee, 'repeat_fee', public.cfg_int('repeat_client_fee'),
    'delivery_fee', public.cfg_int('delivery_fee'), 'low', bal < 2 * fee, 'out', bal < fee,
    'extra_skills', (select count(*) from public.tasker_skills where tasker_id = uid and slot > public.cfg_int('free_skills') and status <> 'rejected'),
    'strikes_30d', (select count(*) from public.strikes where tasker_id = uid and created_at > now() - interval '30 days'),
    'paused_until', (select max(ends_at) from public.tasker_pauses where tasker_id = uid and ends_at > now()));
end $$;

-- ---------------- reports & SOS (9) ----------------
create or replace function public.report_user(p_reported uuid, p_booking uuid, p_reasons text[], p_body text default null,
                                              p_photo text default null, p_block boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare no text;
begin
  insert into public.tickets(kind, reporter_id, reported_id, booking_id, reasons, body, photo_path)
  values ('report_user', auth.uid(), p_reported, p_booking, p_reasons, p_body, p_photo) returning ticket_no into no;
  if p_block then insert into public.blocks(blocker_id, blocked_id) values (auth.uid(), p_reported) on conflict do nothing; end if;
  return no;
end $$;

create or replace function public.report_booking_problem(p_booking uuid, p_issues text[], p_body text, p_photo text default null) returns text
language plpgsql security definer set search_path = public as $$
declare b public.bookings := public._load(p_booking, 'party'); no text;
begin
  insert into public.tickets(kind, reporter_id, reported_id, booking_id, reasons, body, photo_path)
  values ('booking_problem', auth.uid(), case when auth.uid() = b.client_id then b.tasker_id else b.client_id end, b.id, p_issues, p_body, p_photo)
  returning ticket_no into no;
  return no;
end $$;

create or replace function public.trigger_sos(p_booking uuid, p_lat double precision, p_lng double precision) returns text
language plpgsql security definer set search_path = public as $$
declare b public.bookings := public._load(p_booking, 'party'); no text;
begin
  insert into public.tickets(kind, priority, reporter_id, reported_id, booking_id, location)
  values ('sos', 'high', auth.uid(), case when auth.uid() = b.client_id then b.tasker_id else b.client_id end, b.id,
          jsonb_build_object('lat', p_lat, 'lng', p_lng, 'at', now())) returning ticket_no into no;
  return no;
end $$;

-- ---------------- deactivate / delete (10.5): soft delete ----------------
create or replace function public.close_account(p_mode text, p_reason text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if p_mode not in ('deactivated','deleted') then raise exception 'bad_mode'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'Pick a reason.'; end if;
  if exists (select 1 from public.bookings where uid in (client_id, tasker_id) and status not in ('completed','cancelled','declined_by_tasker')) then
    raise exception 'Finish or cancel your active booking first.'; end if;
  if exists (select 1 from public.cancellation_fees where client_id = uid and status in ('unpaid','not_received')) then
    raise exception 'Pay your unpaid cancellation fee first.'; end if;
  update public.profiles set status = p_mode::public.account_status, closed_at = now(), close_reason = p_reason, close_note = p_note where id = uid;
  update public.tasker_profiles set is_online = false where user_id = uid;
  if p_mode = 'deleted' then
    delete from public.addresses where user_id = uid;
    update public.tasker_skills set status = 'hidden' where tasker_id = uid;
  end if;
end $$;

create or replace function public.reactivate_account() returns void
language sql security definer set search_path = public as $$
  update public.profiles set status = 'active', closed_at = null where id = auth.uid() and status = 'deactivated'
$$;

-- lock down: functions starting with _ are internal only
do $$ declare f record; begin
  for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and (p.proname like '\_%' or p.proname in ('charge_weekly_skills','notify','handle_new_user','touch_updated_at')) loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
  -- nothing is callable without signing in
  for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' loop
    execute format('revoke execute on function %s from public, anon', f.sig);
  end loop; end $$;
alter default privileges in schema public revoke execute on functions from public, anon;

-- realtime for chat, booking status and notifications
alter publication supabase_realtime add table public.bookings, public.messages, public.notifications, public.location_pings;
