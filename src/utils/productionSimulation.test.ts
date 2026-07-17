import { describe, expect, it } from "vitest";
import type {
  CapacitySnapshot,
  InventoryEvent,
  PoLineItem,
  Product,
  ProductionPlan,
  ProductionPlanItem,
  PurchaseOrder,
  Vendor,
} from "@/types/domain";
import {
  buildSkuDailySeries,
  computeCapacitySeries,
  computeCostMix,
  computeRiskMatrix,
  computeScheduleMilestones,
  computeSkuSimulationResult,
  getIncomingReceiptsByDay,
  getReadinessBlockers,
  roundToMoqIncrement,
  runProductionSimulation,
} from "@/utils/productionSimulation";

const baseProduct: Product = {
  id: "product-1",
  parent_product_id: null,
  sku: "SKU-1",
  upc: "123456789012",
  name: "Core Compression Sock",
  variant_title: null,
  variant_sort_order: 0,
  category: "Core",
  description: null,
  vendor_id: "vendor-1",
  unit_cost: 4,
  unit_price: 12,
  pack_size: "1 Pack",
  case_pack_quantity: 12,
  wholesale_price: 8,
  msrp: 12,
  weight: null,
  dimensions: null,
  current_inventory: 100,
  inventory_available: 90,
  inventory_allocated: 10,
  safety_stock: 20,
  image_url: null,
  compliance_docs_required: [],
  compliance_docs_status: null,
  no_bundles: false,
  ignored: false,
  shopify_product_id: null,
  shopify_variant_id: null,
  shopify_handle: null,
  shopify_admin_url: null,
  shopify_storefront_url: null,
  is_shopify_synced: false,
  last_shopify_sync_at: null,
  created_at: "",
  updated_at: "",
  vendors: null,
  parent_products: null,
  variants: [],
};

const baseVendor: Vendor = {
  id: "vendor-1",
  name: "Acme Manufacturing",
  contact_email: null,
  contact_phone: null,
  lead_time_days: 21,
  average_delay_days: 0,
  reliability_score: 90,
  notes: null,
  created_at: "",
  updated_at: "",
};

function makeEvent(date: string, quantityChange: number): InventoryEvent {
  return {
    id: `event-${date}-${quantityChange}`,
    product_id: "product-1",
    location_id: null,
    related_po_id: null,
    event_type: "Usage",
    quantity_change: quantityChange,
    event_date: date,
    notes: null,
    created_at: date,
  };
}

const usageEvents: InventoryEvent[] = [
  makeEvent("2026-06-01", -10),
  makeEvent("2026-06-11", -10),
  makeEvent("2026-06-21", -10),
];

const basePlan: ProductionPlan = {
  id: "plan-1",
  name: "Core Restock",
  goal: "restock",
  status: "Draft",
  vendor_id: "vendor-1",
  location_id: null,
  horizon_start: "2026-07-01",
  horizon_end: "2026-07-30",
  planned_order_date: "2026-07-01",
  target_arrival_date: "2026-07-20",
  production_lane: null,
  production_week: "2026-07-13",
  demand_method: "avg_daily_usage",
  coverage_target_days: 30,
  safety_stock_override: null,
  include_allocated: true,
  include_existing_incoming: true,
  source_type: "blank",
  source_template_id: null,
  source_plan_id: null,
  active_simulation_run_id: null,
  approved_at: null,
  approved_by: null,
  notes: null,
  created_at: "",
  updated_at: "",
};

const basePlanItem: ProductionPlanItem = {
  id: "item-1",
  plan_id: "plan-1",
  product_id: "product-1",
  planned_quantity: 300,
  moq: 100,
  order_increment: 50,
  unit_cost: 4,
  manual_daily_demand: null,
  design_id: null,
  spec_snapshot: {},
  sock_card_id: null,
  pack_pairs: 1,
  sock_size: "M",
  construction: "Crew",
  cards_used: 0,
  box_no: null,
  pantone: null,
  barcode_required: false,
  art_status: "Approved",
  art_note: null,
  mockup_file_ref: null,
  artwork_file_ref: null,
  rib_lr: true,
  toe: true,
  pattern: false,
  signature: false,
  foot_text: null,
  sort_order: 0,
  created_at: "",
  updated_at: "",
};

