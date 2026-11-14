import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Linking, Platform, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { bubble, colors, font } from '../../../src/theme';
import { T } from '../../../src/components/ui';
import { Backdrop, FillSvg, GlossyButton, PressScale, Rise } from '../../../src/components/glass';
import { Ic, MiniAvatar, P, RoundButton, TealGloss, Toast } from '../../../src/components/clientUi';
import { firstName, peso, useClient } from '../../../src/lib/client';
import { portraitPhoto } from '../../../src/lib/demoPhotos';
import { LiveMap } from '../../../src/components/LiveMap';
import { QrSheet, TaskerQr } from '../../../src/components/QrSheet';
import { addrLine } from '../../../src/lib/places';
import { rpc, supabase } from '../../../src/lib/supabase';

type Status = 'requested' | 'chatting' | 'offer_sent' | 'offer_accepted' | 'on_the_way' | 'arrived' | 'final_price_sent'
  | 'ready' | 'in_progress' | 'completed' | 'cancelled' | 'declined_by_tasker';
type Booking = {
  id: string; code: string; status: Status; client_id: string; tasker_id: string; is_delivery: boolean;
  starting_total: number; initial_offer: number | null; final_price: number | null; final_price_reason: string | null;
  arrival_code: string | null; eta_at: string | null; offer_accepted_at: string | null; cancel_reason: string | null; cancel_result: string | null;
  tasker_name: string; tasker_initials: string; tasker_photo: string | null; address: any; dropoff_address: any;
  items: { id: string; name: string; qty: number; unit_price: number }[];
};
type Msg = { id: string; sender_id: string | null; kind: string; body: string | null; amount: number | null; photo_path?: string | null; created_at: string };

const CHAT: Status[] = ['requested', 'chatting', 'offer_sent'];
const DEMO_STEP: Partial<Record<Status, string>> = {
  requested: 'Tasker replies', chatting: 'Tasker sends an offer', on_the_way: 'Tasker arrives and enters your code',
  arrived: 'Tasker sends the final price', ready: 'Tasker starts the job', in_progress: 'Tasker finishes the job',
};

