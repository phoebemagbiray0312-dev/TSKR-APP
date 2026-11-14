import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { colors, font } from '../../../../src/theme';
import { T } from '../../../../src/components/ui';
import { Backdrop, GlossyButton, PressScale } from '../../../../src/components/glass';
import { Chip, Ic, MiniAvatar, P, RoundButton, Sheet, TealGloss, Toast, glassCard } from '../../../../src/components/clientUi';
import { peso, useClient } from '../../../../src/lib/client';
import { addrLine } from '../../../../src/lib/places';
import { DEMO_CLIENT_ID, STATUS_LABEL } from '../../../../src/lib/tasker';
import { LiveMap } from '../../../../src/components/LiveMap';
import { rpc, supabase } from '../../../../src/lib/supabase';
import * as Location from 'expo-location';
import { ChatBlock, ContactWarnSheet, sendChat } from '../../../../src/components/ContactWarnSheet';

type Booking = {
  id: string; client_id: string; code: string; status: string; is_delivery: boolean; items_checked: boolean; proof_of_delivery_path: string | null;
  starting_total: number; initial_offer: number | null; final_price: number | null; is_repeat_client: boolean;
  client_name: string; client_initials: string; client_rating: number | null; address: any; dropoff_address: any;
  fee_coins_due: number; offer_accepted_at: string | null; when_type: string; scheduled_at: string | null;
  items: { id: string; name: string; qty: number; unit_price: number }[];
  eta_at: string | null; cancel_fee: { id: string; amount: number; status: string; reference: string | null } | null;
};
type Msg = { id: string; sender_id: string | null; kind: string; body: string | null; amount: number | null; photo_path?: string | null; created_at: string };
const CHAT = ['requested', 'chatting', 'offer_sent'];
const LIVE = ['offer_accepted', 'on_the_way', 'arrived', 'final_price_sent', 'ready', 'in_progress'];
const REPORT_REASONS = ['Rude or threatening', 'Asked for my number or to pay outside TSKR', 'Unsafe place', 'Asked for a prohibited service', 'Didn’t pay', 'Fake booking', 'Other'];
const CANCEL_REASONS: [string, string][] = [['emergency', 'Personal emergency'], ['client_absent', 'Client isn’t there'], ['unsafe', 'I feel unsafe'], ['client_asked', 'Client asked me to cancel'], ['other', 'Other reason']];

