import type { InventoryEvent, PoLineItem, Product, PurchaseOrder, Vendor } from "@/types/domain";
import { addDays } from "@/utils/date";
import { calculateAverageDailyUsage } from "@/utils/forecasting";

export const DANGER_INVENTORY_THRESHOLD = 25;

export function isInventoryDanger(quantity: number) {
  return Number(quantity ?? 0) <= DANGER_INVENTORY_THRESHOLD;
}

export function getInventoryHealthLabel(quantity: number, safetyStock = 0) {
  if (isInventoryDanger(quantity)) return "Danger";
  if (Number(quantity ?? 0) <= Number(safetyStock ?? 0)) return "Low";
  return "Healthy";
}

export function getInventoryHealthTone(quantity: number, safetyStock = 0) {
  if (isInventoryDanger(quantity)) return "danger" as const;
  if (Number(quantity ?? 0) <= Number(safetyStock ?? 0)) return "warning" as const;
  return "healthy" as const;
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
      recommendation: isInventoryDanger(product.current_inventory)
        ? "Danger now: reorder manually until movement history exists."
        : "Watch manually: no movement history yet.",
      reorderByDate: null,
    };
  }

  const coverageDays = totalCoverageUnits / usagePerDay;
  const reorderDaysOut = Math.max(Math.floor(coverageDays - leadTimeDays), 0);
  const reorderByDate = addDays(new Date(), reorderDaysOut).toISOString().slice(0, 10);

  if (isInventoryDanger(product.current_inventory) || coverageDays <= leadTimeDays) {
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
