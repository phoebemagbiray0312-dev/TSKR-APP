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
        if (next !== '/(auth)/done') return router.replace(next);
        // taskers who aren't approved yet continue Become a Tasker; everyone else lands on Home
        if (p.signup_role === 'tasker') return router.replace(p.tasker_status === 'active' ? '/work/home' : '/(tasker)/verify');
        router.replace('/(client)/home');
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
