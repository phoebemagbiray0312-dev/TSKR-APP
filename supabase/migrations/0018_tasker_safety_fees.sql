-- get_booking: QR account name for the client, and the cancellation fee (if any) for both parties.
CREATE OR REPLACE FUNCTION public.get_booking(p_booking uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare b public.bookings; c public.profiles; t public.profiles; tp public.tasker_profiles; revealed boolean; me_client boolean; fee public.cancellation_fees;
begin
  select * into b from public.bookings where id = p_booking;
  if b.id is null or auth.uid() not in (b.client_id, b.tasker_id) then raise exception 'not_your_booking'; end if;
  select * into c from public.profiles where id = b.client_id;
  select * into t from public.profiles where id = b.tasker_id;
  select * into tp from public.tasker_profiles where user_id = b.tasker_id;
  select * into fee from public.cancellation_fees where booking_id = b.id order by created_at desc limit 1;
  revealed := b.offer_accepted_at is not null; me_client := auth.uid() = b.client_id;
  return to_jsonb(b) - 'arrival_code' - 'address' - 'dropoff_address' || jsonb_build_object(
    'arrival_code', case when me_client then b.arrival_code end,
    'address', case when me_client or revealed then b.address else b.address - 'street' - 'unit' - 'landmark' end,
    'dropoff_address', b.dropoff_address,
    'client_name', case when revealed then c.first_name || ' ' || c.last_name else public.mask_name(c.first_name, c.last_name) end,
    'tasker_name', case when revealed then t.first_name || ' ' || t.last_name else public.mask_name(t.first_name, t.last_name) end,
    'client_initials', upper(left(c.first_name,1) || left(c.last_name,1)),
    'tasker_initials', upper(left(t.first_name,1) || left(t.last_name,1)),
    'tasker_photo', tp.photo_path,
    'tasker_qr', case when revealed and me_client then jsonb_build_object('path', tp.payment_qr_path, 'wallet', tp.qr_wallet_type, 'account_name', tp.qr_account_name) end,
    'cancel_fee', case when fee.id is not null then jsonb_build_object('id', fee.id, 'amount', fee.amount_php, 'status', fee.status, 'reference', fee.reference_no) end,
    'items', (select coalesce(jsonb_agg(to_jsonb(i) order by i.name), '[]') from public.booking_items i where i.booking_id = b.id),
    'fee_coins_due', public.booking_fee_for(b),
    'client_rating', (select round(avg(rating)::numeric,1) from public.reviews where reviewee_id = b.client_id),
    'tasker_is_demo', t.is_demo,
    'me', case when me_client then 'client' else 'tasker' end);
end $function$;
