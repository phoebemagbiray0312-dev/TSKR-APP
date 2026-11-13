import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bubble, colors } from '../theme';
import { CloseIcon } from './icons';
import { T } from './ui';
import { EASE, PressScale, Rise } from './glass';
import type { PolicyDoc } from '../lib/signup';

/**
 * Read-to-agree sheet (Guide §2.3): Terms (Step 1 of 2) then Privacy (Step 2 of 2).
 * The agree button stays disabled until the user scrolls to the end of each document.
 * Design v2: blurred backdrop, frosted sheet that slides up, sections rise in one after another.
 */
export function PolicyReader({ visible, doc, step, onAgree, onClose }: {
  visible: boolean; doc: PolicyDoc | null; step: 1 | 2; onAgree: () => void; onClose: () => void;
}) {
  const [pct, setPct] = useState(0);
  const [end, setEnd] = useState(false);
  const scroller = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const up = useRef(new Animated.Value(0)).current;
  const bar = useRef(new Animated.Value(0)).current;

  useEffect(() => { setPct(0); setEnd(false); scroller.current?.scrollTo({ y: 0, animated: false }); }, [doc?.id]);
  useEffect(() => {
    if (visible) { up.setValue(0); Animated.timing(up, { toValue: 1, duration: 480, easing: EASE, useNativeDriver: true }).start(); }
  }, [visible, doc?.id]);
  useEffect(() => {
    Animated.timing(bar, { toValue: end ? 100 : Math.max(4, pct), duration: 700, easing: EASE, useNativeDriver: false }).start();
  }, [pct, end]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    const seen = contentOffset.y + layoutMeasurement.height;
    setPct((p) => Math.max(p, Math.round((seen / contentSize.height) * 100)));
    if (seen >= contentSize.height - 12) setEnd(true);
  };
  // very short documents fit without scrolling
  const onSize = (_w: number, h: number) => { if (h > 0 && h < 500) setEnd(true); };

  if (!doc) return null;
  const effective = new Date(doc.effective_date).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  const label = !end ? 'Scroll to the end to continue' : step === 2 ? 'I agree to the Privacy Policy' : 'I agree · Next: Privacy Policy';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <BlurView intensity={12} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} />
        <Animated.View accessibilityViewIsModal
          style={{ height: '92%', borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden',
            transform: [{ translateY: up.interpolate({ inputRange: [0, 1], outputRange: [800, 0] }) }] }}>
          <BlurView intensity={60} tint="light" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.86)' }]} />
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
            <Defs>
              <LinearGradient id="docGloss" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.9" />
                <Stop offset="0.3" stopColor="#FFFFFF" stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#docGloss)" />
          </Svg>

          <View style={{ paddingTop: 18, paddingHorizontal: 20, paddingBottom: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.85)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <T w="extrabold" style={{ fontSize: 12, letterSpacing: 0.6, color: colors.muted }}>STEP {step} OF 2</T>
              <PressScale accessibilityLabel="Close" onPress={onClose}
                style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>
                <CloseIcon />
              </PressScale>
            </View>
            <T w="extrabold" style={{ fontSize: 22 }}>{doc.title}</T>
            <T style={{ fontSize: 12, color: colors.muted }}>Version {doc.version} · Effective {effective}</T>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.tint, overflow: 'hidden' }}>
              <Animated.View style={{ height: 6, borderRadius: 3, backgroundColor: colors.green,
                width: bar.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }} />
            </View>
          </View>

          <ScrollView key={doc.id} ref={scroller} onScroll={onScroll} scrollEventThrottle={64} onContentSizeChange={onSize}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 14 }}>
            {doc.sections.map((d, i) => (
              <Rise key={d.h} i={i} style={{ gap: 4 }}>
                <T w="extrabold" style={{ fontSize: 15 }}>{d.h}</T>
                <T style={{ fontSize: 13, lineHeight: 20.8, color: colors.body }}>{d.p}</T>
              </Rise>
            ))}
            <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.85)', paddingTop: 12 }}>
              <T style={{ fontSize: 12, color: colors.muted, textAlign: 'center' }}>End of {doc.title}</T>
            </View>
          </ScrollView>

          <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 22 + insets.bottom, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.85)' }}>
            <PressScale accessibilityState={{ disabled: !end }} onPress={end ? onAgree : undefined}
              style={{ height: 54, alignItems: 'center', justifyContent: 'center', backgroundColor: end ? colors.teal : colors.disabledBg, ...bubble(16, 4) }}>
              <T w="extrabold" style={{ fontSize: 15, color: end ? colors.white : colors.disabledText }}>{label}</T>
            </PressScale>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
