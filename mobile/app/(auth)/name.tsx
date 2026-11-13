import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { GlassScreen, StepHeader } from '../../src/components/StepHeader';
import { ErrorText, Field, H1, IconTile, Note, PrimaryButton, s, Sub } from '../../src/components/ui';
import { Rise } from '../../src/components/glass';
import { IdIcon } from '../../src/components/icons';
import { getMyProfile, rpc, Role, supabase } from '../../src/lib/supabase';

export default function NameAsOnId() {
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [role, setRole] = useState<Role>('client');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getMyProfile().then((p) => {
      if (!p) return router.replace('/(auth)/welcome');
      setFirst(p.first_name ?? ''); setLast(p.last_name ?? ''); setRole(p.signup_role);
    }).catch((e) => setErr(e.message));
  }, []);

  const save = async () => {
    if (first.trim().length < 2 || last.trim().length < 2) { setErr('Enter your first and last name as shown on your ID.'); return; }
    setBusy(true); setErr(null);
    try {
      await rpc('update_legal_name', { p_first: first, p_last: last });
      router.push('/(auth)/email');
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const back = async () => { await supabase.auth.signOut(); router.replace('/(auth)/welcome'); };

  return (
    <GlassScreen>
      <StepHeader step={2} onBack={back} />
      <ScrollView contentContainerStyle={[s.screen, { gap: 14, flexGrow: 1, paddingBottom: 30 }]} keyboardShouldPersistTaps="handled">
        <Rise i={0}><IconTile><IdIcon /></IconTile></Rise>
        <Rise i={1}><H1>Your name, as on your ID</H1></Rise>
        <Rise i={2}><Sub>We filled this in from your Google account. Change it if it doesn’t match a valid government ID.</Sub></Rise>
        <Rise i={3}><Field label="First name (and middle name)" value={first} onChangeText={(v) => { setFirst(v); setErr(null); }} autoComplete="given-name" autoCapitalize="words" /></Rise>
        <Rise i={4}><Field label="Last name" value={last} onChangeText={(v) => { setLast(v); setErr(null); }} autoComplete="family-name" autoCapitalize="words" /></Rise>
        <Rise i={5}>
          <Note>
            {role === 'tasker'
              ? 'This must match the 2 government IDs you’ll scan next. Names that don’t match can’t be verified.'
              : 'Your tasker may ask to see a valid ID when they arrive, to confirm the booking. Use the name exactly as it appears on your ID.'}
          </Note>
        </Rise>
        <ErrorText>{err}</ErrorText>
        <View style={{ flex: 1 }} />
        <Rise i={6}><PrimaryButton label="Continue" onPress={save} loading={busy} /></Rise>
      </ScrollView>
    </GlassScreen>
  );
}
