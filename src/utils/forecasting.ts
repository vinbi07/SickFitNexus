import type {
  ForecastMetric,
  InventoryEvent,
  PoLineItem,
  Product,
  PurchaseOrder,
  Vendor,
} from "@/types/domain";
import { addDays, daysBetween } from "@/utils/date";

export function calculateAverageDailyUsage(events: InventoryEvent[]) {
  const usageEvents = events.filter((event) => event.quantity_change < 0);
  if (usageEvents.length === 0) return 0;

  const sorted = [...usageEvents].sort((a, b) => a.event_date.localeCompare(b.event_date));
  const totalUsage = sorted.reduce((sum, event) => sum + Math.abs(event.quantity_change), 0);
  const span = Math.max(daysBetween(sorted[0].event_date, sorted.at(-1)?.event_date ?? sorted[0].event_date), 1);
  return totalUsage / span;
}

export function calculateForecastMetric(
  product: Product,
  events: InventoryEvent[],
  vendorLeadTimeDays: number,
): ForecastMetric {
  const averageDailyUsage = calculateAverageDailyUsage(events);
  const inventoryBurnRate = averageDailyUsage;
  const projectedDaysRemaining =
    averageDailyUsage > 0 ? product.current_inventory / averageDailyUsage : null;
  const projectedDepletionDate =
    projectedDaysRemaining !== null
      ? addDays(new Date(), Math.ceil(projectedDaysRemaining)).toISOString().slice(0, 10)
      : null;
  const reorderPoint = averageDailyUsage * vendorLeadTimeDays + product.safety_stock;
  const suggestedReorderQuantity = Math.max(
    Math.ceil(reorderPoint * 2 - product.current_inventory),
    0,
  );

  return {
    averageDailyUsage,
    inventoryBurnRate,
    projectedDaysRemaining,
    projectedDepletionDate,
    reorderPoint,
    safetyStock: product.safety_stock,
    suggestedReorderQuantity,
  };
}

export function calculateRecommendedSafetyStock(
  product: Product,
  events: InventoryEvent[],
  vendorLeadTimeDays: number,
) {
  const averageDailyUsage = calculateAverageDailyUsage(events);
  if (averageDailyUsage <= 0) return Math.max(product.safety_stock ?? 0, 0);

  const effectiveLeadTime = Math.max(vendorLeadTimeDays, 14);
  const variabilityBufferDays = Math.max(Math.round(effectiveLeadTime * 0.35), 7);
  const recommended = Math.ceil(averageDailyUsage * (effectiveLeadTime + variabilityBufferDays));
  return Math.max(recommended, 0);
}

export function calculatePoAge(orderDate: string | null) {
  return daysBetween(orderDate, new Date().toISOString().slice(0, 10));
}

export function calculateVendorDelay(po: PurchaseOrder) {
  return daysBetween(po.expected_delivery_date, po.actual_delivery_date);
}

export function calculateFillRate(lineItems: PoLineItem[]) {
  const ordered = lineItems.reduce((sum, item) => sum + item.quantity_ordered, 0);
  const received = lineItems.reduce((sum, item) => sum + item.quantity_received, 0);
  if (!ordered) return 0;
  return received / ordered;
}

export function calculateVendorReliability(
  vendor: Vendor,
  pos: PurchaseOrder[],
  lineItemsByPo: Map<string, PoLineItem[]>,
) {
  if (pos.length === 0) return 0;
  const averageDelay =
    pos.reduce((sum, po) => sum + Math.max(calculateVendorDelay(po), 0), 0) / pos.length;
  const fillRates = pos.map((po) => calculateFillRate(lineItemsByPo.get(po.id) ?? []));
  const averageFillRate = fillRates.reduce((sum, rate) => sum + rate, 0) / fillRates.length;
  const lateRate =
    pos.filter((po) => calculateVendorDelay(po) > 0).length / Math.max(pos.length, 1);

  const reliability = Math.max(0, Math.min(100, 100 - averageDelay * 3 - lateRate * 35 + averageFillRate * 25));
  return Number.isFinite(reliability) ? reliability : vendor.reliability_score;
}
