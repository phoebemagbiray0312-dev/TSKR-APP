import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Easing, Pressable, StyleProp, StyleSheet, TextInput, TextInputProps, View, ViewStyle,
} from 'react-native';
import Svg, { Defs, Ellipse, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { bubble, colors, font } from '../theme';
import { T } from './text';

/*
 * The design's "premium layer": colour blobs behind frosted, see-through cards, glossy buttons,
 * and gentle motion. Values come from the <style> block in Signup.dc.html (v2).
 */
export const EASE = Easing.bezier(0.22, 0.9, 0.24, 1);

let gid = 0;
const useId = (p: string) => useRef(`${p}${++gid}`).current;

// ---------- background: soft colour blobs that drift slowly ----------
type Spot = { x: number; y: number; rx: number; ry: number; color: string; o: number };
function Blob({ w, h, spots, style, to, scale, dur }: {
  w: number; h: number; spots: Spot[]; style: ViewStyle; to: { x: number; y: number }; scale: number; dur: number;
}) {
  const v = useRef(new Animated.Value(0)).current;
  const id = useId('blob');
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, []);
  const transform = [
    { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, to.x] }) },
    { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, to.y] }) },
    { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, scale] }) },
  ];
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: w, height: h }, style, { transform }]}>
      <Svg width={w} height={h}>
        <Defs>
          {spots.map((s, i) => (
            <RadialGradient key={i} id={`${id}-${i}`} cx={s.x} cy={s.y} rx={s.rx} ry={s.ry} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={s.color} stopOpacity={s.o} />
              <Stop offset="1" stopColor={s.color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {spots.map((s, i) => <Ellipse key={i} cx={s.x} cy={s.y} rx={s.rx} ry={s.ry} fill={`url(#${id}-${i})`} />)}
      </Svg>
    </Animated.View>
  );
}

/** Full-screen glass background for the light screens. */
export function Backdrop() {
  const id = useId('bd');
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0.2" y1="0" x2="0.8" y2="1">
            <Stop offset="0" stopColor="#DDF3EE" />
            <Stop offset="0.45" stopColor="#E3F0F6" />
            <Stop offset="1" stopColor="#F6E9E1" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
      <Blob w={520} h={900} style={{ left: -170, top: -60 }} to={{ x: 60, y: 40 }} scale={1.08} dur={18000} spots={[
        { x: 156, y: 162, rx: 156, ry: 162, color: '#6EDA60', o: 0.85 },
        { x: 374, y: 468, rx: 146, ry: 432, color: '#18A0BE', o: 0.7 },
        { x: 146, y: 774, rx: 146, ry: 126, color: '#6EDA60', o: 0.65 },
      ]} />
      <Blob w={480} h={880} style={{ right: -190, top: -20 }} to={{ x: -50, y: -30 }} scale={1.1} dur={22000} spots={[
        { x: 288, y: 88, rx: 192, ry: 88, color: '#FFAA78', o: 0.75 },
        { x: 192, y: 405, rx: 192, ry: 405, color: '#5ED3E6', o: 0.75 },
        { x: 298, y: 792, rx: 182, ry: 88, color: '#FFBA8C', o: 0.65 },
      ]} />
    </View>
  );
}

// ---------- frosted glass card ----------
export function GlassView({ children, style, radius = [20, 6] }: {
  children?: React.ReactNode; style?: StyleProp<ViewStyle>; radius?: [number, number];
}) {
  const id = useId('gl');
  return (
    <View style={[s.glassShadow, bubble(radius[0], radius[1]), style]}>
      <View style={[StyleSheet.absoluteFill, bubble(radius[0], radius[1]), { overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.30)' }]}>
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.45" />
              <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0.08" />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0.18" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
        </Svg>
      </View>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, bubble(radius[0], radius[1]), { borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)' }]} />
      {children}
    </View>
  );
}

// ---------- press feedback: everything tappable shrinks a little ----------
export function PressScale({ onPress, disabled, style, outer, children, accessibilityLabel, accessibilityRole = 'button', accessibilityState }: {
  onPress?: () => void; disabled?: boolean; style?: StyleProp<ViewStyle>; outer?: StyleProp<ViewStyle>; children: React.ReactNode;
  accessibilityLabel?: string; accessibilityRole?: 'button' | 'checkbox' | 'radio'; accessibilityState?: object;
}) {
  const sc = useRef(new Animated.Value(1)).current;
  const to = (v: number) => Animated.timing(sc, { toValue: v, duration: 200, easing: EASE, useNativeDriver: true }).start();
  return (
    <Pressable style={outer} onPress={disabled ? undefined : onPress} onPressIn={() => to(0.965)} onPressOut={() => to(1)}
      accessibilityLabel={accessibilityLabel} accessibilityRole={accessibilityRole} accessibilityState={accessibilityState}>
      <Animated.View style={[style, { transform: [{ scale: sc }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

// ---------- glossy primary button with one shine sweep when it appears ----------
export function GlossyButton({ label, onPress, loading, disabled, style }: {
  label: string; onPress: () => void; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const id = useId('gb');
  const [w, setW] = useState(0);
  const shine = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!w || disabled) return;
    Animated.timing(shine, { toValue: 1, duration: 1100, delay: 500, easing: EASE, useNativeDriver: true }).start();
  }, [w, disabled]);
  const off = disabled || loading;
  return (
    <PressScale onPress={off ? undefined : onPress} style={[s.btnShadow, bubble(18, 6), style]} accessibilityState={{ disabled: !!disabled }}>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)}
        style={[{ height: 56, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, bubble(18, 6),
          disabled && { backgroundColor: colors.disabledBg }]}>
        {!disabled && (
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
            <Defs>
              <LinearGradient id={`${id}a`} x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#0E7C95" />
                <Stop offset="0.7" stopColor="#044D5E" />
              </LinearGradient>
              <LinearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.30" />
                <Stop offset="0.48" stopColor="#FFFFFF" stopOpacity="0.08" />
                <Stop offset="0.52" stopColor="#000000" stopOpacity="0" />
                <Stop offset="1" stopColor="#000000" stopOpacity="0.10" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}a)`} />
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}b)`} />
          </Svg>
        )}
        {!disabled && w > 0 && (
          <Animated.View pointerEvents="none" style={{
            position: 'absolute', top: -10, bottom: -10, width: w * 0.4, backgroundColor: 'rgba(255,255,255,0.22)',
            transform: [{ translateX: shine.interpolate({ inputRange: [0, 1], outputRange: [-w * 0.7, w * 1.3] }) }, { skewX: '-18deg' }],
          }} />
        )}
        {loading ? <ActivityIndicator color={colors.white} /> :
          <T w="extrabold" style={{ fontSize: 16, color: disabled ? colors.disabledText : colors.white }}>{label}</T>}
      </View>
    </PressScale>
  );
}

// ---------- glossy green tile (Done check) ----------
export function GreenGloss({ size = 84, r = [30, 10] as [number, number], children }: { size?: number; r?: [number, number]; children: React.ReactNode }) {
  const id = useId('gg');
  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, bubble(r[0], r[1]), s.greenShadow]}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id={`${id}a`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#93EA86" />
            <Stop offset="1" stopColor="#5FCF51" />
          </LinearGradient>
          <LinearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.45" />
            <Stop offset="0.48" stopColor="#FFFFFF" stopOpacity="0.1" />
            <Stop offset="0.52" stopColor="#000000" stopOpacity="0" />
            <Stop offset="1" stopColor="#000000" stopOpacity="0.06" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}a)`} />
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}b)`} />
      </Svg>
      {children}
    </View>
  );
}

