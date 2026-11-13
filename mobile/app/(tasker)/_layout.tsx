import React from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { ClientProvider } from '../../src/lib/client';
import { TaskerNav } from '../../src/components/TaskerNav';

/** Tasker app shell. Reuses the shared provider for toasts and favorites; floating 5-tab nav from the design. */
export default function TaskerLayout() {
  return (
    <ClientProvider>
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: '#EEF6F3' } }}>
          {['work/home', 'work/jobs', 'work/skills', 'work/wallet', 'work/me'].map((n) => (
            <Stack.Screen key={n} name={n} options={{ animation: 'fade' }} />
          ))}
        </Stack>
        <TaskerNav />
      </View>
    </ClientProvider>
  );
}
