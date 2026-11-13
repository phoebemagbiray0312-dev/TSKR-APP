import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { bubble, colors, font } from '../../src/theme';
import { T } from '../../src/components/ui';
import { Backdrop, PressScale, Rise } from '../../src/components/glass';
import {
  CAT_ICON, Chip, GreenFill, HeaderFill, HeaderLogo, Ic, MiniAvatar, P, SearchIc, StarIc, TealGloss, Toast, VerifiedIc,
} from '../../src/components/clientUi';
import { CATS, TaskerCard, catIdOf, catLabel, durText, etaText, peso, useClient } from '../../src/lib/client';
import { coverPhoto } from '../../src/lib/demoPhotos';
import { AddressSheet } from '../../src/components/AddressSheet';
import { rpc } from '../../src/lib/supabase';

type Sort = 'recommended' | 'top_rated' | 'nearest';
type Result = { blocked: boolean; items: TaskerCard[] };

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning!' : h < 18 ? 'Good afternoon!' : 'Good evening!';
};

export default function Home() {
  const insets = useSafeAreaInsets();
  const { address, addresses, selected, selectAddress, favs, toggleFav, cartCount, subtotal, toast, showToast } = useClient();
  const [addrOpen, setAddrOpen] = useState(false);

  // filters (design: category tiles, search, chips)
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [availNow, setAvailNow] = useState(false);
  const [sort, setSort] = useState<Sort>('recommended');
  const [proOnly, setProOnly] = useState(false);
  const [favOnly, setFavOnly] = useState(false);

  const [all, setAll] = useState<TaskerCard[]>([]);
  const [list, setList] = useState<TaskerCard[] | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [err, setErr] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => { const t = setTimeout(() => setQ(query.trim()), 300); return () => clearTimeout(t); }, [query]);
  // Explore sends a service name here as ?q=
  const params = useLocalSearchParams<{ q?: string }>();
  useEffect(() => { if (params.q) { setQuery(params.q); setCat(null); setProOnly(false); setFavOnly(false); } }, [params.q]);
  useFocusEffect(useCallback(() => { setTick((n) => n + 1); }, []));

  // everyone nearby: feeds Featured services and Top service providers
  useEffect(() => {
    rpc<Result>('discover_taskers', { p_lat: address.lat, p_lng: address.lng }).then((r) => setAll(r.items)).catch(() => {});
  }, [address.lat, address.lng, tick]);

  // the filtered list
  useEffect(() => {
    let live = true;
    setErr('');
    rpc<Result>('discover_taskers', {
      p_lat: address.lat, p_lng: address.lng, p_query: q || null, p_category: CATS.find((c) => c.id === cat)?.db ?? null,
      p_available_now: availNow, p_multi_skill: proOnly, p_favorites: favOnly, p_sort: sort,
    }).then((r) => { if (live) { setList(r.items); setBlocked(r.blocked); } })
      .catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [address.lat, address.lng, q, cat, availNow, sort, proOnly, favOnly, tick]);

  const isFav = (t: TaskerCard) => favs[t.id] ?? t.favorite;
  const open = (t: { id: string }) => router.push({ pathname: '/tasker/[id]', params: { id: t.id } });

  const featured = useMemo(() => [...all].sort((a, b) => b.rating * Math.log(2 + b.jobs) - a.rating * Math.log(2 + a.jobs))
    .slice(0, 7).map((t, i) => {
      const svc = t.services[t.pro && t.services[1] ? 1 : 0];
      const tag = i === 0 ? 'POPULAR' : t.eta_min <= 25 ? 'FAST' : t.rating >= 4.9 ? 'TOP TASKER' : 'AT YOUR HOME';
      return { t, svc, tag };
    }), [all]);
  const top = useMemo(() => [...all].sort((a, b) => (b.rating - a.rating) || (b.jobs - a.jobs)).slice(0, 5), [all]);

  // ----- collapsing header (design: greeting fades, search stays pinned) -----
  const y = useRef(new Animated.Value(0)).current;
  const [topH, setTopH] = useState(150);
  const [headH, setHeadH] = useState(260);
  const shift = y.interpolate({ inputRange: [0, topH + 14], outputRange: [0, -(topH + 14)], extrapolate: 'clamp' });
  const fade = y.interpolate({ inputRange: [0, topH * 0.8], outputRange: [1, 0], extrapolate: 'clamp' });
  const drift = y.interpolate({ inputRange: [0, topH], outputRange: [0, 18], extrapolate: 'clamp' });

  const listTitle = cat ? `${CATS.find((c) => c.id === cat)!.label} taskers` : 'Taskers near you';

  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <Animated.ScrollView
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y } } }], { useNativeDriver: true })}
        scrollEventThrottle={16} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: headH + 20, paddingHorizontal: 16, paddingBottom: 190, gap: 20 }}>

        {/* Categories */}
        <Rise i={1} style={{ gap: 12 }}>
          <View style={st.rowBetween}>
            <T w="extrabold" style={st.h2}>Categories</T>
            <PressScale onPress={() => router.push('/explore')}><T w="bold" style={{ fontSize: 13, paddingVertical: 8 }}>See all</T></PressScale>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, paddingTop: 2, gap: 10 }}>
            {CATS.map((c) => {
              const on = cat === c.id;
              return (
                <PressScale key={c.id} onPress={() => setCat(on ? null : c.id)} accessibilityState={{ selected: on }}
                  style={[st.catTile, on ? st.catOn : st.glass]}>
                  {on && <TealGloss />}
                  <View style={[st.catRing, { backgroundColor: on ? 'rgba(255,255,255,0.16)' : colors.tint }]}>
                    <Ic d={CAT_ICON[c.id]} color={on ? '#FFF' : colors.teal} w={1.8} />
                  </View>
                  <T w="semibold" style={{ fontSize: 14, color: on ? '#FFF' : colors.teal }}>{c.label}</T>
                </PressScale>
              );
            })}
            <PressScale onPress={() => router.push('/explore')} style={[st.catTile, st.glass, { borderStyle: 'dashed', borderColor: colors.teal }]}>
              <View style={[st.catRing, { backgroundColor: colors.tint }]}><Ic d={P.grid} w={1.8} /></View>
              <T w="semibold" style={{ fontSize: 14 }}>More</T>
            </PressScale>
          </ScrollView>
        </Rise>

        {/* Featured services */}
        <Rise i={2} style={{ gap: 12 }}>
          <View style={st.rowBetween}>
            <View style={{ gap: 2 }}>
              <T w="extrabold" style={st.h2}>Featured services</T>
              <T w="medium" style={st.muted13}>Top picks this week</T>
            </View>
            <PressScale accessibilityLabel="See all featured services" style={st.circleOutline}
              onPress={() => { setCat(null); setQuery(''); setProOnly(false); setFavOnly(false); }}>
              <Ic d={P.arrow} w={2.2} />
            </PressScale>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={212} decelerationRate="fast"
            style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 4, gap: 12 }}>
            {featured.length === 0 && <Placeholder />}
            {featured.map(({ t, svc, tag }) => (
              <PressScale key={t.id} onPress={() => open(t)} style={{ width: 200, gap: 6 }}>
                <PhotoTile t={t} tag={tag} topLabel={durText(svc?.dur ?? null)} />
                <View style={[st.row, { gap: 6, marginTop: 4 }]}>
                  <MiniAvatar initials={t.initials} color={t.color} size={22} r={7} />
                  <T w="semibold" numberOfLines={1} style={{ fontSize: 13, color: colors.body, flex: 1 }}>{t.name}</T>
                  <StarIc /><T w="bold" style={{ fontSize: 13 }}>{t.rating.toFixed(1)}</T>
                </View>
                <T w="extrabold" numberOfLines={2} style={{ fontSize: 16, lineHeight: 20 }}>{svc?.name}</T>
                <T w="extrabold" style={{ fontSize: 17 }}>Starts at {peso(svc?.price ?? t.min_price)}</T>
                <T w="semibold" style={{ fontSize: 12, color: colors.muted }}>Free booking fee · {t.jobs} jobs</T>
              </PressScale>
            ))}
          </ScrollView>
        </Rise>

        {/* Zero booking fee */}
        <Rise i={3}>
          <View style={[st.zero, bubble(24, 6)]}>
            <GreenFill />
            <View style={{ gap: 4, flex: 1 }}>
              <T w="extrabold" style={{ fontSize: 18, lineHeight: 23 }}>Zero booking fee</T>
              <T style={{ fontSize: 13, lineHeight: 18 }}>You only pay for the tasker’s service.</T>
            </View>
            <View style={st.zeroIcon}><TealGloss /><Ic d={P.gift} size={26} color="#FFF" /></View>
          </View>
        </Rise>

        {/* Filter chips */}
        <Rise i={4}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            style={{ marginHorizontal: -16, marginBottom: -8 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
            <PressScale accessibilityLabel="Filters" style={[st.filterBtn, st.glass]}
              onPress={() => showToast('More filters (price, distance, rating) come in the next build.')}>
              <Ic><Path d={P.filters} /><Path d="M16 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM10 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" /></Ic>
            </PressScale>
            <Chip label="Available now" on={availNow} onPress={() => setAvailNow(!availNow)} />
            <Chip label="Top rated" on={sort === 'top_rated'} onPress={() => setSort(sort === 'top_rated' ? 'recommended' : 'top_rated')} />
            <Chip label="Nearest" on={sort === 'nearest'} onPress={() => setSort(sort === 'nearest' ? 'recommended' : 'nearest')} />
            <Chip label="Multi-skill" icon={P.crown} on={proOnly} onPress={() => setProOnly(!proOnly)} />
            <Chip label="Saved" on={favOnly} onPress={() => setFavOnly(!favOnly)} />
          </ScrollView>
        </Rise>

        {/* Taskers near you */}
        <Rise i={5} style={{ gap: 12 }}>
          <View style={[st.rowBetween, { alignItems: 'baseline' }]}>
            <T w="extrabold" style={st.h2}>{listTitle}</T>
            {list && !blocked ? <T w="semibold" style={st.muted13}>{list.length} available</T> : null}
          </View>
          {list === null && !err && <ActivityIndicator color={colors.teal} style={{ padding: 30 }} />}
          {!!err && <View style={[st.note, st.glass]}><T style={st.noteText}>{err}</T></View>}
          {blocked && (
            <View style={[st.note, st.glass, { alignItems: 'flex-start', gap: 6 }]}>
              <T w="extrabold" style={{ fontSize: 15 }}>TSKR doesn’t offer this service</T>
              <T style={[st.noteText, { textAlign: 'left' }]}>We don’t list personal services (massage, escort, usherette, modeling) or services that need a professional license (doctors, nurses, therapists, lawyers, notaries). Try a home, tech, event or lesson service instead.</T>
            </View>
          )}
          {list && !blocked && list.length === 0 && (
            <View style={[st.note, st.glass]}>
              <T style={st.noteText}>{favOnly ? 'No saved taskers yet. Tap the heart on a tasker to save them.' : 'No taskers for this yet. We’re adding new taskers every week.'}</T>
            </View>
          )}
          {list && !blocked && list.map((t) => (
            <View key={t.id}>
              <PressScale onPress={() => open(t)} style={{ gap: 6 }}>
                <View style={[st.cover, bubble(24, 6)]}>
                  {coverPhoto(t.photo)
                    ? <Image source={coverPhoto(t.photo)} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    : <><Ic d={CAT_ICON[catIdOf(t.cats[0])]} size={36} w={1.6} /><T w="semibold" style={{ fontSize: 12, color: '#3D5A66' }}>Service photo</T></>}
                  {t.pro && (
                    <View style={st.proBadge}><Ic d={P.crown} size={13} fill="#FFF" /><T w="extrabold" style={{ color: '#FFF', fontSize: 12 }}>Multi-skill</T></View>
                  )}
                </View>
                <View style={[st.rowBetween, { marginTop: 6, gap: 10 }]}>
                  <View style={[st.row, { gap: 8, flexShrink: 1 }]}>
                    <MiniAvatar initials={t.initials} color={t.color} />
                    <T w="extrabold" numberOfLines={1} style={{ fontSize: 17, flexShrink: 1 }}>{t.name}</T>
                    <VerifiedIc />
                  </View>
                  <View style={[st.row, { gap: 4 }]}>
                    <StarIc size={14} /><T w="bold" style={{ fontSize: 14 }}>{t.rating.toFixed(1)}</T>
                    <T w="medium" style={{ fontSize: 14, color: colors.muted }}>({t.jobs})</T>
                  </View>
                </View>
                <T w="medium" style={{ fontSize: 14, color: colors.muted }}>
                  {t.available_now ? 'Available now · ' : ''}{t.km.toFixed(1)} km · {t.cats.map(catLabel).join(', ')} · {t.area}
                </T>
                <View style={[st.row, { flexWrap: 'wrap', gap: 6 }]}>
                  {t.services.slice(0, 3).map((sv) => <ServiceChip key={sv.id} label={sv.name} />)}
                  {t.services.length > 3 && <ServiceChip label={`+${t.services.length - 3} more`} />}
                </View>
                <T w="bold" style={{ fontSize: 14 }}>Service starts at {peso(t.min_price)} · <T w="bold" style={{ color: '#2E7D32', fontSize: 14 }}>Free booking fee</T></T>
              </PressScale>
              <PressScale accessibilityLabel={isFav(t) ? 'Remove from saved' : 'Save tasker'} onPress={() => toggleFav(t.id, isFav(t))}
                outer={{ position: 'absolute', top: 12, right: 12 }} style={st.heart}>
                <Ic d={P.heart} fill={isFav(t) ? colors.teal : 'none'} />
              </PressScale>
            </View>
          ))}
        </Rise>

        {/* Top service providers */}
        <Rise i={6} style={{ gap: 12, marginTop: 4 }}>
          <View style={st.rowBetween}>
            <View style={{ gap: 2 }}>
              <T w="extrabold" style={st.h2}>Top service providers</T>
              <T w="medium" style={st.muted13}>Highest rated near your address</T>
            </View>
            <PressScale accessibilityLabel="See all top providers" style={st.circleOutline}
              onPress={() => setSort(sort === 'top_rated' ? 'recommended' : 'top_rated')}>
              <Ic d={P.arrow} w={2.2} />
            </PressScale>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={212} decelerationRate="fast"
            style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10, gap: 12 }}>
            {top.length === 0 && <Placeholder />}
            {top.map((t, i) => (
              <PressScale key={t.id} onPress={() => open(t)} style={{ width: 200, gap: 6 }}>
                <PhotoTile t={t} tag={t.pro ? 'MULTI-SKILL' : 'TOP TASKER'} topLabel={`#${i + 1}`} showInitials />
                <View style={[st.rowBetween, { marginTop: 4, gap: 6 }]}>
                  <T w="extrabold" numberOfLines={1} style={{ fontSize: 16, flexShrink: 1 }}>{t.name}</T>
                  <View style={[st.row, { gap: 3 }]}><StarIc /><T w="bold" style={{ fontSize: 13 }}>{t.rating.toFixed(1)}</T></View>
                </View>
                <T w="semibold" numberOfLines={1} style={{ fontSize: 14, color: colors.body }}>{t.title.split(' · ')[0]}</T>
                <T w="semibold" style={{ fontSize: 12, color: colors.muted }}>{t.jobs} jobs · {etaText(t.eta_min)} away</T>
              </PressScale>
            ))}
          </ScrollView>
        </Rise>
      </Animated.ScrollView>

      {/* Teal header (absolute so it can collapse) */}
      <Animated.View onLayout={(e) => setHeadH(e.nativeEvent.layout.height)}
        style={[st.head, { paddingTop: insets.top + 18, transform: [{ translateY: shift }] }]}>
        <HeaderFill />
        <Animated.View onLayout={(e) => setTopH(e.nativeEvent.layout.height)}
          style={{ gap: 14, opacity: fade, transform: [{ translateY: drift }] }}>
          <View style={st.rowBetween}>
            <HeaderLogo />
            <PressScale accessibilityLabel="Notifications" style={st.bell} onPress={() => router.push('/notifications')}>
              <Ic d={P.bell} color="#FFF" />
              <View style={st.bellDot} />
            </PressScale>
          </View>
          <PressScale accessibilityLabel="Change address" onPress={() => (addresses.length ? setAddrOpen(true) : router.push('/address-form'))} style={[st.row, { gap: 8, alignSelf: 'flex-start' }]}>
            <Ic size={18} color={colors.green} w={2.2}><Path d={P.pin} /><Path d="M12 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z" /></Ic>
            <T w="semibold" style={{ color: '#FFF', fontSize: 14 }}>{address.label}</T>
            <Ic d={P.chevDown} size={16} color="#FFF" w={2.4} />
          </PressScale>
          <T w="bold" style={{ color: '#FFF', fontSize: 24, lineHeight: 31 }}>
            {greeting()}{'\n'}<T w="bold" style={{ color: colors.green, fontSize: 24 }}>What needs doing today?</T>
          </T>
        </Animated.View>
        <View style={st.search}>
          <SearchIc />
          <TextInput value={query} onChangeText={setQuery} placeholder="Search aircon, cleaning, plumber…" placeholderTextColor="#98A2B3"
            returnKeyType="search" accessibilityLabel="Search services or taskers" clearButtonMode="while-editing"
            style={{ flex: 1, fontFamily: font.medium, fontSize: 15, color: colors.teal, height: 54 }} />
          <View style={st.searchGo}><TealGloss /><Ic d={P.arrow} size={18} color="#FFF" w={2.4} /></View>
        </View>
      </Animated.View>

      {cartCount > 0 && (
        <PressScale onPress={() => router.push('/cart')} outer={[st.cartBar, { bottom: 96 + Math.max(0, insets.bottom - 14) }]} style={st.cartInner}>
          <TealGloss r={18} />
          <View style={[st.row, { gap: 10 }]}>
            <View style={st.cartCount}><T w="extrabold" style={{ fontSize: 13 }}>{cartCount}</T></View>
            <T w="bold" style={{ color: '#FFF', fontSize: 15 }}>View booking</T>
          </View>
          <T w="extrabold" style={{ color: '#FFF', fontSize: 15 }}>{peso(subtotal)}</T>
        </PressScale>
      )}
      <AddressSheet open={addrOpen} onClose={() => setAddrOpen(false)} addresses={addresses} selectedId={selected?.id}
        onPick={(a) => selectAddress(a.id)} />
      <Toast text={toast} top={insets.top + 10} />
    </View>
  );
}

