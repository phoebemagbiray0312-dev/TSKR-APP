import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, Pressable, View } from 'react-native';
import { useSplash } from './Splash';

/**
 * Stacked logo with three white dots that keep "typing" (design: .tskr-dot, 1.4s loop, 0.18s apart).
 * Tapping it replays the launch intro, like the design's data-replay-intro.
 */
const RATIO = 863 / 888;

function Dot({ left, size, top, delay }: { left: number; size: number; top: number; delay: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    const t = setTimeout(() => {
      loop = Animated.loop(Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 420, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 420, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.delay(560),
      ]));
      loop.start();
    }, delay);
    return () => { clearTimeout(t); loop?.stop(); };
  }, []);
  return (
    <Animated.View style={{
      position: 'absolute', left, top, width: size, height: size, borderRadius: size / 2, backgroundColor: '#FFFFFF',
      opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
      transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -0.35 * size] }) }],
    }} />
  );
}

export function Logo({ height = 124 }: { height?: number }) {
  const { replay } = useSplash();
  const width = height * RATIO;
  const size = 0.0718 * width;
  return (
    <Pressable onPress={replay} accessibilityLabel="tskr, replay intro" style={{ alignSelf: 'flex-start' }}>
      <View style={{ width, height }}>
        <Image source={require('../../assets/logo-stacked.png')} style={{ width, height }} resizeMode="contain" />
        {[0.3453, 0.4565, 0.5666].map((l, i) => (
          <Dot key={i} left={l * width} top={0.2106 * height} size={size} delay={i * 180} />
        ))}
      </View>
    </Pressable>
  );
}
