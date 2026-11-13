import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bubble, colors } from '../../src/theme';
import { T } from '../../src/components/ui';
import { Backdrop, PressScale, Rise } from '../../src/components/glass';
import { Ic, MiniAvatar, P, Toast } from '../../src/components/clientUi';
import { PlusSheet, usePlan } from '../../src/components/PlusSheet';
import { useClient } from '../../src/lib/client';
import { Profile, getMyProfile, supabase } from '../../src/lib/supabase';

/** Account tab: profile and links. Plan, rewards, addresses and settings arrive in client part 3. */
export default function Account() {
  const insets = useSafeAreaInsets();
  const { toast, showToast } = useClient();
  const { plan, reload } = usePlan();
  const [plusOpen, setPlusOpen] = useState(false);
  const [p, setP] = useState<Profile | null>(null);
  useEffect(() => { getMyProfile().then(setP).catch(() => {}); }, []);
  const name = [p?.first_name, p?.last_name].filter(Boolean).join(' ') || 'Your account';
  const initials = ((p?.first_name?.[0] ?? '') + (p?.last_name?.[0] ?? '')).toUpperCase() || 'ME';
  const go = (path: string) => () => router.push(path as any);

  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 20, paddingHorizontal: 16, paddingBottom: 130, gap: 16 }}>
        <Rise i={0} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <MiniAvatar initials={initials} color={colors.teal} size={60} r={20} />
          <View style={{ flex: 1 }}>
            <T w="extrabold" style={{ fontSize: 22 }}>{name}</T>
            <T w="semibold" style={{ fontSize: 13, color: colors.muted }}>Client{p?.email ? ` · ${p.email}` : ''}</T>
          </View>
        </Rise>
        <Rise i={1} style={[st.card, { padding: 16, gap: 6 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <T w="extrabold" style={{ fontSize: 11, letterSpacing: 0.8, color: colors.muted }}>YOUR PLAN</T>
            {plan?.plan === 'plus' && <View style={{ backgroundColor: colors.green, borderRadius: 6, paddingVertical: 2, paddingHorizontal: 7 }}><T w="extrabold" style={{ fontSize: 10 }}>PLUS</T></View>}
          </View>
          <T w="extrabold" style={{ fontSize: 18 }}>{plan?.plan === 'plus' ? 'TSKR Plus' : 'Free'}</T>
          <T style={{ fontSize: 13, color: colors.body, lineHeight: 19 }}>
            {plan?.plan === 'plus'
              ? `Up to ${plan.max_active} bookings at once, schedule for later, priority rematch. Until ${plan.plus_until ? new Date(plan.plus_until).toLocaleDateString('en-PH', { month: 'long', day: 'numeric' }) : '—'}.`
              : '1 booking a day, Now (ASAP). Zero booking fee, always.'}
          </T>
          {plan?.plan !== 'plus' && (
            <PressScale onPress={() => setPlusOpen(true)} style={{ marginTop: 6, height: 44, borderRadius: 14, borderWidth: 1.5, borderColor: colors.teal, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' }}>
              <T w="bold" style={{ fontSize: 14 }}>Upgrade to TSKR Plus · ₱{plan?.price ?? 149}/month</T>
            </PressScale>
          )}
        </Rise>
        <Rise i={2} style={st.card}>
          <PressScale onPress={() => router.push((p?.is_tasker && p.tasker_status === 'active' ? '/work/home' : '/(tasker)/verify') as any)} style={st.row}>
            <View style={{ flex: 1 }}>
              <T w="bold" style={{ fontSize: 15 }}>{p?.is_tasker && p.tasker_status === 'active' ? 'Switch to Tasker' : p?.tasker_status === 'pending' ? 'Tasker application · under review' : 'Become a Tasker'}</T>
              <T style={{ fontSize: 12, color: colors.muted }}>{p?.is_tasker && p.tasker_status === 'active' ? 'Get job requests and earn' : 'Earn with your skills. Get verified first.'}</T>
            </View>
            <Ic d={P.chevRight} size={18} color={colors.muted} />
          </PressScale>
        </Rise>
        <Rise i={3} style={st.card}>
          {[
            ['Favorite taskers', go('/favorites')],
            ['Saved addresses', go('/addresses')],
            ['Notifications', go('/notifications')],
            ['Help center and reports', go('/help')],
            ['Legal and privacy', go('/legal')],
          ].map(([label, fn], i) => (
            <PressScale key={label as string} onPress={fn as () => void} style={[st.row, i > 0 && st.rowDiv]}>
              <T w="bold" style={{ fontSize: 15, flex: 1 }}>{label as string}</T>
              <Ic d={P.chevRight} size={18} color={colors.muted} />
            </PressScale>
          ))}
        </Rise>
        <Rise i={4}>
          <PressScale onPress={async () => { await supabase.auth.signOut(); router.replace('/(auth)/welcome'); }} style={[st.card, st.row]}>
            <T w="bold" style={{ fontSize: 15, color: colors.error }}>Sign out</T>
          </PressScale>
        </Rise>
      </ScrollView>
      <PlusSheet open={plusOpen} onClose={() => setPlusOpen(false)} plan={plan} onUpgraded={async () => { await reload(); showToast('TSKR Plus is on.'); }} />
      <Toast text={toast} top={insets.top + 10} />
    </View>
  );
}

const st = StyleSheet.create({
  card: { ...bubble(22, 6), backgroundColor: 'rgba(255,255,255,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)', overflow: 'hidden' },
  row: { minHeight: 56, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center' },
  rowDiv: { borderTopWidth: 1, borderTopColor: 'rgba(4,77,94,0.08)' },
});
