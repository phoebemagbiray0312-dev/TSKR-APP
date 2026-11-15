'use client';
import { useEffect } from 'react';

/** Tab icon with the same three "typing" dots as the logo (1.4s loop, 0.18s apart). */
const DOTS: [number, number][] = [[88.71, 116.18], [119.54, 116.18], [150.1, 116.18]];
const SIZE = 20.11;
const S = 64; // drawn size of the tab icon
const K = S / 256;

export default function AnimatedFavicon() {
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    // reuse the icon link Next.js put in <head> (removing it would upset React), add one if missing
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    const original = link.href;
    const canvas = document.createElement('canvas'); canvas.width = S; canvas.height = S;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const base = new Image(); base.src = '/favicon-base.png';
    let timer = 0; const t0 = performance.now();
    const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
    const draw = () => {
      const t = (performance.now() - t0) / 1000;
      ctx.clearRect(0, 0, S, S);
      ctx.drawImage(base, 0, 0, S, S);
      DOTS.forEach(([x, y], i) => {
        const p = (((t - i * 0.18) % 1.4) + 1.4) % 1.4 / 1.4; // 0..1 in the loop
        const up = p < 0.3 ? ease(p / 0.3) : p < 0.6 ? ease(1 - (p - 0.3) / 0.3) : 0; // keyframes 0%, 30%, 60%
        const r = (SIZE * K) / 2;
        ctx.globalAlpha = 0.45 + 0.55 * up;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(x * K + r, y * K + r - up * 0.38 * SIZE * K, r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      link!.href = canvas.toDataURL('image/png');
    };
    base.onload = () => { draw(); timer = window.setInterval(draw, 100); };
    return () => { window.clearInterval(timer); if (link) link.href = original; };
  }, []);
  return null;
}
