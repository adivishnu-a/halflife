"use client";

import { useEffect, useRef } from "react";

/** A number that counts up once over 500 ms, decelerating. Static under reduced motion. */
export function CountUp({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || to === 0) {
      el.textContent = `${to}${suffix}`;
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 500);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = `${Math.round(to * eased)}${suffix}`;
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to, suffix]);
  // Server-rendered with the final value, so the number is right even before hydration.
  return (
    <span ref={ref} className="tabular-nums">
      {to}
      {suffix}
    </span>
  );
}
