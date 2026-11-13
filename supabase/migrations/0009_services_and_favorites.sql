-- Several priced services may share one skill (e.g. window and split-type aircon cleaning)
drop index if exists public.tasker_skills_unique_skill;
create index if not exists tasker_skills_skill on public.tasker_skills(tasker_id, skill_id);

create or replace function public.toggle_favorite(p_tasker uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.favorites where client_id = auth.uid() and tasker_id = p_tasker) then
    delete from public.favorites where client_id = auth.uid() and tasker_id = p_tasker; return false;
  end if;
  insert into public.favorites(client_id, tasker_id) values (auth.uid(), p_tasker); return true;
end $$;

revoke execute on function public.toggle_favorite(uuid) from public, anon;
