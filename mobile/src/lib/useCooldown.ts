import { useEffect, useState } from 'react';

/** Seconds left before "Resend code" works again (Guide §2.1: resend after a cooldown). */
export function useCooldown() {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return { left, start: (secs: number) => setLeft(secs) };
}

/** Pull "Please wait N seconds" out of a server error, if that's what it is. */
export function waitSeconds(msg: string): number | null {
  const m = /wait (\d+) seconds/i.exec(msg);
  return m ? Number(m[1]) : null;
}
