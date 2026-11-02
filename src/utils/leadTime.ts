import type { FactoryShutdown, SupplyChainSettings } from "@/types/domain";

export type ShipMode = "Sea" | "Air";

export type LeadTimeSettings = Pick<
  SupplyChainSettings,
  "prod_days" | "pack_days" | "sea_days" | "air_days" | "port_to_wh_days" | "buffer_days"
>;

export type ShutdownWindow = Pick<FactoryShutdown, "name" | "start_date" | "end_date">;

export const DEFAULT_LEAD_TIME_SETTINGS: LeadTimeSettings = {
  prod_days: 30,
  pack_days: 5,
  sea_days: 35,
  air_days: 10,
  port_to_wh_days: 7,
  buffer_days: 7,
};

export interface ExpectedMilestones {
  inProduction: string;
  packing: string;
  shipped: string;
  atUsPort: string;
  received: string;
  /** Shutdowns that pushed the production end date out. */
  shutdownsApplied: string[];
}

export interface OrderByResult {
  orderBy: string;
  ship: string;
  /** Shutdowns that pulled the order-by date earlier. */
  shutdownsApplied: string[];
}

const DAY_MS = 86400000;

// All dates are plain YYYY-MM-DD strings handled in UTC so results never drift
// with the viewer's time zone.
function toUtc(iso: string) {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function fromUtc(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function shiftDays(iso: string, days: number) {
  return fromUtc(toUtc(iso) + days * DAY_MS);
}

export function diffInDays(later: string, earlier: string) {
  return Math.round((toUtc(later) - toUtc(earlier)) / DAY_MS);
}

function shutdownLength(window: ShutdownWindow) {
  return diffInDays(window.end_date, window.start_date);
}

function overlaps(window: ShutdownWindow, start: string, end: string) {
  return window.start_date <= end && window.end_date >= start;
}

export function transitDays(mode: ShipMode, settings: LeadTimeSettings) {
  return mode === "Air" ? settings.air_days : settings.sea_days;
}

/** Full order-to-shelf lead time in days, before any shutdown adjustment. */
export function totalLeadDays(mode: ShipMode, settings: LeadTimeSettings) {
  return settings.prod_days + transitDays(mode, settings) + settings.port_to_wh_days + settings.buffer_days;
}

/**
 * Expected milestone dates for a factory order, counted forward from the date
 * it was paid. Production that overlaps a shutdown is pushed out by the
 * shutdown's length; each window is checked once, in date order, against the
 * already-extended production run.
 */
export function expectedMilestones(
  paidDate: string,
  mode: ShipMode,
  settings: LeadTimeSettings,
  shutdowns: ShutdownWindow[] = [],
): ExpectedMilestones {
  const prodStart = paidDate.slice(0, 10);
  let prodEnd = shiftDays(prodStart, settings.prod_days);
  const shutdownsApplied: string[] = [];

  for (const window of [...shutdowns].sort((a, b) => a.start_date.localeCompare(b.start_date))) {
    if (!overlaps(window, prodStart, prodEnd)) continue;
    prodEnd = shiftDays(prodEnd, shutdownLength(window));
    shutdownsApplied.push(window.name);
  }

  const atUsPort = shiftDays(prodEnd, transitDays(mode, settings));
  return {
    inProduction: prodStart,
    packing: shiftDays(prodEnd, -settings.pack_days),
    shipped: prodEnd,
    atUsPort,
    received: shiftDays(atUsPort, settings.port_to_wh_days),
    shutdownsApplied,
  };
}

/**
 * Latest date an order can be placed and still be in hand by `inHandDate`.
 * Counts back through buffer, port-to-warehouse, transit and production, then
 * moves the order date earlier for any shutdown that overlaps production.
 */
export function orderByDate(
  inHandDate: string,
  mode: ShipMode,
  settings: LeadTimeSettings,
  shutdowns: ShutdownWindow[] = [],
): OrderByResult {
  const arrive = shiftDays(inHandDate, -settings.buffer_days);
  const port = shiftDays(arrive, -settings.port_to_wh_days);
  const ship = shiftDays(port, -transitDays(mode, settings));
  let orderBy = shiftDays(ship, -settings.prod_days);
  const shutdownsApplied: string[] = [];

  for (const window of [...shutdowns].sort((a, b) => b.start_date.localeCompare(a.start_date))) {
    if (!overlaps(window, orderBy, ship)) continue;
    orderBy = shiftDays(orderBy, -shutdownLength(window));
    shutdownsApplied.push(window.name);
  }

  return { orderBy, ship, shutdownsApplied };
}
