import { useCallback, useRef, useState, type ReactNode, type RefObject } from "react";

export interface MapTip {
  x: number;
  y: number;
  content: ReactNode;
}

/**
 * Hover/focus card state for a map. Positions are relative to the map
 * container so the card scrolls and goes fullscreen with it.
 */
export function useMapTooltip(containerRef: RefObject<HTMLElement | null>) {
  const [tip, setTip] = useState<MapTip | null>(null);

  const show = useCallback(
    (anchor: { clientX: number; clientY: number }, content: ReactNode) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setTip({ x: anchor.clientX - rect.left, y: anchor.clientY - rect.top, content });
    },
    [containerRef],
  );
  const hide = useCallback(() => setTip(null), []);

  return { tip, show, hide };
}

export function MapTooltip({ tip, containerRef }: { tip: MapTip | null; containerRef: RefObject<HTMLElement | null> }) {
  const cardRef = useRef<HTMLDivElement>(null);
  if (!tip) return null;

  // Keep the card inside the map: flip left/up near the right/bottom edges.
  const width = containerRef.current?.clientWidth ?? 0;
  const height = containerRef.current?.clientHeight ?? 0;
  const cardWidth = cardRef.current?.offsetWidth ?? 260;
  const cardHeight = cardRef.current?.offsetHeight ?? 120;
  const left = tip.x + 14 + cardWidth > width ? tip.x - cardWidth - 14 : tip.x + 14;
  const top = Math.min(Math.max(8, tip.y + 14), Math.max(8, height - cardHeight - 8));

  return (
    <div ref={cardRef} className="map-tooltip" role="tooltip" style={{ left: Math.max(8, left), top }}>
      {tip.content}
    </div>
  );
}
