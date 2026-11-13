import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { colors } from '../theme';
import { ErrorText, T } from './ui';
import { GlossyButton } from './glass';
import { Ic, P, Sheet } from './clientUi';
import { rpc } from '../lib/supabase';

export type Plan = { plan: 'free' | 'plus'; plus_until: string | null; price: number; max_active: number; demo: boolean; today_count: number };

/** Loads my_plan() and refreshes it whenever the screen comes back into view. */
export function usePlan() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const reload = useCallback(async () => { try { setPlan(await rpc<Plan>('my_plan')); } catch { /* signed out */ } }, []);
  useFocusEffect(useCallback(() => { reload(); }, []));
  return { plan, reload };
}

/** Design: SHEETS › plus — free vs Plus, and the upgrade. Billing is demo until PayMongo/Xendit is connected. */
export function PlusSheet({ open, onClose, plan, why, onUpgraded }: {
  open: boolean; onClose: () => void; plan: Plan | null; why?: 'schedule' | 'limit' | null; onUpgraded: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const rows: [string, string, string][] = [
    ['Bookings', '1 per day', `Up to ${plan?.max_active ?? 5} at once`],
    ['Schedule for later', '—', 'Yes'],
    ['Book now (ASAP)', 'Yes', 'Yes'],
    ['Priority rematch', '—', 'Yes'],
  ];
  const upgrade = async () => {
    setBusy(true); setErr('');
    try { await rpc('demo_upgrade_plus'); onClose(); onUpgraded(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="TSKR Plus">
      <T style={{ fontSize: 14, color: colors.body, lineHeight: 21 }}>
        {why === 'limit' ? 'You’ve used today’s free booking. ' : why === 'schedule' ? 'Scheduling for later is a Plus feature. ' : ''}
        Plus is ₱{plan?.price ?? 149}/month. Still zero booking fee.
      </T>
      <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.borderSoft, overflow: 'hidden' }}>
        {[['', 'FREE', 'PLUS'] as [string, string, string], ...rows].map(([k, f, p], i) => (
          <View key={i} style={{ flexDirection: 'row', borderTopWidth: i ? 1 : 0, borderTopColor: colors.divider, backgroundColor: i === 0 ? colors.bg : '#FFF' }}>
            <T w="semibold" style={{ flex: 1.4, padding: 10, fontSize: 13 }}>{k}</T>
            <T w="extrabold" style={{ flex: 1, padding: 10, fontSize: 12, textAlign: 'center' }}>{f}</T>
            <T w="extrabold" style={{ flex: 1.2, padding: 10, fontSize: 12, textAlign: 'center', backgroundColor: '#E9F8E6' }}>{p}</T>
          </View>
        ))}
      </View>
      {plan?.plan === 'plus' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ic d={P.check} color="#2E7D32" w={2.6} />
          <T w="bold" style={{ fontSize: 14 }}>You have Plus until {plan.plus_until ? new Date(plan.plus_until).toLocaleDateString('en-PH', { month: 'long', day: 'numeric' }) : '—'}.</T>
        </View>
      ) : (
        <>
          {plan?.demo && (
            <View style={{ borderRadius: 12, padding: 10, backgroundColor: colors.warnBg }}>
              <T w="semibold" style={{ fontSize: 12, color: colors.warnText }}>TEST BUILD: no payment is taken. Plus turns on free for 30 days.</T>
            </View>
          )}
          <ErrorText>{err}</ErrorText>
          <GlossyButton label={plan?.demo ? 'Start TSKR Plus (test, free)' : `Upgrade · ₱${plan?.price ?? 149}/month`} onPress={upgrade} loading={busy} />
        </>
      )}
    </Sheet>
  );
}
