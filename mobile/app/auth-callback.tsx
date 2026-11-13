import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { colors } from '../src/theme';
import { supabase } from '../src/lib/supabase';
import { flushPendingConsent } from '../src/lib/signup';

/** Web redirect target after Google sign-in. */
export default function AuthCallback() {
  useEffect(() => {
    const sub = supabase.auth.onAuthStateChange(async (_e, session) => {
      if (session) { await flushPendingConsent().catch(() => {}); router.replace('/'); }
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session) router.replace('/'); });
    return () => sub.data.subscription.unsubscribe();
  }, []);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={colors.teal} />
    </View>
  );
}
