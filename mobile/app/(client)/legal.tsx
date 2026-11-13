import React, { useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, Share, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../src/theme';
import { T } from '../../src/components/ui';
import { Backdrop, PressScale } from '../../src/components/glass';
import { Ic, P, RoundButton, SubHeader, Toast, glassCard } from '../../src/components/clientUi';
import { useClient } from '../../src/lib/client';
import { rpc, supabase } from '../../src/lib/supabase';

type Doc = { id: string; doc_type: string; role: string; version: string; title: string; sections: { h: string; p: string }[] };
type Consent = { id: string; consent_type: string; version: string; accepted_at: string };
const NAME: Record<string, string> = { terms: 'Terms of Service', privacy: 'Privacy Policy', id_consent: 'ID and face-check consent' };

/** Design: LEGAL AND PRIVACY — read current documents and see what you agreed to. */
export default function Legal() {
  const insets = useSafeAreaInsets();
  const { toast, showToast } = useClient();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [consents, setConsents] = useState<Consent[]>([]);
  const [open, setOpen] = useState<Doc | null>(null);

  useEffect(() => {
    supabase.from('policy_documents').select('*').eq('is_current', true).order('role').then(({ data }) => setDocs((data ?? []) as Doc[]));
    supabase.from('consents').select('id,consent_type,version,accepted_at').order('accepted_at', { ascending: false }).then(({ data }) => setConsents((data ?? []) as Consent[]));
  }, []);

  const download = async () => {
    try {
      const data = await rpc<object>('export_my_data');
      await Share.share({ title: 'My TSKR data', message: JSON.stringify(data, null, 2) });
    } catch (e: any) { showToast(e.message); }
  };
  const close = (mode: 'deactivated' | 'deleted') => Alert.alert(
    mode === 'deleted' ? 'Delete your account?' : 'Deactivate your account?',
    mode === 'deleted'
      ? 'Your profile is removed and you’re signed out. Booking, payment, chat and report records are kept for 5 years as required by law.'
      : 'Your profile is hidden and you’re signed out. Sign in again anytime to reactivate.',
    [
      { text: 'Keep my account', style: 'cancel' },
      { text: mode === 'deleted' ? 'Delete' : 'Deactivate', style: 'destructive', onPress: async () => {
        try {
          await rpc('close_account', { p_mode: mode, p_reason: 'user_request' });
          await supabase.auth.signOut();
          router.replace('/(auth)/welcome');
        } catch (e: any) { showToast(e.message); }
      } },
    ]);
  const actions: [string, string, () => void][] = [
    ['Download a copy of my data', colors.teal, download],
    ['Deactivate account', colors.teal, () => close('deactivated')],
    ['Delete account', colors.error, () => close('deleted')],
  ];

  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <SubHeader title="Legal and privacy" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 + insets.bottom }}>
        <T w="extrabold" style={{ fontSize: 17 }}>Documents</T>
        <View style={[glassCard, { overflow: 'hidden' }]}>
          {docs.map((d, i) => (
            <PressScale key={d.id} onPress={() => setOpen(d)} style={[{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }, i > 0 && { borderTopWidth: 1, borderTopColor: 'rgba(4,77,94,0.08)' }]}>
              <View style={{ flex: 1 }}>
                <T w="bold" style={{ fontSize: 15 }}>{NAME[d.doc_type] ?? d.title} · {d.role === 'client' ? 'Client' : 'Tasker'}</T>
                <T style={{ fontSize: 12, color: colors.muted }}>Version {d.version}</T>
              </View>
              <Ic d={P.chevRight} size={18} color={colors.muted} />
            </PressScale>
          ))}
        </View>

        <T w="extrabold" style={{ fontSize: 17, marginTop: 6 }}>Your consents</T>
        <View style={[glassCard, { overflow: 'hidden' }]}>
          {consents.length === 0 && <T style={{ padding: 16, fontSize: 14, color: colors.muted }}>No consents recorded yet.</T>}
          {consents.map((c, i) => (
            <View key={c.id} style={[{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }, i > 0 && { borderTopWidth: 1, borderTopColor: 'rgba(4,77,94,0.08)' }]}>
              <View style={{ flex: 1 }}>
                <T w="bold" style={{ fontSize: 14 }}>{NAME[c.consent_type] ?? c.consent_type} v{c.version}</T>
                <T style={{ fontSize: 12, color: colors.muted }}>Agreed {new Date(c.accepted_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</T>
              </View>
              <View style={{ backgroundColor: '#E9F8E6', borderRadius: 6, paddingVertical: 3, paddingHorizontal: 7 }}><T w="extrabold" style={{ fontSize: 10 }}>ACTIVE</T></View>
            </View>
          ))}
        </View>
        <T style={{ fontSize: 12, color: colors.muted, lineHeight: 18 }}>The ID and face-check consent only applies to tasker accounts. Client accounts don’t need ID verification.</T>

        <T w="extrabold" style={{ fontSize: 17, marginTop: 6 }}>Your data</T>
        <View style={[glassCard, { overflow: 'hidden' }]}>
          {actions.map(([l, c, fn], i) => (
            <PressScale key={l} onPress={fn} style={[{ padding: 16 }, i > 0 && { borderTopWidth: 1, borderTopColor: 'rgba(4,77,94,0.08)' }]}>
              <T w="bold" style={{ fontSize: 15, color: c }}>{l}</T>
            </PressScale>
          ))}
        </View>
        <T style={{ fontSize: 12, color: colors.muted, lineHeight: 18 }}>Booking, payment, chat, report and verification records are kept for 5 years, even after you deactivate or delete your account. Questions? Contact our Data Protection Officer through the Help center.</T>
      </ScrollView>

      <Modal visible={!!open} animationType="slide" onRequestClose={() => setOpen(null)}>
        <View style={{ flex: 1, backgroundColor: '#FFF' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 10 }}>
            <RoundButton d="M6 6l12 12M18 6 6 18" label="Close" onPress={() => setOpen(null)} />
            <T w="extrabold" style={{ fontSize: 18, flex: 1 }} numberOfLines={2}>{open?.title}</T>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 + insets.bottom }}>
            <T style={{ fontSize: 12, color: colors.muted }}>Version {open?.version}</T>
            {open?.sections?.map((s, i) => (
              <View key={i} style={{ gap: 4 }}>
                <T w="bold" style={{ fontSize: 16 }}>{s.h}</T>
                <T style={{ fontSize: 14, color: colors.body, lineHeight: 22 }}>{s.p}</T>
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
      <Toast text={toast} top={insets.top + 10} />
    </View>
  );
}
