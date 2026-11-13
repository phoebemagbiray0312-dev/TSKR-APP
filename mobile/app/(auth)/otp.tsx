import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { GlassScreen, StepHeader } from '../../src/components/StepHeader';
import { CodeInput, ErrorText, H1, IconTile, LinkButton, PrimaryButton, s, Sub, T } from '../../src/components/ui';
import { Rise } from '../../src/components/glass';
import { ChatIcon } from '../../src/components/icons';
import { colors } from '../../src/theme';
import { rpc } from '../../src/lib/supabase';
import { digits, maskPhone } from '../../src/lib/signup';
import { useCooldown, waitSeconds } from '../../src/lib/useCooldown';

export default function SmsOtp() {
  const { phone = '', demo = '0', cooldown = '60' } = useLocalSearchParams<{ phone: string; demo: string; cooldown: string }>();
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cd = useCooldown();

  useEffect(() => { cd.start(Number(cooldown) || 60); }, []);

  const verify = async () => {
    if (code.length !== 6) { setErr('Enter the 6-digit code.'); return; }
    setBusy(true); setErr(null); setInfo(null);
    try { await rpc('verify_otp', { p_channel: 'sms', p_code: code }); router.replace('/(auth)/done'); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const resend = async () => {
    setErr(null);
    try {
      const r = await rpc<{ cooldown: number }>('request_otp', { p_channel: 'sms', p_phone: phone });
      cd.start(r.cooldown); setInfo('A new code was sent.');
    } catch (e: any) { const w = waitSeconds(e.message); if (w) cd.start(w); setErr(e.message); }
  };

  return (
    <GlassScreen>
      <StepHeader step={5} />
      <View style={s.screen}>
        <Rise i={0}><IconTile><ChatIcon /></IconTile></Rise>
        <Rise i={1}><H1>Enter the SMS code</H1></Rise>
        <Rise i={2}>
          <Sub>
            Sent to <T w="bold" style={{ color: colors.teal, fontSize: 14 }}>{maskPhone(phone)}</T>.
            {demo === '1' ? ' (Demo code: 135790)' : ''}
          </Sub>
        </Rise>
        <Rise i={3}><CodeInput value={code} onChangeText={(v) => { setCode(digits(v).slice(0, 6)); setErr(null); }} accessibilityLabel="SMS one-time code" autoFocus /></Rise>
        <ErrorText>{err}</ErrorText>
        {info && !err && <T w="semibold" style={{ fontSize: 13, color: colors.muted }}>{info}</T>}
        <Rise i={4}><PrimaryButton label="Verify number" onPress={verify} loading={busy} /></Rise>
        <LinkButton label={cd.left > 0 ? `Resend code in ${cd.left}s` : 'Resend code'} disabled={cd.left > 0} onPress={resend} />
      </View>
    </GlassScreen>
  );
}
