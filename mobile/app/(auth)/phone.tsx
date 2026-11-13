import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { GlassScreen, StepHeader } from '../../src/components/StepHeader';
import { ErrorText, H1, IconTile, PrimaryButton, s, Sub, T } from '../../src/components/ui';
import { Rise } from '../../src/components/glass';
import { PhoneIcon } from '../../src/components/icons';
import { bubble, colors, font } from '../../src/theme';
import { rpc } from '../../src/lib/supabase';
import { digits } from '../../src/lib/signup';
import { waitSeconds } from '../../src/lib/useCooldown';

export default function MobileNumber() {
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState(false);

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
    <GlassScreen>
      <StepHeader step={4} />
      <View style={s.screen}>
        <Rise i={0}><IconTile><PhoneIcon /></IconTile></Rise>
        <Rise i={1}><H1>Add your mobile number</H1></Rise>
        <Rise i={2}><Sub>Your tasker can call you about the job. We’ll text you a one-time code to confirm it’s yours.</Sub></Rise>
        <Rise i={3}>
          {/* frosted field with green focus ring (design v2) */}
          <View style={[{ padding: 4, margin: -4 }, bubble(22, 10), focus && { backgroundColor: 'rgba(110,218,96,0.28)' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 60, borderWidth: 1.5, paddingHorizontal: 16,
              borderColor: focus ? '#0A6378' : colors.border, backgroundColor: 'rgba(255,255,255,0.5)', ...bubble(18, 6) }}>
              <T w="extrabold" style={{ fontSize: 17, paddingRight: 10, borderRightWidth: 1.5, borderRightColor: 'rgba(255,255,255,0.85)' }}>+63</T>
              <TextInput value={phone} onChangeText={(v) => { setPhone(digits(v).slice(0, 10)); setErr(null); }}
                onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
                keyboardType="number-pad" maxLength={10} placeholder="917 123 4567" placeholderTextColor={colors.disabledText}
                accessibilityLabel="Mobile number" autoComplete="tel-national" textContentType="telephoneNumber" autoFocus
                style={{ flex: 1, fontFamily: font.bold, fontSize: 18, color: colors.text }} />
            </View>
          </View>
        </Rise>
        <ErrorText>{err}</ErrorText>
        <Rise i={4}><PrimaryButton label="Send code by SMS" onPress={send} loading={busy} /></Rise>
      </View>
    </GlassScreen>
  );
}
