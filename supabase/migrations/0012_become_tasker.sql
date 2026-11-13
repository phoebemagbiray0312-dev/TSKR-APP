-- Become a Tasker: photo storage, the tasker's "TSKR office", and verification submit.

-- ---------- storage ----------
-- kyc: government IDs and face-check selfies. Private: only the owner can upload, only admins can read.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('kyc', 'kyc', false, 10485760, array['image/jpeg','image/png','image/heic'])
on conflict (id) do nothing;
-- tasker-media: profile selfie and office photos. Signed-in users can view; owners manage their own folder.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('tasker-media', 'tasker-media', false, 10485760, array['image/jpeg','image/png','image/heic'])
on conflict (id) do nothing;

create policy kyc_owner_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'kyc' and (storage.foldername(name))[1] = auth.uid()::text);
create policy kyc_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'kyc' and public.is_admin());

create policy media_owner_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'tasker-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy media_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'tasker-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy media_read on storage.objects for select to authenticated
  using (bucket_id = 'tasker-media');

-- ---------- the tasker's office (design: DESIGN YOUR PROFILE) ----------
alter table public.tasker_profiles add column if not exists nickname text;

create or replace function public.save_tasker_office(p_nickname text, p_about text, p_photo_path text, p_office_paths text[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); nick text := trim(coalesce(p_nickname,'')); about text := trim(coalesce(p_about,'')); pth text;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_photo_path is null or p_photo_path not like uid::text || '/%' then raise exception 'Add a profile photo to continue.'; end if;
  if nick = '' then raise exception 'Add a nickname.'; end if;
  if length(nick) > 20 then raise exception 'Nickname: up to 20 characters.'; end if;
  if length(about) > 300 then raise exception 'About: up to 300 characters.'; end if;
  if public.contains_banned(nick) or public.contains_banned(about) then raise exception 'That service isn’t allowed on TSKR.'; end if;
  if regexp_replace(nick || about, '[^0-9]', '', 'g') ~ '(09|639)[0-9]{9}' or (nick || ' ' || about) ~* '(https?://|www\.|\.com\M|facebook|viber|whatsapp|telegram|@[a-z])' then
    raise exception 'No phone numbers, links or social media in your nickname or About.'; end if;
  if coalesce(array_length(p_office_paths,1),0) > 12 then raise exception 'Up to 12 office photos.'; end if;

  insert into public.tasker_profiles(user_id, nickname, bio, photo_path) values (uid, nick, nullif(about,''), p_photo_path)
  on conflict (user_id) do update set nickname = excluded.nickname, bio = excluded.bio, photo_path = excluded.photo_path, updated_at = now();

  foreach pth in array coalesce(p_office_paths, '{}') loop
    if pth like uid::text || '/%' and not exists (select 1 from public.portfolio_photos where tasker_id = uid and photo_path = pth) then
      insert into public.portfolio_photos(tasker_id, photo_path) values (uid, pth);
    end if;
  end loop;
end $$;

-- ---------- submit (replaces 0003 version) ----------
-- Until the ID-check provider is connected, OCR and face match are not automatic: the application is
-- flagged 'ocr_pending' / 'face_check_pending' and the admin compares the photos by hand. Never auto-rejects.
create or replace function public.submit_tasker_verification(
  p_id1_type text, p_id1_path text, p_id1_ocr jsonb, p_id2_type text, p_id2_path text, p_id2_ocr jsonb,
  p_selfie_path text, p_face_score numeric) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); p public.profiles; fl text[] := '{}'; st text; norm text;
begin
  select * into p from public.profiles where id = uid;
  if p.email_verified_at is null or p.phone_verified_at is null then raise exception 'Verify your email and mobile number first.'; end if;
  if p.tasker_status in ('pending','active') then raise exception 'Your application is already in.'; end if;
  if not exists (select 1 from public.consents c join public.policy_documents d on d.id = c.document_id
                 where c.user_id = uid and d.doc_type = 'id_consent' and d.is_current) then
    raise exception 'Please give ID consent first.'; end if;
  if coalesce(p_id1_type,'') = '' or coalesce(p_id2_type,'') = '' then raise exception 'Scan 2 government IDs.'; end if;
  if p_id1_type = p_id2_type then raise exception 'Use 2 different ID types.'; end if;
  if p_id1_path not like uid::text || '/%' or p_id2_path not like uid::text || '/%' or p_selfie_path not like uid::text || '/%' then
    raise exception 'Photos are missing. Please scan again.'; end if;
  if not exists (select 1 from public.tasker_profiles where user_id = uid and photo_path is not null) then
    raise exception 'Design your TSKR office first.'; end if;

  norm := regexp_replace(upper(coalesce(p.first_name,'') || coalesce(p.last_name,'')), '[^A-Z]', '', 'g');
  if p_id1_ocr->>'name' is null or p_id2_ocr->>'name' is null then fl := array_append(fl, 'ocr_pending');
  else
    if regexp_replace(upper(p_id1_ocr->>'name'), '[^A-Z]', '', 'g') <> norm then fl := array_append(fl, 'id1_name_mismatch'); end if;
    if regexp_replace(upper(p_id2_ocr->>'name'), '[^A-Z]', '', 'g') <> norm then fl := array_append(fl, 'id2_name_mismatch'); end if;
    if (p_id1_ocr->>'birthdate') is distinct from (p_id2_ocr->>'birthdate') then fl := array_append(fl, 'birthday_mismatch'); end if;
  end if;
  if p_face_score is null then fl := array_append(fl, 'face_check_pending');
  elsif p_face_score < coalesce((public.cfg('face_match_threshold') #>> '{}')::numeric, 0.8) then fl := array_append(fl, 'face_mismatch'); end if;
  st := case when cardinality(fl) > 0 then 'flagged' else 'submitted' end;

  insert into public.tasker_verifications(user_id, id1_type, id1_image_path, id1_ocr, id2_type, id2_image_path, id2_ocr,
                                          selfie_path, face_match_score, flags, status, submitted_at)
  values (uid, p_id1_type, p_id1_path, p_id1_ocr, p_id2_type, p_id2_path, p_id2_ocr, p_selfie_path, p_face_score, fl, st, now());
  update public.profiles set tasker_status = 'pending', signup_role = 'tasker' where id = uid;
  perform public.notify(uid, 'tasker_submitted', 'Application submitted', 'We''ll review your documents within 24–48 hours.');
  return st;
end $$;

-- where am I in Become a Tasker?
create or replace function public.my_tasker_application() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tasker_status', p.tasker_status,
    'has_office', exists (select 1 from public.tasker_profiles tp where tp.user_id = p.id and tp.photo_path is not null),
    'nickname', (select nickname from public.tasker_profiles where user_id = p.id),
    'about', (select bio from public.tasker_profiles where user_id = p.id),
    'id_consent', exists (select 1 from public.consents c join public.policy_documents d on d.id = c.document_id
                          where c.user_id = p.id and d.doc_type = 'id_consent' and d.is_current),
    'latest', (select jsonb_build_object('status', v.status, 'id1', v.id1_type, 'id2', v.id2_type, 'submitted_at', v.submitted_at, 'note', v.review_note)
               from public.tasker_verifications v where v.user_id = p.id order by v.created_at desc limit 1),
    'full_name', p.first_name || ' ' || p.last_name,
    'masked_name', public.mask_name(p.first_name, p.last_name))
  from public.profiles p where p.id = auth.uid()
$$;

revoke execute on function public.save_tasker_office(text,text,text,text[]) from public, anon;
revoke execute on function public.my_tasker_application() from public, anon;
