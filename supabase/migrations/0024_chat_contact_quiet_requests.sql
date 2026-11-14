-- Nov 14 tasker design: contact-number guard in chat (warning, then 1-week suspension),
-- quiet requests while working, requests paused while delivering.

alter table public.profiles add column if not exists suspended_until timestamptz;

create table if not exists public.contact_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists contact_attempts_user on public.contact_attempts(user_id, created_at desc);
alter table public.contact_attempts enable row level security;
drop policy if exists contact_attempts_admin on public.contact_attempts;
create policy contact_attempts_admin on public.contact_attempts for select using (public.is_admin());

insert into public.app_config(key, value, status, description) values
  ('contact_suspend_days', '7', 'agreed', 'Second attempt to share a contact number in chat suspends the account this many days'),
  ('contact_window_days', '90', 'placeholder', 'Earlier attempts older than this are forgotten')
on conflict (key) do nothing;

-- Detects phone numbers, including ones spelled out in English or Tagalog, and other-app handles.
create or replace function public.has_contact_info(p_text text) returns boolean
language plpgsql immutable set search_path = public as $$
declare t text := lower(coalesce(p_text,'')); words int; d text;
begin
  if t ~ '\m(viber|whatsapp|telegram|messenger|wechat|fb\.com|facebook\.com|m\.me)\M' then return true; end if;
  select count(*) into words from regexp_matches(t,
    '\m(zero|oh|sero|one|isa|two|dalawa|three|tatlo|four|apat|five|lima|six|anim|seven|pito|eight|walo|nine|siyam)\M', 'g');
  if words >= 5 then return true; end if;
  d := t;
  d := regexp_replace(d, '\m(zero|oh|sero)\M', '0', 'g');  d := regexp_replace(d, '\m(one|isa)\M', '1', 'g');
  d := regexp_replace(d, '\m(two|dalawa)\M', '2', 'g');    d := regexp_replace(d, '\m(three|tatlo)\M', '3', 'g');
  d := regexp_replace(d, '\m(four|apat)\M', '4', 'g');     d := regexp_replace(d, '\m(five|lima)\M', '5', 'g');
  d := regexp_replace(d, '\m(six|anim)\M', '6', 'g');      d := regexp_replace(d, '\m(seven|pito)\M', '7', 'g');
  d := regexp_replace(d, '\m(eight|walo)\M', '8', 'g');    d := regexp_replace(d, '\m(nine|siyam)\M', '9', 'g');
  d := regexp_replace(d, '[\s\-\.\(\)/_*]', '', 'g');
  return d ~ '(\+?63|0)9[0-9]{9}' or d ~ '(^|[^0-9])9[0-9]{9}([^0-9]|$)' or regexp_replace(t, '[\-\.\(\)/_*]', '', 'g') ~ '[0-9]{11,}';
end $$;

create or replace function public.account_suspended_until(p_user uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select greatest(
    (select suspended_until from public.profiles where id = p_user and suspended_until > now()),
    (select max(ends_at) from public.tasker_pauses where tasker_id = p_user and reason = 'contact_sharing' and now() between starts_at and ends_at))
$$;

-- Chat send with the warning flow. Blocked messages are never stored.
create or replace function public.send_chat(p_booking uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b public.bookings := public._load(p_booking, 'party'); txt text := trim(coalesce(p_body,'')); n int; mid uuid; until timestamptz;
begin
  if txt = '' then raise exception 'Type a message.'; end if;
  if length(txt) > 1000 then raise exception 'Message is too long.'; end if;
  if b.status in ('completed','cancelled','declined_by_tasker') then raise exception 'This chat is closed.'; end if;
  until := public.account_suspended_until(auth.uid());
  if until is not null then return jsonb_build_object('blocked', 'suspended', 'until', until); end if;

  if public.has_contact_info(txt) then
    insert into public.contact_attempts(user_id, booking_id) values (auth.uid(), b.id);
    select count(*) into n from public.contact_attempts
      where user_id = auth.uid() and created_at > now() - make_interval(days => public.cfg_int('contact_window_days'));
    if n <= 1 then return jsonb_build_object('blocked', 'warning'); end if;
    until := now() + make_interval(days => public.cfg_int('contact_suspend_days'));
    if auth.uid() = b.tasker_id then
      insert into public.tasker_pauses(tasker_id, reason, starts_at, ends_at) values (auth.uid(), 'contact_sharing', now(), until);
      update public.tasker_profiles set is_online = false where user_id = auth.uid();
    else
      update public.profiles set suspended_until = until where id = auth.uid();
    end if;
    return jsonb_build_object('blocked', 'suspended', 'until', until);
  end if;

  insert into public.messages(booking_id, sender_id, kind, body) values (b.id, auth.uid(), 'text', txt) returning id into mid;
  return jsonb_build_object('id', mid);
end $$;
grant execute on function public.send_chat(uuid, text) to authenticated;

-- Old entry point keeps the same detection (no warning count).
create or replace function public.send_message(p_booking uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare r jsonb := public.send_chat(p_booking, p_body);
begin
  if r ? 'blocked' then raise exception 'Contact numbers and other apps aren’t allowed in chat. Use the in-app call button instead.'; end if;
  return (r->>'id')::uuid;
end $$;

-- Suspended clients can't book.
create or replace function public.check_client_not_suspended() returns trigger
language plpgsql security definer set search_path = public as $$
declare until timestamptz := public.account_suspended_until(new.client_id);
begin
  if until is not null then
    raise exception 'Your account is suspended until % for sharing contact numbers in chat.', to_char(until at time zone 'Asia/Manila', 'Mon DD, HH12:MI AM');
  end if;
  return new;
end $$;
drop trigger if exists bookings_client_suspended on public.bookings;
create trigger bookings_client_suspended before insert on public.bookings for each row execute function public.check_client_not_suspended();

-- Delivering: on the road with an active delivery job → no new requests.
create or replace function public.tasker_delivering(p_tasker uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.bookings where tasker_id = p_tasker and is_delivery
                 and status in ('on_the_way','arrived','final_price_sent','ready','in_progress'))
$$;
create or replace function public.tasker_busy(p_tasker uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.bookings where tasker_id = p_tasker
                 and status in ('on_the_way','arrived','final_price_sent','ready','in_progress'))
$$;

create or replace function public.check_tasker_has_coins() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.coin_balance(new.tasker_id) < public.cfg_int('booking_fee') or public.tasker_delivering(new.tasker_id) then
    raise exception 'This tasker isn’t taking requests right now. Please choose another tasker.';
  end if;
  return new;
end $$;

do $$
declare src text;
begin
  src := pg_get_functiondef('public.discover_taskers(double precision,double precision,text,text,numeric,numeric,numeric,boolean,boolean,boolean,text,integer)'::regprocedure);
  if position('tasker_delivering' in src) = 0 then
    src := replace(src, 'and not public.tasker_is_paused(p.id)', 'and not public.tasker_is_paused(p.id) and not public.tasker_delivering(p.id)');
    execute src;
  end if;
  src := pg_get_functiondef('public.tasker_home()'::regprocedure);
  if position('''busy''' in src) = 0 then
    src := replace(src, '''coin_packs'', public.cfg(''coin_packs''),',
      '''coin_packs'', public.cfg(''coin_packs''), ''busy'', public.tasker_busy(uid), ''delivering'', public.tasker_delivering(uid), ''suspended_until'', public.account_suspended_until(uid),');
    execute src;
  end if;
end $$;
