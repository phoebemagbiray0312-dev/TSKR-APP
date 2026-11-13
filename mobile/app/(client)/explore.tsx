import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bubble, colors, font } from '../../src/theme';
import { T } from '../../src/components/ui';
import { Backdrop, PressScale, Rise } from '../../src/components/glass';
import { CAT_ICON, HeaderFill, Ic, P, SearchIc } from '../../src/components/clientUi';

// design/client: exData
const GROUPS: [string, string, string[]][] = [
  ['Home services', 'repairs', ['Repairs', 'Aircon', 'Plumbing', 'Minor electrical repairs', 'Tile setting', 'Solar panel cleaning']],
  ['Cleaning and garden', 'cleaning', ['Home cleaning', 'Sofa cleaning', 'Gardening']],
  ['Auto', 'auto', ['Mechanic', 'Car wash']],
  ['Tech and gadgets', 'tech', ['Computer repair', 'Phone battery replacement', 'Wi-Fi setup', 'CCTV installer']],
  ['Creative', 'camera', ['Photographer', 'Graphic artist', 'Video editor']],
  ['Events', 'events', ['Events host', 'Musician', 'Clown', 'Barista', 'Referee']],
  ['Lessons', 'lessons', ['Tutor', 'Piano', 'Gaming coach', 'AI teacher']],
  ['Fitness and wellness', 'fitness', ['Fitness coach', 'Wellness coach']],
  ['Grooming and beauty', 'scissors', ['Barber', 'Hair and makeup']],
  ['Care', 'health', ['Caregiver', 'Yaya']],
  ['Pets and delivery', 'delivery', ['Pet groomer', 'Driver', 'Courier']],
];
// Same words the server blocks (banned_terms); checked here only to show the message instantly.
const BLOCKED = /massage|masahe|escort|usher|model|companion|hostess|hatid|ride|angkas|passenger|habal|doctor|nurse|therapist|lawyer|notary/i;

export default function Explore() {
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const eq = q.trim().toLowerCase();
  const blocked = !!eq && BLOCKED.test(eq);
  const groups = useMemo(() => GROUPS.map(([title, icon, items]) => ({
    title, icon, items: items.filter((l) => !eq || l.toLowerCase().includes(eq) || title.toLowerCase().includes(eq)),
  })).filter((g) => g.items.length), [eq]);

  // picking a service searches Home for it (design: query = first word)
  const pick = (label: string) => router.navigate({ pathname: '/home', params: { q: label.split(' ')[0] } });

  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <View style={[st.head, { paddingTop: insets.top + 12 }]}>
        <HeaderFill />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <PressScale accessibilityLabel="Back" onPress={() => router.back()} style={st.back}><Ic d={P.back} color="#FFF" w={2.2} /></PressScale>
          <T w="extrabold" style={{ color: '#FFF', fontSize: 22, marginLeft: 6 }}>Explore services</T>
        </View>
        <View style={st.search}>
          <SearchIc />
          <TextInput value={q} onChangeText={setQ} placeholder="Photographer, barber, CCTV…" placeholderTextColor="#98A2B3"
            accessibilityLabel="Search all services" clearButtonMode="while-editing"
            style={{ flex: 1, fontFamily: font.medium, fontSize: 15, color: colors.teal, height: 52 }} />
        </View>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingTop: 18, paddingBottom: 120, gap: 22 }}>
        {blocked && (
          <View style={[st.note, { alignItems: 'flex-start', gap: 6 }]}>
            <T w="extrabold" style={{ fontSize: 15 }}>TSKR doesn’t offer this service</T>
            <T style={{ fontSize: 13, color: colors.muted, lineHeight: 20 }}>We don’t list personal services (massage, escort, usherette, modeling) or services that need a professional license (doctors, nurses, therapists, lawyers, notaries). Try a home, tech, event or lesson service instead.</T>
          </View>
        )}
        {!blocked && groups.length === 0 && (
          <View style={st.note}><T style={{ fontSize: 14, color: colors.muted }}>No service matches that yet. Try another word.</T></View>
        )}
        {!blocked && groups.map((g, gi) => (
          <Rise key={g.title} i={gi} style={{ gap: 12 }}>
            <T w="extrabold" style={{ fontSize: 18 }}>{g.title}</T>
            <View style={st.grid}>
              {g.items.map((it) => (
                <PressScale key={it} onPress={() => pick(it)} outer={st.cell} style={st.item}>
                  <View style={st.icon}><Ic d={CAT_ICON[g.icon]} size={22} w={1.8} /></View>
                  <T w="semibold" style={{ fontSize: 13, lineHeight: 16, textAlign: 'center' }}>{it}</T>
                </PressScale>
              ))}
            </View>
          </Rise>
        ))}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  head: { paddingHorizontal: 16, paddingBottom: 18, gap: 12, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden' },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF', paddingHorizontal: 18, height: 52, ...bubble(22, 6) },
  note: { backgroundColor: 'rgba(255,255,255,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)', ...bubble(20, 6), padding: 20, alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  cell: { width: '33.333%', padding: 5 },
  item: {
    minHeight: 104, paddingTop: 14, paddingBottom: 12, paddingHorizontal: 6, alignItems: 'center', gap: 8, ...bubble(20, 6),
    backgroundColor: 'rgba(255,255,255,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)',
    shadowColor: '#044D5E', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
  icon: { width: 44, height: 44, ...bubble(16, 4), backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
});
