-- internal helpers: callable only from other server functions, never from the app
revoke execute on function public.client_booking_block(uuid, boolean)            from authenticated;
revoke execute on function public.coin_balance(uuid)                             from authenticated;
revoke execute on function public.booking_fee_for(public.bookings)               from authenticated;
revoke execute on function public.tasker_ready_to_offer(uuid, public.bookings)   from authenticated;
revoke execute on function public.tasker_is_paused(uuid)                         from authenticated;
revoke execute on function public.cfg(text)                                      from authenticated;
revoke execute on function public.cfg_int(text)                                  from authenticated;
revoke execute on function public.split_full_name(text)                          from authenticated;
alter function public.manila_today() set search_path = public;

-- what the app may ask: "can I book right now?" (only for yourself)
create or replace function public.my_booking_block(p_scheduled boolean default false) returns text
language sql stable security definer set search_path = public as
$$ select public.client_booking_block(auth.uid(), p_scheduled) $$;
