import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '../theme';
import { T } from './text';
import { PressScale } from './glass';
import { GreenFill, Ic, P } from './clientUi';

const TABS: [string, string, React.ReactNode | ((c: string) => React.ReactNode)][] = [
  ['/work/home', 'Home', (c: string) => <Ic d={P.navHome} size={21} color={c} />],
  ['/work/jobs', 'Job', (c: string) => <Ic size={21} color={c}><Rect x={3} y={7} width={18} height={13} rx={2} /><Path d="M9 7V5h6v2" /></Ic>],
  ['/work/skills', 'Skills', (c: string) => <Ic d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" size={21} color={c} />],
  ['/work/wallet', 'Wallet', (c: string) => <Ic size={21} color={c}><Rect x={3} y={6} width={18} height={14} rx={3} /><Path d="M3 10h18M16 15h2" /></Ic>],
  ['/work/me', 'Me', (c: string) => <Ic size={21} color={c}><Circle cx={12} cy={8} r={4} /><Path d={P.navUser} /></Ic>],
];

/** Design: tasker BOTTOM NAV (Home, Job, Skills, Wallet, Me). */
export function TaskerNav() {
  const path = usePathname();
  const insets = useSafeAreaInsets();
  if (!TABS.some(([h]) => h === path)) return null;
  return (
    <View style={[st.nav, { bottom: Math.max(14, insets.bottom) }]}>
      <BlurView intensity={40} tint="light" style={[StyleSheet.absoluteFill, { borderRadius: 999, overflow: 'hidden' }]} />
      {TABS.map(([href, label, icon]) => {
        const on = path === href;
        const c = on ? colors.teal : colors.muted;
        return (
          <PressScale key={href} outer={{ flex: 1 }} style={st.btn} accessibilityLabel={label} accessibilityState={{ selected: on }}
            onPress={() => (on ? null : router.replace(href as any))}>
            {on && <View style={[StyleSheet.absoluteFill, { borderRadius: 999, overflow: 'hidden' }]}><GreenFill /></View>}
            {typeof icon === 'function' ? icon(c) : icon}
            <T w="bold" style={{ fontSize: 10, color: c }}>{label}</T>
          </PressScale>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  nav: {
    position: 'absolute', left: 12, right: 12, height: 66, borderRadius: 999, padding: 5, flexDirection: 'row', gap: 2, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)',
  },
  btn: { flex: 1, height: 56, borderRadius: 999, alignItems: 'center', justifyContent: 'center', gap: 2, overflow: 'hidden' },
});
