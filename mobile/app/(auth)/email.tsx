import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { router } from 'expo-router';
import { StepHeader } from '../../src/components/StepHeader';
import { CodeInput, ErrorText, H1, IconTile, LinkButton, PrimaryButton, s, Sub, T } from '../../src/components/ui';
import { MailIcon } from '../../src/components/icons';
import { colors } from '../../src/theme';
import { getMyProfile, rpc, supabase } from '../../src/lib/supabase';
import { digits, maskEmail } from '../../src/lib/signup';
import { useCooldown, waitSeconds } from '../../src/lib/useCooldown';

type Sent = { sent: boolean; demo: boolean; cooldown: number };

export default function EmailCode() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [demo, setDemo] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cd = useCooldown();

  const send = useCallback(async (isResend: boolean) => {
    setErr(null);
    try {
      const r = await rpc<Sent>('request_otp', { p_channel: 'email' });
      setDemo(r.demo); cd.start(r.cooldown);
      if (isResend) setInfo('A new code was sent.');
    } catch (e: any) {
      const w = waitSeconds(e.message);
      if (w) cd.start(w); else setErr(e.message);   // on first load a recent code is fine
      if (w && isResend) setErr(e.message);
    }
  }, []);

  useEffect(() => {
    getMyProfile().then((p) => { if (p?.email) setEmail(p.email); }).catch(() => {});
    supabase.from('app_config').select('value').eq('key', 'otp_demo_mode').single()
      .then(({ data }) => setDemo(data?.value === true));
    send(false);
  }, [send]);

  const verify = async () => {
    if (code.length !== 6) { setErr('Enter the 6-digit code.'); return; }
    setBusy(true); setErr(null); setInfo(null);
    try { await rpc('verify_otp', { p_channel: 'email', p_code: code }); router.push('/(auth)/phone'); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.white }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StepHeader step={3} />
      <View style={s.screen}>
        <IconTile><MailIcon /></IconTile>
        <H1>Check your email</H1>
        <Sub>
          We sent a 6-digit code to <T w="bold" style={{ color: colors.teal, fontSize: 14 }}>{email ? maskEmail(email) : 'your email'}</T>.
          {demo ? ' (Demo code: 482913)' : ''}
        </Sub>
        <CodeInput value={code} onChangeText={(v) => { setCode(digits(v).slice(0, 6)); setErr(null); }} accessibilityLabel="Email verification code" autoFocus />
        <ErrorText>{err}</ErrorText>
        {info && !err && <T w="semibold" style={{ fontSize: 13, color: colors.muted }}>{info}</T>}
        <PrimaryButton label="Verify email" onPress={verify} loading={busy} />
        <LinkButton label={cd.left > 0 ? `Resend code in ${cd.left}s` : 'Resend code'} disabled={cd.left > 0} onPress={() => send(true)} />
      </View>
    </KeyboardAvoidingView>
  );
}
