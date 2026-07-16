import { describe, expect, it } from "vitest";
import type { ProductionPlan, ProductionSimulationResult } from "@/types/domain";
import { generateRecommendations } from "@/utils/productionRecommendations";

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

function baseSkuResult(overrides: Partial<ProductionSimulationResult["skuResults"][number]> = {}) {
  return {
    productId: "product-1",
    planItemId: "item-1",
    sku: "SKU-1",
    productName: "Core Compression Sock",
    category: "Core",
    family: "Core Compression Sock",
    dailySeries: [],
    startingOnHand: 100,
    startingAllocated: 0,
    firstBelowSafetyStockDateBaseline: null,
    firstBelowSafetyStockDateProposed: null,
    firstStockoutDateBaseline: null,
    firstStockoutDateProposed: null,
    stockoutDayCountBaseline: 0,
    stockoutDayCountProposed: 0,
    inventoryGapBeforeReceipt: 0,
    daysOfSupplyBefore: 10,
    daysOfSupplyAfter: 40,
    suggestedQuantity: 200,
    plannedQuantity: 200,
    moq: null,
    orderIncrement: null,
    roundedQuantity: 200,
    estimatedCost: 800,
    endingCoverageDaysBaseline: 10,
    endingCoverageDaysProposed: 40,
    isSlowMoverRisk: false,
    isOverproductionRisk: false,
    capacityConflict: false,
    urgencyScore: 0,
    impactScore: 50,
    ...overrides,
  };
}

function baseResult(overrides: Partial<ProductionSimulationResult> = {}): ProductionSimulationResult {
  return {
    simulationVersion: 1,
    generatedAt: "2026-07-01T00:00:00.000Z",
    planId: "plan-1",
    horizonStart: "2026-07-01",
    horizonEnd: "2026-07-30",
    summary: {
      totalPlannedUnits: 200,
      totalEstimatedCost: 800,
      skuCount: 1,
      skusWithStockoutRisk: 0,
      skusOverproduced: 0,
      firstStockoutDate: null,
      capacityConflictCount: 0,
      readinessBlockerCount: 0,
      averageEndingCoverageDaysBefore: 10,
      averageEndingCoverageDaysAfter: 40,
    },
    dailyPortfolioSeries: [],
    skuResults: [baseSkuResult()],
    capacitySeries: [],
    scheduleMilestones: [
      { key: "approval", label: "Approval", startDate: "2026-07-01", endDate: "2026-07-03", isBlocked: false, blockerReasons: [], isRequiredArrivalMarker: false },
    ],
    costMix: [],
    riskMatrix: [],
    recommendations: [],
    ...overrides,
  };
}

describe("generateRecommendations", () => {
  it("fires stockout_before_receipt when a SKU has proposed stockout days", () => {
    const result = baseResult({ skuResults: [baseSkuResult({ stockoutDayCountProposed: 3 })] });
    const recs = generateRecommendations(result, basePlan);
    expect(recs.some((rec) => rec.reasonCode === "stockout_before_receipt")).toBe(true);
  });

  it("does not fire stockout_before_receipt when no SKU stocks out", () => {
    const result = baseResult({ skuResults: [baseSkuResult({ stockoutDayCountProposed: 0 })] });
    const recs = generateRecommendations(result, basePlan);
    expect(recs.some((rec) => rec.reasonCode === "stockout_before_receipt")).toBe(false);
  });

  it("fires coverage_below_target when ending coverage is under the plan target", () => {
    const result = baseResult({ skuResults: [baseSkuResult({ endingCoverageDaysProposed: 10, isOverproductionRisk: false })] });
    const recs = generateRecommendations(result, basePlan);
    expect(recs.some((rec) => rec.reasonCode === "coverage_below_target")).toBe(true);
  });

  it("does not fire coverage_below_target when coverage meets the target", () => {
    const result = baseResult({ skuResults: [baseSkuResult({ endingCoverageDaysProposed: 30 })] });
    const recs = generateRecommendations(result, basePlan);
    expect(recs.some((rec) => rec.reasonCode === "coverage_below_target")).toBe(false);
  });

  it("fires coverage_excessively_high when a SKU is flagged overproduced", () => {
    const result = baseResult({ skuResults: [baseSkuResult({ isOverproductionRisk: true, endingCoverageDaysProposed: 120 })] });
    const recs = generateRecommendations(result, basePlan);
    expect(recs.some((rec) => rec.reasonCode === "coverage_excessively_high")).toBe(true);
  });

  it("does not fire coverage_excessively_high when nothing is overproduced", () => {
    const result = baseResult({ skuResults: [baseSkuResult({ isOverproductionRisk: false })] });
    const recs = generateRecommendations(result, basePlan);
    expect(recs.some((rec) => rec.reasonCode === "coverage_excessively_high")).toBe(false);
  });

  it("fires capacity_exceeded when the summary reports a capacity conflict", () => {
    const result = baseResult({ summary: { ...baseResult().summary, capacityConflictCount: 1 } });
    const recs = generateRecommendations(result, basePlan);
    expect(recs.some((rec) => rec.reasonCode === "capacity_exceeded")).toBe(true);
  });

  it("does not fire capacity_exceeded when no bucket is over capacity", () => {
    const result = baseResult();
    const recs = generateRecommendations(result, basePlan);
    expect(recs.some((rec) => rec.reasonCode === "capacity_exceeded")).toBe(false);
  });

  it("fires readiness_blocker when a schedule milestone is blocked", () => {
    const result = baseResult({
      scheduleMilestones: [
        { key: "approval", label: "Approval", startDate: "2026-07-01", endDate: "2026-07-03", isBlocked: true, blockerReasons: ["Artwork is not yet approved."], isRequiredArrivalMarker: false },
      ],
    });
    const recs = generateRecommendations(result, basePlan);
    expect(recs.some((rec) => rec.reasonCode === "readiness_blocker")).toBe(true);
  });

  it("does not fire readiness_blocker when no milestone is blocked", () => {
    const result = baseResult();
    const recs = generateRecommendations(result, basePlan);
    expect(recs.some((rec) => rec.reasonCode === "readiness_blocker")).toBe(false);
  });

  it("fires existing_incoming_covers_demand when baseline coverage already meets target with a nonzero proposed run", () => {
    const result = baseResult({ skuResults: [baseSkuResult({ daysOfSupplyBefore: 45, roundedQuantity: 200 })] });
    const recs = generateRecommendations(result, basePlan);
    expect(recs.some((rec) => rec.reasonCode === "existing_incoming_covers_demand")).toBe(true);
  });

  it("does not fire existing_incoming_covers_demand when baseline coverage is below target", () => {
    const result = baseResult({ skuResults: [baseSkuResult({ daysOfSupplyBefore: 5, roundedQuantity: 200 })] });
    const recs = generateRecommendations(result, basePlan);
    expect(recs.some((rec) => rec.reasonCode === "existing_incoming_covers_demand")).toBe(false);
  });
});
