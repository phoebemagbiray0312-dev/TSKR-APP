import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { H1, LinkButton, s, Sub } from '../../src/components/ui';
import { supabase } from '../../src/lib/supabase';

/** Placeholder for Become a Tasker (Guide §2.2: ID consent, 2 IDs with OCR, selfie) — next milestone. */
export default function TaskerVerify() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.screen, { paddingTop: 22 + insets.top }]}>
      <H1>Verify your IDs</H1>
      <Sub>You’ll need 2 different valid government IDs and a selfie. This screen is the next build; the backend for it is ready.</Sub>
      <LinkButton label="Sign out" onPress={async () => { await supabase.auth.signOut(); router.replace('/(auth)/welcome'); }} />
    </View>
  );
}
