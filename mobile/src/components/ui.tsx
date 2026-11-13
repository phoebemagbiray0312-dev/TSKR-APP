import React from 'react';
import {
  ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, TextInput, TextInputProps,
  TextProps, TextStyle, View, ViewStyle,
} from 'react-native';
import { bubble, colors, font } from '../theme';

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

export function PrimaryButton({ label, onPress, loading, disabled, style }: {
  label: string; onPress: () => void; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [s.primary, { backgroundColor: disabled ? colors.disabledBg : pressed ? colors.tealHover : colors.teal }, style]}
    >
      {loading ? <ActivityIndicator color={colors.white} /> :
        <T w="extrabold" style={{ fontSize: 16, color: disabled ? colors.disabledText : colors.white }}>{label}</T>}
    </Pressable>
  );
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
      <TextInput {...p} placeholderTextColor={colors.disabledText} style={s.field} />
    </View>
  );
}

export function CodeInput(p: TextInputProps) {
  return (
    <TextInput
      keyboardType="number-pad"
      maxLength={6}
      placeholder="••••••"
      placeholderTextColor={colors.border}
      textContentType="oneTimeCode"
      autoComplete="one-time-code"
      {...p}
      style={s.code}
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
  primary: { height: 56, alignItems: 'center', justifyContent: 'center', ...bubble(18, 6) },
  iconTile: { width: 56, height: 56, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center', ...bubble(20, 6) },
  field: {
    height: 54, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 14, fontFamily: font.semibold,
    fontSize: 16, color: colors.text, ...bubble(16, 4),
  },
  code: {
    height: 64, borderWidth: 1.5, borderColor: colors.border, textAlign: 'center', fontFamily: font.extrabold,
    fontSize: 28, letterSpacing: 12, color: colors.text, ...bubble(18, 6),
  },
  note: { backgroundColor: colors.warnBg, paddingVertical: 12, paddingHorizontal: 14 },
  screen: { flex: 1, paddingHorizontal: 24, paddingTop: 22, gap: 16, backgroundColor: colors.white },
});
