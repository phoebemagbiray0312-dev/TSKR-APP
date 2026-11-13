import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { bubble, colors } from '../../src/theme';
import { ErrorText, T } from '../../src/components/ui';
import { Backdrop, GlassInput, GlossyButton, PressScale, Rise } from '../../src/components/glass';
import { Chip, Ic, P, RoundButton } from '../../src/components/clientUi';
import { useClient } from '../../src/lib/client';
import { CITIES, findCity } from '../../src/lib/places';
import { rpc } from '../../src/lib/supabase';

const LABELS: [string, string][] = [['home', 'Home'], ['work', 'Work'], ['partner', 'Partner'], ['other', 'Other']];

/** Design: ADDRESS DETAILS (FORM). The map pin comes with Google Maps; for now the city sets the location. */
export default function AddressForm() {
  const insets = useSafeAreaInsets();
  const { reloadAddresses, selectAddress, showToast } = useClient();
  const [street, setStreet] = useState('');
  const [unit, setUnit] = useState('');
  const [brgy, setBrgy] = useState('');
  const [city, setCity] = useState('');
  const [note, setNote] = useState('');
  const [label, setLabel] = useState('home');
  const [other, setOther] = useState('');
  const [isDefault, setDefault] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setErr('');
    if (!street.trim() || !brgy.trim() || !city.trim()) { setErr('Fill in the street, barangay and city.'); return; }
    const c = findCity(city);
    if (!c) { setErr(`TSKR isn’t open in ${city.trim()} yet. Choose an address in Metro Manila or a nearby province.`); return; }
    setBusy(true);
    try {
      const id = await rpc<string>('save_address', {
        p_label: label, p_street: street, p_barangay: brgy, p_city: c.name, p_lat: c.lat, p_lng: c.lng,
        p_unit: unit || null, p_landmark: note || null, p_custom_label: label === 'other' ? other : null, p_default: isDefault,
      });
      await reloadAddresses();
      selectAddress(id);
      showToast('Address saved');
      router.back();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const field = (lbl: string, req: boolean, v: string, set: (s: string) => void, ph: string, extra?: object) => (
    <View style={{ gap: 6 }}>
      <T w="semibold" style={{ fontSize: 13 }}>{lbl} <T style={{ fontSize: 13, color: req ? colors.error : colors.muted }}>{req ? '*' : '(optional)'}</T></T>
      <GlassInput value={v} onChangeText={set} placeholder={ph} accessibilityLabel={lbl} style={{ height: 52, paddingHorizontal: 16, fontSize: 15 }} {...extra} />
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Backdrop />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: 40 + insets.bottom, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <RoundButton d={P.back} label="Back" onPress={() => router.back()} />
          <T w="extrabold" style={{ fontSize: 22 }}>Address details</T>
        </View>

        <Rise i={0} style={st.map}>
          <Svg width="100%" height="100%" viewBox="0 0 350 150" preserveAspectRatio="xMidYMid slice">
            <Rect width="350" height="150" fill="#EEF3EF" />
            <Path d="M0 100 C90 80 160 120 350 70" stroke="#FFF" strokeWidth={10} fill="none" />
            <Path d="M70 0 L120 150 M250 0 L220 150 M0 40 L350 55" stroke="#FFF" strokeWidth={6} fill="none" />
            <Circle cx="175" cy="75" r="40" fill="rgba(110,218,96,0.18)" />
          </Svg>
          <View style={st.pin}><Ic d={P.pin} size={34} fill={colors.teal} /></View>
          <View style={st.mapNote}><T w="semibold" style={{ fontSize: 12, color: colors.body }}>Map pin comes in the next build. We place you by city for now.</T></View>
        </Rise>

        <Rise i={1} style={st.card}>
          {field('Street, building or subdivision', true, street, setStreet, 'e.g. 122 Primo Cruz St')}
          {field('Unit, floor or house no.', false, unit, setUnit, 'e.g. Unit 5B, 2nd floor')}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>{field('Barangay', true, brgy, setBrgy, 'e.g. San Jose')}</View>
            <View style={{ flex: 1 }}>{field('City', true, city, setCity, 'e.g. Mandaluyong')}</View>
          </View>
          {!!city.trim() && !findCity(city) && (
            <T style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
              Open in: {CITIES.slice(0, 17).map((c) => c.name).join(', ')}, plus parts of Rizal, Cavite, Laguna, Bulacan, Pampanga and Batangas.
            </T>
          )}
          {field('Landmark or note to your tasker', false, note, setNote, 'e.g. Blue gate beside the sari-sari store')}
          <View style={{ gap: 8 }}>
            <T w="semibold" style={{ fontSize: 13 }}>Save as</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {LABELS.map(([k, l]) => <Chip key={k} label={l} on={label === k} onPress={() => setLabel(k)} />)}
            </View>
            {label === 'other' && (
              <GlassInput value={other} onChangeText={setOther} placeholder="Name this place, e.g. Parents’ house"
                accessibilityLabel="Name this place" style={{ height: 52, paddingHorizontal: 16, fontSize: 15 }} />
            )}
          </View>
          <PressScale accessibilityRole="checkbox" accessibilityState={{ checked: isDefault }} onPress={() => setDefault(!isDefault)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
            <View style={[st.box, isDefault && st.boxOn]}>{isDefault && <Ic d={P.check} size={14} color="#FFF" w={3} />}</View>
            <T w="semibold" style={{ fontSize: 14 }}>Set as my default address</T>
          </PressScale>
        </Rise>

        <ErrorText>{err}</ErrorText>
        <GlossyButton label="Save address" onPress={save} loading={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  map: { height: 150, ...bubble(22, 6), overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  pin: { position: 'absolute', top: 40 },
  mapNote: { position: 'absolute', bottom: 10, left: 10, right: 10, backgroundColor: 'rgba(255,255,255,0.88)', borderRadius: 10, padding: 8 },
  card: { ...bubble(22, 6), padding: 16, gap: 14, backgroundColor: 'rgba(255,255,255,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)' },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: '#98A2B3', alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.teal, borderColor: colors.teal },
});
