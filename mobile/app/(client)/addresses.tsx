import React, { useCallback } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../src/theme';
import { T } from '../../src/components/ui';
import { Backdrop, PressScale, Rise } from '../../src/components/glass';
import { Ic, P, SubHeader, Toast, glassCard } from '../../src/components/clientUi';
import { useClient } from '../../src/lib/client';
import { addrLine, addrName } from '../../src/lib/places';

/** Design: SAVED ADDRESSES — tap one to use it; add new ones. */
export default function Addresses() {
  const insets = useSafeAreaInsets();
  const { addresses, selected, selectAddress, reloadAddresses, toast, showToast } = useClient();
  useFocusEffect(useCallback(() => { reloadAddresses(); }, []));

  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <SubHeader title="Saved addresses" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 + insets.bottom }}>
        <T style={{ fontSize: 13, color: colors.muted, lineHeight: 19 }}>
          An exact address helps taskers find you and matches you with taskers within their service radius.
        </T>
        {addresses.length === 0 && <T style={{ fontSize: 14, color: colors.muted, paddingVertical: 8 }}>No saved addresses yet.</T>}
        {addresses.map((a, i) => {
          const on = a.id === selected?.id;
          return (
            <Rise key={a.id} i={i}>
              <PressScale onPress={() => { selectAddress(a.id); showToast(`Using ${addrName(a)}`); }}
                style={[glassCard, { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14 }, on && { borderColor: colors.teal, borderWidth: 1.5 }]}>
                <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' }}>
                  <Ic d={a.label === 'work' ? 'M4 7h16v12H4zM9 7V5h6v2' : P.navHome} size={20} w={1.8} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <T w="bold" style={{ fontSize: 15 }}>{addrName(a)}</T>
                    {a.is_default && <View style={{ backgroundColor: '#E9F8E6', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 6 }}><T w="extrabold" style={{ fontSize: 10 }}>DEFAULT</T></View>}
                    {on && <View style={{ backgroundColor: colors.teal, borderRadius: 6, paddingVertical: 2, paddingHorizontal: 6 }}><T w="extrabold" style={{ fontSize: 10, color: '#FFF' }}>IN USE</T></View>}
                  </View>
                  <T style={{ fontSize: 13, color: colors.muted }}>{addrLine(a)}</T>
                  {!!a.landmark && <T style={{ fontSize: 12, color: colors.body }}>Note: {a.landmark}</T>}
                </View>
              </PressScale>
            </Rise>
          );
        })}
        <PressScale onPress={() => router.push('/address-form')}
          style={{ height: 52, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.teal, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Ic d={P.plus} size={18} w={2.4} /><T w="bold" style={{ fontSize: 15 }}>Add a new address</T>
        </PressScale>
      </ScrollView>
      <Toast text={toast} top={insets.top + 10} />
    </View>
  );
}
