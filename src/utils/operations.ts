import type { InventoryEvent, InventoryItem, PoLineItem, Product, PurchaseOrder, Vendor } from "@/types/domain";
import { addDays } from "@/utils/date";
import { calculateAverageDailyUsage } from "@/utils/forecasting";

export const DANGER_INVENTORY_THRESHOLD = 25;
export const SLOW_MOVER_LOOKBACK_DAYS = 30;
export const SLOW_MOVER_MIN_USAGE_EVENTS = 2;

function countRecentUsageEvents(events: InventoryEvent[], referenceDate: Date) {
  const cutoff = addDays(referenceDate, -SLOW_MOVER_LOOKBACK_DAYS);
  return events.filter(
    (event) => Number(event.quantity_change ?? 0) < 0 && new Date(`${event.event_date}T00:00:00`) >= cutoff,
  ).length;
}

export function isSlowMover(events: InventoryEvent[], referenceDate = new Date()) {
  return countRecentUsageEvents(events, referenceDate) < SLOW_MOVER_MIN_USAGE_EVENTS;
}

export function isInventoryDanger(quantity: number, events: InventoryEvent[]) {
  const withinThreshold = Number(quantity ?? 0) <= DANGER_INVENTORY_THRESHOLD;
  return withinThreshold && !isSlowMover(events);
}

export function getInventoryHealthLabel(quantity: number, events: InventoryEvent[], safetyStock = 0) {
  const withinThreshold = Number(quantity ?? 0) <= DANGER_INVENTORY_THRESHOLD;
  if (withinThreshold && isSlowMover(events)) return "Slow Mover";
  if (isInventoryDanger(quantity, events)) return "Danger";
  if (Number(quantity ?? 0) <= Number(safetyStock ?? 0)) return "Low";
  return "Healthy";
}

export function getInventoryHealthTone(quantity: number, events: InventoryEvent[], safetyStock = 0) {
  const label = getInventoryHealthLabel(quantity, events, safetyStock);
  if (label === "Danger") return "danger" as const;
  if (label === "Slow Mover") return "neutral" as const;
  if (label === "Low") return "warning" as const;
  return "healthy" as const;
}

export type InventoryRiskStatus = "Oversold" | "Low Stock" | "Reorder Soon" | "Incoming Shipment" | "Safe";

export function getInventoryRiskStatus(
  currentQuantity: number,
  tone: ReturnType<typeof getInventoryHealthTone>,
  incomingQuantity: number,
): InventoryRiskStatus {
  if (Number(currentQuantity ?? 0) < 0) return "Oversold";
  if (tone === "danger") return "Low Stock";
  if (tone === "warning") return "Reorder Soon";
  if (Number(incomingQuantity ?? 0) > 0) return "Incoming Shipment";
  return "Safe";
}

export function getAvailableAfterIncoming(currentStock: number, incomingQuantity: number, committedQuantity: number) {
  return Number(currentStock ?? 0) + Number(incomingQuantity ?? 0) - Number(committedQuantity ?? 0);
}

export function getOversoldLabel(currentStock: number) {
  const quantity = Number(currentStock ?? 0);
  return quantity < 0 ? `Oversold by ${Math.abs(quantity)} pairs` : null;
}

export function getMarginMetrics(unitCost: number, unitPrice: number) {
  const marginDollars = Number(unitPrice ?? 0) - Number(unitCost ?? 0);
  const marginPercent = Number(unitPrice ?? 0) > 0 ? (marginDollars / Number(unitPrice ?? 0)) * 100 : 0;
  return {
    marginDollars,
    marginPercent,
  };
}

export function getInvoiceStatus(po: PurchaseOrder) {
  if (po.invoice_status) return po.invoice_status;
  if (po.actual_delivery_date) return "Shipped";
  if (po.status === "In Transit" || po.status === "Partially Received") return "In Route";
  if (po.ship_date || po.tracking_number) return "Shipped";
  return "Open";
}

export function getShipmentStatus(po: PurchaseOrder) {
  return po.shipment_status ?? po.tracking_status ?? po.status;
}

export type ManufacturingOrderStatus = "Draft" | "Ordered" | "In Production" | "Shipped" | "Received" | "Delayed";

export function getManufacturingOrderStatusLabel(po: PurchaseOrder): ManufacturingOrderStatus {
  if (po.status === "Delayed") return "Delayed";
  if (po.status === "Draft") return "Draft";
  if (["Received", "Partially Received", "Closed", "Fulfilled"].includes(po.status)) return "Received";
  if (po.status === "In Transit" || po.ship_date || po.tracking_number) return "Shipped";
  // TODO: "In Production" is inferred from paid-but-unshipped; add a dedicated production_status field for accuracy.
  if (po.invoice_paid_at) return "In Production";
  return "Ordered";
}

export function getPaymentStatusLabel(po: PurchaseOrder): "Paid" | "Unpaid" {
  // TODO: only Paid/Unpaid is tracked today (via invoice_paid_at). A "Deposit Paid" tri-state
  // would need a new deposit_amount/balance_due column — not added since the transcript never
  // described partial deposits, only "we've paid this" as a yes/no fact.
  return po.invoice_paid_at ? "Paid" : "Unpaid";
}

