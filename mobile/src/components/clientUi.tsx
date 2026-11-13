import React, { useEffect, useRef } from 'react';
import { Animated, Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { usePathname, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bubble, colors } from '../theme';
import { EASE, PressScale } from './glass';
import { T } from './ui';

// ---------- icons (paths copied from design/client) ----------
export const P = {
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  pin: 'M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z',
  chevDown: 'm6 9 6 6 6-6',
  chevRight: 'm9 6 6 6-6 6',
  back: 'M15 18l-6-6 6-6',
  search: 'm20 20-3.5-3.5',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  star: 'm12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
  gift: 'M20 12v8H4v-8M2 7h20v5H2zM12 22V7M12 7H8a2.5 2.5 0 1 1 0-5c3 0 4 5 4 5zM12 7h4a2.5 2.5 0 1 0 0-5c-3 0-4 5-4 5z',
  filters: 'M4 7h10M18 7h2M4 17h4M12 17h8',
  crown: 'M3 18 2 7l5.5 4L12 4l4.5 7L22 7l-1 11z',
  badge: 'M12 2l2.4 1.8 3-.2.9 2.9 2.5 1.7-.9 2.8.9 2.8-2.5 1.7-.9 2.9-3-.2L12 22l-2.4-1.8-3 .2-.9-2.9-2.5-1.7.9-2.8-.9-2.8 2.5-1.7.9-2.9 3 .2z',
  heart: 'M12 20.5s-7.5-4.6-9.3-9.4C1.5 7.7 3.8 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.4 0 5.7 3.2 4.5 6.6-1.8 4.8-9.3 9.4-9.3 9.4z',
  share: 'M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13',
  clock: 'M12 7v5l3 2',
  shield: 'M12 3 4 6v6c0 5 3.4 8.6 8 9.9 4.6-1.3 8-4.9 8-9.9V6z',
  route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 15V9a3 3 0 0 1 3-3h6M18 9v6a3 3 0 0 1-3 3H9',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'm5 12 5 5 9-10',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  navHome: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  navCal: 'M3 9h18M8 2v4M16 2v4',
  navUser: 'M4 21a8 8 0 0 1 16 0',
  bubble: 'M20 4h40a16 16 0 0 1 16 16v20a16 16 0 0 1-16 16H30l-14 12 2-12A16 16 0 0 1 4 40V20A16 16 0 0 1 20 4z',
};

// Category / service icons (design `icons` + `exIcons`)
export const CAT_ICON: Record<string, string> = {
  repairs: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
  tech: 'M4 5h16v11H4zM2 19h20',
  delivery: 'M2 6h12v10H2zM14 9h4l4 4v3h-8M5 18.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M16 18.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
  lessons: 'M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5zM4 19.5A1.5 1.5 0 0 0 5.5 21H20M8 7h8M8 11h6',
  health: 'M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z',
  care: 'M12 20.5s-7.5-4.6-9.3-9.4C1.5 7.7 3.8 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.4 0 5.7 3.2 4.5 6.6-1.8 4.8-9.3 9.4-9.3 9.4z',
  garden: 'M12 21v-9M12 12C12 7 8.5 4 3 4c0 5 3.5 8 9 8zM12 14c0-4 3-7 9-7 0 4.5-3 7-9 7z',
  pets: 'M6.5 7.5a1.5 2 0 1 0 3 0a1.5 2 0 1 0-3 0M14.5 7.5a1.5 2 0 1 0 3 0a1.5 2 0 1 0-3 0M3 12a1.5 1.8 0 1 0 3 0a1.5 1.8 0 1 0-3 0M18 12a1.5 1.8 0 1 0 3 0a1.5 1.8 0 1 0-3 0M12 13c-3 0-5.5 3.2-5.5 5.2A1.8 1.8 0 0 0 8.3 20c1.3 0 2.4-.7 3.7-.7s2.4.7 3.7.7a1.8 1.8 0 0 0 1.8-1.8C17.5 16.2 15 13 12 13z',
  auto: 'M3 16v-3l2-5a2 2 0 0 1 1.9-1.3h10.2A2 2 0 0 1 19 8l2 5v3H3zM5.7 16.5a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0M14.7 16.5a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0',
  cleaning: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM9 13a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  events: 'M9 3h6v10a3 3 0 0 1-6 0zM5 11a7 7 0 0 0 14 0M12 18v3M8 21h8',
  fitness: 'M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12',
  scissors: 'M3 6a3 3 0 1 0 6 0a3 3 0 1 0-6 0M3 18a3 3 0 1 0 6 0a3 3 0 1 0-6 0M8.1 8.1 20 20M8.1 15.9 20 4',
};

export function Ic({ d, size = 20, color = colors.teal, w = 2, fill = 'none', children }: {
  d?: string; size?: number; color?: string; w?: number; fill?: string; children?: React.ReactNode;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={fill === 'none' ? color : 'none'}
      strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">
      {d ? <Path d={d} /> : null}
      {children}
    </Svg>
  );
}
export const StarIc = ({ size = 13 }: { size?: number }) => <Ic d={P.star} size={size} fill="#F59E0B" />;
export const VerifiedIc = ({ size = 18 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d={P.badge} fill={colors.teal} />
    <Path d="m8.5 12 2.3 2.3 4.7-4.6" stroke="#6EDA60" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
export const SearchIc = ({ size = 20, color = '#5B6472' }) => (
  <Ic size={size} color={color}><Circle cx={11} cy={11} r={7} /><Path d={P.search} /></Ic>
);

// ---------- glossy fills (design "gloss layer") ----------
let gid = 0;
export function TealGloss({ r = 0 }: { r?: number }) {
  const id = useRef(`tg${++gid}`).current;
  return (
    <Svg style={[StyleSheet.absoluteFill, { borderRadius: r }]} width="100%" height="100%">
      <Defs>
        <LinearGradient id={`${id}a`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#0E7C95" /><Stop offset="0.7" stopColor="#044D5E" />
        </LinearGradient>
        <LinearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.28" /><Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.05" />
          <Stop offset="1" stopColor="#000000" stopOpacity="0.1" />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id}a)`} />
      <Rect width="100%" height="100%" fill={`url(#${id}b)`} />
    </Svg>
  );
}
export function GreenFill() {
  const id = useRef(`gf${++gid}`).current;
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        <LinearGradient id={`${id}a`} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#93EA86" /><Stop offset="1" stopColor="#5FCF51" /></LinearGradient>
        <LinearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.45" /><Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.08" />
          <Stop offset="1" stopColor="#000000" stopOpacity="0.06" />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id}a)`} />
      <Rect width="100%" height="100%" fill={`url(#${id}b)`} />
    </Svg>
  );
}
/** The curved teal header: deep gradient with a soft green glow in the top-right corner. */
export function HeaderFill() {
  const id = useRef(`hf${++gid}`).current;
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        <LinearGradient id={`${id}a`} x1="0" y1="0" x2="0.6" y2="1">
          <Stop offset="0" stopColor="#0B6F86" /><Stop offset="0.55" stopColor="#044D5E" /><Stop offset="1" stopColor="#03404E" />
        </LinearGradient>
        <RadialGradient id={`${id}b`} cx="100%" cy="0%" rx="70%" ry="80%">
          <Stop offset="0" stopColor="#6EDA60" stopOpacity="0.28" /><Stop offset="1" stopColor="#6EDA60" stopOpacity="0" />
        </RadialGradient>
        <LinearGradient id={`${id}c`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.14" /><Stop offset="0.45" stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id}a)`} />
      <Rect width="100%" height="100%" fill={`url(#${id}b)`} />
      <Rect width="100%" height="100%" fill={`url(#${id}c)`} />
    </Svg>
  );
}

/** Horizontal tskr logo with the three typing dots (design .tskr-hlogo). */
function HDot({ left, h, delay }: { left: number; h: number; delay: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    const t = setTimeout(() => {
      loop = Animated.loop(Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 420, useNativeDriver: true }),
        Animated.delay(560),
      ]));
      loop.start();
    }, delay);
    return () => { clearTimeout(t); loop?.stop(); };
  }, []);
  const w = h * (350 / 96);
  const size = w * 0.0375;
  return (
    <Animated.View style={{
      position: 'absolute', left: left * w, top: 0.416 * h, width: size, height: size, borderRadius: size, backgroundColor: '#FFF',
      opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
      transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -0.38 * size] }) }],
    }} />
  );
}
export function HeaderLogo({ height = 28 }: { height?: number }) {
  return (
    <View style={{ height, width: height * (350 / 96) }}>
      <Image source={require('../../assets/logo-header.png')} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
      {[0.131, 0.1885, 0.2455].map((l, i) => <HDot key={i} left={l} h={height} delay={i * 180} />)}
    </View>
  );
}