// ---------- frosted input with a green focus ring ----------
export function GlassInput({ style, r = [16, 4] as [number, number], ...p }: TextInputProps & { r?: [number, number] }) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={[{ padding: 4, margin: -4, borderWidth: 0 }, bubble(r[0] + 4, r[1] + 4), focus && { backgroundColor: 'rgba(110,218,96,0.28)' }]}>
      <TextInput
        placeholderTextColor={colors.disabledText}
        {...p}
        onFocus={(e) => { setFocus(true); p.onFocus?.(e); }}
        onBlur={(e) => { setFocus(false); p.onBlur?.(e); }}
        style={[{ borderWidth: 1.5, borderColor: focus ? '#0A6378' : colors.border, backgroundColor: 'rgba(255,255,255,0.5)', fontFamily: font.semibold, color: colors.text }, bubble(r[0], r[1]), style]}
      />
    </View>
  );
}

// ---------- entrance: blocks rise one after another ----------
export function Rise({ i = 0, children, style }: { i?: number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 550, delay: Math.min(i, 6) * 40, easing: EASE, useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.View style={[style, {
      opacity: v,
      transform: [
        { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
        { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) },
      ],
    }]}>{children}</Animated.View>
  );
}

const s = StyleSheet.create({
  glassShadow: { shadowColor: '#043C4A', shadowOpacity: 0.14, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 3, backgroundColor: 'transparent' },
  btnShadow: { shadowColor: '#044D5E', shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  greenShadow: { shadowColor: '#2E7D32', shadowOpacity: 0.4, shadowRadius: 9, shadowOffset: { width: 0, height: 8 } },
});
