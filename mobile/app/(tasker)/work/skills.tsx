import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Circle as MapCircle } from '../../../src/components/Maps';
import * as Location from 'expo-location';
import { bubble, colors, font } from '../../../src/theme';
import { ErrorText, T } from '../../../src/components/ui';
import { Backdrop, GlossyButton, PressScale, Rise } from '../../../src/components/glass';
import { Chip, Ic, P, Sheet, Toast, glassCard } from '../../../src/components/clientUi';
import { peso, useClient } from '../../../src/lib/client';
import { nearestOpenCity } from '../../../src/lib/places';
import { rpc, supabase } from '../../../src/lib/supabase';

type Cat = { id: number; name: string };
type Skill = { id: number; name: string; category_id: number; needs_license: boolean };
type Mine = { id: string; skill_id: number | null; custom_name: string | null; base_fee: number; duration_min: number | null; status: string; slot: number; skills: { name: string } | null };

/** Design: tasker SKILLS — skills with starting prices (2 free, up to 7), plus the service area map. */
export default function Skills() {
  const insets = useSafeAreaInsets();
  const { toast, showToast } = useClient();
  const [cats, setCats] = useState<Cat[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [mine, setMine] = useState<Mine[]>([]);
  const [uid, setUid] = useState<string | null>(null);
  // add form
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState<number | null>(null);
  const [pick, setPick] = useState<number | 'other' | null>(null);
  const [other, setOther] = useState('');
  const [price, setPrice] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [editK, setEditK] = useState<Mine | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editErr, setEditErr] = useState('');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [from, setFrom] = useState('08:00');
  const [to, setTo] = useState('18:00');
  const [availSaved, setAvailSaved] = useState(false);
  // service area
  const map = useRef<MapView>(null);
  const [center, setCenter] = useState({ lat: 14.5794, lng: 121.0359 });
  const [radius, setRadius] = useState(3);
  const [area, setArea] = useState('');
  const [areaSaved, setAreaSaved] = useState(false);

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    const me = u.user!.id; setUid(me);
    const [c, s, m, tp] = await Promise.all([
      supabase.from('skill_categories').select('id,name').order('name'),
      supabase.from('skills').select('id,name,category_id,needs_license').eq('is_active', true).order('name'),
      supabase.from('tasker_skills').select('id,skill_id,custom_name,base_fee,duration_min,status,slot,skills(name)').eq('tasker_id', me).order('slot'),
      supabase.from('tasker_profiles').select('base_lat,base_lng,radius_km,area_label').eq('user_id', me).maybeSingle(),
    ]);
    setCats((c.data ?? []) as Cat[]); setSkills((s.data ?? []) as Skill[]); setMine((m.data ?? []) as any);
    if (tp.data?.base_lat) {
      setCenter({ lat: tp.data.base_lat, lng: tp.data.base_lng }); setRadius(Number(tp.data.radius_km)); setArea(tp.data.area_label ?? ''); setAreaSaved(true);
      map.current?.animateToRegion({ latitude: tp.data.base_lat, longitude: tp.data.base_lng, latitudeDelta: 0.06, longitudeDelta: 0.06 }, 300);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, []));

  const name = (k: Mine) => k.custom_name ?? k.skills?.name ?? 'Skill';
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase.from('tasker_profiles').select('availability').eq('user_id', u.user!.id).maybeSingle();
      const a = data?.availability as { days: number[]; from: string; to: string } | null;
      if (a) { setDays(a.days); setFrom(a.from); setTo(a.to); }
    })().catch(() => {});
  }, []);
  const saveEdit = async () => {
    setEditErr('');
    if (!Number(editPrice)) { setEditErr('Enter your starting price.'); return; }
    try { await rpc('update_tasker_skill', { p_id: editK!.id, p_base_fee: Number(editPrice) }); setEditK(null); showToast('Price updated'); load(); }
    catch (e: any) { setEditErr(e.message); }
  };
  const saveAvail = async () => {
    try { await rpc('set_availability', { p_days: days, p_from: from, p_to: to }); setAvailSaved(true); showToast('Availability saved'); }
    catch (e: any) { showToast(e.message); }
  };

  const extras = mine.filter((k) => k.slot > 2 && k.status !== 'rejected').length;

  const add = async () => {
    setErr('');
    if (!pick) { setErr('Choose a skill.'); return; }
    if (!Number(price)) { setErr('Enter your starting price.'); return; }
    setBusy(true);
    try {
      await rpc('add_tasker_skill', { p_skill_id: pick === 'other' ? null : pick, p_custom_name: pick === 'other' ? other : null, p_base_fee: Number(price) });
      setOpen(false); setPick(null); setOther(''); setPrice(''); setCat(null);
      showToast(pick === 'other' || skills.find((x) => x.id === pick)?.needs_license ? 'Skill added. We’ll review it first.' : 'Skill added');
      load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const remove = (k: Mine) => Alert.alert(`Remove ${name(k)}?`, 'Clients won’t see it anymore.', [
    { text: 'Keep', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: async () => { try { await rpc('remove_tasker_skill', { p_id: k.id }); load(); } catch (e: any) { showToast(e.message); } } },
  ]);

  const hereNow = async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) { showToast('Allow location in Settings, or move the map.'); return; }
    const pos = await Location.getCurrentPositionAsync({});
    map.current?.animateToRegion({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, latitudeDelta: 0.06, longitudeDelta: 0.06 }, 400);
    try { const [r] = await Location.reverseGeocodeAsync(pos.coords); if (r?.city && !area) setArea(r.city.replace(/ City$/i, '')); } catch {}
  };
  const saveArea = async () => {
    if (!nearestOpenCity(center.lat, center.lng)) { showToast('That’s outside the areas TSKR is open in. Move the pin to Metro Manila or a nearby province.'); return; }
    try { await rpc('set_service_area', { p_lat: center.lat, p_lng: center.lng, p_area_label: area || nearestOpenCity(center.lat, center.lng)!.name, p_radius_km: radius }); setAreaSaved(true); showToast('Service area saved'); }
    catch (e: any) { showToast(e.message); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Backdrop />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 20, paddingHorizontal: 16, paddingBottom: 130, gap: 12 }}>
        <T w="extrabold" style={{ fontSize: 26 }}>My skills</T>
        <T style={{ fontSize: 13, color: colors.body, lineHeight: 19 }}>Each skill has its own starting price. Your first 2 skills are free. Each extra skill costs 100 coins per week, up to 5 extra skills (7 in total). The first week is deducted as soon as you add it.</T>
        {extras > 0 && <View style={[glassCard, st.rowB, { padding: 14 }]}><T w="semibold" style={{ fontSize: 14 }}>Weekly skill charge</T><T w="extrabold" style={{ fontSize: 14 }}>{extras * 100} coins</T></View>}

        {mine.map((k, i) => (
          <Rise key={k.id} i={i} style={[glassCard, st.rowB, { padding: 14, gap: 10 }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <T w="extrabold" style={{ fontSize: 11, color: k.status === 'active' ? '#2E7D32' : colors.warnText, letterSpacing: 0.6 }}>
                {k.slot <= 2 ? 'FREE' : 'EXTRA · 100 COINS/WEEK'}{k.status !== 'active' ? ` · ${k.status === 'pending_review' ? 'UNDER REVIEW' : k.status.toUpperCase()}` : ''}
              </T>
              <T w="bold" style={{ fontSize: 15 }}>{name(k)}</T>
              <T style={{ fontSize: 13, color: colors.muted }}>Starts at {peso(Number(k.base_fee))}</T>
            </View>
            {k.status !== 'rejected' && (
              <PressScale accessibilityLabel="Edit price" onPress={() => { setEditK(k); setEditPrice(String(Math.round(Number(k.base_fee)))); setEditErr(''); }} style={st.iconBtn}>
                <Ic d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" size={16} w={2} />
              </PressScale>
            )}
            <PressScale accessibilityLabel="Remove skill" onPress={() => remove(k)} style={st.iconBtn}><Ic d="M6 6l12 12M18 6 6 18" size={16} color={colors.error} w={2.4} /></PressScale>
          </Rise>
        ))}
        {mine.length < 5 && (
          <PressScale onPress={() => setOpen(true)} style={st.addBtn}><Ic d={P.plus} size={18} w={2.4} /><T w="bold" style={{ fontSize: 15 }}>{mine.length ? 'Add another skill' : 'Add your first skill'}</T></PressScale>
        )}

        <T w="extrabold" style={{ fontSize: 20, marginTop: 10 }}>Availability</T>
        <T style={{ fontSize: 13, color: colors.body, lineHeight: 19 }}>Clients can only schedule you on these days and hours. Going Offline on Home pauses all new requests anytime.</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {DAYS.map((d, i) => <Chip key={d} label={d} on={days.includes(i + 1)} onPress={() => { setAvailSaved(false); setDays((c) => (c.includes(i + 1) ? c.filter((x) => x !== i + 1) : [...c, i + 1].sort())); }} />)}
        </View>
        <T w="semibold" style={{ fontSize: 13 }}>From</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {FROM.map((h) => <Chip key={h} label={hLabel(h)} on={from === h} onPress={() => { setAvailSaved(false); setFrom(h); }} />)}
        </View>
        <T w="semibold" style={{ fontSize: 13 }}>To</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {TO.map((h) => <Chip key={h} label={hLabel(h)} on={to === h} onPress={() => { setAvailSaved(false); setTo(h); }} />)}
        </View>
        <GlossyButton label={availSaved ? '✓ Saved' : `Save · ${days.length} days, ${hLabel(from)}–${hLabel(to)}`} onPress={saveAvail} disabled={!days.length} />

        <T w="extrabold" style={{ fontSize: 20, marginTop: 10 }}>Service area</T>
        <T style={{ fontSize: 13, color: colors.body, lineHeight: 19 }}>Move the map to where you usually start from. Clients never see this exact spot, only your area and radius.</T>
        <View style={st.map}>
          <MapView ref={map} style={StyleSheet.absoluteFill} initialRegion={{ latitude: center.lat, longitude: center.lng, latitudeDelta: 0.06, longitudeDelta: 0.06 }}
            showsPointsOfInterest={false} onRegionChangeComplete={(r) => { setCenter({ lat: r.latitude, lng: r.longitude }); }}>
            <MapCircle center={{ latitude: center.lat, longitude: center.lng }} radius={radius * 1000} strokeColor="rgba(4,77,94,0.8)" strokeWidth={2} fillColor="rgba(4,77,94,0.12)" />
          </MapView>
          <View pointerEvents="none" style={st.pin}><Ic d={P.pin} size={34} fill={colors.teal} /></View>
          <PressScale onPress={hereNow} outer={{ position: 'absolute', bottom: 10, left: 10, right: 10 }} style={st.locBtn}><T w="bold" style={{ fontSize: 13 }}>Use my current location</T></PressScale>
        </View>
        <T w="semibold" style={{ fontSize: 13 }}>How far will you travel? · {radius} km</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[1, 2, 3, 4, 5, 6].map((k) => <Chip key={k} label={`${k} km`} on={radius === k} onPress={() => setRadius(k)} />)}
        </View>
        <TextInput value={area} onChangeText={setArea} placeholder="Area clients see, e.g. Mandaluyong · Pasig" placeholderTextColor="#98A2B3" accessibilityLabel="Area name" style={st.input} />
        <GlossyButton label={areaSaved ? 'Update service area' : 'Save service area'} onPress={saveArea} />
      </ScrollView>

      <Sheet open={open} onClose={() => setOpen(false)} title={mine.length < 2 ? 'Add a skill · free' : 'Add a skill · 100 coins/week'}>
        <T w="semibold" style={{ fontSize: 13 }}>1. Category</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {cats.map((c) => <Chip key={c.id} label={c.name} on={cat === c.id} onPress={() => { setCat(c.id); setPick(null); }} />)}
        </View>
        {cat != null && (
          <>
            <T w="semibold" style={{ fontSize: 13 }}>2. Skill</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {skills.filter((x) => x.category_id === cat).map((x) => <Chip key={x.id} label={x.name + (x.needs_license ? ' · license' : '')} on={pick === x.id} onPress={() => setPick(x.id)} />)}
              <Chip label="Others (specify)" on={pick === 'other'} onPress={() => setPick('other')} />
            </View>
          </>
        )}
        {pick === 'other' && (
          <TextInput value={other} onChangeText={setOther} placeholder="e.g. Aquarium cleaning" placeholderTextColor="#98A2B3" accessibilityLabel="Your skill" style={st.input} />
        )}
        {pick != null && (
          <>
            <T w="semibold" style={{ fontSize: 13 }}>3. Starting price</T>
            <View style={[st.input, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
              <T w="extrabold" style={{ fontSize: 16 }}>₱</T>
              <TextInput value={price} onChangeText={(v) => setPrice(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" placeholder="e.g. 800" placeholderTextColor="#98A2B3" accessibilityLabel="Starting price" style={{ flex: 1, fontFamily: font.bold, fontSize: 16, color: colors.teal }} />
            </View>
            <T style={{ fontSize: 12, color: colors.muted }}>Clients see it as “Starts at”. You agree on the final price in chat and on site.</T>
          </>
        )}
        <ErrorText>{err}</ErrorText>
        <GlossyButton label="Save skill" onPress={add} loading={busy} disabled={!pick} />
      </Sheet>
      <Sheet open={!!editK} onClose={() => setEditK(null)} title={editK ? `Edit ${name(editK)}` : ''}>
        <T w="semibold" style={{ fontSize: 13 }}>Starting price</T>
        <View style={[st.input, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
          <T w="extrabold" style={{ fontSize: 16 }}>₱</T>
          <TextInput value={editPrice} onChangeText={(v) => setEditPrice(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" accessibilityLabel="Starting price" style={{ flex: 1, fontFamily: font.bold, fontSize: 16, color: colors.teal }} />
        </View>
        <T style={{ fontSize: 12, color: colors.muted }}>New bookings use the new price. Bookings already made keep their price.</T>
        <ErrorText>{editErr}</ErrorText>
        <GlossyButton label="Save price" onPress={saveEdit} />
      </Sheet>
      <Toast text={toast} top={insets.top + 10} />
    </KeyboardAvoidingView>
  );
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const FROM = ['06:00', '07:00', '08:00', '09:00', '10:00'];
const TO = ['16:00', '17:00', '18:00', '19:00', '20:00'];
const hLabel = (h: string) => { const n = Number(h.slice(0, 2)); return `${n % 12 || 12} ${n < 12 ? 'AM' : 'PM'}`; };

const st = StyleSheet.create({
  rowB: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  addBtn: { height: 52, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.teal, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  map: { height: 240, ...bubble(22, 6), overflow: 'hidden', backgroundColor: colors.tint },
  pin: { position: 'absolute', left: '50%', top: '50%', marginLeft: -17, marginTop: -34 },
  locBtn: { height: 40, borderRadius: 999, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  input: { height: 50, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 14, fontFamily: font.medium, fontSize: 15, color: colors.teal, backgroundColor: '#FFF' },
});
