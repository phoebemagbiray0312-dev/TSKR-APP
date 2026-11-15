-- Admin team: a superadmin invites people by email. The invited person creates their own login
-- on the admin site with that email; after they confirm the email, they get the role.

create table if not exists public.admin_invites (
  email text primary key check (email = lower(email)),
  role text not null check (role in ('admin','superadmin')),
  first_name text, last_name text,
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.admin_invites enable row level security;
drop policy if exists admin_invites_admin on public.admin_invites;
create policy admin_invites_admin on public.admin_invites for select using (public.is_admin());

create or replace function public.is_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid() and role = 'superadmin')
$$;

-- Returns 'added' when the email already has a TSKR login (role given right away), else 'invited'.
create or replace function public.admin_invite(p_email text, p_role text, p_first text default null, p_last text default null) returns text
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(coalesce(p_email,''))); uid uuid;
begin
  if not public.is_superadmin() then raise exception 'Only a superadmin can add admins.'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email.'; end if;
  if p_role not in ('admin','superadmin') then raise exception 'Choose Admin or Superadmin.'; end if;
  select u.id into uid from auth.users u where lower(u.email) = e and u.email_confirmed_at is not null;
  if uid is not null and exists (select 1 from public.profiles where id = uid) then
    insert into public.admin_users(user_id, role) values (uid, p_role) on conflict (user_id) do update set role = excluded.role;
    if nullif(trim(coalesce(p_first,'')),'') is not null then
      update public.profiles set first_name = trim(p_first), last_name = coalesce(nullif(trim(coalesce(p_last,'')),''), last_name) where id = uid;
    end if;
    delete from public.admin_invites where email = e;
    return 'added';
  end if;
  insert into public.admin_invites(email, role, first_name, last_name, invited_by)
  values (e, p_role, nullif(trim(coalesce(p_first,'')),''), nullif(trim(coalesce(p_last,'')),''), auth.uid())
  on conflict (email) do update set role = excluded.role, first_name = excluded.first_name, last_name = excluded.last_name, invited_by = excluded.invited_by, created_at = now();
  return 'invited';
end $$;

-- Called by the admin site after sign-in. Gives the invited role once the email is confirmed.
create or replace function public.claim_admin_invite() returns boolean
language plpgsql security definer set search_path = public as $$
declare e text; inv public.admin_invites;
begin
  select lower(u.email) into e from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null;
  if e is null then return false; end if;
  select * into inv from public.admin_invites where email = e;
  if inv.email is null or not exists (select 1 from public.profiles where id = auth.uid()) then return false; end if;
  insert into public.admin_users(user_id, role) values (auth.uid(), inv.role) on conflict (user_id) do nothing;
  if inv.first_name is not null then
    update public.profiles set first_name = inv.first_name, last_name = coalesce(inv.last_name, last_name) where id = auth.uid();
  end if;
  delete from public.admin_invites where email = e;
  return true;
end $$;

create or replace function public.admin_team() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  return jsonb_build_object(
    'admins', (select coalesce(jsonb_agg(jsonb_build_object('user_id', a.user_id, 'role', a.role, 'since', a.created_at,
                 'name', trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), 'email', p.email,
                 'last_sign_in', u.last_sign_in_at) order by a.created_at), '[]')
               from public.admin_users a join public.profiles p on p.id = a.user_id left join auth.users u on u.id = a.user_id),
    'invites', (select coalesce(jsonb_agg(jsonb_build_object('email', i.email, 'role', i.role,
                 'name', trim(coalesce(i.first_name,'') || ' ' || coalesce(i.last_name,'')), 'at', i.created_at) order by i.created_at desc), '[]')
                from public.admin_invites i));
end $$;

create or replace function public.admin_set_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_superadmin() then raise exception 'Only a superadmin can change roles.'; end if;
  if p_role not in ('admin','superadmin') then raise exception 'Choose Admin or Superadmin.'; end if;
  if p_user = auth.uid() and p_role <> 'superadmin' then raise exception 'You can’t lower your own role.'; end if;
  update public.admin_users set role = p_role where user_id = p_user;
end $$;

create or replace function public.admin_remove(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_superadmin() then raise exception 'Only a superadmin can remove admins.'; end if;
  if p_user = auth.uid() then raise exception 'You can’t remove yourself.'; end if;
  delete from public.admin_users where user_id = p_user;
end $$;

create or replace function public.admin_cancel_invite(p_email text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_superadmin() then raise exception 'Only a superadmin can cancel invites.'; end if;
  delete from public.admin_invites where email = lower(trim(p_email));
end $$;

grant execute on function public.admin_invite(text, text, text, text), public.claim_admin_invite(), public.admin_team(),
  public.admin_set_role(uuid, text), public.admin_remove(uuid), public.admin_cancel_invite(text), public.is_superadmin() to authenticated;
