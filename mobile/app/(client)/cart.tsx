import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bubble, colors } from '../../src/theme';
import { ErrorText, T } from '../../src/components/ui';
import { Backdrop, GlossyButton, PressScale, Rise } from '../../src/components/glass';
import { Chip, Ic, MiniAvatar, P, RoundButton, Toast } from '../../src/components/clientUi';
import { AddressSheet } from '../../src/components/AddressSheet';
import { durText, firstName, peso, useClient } from '../../src/lib/client';
import { SavedAddress, addrLine, addrName } from '../../src/lib/places';
import { rpc } from '../../src/lib/supabase';

// server error codes → what the client reads
export const BOOKING_ERRORS: Record<string, string> = {
  verify_account: 'Verify your email and mobile number first (Account › Profile).',
  unpaid_fee: 'You have an unpaid cancellation fee. Pay it to your tasker to book again.',
  free_limit: 'The free plan allows 1 booking a day. Try again tomorrow, or upgrade to TSKR Plus.',
  needs_plus: 'Scheduling for later is a TSKR Plus feature.',
  plus_limit: 'You have the most bookings in progress for TSKR Plus. Finish one to book again.',
};

/** Design: CART / REVIEW BOOKING */
export default function Cart() {
  const insets = useSafeAreaInsets();
  const { cart, addToCart, subtotal, clearCart, addresses, selected, selectAddress, toast, showToast } = useClient();
  const [sheet, setSheet] = useState<null | 'from' | 'to'>(null);
  const [drop, setDrop] = useState<SavedAddress | null>(null);
  const [ack, setAck] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const t = cart.tasker;
  const lines = Object.values(cart.lines);
  const delivery = lines.some((l) => l.delivery);

  const book = async () => {
    if (!t) return;
    setErr('');
    if (!selected) { setSheet('from'); showToast('Add your address first'); return; }
    if (delivery && !drop) { setSheet('to'); showToast('Add the drop-off address (TO) first'); return; }
    if (delivery && !ack) { setErr('Please confirm your items are not on the prohibited list.'); return; }
    setBusy(true);
    try {
      const id = await rpc<string>('create_booking', {
        p_tasker: t.id, p_items: lines.map((l) => ({ tasker_skill_id: l.id, qty: l.qty })), p_address_id: selected.id,
        p_dropoff_address_id: delivery ? drop!.id : null, p_when_type: 'now', p_delivery_ack: delivery && ack,
      });
      clearCart();
      router.replace({ pathname: '/booking/[id]', params: { id } });
    } catch (e: any) {
      setErr(BOOKING_ERRORS[e.message] ?? e.message);
    } finally { setBusy(false); }
  };

  const AddrButton = ({ tag, title, a, empty, onPress }: { tag?: string; title: string; a: SavedAddress | null; empty: string; onPress: () => void }) => (
    <PressScale onPress={onPress} style={[st.addr, !a && { borderStyle: 'dashed', borderColor: colors.error }]}>
      {tag ? <View style={st.tag}><T w="extrabold" style={{ fontSize: 10, color: '#FFF', letterSpacing: 0.5 }}>{tag}</T></View>
        : <Ic d={P.pin} size={22} w={1.8} />}
      <View style={{ flex: 1, gap: 2 }}>
        <T w="semibold" style={{ fontSize: 12, color: colors.muted }}>{title}</T>
        <T w="bold" style={{ fontSize: 15 }}>{a ? addrName(a) : empty}</T>
        <T style={{ fontSize: 13, color: colors.muted }} numberOfLines={2}>{a ? addrLine(a) : 'Tap to choose or add'}</T>
        {!!a?.landmark && <T style={{ fontSize: 12, color: colors.body }}>Note: {a.landmark}</T>}
      </View>
      <T w="bold" style={{ fontSize: 13 }}>{a ? 'Change' : 'Add'}</T>
    </PressScale>
  );

  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: 130 + insets.bottom, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <RoundButton d={P.back} label="Back" onPress={() => router.back()} />
          <T w="extrabold" style={{ fontSize: 22 }}>Review booking</T>
        </View>

        {!t ? (
          <Rise i={0} style={[st.card, { padding: 22, alignItems: 'center', gap: 12 }]}>
            <T w="bold" style={{ fontSize: 16 }}>No services selected yet</T>
            <GlossyButton label="Find a tasker" onPress={() => router.replace('/home')} />
          </Rise>
        ) : (
          <>
            <Rise i={0} style={st.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
                <MiniAvatar initials={t.initials} color={t.color} size={44} r={14} />
                <View style={{ flex: 1 }}>
                  <T w="extrabold" style={{ fontSize: 16 }}>{t.name}</T>
                  <T style={{ fontSize: 13, color: colors.muted }}>Free booking fee</T>
                </View>
              </View>
              {lines.map((l) => (
                <View key={l.id} style={st.line}>
                  <View style={{ flex: 1 }}>
                    <T w="bold" style={{ fontSize: 15 }}>{l.name}</T>
                    {!!l.dur && <T style={{ fontSize: 12, color: colors.muted }}>{durText(l.dur)}</T>}
                  </View>
                  <PressScale accessibilityLabel="Remove one" onPress={() => addToCart(t, l, -1)} style={st.qBtn}><Ic d={P.minus} w={2.4} /></PressScale>
                  <T w="extrabold" style={{ minWidth: 20, textAlign: 'center' }}>{l.qty}</T>
                  <PressScale accessibilityLabel="Add one" onPress={() => addToCart(t, l, 1)} style={st.qBtn}><Ic d={P.plus} w={2.4} /></PressScale>
                  <T w="extrabold" style={{ minWidth: 64, textAlign: 'right' }}>{peso(l.price * l.qty)}</T>
                </View>
              ))}
              <PressScale onPress={() => router.back()} style={{ padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(4,77,94,0.08)' }}>
                <T w="bold" style={{ fontSize: 14 }}>+ Add more services</T>
              </PressScale>
            </Rise>

            <Rise i={1} style={[st.card, { padding: 16, gap: 10 }]}>
              <T w="extrabold" style={st.h2}>When?</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Chip label="Now (ASAP)" on onPress={() => {}} />
                <Chip label="Tomorrow · PLUS" onPress={() => showToast('Scheduling for later is a TSKR Plus feature. Plus comes in the next build.')} />
                <Chip label="Pick a time · PLUS" onPress={() => showToast('Scheduling for later is a TSKR Plus feature. Plus comes in the next build.')} />
              </View>
            </Rise>

            {delivery ? (
              <Rise i={2} style={[st.card, { padding: 16, gap: 10 }]}>
                <T w="extrabold" style={st.h2}>Delivery route</T>
                <AddrButton tag="FROM" title="Pickup" a={selected} empty="Add pickup address" onPress={() => setSheet('from')} />
                <AddrButton tag="TO" title="Drop-off" a={drop} empty="Add drop-off address" onPress={() => setSheet('to')} />
                <T style={{ fontSize: 12, color: colors.muted, lineHeight: 18 }}>Your tasker sees both addresses before sending an offer, so the price covers the full trip.</T>
                <PressScale accessibilityRole="checkbox" accessibilityState={{ checked: ack }} onPress={() => setAck(!ack)}
                  style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingTop: 4 }}>
                  <View style={[st.box, ack && st.boxOn]}>{ack && <Ic d={P.check} size={14} color="#FFF" w={3} />}</View>
                  <T style={{ fontSize: 13, color: colors.body, lineHeight: 19, flex: 1 }}>
                    My items are not on the prohibited list: no drugs, weapons, cash, live animals, flammables or illegal goods. No passengers.
                  </T>
                </PressScale>
              </Rise>
            ) : (
              <Rise i={2}>
                <AddrButton title="Service address" a={selected} empty="Add your address" onPress={() => setSheet('from')} />
              </Rise>
            )}

            <Rise i={3} style={[st.card, { padding: 16, gap: 6 }]}>
              <T w="extrabold" style={st.h2}>Payment</T>
              <T style={{ fontSize: 13, color: colors.body, lineHeight: 20 }}>
                You pay your tasker directly: cash, or scan their payment QR in the app after you accept their offer. TSKR doesn’t hold your money.
              </T>
            </Rise>

            <Rise i={4} style={[st.card, { padding: 16, gap: 8 }]}>
              <Row k="Services" v={peso(subtotal)} />
              <Row k="Booking fee" v="FREE" green />
              <View style={{ height: 1, backgroundColor: 'rgba(4,77,94,0.1)' }} />
              <Row k="Starting total" v={peso(subtotal)} bold />
              <T style={{ fontSize: 12, color: colors.muted, lineHeight: 18 }}>Prices are the tasker’s starting rates. The final amount is confirmed with you before work begins.</T>
            </Rise>
            <ErrorText>{err}</ErrorText>
          </>
        )}
      </ScrollView>

      {t && (
        <View style={[st.bar, { paddingBottom: 12 + Math.max(10, insets.bottom) }]}>
          <GlossyButton label={`Request & chat with ${firstName(t.name)}`} onPress={book} loading={busy} />
        </View>
      )}
      <AddressSheet open={!!sheet} onClose={() => setSheet(null)} addresses={addresses}
        title={sheet === 'to' ? 'Drop-off address' : delivery ? 'Pickup address' : 'Service address'}
        note={sheet === 'to' ? 'Where your tasker drops off the items.' : undefined}
        selectedId={sheet === 'to' ? drop?.id : selected?.id} exclude={sheet === 'to' ? selected?.id : null}
        onPick={(a) => (sheet === 'to' ? setDrop(a) : selectAddress(a.id))} />
      <Toast text={toast} top={insets.top + 10} />
    </View>
  );
}

