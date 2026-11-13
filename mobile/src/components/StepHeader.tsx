import React, { useEffect, useRef } from 'react';
import { Animated, KeyboardAvoidingView, Platform, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { BackIcon } from './icons';
import { T } from './ui';
import { Backdrop, EASE, PressScale } from './glass';

function Bar({ on }: { on: boolean }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(v, { toValue: on ? 1 : 0, duration: 700, easing: EASE, useNativeDriver: false }).start(); }, [on]);
  return (
    <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.tint, overflow: 'hidden' }}>
      <Animated.View style={{ height: 6, borderRadius: 3, backgroundColor: colors.green, width: v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
    </View>
  );
}

/** "Step N of 5" header with back button and 5 progress bars (mockup: STEPPED HEADER) */
export function StepHeader({ step, onBack }: { step: 1 | 2 | 3 | 4 | 5; onBack?: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: 14 + insets.top, paddingHorizontal: 16, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <PressScale
          accessibilityLabel="Back"
          onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/(auth)/welcome')))}
          style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}
        >
          <BackIcon />
        </PressScale>
        <T w="bold" style={{ fontSize: 13, color: colors.muted }}>Step {step} of 5</T>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {[1, 2, 3, 4, 5].map((i) => <Bar key={i} on={i <= step} />)}
      </View>
    </View>
  );
}

/** Light glass screen: colour-blob backdrop, keyboard-safe. */
export function GlassScreen({ children }: { children: React.ReactNode }) {
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Backdrop />
      {children}
    </KeyboardAvoidingView>
  );
}
