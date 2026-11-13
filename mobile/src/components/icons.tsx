import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '../theme';

// Line icons from the mockup (no emoji, per brand rules)
type P = { size?: number; color?: string; width?: number };
const base = (size: number, color: string, width: number) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color,
  strokeWidth: width, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
});

export const HomeIcon = ({ size = 22, color = colors.teal, width = 2 }: P) => (
  <Svg {...base(size, color, width)}><Path d="M3 10.5 12 3l9 7.5V21H3z" /><Path d="M9 21v-6h6v6" /></Svg>);
export const WrenchIcon = ({ size = 22, color = colors.teal, width = 2 }: P) => (
  <Svg {...base(size, color, width)}><Path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" /></Svg>);
export const CheckIcon = ({ size = 14, color = colors.white, width = 3.2 }: P) => (
  <Svg {...base(size, color, width)}><Path d="m5 12 5 5 9-10" /></Svg>);
export const BackIcon = ({ size = 20, color = colors.teal, width = 2.2 }: P) => (
  <Svg {...base(size, color, width)}><Path d="M15 18l-6-6 6-6" /></Svg>);
export const CloseIcon = ({ size = 16, color = colors.teal, width = 2.6 }: P) => (
  <Svg {...base(size, color, width)}><Path d="M6 6l12 12M18 6 6 18" /></Svg>);
export const IdIcon = ({ size = 28, color = colors.teal, width = 1.8 }: P) => (
  <Svg {...base(size, color, width)}>
    <Rect x={3} y={5} width={18} height={14} rx={2} /><Circle cx={9} cy={11} r={2.2} />
    <Path d="M5.5 16.5c.6-1.6 1.9-2.4 3.5-2.4s2.9.8 3.5 2.4M14.5 10h4M14.5 13.5h3" />
  </Svg>);
export const MailIcon = ({ size = 26, color = colors.teal, width = 1.8 }: P) => (
  <Svg {...base(size, color, width)}><Rect x={3} y={5} width={18} height={14} rx={2} /><Path d="m3 7 9 6 9-6" /></Svg>);
export const PhoneIcon = ({ size = 26, color = colors.teal, width = 1.8 }: P) => (
  <Svg {...base(size, color, width)}><Rect x={7} y={2} width={10} height={20} rx={2} /><Path d="M11 18h2" /></Svg>);
export const ChatIcon = ({ size = 26, color = colors.teal, width = 1.8 }: P) => (
  <Svg {...base(size, color, width)}><Path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></Svg>);