function PhotoTile({ t, tag, topLabel, showInitials }: { t: TaskerCard; tag: string; topLabel: string; showInitials?: boolean }) {
  const photo = coverPhoto(t.photo);
  return (
    <View style={[st.tile, bubble(22, 6), { backgroundColor: t.color }]}>
      {photo ? <Image source={photo} style={StyleSheet.absoluteFill} resizeMode="cover" /> : (
        <>
          <Svg width={130} height={117} viewBox="0 0 80 72" style={{ position: 'absolute', right: -26, bottom: -22 }}>
            <Path d={P.bubble} fill="none" stroke="#6EDA60" strokeOpacity={0.22} strokeWidth={7} />
          </Svg>
          {showInitials ? <T w="extrabold" style={{ fontSize: 44, color: '#FFF', letterSpacing: 1 }}>{t.initials}</T>
            : <Ic d={CAT_ICON[catIdOf(t.cats[0])]} size={60} color="#FFF" w={1.6} />}
        </>
      )}
      {!!topLabel && <View style={st.tileTop}><T w="bold" style={{ fontSize: 12 }}>{topLabel}</T></View>}
      <View style={st.tileTag}><GreenFill /><T w="extrabold" style={{ fontSize: 11, letterSpacing: 0.5 }}>{tag}</T></View>
    </View>
  );
}

