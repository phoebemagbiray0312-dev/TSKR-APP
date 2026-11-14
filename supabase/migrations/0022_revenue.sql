-- Revenue report for the admin panel. TSKR earns from coin packs and TSKR Plus.
-- Job payments and cancellation fees go straight to taskers and are NOT TSKR revenue.

-- record test-build Plus upgrades as (demo) payments so the report shows them
create or replace function public.demo_upgrade_plus() returns timestamptz
language plpgsql security definer set search_path = public as $$
declare until timestamptz;
begin
  if not coalesce((public.cfg('payments_demo_mode') #>> '{}')::boolean, false) then
    raise exception 'Payments are not connected yet.'; end if;
  update public.profiles set plan = 'plus', plus_until = greatest(coalesce(plus_until, now()), now()) + interval '30 days'
  where id = auth.uid() returning plus_until into until;
  insert into public.payments(user_id, purpose, amount_php, gateway, gateway_txn_id, method, status, paid_at)
  values (auth.uid(), 'plus', public.cfg_int('plus_price_php'), 'demo', 'DEMO-' || upper(substr(md5(random()::text),1,10)), 'demo', 'paid', now());
  perform public.notify(auth.uid(), 'plus_started', 'Welcome to TSKR Plus', 'Test build: Plus is on for 30 days, no charge.');
  return until;
end $$;

create or replace function public.admin_revenue(p_from timestamptz, p_to timestamptz, p_include_demo boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  with pay as (
    select p.* from public.payments p join public.profiles u on u.id = p.user_id
    where p.status = 'paid' and p.paid_at >= p_from and p.paid_at < p_to
      and (p_include_demo or (p.gateway <> 'demo' and not u.is_demo))
  ), led as (
    select l.* from public.coin_ledger l join public.profiles u on u.id = l.tasker_id
    where l.created_at >= p_from and l.created_at < p_to and (p_include_demo or not u.is_demo)
  )
  select jsonb_build_object(
    'total_php', (select coalesce(sum(amount_php),0) from pay),
    'coins_php', (select coalesce(sum(amount_php),0) from pay where purpose = 'coins'),
    'coins_count', (select count(*) from pay where purpose = 'coins'),
    'plus_php', (select coalesce(sum(amount_php),0) from pay where purpose = 'plus'),
    'plus_count', (select count(*) from pay where purpose = 'plus'),
    'refunds_php', (select coalesce(sum(p.amount_php),0) from public.payments p where p.status = 'refunded' and p.paid_at >= p_from and p.paid_at < p_to),
    'by_day', (select coalesce(jsonb_agg(x order by x->>'day'), '[]') from (
                 select jsonb_build_object('day', (paid_at at time zone 'Asia/Manila')::date, 'coins', coalesce(sum(amount_php) filter (where purpose='coins'),0),
                                           'plus', coalesce(sum(amount_php) filter (where purpose='plus'),0)) x
                 from pay group by (paid_at at time zone 'Asia/Manila')::date) z),
    'used', jsonb_build_object(
       'booking_fee', (select coalesce(-sum(amount),0) from led where kind = 'booking_fee'),
       'delivery_fee', (select coalesce(-sum(amount),0) from led where kind = 'delivery_fee'),
       'skill_charge', (select coalesce(-sum(amount),0) from led where kind = 'skill_charge'),
       'penalty', (select coalesce(-sum(amount),0) from led where kind = 'penalty')),
    'free_coins_given', (select coalesce(sum(amount),0) from led where kind = 'signup_bonus' or (kind = 'adjustment' and amount > 0)),
    'free_bookings', (select count(*) from public.bookings b join public.profiles u on u.id = b.tasker_id
                      where b.reward_free and b.started_at >= p_from and b.started_at < p_to and (p_include_demo or not u.is_demo)),
    'coins_outstanding', (select coalesce(sum(l.amount),0) from public.coin_ledger l join public.profiles u on u.id = l.tasker_id where p_include_demo or not u.is_demo),
    'plus_active', (select count(*) from public.profiles where plan = 'plus' and plus_until >= now() and (p_include_demo or not is_demo))
  ) into r;
  return r;
end $$;
revoke execute on function public.admin_revenue(timestamptz, timestamptz, boolean) from public, anon;
