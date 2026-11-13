import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, G, Mask, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { LETTERS, MORPH } from './splashData';

/**
 * Launch splash from the design (Signup.dc.html "TSKR launch splash"):
 * CLIENT and TASKER slide in, the other letters drop away, the C and the T morph into the
 * two chat bubbles of the logo, three dots pop in and type, then the splash opens as a growing circle.
 * Timeline is the same as the CSS/JS in the export (ms).
 */
const TOTAL = 4200;

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const prog = (ms: number, start: number, dur: number) => clamp((ms - start) / dur);

type Arr = readonly number[];
const lerp = (a: Arr, b: Arr, t: number) => a.map((v, i) => v + (b[i] - v) * t);
const shift = (a: Arr, dx: number) => (dx ? a.map((v, i) => (i % 2 ? v : v + dx)) : a);
const toD = (arr: Arr) => {
  let s = 'M';
  for (let i = 0; i < arr.length; i += 2) s += (i ? 'L' : '') + (arr[i] / 10).toFixed(1) + ' ' + (arr[i + 1] / 10).toFixed(1);
  return s + 'Z';
};
function morph(m: { o0: Arr; o1: Arr; o2: Arr }, ms: number, side: number) {
  const DX = 750 * side;
  if (ms < 760) return toD(m.o0);
  if (ms < 1100) return toD(lerp(m.o0, shift(m.o1, DX), easeInOut((ms - 760) / 340)));
  if (ms < 1250) return toD(shift(m.o1, DX));
  if (ms < 1850) return toD(shift(lerp(m.o1, m.o2, easeInOut((ms - 1250) / 600)), DX));
  if (ms < 2250) return toD(shift(m.o2, Math.round(DX * (1 - easeInOut((ms - 1850) / 400)))));
  return toD(m.o2);
}

// centre of each letter outline, so it shrinks around itself as it drops
function centre(d: string) {
  const n = (d.match(/-?\d+(\.\d+)?/g) || []).map(Number);
  const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}
const CL = LETTERS.cl.map((d) => ({ d, c: centre(d) }));
const TK = LETTERS.tk.map((d) => ({ d, c: centre(d) }));

function Letter({ d, c, ms, delay }: { d: string; c: { x: number; y: number }; ms: number; delay: number }) {
  const t = prog(ms, delay, 280);
  const e = t * t * t; // ease-in
  const s = 1 - 0.5 * e;
  if (t >= 1) return null;
  return (
    <G opacity={1 - e} transform={`translate(${c.x} ${c.y + 10 * e}) scale(${s}) translate(${-c.x} ${-c.y})`}>
      <Path d={d} />
    </G>
  );
}

