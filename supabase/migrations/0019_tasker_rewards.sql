-- Tasker part 2: weekly reward (7th booking free), streak bonus, Top Tasker, today's schedule,
-- availability, edit skill price, portfolio (camera only).

insert into public.app_config(key, value, description, status) values
  ('weekly_reward_jobs', '6', 'Completed bookings in a week (Mon–Sun) before the next booking is free of coins', 'agreed'),
  ('streak_weeks', '4', 'Weeks in a row hitting the weekly reward target for the streak bonus', 'agreed'),
  ('streak_bonus_coins', '300', 'Bonus coins for the streak', 'agreed'),
  ('top_min_rating', '4.8', 'Top Tasker: minimum rating', 'placeholder'),
  ('top_min_jobs_30d', '20', 'Top Tasker: completed jobs in the last 30 days', 'placeholder'),
  ('top_min_completion_pct', '95', 'Top Tasker: % of accepted jobs completed (90 days)', 'placeholder'),
  ('schedule_buffer_min', '30', 'Travel time added after each job in the schedule', 'agreed')
on conflict (key) do nothing;

alter table public.bookings add column if not exists reward_free boolean not null default false;

create or replace function public.cfg_num(p_key text) returns numeric language sql stable as
$$ select (public.cfg(p_key) #>> '{}')::numeric $$;

-- Monday 00:00 Manila of the week that contains p_at
create or replace function public.week_start_at(p_at timestamptz default now()) returns timestamptz language sql stable as
$$ select (date_trunc('week', p_at at time zone 'Asia/Manila')) at time zone 'Asia/Manila' $$;

create or replace function public.tasker_week_progress(p_tasker uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ws timestamptz := public.week_start_at(); target int := public.cfg_int('weekly_reward_jobs');
        last_free timestamptz; cnt int; streak int := 0; i int; wk int; this_week int;
begin
  select max(started_at) into last_free from public.bookings where tasker_id = p_tasker and reward_free and started_at >= ws;
  select count(*) into cnt from public.bookings where tasker_id = p_tasker and status = 'completed' and not reward_free
    and completed_at >= greatest(ws, coalesce(last_free, ws));
  select count(*) into this_week from public.bookings where tasker_id = p_tasker and status = 'completed' and completed_at >= ws;
  -- streak: this week if already hit, then full weeks before it
  if this_week >= target then streak := 1; end if;
  for i in 1..(public.cfg_int('streak_weeks') - 1) loop
    select count(*) into wk from public.bookings where tasker_id = p_tasker and status = 'completed'
      and completed_at >= ws - make_interval(days => 7 * i) and completed_at < ws - make_interval(days => 7 * (i - 1));
    exit when wk < target;
    streak := streak + 1;
  end loop;
  return jsonb_build_object('count', least(cnt, target), 'target', target, 'free_next', cnt >= target,
    'week_total', this_week, 'streak', least(streak, public.cfg_int('streak_weeks')), 'streak_weeks', public.cfg_int('streak_weeks'),
    'streak_bonus', public.cfg_int('streak_bonus_coins'));
end $$;

create or replace function public.booking_fee_for(b public.bookings) returns integer
language sql stable security definer set search_path = public as $$
  select case when b.fee_coins is not null then b.fee_coins
              when coalesce((public.tasker_week_progress(b.tasker_id)->>'free_next')::boolean, false) then 0
              when b.is_delivery then public.cfg_int('delivery_fee')
              when b.is_repeat_client then public.cfg_int('repeat_client_fee')
              else public.cfg_int('booking_fee') end
$$;

create or replace function public.start_job(p_booking uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare b public.bookings := public._load(p_booking, 'tasker'); fee int;
begin
  perform public._expect(b, 'ready');
  perform pg_advisory_xact_lock(hashtext(b.tasker_id::text));
  fee := public.booking_fee_for(b);
  if public.coin_balance(b.tasker_id) < fee then raise exception 'Buy coins first.'; end if;
  if fee > 0 then
    insert into public.coin_ledger(tasker_id, amount, kind, booking_id, note)
    values (b.tasker_id, -fee, case when b.is_delivery then 'delivery_fee' else 'booking_fee' end::public.coin_kind, b.id,
            case when b.is_delivery then 'Delivery fee' when b.is_repeat_client then 'Booking fee · repeat client' else 'Booking fee' end);
  end if;
  update public.bookings set fee_coins = fee, reward_free = (fee = 0), started_at = now() where id = b.id;
  perform public._move(b.id, 'in_progress', case when fee = 0 then 'Job started · free booking (weekly reward)' else 'Job started' end);
  return fee;
end $$;

create or replace function public.complete_job(p_booking uuid, p_payment_method text, p_reference text default null) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings := public._load(p_booking, 'tasker'); w jsonb; bonus int := public.cfg_int('streak_bonus_coins');
begin
  perform public._expect(b, 'in_progress');
  if p_payment_method not in ('cash','qr') then raise exception 'Pick Cash or To my QR.'; end if;
  if b.is_delivery and b.proof_of_delivery_path is null then raise exception 'Take the proof-of-delivery photo first.'; end if;
  update public.bookings set payment_method = p_payment_method, payment_reference = p_reference, completed_at = now() where id = b.id;
  update public.tasker_profiles set jobs_done = jobs_done + 1 where user_id = b.tasker_id;
  perform public._move(b.id, 'completed', 'Please pay your tasker ₱' || coalesce(b.final_price, b.initial_offer) || ' directly.');
  delete from public.location_pings where booking_id = b.id;
  update public.referrals set rewarded_at = now() where referee_id = b.client_id and rewarded_at is null;
  -- streak bonus: paid once when the last week of the streak is reached
  w := public.tasker_week_progress(b.tasker_id);
  if (w->>'week_total')::int = (w->>'target')::int and (w->>'streak')::int >= (w->>'streak_weeks')::int
     and not exists (select 1 from public.coin_ledger where tasker_id = b.tasker_id and note like 'Streak bonus%'
                     and created_at > now() - make_interval(days => 7 * (w->>'streak_weeks')::int)) then
    insert into public.coin_ledger(tasker_id, amount, kind, note) values (b.tasker_id, bonus, 'adjustment', 'Streak bonus · ' || (w->>'streak_weeks') || ' weeks');
    perform public.notify(b.tasker_id, 'streak_bonus', bonus || ' bonus coins!', 'You hit ' || (w->>'target') || '+ bookings for ' || (w->>'streak_weeks') || ' weeks in a row.');
  end if;
end $$;

-- Top Tasker
create or replace function public.tasker_top_status(p_tasker uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare tp public.tasker_profiles; jobs30 int; done90 int; dropped90 int; strikes90 int; pct int; r numeric;
begin
  select * into tp from public.tasker_profiles where user_id = p_tasker;
  r := coalesce(tp.rating_avg, 0);
  select count(*) into jobs30 from public.bookings where tasker_id = p_tasker and status = 'completed' and completed_at > now() - interval '30 days';
  select count(*) into done90 from public.bookings where tasker_id = p_tasker and status = 'completed' and completed_at > now() - interval '90 days';
  select count(*) into dropped90 from public.bookings where tasker_id = p_tasker and status = 'cancelled' and cancelled_by = p_tasker
    and offer_accepted_at is not null and cancelled_at > now() - interval '90 days';
  select count(*) into strikes90 from public.strikes where tasker_id = p_tasker and created_at > now() - interval '90 days';
  pct := case when done90 + dropped90 = 0 then 100 else round(100.0 * done90 / (done90 + dropped90)) end;
  return jsonb_build_object(
    'is_top', r >= public.cfg_num('top_min_rating') and jobs30 >= public.cfg_int('top_min_jobs_30d') and pct >= public.cfg_num('top_min_completion_pct') and strikes90 = 0,
    'rating', round(r, 1), 'min_rating', public.cfg_num('top_min_rating'),
    'jobs_30d', jobs30, 'min_jobs_30d', public.cfg_int('top_min_jobs_30d'),
    'completion_pct', pct, 'min_completion_pct', public.cfg_num('top_min_completion_pct'),
    'strikes_90d', strikes90,
    'strikes_30d', (select count(*) from public.strikes where tasker_id = p_tasker and created_at > now() - interval '30 days'));
end $$;

create or replace function public.is_top_tasker(p_tasker uuid) returns boolean language sql stable security definer set search_path = public as
$$ select coalesce((public.tasker_top_status(p_tasker)->>'is_top')::boolean, false) $$;

-- today's schedule (accepted jobs today, with travel buffer)
create or replace function public.tasker_schedule() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); buf int := public.cfg_int('schedule_buffer_min');
begin
  return (select coalesce(jsonb_agg(x order by x->>'start'), '[]') from (
    select jsonb_build_object('id', b.id, 'status', b.status,
      'start', coalesce(b.scheduled_at, b.offer_accepted_at),
      'end', coalesce(b.scheduled_at, b.offer_accepted_at) + make_interval(mins => coalesce(
                (select sum(coalesce(ts.duration_min, 60) * i.qty) from public.booking_items i left join public.tasker_skills ts on ts.id = i.tasker_skill_id where i.booking_id = b.id), 60)::int),
      'buffer_min', buf,
      'client', c.first_name || ' ' || left(c.last_name, 1) || '.',
      'area', b.address->>'barangay' || ', ' || (b.address->>'city'),
      'service', (select string_agg(i.name, ', ') from public.booking_items i where i.booking_id = b.id)) x
    from public.bookings b join public.profiles c on c.id = b.client_id
    where b.tasker_id = uid and b.offer_accepted_at is not null
      and b.status not in ('completed','cancelled','declined_by_tasker')
      and (coalesce(b.scheduled_at, b.offer_accepted_at) at time zone 'Asia/Manila')::date = public.manila_today()) z);
end $$;

create or replace function public.tasker_home()
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
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
    'week', public.tasker_week_progress(uid),
    'schedule', public.tasker_schedule(),
    'availability', tp.availability,
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
end $function$;

-- availability: days 1=Mon … 7=Sun, hours "HH:MM"
create or replace function public.set_availability(p_days int[], p_from text, p_to text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(array_length(p_days,1),0) = 0 then raise exception 'Pick at least one day.'; end if;
  if exists (select 1 from unnest(p_days) d where d not between 1 and 7) then raise exception 'bad_day'; end if;
  if p_from !~ '^\d{2}:\d{2}$' or p_to !~ '^\d{2}:\d{2}$' or p_from >= p_to then raise exception 'The end time must be after the start time.'; end if;
  update public.tasker_profiles set availability = jsonb_build_object('days', (select jsonb_agg(d order by d) from (select distinct unnest(p_days) d) z), 'from', p_from, 'to', p_to), updated_at = now()
  where user_id = auth.uid();
end $$;

-- scheduled bookings must fall inside the tasker's availability
create or replace function public.check_booking_availability() returns trigger
language plpgsql security definer set search_path = public as $$
declare a jsonb; local timestamp; dow int; hm text;
begin
  if new.when_type <> 'scheduled' or new.scheduled_at is null then return new; end if;
  select availability into a from public.tasker_profiles where user_id = new.tasker_id;
  if a is null then return new; end if;
  local := new.scheduled_at at time zone 'Asia/Manila';
  dow := extract(isodow from local)::int; hm := to_char(local, 'HH24:MI');
  if not (a->'days') @> to_jsonb(dow) or hm < a->>'from' or hm >= a->>'to' then
    raise exception 'This tasker works % to %, on the days shown on their profile. Pick another time.', a->>'from', a->>'to';
  end if;
  return new;
end $$;
create trigger bookings_availability before insert on public.bookings for each row execute function public.check_booking_availability();

-- edit a skill's starting price (and duration)
create or replace function public.update_tasker_skill(p_id uuid, p_base_fee numeric, p_duration_min int default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_base_fee is null or p_base_fee <= 0 then raise exception 'Enter a starting price.'; end if;
  if p_base_fee > 100000 then raise exception 'That price looks too high.'; end if;
  update public.tasker_skills set base_fee = round(p_base_fee), duration_min = coalesce(p_duration_min, duration_min)
  where id = p_id and tasker_id = auth.uid() and status <> 'rejected';
  if not found then raise exception 'Skill not found.'; end if;
end $$;

-- portfolio (camera-only in the app)
create or replace function public.add_portfolio_photo(p_path text) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); id_ uuid;
begin
  if p_path not like uid::text || '/%' then raise exception 'bad_path'; end if;
  if (select count(*) from public.portfolio_photos where tasker_id = uid) >= 12 then raise exception 'Up to 12 portfolio photos. Remove one first.'; end if;
  insert into public.portfolio_photos(tasker_id, photo_path) values (uid, p_path) returning id into id_;
  return id_;
end $$;
create or replace function public.remove_portfolio_photo(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.portfolio_photos where id = p_id and tasker_id = auth.uid();
end $$;

-- client profile: Top Tasker badge + availability
CREATE OR REPLACE FUNCTION public.get_tasker(p_tasker uuid, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare p public.profiles; tp public.tasker_profiles; d numeric;
begin
  select * into p from public.profiles where id = p_tasker and is_tasker and tasker_status = 'active' and status = 'active';
  if p.id is null then raise exception 'This tasker is not available.'; end if;
  select * into tp from public.tasker_profiles where user_id = p_tasker;
  d := case when p_lat is not null and tp.base_lat is not null then public.km_between(p_lat, p_lng, tp.base_lat, tp.base_lng) end;
  return jsonb_build_object(
    'id', p.id, 'name', public.mask_name(p.first_name, p.last_name), 'initials', upper(left(p.first_name,1) || left(p.last_name,1)),
    'title', tp.title, 'bio', tp.bio, 'years', tp.years_experience, 'area', tp.area_label, 'color', tp.color, 'photo', tp.photo_path,
    'rating', tp.rating_avg, 'reviews_count', tp.rating_count, 'jobs', tp.jobs_done, 'online', tp.is_online, 'radius_km', tp.radius_km,
    'area_lat', round(tp.base_lat::numeric, 2), 'area_lng', round(tp.base_lng::numeric, 2),
    'km', round(d, 1), 'eta_min', case when d is not null then greatest(10, round(10 + d * 8))::int end,
    'top', public.is_top_tasker(p.id), 'availability', tp.availability,
    'favorite', exists (select 1 from public.favorites where client_id = auth.uid() and tasker_id = p.id),
    'services', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', public.svc_name(t), 'desc', t.description,
                   'price', t.base_fee, 'dur', t.duration_min, 'delivery', coalesce(s.is_delivery,false)) order by t.slot), '[]')
                 from public.tasker_skills t left join public.skills s on s.id = t.skill_id where t.tasker_id = p.id and t.status = 'active'),
    'portfolio', (select coalesce(jsonb_agg(photo_path order by taken_at desc), '[]') from public.portfolio_photos where tasker_id = p.id),
    'reviews', (select coalesce(jsonb_agg(x order by x->>'at' desc), '[]') from (
                  select jsonb_build_object('name', initcap(split_part(rp.first_name,' ',1)) || ' ' || upper(left(rp.last_name,1)) || '.',
                    'initials', upper(left(rp.first_name,1) || left(rp.last_name,1)), 'rating', r.rating, 'text', r.body, 'tags', r.tags, 'at', r.created_at) x
                  from public.reviews r join public.profiles rp on rp.id = r.reviewer_id
                  where r.reviewee_id = p.id and r.direction = 'client_to_tasker' order by r.created_at desc limit 20) z));
end $function$;
