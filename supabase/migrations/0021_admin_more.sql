-- Admin: strikes/pauses, coin adjustments, cancellation fees. All logged in coin_ledger notes / booking events.

create or replace function public.admin_remove_strike(p_id uuid, p_refund boolean default true, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare s public.strikes; pen int;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  select * into s from public.strikes where id = p_id;
  if s.id is null then raise exception 'Strike not found.'; end if;
  delete from public.strikes where id = p_id;
  if p_refund then
    select coalesce(sum(-amount),0) into pen from public.coin_ledger
     where tasker_id = s.tasker_id and booking_id is not distinct from s.booking_id and kind = 'penalty' and amount < 0;
    if pen > 0 then
      insert into public.coin_ledger(tasker_id, amount, kind, booking_id, note)
      values (s.tasker_id, least(pen, public.cfg_int('strike2_coins')), 'adjustment', s.booking_id, 'Strike removed by TSKR · penalty refunded');
    end if;
  end if;
  -- lift a strike pause if fewer than 3 strikes remain in 30 days
  if (select count(*) from public.strikes where tasker_id = s.tasker_id and created_at > now() - interval '30 days') < 3 then
    update public.tasker_pauses set ends_at = now() where tasker_id = s.tasker_id and reason = 'strike_3' and ends_at > now();
  end if;
  perform public.notify(s.tasker_id, 'strike_removed', 'A strike was removed', coalesce(p_note, 'Our team reviewed it.'));
end $$;

create or replace function public.admin_end_pause(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  update public.tasker_pauses set ends_at = now() where id = p_id and ends_at > now() returning tasker_id into t;
  if t is not null then perform public.notify(t, 'pause_ended', 'You can get requests again', 'Go online from Home.'); end if;
end $$;

create or replace function public.admin_adjust_coins(p_tasker uuid, p_amount int, p_note text) returns int
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if p_amount = 0 then raise exception 'Enter an amount.'; end if;
  if coalesce(trim(p_note),'') = '' then raise exception 'Write a reason.'; end if;
  if public.coin_balance(p_tasker) + p_amount < 0 then raise exception 'That would make the balance negative.'; end if;
  insert into public.coin_ledger(tasker_id, amount, kind, note) values (p_tasker, p_amount, 'adjustment', 'TSKR adjustment · ' || trim(p_note));
  perform public.notify(p_tasker, 'coins_adjusted', case when p_amount > 0 then p_amount || ' coins added' else (-p_amount) || ' coins deducted' end, trim(p_note));
  return public.coin_balance(p_tasker);
end $$;

create or replace function public.admin_coin_balance(p_tasker uuid) returns int
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  return public.coin_balance(p_tasker);
end $$;

-- settle a cancellation fee dispute: received (client paid) or settled (waived by TSKR)
create or replace function public.admin_set_fee(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare f public.cancellation_fees;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if p_status not in ('received','settled') then raise exception 'bad_status'; end if;
  update public.cancellation_fees set status = p_status, answered_at = now() where id = p_id returning * into f;
  if f.id is null then raise exception 'Fee not found.'; end if;
  perform public.notify(f.client_id, 'fee_' || p_status, case when p_status = 'received' then 'Cancellation fee settled' else 'Cancellation fee waived' end, 'You can book again.');
  perform public.notify(f.tasker_id, 'fee_' || p_status, case when p_status = 'received' then 'Cancellation fee marked received' else 'Cancellation fee waived by TSKR' end, coalesce('Ref: ' || f.reference_no, ''));
end $$;

revoke execute on function public.admin_remove_strike(uuid, boolean, text) from public, anon;
revoke execute on function public.admin_end_pause(uuid) from public, anon;
revoke execute on function public.admin_adjust_coins(uuid, int, text) from public, anon;
revoke execute on function public.admin_coin_balance(uuid) from public, anon;
revoke execute on function public.admin_set_fee(uuid, text) from public, anon;
