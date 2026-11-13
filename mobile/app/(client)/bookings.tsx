import React, { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Path, Rect } from 'react-native-svg';
import { bubble, colors } from '../../src/theme';
import { T } from '../../src/components/ui';
import { Backdrop, GlossyButton, PressScale, Rise } from '../../src/components/glass';
import { Ic, MiniAvatar, P, Toast } from '../../src/components/clientUi';
import { peso, useClient } from '../../src/lib/client';
import { rpc } from '../../src/lib/supabase';

type Row = {
  id: string; code: string; status: string; created_at: string; active: boolean; total: number; tasker_id: string;
  tasker_name: string; tasker_initials: string; tasker_color: string | null; service: string; reviewed: boolean;
};
const LABEL: Record<string, string> = {
  requested: 'Waiting for reply', chatting: 'Chatting', offer_sent: 'Offer received', offer_accepted: 'Offer accepted',
  on_the_way: 'Tasker on the way', arrived: 'Tasker arrived', final_price_sent: 'Final price to review', ready: 'Ready to start',
  in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled', declined_by_tasker: 'Declined',
};

/** Design: BOOKINGS (active first, then past with Rebook / Report a problem). */
export default function Bookings() {
  const insets = useSafeAreaInsets();
  const { toast, showToast } = useClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try { setRows(await rpc<Row[]>('my_bookings')); } catch (e: any) { showToast(e.message); setRows([]); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, []));

  const active = rows?.filter((r) => r.active) ?? [];
  const past = rows?.filter((r) => !r.active) ?? [];
  const open = (r: Row) => router.push({ pathname: '/booking/[id]', params: { id: r.id } });
  const date = (s: string) => new Date(s).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });

  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        contentContainerStyle={{ paddingTop: insets.top + 20, paddingHorizontal: 16, paddingBottom: 130, gap: 14 }}>
        <T w="extrabold" style={{ fontSize: 26 }}>Bookings</T>
        {rows === null && <ActivityIndicator color={colors.teal} style={{ padding: 30 }} />}
        {rows?.length === 0 && (
          <Rise i={1} style={[st.card, { padding: 22, gap: 12 }]}>
            <View style={st.icon}><Ic size={28} w={1.8}><Rect x={3} y={4} width={18} height={17} rx={3} /><Path d={P.navCal} /></Ic></View>
            <T w="extrabold" style={{ fontSize: 18 }}>No bookings yet</T>
            <T style={{ fontSize: 14, color: colors.muted, lineHeight: 21 }}>When you book a tasker, you’ll follow the job here: chat, offer, live tracking and payment.</T>
            <GlossyButton label="Find a tasker" onPress={() => router.replace('/home')} />
          </Rise>
        )}

        {active.length > 0 && <T w="extrabold" style={st.section}>ACTIVE</T>}
        {active.map((r, i) => (
          <Rise key={r.id} i={i}>
            <PressScale onPress={() => open(r)} style={[st.card, st.active]}>
              <MiniAvatar initials={r.tasker_initials} color={r.tasker_color ?? colors.teal} size={46} r={15} />
              <View style={{ flex: 1, gap: 2 }}>
                <T w="extrabold" style={{ fontSize: 12, color: '#2E7D32' }}>{LABEL[r.status] ?? r.status}</T>
                <T w="bold" numberOfLines={1} style={{ fontSize: 15 }}>{r.service}</T>
                <T style={{ fontSize: 13, color: colors.muted }}>{r.tasker_name} · {peso(Number(r.total))}</T>
              </View>
              <Ic d={P.chevRight} size={20} color={colors.muted} />
            </PressScale>
          </Rise>
        ))}

        {past.length > 0 && <T w="extrabold" style={[st.section, { marginTop: 6 }]}>PAST</T>}
        {past.map((r, i) => (
          <Rise key={r.id} i={i}>
            <PressScale onPress={() => open(r)} style={[st.card, { padding: 16, gap: 6 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                <T w="bold" numberOfLines={1} style={{ fontSize: 15, flex: 1 }}>{r.service}</T>
                <T w="extrabold" style={{ fontSize: 15 }}>{peso(Number(r.total))}</T>
              </View>
              <T style={{ fontSize: 13, color: colors.muted }}>{r.tasker_name} · {date(r.created_at)} · {LABEL[r.status]}</T>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <PressScale style={st.smallBtn} onPress={() => router.push({ pathname: '/tasker/[id]', params: { id: r.tasker_id } })}>
                  <T w="bold" style={{ fontSize: 13 }}>Rebook</T>
                </PressScale>
                <PressScale style={st.smallBtn} onPress={() => showToast('Report a problem comes in the next build.')}>
                  <T w="bold" style={{ fontSize: 13 }}>Report a problem</T>
                </PressScale>
              </View>
            </PressScale>
          </Rise>
        ))}
      </ScrollView>
      <Toast text={toast} top={insets.top + 10} />
    </View>
  );
}

const st = StyleSheet.create({
  card: { ...bubble(22, 6), backgroundColor: 'rgba(255,255,255,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)' },
  active: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderColor: colors.green, borderWidth: 1.5 },
  section: { fontSize: 12, letterSpacing: 0.8, color: colors.muted },
  icon: { width: 56, height: 56, ...bubble(20, 6), backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  smallBtn: { height: 38, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.teal, justifyContent: 'center', backgroundColor: '#FFF' },
});
