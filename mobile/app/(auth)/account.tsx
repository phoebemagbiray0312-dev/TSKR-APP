import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { StepHeader } from '../../src/components/StepHeader';
import { ErrorText, H1, PrimaryButton, s, Sub, T } from '../../src/components/ui';
import { bubble, colors, font } from '../../src/theme';
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.white }}>
      <StepHeader step={1} />
      <View style={s.screen}>
        <H1>Choose your Google account</H1>
        <Sub>TSKR will use your name and email address. We never post anything for you.</Sub>
        {ACCOUNTS.map((a) => (
          <Pressable key={a.email} onPress={() => pick(a.name, a.email)} disabled={!!busy}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderWidth: 1.5, borderColor: colors.borderSoft, opacity: busy && busy !== a.email ? 0.5 : 1, ...bubble(20, 6) }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center' }}>
              <T w="extrabold" style={{ color: colors.white, fontSize: 15 }}>{a.initials}</T>
            </View>
            <View style={{ flexShrink: 1 }}>
              <T w="bold" style={{ fontSize: 15 }}>{a.name}</T>
              <T style={{ fontSize: 13, color: colors.muted }}>{busy === a.email ? 'Signing in…' : a.email}</T>
            </View>
          </Pressable>
        ))}
        <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 12 }}>
          <T w="bold" style={{ fontSize: 12, color: colors.muted }}>DEMO · use another account</T>
          {(['name', 'email'] as const).map((k) => (
            <TextInput key={k} value={other[k]} onChangeText={(v) => setOther({ ...other, [k]: v })}
              placeholder={k === 'name' ? 'Full name' : 'Email'} autoCapitalize={k === 'name' ? 'words' : 'none'}
              keyboardType={k === 'email' ? 'email-address' : 'default'} placeholderTextColor={colors.disabledText}
              style={{ height: 48, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 14, fontFamily: font.semibold, color: colors.text, ...bubble(14, 4) }} />
          ))}
          <PrimaryButton label="Continue" loading={busy === other.email && !!busy}
            disabled={other.name.trim().length < 3 || !/^\S+@\S+\.\S+$/.test(other.email)} onPress={() => pick(other.name, other.email)} />
        </View>
        <ErrorText>{err}</ErrorText>
      </View>
    </View>
  );
}
