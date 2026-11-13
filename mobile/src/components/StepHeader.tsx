import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { colors } from '../theme';
import { BackIcon } from './icons';
import { T } from './ui';

/** "Step N of 5" header with back button and 5 progress bars (mockup: STEPPED HEADER) */
export function StepHeader({ step, onBack }: { step: 1 | 2 | 3 | 4 | 5; onBack?: () => void }) {
  return (
    <View style={{ paddingTop: 14, paddingHorizontal: 16, gap: 14, backgroundColor: colors.white }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable
          accessibilityLabel="Back"
          onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/(auth)/welcome')))}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}
        >
          <BackIcon />
        </Pressable>
        <T w="bold" style={{ fontSize: 13, color: colors.muted }}>Step {step} of 5</T>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i <= step ? colors.green : colors.tint }} />
        ))}
      </View>
    </View>
  );
}
