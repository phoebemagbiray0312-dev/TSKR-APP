import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, Image, ScrollView, Share, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { bubble, colors } from '../../../src/theme';
import { T } from '../../../src/components/ui';
import { PressScale, Rise } from '../../../src/components/glass';
import { CAT_ICON, Chip, Ic, MiniAvatar, P, RoundButton, Sheet, StarIc, TealGloss, Toast } from '../../../src/components/clientUi';
import { ErrorText } from '../../../src/components/ui';
import { GlossyButton } from '../../../src/components/glass';
import { TextInput } from 'react-native';
import { font } from '../../../src/theme';
import { Service, TaskerFull, durText, etaText, firstName, peso, useClient } from '../../../src/lib/client';
import { coverPhoto, workPhotos } from '../../../src/lib/demoPhotos';
import { rpc } from '../../../src/lib/supabase';

const W = Dimensions.get('window').width;

export default function TaskerProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { address, cart, addToCart, cartCount, subtotal, favs, setFav, toggleFav, toast, showToast } = useClient();
  const [t, setT] = useState<TaskerFull | null>(null);
  const [err, setErr] = useState('');
  const [gal, setGal] = useState(0);
  const [svcY, setSvcY] = useState(0);
  const scroll = React.useRef<ScrollView>(null);
  // report / block (design: SHEETS › report)
  const [repOpen, setRepOpen] = useState(false);
  const [reasons, setReasons] = useState<string[]>([]);
  const [repText, setRepText] = useState('');
  const [block, setBlock] = useState(false);
  const [repErr, setRepErr] = useState('');
  const [repBusy, setRepBusy] = useState(false);
  const sendReport = async () => {
    if (!reasons.length) { setRepErr('Pick at least one reason.'); return; }
    setRepBusy(true); setRepErr('');
    try {
      const no = await rpc<string>('report_user', { p_reported: id, p_booking: null, p_reasons: reasons, p_body: repText.trim() || null, p_block: block });
      setRepOpen(false); setReasons([]); setRepText('');
      showToast(block ? `Report ${no} sent. You won’t see this tasker again.` : `Report ${no} sent. Our team will look into it.`);
      if (block) setTimeout(() => router.back(), 1200);
    } catch (e: any) { setRepErr(e.message); } finally { setRepBusy(false); }
  };

  useEffect(() => {
    rpc<TaskerFull>('get_tasker', { p_tasker: id, p_lat: address.lat, p_lng: address.lng })
      .then((r) => { setT(r); setFav(r.id, r.favorite); })
      .catch((e) => setErr(e.message));
  }, [id]);

  const photos = useMemo(() => {
    if (!t) return [];
    const c = coverPhoto(t.photo);
    return [...(c ? [c] : []), ...workPhotos(t.photo)];
  }, [t]);

  if (err) return (
    <View style={[st.center, { paddingTop: insets.top }]}>
      <T w="bold" style={{ fontSize: 16, textAlign: 'center' }}>{err}</T>
      <PressScale onPress={() => router.back()} style={{ padding: 12 }}><T w="bold">Go back</T></PressScale>
    </View>
  );
  if (!t) return <View style={st.center}><ActivityIndicator color={colors.teal} /></View>;

  const first = firstName(t.name);
  const fav = favs[t.id] ?? t.favorite;
  const pro = t.services.length >= 3;
  const minPrice = Math.min(...t.services.map((x) => x.price));
  const mine = cart.tasker?.id === t.id;
  const qty = (sv: Service) => (mine ? cart.lines[sv.id]?.qty ?? 0 : 0);
  const add = (sv: Service, d: number) => {
    if (d > 0 && cart.tasker && cart.tasker.id !== t.id) showToast(`New booking with ${first}. Your other picks were cleared.`);
    addToCart({ id: t.id, name: t.name, color: t.color, initials: t.initials, photo: t.photo }, sv, d);
  };
  const slides = photos.length ? photos.length : 4;

  return (
    <View style={{ flex: 1, backgroundColor: '#FFF' }}>
      <ScrollView ref={scroll} contentContainerStyle={{ paddingBottom: 120 + insets.bottom }} showsVerticalScrollIndicator={false}>
        {/* gallery */}
        <View style={{ height: 290 + insets.top }}>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setGal(Math.round(e.nativeEvent.contentOffset.x / W))}>
            {photos.length ? photos.map((src, i) => (
              <Image key={i} source={src} style={{ width: W, height: 290 + insets.top }} resizeMode="cover" />
            )) : Array.from({ length: 4 }).map((_, i) => (
              <View key={i} style={{ width: W, height: 290 + insets.top, backgroundColor: i % 2 ? '#0A6378' : t.color, alignItems: 'center', justifyContent: 'center' }}>
                <Ic d={CAT_ICON.repairs} size={64} color="rgba(255,255,255,0.5)" w={1.4} />
                <T w="semibold" style={{ color: colors.heroSub, fontSize: 13, marginTop: 8 }}>Work photos coming soon</T>
              </View>
            ))}
          </ScrollView>
          <View style={[st.floatRow, { top: insets.top + 16 }]}>
            <RoundButton d={P.back} label="Back" onPress={() => router.back()} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <RoundButton d={P.share} label="Share tasker"
                onPress={() => Share.share({ message: `${t.name} · ${t.title} on TSKR. Service starts at ${peso(minPrice)}, free booking fee.` }).catch(() => {})} />
              <RoundButton d={P.heart} label={fav ? 'Remove from saved' : 'Save tasker'} fill={fav ? colors.teal : 'none'}
                onPress={() => toggleFav(t.id, fav)} />
            </View>
          </View>
          <View style={st.counter}><T w="bold" style={{ color: '#FFF', fontSize: 12 }}>{gal + 1} / {slides}</T></View>
        </View>

        {/* sheet */}
        <View style={st.sheet}>
          <Rise i={0} style={{ paddingHorizontal: 20, alignItems: 'center', gap: 6 }}>
            <T w="extrabold" style={{ fontSize: 24, lineHeight: 30, textAlign: 'center' }}>{t.name}</T>
            <T style={{ fontSize: 14, color: colors.body, textAlign: 'center' }}>{t.title} · {t.area}</T>
            <T style={{ fontSize: 13, color: colors.muted }}>{t.services.length} skills · Service starts at {peso(minPrice)}</T>
          </Rise>

          <Rise i={1} style={st.stats}>
            <View style={[st.stat, st.statDiv]}>
              <T w="extrabold" style={{ fontSize: 18 }}>{t.rating.toFixed(1)}</T>
              <T style={{ fontSize: 12, letterSpacing: 1 }}>★★★★★</T>
            </View>
            <View style={[st.stat, st.statDiv, { paddingHorizontal: 4 }]}>
              {pro ? <Ic d={P.crown} size={22} fill={colors.teal} /> : <Ic d={P.shield} size={22} />}
              <T w="extrabold" style={{ fontSize: 12 }}>{pro ? 'Multi-skill' : 'ID verified'}</T>
            </View>
            <View style={st.stat}>
              <T w="extrabold" style={{ fontSize: 18 }}>{t.reviews_count}</T>
              <T w="semibold" style={{ fontSize: 12, color: colors.muted }}>Testimonials</T>
            </View>
          </Rise>
          <Divider />

          <Rise i={2} style={[st.pad, { flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
            <PressScale accessibilityLabel="Your tasker’s photo"
              onPress={() => showToast('For everyone’s safety, you’ll see your tasker’s photo once you book and they confirm.')}>
              <MiniAvatar initials={t.initials} color={t.color} size={60} r={30} />
              <View style={st.verifiedDot}><Ic d={P.check} size={12} color={colors.teal} w={3.2} /></View>
            </PressScale>
            <View style={{ gap: 2, flex: 1 }}>
              <T w="extrabold" style={{ fontSize: 16 }}>Your tasker: {t.name}</T>
              <T style={{ fontSize: 13, color: colors.muted }}>{t.years ?? 1} years of experience · {t.jobs} jobs on TSKR</T>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ic d={P.shield} size={13} color="#2E7D32" w={2.2} />
                <T w="bold" style={{ fontSize: 12, color: '#2E7D32' }}>Photo shows once your booking is confirmed</T>
              </View>
            </View>
          </Rise>
          <Divider />

          <Rise i={3} style={[st.pad, { gap: 18 }]}>
            <Highlight icon={<Ic size={24} w={1.8}><Circle cx={12} cy={12} r={9} /><Path d={P.clock} /></Ic>}
              title={`Arrives in about ${etaText(t.eta_min ?? 30)}`} sub={`Available today in ${t.area}.`} />
            <Highlight icon={<Ic d={P.shield} size={24} w={1.8} />} title="ID verified by TSKR" sub="Government ID checked before the first booking." />
            <Highlight icon={<Ic d={P.route} size={24} w={1.8} />} title="Live tracking" sub={`See ${first} on the map once your booking is confirmed.`} />
          </Rise>
          <Divider />

          {!!t.bio && (
            <>
              <View style={[st.pad, { gap: 8 }]}>
                <T w="extrabold" style={st.h2}>About {first}</T>
                <T style={{ fontSize: 15, lineHeight: 24, color: colors.body }}>{t.bio}</T>
              </View>
              <Divider />
            </>
          )}

          <View onLayout={(e) => setSvcY(e.nativeEvent.layout.y)} style={[st.pad, { gap: 10 }]}>
            <T w="extrabold" style={[st.h2, { marginBottom: 2 }]}>What {first} offers</T>
            {t.services.map((sv, i) => {
              const n = qty(sv);
              return (
                <View key={sv.id} style={st.svc}>
                  <View style={{ flex: 1, gap: 4 }}>
                    {i === 0 && <View style={st.mostBooked}><T w="extrabold" style={{ fontSize: 11, letterSpacing: 0.4 }}>MOST BOOKED</T></View>}
                    <T w="bold" style={{ fontSize: 15 }}>{sv.name}</T>
                    {!!sv.desc && <T style={{ fontSize: 13, color: colors.muted, lineHeight: 18 }}>{sv.desc}</T>}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
                      <T w="extrabold" style={{ fontSize: 15 }}>Starts at {peso(sv.price)}</T>
                      {!!sv.dur && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ic size={13} color={colors.muted}><Circle cx={12} cy={12} r={9} /><Path d={P.clock} /></Ic>
                          <T w="semibold" style={{ fontSize: 12, color: colors.muted }}>{durText(sv.dur)}</T>
                        </View>
                      )}
                    </View>
                  </View>
                  {n === 0 ? (
                    <PressScale accessibilityLabel={`Add ${sv.name}`} onPress={() => add(sv, 1)} style={st.addBtn}>
                      <Ic d={P.plus} w={2.4} />
                    </PressScale>
                  ) : (
                    <View style={st.stepper}>
                      <TealGloss />
                      <PressScale accessibilityLabel="Remove one" onPress={() => add(sv, -1)} style={st.stepBtn}><Ic d={P.minus} color="#FFF" w={2.4} /></PressScale>
                      <T w="extrabold" style={{ color: '#FFF', fontSize: 15, minWidth: 16, textAlign: 'center' }}>{n}</T>
                      <PressScale accessibilityLabel="Add one" onPress={() => add(sv, 1)} style={st.stepBtn}><Ic d={P.plus} color="#FFF" w={2.4} /></PressScale>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
          <Divider />

          <View style={{ gap: 12 }}>
            <View style={[st.pad, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
              <StarIc size={18} />
              <T w="extrabold" style={st.h2}>{t.rating.toFixed(1)} · {t.reviews_count} testimonials</T>
            </View>
            {t.reviews.length === 0 ? (
              <View style={[st.pad]}>
                <View style={st.emptyRev}>
                  <T style={{ fontSize: 14, color: colors.muted, lineHeight: 21 }}>
                    Written testimonials show here after completed bookings. Book {first} and share how it went.
                  </T>
                </View>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
                {t.reviews.map((r, i) => (
                  <View key={i} style={st.review}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={st.revAvatar}><T w="extrabold" style={{ fontSize: 13 }}>{r.initials}</T></View>
                      <View>
                        <T w="bold" style={{ fontSize: 14 }}>{r.name}</T>
                        <T style={{ fontSize: 12, color: colors.muted }}>{new Date(r.at).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}</T>
                      </View>
                    </View>
                    <T style={{ fontSize: 11, letterSpacing: 1 }}>{'★'.repeat(r.rating)}</T>
                    {!!r.text && <T style={{ fontSize: 14, lineHeight: 21, color: colors.body }}>{r.text}</T>}
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
          <Divider />

          <View style={[st.pad, { gap: 10 }]}>
            <T w="extrabold" style={st.h2}>Service area</T>
            <View style={st.map}>
              <Svg width="100%" height="100%" viewBox="0 0 350 170" preserveAspectRatio="xMidYMid slice">
                <Rect width="350" height="170" fill="#F2F0EB" />
                <Path d="M0 120 C80 100 140 140 350 90" stroke="#FFFFFF" strokeWidth={10} fill="none" />
                <Path d="M60 0 L120 170 M240 0 L210 170 M0 50 L350 70" stroke="#FFFFFF" strokeWidth={6} fill="none" />
                <Path d="M0 150 C100 140 200 165 350 140" stroke="#CFE3E7" strokeWidth={14} fill="none" />
                <Circle cx="175" cy="85" r="70" fill="rgba(4,77,94,0.08)" stroke="#044D5E" strokeWidth={1.5} strokeDasharray="5 5" />
              </Svg>
              <View style={st.mapPin}><MiniAvatar initials={t.initials} color={t.color} size={30} r={15} /></View>
            </View>
            <T style={{ fontSize: 14, color: colors.body }}>{t.area} · up to {t.radius_km} km</T>
            <PressScale onPress={() => setRepOpen(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, marginTop: 10, alignSelf: 'flex-start' }}>
              <Ic d={P.flag} color={colors.error} w={2} />
              <T w="bold" style={{ color: colors.error, fontSize: 14 }}>Report or block this tasker</T>
            </PressScale>
          </View>
        </View>
      </ScrollView>

      {/* bottom bar */}
      <View style={[st.bar, { paddingBottom: 12 + Math.max(10, insets.bottom) }]}>
        {mine && cartCount > 0 ? (
          <>
            <View style={{ flexShrink: 1 }}>
              <T w="extrabold" style={{ fontSize: 16 }}>{peso(subtotal)}</T>
              <T style={{ fontSize: 12, color: colors.muted }}>{cartCount} selected · starting total</T>
            </View>
            <PressScale onPress={() => router.push('/cart')} style={st.barBtn}><TealGloss /><T w="extrabold" style={st.barBtnText}>Review booking</T></PressScale>
          </>
        ) : (
          <>
            <View style={{ flexShrink: 1 }}>
              <T w="extrabold" style={{ fontSize: 16 }}>Starts at {peso(minPrice)}</T>
              <T style={{ fontSize: 12, color: colors.muted }}>★ {t.rating.toFixed(1)} · Free booking fee</T>
            </View>
            <PressScale onPress={() => scroll.current?.scrollTo({ y: 290 + insets.top + svcY - 30, animated: true })} style={st.barBtn}>
              <TealGloss /><T w="extrabold" style={st.barBtnText}>Choose a service</T>
            </PressScale>
          </>
        )}
      </View>
      <Sheet open={repOpen} onClose={() => setRepOpen(false)} title="Report or block">
        <T style={{ fontSize: 13, color: colors.muted, lineHeight: 19 }}>Reports are private. {first} won’t know who reported them.</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {['Fake or wrong profile', 'Asked to deal outside TSKR', 'Offers a banned service', 'Inappropriate photos or words', 'Other'].map((r) => (
            <Chip key={r} label={r} on={reasons.includes(r)} onPress={() => { setRepErr(''); setReasons(reasons.includes(r) ? reasons.filter((x) => x !== r) : [...reasons, r]); }} />
          ))}
        </View>
        <TextInput value={repText} onChangeText={setRepText} multiline placeholder="Anything else we should know? (optional)" placeholderTextColor="#98A2B3"
          accessibilityLabel="Details" style={{ minHeight: 84, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, padding: 12, fontFamily: font.medium, fontSize: 14, color: colors.teal, textAlignVertical: 'top' }} />
        <PressScale accessibilityRole="checkbox" accessibilityState={{ checked: block }} onPress={() => setBlock(!block)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: block ? colors.teal : '#98A2B3', backgroundColor: block ? colors.teal : '#FFF', alignItems: 'center', justifyContent: 'center' }}>
            {block && <Ic d={P.check} size={14} color="#FFF" w={3} />}
          </View>
          <T w="semibold" style={{ fontSize: 14, flex: 1 }}>Also block {first}. You won’t see each other on TSKR.</T>
        </PressScale>
        <ErrorText>{repErr}</ErrorText>
        <GlossyButton label="Send report" onPress={sendReport} loading={repBusy} />
      </Sheet>
      <Toast text={toast} top={insets.top + 16} left={72} />
    </View>
  );
}

const Divider = () => <View style={{ height: 1, backgroundColor: colors.borderSoft, marginHorizontal: 20 }} />;
const Highlight = ({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) => (
  <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
    {icon}
    <View style={{ flex: 1, gap: 2 }}>
      <T w="bold" style={{ fontSize: 15 }}>{title}</T>
      <T style={{ fontSize: 13, color: colors.muted }}>{sub}</T>
    </View>
  </View>
);

const st = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#FFF' },
  floatRow: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  counter: { position: 'absolute', right: 16, bottom: 34, backgroundColor: 'rgba(4,30,38,0.7)', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 },
  sheet: { marginTop: -22, backgroundColor: '#FFF', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 24, gap: 22 },
  pad: { paddingHorizontal: 20 },
  h2: { fontSize: 19 },
  stats: { marginHorizontal: 20, borderWidth: 1, borderColor: colors.borderSoft, ...bubble(20, 6), flexDirection: 'row', paddingVertical: 14, paddingHorizontal: 6 },
  stat: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  statDiv: { borderRightWidth: 1, borderRightColor: colors.borderSoft },
  verifiedDot: {
    position: 'absolute', right: -4, bottom: -4, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.green,
    borderWidth: 2, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center',
  },
  svc: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.borderSoft,
    backgroundColor: '#FFF', shadowColor: '#044D5E', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
  mostBooked: { alignSelf: 'flex-start', backgroundColor: colors.tint, borderRadius: 6, paddingVertical: 3, paddingHorizontal: 7 },
  addBtn: { width: 44, height: 44, borderRadius: 14, borderWidth: 1.5, borderColor: colors.teal, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 14, padding: 2, overflow: 'hidden' },
  stepBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  emptyRev: { borderWidth: 1, borderColor: colors.borderSoft, ...bubble(20, 6), padding: 16 },
  review: { width: 260, borderWidth: 1, borderColor: colors.borderSoft, ...bubble(20, 6), padding: 16, gap: 10 },
  revAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  map: { height: 170, ...bubble(20, 6), overflow: 'hidden', backgroundColor: '#F2F0EB', alignItems: 'center', justifyContent: 'center' },
  mapPin: {
    position: 'absolute', borderWidth: 3, borderColor: '#FFF', borderRadius: 20,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 4 },
  },
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.94)', borderTopWidth: 1, borderTopColor: colors.borderSoft,
    paddingTop: 12, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  },
  barBtn: { height: 52, paddingHorizontal: 22, ...bubble(18, 6), overflow: 'hidden', justifyContent: 'center' },
  barBtnText: { color: '#FFF', fontSize: 15 },
});
