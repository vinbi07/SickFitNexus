import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { MAP_PLACES } from "@/lib/mapPlaces";
import { STATE_COORDINATES } from "@/lib/usStates";
import { formatCurrency, formatNumber } from "@/utils/format";
import { STATE_LABEL_NUDGE, US_NATION, US_STATE_BORDERS, US_STATE_FEATURES, isLabelledState, stateCode } from "./geo";
import { MapDefs } from "./MapDefs";
import { MapTooltip, useMapTooltip } from "./MapTooltip";
import { SockMarker } from "./SockMarker";
import { useMapIntro } from "./useMapIntro";

const WIDTH = 1000;
const HEIGHT = 560;

const PROJECTION = geoAlbersUsa().fitExtent(
  [
    [16, 16],
    [WIDTH - 16, HEIGHT - 16],
  ],
  US_NATION,
);
const PATH = geoPath(PROJECTION);

const STATIC = {
  land: PATH(US_NATION) ?? "",
  borders: PATH(US_STATE_BORDERS) ?? "",
  labels: US_STATE_FEATURES.flatMap((stateFeature) => {
    const code = stateCode(stateFeature);
    if (!isLabelledState(code) || PATH.area(stateFeature) < 300) return [];
    const [x, y] = PATH.centroid(stateFeature);
    if (Number.isNaN(x)) return [];
    const [dx, dy] = STATE_LABEL_NUDGE[code] ?? [0, 0];
    return [{ code, x: x + dx, y: y + dy }];
  }),
};

const HOME = (PROJECTION(MAP_PLACES.homeBase.coordinates) ?? [WIDTH / 2, HEIGHT / 2]) as [number, number];

export interface RetailMapRegion {
  state: string;
  count: number;
  value: number;
  units: number;
  tone: string;
  firstPoint: { poId: string; account: string };
}

const TONE_LABEL: Record<string, string> = {
  danger: "Late",
  warning: "Needs attention",
  success: "In route",
  info: "Open",
};

/** Curved arc from HQ to a store, bowed upward like a flight path. */
function arcPath(to: [number, number]) {
  const mx = (HOME[0] + to[0]) / 2;
  const my = Math.min(HOME[1], to[1]) - Math.max(30, Math.hypot(to[0] - HOME[0], to[1] - HOME[1]) * 0.25);
  return `M${HOME[0]},${HOME[1]} Q${mx},${my} ${to[0]},${to[1]}`;
}

export function RetailPoMap({ regions, previewMode }: { regions: RetailMapRegion[]; previewMode: boolean }) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const { tip, show, hide } = useMapTooltip(containerRef);
  const progress = useMapIntro("retail");

  const points = regions.flatMap((region) => {
    const coordinates = STATE_COORDINATES[region.state];
    const xy = coordinates ? PROJECTION(coordinates) : null;
    return xy ? [{ region, xy: xy as [number, number] }] : [];
  });
  const openRegion = (region: RetailMapRegion) =>
    navigate(previewMode ? "/purchase-orders" : `/purchase-orders/${region.firstPoint.poId}`);

  return (
    <div className="map-frame" ref={containerRef}>
      <svg
        className="map-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Map of open retail purchase orders shipping from Glenn Heights"
      >
        <MapDefs />
        <rect width={WIDTH} height={HEIGHT} fill="url(#mapWater)" />
        <path className="map-land" d={STATIC.land} filter="url(#mapLandShadow)" />
        <path className="map-borders map-borders-states" d={STATIC.borders} />
        <path className="map-nation-outline" d={STATIC.land} />
        {STATIC.labels.map((label) => (
          <text key={label.code} className="map-state-label" x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle">
            {label.code}
          </text>
        ))}

        <g className="map-routes">
          {points.map(({ region, xy }) => (
            <g key={region.state}>
              <path
                className={`map-arc map-arc-${region.tone}`}
                d={arcPath(xy)}
                pathLength={1}
                style={{ strokeDashoffset: 1 - progress }}
              />
              <path className={`map-arc-flow map-arc-flow-${region.tone}`} d={arcPath(xy)} style={{ opacity: progress }} />
            </g>
          ))}
        </g>

        <g className="map-node">
          <circle className="map-home-dot" cx={HOME[0]} cy={HOME[1]} r={6} />
          <text className="map-node-label map-home-label" x={HOME[0] + 10} y={HOME[1] + 20}>
            Ships from Glenn Heights
          </text>
        </g>

        {points.map(({ region, xy }) => {
          const size = Math.max(16, Math.min(30, 12 + region.count * 3));
          // Markers rise out of HQ along their arc as the intro plays.
          const x = HOME[0] + (xy[0] - HOME[0]) * progress;
          const y = HOME[1] + (xy[1] - HOME[1]) * progress;
          return (
            <g key={region.state}>
              <SockMarker
                x={x}
                y={y}
                size={size}
                tone={region.tone}
                pulse={region.tone === "danger"}
                label={`${region.state}: ${region.count} open PO${region.count === 1 ? "" : "s"}`}
                onActivate={() => openRegion(region)}
                onShowTip={(anchor) =>
                  show(
                    anchor,
                    <>
                      <strong>
                        {region.state} · {region.count} open PO{region.count === 1 ? "" : "s"}
                      </strong>
                      <span>{TONE_LABEL[region.tone] ?? "Open"}</span>
                      <span>
                        {formatCurrency(region.value)} · {formatNumber(region.units)} units
                      </span>
                      <span>Latest: {region.firstPoint.account}</span>
                      <em>Click to open the PO</em>
                    </>,
                  )
                }
                onHideTip={hide}
              />
              <text className="map-marker-label" x={x + size * 0.6} y={y + 4} style={{ opacity: progress }}>
                {region.state} · {region.count}
              </text>
            </g>
          );
        })}
      </svg>
      <MapTooltip tip={tip} containerRef={containerRef} />
    </div>
  );
}