function SplashCanvas({ ms }: { ms: number }) {
  const { width: W, height: H } = useWindowDimensions();
  const cx = W / 2, cy = H * 0.46;

  // groups slide in from the sides
  const inT = easeOut(prog(ms, 50, 450));
  // snap pulse when the bubbles land
  const sp = prog(ms, 2250, 400);
  const snap = sp < 0.45 ? 1 - 0.07 * (sp / 0.45) : 0.93 + 0.07 * easeOut((sp - 0.45) / 0.55);
  // stage fades out before the reveal
  const out = prog(ms, 3200, 300);
  // glow
  const gp = prog(ms, 0, 3500);
  const glowO = gp < 0.55 ? gp / 0.55 : 1 - 0.2 * ((gp - 0.55) / 0.45);
  const glowS = gp < 0.55 ? 0.6 + 0.4 * (gp / 0.55) : 1 + 0.15 * ((gp - 0.55) / 0.45);
  // circular reveal
  const r = 1000 * easeInOut(prog(ms, 3450, 750));

  const dots = [36.4, 50.37, 64.13].map((left, i) => {
    const pop = prog(ms, 2400 + i * 100, 300);
    const popS = pop === 0 ? 0 : pop < 1 ? Math.min(1.15, easeOut(pop) * 1.15) - (pop > 0.7 ? 0.15 * ((pop - 0.7) / 0.3) : 0) : 1;
    const typeStart = 2700 + i * 170;
    const ph = ms > typeStart ? ((ms - typeStart) % 1000) / 1000 : 0;
    const lift = ph < 0.3 ? ph / 0.3 : ph < 0.6 ? 1 - (ph - 0.3) / 0.3 : 0;
    const size = 0.106 * 170;
    return { x: -85 + (left / 100) * 170, y: -56.5 + 0.478 * 113 - lift * 0.32 * size, r: (size / 2) * popS };
  });

  return (
    <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id="bg" cx={cx} cy={cy} rx={W * 0.7} ry={H * 0.45} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#0D6176" />
          <Stop offset="0.55" stopColor="#04394A" />
          <Stop offset="1" stopColor="#022A35" />
        </RadialGradient>
        <RadialGradient id="glow" cx="0" cy="0" r="160" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#6EDA60" stopOpacity="0.30" />
          <Stop offset="0.65" stopColor="#6EDA60" stopOpacity="0" />
        </RadialGradient>
        <Mask id="reveal" x="0" y="0" width={W} height={H} maskUnits="userSpaceOnUse">
          <Rect x="0" y="0" width={W} height={H} fill="#FFFFFF" />
          {r > 0 && <Circle cx={cx} cy={cy} r={r} fill="#000000" />}
        </Mask>
      </Defs>
      <G mask="url(#reveal)">
        <Rect x="0" y="0" width={W} height={H} fill="url(#bg)" />
        <G transform={`translate(${cx} ${cy})`}>
          <G opacity={glowO} transform={`scale(${glowS})`}>
            <Circle cx="0" cy="0" r="160" fill="url(#glow)" />
          </G>
          <G opacity={1 - out} transform={`scale(${1 + 0.08 * out}) scale(${snap})`}>
            <G fill="#6EDA60" opacity={inT} transform={`translate(${-26 * (1 - inT)} 0)`}>
              {CL.map((l, i) => <Letter key={i} d={l.d} c={l.c} ms={ms} delay={500 + i * 50} />)}
              <Path fillRule="evenodd" d={morph(MORPH.c, ms, -1)} />
            </G>
            <G fill="#FFFFFF" opacity={inT} transform={`translate(${26 * (1 - inT)} 0)`}>
              <Path fillRule="evenodd" d={morph(MORPH.r, ms, 1)} />
              {TK.map((l, i) => <Letter key={i} d={l.d} c={l.c} ms={ms} delay={500 + i * 50} />)}
            </G>
            {dots.map((d, i) => d.r > 0 && <Circle key={i} cx={d.x} cy={d.y} r={d.r} fill="#FFFFFF" />)}
          </G>
        </G>
      </G>
    </Svg>
  );
}

const Ctx = createContext<{ replay: () => void }>({ replay: () => {} });
export const useSplash = () => useContext(Ctx);

/** Wrap the app: plays the intro on launch, and again whenever replay() is called (tap on the logo). */
export function SplashProvider({ children }: { children: React.ReactNode }) {
  const [run, setRun] = useState(0);
  const [ms, setMs] = useState(0);
  const [visible, setVisible] = useState(true);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    setVisible(true);
    const t0 = Date.now();
    const tick = () => {
      const t = Date.now() - t0;
      setMs(t);
      if (t < TOTAL) raf.current = requestAnimationFrame(tick);
      else setVisible(false);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [run]);

  const replay = useCallback(() => setRun((n) => n + 1), []);

  return (
    <Ctx.Provider value={{ replay }}>
      <View style={{ flex: 1 }}>
        {children}
        {visible && (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 9999 }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <SplashCanvas ms={ms} />
          </View>
        )}
      </View>
    </Ctx.Provider>
  );
}
