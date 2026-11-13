import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { T } from './ui';
import { PressScale } from './glass';
import { Ic, P } from './clientUi';
import { SavedAddress, addrLine, addrName } from '../lib/places';

/** Design SHEETS › addrPick: choose where the tasker should go, or add a new address. */
export function AddressSheet({ open, onClose, addresses, selectedId, onPick, note, title = 'Choose an address', exclude }: {
  open: boolean; onClose: () => void; addresses: SavedAddress[]; selectedId?: string | null;
  onPick: (a: SavedAddress) => void; note?: string; title?: string; exclude?: string | null;
}) {
  const insets = useSafeAreaInsets();
  const list = addresses.filter((a) => a.id !== exclude);
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={st.dim} onPress={onClose} accessibilityLabel="Close" />
      <View style={[st.sheet, { paddingBottom: 18 + insets.bottom }]}>
        <View style={st.grab} />
        <T w="extrabold" style={{ fontSize: 20 }}>{title}</T>
        <T style={{ fontSize: 13, color: colors.muted, lineHeight: 19 }}>
          {note ?? 'Taskers near this address can take your booking. Nearest first.'}
        </T>
        <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8 }}>
          {list.length === 0 && <T style={{ fontSize: 14, color: colors.muted, paddingVertical: 10 }}>No saved addresses yet.</T>}
          {list.map((a) => {
            const on = a.id === selectedId;
            return (
              <PressScale key={a.id} accessibilityRole="radio" accessibilityState={{ selected: on }}
                onPress={() => { onPick(a); onClose(); }} style={[st.row, on && st.rowOn]}>
                <View style={[st.radio, on && st.radioOn]}>{on && <View style={st.radioDot} />}</View>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <T w="bold" style={{ fontSize: 15 }}>{addrName(a)}</T>
                    {a.is_default && <View style={st.def}><T w="extrabold" style={{ fontSize: 10, letterSpacing: 0.4 }}>DEFAULT</T></View>}
                  </View>
                  <T style={{ fontSize: 13, color: colors.muted }} numberOfLines={2}>{addrLine(a)}</T>
                </View>
              </PressScale>
            );
          })}
        </ScrollView>
        <PressScale onPress={() => { onClose(); router.push('/address-form'); }} style={st.add}>
          <Ic d={P.plus} size={18} w={2.4} />
          <T w="bold" style={{ fontSize: 15 }}>Add a new address</T>
        </PressScale>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(4,30,38,0.45)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#FFF', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 10, gap: 12,
  },
  grab: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: '#D0D5DD', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1.5, borderColor: colors.borderSoft },
  rowOn: { borderColor: colors.teal, backgroundColor: colors.tint },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#98A2B3', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.teal },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.teal },
  def: { backgroundColor: '#E9F8E6', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 6 },
  add: {
    height: 52, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.teal,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
});
