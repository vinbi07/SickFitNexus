import type { FocusEvent, KeyboardEvent, MouseEvent } from "react";

// Sock silhouette in a 24-unit box, centred on the cuff/heel junction.
const SOCK_PATH =
  "M-4.5,-12 L3.5,-12 L3.5,0.5 C3.5,2.8 5.2,3.8 8,3.8 C11.2,3.8 12.6,5.8 12.6,8 C12.6,10.2 11.2,11.6 9,11.6 L-1,11.6 C-4.2,11.6 -5.6,9.4 -5.4,6.8 Z";

export function SockMarker({
  x,
  y,
  size,
  tone,
  pulse = false,
  selected = false,
  label,
  onActivate,
  onShowTip,
  onHideTip,
}: {
  x: number;
  y: number;
  /** Rendered height in SVG units. */
  size: number;
  /** Maps to a .map-tone-* class. */
  tone: string;
  pulse?: boolean;
  selected?: boolean;
  label: string;
  onActivate?: () => void;
  onShowTip?: (anchor: { clientX: number; clientY: number }) => void;
  onHideTip?: () => void;
}) {
  const scale = size / 24;

  const showAtElement = (event: FocusEvent<SVGGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onShowTip?.({ clientX: rect.right, clientY: rect.top + rect.height / 2 });
  };

  return (
    <g
      className={`sock-marker map-tone-${tone}${onActivate ? " is-interactive" : ""}${selected ? " is-selected" : ""}`}
      transform={`translate(${x} ${y})`}
      role={onActivate ? "link" : "img"}
      tabIndex={onActivate ? 0 : undefined}
      aria-label={label}
      onClick={onActivate}
      onKeyDown={(event: KeyboardEvent<SVGGElement>) => {
        if (!onActivate) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActivate();
        }
      }}
      onMouseMove={(event: MouseEvent<SVGGElement>) => onShowTip?.(event)}
      onMouseLeave={onHideTip}
      onFocus={showAtElement}
      onBlur={onHideTip}
    >
      {selected ? <circle className="sock-marker-halo" r={size * 0.62} /> : null}
      {pulse ? <circle className="sock-marker-pulse" r={size * 0.55} /> : null}
      <g transform={`scale(${scale})`}>
        <path className="sock-marker-shadow" d={SOCK_PATH} transform="translate(1.2 1.6)" />
        <path className="sock-marker-body" d={SOCK_PATH} strokeWidth={2 / scale} />
        <rect className="sock-marker-cuff" x={-4.5} y={-9.6} width={8} height={1.6} />
        <rect className="sock-marker-cuff" x={-4.5} y={-6.8} width={8} height={1.6} />
      </g>
    </g>
  );
}
