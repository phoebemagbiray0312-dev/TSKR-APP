-- "Juan Dela Cruz" -> ("Juan", "Dela Cruz"); "Maria Clara de los Santos" -> ("Maria Clara", "de los Santos")
create or replace function public.split_full_name(p_full text, out first_name text, out last_name text)
language plpgsql immutable set search_path = public as $$
declare w text[] := regexp_split_to_array(trim(coalesce(p_full,'')), '\s+'); n int; i int;
        particles text[] := array['de','dela','del','della','delos','des','di','da','la','las','los','san','santa','sta','sta.','sto','sto.','santo','van','von','y'];
begin
  n := coalesce(array_length(w,1),0);
  if n = 0 or w[1] = '' then return; end if;
  if n = 1 then first_name := w[1]; return; end if;
  i := n;
  while i > 2 and lower(w[i-1]) = any(particles) loop i := i - 1; end loop;
  first_name := array_to_string(w[1:i-1], ' ');
  last_name  := array_to_string(w[i:n], ' ');
end $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare meta jsonb := coalesce(new.raw_user_meta_data, '{}'); sp record; fn text; ln text; prev uuid;
begin
  sp := public.split_full_name(coalesce(meta->>'full_name', meta->>'name', ''));
  fn := coalesce(nullif(meta->>'given_name',''), sp.first_name);
  ln := coalesce(nullif(meta->>'family_name',''), sp.last_name);
  select id into prev from public.profiles where lower(email) = lower(new.email) and status <> 'active' order by closed_at desc limit 1;
  insert into public.profiles(id, email, first_name, last_name, referral_code, linked_previous_id)
  values (new.id, new.email, fn, ln,
          'TSKR-' || upper(left(regexp_replace(coalesce(fn,'USER'),'[^A-Za-z]','','g'),6)) || lpad((floor(random()*100))::text,2,'0'),
          prev)
  on conflict (referral_code) do nothing;
  if not found then
    insert into public.profiles(id, email, first_name, last_name, referral_code, linked_previous_id)
    values (new.id, new.email, fn, ln, 'TSKR-' || upper(substr(md5(new.id::text),1,8)), prev);
  end if;
  return new;
end $$;
