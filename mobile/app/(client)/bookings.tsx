import React from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bubble, colors } from '../../src/theme';
import { T } from '../../src/components/ui';
import { Backdrop, GlossyButton, Rise } from '../../src/components/glass';
import { Ic, P } from '../../src/components/clientUi';
import { Path, Rect } from 'react-native-svg';

/** Bookings tab. Active and past bookings arrive with the booking flow (client part 2–3). */
export default function Bookings() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 20, paddingHorizontal: 16, paddingBottom: 130, gap: 16 }}>
        <T w="extrabold" style={{ fontSize: 26 }}>Bookings</T>
        <Rise i={1}>
          <View style={{ ...bubble(24, 6), padding: 22, gap: 12, backgroundColor: 'rgba(255,255,255,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)' }}>
            <View style={{ width: 56, height: 56, ...bubble(20, 6), backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' }}>
              <Ic size={28} w={1.8}><Rect x={3} y={4} width={18} height={17} rx={3} /><Path d={P.navCal} /></Ic>
            </View>
            <T w="extrabold" style={{ fontSize: 18 }}>No bookings yet</T>
            <T style={{ fontSize: 14, color: colors.muted, lineHeight: 21 }}>
              When you book a tasker, you’ll follow the job here: chat, offer, live tracking and payment.
            </T>
            <GlossyButton label="Find a tasker" onPress={() => router.replace('/home')} />
          </View>
        </Rise>
      </ScrollView>
    </View>
  );
}
