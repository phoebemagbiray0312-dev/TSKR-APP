-- Admin panel helpers. Every function checks is_admin(); tables are already readable/writable by admins (admin_all policies).

create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  return jsonb_build_object(
    'applications', (select count(*) from public.tasker_verifications where status in ('submitted','flagged')),
    'qr_pending', (select count(*) from public.tasker_profiles where qr_status = 'pending'),
    'skills_pending', (select count(*) from public.tasker_skills where status = 'pending_review'),
    'tickets_open', (select count(*) from public.tickets where status in ('open','in_review')),
    'sos_open', (select count(*) from public.tickets where kind = 'sos' and status in ('open','in_review')),
    'users', (select count(*) from public.profiles where not is_demo),
    'taskers', (select count(*) from public.profiles where is_tasker and tasker_status = 'active' and not is_demo),
    'online', (select count(*) from public.tasker_profiles tp join public.profiles p on p.id = tp.user_id where tp.is_online and not p.is_demo),
    'bookings_today', (select count(*) from public.bookings where (created_at at time zone 'Asia/Manila')::date = public.manila_today()),
    'active_bookings', (select count(*) from public.bookings where status not in ('completed','cancelled','declined_by_tasker')),
    'completed_total', (select count(*) from public.bookings where status = 'completed'),
    'demo_mode', coalesce((public.cfg('otp_demo_mode') #>> '{}')::boolean, false),
    'payments_demo', coalesce((public.cfg('payments_demo_mode') #>> '{}')::boolean, false));
end $$;

-- every look at someone's IDs is logged (Guide: KYC access log)
create or replace function public.admin_log_kyc_view(p_verification uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  insert into public.kyc_access_log(admin_id, verification_id, action) values (auth.uid(), p_verification, 'view');
end $$;

create or replace function public.admin_review_qr(p_tasker uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  update public.tasker_profiles set qr_status = case when p_approve then 'approved' else 'rejected' end where user_id = p_tasker;
  perform public.notify(p_tasker, 'qr_reviewed', case when p_approve then 'Payment QR approved' else 'Payment QR rejected' end,
    case when p_approve then 'You can now send offers.' else 'The account name must match your ID. Upload a new QR in Me › Payment QR.' end);
end $$;

create or replace function public.admin_review_skill(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare t public.tasker_skills;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  update public.tasker_skills set status = case when p_approve then 'active' else 'rejected' end where id = p_id returning * into t;
  perform public.notify(t.tasker_id, 'skill_reviewed', case when p_approve then 'Skill approved' else 'Skill not approved' end,
    coalesce(t.custom_name, (select name from public.skills where id = t.skill_id)));
end $$;

create or replace function public.admin_set_ticket(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare tk public.tickets;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  update public.tickets set status = p_status where id = p_id returning * into tk;
  if p_status in ('resolved','closed') then
    perform public.notify(tk.reporter_id, 'ticket_' || p_status, 'Report ' || tk.ticket_no || ' ' || p_status, 'Thanks for helping keep TSKR safe.');
  end if;
end $$;

-- suspend or restore any account (taskers go offline)
create or replace function public.admin_set_account(p_user uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  update public.profiles set status = case when p_active then 'active' else 'deactivated' end::public.account_status where id = p_user;
  if not p_active then update public.tasker_profiles set is_online = false where user_id = p_user; end if;
end $$;

revoke execute on function public.admin_overview() from public, anon;
revoke execute on function public.admin_log_kyc_view(uuid) from public, anon;
revoke execute on function public.admin_review_qr(uuid, boolean) from public, anon;
revoke execute on function public.admin_review_skill(uuid, boolean) from public, anon;
revoke execute on function public.admin_set_ticket(uuid, text) from public, anon;
revoke execute on function public.admin_set_account(uuid, boolean) from public, anon;
