import React, { useCallback, useState } from 'react';
import { Image, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { colors, font } from '../../../src/theme';
import { ErrorText, T } from '../../../src/components/ui';
import { Backdrop, GlossyButton, PressScale, Rise } from '../../../src/components/glass';
import { Chip, Ic, P, Toast, glassCard } from '../../../src/components/clientUi';
import { useClient } from '../../../src/lib/client';
import { TaskerHome, loadTaskerHome, uploadImage } from '../../../src/lib/tasker';
import { rpc, supabase } from '../../../src/lib/supabase';

type TP = { nickname: string | null; bio: string | null; photo_path: string | null; qr_wallet_type: string | null; qr_account_name: string | null; qr_status: string; payment_qr_path: string | null };

/** Design: tasker ME — switch mode, my office, payment QR, account. */
export default function Me() {
  const insets = useSafeAreaInsets();
  const { toast, showToast } = useClient();
  const [h, setH] = useState<TaskerHome | null>(null);
  const [tp, setTp] = useState<TP | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [wallet, setWallet] = useState('gcash');
  const [acct, setAcct] = useState('');
  const [qrUri, setQrUri] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const home = await loadTaskerHome(); setH(home);
    const { data: u } = await supabase.auth.getUser();
    const { data } = await supabase.from('tasker_profiles').select('nickname,bio,photo_path,qr_wallet_type,qr_account_name,qr_status,payment_qr_path').eq('user_id', u.user!.id).maybeSingle();
    const t = data as TP | null; setTp(t);
    setAcct((a) => a || t?.qr_account_name || home.full_name);
    if (t?.qr_wallet_type) setWallet(t.qr_wallet_type);
    if (t?.photo_path) { const s = await supabase.storage.from('tasker-media').createSignedUrl(t.photo_path, 3600); setPhotoUrl(s.data?.signedUrl ?? null); }
  }, []);
  useFocusEffect(useCallback(() => { load().catch((e) => showToast(e.message)); }, []));

  const pickQr = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!r.canceled) setQrUri(r.assets[0].uri);
  };
  const saveQr = async () => {
    setErr('');
    if (!qrUri) { setErr('Choose your QR image first.'); return; }
    if (!acct.trim()) { setErr('Enter the account name on the QR.'); return; }
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const path = await uploadImage('tasker-media', u.user!.id, qrUri, 'payment-qr');
      const st = await rpc<string>('set_payment_qr', { p_path: path, p_wallet: wallet, p_account_name: acct.trim() });
      setQrUri(null);
      showToast(st === 'approved' ? 'Payment QR saved' : 'Saved. The name doesn’t match your ID, so our team will review it.');
      load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const qrTag = tp?.qr_status === 'approved' ? 'APPROVED' : tp?.qr_status === 'pending' ? 'UNDER REVIEW' : tp?.qr_status === 'rejected' ? 'REJECTED' : 'MISSING';

  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 20, paddingHorizontal: 16, paddingBottom: 130, gap: 14 }}>
        <T w="extrabold" style={{ fontSize: 26 }}>Me</T>

        <Rise i={0} style={[glassCard, { padding: 16, gap: 10 }]}>
          <T w="semibold" style={{ fontSize: 13, color: colors.muted }}>How do you want to use TSKR now?</T>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PressScale outer={{ flex: 1 }} onPress={() => router.replace('/home')} style={st.mode}>
              <T w="extrabold" style={{ fontSize: 15 }}>Client</T><T style={{ fontSize: 12, color: colors.muted }}>Book services</T><T w="bold" style={{ fontSize: 12 }}>Switch →</T>
            </PressScale>
            <View style={[st.mode, { flex: 1, borderColor: colors.teal, borderWidth: 2, backgroundColor: colors.tint }]}>
              <T w="extrabold" style={{ fontSize: 15 }}>Tasker</T><T style={{ fontSize: 12, color: colors.muted }}>Get job requests</T><T w="bold" style={{ fontSize: 12, color: '#2E7D32' }}>✓ You’re here</T>
            </View>
          </View>
          <T style={{ fontSize: 12, color: colors.muted }}>Switch anytime. You can’t book your own tasker profile.</T>
        </Rise>

        <Rise i={1} style={[glassCard, { padding: 16, gap: 10 }]}>
          <View style={st.rowB}><T w="extrabold" style={{ fontSize: 17 }}>My office</T><T style={{ fontSize: 12, color: colors.muted }}>Your face shows only after a booking</T></View>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <View style={st.avatar}>{photoUrl ? <Image source={{ uri: photoUrl }} style={StyleSheet.absoluteFill} /> : <Ic d={P.navUser} size={28} color={colors.muted} />}</View>
            <View style={{ flex: 1 }}>
              <T w="extrabold" style={{ fontSize: 16 }}>{tp?.nickname ?? h?.short_name}</T>
              <T style={{ fontSize: 13, color: colors.muted }}>{h?.full_name} · {h?.area_label ?? 'No service area yet'}</T>
            </View>
          </View>
          {!!tp?.bio && <T style={{ fontSize: 14, color: colors.body, lineHeight: 21 }}>{tp.bio}</T>}
        </Rise>

        <Rise i={2} style={[glassCard, { padding: 16, gap: 10 }]}>
          <View style={st.rowB}>
            <T w="extrabold" style={{ fontSize: 17 }}>Payment QR</T>
            <View style={[st.tag, { backgroundColor: tp?.qr_status === 'approved' ? '#E9F8E6' : colors.warnBg }]}><T w="extrabold" style={{ fontSize: 10 }}>{qrTag}</T></View>
          </View>
          <T style={{ fontSize: 13, color: colors.body, lineHeight: 19 }}>Clients see it only after they accept your offer. They use it to pay you and for the ₱100 late-cancellation fee. TSKR doesn’t hold this money.</T>
          <T w="semibold" style={{ fontSize: 13 }}>QR from</T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[['gcash', 'GCash'], ['maya', 'Maya'], ['bank', 'Bank']].map(([k, l]) => <Chip key={k} label={l} on={wallet === k} onPress={() => setWallet(k)} />)}
          </View>
          <T w="semibold" style={{ fontSize: 13 }}>Account name on the QR (must match your ID: {h?.full_name})</T>
          <TextInput value={acct} onChangeText={setAcct} placeholder="Account name" placeholderTextColor="#98A2B3" accessibilityLabel="Account name" style={st.input} />
          <PressScale onPress={pickQr} style={st.pick}>
            {qrUri ? <Image source={{ uri: qrUri }} style={{ width: 120, height: 120, borderRadius: 10 }} /> : <T w="bold" style={{ fontSize: 14 }}>{tp?.payment_qr_path ? 'Replace QR image (gallery)' : 'Choose QR image from gallery'}</T>}
          </PressScale>
          <ErrorText>{err}</ErrorText>
          <GlossyButton label="Save payment QR" onPress={saveQr} loading={busy} disabled={!qrUri} />
        </Rise>

        <PressScale onPress={async () => { await supabase.auth.signOut(); router.replace('/(auth)/welcome'); }} style={[glassCard, { padding: 16 }]}>
          <T w="bold" style={{ fontSize: 15, color: colors.error }}>Sign out</T>
        </PressScale>
      </ScrollView>
      <Toast text={toast} top={insets.top + 10} />
    </View>
  );
}

const st = StyleSheet.create({
  rowB: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  mode: { padding: 12, borderRadius: 16, borderWidth: 1.5, borderColor: colors.borderSoft, backgroundColor: '#FFF', gap: 2 },
  avatar: { width: 64, height: 64, borderRadius: 32, overflow: 'hidden', backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  tag: { borderRadius: 6, paddingVertical: 3, paddingHorizontal: 7 },
  input: { height: 50, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 14, fontFamily: font.medium, fontSize: 15, color: colors.teal, backgroundColor: '#FFF' },
  pick: { minHeight: 56, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.teal, alignItems: 'center', justifyContent: 'center', padding: 10 },
});
