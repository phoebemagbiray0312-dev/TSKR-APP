import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { H1, LinkButton, s, Sub } from '../../src/components/ui';
import { colors } from '../../src/theme';
import { getMyProfile, supabase } from '../../src/lib/supabase';

/** Placeholder for the Client app Home (Guide §5) — next milestone. */
export default function ClientHome() {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  useEffect(() => { getMyProfile().then((p) => setName(p?.first_name?.split(' ')[0] ?? '')).catch(() => {}); }, []);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return (
    <View style={[s.screen, { paddingTop: 22 + insets.top, backgroundColor: colors.white }]}>
      <H1>{greet}{name ? `, ${name}` : ''}!</H1>
      <Sub>What needs doing today? The client Home (categories, taskers near you, booking) is the next build.</Sub>
      <LinkButton label="Sign out" onPress={async () => { await supabase.auth.signOut(); router.replace('/(auth)/welcome'); }} />
    </View>
  );
}
