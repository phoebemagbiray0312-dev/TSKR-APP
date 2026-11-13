-- Client part 3 helpers: chat photos, TSKR Plus (demo payment), my data export.

-- chat photos: stored under chat/<booking id>/..., visible only to the two people in that booking
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('chat', 'chat', false, 10485760, array['image/jpeg','image/png','image/heic'])
on conflict (id) do nothing;

create or replace function public.chat_folder_ok(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare bid uuid;
begin
  begin bid := (storage.foldername(p_name))[1]::uuid; exception when others then return false; end;
  return public.is_booking_party(bid);
end $$;

create policy chat_party_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'chat' and public.chat_folder_ok(name));
create policy chat_party_read on storage.objects for select to authenticated
  using (bucket_id = 'chat' and public.chat_folder_ok(name));

create or replace function public.send_photo(p_booking uuid, p_path text, p_caption text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare b public.bookings := public._load(p_booking, 'party'); mid uuid;
begin
  if b.status in ('completed','cancelled','declined_by_tasker') then raise exception 'This chat is closed.'; end if;
  if p_path not like p_booking::text || '/%' then raise exception 'Photo upload failed. Try again.'; end if;
  insert into public.messages(booking_id, sender_id, kind, body, photo_path)
  values (b.id, auth.uid(), 'photo', nullif(trim(coalesce(p_caption,'')),''), p_path) returning id into mid;
  return mid;
end $$;

-- TSKR Plus. Real billing comes with PayMongo/Xendit; in demo mode the upgrade is free for 30 days.
create or replace function public.my_plan() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plan', case when p.plan = 'plus' and coalesce(p.plus_until, now()) >= now() then 'plus' else 'free' end,
    'plus_until', p.plus_until,
    'price', public.cfg_int('plus_price_php'),
    'max_active', public.cfg_int('plus_active_bookings'),
    'demo', coalesce((public.cfg('payments_demo_mode') #>> '{}')::boolean, false),
    'today_count', (select count(*) from public.bookings b where b.client_id = p.id
                    and (b.created_at at time zone 'Asia/Manila')::date = public.manila_today()
                    and b.status <> 'declined_by_tasker' and not (b.status = 'cancelled' and b.offer_accepted_at is null)))
  from public.profiles p where p.id = auth.uid()
$$;

create or replace function public.demo_upgrade_plus() returns timestamptz
language plpgsql security definer set search_path = public as $$
declare until timestamptz;
begin
  if not coalesce((public.cfg('payments_demo_mode') #>> '{}')::boolean, false) then
    raise exception 'Payments are not connected yet.'; end if;
  update public.profiles set plan = 'plus', plus_until = greatest(coalesce(plus_until, now()), now()) + interval '30 days'
  where id = auth.uid() returning plus_until into until;
  perform public.notify(auth.uid(), 'plus_started', 'Welcome to TSKR Plus', 'Test build: Plus is on for 30 days, no charge.');
  return until;
end $$;

-- Legal and privacy › Download a copy of my data
create or replace function public.export_my_data() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) - 'close_note' from public.profiles p where p.id = auth.uid()),
    'addresses', (select coalesce(jsonb_agg(to_jsonb(a)), '[]') from public.addresses a where a.user_id = auth.uid()),
    'bookings', (select coalesce(jsonb_agg(jsonb_build_object('code', b.code, 'status', b.status, 'created_at', b.created_at,
                  'total', coalesce(b.final_price, b.initial_offer, b.starting_total))), '[]') from public.bookings b where auth.uid() in (b.client_id, b.tasker_id)),
    'consents', (select coalesce(jsonb_agg(jsonb_build_object('type', c.consent_type, 'version', c.version, 'at', c.accepted_at)), '[]') from public.consents c where c.user_id = auth.uid()),
    'reviews_written', (select coalesce(jsonb_agg(jsonb_build_object('rating', r.rating, 'body', r.body, 'at', r.created_at)), '[]') from public.reviews r where r.reviewer_id = auth.uid()))
$$;

revoke execute on function public.chat_folder_ok(text) from anon;   -- storage policies call it as the signed-in user
revoke execute on function public.send_photo(uuid,text,text) from public, anon;
revoke execute on function public.my_plan() from public, anon;
revoke execute on function public.demo_upgrade_plus() from public, anon;
revoke execute on function public.export_my_data() from public, anon;
