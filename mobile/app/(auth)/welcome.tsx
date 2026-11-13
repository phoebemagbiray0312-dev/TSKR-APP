import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bubble, colors } from '../../src/theme';
import { T, ErrorText } from '../../src/components/ui';
import { CheckIcon, HomeIcon, WrenchIcon } from '../../src/components/icons';
import { PolicyReader } from '../../src/components/PolicyReader';
import { Role, DEMO_AUTH } from '../../src/lib/supabase';
import { clearPendingConsent, loadPolicies, PolicyDoc, savePendingConsent, flushPendingConsent } from '../../src/lib/signup';
import { signInWithGoogle } from '../../src/lib/auth';

const HERO = {
  client: { a: 'Trusted taskers,', b: 'right at your door.', sub: 'Book verified people for repairs, cleaning, tech, lessons and more. Free booking fee, always.' },
  tasker: { a: 'Earn with your skills,', b: 'on your own time.', sub: 'Set your own prices, choose your jobs, and get paid directly by clients near you.' },
};

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const [role, setRole] = useState<Role>('client');
  const [docs, setDocs] = useState<{ terms: PolicyDoc; privacy: PolicyDoc } | null>(null);
  const [reading, setReading] = useState<null | 'terms' | 'privacy'>(null);
  const [readTerms, setReadTerms] = useState(false);
  const [agree, setAgree] = useState(false);
  const [agreeErr, setAgreeErr] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { loadPolicies(role).then(setDocs).catch((e) => setErr(e.message)); }, [role]);

  // switching the role card clears any earlier acceptance (Guide §2)
  const pick = (r: Role) => {
    if (r === role) return;
    setRole(r); setAgree(false); setReadTerms(false); setAgreeErr(false);
    clearPendingConsent();
  };

  const toggleAgree = () => {
    if (agree) { setAgree(false); clearPendingConsent(); return; }
    setAgreeErr(false);
    setReading(readTerms ? 'privacy' : 'terms');
  };

  const agreeDoc = async () => {
    if (reading === 'terms') { setReadTerms(true); setReading('privacy'); return; }
    setReading(null); setAgree(true);
    if (docs) await savePendingConsent({ role, termsVersion: docs.terms.version, privacyVersion: docs.privacy.version, acceptedAt: new Date().toISOString() });
  };

  const google = async () => {
    if (!agree) { setAgreeErr(true); return; }
    setErr(null);
    if (DEMO_AUTH) { router.push('/(auth)/account'); return; }
    try {
      setBusy(true);
      await signInWithGoogle();
      await flushPendingConsent();
      router.replace('/(auth)/name');
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const h = HERO[role];
  const roleWord = role === 'tasker' ? 'Tasker' : 'Client';

  return (
    <View style={{ flex: 1, backgroundColor: colors.teal }}>
      <Image source={require('../../assets/logo-mark.png')} accessibilityElementsHidden
        style={{ position: 'absolute', width: 440, height: 290, left: 10, top: 250, opacity: 0.12 }} resizeMode="contain" />
      <View style={{ flex: 1, justifyContent: 'center', gap: 18, paddingHorizontal: 28, paddingTop: insets.top }}>
        <Image source={require('../../assets/logo-stacked.png')} accessibilityLabel="tskr" style={{ height: 124, width: 124 * 0.83 }} resizeMode="contain" />
        <T w="extrabold" style={{ fontSize: 32, lineHeight: 38, color: colors.white }}>
          {h.a}{'\n'}<T w="extrabold" style={{ fontSize: 32, color: colors.green }}>{h.b}</T>
        </T>
        <T style={{ fontSize: 15, lineHeight: 24, color: colors.heroSub }}>{h.sub}</T>
      </View>

      <View style={[st.sheet, { paddingBottom: 30 + insets.bottom }]}>
        <T w="extrabold" style={{ fontSize: 15 }}>How will you use TSKR?</T>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <RoleCard on={role === 'client'} onPress={() => pick('client')} title="Book a service" sub="Find a trusted tasker near you"
            icon={(c) => <HomeIcon color={c} />} />
          <RoleCard on={role === 'tasker'} onPress={() => pick('tasker')} title="I want to earn" sub="Offer my skills as a tasker"
            icon={(c) => <WrenchIcon color={c} />} />
        </View>

        {/* Guide §2.3: stays disabled until both documents are accepted (tapping it explains why) */}
        <Pressable onPress={google} accessibilityRole="button" accessibilityState={{ disabled: !agree }}
          style={[st.google, { opacity: busy ? 0.6 : agree ? 1 : 0.5 }]}>
          <View style={st.g}><T w="extrabold" style={{ fontSize: 15 }}>G</T></View>
          <T w="bold" style={{ fontSize: 16 }}>Continue with Google</T>
        </Pressable>

        <Pressable onPress={toggleAgree} accessibilityRole="checkbox" accessibilityState={{ checked: agree }}
          style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 2 }}>
          <View style={[st.box, { borderColor: agreeErr ? colors.error : colors.teal, backgroundColor: agree ? colors.teal : colors.white }]}>
            {agree && <CheckIcon />}
          </View>
          <T style={{ flex: 1, fontSize: 12, lineHeight: 18, color: colors.muted }}>
            I have read and agree to TSKR’s <T w="bold" style={st.u}>{roleWord} Terms of Service</T> and{' '}
            <T w="bold" style={st.u}>{roleWord} Privacy Policy</T>.
          </T>
        </Pressable>
        <T style={{ fontSize: 11, lineHeight: 15, color: colors.muted, marginTop: -4 }}>
          {agree ? 'You read and accepted both documents.' : 'Tap the box to read both documents. You can agree after scrolling to the end of each.'}
        </T>
        {agreeErr && <ErrorText>Please agree to the Terms and Privacy Policy to continue.</ErrorText>}
        <ErrorText>{err}</ErrorText>
      </View>

      <PolicyReader
        visible={!!reading}
        doc={docs ? (reading === 'privacy' ? docs.privacy : docs.terms) : null}
        step={reading === 'privacy' ? 2 : 1}
        onAgree={agreeDoc}
        onClose={() => setReading(null)}
      />
    </View>
  );
}

function RoleCard({ on, onPress, title, sub, icon }: {
  on: boolean; onPress: () => void; title: string; sub: string; icon: (color: string) => React.ReactNode;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }}
      style={[st.card, { borderColor: on ? colors.teal : colors.borderSoft, backgroundColor: on ? colors.tint : colors.white }]}>
      <View style={[st.cardIcon, { backgroundColor: on ? colors.teal : colors.tint }]}>{icon(on ? colors.green : colors.teal)}</View>
      <T w="extrabold" style={{ fontSize: 15 }}>{title}</T>
      <T style={{ fontSize: 12, lineHeight: 17, color: colors.muted }}>{sub}</T>
    </Pressable>
  );
}

const st = StyleSheet.create({
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 24, paddingHorizontal: 24, gap: 12 },
  card: { flex: 1, alignItems: 'flex-start', gap: 6, padding: 14, borderWidth: 2, ...bubble(20, 6) },
  cardIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', ...bubble(14, 4) },
  google: { height: 56, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, ...bubble(18, 6) },
  g: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  box: { width: 22, height: 22, marginTop: 1, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  u: { fontSize: 12, textDecorationLine: 'underline', color: colors.teal },
});
