import { useEffect, useState } from "react";

const DURATION_MS = 1200;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// Exponential ease-out: quick start, long gentle settle.
function easeOutExpo(t: number) {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

/**
 * Eased 0 → 1 progress that replays whenever `key` changes (e.g. switching
 * map views). Returns 1 straight away when the viewer prefers reduced motion.
 */
export function useMapIntro(key: string) {
  const [progress, setProgress] = useState(() => (prefersReducedMotion() ? 1 : 0));

  useEffect(() => {
    if (prefersReducedMotion()) {
      setProgress(1);
      return;
    }
    let frame = 0;
    const start = performance.now();
    setProgress(0);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      setProgress(easeOutExpo(t));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [key]);

  return progress;
}
