import React, { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../src/theme';
import { T } from '../../src/components/ui';
import { Backdrop, PressScale, Rise } from '../../src/components/glass';
import { Ic, P, SubHeader, glassCard } from '../../src/components/clientUi';
import { supabase } from '../../src/lib/supabase';

type N = { id: string; kind: string; title: string; body: string | null; data: any; read_at: string | null; created_at: string };

const ago = (s: string) => {
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return new Date(s).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
};

/** Design: NOTIFICATIONS — booking updates and account news. */
export default function Notifications() {
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<N[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    const { data } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50);
    setList((data ?? []) as N[]);
    const unread = (data ?? []).filter((n: N) => !n.read_at).map((n: N) => n.id);
    if (unread.length) await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', unread);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, []));

  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <SubHeader title="Notifications" />
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 + insets.bottom }}>
        {list === null && <ActivityIndicator color={colors.teal} style={{ padding: 30 }} />}
        {list?.length === 0 && (
          <View style={[glassCard, { padding: 22 }]}>
            <T w="extrabold" style={{ fontSize: 17 }}>You’re all caught up</T>
            <T style={{ fontSize: 14, color: colors.muted, marginTop: 4 }}>Booking updates and news show here.</T>
          </View>
        )}
        {list?.map((n, i) => {
          const bid = n.data?.booking_id;
          return (
            <Rise key={n.id} i={i}>
              <PressScale onPress={() => bid && router.push({ pathname: '/booking/[id]', params: { id: bid } })}
                style={[glassCard, { flexDirection: 'row', gap: 12, padding: 14 }, !n.read_at && { borderColor: colors.green, borderWidth: 1.5 }]}>
                <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' }}>
                  <Ic d={n.kind.startsWith('booking') ? P.navCal : P.bell} size={20} w={1.8} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <T w="bold" style={{ fontSize: 15 }}>{n.title}</T>
                  {!!n.body && <T style={{ fontSize: 13, color: colors.body, lineHeight: 19 }}>{n.body}</T>}
                  <T style={{ fontSize: 12, color: colors.muted }}>{ago(n.created_at)}</T>
                </View>
                {bid ? <Ic d={P.chevRight} size={18} color={colors.muted} /> : null}
              </PressScale>
            </Rise>
          );
        })}
      </ScrollView>
    </View>
  );
}
