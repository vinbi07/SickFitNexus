import type { InventoryEvent, PoLineItem, PurchaseOrder } from "@/types/domain";
import { addDays } from "@/utils/date";
import { getInvoiceStatus } from "@/utils/operations";

/** POs whose units have not landed yet, as the inventory pages count "incoming". */
const OPEN_INVOICE_STATUSES = ["Open", "Shipped", "In Route", "Inventory in Route"];
const CLOSED_PO_STATUSES: PurchaseOrder["status"][] = ["Draft", "Cancelled", "Received", "Fulfilled", "Closed"];

function eventDay(event: Pick<InventoryEvent, "event_date">) {
  return new Date(`${event.event_date.slice(0, 10)}T00:00:00`);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Shopify orders arrive as "Usage" events with a negative quantity. */
export function isSaleEvent(event: Pick<InventoryEvent, "event_type" | "quantity_change">) {
  return event.event_type === "Usage" && Number(event.quantity_change ?? 0) < 0;
}

/** Sale events in the last `days` days, today included. */
export function salesInWindow<T extends Pick<InventoryEvent, "event_type" | "quantity_change" | "event_date">>(
  events: T[],
  days: number,
  referenceDate = new Date(),
) {
  const cutoff = addDays(startOfDay(referenceDate), -(days - 1));
  return events.filter((event) => isSaleEvent(event) && eventDay(event) >= cutoff);
}

export function unitsSold(
  events: Array<Pick<InventoryEvent, "event_type" | "quantity_change" | "event_date">>,
  days: number,
  referenceDate = new Date(),
) {
  return salesInWindow(events, days, referenceDate).reduce((sum, event) => sum + Math.abs(Number(event.quantity_change)), 0);
}

/** Average units sold per day across the whole window (quiet days count). */
export function dailySalesRate(
  events: Array<Pick<InventoryEvent, "event_type" | "quantity_change" | "event_date">>,
  days: number,
  referenceDate = new Date(),
) {
  return days > 0 ? unitsSold(events, days, referenceDate) / days : 0;
}

/** Days until stock runs out at `rate` per day; null when nothing is selling. */
export function daysOfStock(onHand: number, rate: number) {
  if (rate <= 0) return null;
  return Math.max(0, Math.floor(Number(onHand ?? 0) / rate));
}

export interface WeeklySalesPoint {
  /** First day of the 7-day bucket, as YYYY-MM-DD. */
  weekStart: string;
  units: number;
}

function isoDay(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Units sold per 7-day bucket, oldest first, the last bucket ending today.
 * Empty weeks are kept so the chart shows gaps honestly.
 */
export function weeklySalesSeries(
  events: Array<Pick<InventoryEvent, "event_type" | "quantity_change" | "event_date">>,
  weeks: number,
  referenceDate = new Date(),
): WeeklySalesPoint[] {
  const today = startOfDay(referenceDate);
  const first = addDays(today, -(weeks * 7 - 1));
  const points = Array.from({ length: weeks }, (_, index) => ({ weekStart: isoDay(addDays(first, index * 7)), units: 0 }));
  for (const event of events) {
    if (!isSaleEvent(event)) continue;
    const day = eventDay(event);
    if (day < first || day > today) continue;
    const index = Math.floor((day.getTime() - first.getTime()) / (7 * 86400000));
    if (points[index]) points[index].units += Math.abs(Number(event.quantity_change));
  }
  return points;
}

export interface IncomingOrder {
  purchaseOrder: PurchaseOrder;
  /** Units still to arrive, per product id. */
  units: Map<string, number>;
  total: number;
}

/** Open POs carrying units for these products, soonest arrival first. */
export function incomingOrders(lineItems: Array<PoLineItem & { purchase_orders?: PurchaseOrder | null }>): IncomingOrder[] {
  const byPo = new Map<string, IncomingOrder>();
  for (const item of lineItems) {
    const po = item.purchase_orders;
    if (!po || !item.product_id) continue;
    if (CLOSED_PO_STATUSES.includes(po.status) || !OPEN_INVOICE_STATUSES.includes(getInvoiceStatus(po))) continue;
    const remaining = Math.max(Number(item.quantity_ordered ?? 0) - Number(item.quantity_received ?? 0), 0);
    if (!remaining) continue;
    const entry = byPo.get(po.id) ?? { purchaseOrder: po, units: new Map<string, number>(), total: 0 };
    entry.units.set(item.product_id, (entry.units.get(item.product_id) ?? 0) + remaining);
    entry.total += remaining;
    byPo.set(po.id, entry);
  }
  const arrival = (po: PurchaseOrder) => po.eta_date ?? po.expected_delivery_date ?? "9999";
  return [...byPo.values()].sort((left, right) => arrival(left.purchaseOrder).localeCompare(arrival(right.purchaseOrder)));
}
