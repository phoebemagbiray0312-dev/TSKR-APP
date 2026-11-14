-- Design update (Nov 14): coin packs with bonus, 7 skills (first week charged on add), job title + years,
-- broke taskers paused (not shown to clients) with a demand nudge.

insert into public.app_config(key, value, description, status) values
  ('coin_packs', '[{"price":500,"bonus":0},{"price":1000,"bonus":50,"tag":"Popular"},{"price":2000,"bonus":200},{"price":5000,"bonus":750,"tag":"Best value"}]',
   'Coin packs: price in ₱ and bonus coins. 1 coin = ₱1.', 'agreed')
on conflict (key) do nothing;
update public.app_config set value = '7', description = 'Most skills a tasker can have (2 free + 5 extra)' where key = 'max_skills';

create or replace function public.buy_coin_pack_demo(p_method text, p_price int) returns int
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); pid uuid; pk jsonb; coins int;
begin
  if not coalesce((public.cfg('payments_demo_mode') #>> '{}')::boolean, false) then raise exception 'Demo payments are off.'; end if;
  if not exists (select 1 from public.profiles where id = uid and is_tasker) then raise exception 'tasker_only'; end if;
  select x into pk from jsonb_array_elements(public.cfg('coin_packs')) x where (x->>'price')::int = p_price;
  if pk is null then raise exception 'Choose a coin pack.'; end if;
  coins := (pk->>'price')::int + coalesce((pk->>'bonus')::int, 0);
  insert into public.payments(user_id, purpose, amount_php, coins, gateway, gateway_txn_id, method, status, paid_at)
  values (uid, 'coins', p_price, coins, 'demo', 'DEMO-' || upper(substr(md5(random()::text),1,10)), p_method, 'paid', now())
  returning id into pid;
  insert into public.coin_ledger(tasker_id, amount, kind, reference, note)
  values (uid, coins, 'purchase', pid::text, 'Bought ' || to_char(coins, 'FM999,999') || ' coins' ||
          case when (pk->>'bonus')::int > 0 then ' (incl. ' || (pk->>'bonus') || ' bonus)' else '' end);
  update public.tasker_skills set status = 'active' where tasker_id = uid and status = 'hidden';
  return public.coin_balance(uid);
end $$;

-- test builds only: empty the wallet to see the "out of coins" state
create or replace function public.demo_use_up_coins() returns int
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); bal int;
begin
  if not coalesce((public.cfg('payments_demo_mode') #>> '{}')::boolean, false) then raise exception 'Demo payments are off.'; end if;
  bal := public.coin_balance(uid);
  if bal > 0 then insert into public.coin_ledger(tasker_id, amount, kind, note) values (uid, -bal, 'adjustment', 'Test build: used up coins'); end if;
  update public.tasker_profiles set is_online = false where user_id = uid;
  return 0;
end $$;

-- extra skills: first week is charged when added
create or replace function public.add_tasker_skill(p_skill_id integer default null, p_custom_name text default null, p_base_fee numeric default null, p_duration_min integer default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n int; sk public.skills; st text := 'active'; nm text; id_ uuid; fee int := public.cfg_int('extra_skill_fee'); paid boolean;
begin
  if not exists (select 1 from public.profiles where id = uid and is_tasker) then raise exception 'tasker_only'; end if;
  if p_base_fee is null or p_base_fee <= 0 then raise exception 'Enter a base fee.'; end if;
  select count(*) into n from public.tasker_skills where tasker_id = uid and status <> 'rejected';
  if n >= public.cfg_int('max_skills') then
    raise exception 'You’ve reached the maximum of % skills (% free + % extra). Remove one to add another.',
      public.cfg_int('max_skills'), public.cfg_int('free_skills'), public.cfg_int('max_skills') - public.cfg_int('free_skills'); end if;
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
  paid := n + 1 > public.cfg_int('free_skills');
  if paid then
    perform pg_advisory_xact_lock(hashtext(uid::text));
    if public.coin_balance(uid) < fee then
      raise exception 'You need % coins to add an extra skill. You have %. Buy coins first.', fee, public.coin_balance(uid); end if;
  end if;
  insert into public.tasker_skills(tasker_id, skill_id, custom_name, base_fee, duration_min, status, slot)
  values (uid, p_skill_id, case when p_skill_id is null then nm end, p_base_fee, p_duration_min, st, n + 1) returning id into id_;
  if paid then
    insert into public.coin_ledger(tasker_id, amount, kind, note) values (uid, -fee, 'skill_charge', 'Extra skill · first week · ' || nm);
  end if;
  return id_;
end $$;

-- job title and years of experience (shown as "Aircon technician · 8 yrs")
create or replace function public.save_tasker_title(p_title text, p_years int) returns void
language plpgsql security definer set search_path = public as $$
declare t text := trim(coalesce(p_title,''));
begin
  if length(t) > 40 then raise exception 'Job title: up to 40 characters.'; end if;
  if t ~ '[0-9]{3,}' or t ~* '(https?://|www\.|\.com\M|facebook|viber|whatsapp|telegram|@[a-z])' then
    raise exception 'No numbers or contact details in your job title.'; end if;
  if t ~* '(doctor|doktor|nurse|therap|dentist|lawyer|attorney|abogado|notar|pharmacist|engineer|architect|psycholog)' then
    raise exception 'Job titles for licensed professions aren’t allowed on TSKR.'; end if;
  if public.contains_banned(t) then raise exception 'That service isn’t allowed on TSKR.'; end if;
  if p_years is not null and (p_years < 1 or p_years > 60) then raise exception 'Years: 1 to 60.'; end if;
  update public.tasker_profiles set title = nullif(t,''), years_experience = p_years, updated_at = now() where user_id = auth.uid();
end $$;

-- demand nudge: real requests near the tasker for their skills in the past 7 days
create or replace function public.tasker_demand(p_tasker uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with tp as (select * from public.tasker_profiles where user_id = p_tasker),
       mine as (select skill_id, public.svc_name(t) nm from public.tasker_skills t where tasker_id = p_tasker and status = 'active' and skill_id is not null order by slot)
  select jsonb_build_object(
    'count', (select count(distinct b.client_id) from public.bookings b join public.booking_items i on i.booking_id = b.id
              join public.tasker_skills ts on ts.id = i.tasker_skill_id, tp
              where b.created_at > now() - interval '7 days' and b.client_id <> p_tasker
                and ts.skill_id in (select skill_id from mine) and tp.base_lat is not null
                and public.km_between(tp.base_lat, tp.base_lng, (b.address->>'lat')::float8, (b.address->>'lng')::float8) <= coalesce(tp.radius_km, 5)),
    'skill', (select nm from mine limit 1))
$$;

-- taskers without coins for a booking fee are hidden from clients and can't get new requests
do $$ declare d text; begin
  d := pg_get_functiondef('public.discover_taskers'::regproc);
  if position('coin_balance(p.id)' in d) = 0 then
    d := replace(d, 'and not public.tasker_is_paused(p.id) and tp.base_lat is not null',
                    'and not public.tasker_is_paused(p.id) and tp.base_lat is not null and public.coin_balance(p.id) >= public.cfg_int(''booking_fee'')');
    execute d;
  end if;
  d := pg_get_functiondef('public.tasker_home'::regproc);
  if position('tasker_demand' in d) = 0 then
    d := replace(d, '''availability'', tp.availability,',
                    '''availability'', tp.availability, ''demand'', public.tasker_demand(uid), ''title'', tp.title, ''years'', tp.years_experience, ''coin_packs'', public.cfg(''coin_packs''),');
    execute d;
  end if;
end $$;

create or replace function public.check_tasker_has_coins() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.coin_balance(new.tasker_id) < public.cfg_int('booking_fee') then
    raise exception 'This tasker isn’t taking requests right now. Please choose another tasker.';
  end if;
  return new;
end $$;
create trigger bookings_tasker_coins before insert on public.bookings for each row execute function public.check_tasker_has_coins();

revoke execute on function public.tasker_demand(uuid) from public, anon;