/** Design: tasker JOB — chat and offer, then on the way, arrival code, final price, start, complete. */
export default function TaskerJob() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { toast, showToast } = useClient();
  const [b, setB] = useState<Booking | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [view, setView] = useState<'chat' | 'job'>('chat');
  const [draft, setDraft] = useState('');
  const [offer, setOffer] = useState('');
  const [code, setCode] = useState('');
  const [finalAmt, setFinalAmt] = useState('');
  const [reason, setReason] = useState('');
  const [pay, setPay] = useState<'cash' | 'qr' | null>(null);
  const [busy, setBusy] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [rated, setRated] = useState(false);
  const [repOpen, setRepOpen] = useState(false);
  const [repReasons, setRepReasons] = useState<string[]>([]);
  const [repText, setRepText] = useState('');
  const [repBlock, setRepBlock] = useState(false);
  const chatRef = useRef<ScrollView>(null);
  const [block, setBlock] = useState<ChatBlock>(null);
  const [idCheck, setIdCheck] = useState(false);
  const idShown = useRef(false);
  const [ec, setEc] = useState<{ name: string | null; phone: string | null }>({ name: null, phone: null });

  const load = useCallback(async () => {
    try {
      const [bk, m] = await Promise.all([
        rpc<Booking>('get_booking', { p_booking: id }),
        supabase.from('messages').select('id,sender_id,kind,body,amount,photo_path,created_at').eq('booking_id', id).order('created_at'),
      ]);
      setB(bk); setMsgs((m.data ?? []) as Msg[]);
      setOffer((o) => o || String(Math.round(Number(bk.initial_offer ?? bk.starting_total))));
      setFinalAmt((f) => f || String(Math.round(Number(bk.initial_offer ?? bk.starting_total))));
    } catch (e: any) { showToast(e.message); }
  }, [id]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      setMe(data.user?.id ?? null);
      if (data.user) {
        const { data: pr } = await supabase.from('profiles').select('emergency_contact_name,emergency_contact_phone').eq('id', data.user.id).maybeSingle();
        setEc({ name: pr?.emergency_contact_name ?? null, phone: pr?.emergency_contact_phone ?? null });
      }
    });
    load();
    const ch = supabase.channel(`tjob-${id}-${Date.now()}-${Math.random()}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings', filter: `id=eq.${id}` }, () => load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `booking_id=eq.${id}` },
        (p) => setMsgs((cur) => (cur.some((x) => x.id === (p.new as Msg).id) ? cur : [...cur, p.new as Msg])))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);
  useEffect(() => { if (b) setView(CHAT.includes(b.status) ? 'chat' : 'job'); }, [b?.status]);
  // Design: "Check your client's ID when you arrive" — once, right after arrival is confirmed.
  useEffect(() => { if (b?.status === 'arrived' && !idShown.current) { idShown.current = true; setIdCheck(true); } }, [b?.status]);

  const act = async (label: string, fn: () => Promise<any>, ok?: string) => {
    setBusy(label);
    try { await fn(); if (ok) showToast(ok); await load(); }
    catch (e: any) { showToast(e.message); } finally { setBusy(''); }
  };

  if (!b) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Backdrop /><ActivityIndicator color={colors.teal} /></View>;
  const first = b.client_name.split(' ')[0];
  const amount = Number(b.final_price ?? b.initial_offer ?? b.starting_total);
  const send = (tx: string) => {
    const t = tx.trim(); if (!t) return; setDraft('');
    act('send', async () => { const r = await sendChat(b.id, t); if (r) { setDraft(t); setBlock(r); } });
  };
  const photo = () => act('photo', async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Allow camera access in Settings to send photos.');
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (r.canceled) return;
    const path = `${b.id}/${Date.now()}.jpg`;
    const buf = await (await fetch(r.assets[0].uri)).arrayBuffer();
    const up = await supabase.storage.from('chat').upload(path, buf, { contentType: 'image/jpeg' });
    if (up.error) throw new Error(up.error.message);
    await rpc('send_photo', { p_booking: b.id, p_path: path });
  });

  const cancel = async (r: string) => {
    try {
      const pv = await rpc<{ result: string }>('cancel_preview', { p_booking: b.id, p_reason: r });
      const msg = pv.result === 'strike' ? 'This counts as a strike and a 100-coin penalty. 3 strikes in 30 days pauses your account for 7 days.' : 'No strike for this reason.';
      Alert.alert('Cancel this job?', msg, [{ text: 'Keep job', style: 'cancel' },
        { text: 'Cancel job', style: 'destructive', onPress: () => { setCancelOpen(false); act('cancel', () => rpc('cancel_booking', { p_booking: b.id, p_reason: r }), 'Job cancelled'); } }]);
    } catch (e: any) { showToast(e.message); }
  };

  const here = async () => {
    let lat = b.address?.lat ?? null; let lng = b.address?.lng ?? null;
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.granted) { const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }); lat = p.coords.latitude; lng = p.coords.longitude; }
    } catch { /* use the booking address */ }
    return { lat, lng };
  };
  // Design: "Send my location to emergency contact" — opens a text to them with a map link and the job details.
  const textContact = async () => {
    if (!ec.phone) { Alert.alert('No emergency contact', 'Add one in Me › Emergency contact.', [{ text: 'OK' }, { text: 'Open Me', onPress: () => router.push('/work/me') }]); return; }
    const { lat, lng } = await here();
    const map = lat != null ? `https://maps.google.com/?q=${lat},${lng}` : addrLine(b.address);
    const body = `TSKR SOS: I may need help. I'm at a job (${b.code}) for ${b.client_name}, ${addrLine(b.address)}. My location: ${map}`;
    Linking.openURL(`sms:${ec.phone}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(body)}`);
  };
  const sos = () => Alert.alert('Emergency?', `We’ll alert the TSKR safety team right away with this booking and your location. If you’re in danger, call 911 now.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Call 911', onPress: () => Linking.openURL('tel:911') },
    { text: ec.name ? `Send my location to ${ec.name}` : 'Send my location to emergency contact', onPress: textContact },
    { text: 'Alert TSKR', style: 'destructive', onPress: () => act('sos', async () => {
      const { lat, lng } = await here();
      const no = await rpc<string>('trigger_sos', { p_booking: b.id, p_lat: lat, p_lng: lng });
      showToast(`SOS sent · ${no}. Our safety team is contacting you now.`);
    }) },
  ]);
  const report = () => act('report', async () => {
    if (!repReasons.length) throw new Error('Choose at least one reason.');
    const no = await rpc<string>('report_user', { p_reported: b.client_id, p_booking: b.id, p_reasons: repReasons, p_body: repText.trim() || null, p_block: repBlock });
    setRepOpen(false); setRepReasons([]); setRepText('');
    showToast(repBlock ? `Report ${no} sent. ${first} can’t book you again.` : `Report ${no} sent. Our team will look into it.`);
  });
  const eta = b.eta_at ? Math.max(0, Math.round((new Date(b.eta_at).getTime() - Date.now()) / 60000)) : null;
  const fee = b.cancel_fee;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Backdrop />
      <View style={[st.head, { paddingTop: insets.top + 10 }]}>
        <RoundButton d={P.back} label="Back" size={40} onPress={() => (router.canGoBack() ? router.back() : router.replace('/work/home'))} />
        <MiniAvatar initials={b.client_initials} color={colors.teal} size={40} r={13} />
        <View style={{ flex: 1 }}>
          <T w="extrabold" numberOfLines={1} style={{ fontSize: 16 }}>{b.client_name}</T>
          <T w="semibold" style={{ fontSize: 12, color: colors.muted }}>{b.code} · {STATUS_LABEL[b.status]}{b.client_rating ? ` · ★ ${b.client_rating}` : ''}</T>
        </View>
        {!CHAT.includes(b.status) && (
          <View style={st.seg}>
            {(['job', 'chat'] as const).map((v) => (
              <PressScale key={v} onPress={() => setView(v)} style={[st.segBtn, view === v && { backgroundColor: colors.teal }]}>
                <T w="bold" style={{ fontSize: 12, color: view === v ? '#FFF' : colors.teal }}>{v === 'job' ? 'Job' : 'Chat'}</T>
              </PressScale>
            ))}
          </View>
        )}
      </View>

      {view === 'chat' ? (
        <>
          <ScrollView ref={chatRef} onContentSizeChange={() => chatRef.current?.scrollToEnd({ animated: true })} keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 16 }}>
            <View style={[glassCard, { padding: 14, gap: 4 }]}>
              <T w="extrabold" style={{ fontSize: 15 }}>{b.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</T>
              <T style={{ fontSize: 13, color: colors.muted }}>{b.when_type === 'now' ? 'Now (ASAP)' : new Date(b.scheduled_at!).toLocaleString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {b.address?.barangay}, {b.address?.city}</T>
              {b.is_delivery && b.dropoff_address && <T style={{ fontSize: 13, color: colors.body }}>TO: {b.dropoff_address.city}</T>}
              <T style={{ fontSize: 13, color: colors.body }}>Starting price {peso(Number(b.starting_total))} · fee {b.fee_coins_due} coins when you start{b.is_repeat_client ? ' (repeat client)' : ''}</T>
            </View>
            {msgs.map((m) => {
              const mine = m.sender_id === me;
              if (m.kind === 'system') return <T key={m.id} w="semibold" style={st.system}>{m.body}</T>;
              if (m.kind === 'offer') return <T key={m.id} w="bold" style={[st.system, { color: colors.teal }]}>You sent an offer: {peso(Number(m.amount))}</T>;
              if (m.kind === 'final_price') return <T key={m.id} w="bold" style={[st.system, { color: colors.teal }]}>Final price sent: {peso(Number(m.amount))}</T>;
              if (m.kind === 'photo' && m.photo_path) return <ChatPhoto key={m.id} path={m.photo_path} mine={mine} />;
              return <View key={m.id} style={[st.bubble, mine ? st.mine : st.theirs]}><T style={{ fontSize: 14, lineHeight: 20, color: mine ? '#FFF' : colors.teal }}>{m.body}</T></View>;
            })}
          </ScrollView>

          {b.status === 'requested' && (
            <View style={st.panel}>
              <T w="extrabold" style={{ fontSize: 15 }}>New request from {first}</T>
              <T style={{ fontSize: 13, color: colors.muted }}>Reply to start chatting. Ask questions or photos, then send your offer.</T>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <PressScale outer={{ flex: 1 }} style={st.ghost} onPress={() => act('decline', () => rpc('tasker_decline', { p_booking: b.id, p_reason: 'not_available' }), 'Request declined')}>
                  <T w="bold" style={{ fontSize: 14 }}>Decline</T>
                </PressScale>
                <PressScale outer={{ flex: 1.6 }} style={st.solid} onPress={() => act('reply', async () => {
                  await rpc('tasker_reply', { p_booking: b.id });
                  await rpc('send_message', { p_booking: b.id, p_body: `Hi ${first}! Thanks for booking. Can you tell me a bit more, or send a photo of the work?` });
                })}>
                  <TealGloss /><T w="extrabold" style={{ fontSize: 14, color: '#FFF' }}>{busy === 'reply' ? 'Replying…' : 'Reply'}</T>
                </PressScale>
              </View>
            </View>
          )}
          {(b.status === 'chatting' || b.status === 'offer_sent') && (
            <View style={st.panel}>
              <T w="extrabold" style={{ fontSize: 11, letterSpacing: 0.8 }}>{b.status === 'offer_sent' ? `OFFER SENT · ${peso(Number(b.initial_offer))} · WAITING FOR ${first.toUpperCase()}` : 'YOUR INITIAL OFFER'}</T>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <View style={st.amountBox}><T w="extrabold" style={{ fontSize: 18 }}>₱</T>
                  <TextInput value={offer} onChangeText={(v) => setOffer(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" accessibilityLabel="Offer amount" style={st.amountInput} />
                </View>
                <PressScale outer={{ flex: 1 }} style={st.solid} onPress={() => act('offer', () => rpc('send_offer', { p_booking: b.id, p_amount: Number(offer) }), `Offer sent to ${first}`)}>
                  <TealGloss /><T w="extrabold" style={{ fontSize: 14, color: '#FFF' }}>{b.status === 'offer_sent' ? 'Send new offer' : 'Send offer'}</T>
                </PressScale>
              </View>
              <T style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>Include labor and travel. You confirm the final price on site. {b.fee_coins_due} coins are deducted only when you tap Start job.</T>
            </View>
          )}
          <View style={st.note}><Ic d={P.shield} size={15} color={colors.warnText} w={2} /><T style={{ fontSize: 11, color: colors.warnText, flex: 1, lineHeight: 16 }}>Giving anyone’s contact number is strictly prohibited, even spelled out. Use the in-app call button instead.</T></View>
          {!['completed', 'cancelled', 'declined_by_tasker'].includes(b.status) && (
            <View style={[st.inputRow, { paddingBottom: 10 + Math.max(0, insets.bottom) }]}>
              <PressScale accessibilityLabel="Take a photo" onPress={photo} style={st.iconBtn}><Ic d="M4 8h3l2-3h6l2 3h3v11H4zM9 13a3 3 0 1 0 6 0 3 3 0 0 0-6 0" size={22} w={1.8} /></PressScale>
              <TextInput value={draft} onChangeText={setDraft} placeholder="Type a message…" placeholderTextColor="#98A2B3" onSubmitEditing={() => send(draft)} returnKeyType="send" style={st.input} accessibilityLabel="Message" />
              <PressScale accessibilityLabel="Send" onPress={() => send(draft)} style={[st.iconBtn, { overflow: 'hidden' }]}><TealGloss /><Ic d={P.arrow} size={20} color="#FFF" w={2.4} /></PressScale>
            </View>
          )}
        </>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 + insets.bottom }}>
          {['offer_accepted', 'on_the_way', 'arrived', 'final_price_sent', 'ready', 'in_progress'].includes(b.status) && b.address?.lat != null && (
            <LiveMap bookingId={b.id} mode="tasker" initials="" active
              dest={b.is_delivery && b.status === 'in_progress' && b.dropoff_address ? { lat: b.dropoff_address.lat, lng: b.dropoff_address.lng } : { lat: b.address.lat, lng: b.address.lng }}
              destLabel={b.is_delivery && b.status === 'in_progress' ? 'Drop-off' : `${first}’s address`} />
          )}
          <View style={[glassCard, { padding: 16, gap: 6 }]}>
            <T w="semibold" style={{ fontSize: 12, color: colors.muted }}>Status</T>
            <T w="extrabold" style={{ fontSize: 20 }}>{STATUS_LABEL[b.status]}</T>
            <T style={{ fontSize: 14, color: colors.body }}>{b.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</T>
            <T style={{ fontSize: 13, color: colors.muted }}>{b.client_name} · {addrLine(b.address)}{b.address?.landmark ? ` · ${b.address.landmark}` : ''}</T>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
              <PressScale outer={{ flex: 1 }} style={st.pill} onPress={() => setView('chat')}><T w="bold" style={{ fontSize: 13 }}>Chat</T></PressScale>
              <PressScale outer={{ flex: 1 }} style={st.pill} onPress={() => Alert.alert('In-app calls', 'Calls inside TSKR come with the calling service. For now, use Chat.')}><T w="bold" style={{ fontSize: 13 }}>Call</T></PressScale>
              <PressScale outer={{ flex: 1 }} style={st.pill} onPress={() => Linking.openURL(`https://waze.com/ul?ll=${b.address?.lat},${b.address?.lng}&navigate=yes`)}><T w="bold" style={{ fontSize: 13 }}>Navigate</T></PressScale>
            </View>
          </View>

          {LIVE.includes(b.status) && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <PressScale outer={{ flex: 1 }} onPress={sos} style={[st.pill, { borderColor: colors.error, flexDirection: 'row', gap: 6 }]}>
                <Ic d={P.shield} size={16} color={colors.error} w={2.2} /><T w="extrabold" style={{ fontSize: 13, color: colors.error }}>SOS</T>
              </PressScale>
              <PressScale outer={{ flex: 2 }} onPress={() => setRepOpen(true)} style={st.pill}><T w="bold" style={{ fontSize: 13 }}>Report or block {first}</T></PressScale>
            </View>
          )}

          {b.status === 'on_the_way' && (
            <View style={[glassCard, { padding: 16, gap: 10 }]}>
              <T w="extrabold" style={{ fontSize: 17 }}>Running late?</T>
              <T style={{ fontSize: 13, color: colors.body }}>{eta != null ? `${first} sees you arriving in about ${eta} min.` : `Tell ${first} when you’ll arrive.`} Update it if that changes.</T>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {[5, 10, 15, 30].map((m) => <Chip key={m} label={`${m} min`} onPress={() => act('eta', () => rpc('update_eta', { p_booking: b.id, p_eta_minutes: m }), `${first} now sees ${m} min`)} />)}
              </View>
            </View>
          )}

          {b.status === 'on_the_way' && (
            <View style={[glassCard, { padding: 16, gap: 10 }]}>
              <T w="extrabold" style={{ fontSize: 17 }}>Enter the client’s arrival code</T>
              <T style={{ fontSize: 13, color: colors.body, lineHeight: 19 }}>Ask {first} for the 4-digit code in their TSKR app. This confirms you’re the right tasker. You may also ask to see their ID: it should say {b.client_name}.</T>
              <TextInput value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" maxLength={4} placeholder="• • • •" placeholderTextColor="#98A2B3"
                accessibilityLabel="Arrival code" style={[st.input, { height: 60, fontSize: 28, letterSpacing: 12, textAlign: 'center', flex: 0 }]} />
              <GlossyButton label="Confirm arrival" loading={busy === 'code'} onPress={() => act('code', () => rpc('confirm_arrival', { p_booking: b.id, p_code: code }), 'Arrival confirmed')} />
            </View>
          )}

          {b.status === 'arrived' && b.is_delivery && !b.items_checked && (
            <View style={[glassCard, { padding: 16, gap: 10 }]}>
              <T w="extrabold" style={{ fontSize: 17 }}>Check the items before you start</T>
              <T style={{ fontSize: 13, color: colors.body, lineHeight: 19 }}>Open the package and look inside. Decline if anything is unsafe or prohibited: no strike and no coins deducted.</T>
              <GlossyButton label="Items are OK" loading={busy === 'items'} onPress={() => act('items', () => rpc('confirm_items_ok', { p_booking: b.id }))} />
              <PressScale style={st.ghost} onPress={() => act('declineItems', () => rpc('tasker_decline', { p_booking: b.id, p_reason: 'prohibited_item', p_prohibited: true }), 'Declined. Our team will review.')}>
                <T w="bold" style={{ fontSize: 14, color: colors.error }}>Decline: unsafe or prohibited item</T>
              </PressScale>
            </View>
          )}

          {(b.status === 'arrived' && (!b.is_delivery || b.items_checked)) && (
            <View style={[glassCard, { padding: 16, gap: 10 }]}>
              <T w="extrabold" style={{ fontSize: 17 }}>Confirm the final price</T>
              <T style={{ fontSize: 13, color: colors.body, lineHeight: 19 }}>Check the actual work. If it’s harder than expected, set a new price and say why. Initial offer: {peso(Number(b.initial_offer))}.</T>
              <View style={st.amountBox}><T w="extrabold" style={{ fontSize: 18 }}>₱</T>
                <TextInput value={finalAmt} onChangeText={(v) => setFinalAmt(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" accessibilityLabel="Final price" style={st.amountInput} />
              </View>
              {Number(finalAmt) !== Number(b.initial_offer) && (
                <TextInput value={reason} onChangeText={setReason} placeholder="Reason for the change, e.g. Unit is high up" placeholderTextColor="#98A2B3" accessibilityLabel="Reason" style={[st.input, { flex: 0 }]} />
              )}
              <GlossyButton label="Send final price" loading={busy === 'final'} onPress={() => act('final', () => rpc('send_final_price', { p_booking: b.id, p_amount: Number(finalAmt), p_reason: reason || null }), `Sent. Waiting for ${first}.`)} />
            </View>
          )}

          {b.status === 'final_price_sent' && (
            <View style={[glassCard, { padding: 16, gap: 4 }]}>
              <T w="extrabold" style={{ fontSize: 11, letterSpacing: 0.8 }}>FINAL PRICE SENT</T>
              <T w="extrabold" style={{ fontSize: 24 }}>{peso(Number(b.final_price))}</T>
              <T style={{ fontSize: 13, color: colors.muted }}>Waiting for {first} to accept. If they decline, the booking is cancelled and no coins are deducted.</T>
            </View>
          )}

          {b.status === 'ready' && (
            <View style={[glassCard, { padding: 16, gap: 10 }]}>
              <T style={{ fontSize: 14, color: colors.body }}>Final price agreed: <T w="extrabold" style={{ fontSize: 14 }}>{peso(amount)}</T>. Tap Start job when you begin. {b.fee_coins_due} coins will be deducted then.</T>
              <GlossyButton label={b.fee_coins_due === 0 ? 'Start job · free (weekly reward)' : `Start job · ${b.fee_coins_due} coins`} loading={busy === 'start'} onPress={() => act('start', () => rpc('start_job', { p_booking: b.id }), b.fee_coins_due === 0 ? 'Job started · free booking!' : `Job started · ${b.fee_coins_due} coins deducted`)} />
            </View>
          )}

          {b.status === 'in_progress' && (
            <View style={[glassCard, { padding: 16, gap: 10 }]}>
              {b.is_delivery && (
                <>
                  <T w="extrabold" style={{ fontSize: 17 }}>Proof of delivery</T>
                  <T style={{ fontSize: 13, color: colors.body }}>At the drop-off, take a photo of the items with the recipient or at the door.</T>
                  <PressScale style={st.ghost} onPress={() => act('proof', async () => {
                    const perm = await ImagePicker.requestCameraPermissionsAsync();
                    if (!perm.granted) throw new Error('Allow camera access in Settings.');
                    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
                    if (r.canceled) return;
                    const path = `${b.id}/proof-${Date.now()}.jpg`;
                    const buf = await (await fetch(r.assets[0].uri)).arrayBuffer();
                    const up = await supabase.storage.from('chat').upload(path, buf, { contentType: 'image/jpeg' });
                    if (up.error) throw new Error(up.error.message);
                    await rpc('set_proof_of_delivery', { p_booking: b.id, p_path: path });
                  }, 'Proof photo saved')}>
                    <T w="bold" style={{ fontSize: 14 }}>{b.proof_of_delivery_path ? '✓ Photo taken · retake' : 'Take proof photo'}</T>
                  </PressScale>
                </>
              )}
              <T w="extrabold" style={{ fontSize: 17 }}>How did {first} pay you?</T>
              <T style={{ fontSize: 13, color: colors.body }}>Confirm once you’ve received {peso(amount)}. If they paid to your QR, check your e-wallet or bank app first.</T>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Chip label="Cash" on={pay === 'cash'} onPress={() => setPay('cash')} />
                <Chip label="To my QR" on={pay === 'qr'} onPress={() => setPay('qr')} />
              </View>
              <GlossyButton label="Complete job" disabled={!pay} loading={busy === 'done'} onPress={() => act('done', () => rpc('complete_job', { p_booking: b.id, p_payment_method: pay }), 'Job completed. Nice work!')} />
            </View>
          )}

          {b.status === 'completed' && !rated && (
            <View style={[glassCard, { padding: 16, gap: 10 }]}>
              <T w="extrabold" style={{ fontSize: 17 }}>Rate {first}</T>
              <T style={{ fontSize: 13, color: colors.muted }}>Your rating helps other taskers know who they’re working with.</T>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {[1, 2, 3, 4, 5].map((n) => <PressScale key={n} accessibilityLabel={`${n} stars`} onPress={() => setRating(n)}><Ic d={P.star} size={34} fill={n <= rating ? '#F59E0B' : '#E4E7EC'} /></PressScale>)}
              </View>
              <GlossyButton label="Submit rating" disabled={!rating} loading={busy === 'rate'} onPress={() => act('rate', async () => { await rpc('submit_review', { p_booking: b.id, p_rating: rating }); setRated(true); }, 'Thanks for rating')} />
            </View>
          )}

          {fee && (
            <View style={[glassCard, { padding: 16, gap: 10 }]}>
              <T w="extrabold" style={{ fontSize: 17 }}>Cancellation fee · {peso(Number(fee.amount))}</T>
              {fee.status === 'unpaid' && <T style={{ fontSize: 13, color: colors.body, lineHeight: 19 }}>{first} cancelled while you were on the way. They’ll pay {peso(Number(fee.amount))} to your QR and send you the reference number.</T>}
              {fee.status === 'submitted' && (
                <>
                  <T style={{ fontSize: 13, color: colors.body, lineHeight: 19 }}>{first} says they paid. Reference: <T w="extrabold" style={{ fontSize: 13 }}>{fee.reference}</T>. Check your e-wallet or bank app, then confirm.</T>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <PressScale outer={{ flex: 1 }} style={st.ghost} onPress={() => Alert.alert('Not received?', `${first} will be asked to check the reference, and our team will look into it.`, [{ text: 'Back', style: 'cancel' },
                      { text: 'Not received', style: 'destructive', onPress: () => act('fee', () => rpc('answer_fee', { p_fee: fee.id, p_received: false }), 'Our team will look into it') }])}>
                      <T w="bold" style={{ fontSize: 14, color: colors.error }}>Not received</T>
                    </PressScale>
                    <PressScale outer={{ flex: 1.4 }} style={st.solid} onPress={() => act('fee', () => rpc('answer_fee', { p_fee: fee.id, p_received: true }), 'Thanks! Fee confirmed.')}>
                      <TealGloss /><T w="extrabold" style={{ fontSize: 14, color: '#FFF' }}>I received it</T>
                    </PressScale>
                  </View>
                </>
              )}
              {fee.status === 'received' && <T style={{ fontSize: 13, color: colors.body }}>You confirmed you received it.</T>}
              {fee.status === 'not_received' && <T style={{ fontSize: 13, color: colors.body }}>You said you didn’t receive it. Our team is looking into it.</T>}
              {fee.status === 'settled' && <T style={{ fontSize: 13, color: colors.body }}>Our team closed this fee after reviewing it.</T>}
            </View>
          )}

          <View style={[glassCard, st.collect]}>
            <T w="semibold" style={{ fontSize: 14 }}>Collect from client · cash or your QR</T>
            <T w="extrabold" style={{ fontSize: 16 }}>{peso(amount)}</T>
          </View>

          {['offer_accepted', 'on_the_way', 'arrived', 'final_price_sent', 'ready'].includes(b.status) && (
            <PressScale onPress={() => setCancelOpen(true)} style={{ alignSelf: 'center', padding: 12 }}>
              <T w="bold" style={{ fontSize: 14, color: colors.error }}>Cancel job</T>
            </PressScale>
          )}
          {['completed', 'cancelled'].includes(b.status) && (
            <PressScale onPress={() => setRepOpen(true)} style={{ alignSelf: 'center', padding: 10 }}>
              <T w="bold" style={{ fontSize: 14, color: colors.muted }}>Report or block {first}</T>
            </PressScale>
          )}
          {['completed', 'cancelled', 'declined_by_tasker'].includes(b.status) && <GlossyButton label="Back to Home" onPress={() => router.replace('/work/home')} />}
        </ScrollView>
      )}
      {/* TEST BUILD: the demo client answers (design: "Client accepts (demo)") */}
      {b.client_id === DEMO_CLIENT_ID && (b.status === 'offer_sent' || b.status === 'final_price_sent') && (
        <View style={[st.demo, { paddingBottom: 10 + Math.max(0, insets.bottom) }]}>
          <T w="extrabold" style={{ fontSize: 10, letterSpacing: 0.6, color: colors.warnText }}>TEST BUILD · DEMO CLIENT</T>
          <PressScale onPress={() => act('demo', async () => { const m = await rpc<string>('demo_client_act', { p_booking: b.id }); showToast(m); })} style={st.demoBtn}>
            <T w="bold" style={{ fontSize: 14, color: colors.warnText }}>{busy === 'demo' ? 'Working…' : b.status === 'offer_sent' ? '▶ Client accepts your offer' : '▶ Client accepts the final price'}</T>
          </PressScale>
        </View>
      )}
      <Sheet open={cancelOpen} onClose={() => setCancelOpen(false)} title="Why are you cancelling?">
        <T style={{ fontSize: 13, color: colors.muted, lineHeight: 19 }}>Cancelling after the client accepted your offer may count as a strike, depending on the reason.</T>
        {CANCEL_REASONS.map(([k, l]) => (
          <PressScale key={k} onPress={() => cancel(k)} style={[glassCard, { padding: 14, backgroundColor: '#FFF', borderColor: colors.borderSoft }]}><T w="bold" style={{ fontSize: 15 }}>{l}</T></PressScale>
        ))}
      </Sheet>
      <Sheet open={repOpen} onClose={() => setRepOpen(false)} title={`Report ${first}`}>
        <T style={{ fontSize: 13, color: colors.muted, lineHeight: 19 }}>Our safety team reviews every report. {first} won’t see who reported them.</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {REPORT_REASONS.map((r) => <Chip key={r} label={r} on={repReasons.includes(r)} onPress={() => setRepReasons((c) => (c.includes(r) ? c.filter((x) => x !== r) : [...c, r]))} />)}
        </View>
        <TextInput value={repText} onChangeText={setRepText} placeholder="What happened? (optional)" placeholderTextColor="#98A2B3" multiline
          accessibilityLabel="Details" style={[st.input, { flex: 0, height: 96, paddingTop: 12, textAlignVertical: 'top' }]} />
        <PressScale onPress={() => setRepBlock(!repBlock)} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }} accessibilityRole="checkbox" accessibilityState={{ checked: repBlock }}>
          <View style={[st.check, repBlock && { backgroundColor: colors.teal, borderColor: colors.teal }]}>{repBlock && <Ic d={P.check} size={14} color="#FFF" w={3} />}</View>
          <T w="semibold" style={{ fontSize: 14, flex: 1 }}>Also block {first} so they can’t book me again</T>
        </PressScale>
        <GlossyButton label="Send report" loading={busy === 'report'} onPress={report} />
      </Sheet>
      <Toast text={toast} top={insets.top + 10} />
      <ContactWarnSheet block={block} onClose={() => setBlock(null)} />
      <Sheet open={idCheck} onClose={() => setIdCheck(false)} title="Check your client’s ID when you arrive">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: colors.tint }}>
          <MiniAvatar initials={b.client_initials} color={colors.teal} size={48} r={15} />
          <View style={{ flex: 1 }}>
            <T w="semibold" style={{ fontSize: 12, color: colors.muted }}>Your client</T>
            <T w="extrabold" style={{ fontSize: 18 }}>{b.client_name}</T>
            <T style={{ fontSize: 12, color: colors.muted }}>{b.code} · {addrLine(b.address)}</T>
          </View>
        </View>
        <T style={{ fontSize: 14, color: colors.body, lineHeight: 21 }}>You may ask to see {first}’s ID. The name should say <T w="bold">{b.client_name}</T>.</T>
        <View style={{ borderRadius: 14, padding: 12, backgroundColor: colors.warnBg }}>
          <T w="semibold" style={{ fontSize: 13, color: colors.warnText, lineHeight: 19 }}>Name doesn’t match or something feels off? Don’t proceed. Use SOS or report it right away.</T>
        </View>
        <GlossyButton label="Name matches · continue" onPress={() => setIdCheck(false)} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <PressScale outer={{ flex: 1 }} style={st.pill} onPress={() => { setIdCheck(false); setRepOpen(true); }}><T w="bold" style={{ fontSize: 13 }}>Report</T></PressScale>
          <PressScale outer={{ flex: 1 }} style={[st.pill, { backgroundColor: '#FDECEC' }]} onPress={() => { setIdCheck(false); sos(); }}><T w="bold" style={{ fontSize: 13, color: colors.error }}>SOS</T></PressScale>
        </View>
      </Sheet>
    </KeyboardAvoidingView>
  );
}

