import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { geoEquirectangular, geoGraticule10, geoInterpolate, geoPath } from "d3-geo";
import { useAsyncData } from "@/hooks/useAsyncData";
import { MAP_PLACES, SUPPLY_ROUTES, type MapPlaceId, type RouteLeg } from "@/lib/mapPlaces";
import { supplyChainService } from "@/services/supplyChainService";
import { formatDateOnly, formatNumber } from "@/utils/format";
import { DEFAULT_LEAD_TIME_SETTINGS } from "@/utils/leadTime";
import { fanOut, orderMapPosition, type SupplyChainMapOrder } from "@/utils/supplyChainMap";
import { US_STATE_BORDERS, WORLD_BORDERS, WORLD_LAND } from "./geo";
import { MapDefs } from "./MapDefs";
import { MapTooltip, useMapTooltip } from "./MapTooltip";
import { SockMarker } from "./SockMarker";
import { useMapIntro } from "./useMapIntro";

const WIDTH = 1000;
const HEIGHT = 460;

// Pacific-centred so the whole journey, Guangdong to Kentucky, reads left to right.
const PROJECTION = geoEquirectangular()
  .rotate([-195, 0])
  .fitExtent(
    [
      [24, 24],
      [WIDTH - 24, HEIGHT - 24],
    ],
    { type: "MultiPoint", coordinates: [[104, 12], [104, 52], [-72, 52], [-72, 12]] },
  );
const PATH = geoPath(PROJECTION);

const STATIC_PATHS = {
  graticule: PATH(geoGraticule10()) ?? "",
  land: PATH(WORLD_LAND) ?? "",
  countries: PATH(WORLD_BORDERS) ?? "",
  states: PATH(US_STATE_BORDERS) ?? "",
};

// Every leg drawn once, plus the Houston → Glenn Heights hop for air freight picked up at HQ.
const LEGS: RouteLeg[] = [
  ...SUPPLY_ROUTES.Sea,
  ...SUPPLY_ROUTES.Air,
  { from: "usAirPort", to: "homeBase", kind: "truck" },
];

function legPath(leg: RouteLeg) {
  return (
    PATH({ type: "LineString", coordinates: [MAP_PLACES[leg.from].coordinates, MAP_PLACES[leg.to].coordinates] }) ?? ""
  );
}

const NODE_IDS: MapPlaceId[] = ["factory", "seaPort", "usSeaPort", "usAirPort", "homeBase", "warehouse"];

// Label placement per stop, in SVG units relative to the node.
const NODE_LABEL: Partial<Record<MapPlaceId, { dx: number; dy: number; anchor: "start" | "end" }>> = {
  factory: { dx: 9, dy: -8, anchor: "start" },
  seaPort: { dx: 9, dy: 16, anchor: "start" },
  usSeaPort: { dx: 9, dy: -8, anchor: "start" },
  usAirPort: { dx: 9, dy: 16, anchor: "start" },
  homeBase: { dx: -9, dy: -8, anchor: "end" },
  warehouse: { dx: -9, dy: -8, anchor: "end" },
};

function project(coordinates: [number, number]) {
  return (PROJECTION(coordinates) ?? [0, 0]) as [number, number];
}

function linePath(a: [number, number], b: [number, number]) {
  return PATH({ type: "LineString", coordinates: [a, b] }) ?? "";
}

/**
 * The selected order's own journey drawn over the base routes: solid where
 * the goods have been, dashed where they are still headed.
 */
function SelectedRoute({ order, today }: { order: SupplyChainMapOrder; today: string }) {
  const [toPort, longHaul, toWarehouse] = SUPPLY_ROUTES[order.shipMode];
  const at = (id: MapPlaceId) => MAP_PLACES[id].coordinates;
  const leftFactory = Boolean(order.chain[4]?.date);
  const delivered = Boolean(order.chain[7]?.date);
  const position = orderMapPosition(order, today);
  const landed = ["Labels created", "At US port", "Received"].includes(order.stage ?? "");

  let crossed = "";
  let ahead = linePath(at(longHaul.from), at(longHaul.to));
  if (landed) {
    crossed = ahead;
    ahead = "";
  } else if (position.fraction != null) {
    crossed = linePath(at(longHaul.from), position.coordinates);
    ahead = linePath(position.coordinates, at(longHaul.to));
  }

  return (
    <g className="map-selected-route" aria-hidden="true">
      <path className={`map-sel map-sel-pack${leftFactory ? "" : " is-ahead"}`} d={linePath(at(toPort.from), at(toPort.to))} />
      {crossed ? <path className="map-sel map-sel-ship" d={crossed} /> : null}
      {ahead ? <path className="map-sel map-sel-ship is-ahead" d={ahead} /> : null}
      <path
        className={`map-sel map-sel-recv${delivered ? "" : " is-ahead"}`}
        d={linePath(at(toWarehouse.from), at(toWarehouse.to))}
      />
    </g>
  );
}

function midpointLabel(from: MapPlaceId, to: MapPlaceId) {
  return project(geoInterpolate(MAP_PLACES[from].coordinates, MAP_PLACES[to].coordinates)(0.5) as [number, number]);
}

