-- ================= helpers =================
create or replace function public.cfg(p_key text) returns jsonb
language sql stable security definer set search_path = public as
$$ select value from public.app_config where key = p_key $$;

create or replace function public.cfg_int(p_key text) returns int
language sql stable security definer set search_path = public as
$$ select (value #>> '{}')::int from public.app_config where key = p_key $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.admin_users where user_id = auth.uid()) $$;

-- GCash-style mask: Mark Dela Cruz -> MA*K D.,  Ana Reyes -> A*A R.,  Jun Santos -> J*N S.
create or replace function public.mask_name(p_first text, p_last text) returns text
language plpgsql immutable set search_path = public as $$
declare w text; n int; keep int;
begin
  w := upper(split_part(trim(coalesce(p_first,'')), ' ', 1));
  n := length(w);
  if n = 0 then return '';
  elsif n <= 2 then w := left(w,1) || '*';
  else keep := case when n >= 4 then 2 else 1 end;
       w := left(w, keep) || repeat('*', n - keep - 1) || right(w, 1);
  end if;
  return w || coalesce(' ' || upper(left(trim(p_last),1)) || '.', '');
end $$;

create or replace function public.coin_balance(p_tasker uuid) returns int
language sql stable security definer set search_path = public as
$$ select coalesce(sum(amount),0)::int from public.coin_ledger where tasker_id = p_tasker $$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = public as
$$ begin new.updated_at := now(); return new; end $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger bookings_touch before update on public.bookings for each row execute function public.touch_updated_at();

create or replace function public.notify(p_user uuid, p_kind text, p_title text, p_body text, p_data jsonb default '{}')
returns void language sql security definer set search_path = public as
$$ insert into public.notifications(user_id, kind, title, body, data) values (p_user, p_kind, p_title, p_body, p_data) $$;

-- ================= new auth user -> profile =================
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare meta jsonb := coalesce(new.raw_user_meta_data, '{}'); full_name text; fn text; ln text; prev uuid;
begin
  full_name := coalesce(meta->>'full_name', meta->>'name', '');
  fn := coalesce(meta->>'given_name',  nullif(regexp_replace(full_name, '\s+\S+$', ''), ''), full_name);
  ln := coalesce(meta->>'family_name', nullif(substring(full_name from '(\S+)$'), ''));
  -- re-sign-up with same email links to the closed record (10.5)
  select id into prev from public.profiles where lower(email) = lower(new.email) and status <> 'active' order by closed_at desc limit 1;
  insert into public.profiles(id, email, first_name, last_name, referral_code, linked_previous_id)
  values (new.id, new.email, nullif(fn,''), ln,
          'TSKR-' || upper(left(regexp_replace(coalesce(fn,'USER'),'[^A-Za-z]','','g'),6)) || lpad((floor(random()*100))::text,2,'0'),
          prev)
  on conflict (referral_code) do nothing;
  if not found then
    insert into public.profiles(id, email, first_name, last_name, referral_code, linked_previous_id)
    values (new.id, new.email, nullif(fn,''), ln, 'TSKR-' || upper(substr(md5(new.id::text),1,8)), prev);
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ================= sign-up RPCs (section 2) =================
-- Consent is given before Google sign-in; the app sends the versions it showed right after login.
create or replace function public.record_signup_consents(p_role public.app_role, p_terms_version text, p_privacy_version text, p_app_version text default null)
returns void language plpgsql security definer set search_path = public as $$
declare d record;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  for d in select * from public.policy_documents
           where role = p_role and is_current and doc_type in ('terms','privacy') loop
    if (d.doc_type = 'terms' and d.version <> p_terms_version) or (d.doc_type = 'privacy' and d.version <> p_privacy_version) then
      raise exception 'policy_version_outdated';
    end if;
    insert into public.consents(user_id, document_id, consent_type, role, version, app_version)
    values (auth.uid(), d.id, d.doc_type, p_role, d.version, p_app_version);
  end loop;
  update public.profiles set signup_role = p_role where id = auth.uid();
end $$;

-- Generic consent (ID consent before tasker ID scan, re-consent after a policy change)
create or replace function public.accept_policy(p_doc_type text, p_role public.app_role, p_app_version text default null)
returns void language plpgsql security definer set search_path = public as $$
declare d record;
begin
  select * into d from public.policy_documents where doc_type = p_doc_type and role = p_role and is_current;
  if d.id is null then raise exception 'policy_not_found'; end if;
  insert into public.consents(user_id, document_id, consent_type, role, version, app_version)
  values (auth.uid(), d.id, p_doc_type, p_role, d.version, p_app_version);
end $$;

-- Which current documents the user still has to (re-)accept
create or replace function public.pending_consents() returns setof public.policy_documents
language sql stable security definer set search_path = public as $$
  select d.* from public.policy_documents d, public.profiles p
  where p.id = auth.uid() and d.is_current and d.doc_type in ('terms','privacy')
    and d.role = case when p.is_tasker then 'tasker'::public.app_role else p.signup_role end
    and not exists (select 1 from public.consents c where c.user_id = p.id and c.document_id = d.id)
$$;

create or replace function public.update_legal_name(p_first text, p_last text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if length(trim(coalesce(p_first,''))) < 2 or length(trim(coalesce(p_last,''))) < 2 then
    raise exception 'Enter your first and last name as shown on your ID.';
  end if;
  update public.profiles set first_name = trim(p_first), last_name = trim(p_last) where id = auth.uid();
end $$;

create or replace function public.request_otp(p_channel text, p_phone text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); target text; code text; last_at timestamptz;
        cooldown int := coalesce(public.cfg_int('otp_resend_cooldown_sec'), 60); demo boolean := coalesce((public.cfg('otp_demo_mode') #>> '{}')::boolean, true);
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_channel = 'email' then
    select email into target from public.profiles where id = uid;
  elsif p_channel = 'sms' then
    target := regexp_replace(coalesce(p_phone,''), '\D', '', 'g');
    if target !~ '^9\d{9}$' then raise exception 'Enter a valid PH mobile number, like 917 123 4567.'; end if;
    if exists (select 1 from public.profiles where phone = target and id <> uid and status = 'active' and phone_verified_at is not null) then
      raise exception 'This mobile number is already used by another account.';
    end if;
  else raise exception 'bad_channel'; end if;

  select max(created_at) into last_at from public.otp_codes where user_id = uid and channel = p_channel;
  if last_at is not null and last_at > now() - make_interval(secs => cooldown) then
    raise exception 'Please wait % seconds before requesting a new code.', ceil(extract(epoch from (last_at + make_interval(secs => cooldown) - now())));
  end if;

  code := case when demo then (public.cfg(case when p_channel='email' then 'demo_email_code' else 'demo_sms_code' end) #>> '{}')
               else lpad((floor(random()*1000000))::int::text, 6, '0') end;
  update public.otp_codes set consumed_at = now() where user_id = uid and channel = p_channel and consumed_at is null;
  insert into public.otp_codes(user_id, channel, target, code_hash, expires_at)
  values (uid, p_channel, target, crypt(code, gen_salt('bf')), now() + interval '10 minutes');
  -- Production: an Edge Function (send-otp) delivers the code via email / Semaphore SMS.
  return jsonb_build_object('sent', true, 'demo', demo, 'cooldown', cooldown, 'target', target);
end $$;

create or replace function public.verify_otp(p_channel text, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.otp_codes;
begin
  select * into r from public.otp_codes
  where user_id = uid and channel = p_channel and consumed_at is null order by created_at desc limit 1;
  if r.id is null or r.expires_at < now() then raise exception 'Your code expired. Tap Resend code.'; end if;
  if r.attempts >= 5 then raise exception 'Too many tries. Tap Resend code.'; end if;
  if p_code !~ '^\d{6}$' or crypt(p_code, r.code_hash) <> r.code_hash then
    update public.otp_codes set attempts = attempts + 1 where id = r.id;
    raise exception '%', case when p_channel='email' then 'That code is incorrect. Check your inbox and try again.'
                              else 'That code is incorrect. Try again or resend.' end;
  end if;
  update public.otp_codes set consumed_at = now() where id = r.id;
  if p_channel = 'email' then
    update public.profiles set email_verified_at = now() where id = uid;
  else
    update public.profiles set phone = r.target, phone_verified_at = now() where id = uid;
  end if;
  return jsonb_build_object('verified', true);
end $$;

create or replace function public.update_my_profile(p_emergency_name text default null, p_emergency_phone text default null)
returns void language sql security definer set search_path = public as $$
  update public.profiles set
    emergency_contact_name  = coalesce(p_emergency_name,  emergency_contact_name),
    emergency_contact_phone = coalesce(p_emergency_phone, emergency_contact_phone)
  where id = auth.uid()
$$;

-- ================= RLS policies =================
-- admins can read/write everything
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname='public' loop
    execute format('create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop; end $$;

-- public reference data
create policy read_all on public.app_config        for select to anon, authenticated using (true);
create policy read_all on public.policy_documents  for select to anon, authenticated using (true);
create policy read_all on public.skill_categories  for select to anon, authenticated using (true);
create policy read_all on public.skills            for select to anon, authenticated using (true);
create policy read_all on public.banned_terms      for select to authenticated using (true);
create policy read_all on public.tasker_profiles   for select to authenticated using (true);
create policy read_all on public.portfolio_photos  for select to authenticated using (true);
create policy read_all on public.reviews           for select to authenticated using (true);
create policy read_active on public.tasker_skills  for select to authenticated using (status = 'active' or tasker_id = auth.uid());

-- own rows
create policy own_read on public.profiles             for select to authenticated using (id = auth.uid());
create policy own_read on public.admin_users          for select to authenticated using (user_id = auth.uid());
create policy own_read on public.consents             for select to authenticated using (user_id = auth.uid());
create policy own_read on public.tasker_verifications for select to authenticated using (user_id = auth.uid());
create policy own_read on public.coin_ledger          for select to authenticated using (tasker_id = auth.uid());
create policy own_read on public.payments             for select to authenticated using (user_id = auth.uid());
create policy own_read on public.strikes              for select to authenticated using (tasker_id = auth.uid());
create policy own_read on public.tasker_pauses        for select to authenticated using (tasker_id = auth.uid());
create policy own_read on public.tickets              for select to authenticated using (reporter_id = auth.uid());
create policy own_read on public.referrals            for select to authenticated using (referrer_id = auth.uid() or referee_id = auth.uid());
create policy own_read on public.notifications        for select to authenticated using (user_id = auth.uid());
create policy own_update on public.notifications      for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy own_all on public.device_tokens for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_all on public.addresses     for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_all on public.favorites     for all to authenticated using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy own_all on public.blocks        for all to authenticated using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
create policy own_insert on public.portfolio_photos for insert to authenticated with check (tasker_id = auth.uid());
create policy own_delete on public.portfolio_photos for delete to authenticated using (tasker_id = auth.uid());

-- tasker edits own public profile (only safe columns are granted)
create policy own_update on public.tasker_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.tasker_profiles from authenticated;
grant update (title, bio, years_experience, radius_km, base_lat, base_lng, area_label, is_online, availability) on public.tasker_profiles to authenticated;

-- booking participants
create or replace function public.is_booking_party(p_booking uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.bookings b where b.id = p_booking and auth.uid() in (b.client_id, b.tasker_id)) $$;

create policy party_read on public.bookings          for select to authenticated using (auth.uid() in (client_id, tasker_id));
create policy party_read on public.booking_items     for select to authenticated using (public.is_booking_party(booking_id));
create policy party_read on public.booking_events    for select to authenticated using (public.is_booking_party(booking_id));
create policy party_read on public.messages          for select to authenticated using (public.is_booking_party(booking_id));
create policy party_read on public.location_pings    for select to authenticated using (public.is_booking_party(booking_id));
create policy party_read on public.cancellation_fees for select to authenticated using (auth.uid() in (client_id, tasker_id));

create policy party_chat on public.messages for insert to authenticated with check (
  sender_id = auth.uid() and kind in ('text','photo') and exists (
    select 1 from public.bookings b where b.id = booking_id and auth.uid() in (b.client_id, b.tasker_id)
      and b.status not in ('completed','cancelled','declined_by_tasker')));
create policy party_read_mark on public.messages for update to authenticated using (public.is_booking_party(booking_id)) with check (public.is_booking_party(booking_id));
revoke update on public.messages from authenticated;
grant update (read_at) on public.messages to authenticated;

create policy party_ping on public.location_pings for insert to authenticated with check (
  user_id = auth.uid() and exists (
    select 1 from public.bookings b where b.id = booking_id and auth.uid() in (b.client_id, b.tasker_id)
      and b.status in ('offer_accepted','on_the_way','arrived','final_price_sent','ready','in_progress')));

-- pgcrypto lives in the "extensions" schema on Supabase
alter function public.request_otp(text, text) set search_path = public, extensions;
alter function public.verify_otp(text, text) set search_path = public, extensions;
