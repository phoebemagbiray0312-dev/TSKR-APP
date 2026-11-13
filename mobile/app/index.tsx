import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { getMyProfile, supabase } from '../src/lib/supabase';
import { flushPendingConsent, nextSignupRoute } from '../src/lib/signup';
import { colors } from '../src/theme';

/** Decides where to start: Welcome, the unfinished sign-up step, or the app. */
export default function Index() {
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) return router.replace('/(auth)/welcome');
        await flushPendingConsent();
        const p = await getMyProfile();
        if (!p) return router.replace('/(auth)/welcome');
        const next = nextSignupRoute(p);
        router.replace(next === '/(auth)/done' ? '/(client)/home' : next);
      } catch {
        router.replace('/(auth)/welcome');
      }
    })();
  }, []);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.teal }}>
      <ActivityIndicator color={colors.green} />
    </View>
  );
}
