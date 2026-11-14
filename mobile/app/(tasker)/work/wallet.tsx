import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../../src/theme';
import { T } from '../../../src/components/ui';
import { Backdrop, GlossyButton, PressScale } from '../../../src/components/glass';
import { Chip, HeaderFill, Sheet, Toast, glassCard } from '../../../src/components/clientUi';
import { useClient } from '../../../src/lib/client';
import { CoinPackSheet } from '../../../src/components/CoinPackSheet';
import { Alert } from 'react-native';
import { rpc, supabase } from '../../../src/lib/supabase';

type W = { balance: number; booking_fee: number; repeat_fee: number; delivery_fee: number; extra_skills: number; low: boolean; out: boolean };
type L = { id: number; amount: number; kind: string; note: string | null; created_at: string };

/** Design: tasker WALLET — coin balance, buy coins, history. */
export default function Wallet() {
  const insets = useSafeAreaInsets();
  const { toast, showToast } = useClient();
  const [w, setW] = useState<W | null>(null);
  const [hist, setHist] = useState<L[]>([]);
  const [buy, setBuy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try {
      setW(await rpc<W>('tasker_wallet'));
      const { data } = await supabase.from('coin_ledger').select('id,amount,kind,note,created_at').order('created_at', { ascending: false }).limit(50);
      setHist((data ?? []) as L[]);
    } catch (e: any) { showToast(e.message); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, []));

  const drain = () => Alert.alert('Use up coins?', 'Test build only: your balance goes to 0 and you go offline, so you can see the “out of coins” screens.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Use up coins', style: 'destructive', onPress: async () => { try { await rpc('demo_use_up_coins'); showToast('Coins used up (test)'); load(); } catch (e: any) { showToast(e.message); } } },
  ]);

  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        contentContainerStyle={{ paddingBottom: 130, gap: 14 }}>
        <View style={{ paddingTop: insets.top + 22, paddingHorizontal: 20, paddingBottom: 22, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden', gap: 6 }}>
          <HeaderFill />
          <T w="semibold" style={{ color: colors.heroSub, fontSize: 14 }}>Coin balance</T>
          <T w="extrabold" style={{ color: '#FFF', fontSize: 40 }}>{w ? w.balance.toLocaleString('en-PH') : '—'}</T>
          <T style={{ color: colors.heroSub, fontSize: 12, lineHeight: 18 }}>
            Booking fee {w?.booking_fee ?? 300} (repeat client {w?.repeat_fee ?? 100}) · Extra skill 100/week
          </T>
          <PressScale onPress={() => setBuy(true)} style={{ marginTop: 8, height: 46, borderRadius: 14, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}>
            <T w="extrabold" style={{ fontSize: 15 }}>Buy coins</T>
          </PressScale>
          {w?.out && <T w="semibold" style={{ color: '#FFF', fontSize: 13, marginTop: 4 }}>You can’t receive bookings until you buy coins. Bigger packs come with bonus coins.</T>}
        </View>
        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          <T w="extrabold" style={{ fontSize: 18 }}>History</T>
          <View style={[glassCard, { overflow: 'hidden' }]}>
            {hist.length === 0 && <T style={{ padding: 16, fontSize: 14, color: colors.muted }}>No coin activity yet.</T>}
            {hist.map((h, i) => (
              <View key={h.id} style={[{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 }, i > 0 && { borderTopWidth: 1, borderTopColor: 'rgba(4,77,94,0.08)' }]}>
                <View style={{ flex: 1 }}>
                  <T w="bold" style={{ fontSize: 14 }}>{h.note ?? h.kind.replace(/_/g, ' ')}</T>
                  <T style={{ fontSize: 12, color: colors.muted }}>{new Date(h.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</T>
                </View>
                <T w="extrabold" style={{ fontSize: 15, color: h.amount > 0 ? '#2E7D32' : colors.error }}>{h.amount > 0 ? '+' : ''}{h.amount.toLocaleString('en-PH')}</T>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 104, alignItems: 'center' }} pointerEvents="box-none">
        {!!w && w.balance > 0 && <PressScale onPress={drain} style={{ padding: 8 }}><T w="bold" style={{ fontSize: 12, color: colors.muted }}>Use up coins (demo)</T></PressScale>}
      </View>
      <CoinPackSheet open={buy} onClose={() => setBuy(false)} onDone={(bal) => { setBuy(false); showToast(`Paid. Balance: ${bal.toLocaleString('en-PH')} coins`); load(); }} />
      <Toast text={toast} top={insets.top + 10} />
    </View>
  );
}