export default function BookingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { toast, showToast, setFav } = useClient();
  const [b, setB] = useState<Booking | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [view, setView] = useState<'chat' | 'track'>('chat');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const chatRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    try {
      const [bk, m] = await Promise.all([
        rpc<Booking>('get_booking', { p_booking: id }),
        supabase.from('messages').select('id,sender_id,kind,body,amount,photo_path,created_at').eq('booking_id', id).order('created_at'),
      ]);
      setB(bk);
      setMsgs((m.data ?? []) as Msg[]);
    } catch (e: any) { setErr(e.message); }
  }, [id]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
    load();
    // live updates: booking status + new messages (Supabase Realtime)
    const ch = supabase.channel(`booking-${id}-${Date.now()}-${Math.random()}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings', filter: `id=eq.${id}` }, () => load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `booking_id=eq.${id}` },
        (p) => setMsgs((cur) => (cur.some((x) => x.id === (p.new as Msg).id) ? cur : [...cur, p.new as Msg])))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  // chat while negotiating, tracking after the offer is accepted
  useEffect(() => { if (b) setView(CHAT.includes(b.status) ? 'chat' : 'track'); }, [b?.status]);

  const act = async (label: string, fn: () => Promise<any>, ok?: string) => {
    setBusy(label);
    try {
      const r = await fn();
      if (ok !== undefined) { if (ok) showToast(ok); } else if (typeof r === 'string') showToast(r);
      await load();
    }
    catch (e: any) { showToast(e.message); }
    finally { setBusy(''); }
  };

  if (err) return <View style={st.center}><T w="bold" style={{ textAlign: 'center' }}>{err}</T><PressScale onPress={() => router.back()} style={{ padding: 12 }}><T w="bold">Go back</T></PressScale></View>;
  if (!b) return <View style={st.center}><ActivityIndicator color={colors.teal} /></View>;

  const first = firstName(b.tasker_name);
  const revealed = !!b.offer_accepted_at;
  const photo = revealed ? portraitPhoto(b.tasker_photo) : undefined;
  const offerAmt = b.initial_offer ?? b.starting_total;
  const agreed = b.final_price ?? offerAmt;
  const demoLabel = (b as any).tasker_is_demo ? DEMO_STEP[b.status] : undefined;
  const sub = {
    requested: 'Waiting for a reply', chatting: 'Chatting', offer_sent: 'Sent you an offer', offer_accepted: 'Offer accepted',
    on_the_way: 'On the way', arrived: 'Arrived', final_price_sent: 'Sent the final price', ready: 'Ready to start',
    in_progress: 'Working on it', completed: 'Completed', cancelled: 'Cancelled', declined_by_tasker: 'Declined',
  }[b.status];

  const send = (text: string) => {
    const tx = text.trim();
    if (!tx) return;
    setDraft('');
    act('send', () => rpc('send_message', { p_booking: b.id, p_body: tx }), '');
  };
  const cancel = async () => {
    try {
      const pv = await rpc<{ result: string; amount?: number }>('cancel_preview', { p_booking: b.id, p_reason: 'changed_mind' });
      const msg = pv.result === 'free' ? 'You can cancel for free because you haven’t accepted an offer yet.'
        : pv.result === 'free_this_month' ? `${first} is already on the way. This is your free late cancel for this month.`
        : `${first} is already on the way. A ₱${pv.amount ?? 100} fee goes to ${first}, paid to their QR. You can’t book again until it’s paid.`;
      Alert.alert('Cancel this booking?', msg, [
        { text: 'Keep booking', style: 'cancel' },
        { text: 'Cancel booking', style: 'destructive', onPress: () => act('cancel', () => rpc('cancel_booking', { p_booking: b.id, p_reason: 'changed_mind' }), 'Booking cancelled') },
      ]);
    } catch (e: any) { showToast(e.message); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Backdrop />
      {/* header */}
      <View style={[st.head, { paddingTop: insets.top + 10 }]}>
        <RoundButton d={P.back} label="Back" size={40} onPress={() => (router.canGoBack() ? router.back() : router.replace('/bookings'))} />
        {photo ? <Image source={photo} style={{ width: 40, height: 40, borderRadius: 13 }} /> : <MiniAvatar initials={b.tasker_initials} color={colors.teal} size={40} r={13} />}
        <View style={{ flex: 1 }}>
          <T w="extrabold" numberOfLines={1} style={{ fontSize: 16 }}>{b.tasker_name}</T>
          <T w="semibold" style={{ fontSize: 12, color: colors.muted }}>{b.code} · {sub}</T>
        </View>
        {!CHAT.includes(b.status) && (
          <View style={st.seg}>
            {(['track', 'chat'] as const).map((v) => (
              <PressScale key={v} onPress={() => setView(v)} style={[st.segBtn, view === v && st.segOn]}>
                <T w="bold" style={{ fontSize: 12, color: view === v ? '#FFF' : colors.teal }}>{v === 'track' ? 'Status' : 'Chat'}</T>
              </PressScale>
            ))}
          </View>
        )}
      </View>

      {view === 'chat' ? (
        <>
          <ScrollView ref={chatRef} onContentSizeChange={() => chatRef.current?.scrollToEnd({ animated: true })}
            contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
            <View style={st.tip}><T style={{ fontSize: 12, color: colors.body, textAlign: 'center' }}>Send photos with the camera so your tasker can give an accurate price.</T></View>
            {msgs.map((m) => {
              const mine = m.sender_id === me;
              if (m.kind === 'system') return <T key={m.id} w="semibold" style={st.system}>{m.body}</T>;
              if (m.kind === 'offer') {
                const open = b.status === 'offer_sent' && Number(m.amount) === Number(b.initial_offer);
                return (
                  <View key={m.id} style={st.offer}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <View style={st.offerTag}><T w="extrabold" style={{ fontSize: 10, color: '#FFF', letterSpacing: 0.5 }}>INITIAL OFFER</T></View>
                      {m.body === 'PHOTO-VERIFIED' && <View style={[st.offerTag, { backgroundColor: colors.green }]}><T w="extrabold" style={{ fontSize: 10, letterSpacing: 0.5 }}>PHOTO-VERIFIED</T></View>}
                    </View>
                    <T w="extrabold" style={{ fontSize: 28 }}>{peso(Number(m.amount))}</T>
                    <T w="semibold" style={{ fontSize: 13, color: colors.body }}>{b.items.map((i) => `${i.qty}× ${i.name}`).join(', ')} · labor and travel included</T>
                    <T style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>The final price is confirmed on site before the job starts. It may change if the work is harder than shown.</T>
                    {open && (
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                        <PressScale outer={{ flex: 1 }} style={st.ghostBtn} onPress={() => act('neg', () => rpc('negotiate_offer', { p_booking: b.id }), `Tell ${first} what price works for you`)}>
                          <T w="bold" style={{ fontSize: 14 }}>Negotiate</T>
                        </PressScale>
                        <PressScale outer={{ flex: 1.4 }} style={st.solidBtn} onPress={() => act('accept', () => rpc('accept_offer', { p_booking: b.id, p_eta_minutes: 25 }), `${first} is on the way`)}>
                          <TealGloss /><T w="extrabold" style={{ fontSize: 14, color: '#FFF' }}>{busy === 'accept' ? 'Accepting…' : 'Accept initial offer'}</T>
                        </PressScale>
                      </View>
                    )}
                  </View>
                );
              }
              if (m.kind === 'photo' && m.photo_path) return (
                <View key={m.id} style={[st.photoMsg, mine ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]}>
                  <ChatPhoto path={m.photo_path} />
                  <T w="semibold" style={{ fontSize: 11, color: colors.muted }}>Taken in TSKR · {new Date(m.created_at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</T>
                </View>
              );
              if (m.kind === 'final_price') return <T key={m.id} w="semibold" style={st.system}>Final price sent: {peso(Number(m.amount))}{m.body ? ` · ${m.body}` : ''}</T>;
              return (
                <View key={m.id} style={[st.bubble, mine ? st.mine : st.theirs]}>
                  <T style={{ fontSize: 14, lineHeight: 20, color: mine ? '#FFF' : colors.teal }}>{m.body}</T>
                </View>
              );
            })}
            {b.status === 'requested' && <T w="semibold" style={st.system}>Request sent. {first} usually replies within a few minutes.</T>}
            {b.status === 'declined_by_tasker' && <T w="semibold" style={[st.system, { color: colors.error }]}>{first} can’t take this booking. You weren’t charged. Try another tasker.</T>}
          </ScrollView>

          {CHAT.includes(b.status) && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
              style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 8 }}>
              {quickReplies(b).map((q) => (
                <PressScale key={q} onPress={() => send(q)} style={st.quick}><T w="semibold" style={{ fontSize: 13 }}>{q}</T></PressScale>
              ))}
            </ScrollView>
          )}
          <View style={[st.note, { marginHorizontal: 16 }]}>
            <Ic d={P.shield} size={16} color={colors.warnText} w={2} />
            <T style={{ fontSize: 11, color: colors.warnText, flex: 1, lineHeight: 16 }}>
              Giving anyone’s contact number is strictly prohibited, even spelled out. You’ll get one warning, then a 1-week suspension. Use the in-app call button instead.
            </T>
          </View>
          {!['completed', 'cancelled', 'declined_by_tasker'].includes(b.status) && (
            <View style={[st.inputRow, { paddingBottom: 10 + (demoLabel ? 0 : Math.max(0, insets.bottom)) }]}>
              <PressScale accessibilityLabel="Take a photo with the camera" style={st.iconBtn}
                onPress={() => act('photo', async () => {
                  const perm = await ImagePicker.requestCameraPermissionsAsync();
                  if (!perm.granted) throw new Error('Allow camera access in Settings to send photos.');
                  const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
                  if (r.canceled) return '';
                  const path = `${b.id}/${Date.now()}.jpg`;
                  const buf = await (await fetch(r.assets[0].uri)).arrayBuffer();
                  const up = await supabase.storage.from('chat').upload(path, buf, { contentType: 'image/jpeg' });
                  if (up.error) throw new Error(up.error.message);
                  await rpc('send_photo', { p_booking: b.id, p_path: path });
                  return '';
                }, '')}>
                <Ic size={22} w={1.8}><Path d="M4 8h3l2-3h6l2 3h3v11H4z" /><Circle cx={12} cy={13} r={3} /></Ic>
              </PressScale>
              <TextInput value={draft} onChangeText={setDraft} placeholder="Type a message…" placeholderTextColor="#98A2B3"
                accessibilityLabel="Message" onSubmitEditing={() => send(draft)} returnKeyType="send"
                style={st.input} />
              <PressScale accessibilityLabel="Send message" onPress={() => send(draft)} style={[st.iconBtn, { overflow: 'hidden' }]}>
                <TealGloss /><Ic d={P.arrow} size={20} color="#FFF" w={2.4} />
              </PressScale>
            </View>
          )}
        </>
      ) : (
        <Track b={b} first={first} agreed={agreed} busy={busy} act={act} onCancel={cancel} setFav={setFav} onChat={() => setView('chat')} />
      )}

      {/* TEST BUILD: lets the client move a demo tasker forward until the Tasker app exists */}
      {demoLabel && (
        <View style={[st.demo, { paddingBottom: 10 + Math.max(0, insets.bottom) }]}>
          <T w="extrabold" style={{ fontSize: 10, letterSpacing: 0.6, color: colors.warnText }}>TEST BUILD · DEMO TASKER</T>
          <PressScale onPress={() => act('demo', () => rpc<string>('demo_tasker_act', { p_booking: b.id }))} style={st.demoBtn}>
            <T w="bold" style={{ fontSize: 14, color: colors.warnText }}>{busy === 'demo' ? 'Working…' : `▶ ${demoLabel}`}</T>
          </PressScale>
        </View>
      )}
      <Toast text={toast} top={insets.top + 10} />
    </KeyboardAvoidingView>
  );
}

function ChatPhoto({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { supabase.storage.from('chat').createSignedUrl(path, 3600).then(({ data }) => setUrl(data?.signedUrl ?? null)); }, [path]);
  return url ? <Image source={{ uri: url }} style={{ width: 220, height: 220, borderRadius: 16 }} /> : <View style={{ width: 220, height: 220, borderRadius: 16, backgroundColor: colors.tint }} />;
}

function quickReplies(b: Booking) {
  const names = b.items.map((i) => i.name).join(' ');
  if (b.is_delivery) return ['A small box of clothes, about 3 kg', 'Documents in an envelope', 'Please call the recipient on arrival'];
  if (/aircon/i.test(names)) return ['2 split-type units', 'Just 1 unit, window type', 'Not sure, please check on site'];
  return ['I’ll send a photo of the work', 'It’s a small job', 'Not sure, please check on site'];
}

// ---------------- tracking ----------------
const STEPS = ['Offer accepted', 'On the way', 'Arrived', 'Final price', 'In progress', 'Completed'];
const stepOf = (s: Status) => ({ offer_accepted: 0, on_the_way: 1, arrived: 2, final_price_sent: 3, ready: 3, in_progress: 4, completed: 5 } as Record<string, number>)[s] ?? 0;

function Track({ b, first, agreed, busy, act, onCancel, setFav, onChat }: {
  b: Booking; first: string; agreed: number; busy: string; act: (l: string, fn: () => Promise<any>, ok?: string) => void;
  onCancel: () => void; setFav: (id: string, on: boolean) => void; onChat: () => void;
}) {
  const live = ['offer_accepted', 'on_the_way', 'arrived', 'final_price_sent', 'ready', 'in_progress'].includes(b.status);
  const sos = () => Alert.alert('Emergency?', 'We’ll alert the TSKR safety team right away with this booking and address. If you’re in danger, call 911 now.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Call 911', onPress: () => Linking.openURL('tel:911') },
    { text: 'Alert TSKR', style: 'destructive', onPress: () => act('sos', async () => {
      const no = await rpc<string>('trigger_sos', { p_booking: b.id, p_lat: b.address?.lat ?? null, p_lng: b.address?.lng ?? null });
      return `SOS sent · ${no}. Our safety team is contacting you now.`;
    }) },
  ]);
  const shareTrip = () => Share.share({
    message: `I booked ${b.tasker_name} on TSKR (${b.code}) for ${b.items.map((i) => i.name).join(', ')}. Status: ${b.status.replace(/_/g, ' ')}. Address: ${addrLine(b.address)}.`,
  }).catch(() => {});
  const qr = (b as any).tasker_qr as TaskerQr;
  const fee = (b as any).cancel_fee as { id: string; amount: number; status: string; reference: string | null } | null;
  const [qrOpen, setQrOpen] = useState(false);
  const [feeOpen, setFeeOpen] = useState(false);
  const showQr = () => setQrOpen(true);

  const step = stepOf(b.status);
  const eta = b.eta_at ? Math.max(1, Math.round((new Date(b.eta_at).getTime() - Date.now()) / 60000)) : null;
  const cancelled = b.status === 'cancelled';
  const D = b.is_delivery;
  const status: [string, string] = cancelled ? ['Cancelled', b.cancel_reason === 'final_price_declined' ? 'You declined the final price. Nobody is charged.' : 'This booking was cancelled.']
    : ([
      ['Offer accepted', `You accepted ${first}’s offer of ${peso(agreed)}.`],
      [D ? 'On the way to pick up' : 'On the way', `${first} is on the way.${eta ? ` ETA ${eta} min.` : ''}`],
      [D ? 'At pickup' : 'Arrived', `${first} has arrived. Give them your arrival code to confirm it’s really them.`],
      ['Final price', b.status === 'ready' ? `You accepted ${peso(agreed)}. ${first} will start now.` : `${first} checked the work and sent the final price. Accept it to start the job.`],
      [D ? 'On the way to drop-off' : 'In progress', D ? `${first} picked up your items.` : `${first} started the job.`],
      [D ? 'Delivered' : 'Completed', `All done! Pay ${peso(agreed)} to ${first} and rate them.`],
    ] as [string, string][])[step];

  // review
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [saveFav, setSaveFav] = useState(false);
  const [posted, setPosted] = useState(false);
  const tagList = rating >= 4 ? ['On time', 'Neat work', 'Fair price', 'Friendly', 'Explained the work'] : ['Late', 'Work not finished', 'Price changed a lot', 'Messy', 'Rude'];

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 140 }}>
      {!cancelled && b.address?.lat != null && (
        <LiveMap bookingId={b.id} mode="client" initials={b.tasker_initials} active={step < 5} demoDrive={(b as any).tasker_is_demo && b.status === 'on_the_way'}
          dest={D && step >= 4 && b.dropoff_address ? { lat: b.dropoff_address.lat, lng: b.dropoff_address.lng } : { lat: b.address.lat, lng: b.address.lng }}
          destLabel={D && step >= 4 ? 'Drop-off' : 'Your address'} />
      )}

      {live && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <PressScale outer={{ flex: 1 }} onPress={sos} style={[st.pillBtn, { borderColor: colors.error }]}>
            <Ic d={P.shield} size={16} color={colors.error} w={2.2} /><T w="extrabold" style={{ fontSize: 13, color: colors.error }}>SOS</T>
          </PressScale>
          <PressScale outer={{ flex: 2 }} onPress={shareTrip} style={st.pillBtn}>
            <Ic d={P.share} size={16} w={2.2} /><T w="bold" style={{ fontSize: 13 }}>Share my booking</T>
          </PressScale>
        </View>
      )}
      {b.status === 'completed' && (
        <PressScale onPress={showQr} style={[st.pillBtn, { alignSelf: 'stretch' }]}>
          <T w="bold" style={{ fontSize: 14 }}>Show {first}’s payment QR</T>
        </PressScale>
      )}
      {fee && (
        <View style={[st.card, { gap: 8, borderColor: fee.status === 'received' ? colors.borderSoft : '#F5D9B5', backgroundColor: fee.status === 'received' ? '#FFF' : colors.warnBg }]}>
          <T w="extrabold" style={{ fontSize: 16 }}>Cancellation fee · {peso(Number(fee.amount))}</T>
          {fee.status === 'unpaid' && <T style={{ fontSize: 13, color: colors.body, lineHeight: 19 }}>{first} was already on the way, so a {peso(Number(fee.amount))} fee goes to {first}. Pay it to {first}’s QR, then send the reference number. You can book again once it’s sent.</T>}
          {fee.status === 'submitted' && <T style={{ fontSize: 13, color: colors.body, lineHeight: 19 }}>Reference {fee.reference} sent. Waiting for {first} to confirm they received it.</T>}
          {fee.status === 'not_received' && <T style={{ fontSize: 13, color: colors.error, lineHeight: 19 }}>{first} says they didn’t receive reference {fee.reference}. Check your receipt and send the correct reference. Our team is also looking into it.</T>}
          {fee.status === 'received' && <T style={{ fontSize: 13, color: colors.body }}>Paid. {first} confirmed they received it. Thank you!</T>}
          {(fee.status === 'unpaid' || fee.status === 'not_received') && <GlossyButton label={`Pay ${peso(Number(fee.amount))} to ${first}`} onPress={() => setFeeOpen(true)} />}
        </View>
      )}
      {D && b.dropoff_address && (
        <View style={st.card}>
          <T style={{ fontSize: 13 }}><T w="extrabold" style={{ fontSize: 12 }}>FROM  </T>{addrLine(b.address)}</T>
          <T style={{ fontSize: 13 }}><T w="extrabold" style={{ fontSize: 12 }}>TO  </T>{addrLine(b.dropoff_address)}</T>
        </View>
      )}

      <Rise i={1} style={[st.card, { gap: 6 }]}>
        <T w="semibold" style={{ fontSize: 12, color: colors.muted }}>Status</T>
        <T w="extrabold" style={{ fontSize: 20 }}>{status[0]}</T>
        <T style={{ fontSize: 14, color: colors.body, lineHeight: 21 }}>{status[1]}</T>

        {b.status === 'on_the_way' && b.arrival_code && (
          <View style={st.otp}>
            <T w="extrabold" style={{ fontSize: 11, letterSpacing: 0.6 }}>YOUR ARRIVAL CODE</T>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {b.arrival_code.split('').map((d, i) => <View key={i} style={st.otpBox}><T w="extrabold" style={{ fontSize: 26 }}>{d}</T></View>)}
            </View>
            <T style={{ fontSize: 12, color: colors.body, lineHeight: 18 }}>Only share this code with {first} in person. Don’t send it by chat or text.</T>
            <View style={st.idTip}>
              <Ic d={P.shield} size={18} w={2} />
              <T style={{ fontSize: 12, color: colors.body, flex: 1, lineHeight: 17 }}>First, ask to see their ID. It should say <T w="bold" style={{ fontSize: 12 }}>{b.tasker_name}</T>. Companions need an ID too.</T>
            </View>
          </View>
        )}

        {b.status === 'final_price_sent' && (
          <View style={st.final}>
            <T w="extrabold" style={{ fontSize: 11, letterSpacing: 0.6 }}>FINAL PRICE FROM YOUR TASKER</T>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <T w="extrabold" style={{ fontSize: 28 }}>{peso(Number(b.final_price))}</T>
              {Number(b.final_price) !== Number(b.initial_offer) && <T style={{ fontSize: 14, color: colors.muted, textDecorationLine: 'line-through' }}>{peso(Number(b.initial_offer))}</T>}
            </View>
            <T style={{ fontSize: 13, color: colors.body }}>Reason: {b.final_price_reason || 'Same as the initial offer'}</T>
            <T style={{ fontSize: 12, color: colors.muted }}>If you decline, the booking is cancelled. You won’t be charged.</T>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <PressScale outer={{ flex: 1 }} style={st.ghostBtn} onPress={() => act('decline', () => rpc('respond_final_price', { p_booking: b.id, p_accept: false }), 'Booking cancelled. Nobody is charged.')}>
                <T w="bold" style={{ fontSize: 14 }}>Decline</T>
              </PressScale>
              <PressScale outer={{ flex: 1.5 }} style={st.solidBtn} onPress={() => act('final', () => rpc('respond_final_price', { p_booking: b.id, p_accept: true }), `${first} can start now`)}>
                <TealGloss /><T w="extrabold" style={{ fontSize: 14, color: '#FFF' }}>Accept final price</T>
              </PressScale>
            </View>
          </View>
        )}

        {b.status === 'completed' && (
          <View style={[st.final, { backgroundColor: '#E9F8E6' }]}>
            <T w="extrabold" style={{ fontSize: 11, letterSpacing: 0.6 }}>PAY YOUR TASKER</T>
            <T w="extrabold" style={{ fontSize: 26 }}>{peso(agreed)}</T>
            <T style={{ fontSize: 13, color: colors.body, lineHeight: 19 }}>Cash, or scan {first}’s QR with GCash, Maya or your bank app. TSKR doesn’t hold your money.</T>
          </View>
        )}
      </Rise>

      {b.status === 'completed' && !posted && (
        <Rise i={2} style={[st.card, { gap: 10 }]}>
          <T w="extrabold" style={{ fontSize: 18 }}>How was {first}?</T>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <PressScale key={n} accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`} onPress={() => { setRating(n); setTags([]); }}>
                <Ic d={P.star} size={36} fill={n <= rating ? '#F59E0B' : '#E4E7EC'} />
              </PressScale>
            ))}
          </View>
          {rating > 0 && (
            <>
              <T w="semibold" style={{ fontSize: 13 }}>{rating >= 4 ? 'What went well?' : 'What went wrong?'}</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {tagList.map((tg) => {
                  const on = tags.includes(tg);
                  return (
                    <PressScale key={tg} onPress={() => setTags(on ? tags.filter((x) => x !== tg) : [...tags, tg])} style={[st.tagChip, on && st.tagOn]}>
                      <T w="bold" style={{ fontSize: 13, color: on ? '#FFF' : colors.teal }}>{tg}</T>
                    </PressScale>
                  );
                })}
              </View>
              <TextInput value={text} onChangeText={setText} multiline placeholder="What did you like? What could be better?" placeholderTextColor="#98A2B3"
                accessibilityLabel="Write a testimonial (optional)" style={st.textarea} />
              <PressScale accessibilityRole="checkbox" accessibilityState={{ checked: saveFav }} onPress={() => setSaveFav(!saveFav)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ic d={P.heart} size={20} fill={saveFav ? colors.teal : 'none'} />
                <T w="semibold" style={{ fontSize: 14 }}>Save {first} to favorites</T>
              </PressScale>
              <GlossyButton label="Post testimonial" loading={busy === 'review'} onPress={() => act('review', async () => {
                await rpc('submit_review', { p_booking: b.id, p_rating: rating, p_tags: tags, p_body: text || null, p_save_favorite: saveFav });
                if (saveFav) setFav(b.tasker_id, true);
                setPosted(true);
              }, `Thanks! It now shows on ${first}’s profile.`)} />
            </>
          )}
          <T style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>Testimonials only count for bookings made in TSKR.</T>
        </Rise>
      )}

      {!cancelled && (
        <View style={[st.card, { gap: 0, paddingVertical: 8 }]}>
          {STEPS.map((s, i) => (
            <View key={s} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <View style={{ alignItems: 'center' }}>
                <View style={[st.dot, i <= step && st.dotOn]}>{i < step && <Ic d={P.check} size={10} color="#FFF" w={3.4} />}</View>
                {i < STEPS.length - 1 && <View style={[st.lineV, i < step && { backgroundColor: colors.teal }]} />}
              </View>
              <T w={i === step ? 'extrabold' : 'semibold'} style={{ fontSize: 14, color: i <= step ? colors.teal : colors.muted, paddingTop: 1 }}>{s}</T>
            </View>
          ))}
        </View>
      )}

      <View style={[st.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
        <MiniAvatar initials={b.tasker_initials} color={colors.teal} size={44} r={14} />
        <View style={{ flex: 1 }}>
          <T w="extrabold" style={{ fontSize: 15 }}>{b.tasker_name}</T>
          <T style={{ fontSize: 12, color: colors.muted }}>Your tasker</T>
        </View>
        <RoundButton label="Chat with tasker" size={44} onPress={onChat}><Ic d="M4 5h16v11H8l-4 4z" size={20} w={1.9} /></RoundButton>
        <RoundButton label="Call tasker" size={44} onPress={() => Alert.alert('In-app calls', 'Calls inside TSKR (no phone numbers shared) come with the calling service. For now, use Chat.', [{ text: 'Open chat', onPress: onChat }, { text: 'OK' }])}>
          <Ic d="M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" size={20} w={1.9} />
        </RoundButton>
      </View>

      <View style={[st.card, { gap: 8 }]}>
        <T w="extrabold" style={{ fontSize: 17 }}>Booking summary</T>
        {b.items.map((it) => (
          <View key={it.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
            <T style={{ fontSize: 14, flex: 1 }}>{it.qty}× {it.name}</T>
            <T w="semibold" style={{ fontSize: 14 }}>{peso(it.qty * Number(it.unit_price))}</T>
          </View>
        ))}
        <View style={{ height: 1, backgroundColor: 'rgba(4,77,94,0.1)' }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <T w="bold" style={{ fontSize: 14 }}>Agreed price · pay your tasker directly</T>
          <T w="extrabold" style={{ fontSize: 15 }}>{peso(agreed)}</T>
        </View>
        <T style={{ fontSize: 12, color: colors.muted }}>{addrLine(b.address)}</T>
      </View>

      {['offer_accepted', 'on_the_way', 'arrived', 'final_price_sent', 'ready'].includes(b.status) && (
        <PressScale onPress={onCancel} style={{ alignSelf: 'center', padding: 12 }}>
          <T w="bold" style={{ color: colors.error, fontSize: 14 }}>Cancel booking</T>
        </PressScale>
      )}
      {(b.status === 'completed' || cancelled) && (
        <GlossyButton label="Done" onPress={() => router.replace('/home')} />
      )}
      <QrSheet open={qrOpen} onClose={() => setQrOpen(false)} title={`Pay ${first}`} first={first} amount={peso(agreed)} qr={qr} />
      {fee && <QrSheet open={feeOpen} onClose={() => setFeeOpen(false)} title="Pay the cancellation fee" first={first} amount={peso(Number(fee.amount))} qr={qr}
        note={`After paying, type the reference number from your receipt so ${first} can confirm.`}
        onReference={async (ref) => { await rpc('submit_fee_reference', { p_fee: fee.id, p_reference: ref }); setFeeOpen(false); act('fee', async () => {}, 'Reference sent'); }} />}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  head: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.75)', borderBottomWidth: 1, borderBottomColor: 'rgba(4,77,94,0.08)',
  },
  seg: { flexDirection: 'row', backgroundColor: colors.tint, borderRadius: 999, padding: 3 },
  segBtn: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999 },
  segOn: { backgroundColor: colors.teal },
  tip: { alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, maxWidth: 300 },
  system: { alignSelf: 'center', fontSize: 12, color: colors.muted, textAlign: 'center', paddingHorizontal: 20 },
  bubble: { maxWidth: '80%', paddingVertical: 10, paddingHorizontal: 14 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.teal, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: 18, borderBottomRightRadius: 6 },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#FFF', borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomRightRadius: 18, borderBottomLeftRadius: 6 },
  offer: {
    alignSelf: 'stretch', backgroundColor: '#FFF', ...bubble(22, 6), padding: 16, gap: 6, borderWidth: 1.5, borderColor: colors.teal,
    shadowColor: '#044D5E', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 8 },
  },
  offerTag: { backgroundColor: colors.teal, borderRadius: 6, paddingVertical: 3, paddingHorizontal: 7 },
  ghostBtn: { height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: colors.teal, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  solidBtn: { height: 48, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  quick: { backgroundColor: 'rgba(255,255,255,0.8)', borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
  note: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: colors.warnBg, borderRadius: 12, padding: 10, marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 8, backgroundColor: 'rgba(255,255,255,0.85)' },
  iconBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tint },
  input: { flex: 1, height: 44, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 14, fontFamily: font.medium, fontSize: 15, color: colors.teal, backgroundColor: '#FFF' },
  demo: { paddingTop: 8, paddingHorizontal: 16, gap: 6, backgroundColor: colors.warnBg, borderTopWidth: 1, borderTopColor: '#F5D9B5' },
  demoBtn: { height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: '#E0A96D', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  map: { height: 190, ...bubble(22, 6), overflow: 'hidden' },
  homePin: { position: 'absolute', width: 32, height: 32, borderRadius: 16, backgroundColor: colors.teal, borderWidth: 3, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  taskerPin: { position: 'absolute', width: 34, height: 34, borderRadius: 17, backgroundColor: '#0A6378', borderWidth: 3, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  live: { position: 'absolute', left: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2E7D32' },
  card: { ...bubble(22, 6), padding: 16, gap: 8, backgroundColor: 'rgba(255,255,255,0.65)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)' },
  otp: { marginTop: 8, padding: 14, borderRadius: 18, backgroundColor: colors.tint, gap: 10 },
  otpBox: { width: 54, height: 62, borderRadius: 14, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.teal },
  idTip: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: '#FFF', borderRadius: 12, padding: 10 },
  final: { marginTop: 8, padding: 14, borderRadius: 18, backgroundColor: colors.tint, gap: 6 },
  tagChip: { borderWidth: 1.5, borderColor: colors.teal, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 },
  tagOn: { backgroundColor: colors.teal },
  textarea: { minHeight: 84, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, padding: 12, fontFamily: font.medium, fontSize: 14, color: colors.teal, backgroundColor: '#FFF', textAlignVertical: 'top' },
  pillBtn: { height: 44, borderRadius: 999, borderWidth: 1.5, borderColor: colors.teal, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.8)' },
  photoMsg: { gap: 4, padding: 4, borderRadius: 18, backgroundColor: '#FFF' },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#D0D5DD', backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  dotOn: { backgroundColor: colors.teal, borderColor: colors.teal },
  lineV: { width: 2, height: 18, backgroundColor: '#D0D5DD' },
});