export function SupplyChainMap({
  orders,
  today,
  selectedId = null,
  onSelect,
}: {
  orders: SupplyChainMapOrder[];
  today: string;
  selectedId?: string | null;
  /** When set, clicking a marker selects its order instead of opening it. */
  onSelect?: (poId: string) => void;
}) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const { tip, show, hide } = useMapTooltip(containerRef);
  const progress = useMapIntro("supply");
  const { data: leadTimes } = useAsyncData(
    () => supplyChainService.getSettings().catch(() => DEFAULT_LEAD_TIME_SETTINGS),
    [],
  );
  const settings = leadTimes ?? DEFAULT_LEAD_TIME_SETTINGS;

  const placed = fanOut(
    orders.map((order) => {
      const position = orderMapPosition(order, today);
      return { item: { order, position }, point: project(position.coordinates) };
    }),
  );

  const nodeSub: Record<MapPlaceId, string> = {
    factory: `Production about ${settings.prod_days} days`,
    seaPort: "Sea freight departs",
    airPort: "Air freight departs",
    usSeaPort: `Sea transit planned ${settings.sea_days} days`,
    usAirPort: "Air freight lands here, then ground freight",
    homeBase: "SickFit headquarters",
    warehouse: "3PL warehouse",
  };
  const sea = midpointLabel("seaPort", "usSeaPort");
  const air = midpointLabel("airPort", "usAirPort");

  return (
    <div className="map-frame" ref={containerRef}>
      <svg
        className="map-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Map of factory orders moving from the factory in Guangdong to the Louisville warehouse"
      >
        <MapDefs />
        <rect width={WIDTH} height={HEIGHT} fill="url(#mapWater)" />
        <path className="map-graticule" d={STATIC_PATHS.graticule} />
        <path className="map-land" d={STATIC_PATHS.land} filter="url(#mapLandShadow)" />
        <path className="map-borders" d={STATIC_PATHS.countries} />
        <path className="map-borders map-borders-fine" d={STATIC_PATHS.states} />

        <g className="map-routes" style={{ opacity: progress }}>
          {LEGS.map((leg) => (
            <g key={`${leg.from}-${leg.to}`}>
              <path className={`map-route map-route-${leg.kind}`} d={legPath(leg)} />
              <path className={`map-route-flow map-route-flow-${leg.kind}`} d={legPath(leg)} />
            </g>
          ))}
          <text className="map-route-label" x={sea[0]} y={sea[1] + 20} textAnchor="middle">
            Sea route · about {settings.sea_days} days
          </text>
          <text className="map-route-label" x={air[0]} y={air[1] - 10} textAnchor="middle">
            Air route · about {settings.air_days} days
          </text>
        </g>

        {(() => {
          const selected = orders.find((order) => order.poId === selectedId);
          return selected ? <SelectedRoute order={selected} today={today} /> : null;
        })()}

        {NODE_IDS.map((id) => {
          const [x, y] = project(MAP_PLACES[id].coordinates);
          const label = NODE_LABEL[id] ?? { dx: 9, dy: -8, anchor: "start" as const };
          return (
            <g
              key={id}
              className="map-node"
              onMouseMove={(event) =>
                show(
                  event,
                  <>
                    <strong>{MAP_PLACES[id].name}</strong>
                    <span>{nodeSub[id]}</span>
                  </>,
                )
              }
              onMouseLeave={hide}
            >
              <circle className="map-node-hit" cx={x} cy={y} r={16} />
              <circle className="map-node-dot" cx={x} cy={y} r={4.5} />
              <text className="map-node-label" x={x + label.dx} y={y + label.dy} textAnchor={label.anchor}>
                {MAP_PLACES[id].label}
              </text>
            </g>
          );
        })}

        {placed.map(({ item, point }) => {
          const { order, position } = item;
          // Glide from the start of the current leg to today's position.
          const target = project(position.coordinates);
          const along = project(geoInterpolate(position.origin, position.coordinates)(progress) as [number, number]);
          const x = along[0] + (point[0] - target[0]) * progress;
          const y = along[1] + (point[1] - target[1]) * progress;
          const isSelected = order.poId === selectedId;
          const size = Math.max(12, Math.min(28, 7 + Math.sqrt(order.units) / 3.5)) * (isSelected ? 1.2 : 1);
          return (
            <SockMarker
              key={order.poId}
              x={x}
              y={y}
              size={size}
              tone={order.late ? "late" : position.tone}
              selected={isSelected}
              pulse={order.late}
              label={`${order.poNumber}: ${order.stage ?? "Not sent"}, ${position.where}`}
              onActivate={() => (onSelect ? onSelect(order.poId) : navigate(`/purchase-orders/${order.poId}`))}
              onShowTip={(anchor) =>
                show(
                  anchor,
                  <>
                    <strong>{order.poNumber}</strong>
                    <span>
                      {order.manufacturer} · {order.stage ?? "Not sent"} · {order.shipMode}
                    </span>
                    <span>{position.where}</span>
                    <span>{formatNumber(order.units)} pairs</span>
                    {order.nextStage && order.nextStageDate ? (
                      <span>
                        {order.nextStage} ~{formatDateOnly(order.nextStageDate)}
                      </span>
                    ) : null}
                    {order.late ? <span className="map-tooltip-alert">Running late</span> : null}
                  </>,
                )
              }
              onHideTip={hide}
            />
          );
        })}

        {!orders.length ? (
          <text className="map-empty-note" x={WIDTH / 2} y={HEIGHT - 18} textAnchor="middle">
            No factory orders yet. They appear here as they move from the factory to the warehouse.
          </text>
        ) : null}
      </svg>
      <MapTooltip tip={tip} containerRef={containerRef} />
    </div>
  );
}
