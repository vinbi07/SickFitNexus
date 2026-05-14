import type { PurchaseOrder } from "@/types/domain";
import { daysBetween } from "@/utils/date";

const CLOSED_STATUSES = new Set(["Received", "Closed", "Cancelled"]);

export interface ProductionTimelineRow {
  id: string;
  poNumber: string;
  manufacturerName: string;
  status: string;
  orderDate: string | null;
  invoicePaidAt: string | null;
  expectedArrivalDate: string | null;
  actualArrivalDate: string | null;
  arrivalDate: string | null;
  projected: boolean;
  orderToArrivalDays: number | null;
  paidToArrivalDays: number | null;
  timelineStatus: string;
}

function getTimelineStatus(purchaseOrder: PurchaseOrder, arrivalDate: string | null) {
  if (!arrivalDate) return "Awaiting arrival";
  if (!purchaseOrder.order_date && !purchaseOrder.invoice_paid_at) return "Missing order + paid dates";
  if (!purchaseOrder.order_date) return "Missing order date";
  if (!purchaseOrder.invoice_paid_at) return "Missing paid date";
  if (purchaseOrder.actual_delivery_date) return "Arrived";
  return "Projected";
}

export function buildProductionTimelineRow(purchaseOrder: PurchaseOrder): ProductionTimelineRow {
  const arrivalDate = purchaseOrder.actual_delivery_date ?? purchaseOrder.expected_delivery_date;
  const projected = !purchaseOrder.actual_delivery_date && Boolean(purchaseOrder.expected_delivery_date);

  return {
    id: purchaseOrder.id,
    poNumber: purchaseOrder.po_number,
    manufacturerName: purchaseOrder.vendors?.name ?? "Unassigned",
    status: purchaseOrder.status,
    orderDate: purchaseOrder.order_date,
    invoicePaidAt: purchaseOrder.invoice_paid_at,
    expectedArrivalDate: purchaseOrder.expected_delivery_date,
    actualArrivalDate: purchaseOrder.actual_delivery_date,
    arrivalDate,
    projected,
    orderToArrivalDays: purchaseOrder.order_date && arrivalDate ? daysBetween(purchaseOrder.order_date, arrivalDate) : null,
    paidToArrivalDays: purchaseOrder.invoice_paid_at && arrivalDate ? daysBetween(purchaseOrder.invoice_paid_at, arrivalDate) : null,
    timelineStatus: getTimelineStatus(purchaseOrder, arrivalDate),
  };
}

export function getProductionTimelineRows(purchaseOrders: PurchaseOrder[]) {
  return purchaseOrders
    .filter((purchaseOrder) => purchaseOrder.po_type === "Manufacturer PO")
    .map(buildProductionTimelineRow)
    .sort((left, right) => {
      const leftDate = left.orderDate ?? left.expectedArrivalDate ?? left.actualArrivalDate ?? "";
      const rightDate = right.orderDate ?? right.expectedArrivalDate ?? right.actualArrivalDate ?? "";
      return rightDate.localeCompare(leftDate);
    });
}

export function getAverageTimelineDays(
  rows: ProductionTimelineRow[],
  key: "orderToArrivalDays" | "paidToArrivalDays",
) {
  const values = rows
    .filter((row) => Boolean(row.actualArrivalDate))
    .map((row) => row[key])
    .filter((value): value is number => value !== null);

  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function getProductionTimelineExceptionCount(rows: ProductionTimelineRow[]) {
  return rows.filter((row) =>
    !row.arrivalDate ||
    row.orderToArrivalDays === null ||
    row.paidToArrivalDays === null,
  ).length;
}

export function getProductionTimelineTrend(rows: ProductionTimelineRow[], count = 8) {
  return [...rows]
    .filter((row) => !CLOSED_STATUSES.has(row.status) || Boolean(row.actualArrivalDate))
    .slice(0, count)
    .reverse()
    .map((row) => ({
      label: row.poNumber,
      orderToArrivalDays: row.orderToArrivalDays,
      paidToArrivalDays: row.paidToArrivalDays,
      projected: row.projected,
    }));
}