const Row = ({ k, v, bold, green }: { k: string; v: string; bold?: boolean; green?: boolean }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
    <T w={bold ? 'extrabold' : 'semibold'} style={{ fontSize: bold ? 16 : 14 }}>{k}</T>
    <T w="extrabold" style={{ fontSize: bold ? 17 : 14, color: green ? '#2E7D32' : colors.teal }}>{v}</T>
  </View>
);

const st = StyleSheet.create({
  h2: { fontSize: 17 },
  card: { ...bubble(22, 6), backgroundColor: 'rgba(255,255,255,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)', overflow: 'hidden' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(4,77,94,0.08)' },
  qBtn: { width: 34, height: 34, borderRadius: 11, borderWidth: 1.5, borderColor: colors.teal, alignItems: 'center', justifyContent: 'center' },
  addr: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, ...bubble(16, 4), borderWidth: 1.5, borderColor: colors.borderSoft,
    backgroundColor: '#FFF',
  },
  tag: { backgroundColor: colors.teal, borderRadius: 6, paddingVertical: 3, paddingHorizontal: 6, marginTop: 2 },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: '#98A2B3', alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.teal, borderColor: colors.teal },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 12, paddingHorizontal: 16, backgroundColor: 'rgba(255,255,255,0.9)', borderTopWidth: 1, borderTopColor: colors.borderSoft },
});
