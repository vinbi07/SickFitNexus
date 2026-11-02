import { describe, expect, it } from "vitest";
import type { InventoryEvent, PoLineItem, PurchaseOrder } from "@/types/domain";
import { dailySalesRate, daysOfStock, incomingOrders, unitsSold, weeklySalesSeries } from "@/utils/productSales";

const today = new Date(2026, 10, 2); // Nov 2, 2026

const sale = (date: string, units: number, type: InventoryEvent["event_type"] = "Usage") =>
  ({ event_type: type, quantity_change: -units, event_date: date }) as InventoryEvent;

describe("unitsSold", () => {
  const events = [
    sale("2026-11-02", 3),
    sale("2026-10-04", 5), // 30th day back, inside
    sale("2026-10-03", 7), // 31 days back, outside
    sale("2026-11-01", -100, "PO Received"),
    sale("2026-11-01", 4, "Manual Adjustment"),
  ];

  it("counts only Shopify usage inside the window", () => {
    expect(unitsSold(events, 30, today)).toBe(8);
    expect(unitsSold(events, 90, today)).toBe(15);
  });

  it("averages over every day of the window", () => {
    expect(dailySalesRate(events, 30, today)).toBeCloseTo(8 / 30);
  });
});

describe("daysOfStock", () => {
  it("is null when nothing sells", () => {
    expect(daysOfStock(50, 0)).toBeNull();
  });

  it("rounds down and never goes negative", () => {
    expect(daysOfStock(25, 2)).toBe(12);
    expect(daysOfStock(-4, 2)).toBe(0);
  });
});

describe("weeklySalesSeries", () => {
  it("buckets oldest first with the last week ending today", () => {
    const series = weeklySalesSeries([sale("2026-11-02", 2), sale("2026-10-27", 1), sale("2026-10-26", 6), sale("2026-08-01", 9)], 2, today);
    expect(series).toEqual([
      { weekStart: "2026-10-20", units: 6 },
      { weekStart: "2026-10-27", units: 3 },
    ]);
  });
});

describe("incomingOrders", () => {
  const po = (id: string, overrides: Partial<PurchaseOrder>) =>
    ({ id, status: "Ordered", invoice_status: null, eta_date: null, expected_delivery_date: null, ...overrides }) as PurchaseOrder;
  const line = (purchaseOrder: PurchaseOrder, productId: string, ordered: number, received = 0) =>
    ({ product_id: productId, quantity_ordered: ordered, quantity_received: received, purchase_orders: purchaseOrder }) as PoLineItem & {
      purchase_orders: PurchaseOrder;
    };

  it("sums what is still to arrive on open POs, soonest first", () => {
    const later = po("a", { eta_date: "2026-12-01" });
    const sooner = po("b", { eta_date: "2026-11-10" });
    const cancelled = po("c", { status: "Cancelled" });
    const result = incomingOrders([
      line(later, "s", 100, 40),
      line(later, "m", 50),
      line(sooner, "s", 20),
      line(cancelled, "s", 999),
      line(sooner, "m", 10, 10),
    ]);
    expect(result.map((entry) => entry.purchaseOrder.id)).toEqual(["b", "a"]);
    expect(result[1].total).toBe(110);
    expect(result[1].units.get("s")).toBe(60);
    expect(result[0].units.has("m")).toBe(false);
  });
});
