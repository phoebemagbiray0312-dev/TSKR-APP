import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { GlassScreen, StepHeader } from '../../src/components/StepHeader';
import { ErrorText, H1, PrimaryButton, s, Sub, T } from '../../src/components/ui';
import { GlassInput, GlassView, PressScale, Rise } from '../../src/components/glass';
import { colors } from '../../src/theme';
import { signInDemo } from '../../src/lib/auth';
import { flushPendingConsent } from '../../src/lib/signup';

// TESTING ONLY: stands in for Google's account chooser while EXPO_PUBLIC_DEMO_AUTH=true
const ACCOUNTS = [
  { name: 'Juan Dela Cruz', email: 'juan.delacruz@gmail.com', initials: 'JD' },
  { name: 'Juan D. Cruz', email: 'juan.work@gmail.com', initials: 'JC' },
];

export default function ChooseAccount() {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [other, setOther] = useState({ name: '', email: '' });

  const pick = async (name: string, email: string) => {
    setErr(null); setBusy(email);
    try {
      await signInDemo(email.trim().toLowerCase(), name.trim());
      await flushPendingConsent();
      router.replace('/(auth)/name');
    } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };

  let i = 0;
  return (
    <GlassScreen>
      <StepHeader step={1} />
      <ScrollView contentContainerStyle={[s.screen, { paddingBottom: 40 }]} keyboardShouldPersistTaps="handled">
        <Rise i={i++}><H1>Choose your Google account</H1></Rise>
        <Rise i={i++}><Sub>TSKR will use your name and email address. We never post anything for you.</Sub></Rise>
        {ACCOUNTS.map((a) => (
          <Rise key={a.email} i={i++}>
            <PressScale onPress={() => pick(a.name, a.email)} disabled={!!busy} style={{ opacity: busy && busy !== a.email ? 0.5 : 1 }}>
              <GlassView style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center' }}>
                  <T w="extrabold" style={{ color: colors.white, fontSize: 15 }}>{a.initials}</T>
                </View>
                <View style={{ flexShrink: 1 }}>
                  <T w="bold" style={{ fontSize: 15 }}>{a.name}</T>
                  <T style={{ fontSize: 13, color: colors.muted }}>{busy === a.email ? 'Signing in…' : a.email}</T>
                </View>
              </GlassView>
            </PressScale>
          </Rise>
        ))}
        <Rise i={i++} style={{ gap: 10, paddingTop: 8 }}>
          <T w="bold" style={{ fontSize: 12, color: colors.muted }}>DEMO · use another account</T>
          <GlassInput value={other.name} onChangeText={(v) => setOther({ ...other, name: v })} placeholder="Full name" autoCapitalize="words"
            r={[14, 4]} style={{ height: 48, paddingHorizontal: 14 }} />
          <GlassInput value={other.email} onChangeText={(v) => setOther({ ...other, email: v })} placeholder="Email" autoCapitalize="none"
            keyboardType="email-address" r={[14, 4]} style={{ height: 48, paddingHorizontal: 14 }} />
          <PrimaryButton label="Continue" loading={!!busy && busy === other.email}
            disabled={other.name.trim().length < 3 || !/^\S+@\S+\.\S+$/.test(other.email)} onPress={() => pick(other.name, other.email)} />
        </Rise>
        <ErrorText>{err}</ErrorText>
      </ScrollView>
    </GlassScreen>
  );
}
