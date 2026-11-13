import React from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { ClientProvider } from '../../src/lib/client';
import { BottomNav } from '../../src/components/clientUi';

/** Client app shell: shared state (address, booking cart, saved taskers) and the floating nav. */
export default function ClientLayout() {
  return (
    <ClientProvider>
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: '#EEF6F3' } }}>
          <Stack.Screen name="home" options={{ animation: 'fade' }} />
          <Stack.Screen name="bookings" options={{ animation: 'fade' }} />
          <Stack.Screen name="account" options={{ animation: 'fade' }} />
        </Stack>
        <BottomNav />
      </View>
    </ClientProvider>
  );
}