// ---------- small pieces ----------
export function Chip({ label, on, onPress, icon }: { label: string; on?: boolean; onPress: () => void; icon?: string }) {
  return (
    <PressScale onPress={onPress} style={[s.chip, on ? s.chipOn : s.chipOff]} accessibilityState={{ selected: !!on }}>
      {on && <TealGloss r={999} />}
      {icon ? <Ic d={icon} size={16} fill={on ? '#FFFFFF' : colors.teal} /> : null}
      <T w="bold" style={{ fontSize: 15, color: on ? '#FFFFFF' : colors.teal }}>{label}</T>
    </PressScale>
  );
}

export function MiniAvatar({ initials, color, size = 28, r = 9 }: { initials: string; color: string; size?: number; r?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: r, backgroundColor: color, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <T w="extrabold" style={{ color: '#FFF', fontSize: Math.max(9, Math.round(size / 3)) }}>{initials}</T>
    </View>
  );
}

export function RoundButton({ d, onPress, label, size = 44, glass = true, color = colors.teal, fill = 'none', children, style }: {
  d?: string; onPress?: () => void; label: string; size?: number; glass?: boolean; color?: string; fill?: string;
  children?: React.ReactNode; style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressScale onPress={onPress} accessibilityLabel={label}
      style={[{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' },
        glass && s.roundGlass, style]}>
      {children ?? <Ic d={d} color={color} fill={fill} />}
    </PressScale>
  );
}

/** Toast that drops in from the top (design role=status). */
export function Toast({ text, top = 16, left = 16 }: { text: string; top?: number; left?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: text ? 1 : 0, duration: 450, easing: EASE, useNativeDriver: true }).start();
  }, [text]);
  if (!text) return null;
  return (
    <Animated.View pointerEvents="none" accessibilityLiveRegion="polite" style={[s.toast, { top, left }, {
      opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
    }]}>
      <View style={s.toastCheck}><Ic d={P.check} size={14} color={colors.teal} w={3} /></View>
      <T w="semibold" numberOfLines={2} style={{ color: '#FFF', fontSize: 14, flex: 1 }}>{text}</T>
    </Animated.View>
  );
}

