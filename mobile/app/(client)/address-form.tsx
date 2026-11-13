import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { bubble, colors } from '../../src/theme';
import { ErrorText, T } from '../../src/components/ui';
import { Backdrop, GlassInput, GlossyButton, PressScale, Rise } from '../../src/components/glass';
import { Chip, Ic, P, RoundButton } from '../../src/components/clientUi';
import { useClient } from '../../src/lib/client';
import { findCity, nearestOpenCity } from '../../src/lib/places';
import { rpc } from '../../src/lib/supabase';

const LABELS: [string, string][] = [['home', 'Home'], ['work', 'Work'], ['partner', 'Partner'], ['other', 'Other']];
const START: Region = { latitude: 14.5794, longitude: 121.0359, latitudeDelta: 0.012, longitudeDelta: 0.012 };

/**
 * Design: ADDRESS DETAILS (FORM). The pin sits in the middle of the map: move the map to place it.
 * iPhone uses Apple Maps (no key needed); Android will use Google Maps once the API key is added.
 */
export default function AddressForm() {
  const insets = useSafeAreaInsets();
  const { reloadAddresses, selectAddress, showToast } = useClient();
  const map = useRef<MapView>(null);
  const [pin, setPin] = useState({ lat: START.latitude, lng: START.longitude });
  const [moved, setMoved] = useState(false);      // has the client placed the pin themselves?
  const [locating, setLocating] = useState(false);
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
  const fromGps = useRef(false);

  const goTo = (lat: number, lng: number) => {
    map.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.004, longitudeDelta: 0.004 }, 500);
  };

  // fill the fields from where the pin is (used by "Use my current location")
  const fillFrom = async (lat: number, lng: number) => {
    try {
      const [r] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (!r) return;
      const st = [r.streetNumber, r.street].filter(Boolean).join(' ') || r.name || '';
      if (st) setStreet(st);
      if (r.district || r.subregion) setBrgy((r.district || r.subregion) as string);
      if (r.city) setCity(r.city.replace(/ City$/i, ''));
    } catch { /* keep what was typed */ }
  };

  const useMyLocation = async () => {
    setErr('');
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) { setErr('Allow location access in Settings, or move the map to your address.'); return; }
    setLocating(true);
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      fromGps.current = true;
      setMoved(true);
      goTo(pos.coords.latitude, pos.coords.longitude);
      await fillFrom(pos.coords.latitude, pos.coords.longitude);
    } catch { setErr('We couldn’t get your location. Move the map to your address instead.'); }
    finally { setLocating(false); }
  };

  // typing an address moves the map there, until the client places the pin by hand
  useEffect(() => {
    if (moved || !city.trim()) return;
    const t = setTimeout(async () => {
      try {
        const q = [street, brgy, city, 'Philippines'].filter((x) => x.trim()).join(', ');
        const [g] = await Location.geocodeAsync(q);
        if (g) goTo(g.latitude, g.longitude);
        else { const c = findCity(city); if (c) goTo(c.lat, c.lng); }
      } catch { const c = findCity(city); if (c) goTo(c.lat, c.lng); }
    }, 700);
    return () => clearTimeout(t);
  }, [street, brgy, city, moved]);

  const save = async () => {
    setErr('');
    if (!street.trim() || !brgy.trim() || !city.trim()) { setErr('Fill in the street, barangay and city.'); return; }
    const area = nearestOpenCity(pin.lat, pin.lng);
    if (!area) { setErr('TSKR isn’t open there yet. Choose an address in Metro Manila or a nearby province, and check the pin.'); return; }
    setBusy(true);
    try {
      const id = await rpc<string>('save_address', {
        p_label: label, p_street: street, p_barangay: brgy, p_city: city.trim(), p_lat: pin.lat, p_lng: pin.lng,
        p_unit: unit || null, p_landmark: note || null, p_custom_label: label === 'other' ? other : null, p_default: isDefault,
      });
      await reloadAddresses();
      selectAddress(id);
      showToast('Address saved');
      router.back();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const field = (lbl: string, req: boolean, v: string, set: (s: string) => void, ph: string) => (
    <View style={{ gap: 6 }}>
      <T w="semibold" style={{ fontSize: 13 }}>{lbl} <T style={{ fontSize: 13, color: req ? colors.error : colors.muted }}>{req ? '*' : '(optional)'}</T></T>
      <GlassInput value={v} onChangeText={set} placeholder={ph} accessibilityLabel={lbl} style={{ height: 52, paddingHorizontal: 16, fontSize: 15 }} />
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
          <MapView ref={map} style={StyleSheet.absoluteFill} initialRegion={START} showsUserLocation showsPointsOfInterest={false}
            onRegionChangeComplete={(r, d) => {
              setPin({ lat: r.latitude, lng: r.longitude });
              if (d?.isGesture) { setMoved(true); fromGps.current = false; }
            }} />
          {/* fixed pin in the middle: the map moves under it */}
          <View pointerEvents="none" style={st.pin}>
            <Ic d={P.pin} size={40} fill={colors.teal} />
            <View style={st.pinDot} />
          </View>
          <View pointerEvents="none" style={st.mapHint}><T w="semibold" style={{ fontSize: 12, color: colors.body }}>Move the map to adjust the pin</T></View>
          <PressScale onPress={useMyLocation} outer={st.locBtnWrap} style={st.locBtn}>
            {locating ? <ActivityIndicator size="small" color={colors.teal} /> : <Ic d="M12 2v3M12 19v3M2 12h3M19 12h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" size={18} w={2.2} />}
            <T w="bold" style={{ fontSize: 13 }}>Use my current location</T>
          </PressScale>
        </Rise>

        <Rise i={1} style={st.card}>
          {field('Street, building or subdivision', true, street, setStreet, 'e.g. 122 Primo Cruz St')}
          {field('Unit, floor or house no.', false, unit, setUnit, 'e.g. Unit 5B, 2nd floor')}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>{field('Barangay', true, brgy, setBrgy, 'e.g. San Jose')}</View>
            <View style={{ flex: 1 }}>{field('City', true, city, setCity, 'e.g. Mandaluyong')}</View>
          </View>
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
  map: { height: 240, ...bubble(22, 6), overflow: 'hidden', backgroundColor: colors.tint },
  pin: { position: 'absolute', left: '50%', top: '50%', marginLeft: -20, marginTop: -40, alignItems: 'center' },
  pinDot: { width: 8, height: 4, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.25)', marginTop: -2 },
  mapHint: { position: 'absolute', top: 10, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12 },
  locBtnWrap: { position: 'absolute', bottom: 10, left: 10, right: 10 },
  locBtn: {
    height: 42, borderRadius: 999, backgroundColor: '#FFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
  },
  card: { ...bubble(22, 6), padding: 16, gap: 14, backgroundColor: 'rgba(255,255,255,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)' },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: '#98A2B3', alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.teal, borderColor: colors.teal },
});
