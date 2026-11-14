import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { colors } from '../theme';
import { T } from './ui';
import { GlossyButton, PressScale } from './glass';
import { Chip, Sheet, glassCard } from './clientUi';
import { rpc, supabase } from '../lib/supabase';

export type Pack = { price: number; bonus: number; tag?: string };
const DEFAULT_PACKS: Pack[] = [
  { price: 500, bonus: 0 }, { price: 1000, bonus: 50, tag: 'Popular' }, { price: 2000, bonus: 200 }, { price: 5000, bonus: 750, tag: 'Best value' },
];
const n = (v: number) => v.toLocaleString('en-PH');

/** Design (Nov 14): "Choose a coin pack" — bigger packs come with bonus coins. */
export function CoinPackSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (balance: number) => void }) {
  const [packs, setPacks] = useState<Pack[]>(DEFAULT_PACKS);
  const [sel, setSel] = useState(1);
  const [method, setMethod] = useState('gcash');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setErr('');
    supabase.from('app_config').select('value').eq('key', 'coin_packs').maybeSingle()
      .then(({ data }) => { if (Array.isArray(data?.value) && data!.value.length) setPacks(data!.value as Pack[]); });
  }, [open]);

  const p = packs[Math.min(sel, packs.length - 1)];
  const pay = async () => {
    setBusy(true); setErr('');
    try { const bal = await rpc<number>('buy_coin_pack_demo', { p_method: method, p_price: p.price }); onDone(bal); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Choose a coin pack">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {packs.map((k, i) => {
          const on = i === sel;
          return (
            <PressScale key={k.price} outer={{ width: '47.5%' }} onPress={() => setSel(i)} accessibilityRole="radio" accessibilityState={{ selected: on }}
              style={[glassCard, { padding: 14, gap: 2, borderWidth: on ? 2 : 1, borderColor: on ? colors.teal : 'rgba(4,77,94,0.12)', backgroundColor: on ? colors.tint : '#FFF' }]}>
              {k.tag ? (
                <View style={{ alignSelf: 'flex-start', backgroundColor: colors.green, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, marginBottom: 4 }}>
                  <T w="extrabold" style={{ fontSize: 10, letterSpacing: 0.4 }}>{k.tag.toUpperCase()}</T>
                </View>
              ) : <View style={{ height: 19 }} />}
              <T w="extrabold" style={{ fontSize: 18 }}>{n(k.price + k.bonus)} coins</T>
              <T w="extrabold" style={{ fontSize: 12, color: k.bonus ? '#2E7D32' : '#98A2B3' }}>{k.bonus ? `+${n(k.bonus)} bonus` : 'No bonus'}</T>
              <T w="bold" style={{ fontSize: 15, marginTop: 4 }}>₱{n(k.price)}</T>
            </PressScale>
          );
        })}
      </View>
      <T w="semibold" style={{ fontSize: 13 }}>Pay with</T>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[['gcash', 'GCash'], ['maya', 'Maya'], ['card', 'Card']].map(([k, l]) => <Chip key={k} label={l} on={method === k} onPress={() => setMethod(k)} />)}
      </View>
      <T style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>Coins are for fees inside TSKR only. They can’t be cashed out, transferred or refunded.</T>
      <View style={{ borderRadius: 12, padding: 10, backgroundColor: colors.warnBg }}>
        <T w="semibold" style={{ fontSize: 12, color: colors.warnText }}>TEST BUILD: no real payment is taken. Coins are added right away.</T>
      </View>
      {!!err && <T style={{ fontSize: 13, color: colors.error }}>{err}</T>}
      <GlossyButton label={`Pay ₱${n(p.price)}`} onPress={pay} loading={busy} />
    </Sheet>
  );
}
