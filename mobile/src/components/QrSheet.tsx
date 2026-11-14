import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, TextInput, View } from 'react-native';
import { colors, font } from '../theme';
import { ErrorText, T } from './ui';
import { GlossyButton } from './glass';
import { Sheet } from './clientUi';
import { supabase } from '../lib/supabase';

export type TaskerQr = { path: string | null; wallet: string | null; account_name?: string | null } | null;
const WALLET: Record<string, string> = { gcash: 'GCash', maya: 'Maya', bank: 'bank' };

/**
 * Shows the tasker's payment QR to the client. TSKR never holds the money.
 * With onReference, also asks for the transaction reference (used for the cancellation fee).
 */
export function QrSheet({ open, onClose, title, first, amount, qr, note, onReference }: {
  open: boolean; onClose: () => void; title: string; first: string; amount: string; qr: TaskerQr; note?: string;
  onReference?: (ref: string) => Promise<void>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ref, setRef] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !qr?.path) return;
    setLoading(true);
    supabase.storage.from('tasker-media').createSignedUrl(qr.path, 600)
      .then(({ data }) => setUrl(data?.signedUrl ?? null)).finally(() => setLoading(false));
  }, [open, qr?.path]);

  const submit = async () => {
    setErr('');
    if (ref.trim().length < 4) { setErr('Enter the reference number from your GCash, Maya or bank receipt.'); return; }
    setBusy(true);
    try { await onReference!(ref.trim()); setRef(''); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const wallet = qr?.wallet ? WALLET[qr.wallet] ?? qr.wallet : 'e-wallet';
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <View style={st.amount}>
        <T w="semibold" style={{ fontSize: 13, color: colors.muted }}>Amount to pay {first}</T>
        <T w="extrabold" style={{ fontSize: 28 }}>{amount}</T>
      </View>
      {qr?.path ? (
        <View style={st.qrBox}>
          {url ? <Image source={{ uri: url }} style={st.qr} resizeMode="contain" accessibilityLabel={`${first}'s payment QR`} />
            : <View style={[st.qr, { alignItems: 'center', justifyContent: 'center' }]}>{loading ? <ActivityIndicator color={colors.teal} /> : <T style={{ color: colors.muted }}>QR not available</T>}</View>}
          <T w="bold" style={{ fontSize: 14 }}>{wallet} · {qr.account_name ?? first}</T>
          <T style={{ fontSize: 12, color: colors.muted, textAlign: 'center' }}>Screenshot this, then scan it from your {wallet} or bank app. Check that the name matches before you send.</T>
        </View>
      ) : (
        <View style={st.warn}><T style={{ fontSize: 13, color: colors.warnText, lineHeight: 19 }}>{first} hasn’t uploaded a payment QR yet. Pay in cash, or ask {first} in Chat.</T></View>
      )}
      {!!note && <T style={{ fontSize: 13, color: colors.body, lineHeight: 19 }}>{note}</T>}
      {onReference && (
        <>
          <T w="semibold" style={{ fontSize: 13 }}>Reference number</T>
          <TextInput value={ref} onChangeText={setRef} placeholder="e.g. 1012 345 678901" placeholderTextColor="#98A2B3" autoCapitalize="characters"
            accessibilityLabel="Reference number" style={st.input} />
          <ErrorText>{err}</ErrorText>
          <GlossyButton label="I’ve paid · send reference" loading={busy} onPress={submit} />
        </>
      )}
      <T style={{ fontSize: 12, color: colors.muted, textAlign: 'center' }}>TSKR doesn’t hold your money. You pay {first} directly.</T>
    </Sheet>
  );
}

const st = StyleSheet.create({
  amount: { alignItems: 'center', gap: 2, paddingVertical: 6 },
  qrBox: { alignItems: 'center', gap: 8, padding: 14, borderRadius: 20, borderWidth: 1.5, borderColor: colors.borderSoft, backgroundColor: '#FFF' },
  qr: { width: 240, height: 240, borderRadius: 12, backgroundColor: colors.tint },
  warn: { backgroundColor: colors.warnBg, borderRadius: 14, padding: 12 },
  input: { height: 50, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 14, fontFamily: font.medium, fontSize: 15, color: colors.teal, backgroundColor: '#FFF' },
});
