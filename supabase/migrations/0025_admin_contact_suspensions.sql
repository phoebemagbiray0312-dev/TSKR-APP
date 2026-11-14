-- Admin: lift a contact-sharing suspension (client or tasker) and optionally clear the warning.
create or replace function public.admin_lift_suspension(p_user uuid, p_clear_warnings boolean default true) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  update public.profiles set suspended_until = null where id = p_user;
  update public.tasker_pauses set ends_at = now() where tasker_id = p_user and reason = 'contact_sharing' and ends_at > now();
  if p_clear_warnings then delete from public.contact_attempts where user_id = p_user; end if;
end $$;
grant execute on function public.admin_lift_suspension(uuid, boolean) to authenticated;
