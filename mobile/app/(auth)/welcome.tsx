import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { BlurView } from 'expo-blur';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bubble, colors } from '../../src/theme';
import { T, ErrorText } from '../../src/components/ui';
import { CheckIcon, HomeIcon, WrenchIcon } from '../../src/components/icons';
import { PolicyReader } from '../../src/components/PolicyReader';
import { Logo } from '../../src/components/Logo';
import { EASE, GlassView, PressScale } from '../../src/components/glass';
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
  const sheetIn = useRef(new Animated.Value(0)).current;

  useEffect(() => { Animated.timing(sheetIn, { toValue: 1, duration: 480, easing: EASE, useNativeDriver: true }).start(); }, []);
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
        <Logo height={124} />
        <T w="extrabold" style={{ fontSize: 32, lineHeight: 38, color: colors.white }}>
          {h.a}{'\n'}<T w="extrabold" style={{ fontSize: 32, color: colors.green }}>{h.b}</T>
        </T>
        <T style={{ fontSize: 15, lineHeight: 24, color: colors.heroSub }}>{h.sub}</T>
      </View>

      {/* frosted sheet that slides up (design: tskr-sheet) */}
      <Animated.View style={[st.sheet, { transform: [{ translateY: sheetIn.interpolate({ inputRange: [0, 1], outputRange: [500, 0] }) }] }]}>
        <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.62)' }]} />
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
          <Defs>
            <LinearGradient id="sheetGloss" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.9" />
              <Stop offset="0.3" stopColor="#FFFFFF" stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#sheetGloss)" />
        </Svg>
        <View style={{ paddingTop: 24, paddingHorizontal: 24, paddingBottom: 30 + insets.bottom, gap: 12 }}>
          <T w="extrabold" style={{ fontSize: 15 }}>How will you use TSKR?</T>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <RoleCard on={role === 'client'} onPress={() => pick('client')} title="Book a service" sub="Find a trusted tasker near you"
              icon={(c) => <HomeIcon color={c} />} />
            <RoleCard on={role === 'tasker'} onPress={() => pick('tasker')} title="I want to earn" sub="Offer my skills as a tasker"
              icon={(c) => <WrenchIcon color={c} />} />
          </View>

          {/* Guide §2.3: works only after both documents are accepted (tapping it explains why) */}
          <PressScale onPress={google} accessibilityState={{ disabled: !agree }} style={{ opacity: busy ? 0.6 : agree ? 1 : 0.5 }}>
            <GlassView radius={[18, 6]} style={st.google}>
              <View style={st.g}><T w="extrabold" style={{ fontSize: 15 }}>G</T></View>
              <T w="bold" style={{ fontSize: 16 }}>Continue with Google</T>
            </GlassView>
          </PressScale>

          <Pressable onPress={toggleAgree} accessibilityRole="checkbox" accessibilityState={{ checked: agree }}
            style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 2 }}>
            <View style={[st.box, { borderColor: agreeErr ? colors.error : colors.teal, backgroundColor: agree ? colors.teal : 'rgba(255,255,255,0.7)' }]}>
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
      </Animated.View>

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
  const body = (
    <>
      <View style={[st.cardIcon, { backgroundColor: on ? colors.teal : colors.tint }]}>{icon(on ? colors.green : colors.teal)}</View>
      <T w="extrabold" style={{ fontSize: 15 }}>{title}</T>
      <T style={{ fontSize: 12, lineHeight: 17, color: colors.muted }}>{sub}</T>
    </>
  );
  return (
    <View style={{ flex: 1 }}>
      <PressScale onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }}>
        {on ? (
          <View style={[st.card, { borderColor: colors.teal, backgroundColor: colors.tint }]}>{body}</View>
        ) : (
          <GlassView radius={[20, 6]} style={st.cardGlass}>{body}</GlassView>
        )}
      </PressScale>
    </View>
  );
}

const st = StyleSheet.create({
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  card: { alignItems: 'flex-start', gap: 6, padding: 14, borderWidth: 2, ...bubble(20, 6) },
  cardGlass: { alignItems: 'flex-start', gap: 6, padding: 16 },
  cardIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', ...bubble(14, 4) },
  google: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  g: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  box: { width: 22, height: 22, marginTop: 1, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  u: { fontSize: 12, textDecorationLine: 'underline', color: colors.teal },
});
