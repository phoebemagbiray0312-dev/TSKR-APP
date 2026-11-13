-- Client app part 1: richer tasker data for Home / Explore / Tasker profile, plus demo taskers.

-- services: a tasker can list several priced services under one skill ("Aircon cleaning – split type")
alter table public.tasker_skills add column if not exists description text;
create index if not exists tasker_skills_tasker on public.tasker_skills(tasker_id, slot);
alter table public.tasker_profiles add column if not exists color text not null default '#044D5E';
alter table public.profiles add column if not exists is_demo boolean not null default false;

insert into public.skills(category_id, name, needs_license)
select c.id, 'Physical therapy', true from public.skill_categories c where c.name = 'Health'
on conflict (name) do nothing;

-- display name of a service: the tasker's own title, else the skill name
create or replace function public.svc_name(t public.tasker_skills) returns text
language sql stable security definer set search_path = public as
$$ select coalesce(t.custom_name, (select name from public.skills where id = t.skill_id)) $$;

-- Home / Explore list (design: Taskers near you, Featured services, Top service providers)
create or replace function public.discover_taskers(
  p_lat double precision, p_lng double precision, p_query text default null, p_category text default null,
  p_max_km numeric default 6, p_min_rating numeric default 0, p_max_price numeric default null,
  p_available_now boolean default false, p_multi_skill boolean default false, p_favorites boolean default false,
  p_sort text default 'recommended', p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare q text := nullif(trim(coalesce(p_query,'')), ''); out jsonb;
begin
  if q is not null and public.contains_banned(q) then return jsonb_build_object('blocked', true, 'items', '[]'::jsonb); end if;
  with base as (
    select p.id, p.first_name, p.last_name, tp.*, public.km_between(p_lat, p_lng, tp.base_lat, tp.base_lng) dist,
      (select count(*) from public.strikes s where s.tasker_id = p.id and s.created_at > now() - interval '7 days') recent_strikes,
      exists (select 1 from public.favorites f where f.client_id = auth.uid() and f.tasker_id = p.id) fav
    from public.profiles p join public.tasker_profiles tp on tp.user_id = p.id
    where p.is_tasker and p.tasker_status = 'active' and p.status = 'active'
      and p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000')
      and not public.tasker_is_paused(p.id) and tp.base_lat is not null
      and not exists (select 1 from public.blocks bl where (bl.blocker_id = auth.uid() and bl.blocked_id = p.id) or (bl.blocker_id = p.id and bl.blocked_id = auth.uid()))
  ), sv as (
    select t.tasker_id,
      jsonb_agg(jsonb_build_object('id', t.id, 'name', public.svc_name(t), 'desc', t.description, 'price', t.base_fee,
                'dur', t.duration_min, 'category', c.name, 'delivery', coalesce(s.is_delivery,false)) order by t.slot) services,
      array_agg(distinct c.name) filter (where c.name is not null) cats,
      string_agg(public.svc_name(t) || ' ' || coalesce(t.description,'') || ' ' || coalesce(c.name,''), ' ') hay,
      min(t.base_fee) min_fee, count(*)::int n
    from public.tasker_skills t left join public.skills s on s.id = t.skill_id left join public.skill_categories c on c.id = s.category_id
    where t.status = 'active' group by t.tasker_id
  ), rows as (
    select b.*, sv.services, sv.cats, sv.min_fee, sv.n, sv.hay,
      greatest(10, round(10 + b.dist * 8))::int eta_min
    from base b join sv on sv.tasker_id = b.id
    where b.dist <= least(b.radius_km, coalesce(nullif(p_max_km,0), 6))
      and b.rating_avg >= coalesce(p_min_rating, 0)
      and (p_max_price is null or sv.min_fee <= p_max_price)
      and (not p_multi_skill or sv.n >= 3)
      and (not p_favorites or b.fav)
      and (p_category is null or p_category = any(sv.cats))
      and (q is null or b.title ilike '%'||q||'%' or sv.hay ilike '%'||q||'%' or b.first_name ilike '%'||q||'%')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'name', public.mask_name(r.first_name, r.last_name),
      'initials', upper(left(r.first_name,1) || left(r.last_name,1)),
      'title', r.title, 'years', r.years_experience, 'area', r.area_label, 'color', r.color, 'photo', r.photo_path,
      'rating', r.rating_avg, 'reviews', r.rating_count, 'jobs', r.jobs_done,
      'km', round(r.dist::numeric, 1), 'eta_min', r.eta_min,
      'available_now', r.is_online and r.eta_min <= coalesce(public.cfg_int('available_now_minutes'), 45),
      'pro', r.n >= 3, 'favorite', r.fav, 'cats', to_jsonb(r.cats), 'min_price', r.min_fee, 'services', r.services)
    order by
      case when p_sort = 'top_rated' then -r.rating_avg end,
      case when p_sort = 'nearest' then r.dist end,
      case when p_sort = 'lowest_price' then r.min_fee end,
      (r.recent_strikes >= 2), (not r.is_online), -(r.rating_avg * ln(2 + r.rating_count)), r.dist), '[]'::jsonb)
  into out
  from (select * from rows
        where (not p_available_now or (is_online and eta_min <= coalesce(public.cfg_int('available_now_minutes'), 45)))
        limit p_limit) r;
  return jsonb_build_object('blocked', false, 'items', out);