const ServiceChip = ({ label }: { label: string }) => (
  <View style={st.svcChip}><T w="semibold" style={{ fontSize: 12, color: colors.body }}>{label}</T></View>
);
const Placeholder = () => <View style={[st.tile, bubble(22, 6), { backgroundColor: 'rgba(255,255,255,0.4)' }]} />;

const glass = {
  backgroundColor: 'rgba(255,255,255,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)',
  shadowColor: '#044D5E', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 8 },
} as const;

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h2: { fontSize: 20 },
  muted13: { fontSize: 13, color: colors.muted },
  glass,
  head: {
    position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: 14, gap: 14,
    borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden',
    shadowColor: '#044D5E', shadowOpacity: 0.4, shadowRadius: 18, shadowOffset: { width: 0, height: 14 },
  },
  bell: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  bellDot: { position: 'absolute', top: 10, right: 11, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF', paddingLeft: 18, paddingRight: 8, height: 54,
    ...bubble(22, 6), shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 8 },
  },
  searchGo: { width: 40, height: 40, ...bubble(16, 4), overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  catTile: { height: 50, paddingLeft: 6, paddingRight: 18, flexDirection: 'row', alignItems: 'center', gap: 8, ...bubble(20, 6), borderWidth: 1.5, overflow: 'hidden' },
  catOn: { borderColor: colors.teal, backgroundColor: colors.teal },
  catRing: { width: 38, height: 38, ...bubble(14, 4), alignItems: 'center', justifyContent: 'center' },
  circleOutline: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: colors.teal, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.55)' },
  tile: { width: 200, height: 150, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  tileTop: { position: 'absolute', top: 10, left: 10, backgroundColor: '#FFF', borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  tileTag: { position: 'absolute', bottom: 10, left: 10, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, overflow: 'hidden' },
  zero: { padding: 18, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 12, overflow: 'hidden' },
  zeroIcon: { width: 52, height: 52, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  filterBtn: { width: 52, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  note: { borderRadius: 18, padding: 22, alignItems: 'center' },
  noteText: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 21 },
  cover: {
    height: 190, borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)', backgroundColor: colors.tint, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  proBadge: {
    position: 'absolute', left: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.teal, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10,
  },
  heart: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.8)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)',
  },
  svcChip: { backgroundColor: 'rgba(241,243,246,0.85)', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8 },
  cartBar: { position: 'absolute', left: 16, right: 16 },
  cartInner: {
    height: 56, borderRadius: 18, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18,
    shadowColor: '#044D5E', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 10 },
  },
  cartCount: { backgroundColor: colors.green, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 9 },
});
