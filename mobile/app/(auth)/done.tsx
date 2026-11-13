import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { H1, PrimaryButton, s, Sub, T } from '../../src/components/ui';
import { Backdrop, GlassView, GreenGloss, Rise } from '../../src/components/glass';
import { CheckIcon } from '../../src/components/icons';
import { colors } from '../../src/theme';
import { getMyProfile, Profile } from '../../src/lib/supabase';
import { fmtPhone } from '../../src/lib/signup';

export default function Done() {
  const [p, setP] = useState<Profile | null>(null);
  const insets = useSafeAreaInsets();
  useEffect(() => { getMyProfile().then(setP).catch(() => {}); }, []);
  const tasker = p?.signup_role === 'tasker';

  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <View style={[s.screen, { paddingTop: 22 + insets.top, paddingBottom: 30 + insets.bottom }]}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          <Rise i={0}><GreenGloss><CheckIcon size={40} color={colors.teal} width={2.6} /></GreenGloss></Rise>
          <Rise i={1}><H1 style={{ textAlign: 'center' }}>You’re all set, {p?.first_name?.split(' ')[0] ?? ''}!</H1></Rise>
          <Rise i={2}>
            <Sub style={{ textAlign: 'center' }}>
              {tasker ? 'Your email and mobile number are verified. Next, verify your IDs and face to start receiving bookings.'
                      : 'Your email and mobile number are verified.'}
            </Sub>
          </Rise>
          <Rise i={3} style={{ alignSelf: 'stretch' }}>
            <GlassView style={{ paddingVertical: 6, paddingHorizontal: 16 }}>
              <Row k="Name" v={p ? `${p.first_name ?? ''} ${p.last_name ?? ''}` : ''} />
              <Row k="Email" v={p?.email ? `${p.email} ✓` : ''} />
              <Row k="Mobile" v={p?.phone ? `+63 ${fmtPhone(p.phone)} ✓` : ''} last />
            </GlassView>
          </Rise>
        </View>
        <Rise i={4}>
          {tasker
            ? <PrimaryButton label="Next: verify your IDs" onPress={() => router.replace('/(tasker)/verify')} />
            : <PrimaryButton label="Start exploring" onPress={() => router.replace('/(client)/home')} />}
        </Rise>
      </View>
    </View>
  );
}

function Row({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: 'rgba(255,255,255,0.85)' }}>
      <T style={{ fontSize: 14, color: colors.muted }}>{k}</T>
      <T w="bold" style={{ fontSize: 14, flexShrink: 1, textAlign: 'right' }}>{v}</T>
    </View>
  );
}