// ---------- floating bottom nav (design: liquid-glass pill) ----------
const NAV_ON = ['/home', '/explore', '/bookings', '/account'];
export function BottomNav() {
  const path = usePathname();
  const insets = useSafeAreaInsets();
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(rise, { toValue: 1, duration: 500, easing: EASE, useNativeDriver: true }).start(); }, []);
  if (!NAV_ON.includes(path)) return null;
  const tab = path === '/bookings' ? 'bookings' : path === '/account' ? 'account' : 'home';
  const item = (id: string, label: string, icon: React.ReactNode, href: string) => {
    const on = tab === id;
    return (
      <PressScale key={id} onPress={() => (path === href ? null : router.replace(href as any))} accessibilityLabel={label}
        accessibilityState={{ selected: on }} outer={{ flex: 1 }} style={[s.navBtn]}>
        {on && <View style={[StyleSheet.absoluteFill, { borderRadius: 999, overflow: 'hidden' }]}><GreenFill /></View>}
        {icon}
        <T w="bold" style={{ fontSize: 11, color: on ? colors.teal : colors.muted }}>{label}</T>
      </PressScale>
    );
  };
  const c = (id: string) => (tab === id ? colors.teal : colors.muted);
  return (
    <Animated.View style={[s.nav, { bottom: Math.max(14, insets.bottom), opacity: rise,
      transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
      {item('home', 'Home', <Ic d={P.navHome} size={22} color={c('home')} />, '/home')}
      {item('bookings', 'Bookings', <Ic size={22} color={c('bookings')}><Rect x={3} y={4} width={18} height={17} rx={3} /><Path d={P.navCal} /></Ic>, '/bookings')}
      {item('account', 'Account', <Ic size={22} color={c('account')}><Circle cx={12} cy={8} r={4} /><Path d={P.navUser} /></Ic>, '/account')}
    </Animated.View>
  );
}

export const s = StyleSheet.create({
  chip: { height: 44, paddingHorizontal: 18, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, overflow: 'hidden' },
  chipOn: { borderColor: colors.teal, backgroundColor: colors.teal },
  chipOff: { borderColor: 'rgba(255,255,255,0.85)', backgroundColor: 'rgba(255,255,255,0.55)' },
  roundGlass: {
    backgroundColor: 'rgba(255,255,255,0.78)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  toast: {
    position: 'absolute', right: 16, zIndex: 50, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, paddingHorizontal: 14,
    borderRadius: 16, backgroundColor: 'rgba(4,77,94,0.9)',
    shadowColor: '#044D5E', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 10 }, elevation: 8,
  },
  toastCheck: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  nav: {
    position: 'absolute', left: 16, right: 16, height: 68, borderRadius: 999, padding: 6, flexDirection: 'row', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)',
    shadowColor: '#044D5E', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 14 }, elevation: 10,
  },
  navBtn: { flex: 1, height: 56, borderRadius: 999, alignItems: 'center', justifyContent: 'center', gap: 2, overflow: 'hidden' },
  card: { ...bubble(20, 6) },
});