export function getManufacturingOrderTitle(po: Pick<PurchaseOrder, "po_number">) {
  return po.po_number.replace(/^PO/i, "MO");
}

export function getManufacturerDisplayName(
  po: Pick<PurchaseOrder, "vendor_id" | "bill_to_company_name" | "ship_to_company_name">,
  vendor: Pick<Vendor, "name"> | null | undefined,
) {
  // Manufacturer builder orders don't always have a vendor_id selected, but they always
  // snapshot a company name into bill_to/ship_to — fall back to those before "Unassigned"
  // so orders without a linked vendor still show the manufacturer name (matches the
  // fallback chain already used on the Purchase Orders list).
  return vendor?.name ?? po.bill_to_company_name ?? po.ship_to_company_name ?? "Unassigned";
}

export function getDaysLate(dueDate: string | null, referenceDate = new Date()) {
  if (!dueDate) return null;
  const due = new Date(`${dueDate}T00:00:00`);
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  return Math.floor((today.getTime() - due.getTime()) / 86400000);
}

export function getIncomingQuantityForProduct(
  productId: string,
  purchaseOrders: PurchaseOrder[],
  lineItemsByPo: Map<string, PoLineItem[]>,
) {
  return purchaseOrders.reduce((sum, po) => {
    const invoiceStatus = getInvoiceStatus(po);
    if (!["Open", "Shipped", "In Route", "Inventory in Route"].includes(invoiceStatus)) return sum;
    const quantity = (lineItemsByPo.get(po.id) ?? [])
      .filter((item) => item.product_id === productId)
      .reduce((lineSum, item) => lineSum + Math.max(Number(item.quantity_ordered ?? 0) - Number(item.quantity_received ?? 0), 0), 0);
    return sum + quantity;
  }, 0);
}

export function buildSkuReorderWindow(params: {
  product: Product;
  vendor: Vendor | null | undefined;
  events: InventoryEvent[];
  incomingQuantity: number;
}) {
  const { product, vendor, events, incomingQuantity } = params;
  const usagePerDay = calculateAverageDailyUsage(events);
  const leadTimeDays = Math.max(Number(vendor?.lead_time_days ?? 21), 7);
  const totalCoverageUnits = Number(product.current_inventory ?? 0) + Number(incomingQuantity ?? 0);

  if (usagePerDay <= 0) {
    return {
      recommendation: isInventoryDanger(product.current_inventory, events)
        ? "Danger now: reorder manually until movement history exists."
        : "Watch manually: no movement history yet.",
      reorderByDate: null,
    };
  }

  const coverageDays = totalCoverageUnits / usagePerDay;
  const reorderDaysOut = Math.max(Math.floor(coverageDays - leadTimeDays), 0);
  const reorderByDate = addDays(new Date(), reorderDaysOut).toISOString().slice(0, 10);

  if (isInventoryDanger(product.current_inventory, events) || coverageDays <= leadTimeDays) {
    return {
      recommendation: "Reorder now",
      reorderByDate,
    };
  }

  if (coverageDays <= leadTimeDays + 14) {
    return {
      recommendation: "Reorder within 2 weeks",
      reorderByDate,
    };
  }

  return {
    recommendation: "Monitor window",
    reorderByDate,
  };
}

export function calculateManufacturingInventoryImpact(lineItems: PoLineItem[]) {
  return lineItems
    .map((item) => ({
      productName: item.product_name || item.sku,
      incomingUnits: Math.max(Number(item.quantity_ordered ?? 0) - Number(item.quantity_received ?? 0), 0),
    }))
    .filter((line) => line.incomingUnits > 0);
}

export function formatManufacturingInventoryImpact(lineItems: PoLineItem[]) {
  const impact = calculateManufacturingInventoryImpact(lineItems);
  if (!impact.length) return "No incoming inventory";
  return impact.map((line) => `${line.productName} +${line.incomingUnits}`).join(" | ");
}

export function summarizeManufacturingInventoryImpact(lineItems: PoLineItem[]) {
  const impact = calculateManufacturingInventoryImpact(lineItems);
  if (!impact.length) return "No incoming inventory";
  const totalUnits = impact.reduce((sum, line) => sum + line.incomingUnits, 0);
  if (impact.length === 1) return `${impact[0].productName} +${impact[0].incomingUnits}`;
  return `${impact.length} products · +${totalUnits} units`;
}

export interface DuplicateInventoryGroup {
  sku: string;
  locationId: string;
  locationName: string;
  items: InventoryItem[];
}

export function findDuplicateInventoryGroups(items: InventoryItem[]): DuplicateInventoryGroup[] {
  const groups = new Map<string, InventoryItem[]>();
  for (const item of items) {
    const sku = item.products?.sku?.trim();
    if (!sku) continue;
    const key = `${sku.toLowerCase()}::${item.location_id}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(item);
    groups.set(key, bucket);
  }

  return Array.from(groups.values())
    .filter((bucket) => new Set(bucket.map((item) => item.product_id)).size > 1)
    .map((bucket) => ({
      sku: bucket[0].products!.sku,
      locationId: bucket[0].location_id,
      locationName: bucket[0].locations?.name ?? "Unknown Location",
      items: bucket,
    }))
    .sort((a, b) => a.sku.localeCompare(b.sku) || a.locationName.localeCompare(b.locationName));
}
