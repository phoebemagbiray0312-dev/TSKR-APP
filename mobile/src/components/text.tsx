import React from 'react';
import { Text, TextProps } from 'react-native';
import { colors, font } from '../theme';

export type W = 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold';
/** Poppins text in TSKR teal. Kept in its own file so ui.tsx and glass.tsx don't import each other. */
export function T({ w = 'regular', style, ...p }: TextProps & { w?: W }) {
  return <Text {...p} style={[{ fontFamily: font[w], color: colors.text }, style]} />;
}
