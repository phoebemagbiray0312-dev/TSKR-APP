import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, TextInputProps, TextProps, TextStyle, View, ViewStyle } from 'react-native';
import { bubble, colors, font } from '../theme';
import { GlassInput, GlossyButton } from './glass';

type W = 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold';
export function T({ w = 'regular', style, ...p }: TextProps & { w?: W }) {
  return <Text {...p} style={[{ fontFamily: font[w], color: colors.text }, style]} />;
}

export function H1({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <T w="extrabold" style={[{ fontSize: 26, lineHeight: 32 }, style]}>{children}</T>;
}

export function Sub({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <T style={[{ fontSize: 14, lineHeight: 21, color: colors.muted }, style]}>{children}</T>;
}

/** Primary action: glossy teal with a shine sweep (design v2). */
export function PrimaryButton(p: { label: string; onPress: () => void; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  return <GlossyButton {...p} />;
}

export function LinkButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={disabled ? undefined : onPress} style={{ padding: 10, alignSelf: 'center' }} accessibilityRole="button">
      <T w="bold" style={{ fontSize: 13, color: disabled ? colors.disabledText : colors.teal }}>{label}</T>
    </Pressable>
  );
}

export function IconTile({ children }: { children: React.ReactNode }) {
  return <View style={s.iconTile}>{children}</View>;
}

export function ErrorText({ children }: { children?: string | null }) {
  if (!children) return null;
  return <T w="semibold" accessibilityRole="alert" style={{ fontSize: 13, color: colors.error }}>{children}</T>;
}

export function Field({ label, ...p }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <T w="bold" style={{ fontSize: 13 }}>{label}</T>
      <GlassInput {...p} style={{ height: 54, paddingHorizontal: 14, fontSize: 16 }} />
    </View>
  );
}

export function CodeInput(p: TextInputProps) {
  return (
    <GlassInput
      keyboardType="number-pad"
      maxLength={6}
      placeholder="••••••"
      textContentType="oneTimeCode"
      autoComplete="one-time-code"
      r={[18, 6]}
      {...p}
      style={{ height: 64, textAlign: 'center', fontFamily: font.extrabold, fontSize: 28, letterSpacing: 12 }}
    />
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return (
    <View accessibilityRole="text" style={[s.note, bubble(14, 4)]}>
      <T w="semibold" style={{ fontSize: 13, lineHeight: 19.5, color: colors.warnText }}>{children}</T>
    </View>
  );
}

export const s = StyleSheet.create({
  iconTile: { width: 56, height: 56, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center', ...bubble(20, 6) },
  note: { backgroundColor: colors.warnBg, paddingVertical: 12, paddingHorizontal: 14 },
  screen: { flex: 1, paddingHorizontal: 24, paddingTop: 22, gap: 16 },
});
