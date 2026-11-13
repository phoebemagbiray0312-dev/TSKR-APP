import React, { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../../src/theme';
import { T } from '../../../src/components/ui';
import { Backdrop, PressScale, Rise } from '../../../src/components/glass';
import { Ic, P, glassCard } from '../../../src/components/clientUi';
import { peso } from '../../../src/lib/client';
import { STATUS_LABEL } from '../../../src/lib/tasker';
import { rpc } from '../../../src/lib/supabase';

type J = { id: string; code: string; status: string; created_at: string; active: boolean; total: number; client: string; service: string };

/** Job tab: active jobs first, then history. */
export default function Jobs() {
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<J[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => { try { setList(await rpc<J[]>('tasker_jobs')); } catch { setList([]); } }, []);
  useFocusEffect(useCallback(() => { load(); }, []));
  const active = list?.filter((j) => j.active) ?? [];
  const past = list?.filter((j) => !j.active) ?? [];
  const row = (j: J, i: number) => (
    <Rise key={j.id} i={i}>
      <PressScale onPress={() => router.push({ pathname: '/work/job/[id]', params: { id: j.id } })}
        style={[glassCard, { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }, j.active && { borderColor: colors.green, borderWidth: 1.5 }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <T w="extrabold" style={{ fontSize: 12, color: j.active ? '#2E7D32' : colors.muted }}>{STATUS_LABEL[j.status]}</T>
          <T w="bold" numberOfLines={1} style={{ fontSize: 15 }}>{j.service}</T>
          <T style={{ fontSize: 13, color: colors.muted }}>{j.client} · {new Date(j.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} · {peso(Number(j.total))}</T>
        </View>
        <Ic d={P.chevRight} size={18} color={colors.muted} />
      </PressScale>
    </Rise>
  );
  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        contentContainerStyle={{ paddingTop: insets.top + 20, paddingHorizontal: 16, paddingBottom: 130, gap: 12 }}>
        <T w="extrabold" style={{ fontSize: 26 }}>Jobs</T>
        {list === null && <ActivityIndicator color={colors.teal} style={{ padding: 30 }} />}
        {list?.length === 0 && (
          <View style={[glassCard, { padding: 20, gap: 4 }]}>
            <T w="extrabold" style={{ fontSize: 17 }}>No jobs yet</T>
            <T style={{ fontSize: 14, color: colors.muted, lineHeight: 21 }}>Go online on Home. Booking requests near you show up there; reply to start a job.</T>
          </View>
        )}
        {active.length > 0 && <T w="extrabold" style={{ fontSize: 12, letterSpacing: 0.8, color: colors.muted }}>ACTIVE</T>}
        {active.map(row)}
        {past.length > 0 && <T w="extrabold" style={{ fontSize: 12, letterSpacing: 0.8, color: colors.muted, marginTop: 6 }}>HISTORY</T>}
        {past.map(row)}
      </ScrollView>
    </View>
  );
}
