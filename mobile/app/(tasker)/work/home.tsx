import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Circle, Path } from 'react-native-svg';
import { colors } from '../../../src/theme';
import { T } from '../../../src/components/ui';
import { Backdrop, PressScale, Rise } from '../../../src/components/glass';
import { HeaderFill, HeaderLogo, Ic, P, StarIc, TealGloss, Toast, glassCard } from '../../../src/components/clientUi';
import { peso, useClient } from '../../../src/lib/client';
import { STATUS_LABEL, TaskerHome, coins, hm, loadTaskerHome } from '../../../src/lib/tasker';
import { rpc, supabase } from '../../../src/lib/supabase';

/** Design: tasker HEADER + HOME — online switch, new requests, active job, today. */
export default function WorkHome() {
  const insets = useSafeAreaInsets();
  const { toast, showToast } = useClient();
  const [h, setH] = useState<TaskerHome | null>(null);
  const [busy, setBusy] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [fees, setFees] = useState<{ id: string; booking_id: string; amount_php: number; reference_no: string }[]>([]);

  const load = useCallback(async () => {
    try {
      setH(await loadTaskerHome());
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase.from('cancellation_fees').select('id,booking_id,amount_php,reference_no').eq('tasker_id', u.user!.id).eq('status', 'submitted');
      setFees((data ?? []) as any);
    } catch (e: any) { showToast(e.message); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, []));
  // new requests arrive live
  useEffect(() => {
    const ch = supabase.channel(`tasker-home-${Date.now()}-${Math.random()}`).on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  if (!h) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Backdrop /><ActivityIndicator color={colors.teal} /></View>;

  const qrOk = !h.require_qr || h.qr_status === 'approved';
  const setup: [boolean, string, string, string][] = [
    [h.skills > 0, 'Add your skills', h.skills_pending ? `${h.skills_pending} waiting for review` : 'What you do and your starting price', '/work/skills'],
    [h.base_set, 'Set your service area', 'Where you start from and how far you travel', '/work/skills'],
    [qrOk, 'Upload your payment QR', h.qr_status === 'pending' ? 'Name didn’t match your ID · under review' : 'So clients can pay you', '/work/me'],
  ];
  const ready = setup.every(([ok]) => ok);
  const broke = h.coins < h.fee;
  const low = !broke && h.coins < h.fee * 2;

  const toggle = async () => {
    setBusy('online');
    try { const on = await rpc<boolean>('set_online', { p_on: !h.online }); showToast(on ? 'You’re online. New requests will show here.' : 'You’re offline. No new requests.'); await load(); }
    catch (e: any) { showToast(e.message); } finally { setBusy(''); }
  };
  const reply = (id: string) => router.push({ pathname: '/work/job/[id]', params: { id } });
  const simulate = async () => {
    setBusy('sim');
    try { await rpc('demo_client_request'); showToast('Test request from Carla R. (demo client)'); await load(); }
    catch (e: any) { showToast(e.message); } finally { setBusy(''); }
  };
  const decline = (id: string) => Alert.alert('Decline this request?', 'No strike: you haven’t sent an offer yet.', [
    { text: 'Keep it', style: 'cancel' },
    { text: 'Decline', style: 'destructive', onPress: async () => { try { await rpc('tasker_decline', { p_booking: id, p_reason: 'not_available' }); load(); } catch (e: any) { showToast(e.message); } } },
  ]);

  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        contentContainerStyle={{ paddingBottom: 130, gap: 14 }}>
        {/* header */}
        <View style={[st.head, { paddingTop: insets.top + 14 }]}>
          <HeaderFill />
          <View style={st.row}>
            <View style={[st.row, { gap: 8 }]}>
              <HeaderLogo height={24} />
              <View style={st.badge}><T w="extrabold" style={{ fontSize: 10, color: colors.teal, letterSpacing: 0.6 }}>TASKER</T></View>
            </View>
            <PressScale onPress={toggle} style={[st.online, h.online ? { backgroundColor: colors.green } : { backgroundColor: 'rgba(255,255,255,0.14)' }]}>
              {busy === 'online' ? <ActivityIndicator size="small" color={h.online ? colors.teal : '#FFF'} /> : (
                <>
                  <View style={[st.dot, { backgroundColor: h.online ? colors.teal : '#98A2B3' }]} />
                  <T w="extrabold" style={{ fontSize: 13, color: h.online ? colors.teal : '#FFF' }}>{h.online ? 'Online' : 'Offline'}</T>
                </>
              )}
            </PressScale>
          </View>
          <View style={[st.row, { marginTop: 14 }]}>
            <View style={{ flex: 1 }}>
              <T w="extrabold" style={{ color: '#FFF', fontSize: 20 }}>{h.short_name}</T>
              <T style={{ color: colors.heroSub, fontSize: 13 }}>{h.nickname ? `“${h.nickname}” · ` : ''}{h.area_label ?? 'Set your service area'}</T>
            </View>
            <PressScale onPress={() => router.replace('/work/wallet')} accessibilityLabel="Coin balance" style={st.coinBtn}>
              <Ic size={16} color={colors.teal} w={2.2}><Circle cx={12} cy={12} r={8} /><Path d="M12 8v8" /></Ic>
              <T w="extrabold" style={{ fontSize: 13 }}>{h.coins.toLocaleString('en-PH')}</T>
            </PressScale>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, gap: 14 }}>
          {!ready && (
            <Rise i={0} style={[glassCard, { padding: 16, gap: 10 }]}>
              <T w="extrabold" style={{ fontSize: 17 }}>Finish setting up to get bookings</T>
              {setup.map(([ok, t, sub, href]) => (
                <PressScale key={t} onPress={() => router.replace(href as any)} style={[st.row, { gap: 12, paddingVertical: 4 }]}>
                  <View style={[st.check, ok && { backgroundColor: colors.green, borderColor: colors.green }]}>{ok && <Ic d={P.check} size={14} color={colors.teal} w={3} />}</View>
                  <View style={{ flex: 1 }}>
                    <T w="bold" style={{ fontSize: 15, textDecorationLine: ok ? 'line-through' : 'none', color: ok ? colors.muted : colors.teal }}>{t}</T>
                    <T style={{ fontSize: 12, color: colors.muted }}>{sub}</T>
                  </View>
                  {!ok && <Ic d={P.chevRight} size={18} color={colors.muted} />}
                </PressScale>
              ))}
            </Rise>
          )}

          {broke && (
            <View style={[glassCard, st.alert]}>
              <T w="extrabold" style={{ fontSize: 15, color: colors.error }}>You’re out of coins</T>
              <T style={{ fontSize: 13, color: colors.body }}>You can’t receive bookings until you buy coins. ₱1,000 gets you 1,000 coins.</T>
              <PressScale onPress={() => router.replace('/work/wallet')} style={st.smallBtn}><T w="bold" style={{ fontSize: 13 }}>Buy coins</T></PressScale>
            </View>
          )}
          {low && (
            <View style={[glassCard, st.alert, { borderColor: '#F5D9B5' }]}>
              <T w="bold" style={{ fontSize: 14 }}>Low on coins · {coins(h.coins)} left</T>
              <PressScale onPress={() => router.replace('/work/wallet')} style={st.smallBtn}><T w="bold" style={{ fontSize: 13 }}>Buy coins</T></PressScale>
            </View>
          )}

          {fees.map((f) => (
            <PressScale key={f.id} onPress={() => reply(f.booking_id)} style={[glassCard, st.alert, { borderColor: colors.green }]}>
              <T w="extrabold" style={{ fontSize: 15 }}>Cancellation fee sent to you · {peso(Number(f.amount_php))}</T>
              <T style={{ fontSize: 13, color: colors.body }}>Reference {f.reference_no}. Check your e-wallet, then confirm you received it.</T>
              <T w="bold" style={{ fontSize: 13 }}>Confirm →</T>
            </PressScale>
          ))}

          {/* new requests */}
          {h.requests.map((r, i) => (
            <Rise key={r.id} i={i} style={[glassCard, { padding: 16, gap: 10, borderColor: colors.green, borderWidth: 1.5 }]}>
              <View style={st.row}>
                <T w="extrabold" style={{ fontSize: 11, letterSpacing: 0.8, color: '#2E7D32' }}>NEW BOOKING REQUEST</T>
                <T w="bold" style={{ fontSize: 12 }}>{r.when_type === 'now' ? 'Now (ASAP)' : new Date(r.scheduled_at!).toLocaleString('en-PH', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</T>
              </View>
              {r.repeat && <View style={st.repeat}><T w="extrabold" style={{ fontSize: 10 }}>REPEAT CLIENT · ONLY {h.repeat_fee} COINS</T></View>}
              <View style={{ gap: 2 }}>
                <T w="extrabold" style={{ fontSize: 17 }}>{r.service}</T>
                <T style={{ fontSize: 13, color: colors.muted }}>{r.client} · {r.area}{r.km != null ? ` · ${r.km} km` : ''}</T>
              </View>
              <View style={[st.row, st.priceBox]}>
                <View><T style={{ fontSize: 12, color: colors.muted }}>Your starting price</T><T w="extrabold" style={{ fontSize: 16 }}>{peso(Number(r.total))}</T></View>
                <View style={{ alignItems: 'flex-end' }}><T style={{ fontSize: 12, color: colors.muted }}>Fee when you start</T><T w="extrabold" style={{ fontSize: 16 }}>{r.repeat ? h.repeat_fee : h.fee} coins</T></View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <PressScale outer={{ flex: 1 }} onPress={() => decline(r.id)} style={st.ghost}><T w="bold" style={{ fontSize: 14 }}>Decline</T></PressScale>
                <PressScale outer={{ flex: 1.6 }} onPress={() => reply(r.id)} style={st.solid}><TealGloss /><T w="extrabold" style={{ fontSize: 14, color: '#FFF' }}>Reply and chat</T></PressScale>
              </View>
            </Rise>
          ))}
          {h.requests.length === 0 && ready && (
            <View style={[glassCard, { padding: 18, gap: 4 }]}>
              <T w="extrabold" style={{ fontSize: 16 }}>{h.online ? 'Waiting for requests…' : 'You’re offline'}</T>
              <T style={{ fontSize: 13, color: colors.muted, lineHeight: 19 }}>{h.online ? 'New booking requests near you show up here right away.' : 'Tap Offline at the top to go online and start getting requests.'}</T>
            </View>
          )}

          {/* TEST BUILD (design: "Simulate a new request (demo)") */}
          {ready && (
            <PressScale onPress={simulate} style={st.demoBtn}>
              <T w="extrabold" style={{ fontSize: 10, letterSpacing: 0.6, color: colors.warnText }}>TEST BUILD</T>
              <T w="bold" style={{ fontSize: 14, color: colors.warnText }}>{busy === 'sim' ? 'Sending…' : '▶ Simulate a new request (demo client)'}</T>
            </PressScale>
          )}

          {/* active jobs */}
          {h.active.map((j) => (
            <PressScale key={j.id} onPress={() => reply(j.id)} style={[glassCard, st.row, { padding: 16, gap: 12, borderColor: colors.teal, borderWidth: 1.5 }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <T w="extrabold" style={{ fontSize: 11, letterSpacing: 0.8, color: '#2E7D32' }}>ACTIVE JOB · {STATUS_LABEL[j.status]?.toUpperCase()}</T>
                <T w="bold" style={{ fontSize: 15 }} numberOfLines={1}>{j.service}</T>
                <T style={{ fontSize: 13, color: colors.muted }}>{j.client} · {j.area} · {peso(Number(j.total))}</T>
              </View>
              <Ic d={P.chevRight} size={20} color={colors.muted} />
            </PressScale>
          ))}

          {/* today's schedule */}
          {h.schedule.length > 0 && (
            <View style={[glassCard, { padding: 16, gap: 10 }]}>
              <View style={st.row}>
                <T w="extrabold" style={{ fontSize: 17 }}>Today’s schedule</T>
                {(() => { const next = h.schedule.find((x) => new Date(x.start).getTime() > Date.now()); return next ? <T w="semibold" style={{ fontSize: 12, color: '#2E7D32' }}>Free until {hm(new Date(new Date(next.start).getTime() - next.buffer_min * 60000).toISOString())}</T> : null; })()}
              </View>
              {h.schedule.map((x) => (
                <PressScale key={x.id} onPress={() => reply(x.id)} style={[st.row, { gap: 12, alignItems: 'flex-start' }]}>
                  <View style={st.timeBox}><T w="extrabold" style={{ fontSize: 13 }}>{hm(x.start)}</T><T style={{ fontSize: 11, color: colors.muted }}>to {hm(x.end)}</T></View>
                  <View style={{ flex: 1 }}>
                    <T w="bold" style={{ fontSize: 14 }} numberOfLines={1}>{x.service}</T>
                    <T style={{ fontSize: 12, color: colors.muted }}>{x.client} · {x.area} · {STATUS_LABEL[x.status]}</T>
                  </View>
                </PressScale>
              ))}
              <T style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>You can take more bookings at other times. We add {h.schedule[0].buffer_min} minutes of travel time after each job.</T>
            </View>
          )}

          {/* weekly reward */}
          <View style={[glassCard, { padding: 16, gap: 10 }, h.week.free_next && { borderColor: colors.green, borderWidth: 1.5 }]}>
            <View style={st.row}>
              <T w="extrabold" style={{ fontSize: 11, letterSpacing: 0.8, color: '#2E7D32' }}>WEEKLY REWARD</T>
              <T w="bold" style={{ fontSize: 12 }}>{h.week.count} of {h.week.target} this week</T>
            </View>
            <T w="extrabold" style={{ fontSize: 17 }}>{h.week.free_next ? 'Your next booking is free!' : `${h.week.target - h.week.count} more booking${h.week.target - h.week.count === 1 ? '' : 's'} to a free one`}</T>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {Array.from({ length: h.week.target + 1 }).map((_, i) => (
                <View key={i} style={[st.seg, i < h.week.count && { backgroundColor: colors.teal }, i === h.week.target && { backgroundColor: h.week.free_next ? colors.green : '#E9F8E6' }]} />
              ))}
            </View>
            <T style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>Finish {h.week.target} bookings in a week and your {h.week.target + 1}th booking is free: no coins deducted. The count resets after your free booking, and every Monday.</T>
            <View style={[st.row, st.priceBox, { gap: 10 }]}>
              <T w="extrabold" style={{ fontSize: 15 }}>{h.week.streak}/{h.week.streak_weeks}</T>
              <T style={{ fontSize: 12, color: colors.body, flex: 1, lineHeight: 17 }}>Streak bonus: hit {h.week.target}+ bookings for {h.week.streak_weeks} weeks in a row and get {h.week.streak_bonus} bonus coins.</T>
            </View>
          </View>

          {/* today */}
          <View style={[glassCard, st.row, { padding: 16 }]}>
            <Stat v={peso(Number(h.today_earned))} k="Earned today" />
            <Stat v={String(h.today_jobs)} k="Jobs today" />
            <Stat v={h.rating_count ? Number(h.rating).toFixed(1) : '—'} k="Rating" star={h.rating_count > 0} />
          </View>
          <T style={{ fontSize: 12, color: colors.muted, lineHeight: 18, paddingHorizontal: 4 }}>
            Ratings and testimonials only count for jobs booked in TSKR. Repeat clients cost you only {h.repeat_fee} coins.
          </T>

          <PressScale onPress={() => router.replace('/work/skills')} style={[glassCard, st.row, { padding: 16, gap: 12 }]}>
            <View style={{ flex: 1 }}>
              <T w="bold" style={{ fontSize: 15 }}>My skills · {h.skills} of 5</T>
              <T style={{ fontSize: 13, color: colors.muted }}>Prices, service area and extra skills</T>
            </View>
            <Ic d={P.chevRight} size={18} color={colors.muted} />
          </PressScale>
          <PressScale onPress={() => router.replace('/home')} style={{ alignSelf: 'center', padding: 10 }}>
            <T w="bold" style={{ fontSize: 14 }}>Switch to client app</T>
          </PressScale>
        </View>
      </ScrollView>
      <Toast text={toast} top={insets.top + 10} />
    </View>
  );
}

const Stat = ({ v, k, star }: { v: string; k: string; star?: boolean }) => (
  <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>{star && <StarIc size={14} />}<T w="extrabold" style={{ fontSize: 18 }}>{v}</T></View>
    <T style={{ fontSize: 12, color: colors.muted }}>{k}</T>
  </View>
);

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  head: { paddingHorizontal: 20, paddingBottom: 18, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden' },
  badge: { backgroundColor: colors.green, borderRadius: 6, paddingVertical: 2, paddingHorizontal: 6 },
  online: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 14, borderRadius: 999, minWidth: 96, justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  coinBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF', borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#98A2B3', alignItems: 'center', justifyContent: 'center' },
  alert: { padding: 14, gap: 6, borderColor: '#F3B8B2', borderWidth: 1.5 },
  smallBtn: { alignSelf: 'flex-start', height: 36, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.teal, justifyContent: 'center', backgroundColor: '#FFF', marginTop: 4 },
  repeat: { alignSelf: 'flex-start', backgroundColor: '#E9F8E6', borderRadius: 6, paddingVertical: 3, paddingHorizontal: 7 },
  demoBtn: { borderRadius: 14, borderWidth: 1.5, borderColor: '#E0A96D', backgroundColor: colors.warnBg, padding: 12, alignItems: 'center', gap: 2 },
  priceBox: { backgroundColor: 'rgba(230,241,243,0.8)', borderRadius: 14, padding: 12 },
  timeBox: { width: 74, paddingVertical: 6, borderRadius: 10, backgroundColor: colors.tint, alignItems: 'center' },
  seg: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#E4E7EC' },
  ghost: { height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: colors.teal, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  solid: { height: 48, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
