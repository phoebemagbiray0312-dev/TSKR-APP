import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../src/theme';
import { T } from '../../src/components/ui';
import { Backdrop, GlossyButton, PressScale, Rise } from '../../src/components/glass';
import { Ic, MiniAvatar, P, StarIc, SubHeader, Toast, glassCard } from '../../src/components/clientUi';
import { TaskerCard, peso, useClient } from '../../src/lib/client';
import { coverPhoto } from '../../src/lib/demoPhotos';
import { rpc } from '../../src/lib/supabase';

/** Design: FAVORITES — taskers the client saved with the heart. */
export default function Favorites() {
  const insets = useSafeAreaInsets();
  const { address, toggleFav, toast } = useClient();
  const [list, setList] = useState<TaskerCard[] | null>(null);
  const load = useCallback(() => {
    rpc<{ items: TaskerCard[] }>('discover_taskers', { p_lat: address.lat, p_lng: address.lng, p_favorites: true, p_max_km: 50 })
      .then((r) => setList(r.items)).catch(() => setList([]));
  }, [address.lat, address.lng]);
  useFocusEffect(load);

  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <SubHeader title="Favorite taskers" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 + insets.bottom }}>
        {list === null && <ActivityIndicator color={colors.teal} style={{ padding: 30 }} />}
        {list?.length === 0 && (
          <View style={[glassCard, { padding: 22, gap: 12 }]}>
            <T w="extrabold" style={{ fontSize: 18 }}>No favorites yet</T>
            <T style={{ fontSize: 14, color: colors.muted, lineHeight: 21 }}>Tap the heart on a tasker’s profile to save them here, so you can book them again quickly.</T>
            <GlossyButton label="Find a tasker" onPress={() => router.replace('/home')} />
          </View>
        )}
        {list?.map((t, i) => (
          <Rise key={t.id} i={i}>
            <PressScale onPress={() => router.push({ pathname: '/tasker/[id]', params: { id: t.id } })} style={[glassCard, st.row]}>
              {coverPhoto(t.photo)
                ? <Image source={coverPhoto(t.photo)} style={{ width: 64, height: 64, borderRadius: 16 }} />
                : <MiniAvatar initials={t.initials} color={t.color} size={64} r={16} />}
              <View style={{ flex: 1, gap: 2 }}>
                <T w="extrabold" style={{ fontSize: 16 }}>{t.name}</T>
                <T style={{ fontSize: 13, color: colors.body }} numberOfLines={1}>{t.title}</T>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <StarIc /><T w="bold" style={{ fontSize: 13 }}>{t.rating.toFixed(1)}</T>
                  <T style={{ fontSize: 13, color: colors.muted }}>· {t.km.toFixed(1)} km · from {peso(t.min_price)}</T>
                </View>
              </View>
              <PressScale accessibilityLabel="Remove from favorites" style={st.heart}
                onPress={async () => { await toggleFav(t.id, true); load(); }}>
                <Ic d={P.heart} fill={colors.teal} />
              </PressScale>
            </PressScale>
          </Rise>
        ))}
      </ScrollView>
      <Toast text={toast} top={insets.top + 10} />
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  heart: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
});
