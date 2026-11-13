import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { StepHeader } from '../../src/components/StepHeader';
import { ErrorText, H1, IconTile, PrimaryButton, s, Sub, T } from '../../src/components/ui';
import { PhoneIcon } from '../../src/components/icons';
import { bubble, colors, font } from '../../src/theme';
import { rpc } from '../../src/lib/supabase';
import { digits } from '../../src/lib/signup';
import { waitSeconds } from '../../src/lib/useCooldown';

export default function MobileNumber() {
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!/^9\d{9}$/.test(phone)) { setErr('Enter a valid PH mobile number, like 917 123 4567.'); return; }
    setBusy(true); setErr(null);
    try {
      const r = await rpc<{ demo: boolean; cooldown: number }>('request_otp', { p_channel: 'sms', p_phone: phone });
      router.push({ pathname: '/(auth)/otp', params: { phone, demo: r.demo ? '1' : '0', cooldown: String(r.cooldown) } });
    } catch (e: any) {
      // a code was sent moments ago: go enter it
      const w = waitSeconds(e.message);
      if (w) router.push({ pathname: '/(auth)/otp', params: { phone, demo: '1', cooldown: String(w) } });
      else setErr(e.message);
    } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.white }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StepHeader step={4} />
      <View style={s.screen}>
        <IconTile><PhoneIcon /></IconTile>
        <H1>Add your mobile number</H1>
        <Sub>Your tasker can call you about the job. We’ll text you a one-time code to confirm it’s yours.</Sub>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 60, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 16, ...bubble(18, 6) }}>
          <T w="extrabold" style={{ fontSize: 17, paddingRight: 10, borderRightWidth: 1.5, borderRightColor: colors.borderSoft }}>+63</T>
          <TextInput value={phone} onChangeText={(v) => { setPhone(digits(v).slice(0, 10)); setErr(null); }}
            keyboardType="number-pad" maxLength={10} placeholder="917 123 4567" placeholderTextColor={colors.disabledText}
            accessibilityLabel="Mobile number" autoComplete="tel-national" textContentType="telephoneNumber" autoFocus
            style={{ flex: 1, fontFamily: font.bold, fontSize: 18, color: colors.text }} />
        </View>
        <ErrorText>{err}</ErrorText>
        <PrimaryButton label="Send code by SMS" onPress={send} loading={busy} />
      </View>
    </KeyboardAvoidingView>
  );
}
