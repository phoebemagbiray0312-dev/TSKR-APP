import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font } from '../../src/theme';
import { ErrorText, T } from '../../src/components/ui';
import { Backdrop, GlossyButton, PressScale } from '../../src/components/glass';
import { Chip, SubHeader, glassCard } from '../../src/components/clientUi';
import { rpc } from '../../src/lib/supabase';

// design/client: issueList, faqList
const ISSUES: [string, string][] = [['quality', 'Work not done right'], ['price', 'Price dispute'], ['damage', 'Damage to property'], ['noshow', 'Tasker didn’t show up'], ['safety', 'Safety concern']];
const FAQ: [string, string][] = [
  ['How do I pay my tasker?', 'You pay your tasker directly, in cash or by scanning their payment QR, which shows after you accept their offer. TSKR doesn’t hold your money.'],
  ['Can the price change?', 'The offer is an initial price. Your tasker confirms the final price on site, and the job only starts when you accept it.'],
  ['What if I need to cancel?', 'Cancelling is free before your tasker leaves. After they are on the way, you get 1 free cancellation per month. After that, you pay a ₱100 fee straight to that tasker’s payment QR before your next booking. It’s always free if your tasker is 15+ minutes past the ETA, can’t be reached, or asks to deal outside TSKR.'],
  ['Is my tasker verified?', 'Every tasker submits 2 government IDs and a face check before they can receive bookings.'],
];
type B = { id: string; code: string; service: string };

/** Design: HELP CENTER — report a problem with a booking, and common questions. */
export default function Help() {
  const insets = useSafeAreaInsets();
  const [bookings, setBookings] = useState<B[]>([]);
  const [bk, setBk] = useState<string | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [sent, setSent] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(-1);

  useFocusEffect(useCallback(() => {
    rpc<B[]>('my_bookings').then((r) => { setBookings(r); setBk((cur) => cur ?? r[0]?.id ?? null); }).catch(() => {});
  }, []));

  const send = async () => {
    setErr('');
    if (!bk) { setErr('Pick the booking.'); return; }
    if (!issue) { setErr('Pick what happened.'); return; }
    if (text.trim().length < 10) { setErr('Tell us a bit more (at least 10 characters).'); return; }
    setBusy(true);
    try {
      const no = await rpc<string>('report_booking_problem', { p_booking: bk, p_issues: [issue], p_body: text.trim() });
      setSent(no); setIssue(null); setText('');
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <SubHeader title="Help center" />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 + insets.bottom }}>
        {!!sent && (
          <View style={[glassCard, { padding: 14, backgroundColor: '#E9F8E6' }]}>
            <T style={{ fontSize: 14, lineHeight: 20 }}><T w="bold" style={{ fontSize: 14 }}>Report received · {sent}.</T> Our team will reply in the app within 24 hours.</T>
          </View>
        )}
        <View style={[glassCard, { padding: 16, gap: 10 }]}>
          <T w="extrabold" style={{ fontSize: 17 }}>Report a problem with a booking</T>
          {bookings.length === 0 ? (
            <T style={{ fontSize: 13, color: colors.muted }}>You don’t have bookings yet.</T>
          ) : (
            <>
              <T w="semibold" style={st.label}>Booking</T>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {bookings.slice(0, 10).map((b) => <Chip key={b.id} label={`${b.code} · ${b.service}`} on={bk === b.id} onPress={() => setBk(b.id)} />)}
              </ScrollView>
              <T w="semibold" style={st.label}>What happened?</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {ISSUES.map(([k, l]) => <Chip key={k} label={l} on={issue === k} onPress={() => { setIssue(k); setErr(''); }} />)}
              </View>
              <T w="semibold" style={st.label}>Tell us more</T>
              <TextInput value={text} onChangeText={(v) => { setText(v); setErr(''); }} multiline placeholder="Describe what went wrong…"
                placeholderTextColor="#98A2B3" accessibilityLabel="Tell us more" style={st.textarea} />
              <ErrorText>{err}</ErrorText>
              <GlossyButton label="Send report" onPress={send} loading={busy} />
            </>
          )}
        </View>

        <T w="extrabold" style={{ fontSize: 12, letterSpacing: 0.8, color: colors.muted, marginTop: 4 }}>COMMON QUESTIONS</T>
        <View style={[glassCard, { overflow: 'hidden' }]}>
          {FAQ.map(([q, a], i) => (
            <PressScale key={q} onPress={() => setOpen(open === i ? -1 : i)}
              style={[{ padding: 16, gap: 6 }, i > 0 && { borderTopWidth: 1, borderTopColor: 'rgba(4,77,94,0.08)' }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                <T w="bold" style={{ fontSize: 15, flex: 1 }}>{q}</T>
                <T w="extrabold" style={{ fontSize: 18 }}>{open === i ? '−' : '+'}</T>
              </View>
              {open === i && <T style={{ fontSize: 14, color: colors.body, lineHeight: 21 }}>{a}</T>}
            </PressScale>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  label: { fontSize: 13, marginTop: 4 },
  textarea: {
    minHeight: 96, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, padding: 12, fontFamily: font.medium,
    fontSize: 14, color: colors.teal, backgroundColor: '#FFF', textAlignVertical: 'top',
  },
});
