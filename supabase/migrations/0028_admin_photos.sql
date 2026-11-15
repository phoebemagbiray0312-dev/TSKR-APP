-- Admin profile pictures. Private bucket: only admins can see them; each admin uploads to their own folder.
alter table public.admin_users add column if not exists photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('admin-avatars', 'admin-avatars', false, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists admin_avatars_read on storage.objects;
create policy admin_avatars_read on storage.objects for select to authenticated
  using (bucket_id = 'admin-avatars' and public.is_admin());
drop policy if exists admin_avatars_write on storage.objects;
create policy admin_avatars_write on storage.objects for insert to authenticated
  with check (bucket_id = 'admin-avatars' and public.is_admin() and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists admin_avatars_delete on storage.objects;
create policy admin_avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'admin-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.admin_set_my_photo(p_path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if p_path is not null and split_part(p_path, '/', 1) <> auth.uid()::text then raise exception 'Upload to your own folder.'; end if;
  update public.admin_users set photo_path = p_path where user_id = auth.uid();
end $$;
grant execute on function public.admin_set_my_photo(text) to authenticated;

do $$ declare src text := pg_get_functiondef('public.admin_team()'::regprocedure);
begin
  if position('photo_path' in src) = 0 then
    src := replace(src, '''role'', a.role, ''since'', a.created_at,', '''role'', a.role, ''photo'', a.photo_path, ''since'', a.created_at,');
    execute src;
  end if;
end $$;
