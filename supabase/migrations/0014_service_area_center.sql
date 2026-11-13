-- Tasker profile map: rounded service-area center (privacy: never the exact base).
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
    -- service-area center rounded to ~1 km so the tasker's home isn't exposed
    'area_lat', round(tp.base_lat::numeric, 2), 'area_lng', round(tp.base_lng::numeric, 2),
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
