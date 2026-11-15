-- Admin: full profile of one user (client or tasker). Every open is logged.

create table if not exists public.admin_profile_views (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists admin_profile_views_user on public.admin_profile_views(user_id, created_at desc);
alter table public.admin_profile_views enable row level security;
drop policy if exists admin_profile_views_admin on public.admin_profile_views;
create policy admin_profile_views_admin on public.admin_profile_views for select using (public.is_admin());

create or replace function public.admin_user_profile(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; tp public.tasker_profiles; v record; out jsonb;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  select * into p from public.profiles where id = p_user;
  if p.id is null then raise exception 'User not found.'; end if;
  insert into public.admin_profile_views(admin_id, user_id) values (auth.uid(), p_user);
  select * into tp from public.tasker_profiles where user_id = p_user;
  select id, status, id1_type, id2_type, id1_image_path, id2_image_path, selfie_path, submitted_at, reviewed_at, flags into v
    from public.tasker_verifications where user_id = p_user order by submitted_at desc nulls last limit 1;

  out := jsonb_build_object(
    'id', p.id, 'first_name', p.first_name, 'last_name', p.last_name, 'email', p.email, 'phone', p.phone,
    'status', p.status, 'plan', p.plan, 'plus_until', p.plus_until, 'signup_role', p.signup_role,
    'is_tasker', p.is_tasker, 'tasker_status', p.tasker_status, 'created_at', p.created_at, 'is_demo', p.is_demo,
    'emergency_name', p.emergency_contact_name, 'emergency_phone', p.emergency_contact_phone,
    'suspended_until', public.account_suspended_until(p.id), 'closed_at', p.closed_at, 'close_reason', p.close_reason,
    'is_admin', exists (select 1 from public.admin_users where user_id = p.id),
    'areas', (select coalesce(jsonb_agg(distinct trim(coalesce(barangay,'') || ', ' || coalesce(city,''))), '[]') from public.addresses where user_id = p.id),
    'as_client', jsonb_build_object(
      'total', (select count(*) from public.bookings where client_id = p.id),
      'completed', (select count(*) from public.bookings where client_id = p.id and status = 'completed'),
      'cancelled', (select count(*) from public.bookings where client_id = p.id and status = 'cancelled' and cancelled_by = p.id),
      'rating', (select round(avg(rating)::numeric, 1) from public.reviews where reviewee_id = p.id and direction = 'tasker_to_client'),
      'rating_count', (select count(*) from public.reviews where reviewee_id = p.id and direction = 'tasker_to_client')),
    'reports_against', (select coalesce(jsonb_agg(jsonb_build_object('no', t.ticket_no, 'kind', t.kind, 'reasons', t.reasons, 'status', t.status, 'at', t.created_at) order by t.created_at desc), '[]')
                        from (select * from public.tickets where reported_id = p.id order by created_at desc limit 10) t),
    'reports_count', (select count(*) from public.tickets where reported_id = p.id),
    'contact_attempts_90d', (select count(*) from public.contact_attempts where user_id = p.id and created_at > now() - interval '90 days'),
    'blocked_by', (select count(*) from public.blocks where blocked_id = p.id),
    'reviews', (select coalesce(jsonb_agg(jsonb_build_object('rating', r.rating, 'body', r.body, 'tags', r.tags, 'direction', r.direction, 'at', r.created_at) order by r.created_at desc), '[]')
                from (select * from public.reviews where reviewee_id = p.id order by created_at desc limit 5) r),
    'bookings', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'code', b.code, 'status', b.status, 'at', b.created_at,
                    'role', case when b.client_id = p.id then 'client' else 'tasker' end,
                    'other', (select first_name || ' ' || last_name from public.profiles o where o.id = case when b.client_id = p.id then b.tasker_id else b.client_id end),
                    'amount', coalesce(b.final_price, b.initial_offer, b.starting_total)) order by b.created_at desc), '[]')
                 from (select * from public.bookings where client_id = p.id or tasker_id = p.id order by created_at desc limit 10) b),
    'views', (select coalesce(jsonb_agg(jsonb_build_object('by', a.first_name || ' ' || a.last_name, 'at', x.created_at) order by x.created_at desc), '[]')
              from (select * from public.admin_profile_views where user_id = p.id order by created_at desc limit 5) x join public.profiles a on a.id = x.admin_id)
  );

  if tp.user_id is not null then
    out := out || jsonb_build_object('tasker', jsonb_build_object(
      'nickname', tp.nickname, 'title', tp.title, 'years', tp.years_experience, 'bio', tp.bio, 'photo_path', tp.photo_path,
      'area', tp.area_label, 'radius_km', tp.radius_km, 'online', tp.is_online, 'rating', tp.rating_avg, 'rating_count', tp.rating_count,
      'jobs_done', tp.jobs_done, 'qr_status', tp.qr_status, 'qr_wallet', tp.qr_wallet_type, 'qr_name', tp.qr_account_name, 'qr_path', tp.payment_qr_path,
      'coins', public.coin_balance(p.id), 'paused', public.tasker_is_paused(p.id), 'top', public.is_top_tasker(p.id),
      'strikes_90d', (select coalesce(sum(weight),0) from public.strikes where tasker_id = p.id and created_at > now() - interval '90 days'),
      'skills', (select coalesce(jsonb_agg(jsonb_build_object('name', public.svc_name(s), 'price', s.base_fee, 'status', s.status) order by s.slot), '[]') from public.tasker_skills s where s.tasker_id = p.id),
      'portfolio', (select coalesce(jsonb_agg(photo_path order by taken_at desc), '[]') from (select * from public.portfolio_photos where tasker_id = p.id order by taken_at desc limit 9) x),
      'verification', case when v.id is null then null else jsonb_build_object('id', v.id, 'status', v.status, 'id1_type', v.id1_type, 'id2_type', v.id2_type,
                        'id1_path', v.id1_image_path, 'id2_path', v.id2_image_path, 'selfie_path', v.selfie_path, 'submitted_at', v.submitted_at, 'flags', v.flags) end,
      'as_tasker', jsonb_build_object(
        'total', (select count(*) from public.bookings where tasker_id = p.id),
        'completed', (select count(*) from public.bookings where tasker_id = p.id and status = 'completed'),
        'cancelled', (select count(*) from public.bookings where tasker_id = p.id and status = 'cancelled' and cancelled_by = p.id))));
  end if;
  return out;
end $$;
grant execute on function public.admin_user_profile(uuid) to authenticated;