end $$;

-- Tasker profile (design: TASKER PROFILE). Name stays masked; IDs are never shown.
create or replace function public.get_tasker(p_tasker uuid, p_lat double precision default null, p_lng double precision default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p public.profiles; tp public.tasker_profiles; d numeric;
begin
  select * into p from public.profiles where id = p_tasker and is_tasker and tasker_status = 'active' and status = 'active';
  if p.id is null then raise exception 'This tasker is not available.'; end if;
  select * into tp from public.tasker_profiles where user_id = p_tasker;
  d := case when p_lat is not null and tp.base_lat is not null then public.km_between(p_lat, p_lng, tp.base_lat, tp.base_lng) end;
  return jsonb_build_object(
    'id', p.id, 'name', public.mask_name(p.first_name, p.last_name), 'initials', upper(left(p.first_name,1) || left(p.last_name,1)),
    'title', tp.title, 'bio', tp.bio, 'years', tp.years_experience, 'area', tp.area_label, 'color', tp.color, 'photo', tp.photo_path,
    'rating', tp.rating_avg, 'reviews_count', tp.rating_count, 'jobs', tp.jobs_done, 'online', tp.is_online, 'radius_km', tp.radius_km,
    'km', round(d, 1), 'eta_min', case when d is not null then greatest(10, round(10 + d * 8))::int end,
    'favorite', exists (select 1 from public.favorites where client_id = auth.uid() and tasker_id = p.id),
    'services', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', public.svc_name(t), 'desc', t.description,
                   'price', t.base_fee, 'dur', t.duration_min, 'delivery', coalesce(s.is_delivery,false)) order by t.slot), '[]')
                 from public.tasker_skills t left join public.skills s on s.id = t.skill_id where t.tasker_id = p.id and t.status = 'active'),
    'portfolio', (select coalesce(jsonb_agg(photo_path order by taken_at desc), '[]') from public.portfolio_photos where tasker_id = p.id),
    'reviews', (select coalesce(jsonb_agg(x order by x->>'at' desc), '[]') from (
                  select jsonb_build_object('name', initcap(split_part(rp.first_name,' ',1)) || ' ' || upper(left(rp.last_name,1)) || '.',
                    'initials', upper(left(rp.first_name,1) || left(rp.last_name,1)), 'rating', r.rating, 'text', r.body, 'tags', r.tags, 'at', r.created_at) x
                  from public.reviews r join public.profiles rp on rp.id = r.reviewer_id
                  where r.reviewee_id = p.id and r.direction = 'client_to_tasker' order by r.created_at desc limit 20) z));
end $$;

revoke execute on function public.svc_name(public.tasker_skills) from public, anon, authenticated;
revoke execute on function public.discover_taskers(double precision,double precision,text,text,numeric,numeric,numeric,boolean,boolean,boolean,text,int) from public, anon;
revoke execute on function public.get_tasker(uuid,double precision,double precision) from public, anon;
