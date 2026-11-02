import { geoInterpolate } from "d3-geo";
import { MAP_PLACES, SUPPLY_ROUTES, type MapPlaceId } from "@/lib/mapPlaces";
import { diffInDays } from "@/utils/leadTime";
import type { DashboardSnapshot } from "@/types/domain";
import { PRODUCTION_STAGES, type ProductionStage } from "@/utils/productionStage";

export type SupplyChainMapOrder = DashboardSnapshot["supplyChainOrders"][number];

export type MapStageTone = "waiting" | "production" | "transit" | "received";

export interface OrderMapPosition {
  coordinates: [number, number];
  /** Where the leg being travelled starts, used as the glide-in origin. */
  origin: [number, number];
  tone: MapStageTone;
  where: string;
  /** 0..1 progress along the long-haul leg while in transit. */
  fraction: number | null;
}

const MIN_FRACTION = 0.04;
const MAX_FRACTION = 0.96;

function stageIndex(stage: ProductionStage | null) {
  return stage ? PRODUCTION_STAGES.indexOf(stage) : -1;
}

export function stageTone(stage: ProductionStage | null): MapStageTone {
  const index = stageIndex(stage);
  if (index >= PRODUCTION_STAGES.indexOf("Received")) return "received";
  if (index >= PRODUCTION_STAGES.indexOf("Shipped")) return "transit";
  if (index >= PRODUCTION_STAGES.indexOf("Paid")) return "production";
  return "waiting";
}

function place(id: MapPlaceId) {
  return MAP_PLACES[id].coordinates;
}

/** Where a factory order sits on the supply-chain map today. */
export function orderMapPosition(order: SupplyChainMapOrder, today: string): OrderMapPosition {
  const tone = stageTone(order.stage);
  const longHaul = SUPPLY_ROUTES[order.shipMode].find((leg) => leg.kind !== "truck")!;
  const from = place(longHaul.from);
  const to = place(longHaul.to);

  if (tone === "received") {
    return { coordinates: place("warehouse"), origin: to, tone, where: `Received in ${MAP_PLACES.warehouse.label}`, fraction: null };
  }
  if (order.stage === "At US port") {
    return { coordinates: to, origin: from, tone, where: `At ${MAP_PLACES[longHaul.to].label}, clearing customs`, fraction: null };
  }
  if (order.stage === "Labels created") {
    return { coordinates: to, origin: from, tone, where: "Landed, US labels made, waiting on the carrier", fraction: null };
  }
  if (tone === "transit") {
    let fraction = 0.5;
    if (order.shippedDate && order.expectedAtPort) {
      const total = diffInDays(order.expectedAtPort, order.shippedDate);
      if (total > 0) fraction = diffInDays(today, order.shippedDate) / total;
    }
    fraction = Math.min(MAX_FRACTION, Math.max(MIN_FRACTION, fraction));
    const mode = order.shipMode === "Air" ? "In the air" : "On the water";
    return {
      coordinates: geoInterpolate(from, to)(fraction) as [number, number],
      origin: from,
      tone,
      where: `${mode}, about ${Math.round(fraction * 100)}% of the way`,
      fraction,
    };
  }
  const factory = place("factory");
  return {
    coordinates: factory,
    origin: factory,
    tone,
    where: tone === "production" ? "At the factory, in production" : "At the factory, waiting on payment",
    fraction: null,
  };
}

/**
 * Spreads markers that land on the same spot into a small ring (in projected
 * pixels) so stacked orders stay individually clickable.
 */
export function fanOut<T>(items: Array<{ item: T; point: [number, number] }>, radius = 16) {
  const groups = new Map<string, Array<{ item: T; point: [number, number] }>>();
  for (const entry of items) {
    const key = entry.point.map((value) => value.toFixed(1)).join(",");
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  const out: Array<{ item: T; point: [number, number] }> = [];
  for (const group of groups.values()) {
    group.forEach((entry, index) => {
      if (group.length === 1) {
        out.push(entry);
        return;
      }
      const angle = (index / group.length) * Math.PI * 2 - Math.PI / 2;
      out.push({ item: entry.item, point: [entry.point[0] + Math.cos(angle) * radius, entry.point[1] + Math.sin(angle) * radius] });
    });
  }
  return out;
}