function makePo(overrides: Partial<PurchaseOrder>): PurchaseOrder {
  return {
    id: "po-1",
    po_number: "PO-1",
    vendor_id: "vendor-1",
    retailer_id: null,
    buyer_id: null,
    location_id: null,
    status: "Ordered",
    po_type: "Manufacturer PO",
    approval_status: "Approved",
    allocation_status: "Not Allocated",
    order_date: "2026-06-01",
    ship_date: null,
    submitted_at: null,
    eta_date: "2026-07-10",
    expected_delivery_date: "2026-07-10",
    actual_delivery_date: null,
    invoice_status: "Open",
    invoice_paid_at: null,
    tracking_number: null,
    shipment_status: null,
    tracking_status: null,
    generated_form_url: null,
    source_channel: null,
    currency_code: null,
    bill_to_company_name: null,
    bill_to_contact_name: null,
    bill_to_street: null,
    bill_to_city: null,
    bill_to_state: null,
    bill_to_zip: null,
    bill_to_phone: null,
    bill_to_email: null,
    ship_to_company_name: null,
    ship_to_attention: null,
    ship_to_street: null,
    ship_to_city: null,
    ship_to_state: null,
    ship_to_zip: null,
    ship_to_phone: null,
    payment_terms_snapshot: null,
    buyer_name_snapshot: null,
    approver_name_snapshot: null,
    compliance_snapshot: {},
    buyer_notes: null,
    internal_notes: null,
    hold_reason: null,
    counter_status: "None",
    start_ship_date: null,
    ship_complete_date: null,
    subtotal: 0,
    total_units: 0,
    total_retail: 0,
    requested_action: "draft",
    approved_at: null,
    approved_by: null,
    queued_for_fulfillment_at: null,
    cancelled_at: null,
    total_cost: 0,
    source_file_name: null,
    notes: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function makeLineItem(overrides: Partial<PoLineItem>): PoLineItem {
  return {
    id: "li-1",
    purchase_order_id: "po-1",
    product_id: "product-1",
    sku: "SKU-1",
    upc: null,
    product_name: "Core Compression Sock",
    variant_label: null,
    description: null,
    unit: "pair",
    case_pack_quantity: 12,
    case_quantity: 0,
    unit_quantity: 0,
    quantity_ordered: 200,
    quantity_received: 0,
    unit_cost: 4,
    unit_retail: 12,
    line_total: 800,
    extended_cost: 800,
    extended_retail: 2400,
    sort_order: 0,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("roundToMoqIncrement", () => {
  it("rounds up to the MOQ floor when below it", () => {
    expect(roundToMoqIncrement(30, 100, 50)).toBe(100);
  });

  it("rounds up to the nearest increment above the MOQ floor", () => {
    expect(roundToMoqIncrement(120, 100, 50)).toBe(150);
  });

  it("applies no rounding when MOQ and increment are null", () => {
    expect(roundToMoqIncrement(37, null, null)).toBe(37);
  });

  it("floors non-positive input to zero", () => {
    expect(roundToMoqIncrement(-10, null, null)).toBe(0);
  });
});

describe("getIncomingReceiptsByDay", () => {
  it("buckets outstanding quantity onto the PO's eta_date", () => {
    const po = makePo({});
    const lineItemsByPo = new Map([["po-1", [makeLineItem({})]]]);
    const receipts = getIncomingReceiptsByDay("product-1", [po], lineItemsByPo, "2026-07-01", "2026-07-30");
    expect(receipts.get("2026-07-10")).toBe(200);
  });

  it("produces no receipt entry once a line item is fully received", () => {
    const po = makePo({});
    const lineItemsByPo = new Map([["po-1", [makeLineItem({ quantity_ordered: 200, quantity_received: 200 })]]]);
    const receipts = getIncomingReceiptsByDay("product-1", [po], lineItemsByPo, "2026-07-01", "2026-07-30");
    expect(receipts.size).toBe(0);
  });

  it("falls back to horizonStart when no arrival date is present", () => {
    const po = makePo({ eta_date: null, expected_delivery_date: null });
    const lineItemsByPo = new Map([["po-1", [makeLineItem({})]]]);
    const receipts = getIncomingReceiptsByDay("product-1", [po], lineItemsByPo, "2026-07-01", "2026-07-30");
    expect(receipts.get("2026-07-01")).toBe(200);
  });
});

describe("buildSkuDailySeries", () => {
  it("computes baseline projection arithmetic and detects stockout/below-safety-stock", () => {
    const series = buildSkuDailySeries({
      horizonStart: "2026-07-01",
      horizonEnd: "2026-07-05",
      startingOnHand: 50,
      startingAllocated: 10,
      includeAllocated: true,
      dailyDemandRate: 10,
      safetyStock: 20,
      existingIncomingByDay: new Map(),
      proposedIncomingByDay: new Map(),
    });

    // starting available = 50 - 10 = 40; day0: 40-10=30; day1: 20; day2: 10; day3: 0; day4: -10
    expect(series[0].baselineAvailable).toBe(30);
    expect(series[3].baselineAvailable).toBe(0);
    expect(series[3].isStockoutBaseline).toBe(true);
    expect(series[2].isBelowSafetyStockBaseline).toBe(true);
    expect(series[1].isBelowSafetyStockBaseline).toBe(false);
    expect(series[0].isBelowSafetyStockBaseline).toBe(false);
  });

  it("diverges proposed from baseline once a proposed receipt lands", () => {
    const series = buildSkuDailySeries({
      horizonStart: "2026-07-01",
      horizonEnd: "2026-07-05",
      startingOnHand: 50,
      startingAllocated: 0,
      includeAllocated: true,
      dailyDemandRate: 10,
      safetyStock: 20,
      existingIncomingByDay: new Map(),
      proposedIncomingByDay: new Map([["2026-07-03", 100]]),
    });

    expect(series[2].proposedAvailable).toBeGreaterThan(series[2].baselineAvailable);
    expect(series[2].isStockoutProposed).toBe(false);
  });
});

describe("getReadinessBlockers", () => {
  it("returns no blockers for a fully specified, approved item", () => {
    expect(getReadinessBlockers(basePlanItem)).toEqual([]);
  });

  it("flags missing construction, size, and unapproved art", () => {
    const blockers = getReadinessBlockers({ ...basePlanItem, construction: null, sock_size: null, art_status: "In Progress" });
    expect(blockers).toContain("Construction spec is missing.");
    expect(blockers).toContain("Size is missing.");
    expect(blockers).toContain("Artwork is not yet approved.");
  });

  it("flags a required barcode with no artwork reference", () => {
    const blockers = getReadinessBlockers({ ...basePlanItem, barcode_required: true, artwork_file_ref: null, art_status: "Approved" });
    expect(blockers).toContain("Barcode required but artwork reference is missing.");
  });
});

describe("computeScheduleMilestones", () => {
  it("derives sequential milestone dates from the planned order date", () => {
    const milestones = computeScheduleMilestones(basePlan, [basePlanItem]);
    expect(milestones[0].key).toBe("approval");
    expect(milestones[0].startDate).toBe("2026-07-01");
    expect(milestones.at(-1)?.key).toBe("receiving");
    expect(milestones.every((milestone) => milestone.startDate <= milestone.endDate)).toBe(true);
  });

  it("marks the approval milestone blocked when a plan item has incomplete specs", () => {
    const milestones = computeScheduleMilestones(basePlan, [{ ...basePlanItem, art_status: "In Progress" }]);
    const approval = milestones.find((milestone) => milestone.key === "approval");
    expect(approval?.isBlocked).toBe(true);
    expect(approval?.blockerReasons.length).toBeGreaterThan(0);
  });
});

describe("computeCapacitySeries", () => {
  const capacitySnapshot: CapacitySnapshot = {
    id: "cap-1",
    snapshot_date: "2026-07-13",
    capacity_type: "Manufacturer",
    partner_name: "Acme Manufacturing",
    lane_name: "Lane A",
    available_units: 1000,
    committed_units: 400,
    notes: null,
    created_at: "",
    updated_at: "",
  };

  it("computes remaining capacity and flags over-capacity buckets", () => {
    const series = computeCapacitySeries({
      plan: basePlan,
      items: [{ ...basePlanItem, planned_quantity: 700 }],
      capacitySnapshots: [capacitySnapshot],
      vendor: baseVendor,
    });
    const bucket = series.find((entry) => entry.manufacturerName === "Acme Manufacturing");
    expect(bucket?.availableUnits).toBe(1000);
    expect(bucket?.previouslyCommittedUnits).toBe(400);
    expect(bucket?.newlyProposedUnits).toBe(700);
    expect(bucket?.remainingUnits).toBe(-100);
    expect(bucket?.isOverCapacity).toBe(true);
  });

  it("handles a manufacturer with no capacity snapshot for the bucket", () => {
    const series = computeCapacitySeries({
      plan: { ...basePlan, production_week: "2026-08-01" },
      items: [basePlanItem],
      capacitySnapshots: [],
      vendor: baseVendor,
    });
    expect(series).toHaveLength(1);
    expect(series[0].availableUnits).toBe(0);
    expect(series[0].isOverCapacity).toBe(true);
  });
});

describe("computeSkuSimulationResult", () => {
  it("computes stockout dates, coverage, and cost using the shared formula", () => {
    const result = computeSkuSimulationResult({
      plan: basePlan,
      planItem: basePlanItem,
      product: baseProduct,
      vendor: baseVendor,
      events: usageEvents,
      purchaseOrders: [],
      lineItemsByPo: new Map(),
      referenceDate: new Date("2026-07-01T00:00:00"),
    });

    expect(result.roundedQuantity).toBe(300);
    expect(result.estimatedCost).toBe(1200);
    expect(result.dailySeries).toHaveLength(30);
    expect(result.firstStockoutDateProposed === null || result.firstStockoutDateProposed >= basePlan.horizon_start).toBe(true);
  });
});

describe("computeCostMix / computeRiskMatrix", () => {
  it("aggregates cost mix by category and mirrors SKU risk into the matrix", () => {
    const skuResult = computeSkuSimulationResult({
      plan: basePlan,
      planItem: basePlanItem,
      product: baseProduct,
      vendor: baseVendor,
      events: usageEvents,
      purchaseOrders: [],
      lineItemsByPo: new Map(),
    });
    const costMix = computeCostMix([skuResult], "category");
    expect(costMix[0].groupKey).toBe("Core");
    expect(costMix[0].estimatedCost).toBe(skuResult.estimatedCost);

    const riskMatrix = computeRiskMatrix([skuResult]);
    expect(riskMatrix).toHaveLength(1);
    expect(riskMatrix[0].productId).toBe(skuResult.productId);
  });
});

describe("runProductionSimulation reconciliation", () => {
  it("reconciles summary totals with per-SKU results across multiple SKUs and categories", () => {
    const secondProduct: Product = { ...baseProduct, id: "product-2", sku: "SKU-2", category: "Sport", unit_cost: 6 };
    const secondPlanItem: ProductionPlanItem = { ...basePlanItem, id: "item-2", product_id: "product-2", planned_quantity: 150, unit_cost: 6 };

    const result = runProductionSimulation({
      plan: basePlan,
      items: [basePlanItem, secondPlanItem],
      products: [baseProduct, secondProduct],
      vendor: baseVendor,
      eventsByProductId: new Map([
        ["product-1", usageEvents],
        ["product-2", usageEvents.map((event) => ({ ...event, product_id: "product-2" }))],
      ]),
      purchaseOrders: [],
      lineItemsByPo: new Map(),
      capacitySnapshots: [],
      simulationVersion: 1,
      generatedAt: "2026-07-01T00:00:00.000Z",
    });

    expect(result.skuResults).toHaveLength(2);
    const expectedUnits = result.skuResults.reduce((sum, sku) => sum + sku.roundedQuantity, 0);
    const expectedCost = result.skuResults.reduce((sum, sku) => sum + sku.estimatedCost, 0);
    expect(result.summary.totalPlannedUnits).toBe(expectedUnits);
    expect(result.summary.totalEstimatedCost).toBe(expectedCost);
    expect(result.riskMatrix).toHaveLength(result.skuResults.length);
    expect(result.costMix).toHaveLength(2); // Core and Sport categories
    const costMixTotal = result.costMix.reduce((sum, slice) => sum + slice.estimatedCost, 0);
    expect(costMixTotal).toBe(expectedCost);
    expect(result.dailyPortfolioSeries).toHaveLength(30);
  });
});