function ChatPhoto({ path, mine }: { path: string; mine: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { supabase.storage.from('chat').createSignedUrl(path, 3600).then(({ data }) => setUrl(data?.signedUrl ?? null)); }, [path]);
  return (
    <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', padding: 4, borderRadius: 18, backgroundColor: '#FFF' }}>
      {url ? <Image source={{ uri: url }} style={{ width: 220, height: 220, borderRadius: 14 }} /> : <View style={{ width: 220, height: 220, borderRadius: 14, backgroundColor: colors.tint }} />}
    </View>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 12, backgroundColor: 'rgba(255,255,255,0.75)', borderBottomWidth: 1, borderBottomColor: 'rgba(4,77,94,0.08)' },
  seg: { flexDirection: 'row', backgroundColor: colors.tint, borderRadius: 999, padding: 3 },
  segBtn: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999 },
  system: { alignSelf: 'center', fontSize: 12, color: colors.muted, textAlign: 'center', paddingHorizontal: 20 },
  bubble: { maxWidth: '80%', paddingVertical: 10, paddingHorizontal: 14 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.teal, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: 18, borderBottomRightRadius: 6 },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#FFF', borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomRightRadius: 18, borderBottomLeftRadius: 6 },
  panel: { marginHorizontal: 12, marginBottom: 8, padding: 14, gap: 8, borderRadius: 20, backgroundColor: '#FFF', borderWidth: 1.5, borderColor: colors.teal },
  ghost: { height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: colors.teal, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  solid: { height: 48, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  amountBox: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 12, backgroundColor: '#FFF', minWidth: 130 },
  amountInput: { flex: 1, fontFamily: font.extrabold, fontSize: 18, color: colors.teal, minWidth: 80 },
  note: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: colors.warnBg, borderRadius: 12, padding: 10, marginHorizontal: 12, marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 8, backgroundColor: 'rgba(255,255,255,0.85)' },
  iconBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tint },
  input: { flex: 1, height: 44, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 14, fontFamily: font.medium, fontSize: 15, color: colors.teal, backgroundColor: '#FFF' },
  pill: { height: 40, borderRadius: 999, borderWidth: 1.5, borderColor: colors.teal, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  demo: { paddingTop: 8, paddingHorizontal: 16, gap: 6, backgroundColor: colors.warnBg, borderTopWidth: 1, borderTopColor: '#F5D9B5' },
  demoBtn: { height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: '#E0A96D', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  check: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  collect: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
});
