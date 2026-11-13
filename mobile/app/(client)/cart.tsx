import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bubble, colors } from '../../src/theme';
import { T } from '../../src/components/ui';
import { Backdrop, PressScale, Rise } from '../../src/components/glass';
import { Ic, MiniAvatar, P, RoundButton } from '../../src/components/clientUi';
import { peso, useClient } from '../../src/lib/client';

/**
 * Review booking (first version): what's picked and the starting total.
 * Address, date and time, and sending the request to the tasker are client part 2.
 */
export default function Cart() {
  const insets = useSafeAreaInsets();
  const { cart, addToCart, subtotal, cartCount } = useClient();
  const t = cart.tasker;
  const lines = Object.values(cart.lines);
  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: 60, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <RoundButton d={P.back} label="Back" onPress={() => router.back()} />
          <T w="extrabold" style={{ fontSize: 22 }}>Review booking</T>
        </View>
        {!t ? (
          <T style={{ color: colors.muted, fontSize: 14 }}>Nothing picked yet.</T>
        ) : (
          <>
            <Rise i={0} style={[st.card, { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }]}>
              <MiniAvatar initials={t.initials} color={t.color} size={44} r={14} />
              <View style={{ flex: 1 }}>
                <T w="extrabold" style={{ fontSize: 16 }}>{t.name}</T>
                <T style={{ fontSize: 13, color: colors.muted }}>{cartCount} service{cartCount > 1 ? 's' : ''} · Free booking fee</T>
              </View>
            </Rise>
            <Rise i={1} style={st.card}>
              {lines.map((l, i) => (
                <View key={l.id} style={[st.line, i > 0 && { borderTopWidth: 1, borderTopColor: 'rgba(4,77,94,0.08)' }]}>
                  <View style={{ flex: 1 }}>
                    <T w="bold" style={{ fontSize: 15 }}>{l.name}</T>
                    <T style={{ fontSize: 13, color: colors.muted }}>Starts at {peso(l.price)}</T>
                  </View>
                  <PressScale accessibilityLabel="Remove one" onPress={() => addToCart(t, l, -1)} style={st.qBtn}><Ic d={P.minus} w={2.4} /></PressScale>
                  <T w="extrabold" style={{ minWidth: 20, textAlign: 'center' }}>{l.qty}</T>
                  <PressScale accessibilityLabel="Add one" onPress={() => addToCart(t, l, 1)} style={st.qBtn}><Ic d={P.plus} w={2.4} /></PressScale>
                </View>
              ))}
            </Rise>
            <Rise i={2} style={[st.card, { padding: 16, gap: 6 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T w="bold" style={{ fontSize: 15 }}>Starting total</T>
                <T w="extrabold" style={{ fontSize: 17 }}>{peso(subtotal)}</T>
              </View>
              <T style={{ fontSize: 13, color: colors.muted, lineHeight: 19 }}>
                The tasker confirms the final price before starting. You pay them directly. TSKR charges no booking fee.
              </T>
            </Rise>
            <Rise i={3} style={[st.card, { padding: 16, backgroundColor: colors.warnBg }]}>
              <T w="bold" style={{ fontSize: 14, color: colors.warnText, lineHeight: 20 }}>
                Test build: choosing the address and time and sending the request to the tasker come next.
              </T>
            </Rise>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  card: { ...bubble(22, 6), backgroundColor: 'rgba(255,255,255,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)', overflow: 'hidden' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 },
  qBtn: { width: 36, height: 36, borderRadius: 12, borderWidth: 1.5, borderColor: colors.teal, alignItems: 'center', justifyContent: 'center' },
});
