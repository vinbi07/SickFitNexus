import type {
  CapacitySnapshot,
  CapacityUtilizationBucket,
  DemandMethod,
  InventoryEvent,
  PoLineItem,
  Product,
  ProductionCostMixSlice,
  ProductionDailySeriesPoint,
  ProductionPlan,
  ProductionPlanItem,
  ProductionScheduleMilestone,
  ProductionScheduleMilestoneKey,
  ProductionSimulationResult,
  ProductionSimulationSummary,
  PurchaseOrder,
  SkuRiskMatrixPoint,
  SkuSimulationResult,
  Vendor,
} from "@/types/domain";
import { addDays, daysBetween, toDateInput } from "@/utils/date";
import { calculateAverageDailyUsage } from "@/utils/forecasting";
import { getInvoiceStatus, isSlowMover } from "@/utils/operations";

/**
 * Rich, in-memory input for the pure simulation engine. This is intentionally richer
 * than the ProductionSimulationInputSnapshot persisted to production_simulation_runs
 * (which only stores plan/item assumptions) — raw inventory/demand/PO data is fetched
 * fresh on every run rather than duplicated into storage on every scenario.
 */
export interface ProductionSimulationEngineInput {
  plan: ProductionPlan;
  items: ProductionPlanItem[];
  products: Product[];
  vendor: Vendor | null;
  eventsByProductId: Map<string, InventoryEvent[]>;
  purchaseOrders: PurchaseOrder[];
  lineItemsByPo: Map<string, PoLineItem[]>;
  capacitySnapshots: CapacitySnapshot[];
  simulationVersion: number;
  generatedAt?: string;
}

function iterateDates(start: string, end: string): string[] {
  const dates: string[] = [];
  let cursor = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  while (cursor <= endDate) {
    dates.push(toDateInput(cursor));
    cursor = addDays(cursor, 1);
  }
  return dates;
}

/**
 * Day-bucketed version of operations.ts's getIncomingQuantityForProduct: instead of a
 * single total, buckets each PO line item's outstanding quantity onto its expected
 * arrival day (eta_date, falling back to expected_delivery_date). Line items with no
 * date on an otherwise-eligible PO are assumed to arrive on horizonStart rather than
 * silently dropped, since the reorder queue already counts them as "incoming."
 */
export function getIncomingReceiptsByDay(
  productId: string,
  purchaseOrders: PurchaseOrder[],
  lineItemsByPo: Map<string, PoLineItem[]>,
  horizonStart: string,
  horizonEnd: string,
): Map<string, number> {
  const receiptsByDay = new Map<string, number>();
  const eligibleStatuses = new Set(["Open", "Shipped", "In Route", "Inventory in Route"]);

  for (const po of purchaseOrders) {
    if (!eligibleStatuses.has(getInvoiceStatus(po))) continue;
    const lineItems = (lineItemsByPo.get(po.id) ?? []).filter((item) => item.product_id === productId);
    if (!lineItems.length) continue;

    const arrivalDate = po.eta_date ?? po.expected_delivery_date ?? horizonStart;
    const clampedDate = arrivalDate < horizonStart ? horizonStart : arrivalDate > horizonEnd ? horizonEnd : arrivalDate;

    const quantity = lineItems.reduce(
      (sum, item) => sum + Math.max(Number(item.quantity_ordered ?? 0) - Number(item.quantity_received ?? 0), 0),
      0,
    );
    if (quantity <= 0) continue;
    receiptsByDay.set(clampedDate, (receiptsByDay.get(clampedDate) ?? 0) + quantity);
  }

  return receiptsByDay;
}

function computeDailyDemandRate(
  product: Product,
  events: InventoryEvent[],
  demandMethod: DemandMethod,
  manualDailyDemand: number | null,
  referenceDate: Date,
): number {
  if (demandMethod === "manual_override") return Math.max(manualDailyDemand ?? 0, 0);

  if (demandMethod === "trailing_30d" || demandMethod === "trailing_90d") {
    const windowDays = demandMethod === "trailing_30d" ? 30 : 90;
    const cutoff = addDays(referenceDate, -windowDays);
    const windowed = events.filter((event) => new Date(`${event.event_date}T00:00:00`) >= cutoff);
    return calculateAverageDailyUsage(windowed);
  }

  return calculateAverageDailyUsage(events);
}

/**
 * Rounds a planned quantity up to at least the MOQ, then up to the nearest multiple
 * of orderIncrement at or above that floor. Null/undefined/non-positive MOQ or
 * increment values are treated as "no constraint" on that dimension.
 */
export function roundToMoqIncrement(quantity: number, moq: number | null | undefined, increment: number | null | undefined): number {
  const safeQuantity = Math.max(Number(quantity ?? 0), 0);
  const floor = moq && moq > 0 ? Math.max(safeQuantity, moq) : safeQuantity;
  if (!increment || increment <= 0) return Math.ceil(floor);
  return Math.ceil(floor / increment) * increment;
}

export function buildSkuDailySeries(params: {
  horizonStart: string;
  horizonEnd: string;
  startingOnHand: number;
  startingAllocated: number;
  includeAllocated: boolean;
  dailyDemandRate: number;
  safetyStock: number;
  existingIncomingByDay: Map<string, number>;
  proposedIncomingByDay: Map<string, number>;
}): ProductionDailySeriesPoint[] {
  const {
    horizonStart,
    horizonEnd,
    startingOnHand,
    startingAllocated,
    includeAllocated,
    dailyDemandRate,
    safetyStock,
    existingIncomingByDay,
    proposedIncomingByDay,
  } = params;

  const dates = iterateDates(horizonStart, horizonEnd);
  const startingAvailable = startingOnHand - (includeAllocated ? startingAllocated : 0);

  let baselineAvailable = startingAvailable;
  let proposedAvailable = startingAvailable;

  return dates.map((date) => {
    const existingIncoming = existingIncomingByDay.get(date) ?? 0;
    const proposedIncoming = proposedIncomingByDay.get(date) ?? 0;

    baselineAvailable = baselineAvailable - dailyDemandRate + existingIncoming;
    proposedAvailable = proposedAvailable - dailyDemandRate + existingIncoming + proposedIncoming;

    return {
      date,
      baselineAvailable,
      proposedAvailable,
      safetyStockLine: safetyStock,
      zeroStockLine: 0,
      existingIncomingReceived: existingIncoming,
      proposedProductionReceived: proposedIncoming,
      isBelowSafetyStockBaseline: baselineAvailable < safetyStock,
      isBelowSafetyStockProposed: proposedAvailable < safetyStock,
      isStockoutBaseline: baselineAvailable <= 0,
      isStockoutProposed: proposedAvailable <= 0,
    };
  });
}

function findFirstDate(series: ProductionDailySeriesPoint[], predicate: (point: ProductionDailySeriesPoint) => boolean): string | null {
  return series.find(predicate)?.date ?? null;
}

function countDays(series: ProductionDailySeriesPoint[], predicate: (point: ProductionDailySeriesPoint) => boolean): number {
  return series.filter(predicate).length;
}

function daysOfSupply(available: number, dailyDemandRate: number): number {
  if (dailyDemandRate <= 0) return available > 0 ? Infinity : 0;
  return Math.max(available / dailyDemandRate, 0);
}

export function computeSkuSimulationResult(params: {
  plan: ProductionPlan;
  planItem: ProductionPlanItem;
  product: Product;
  vendor: Vendor | null;
  events: InventoryEvent[];
  purchaseOrders: PurchaseOrder[];
  lineItemsByPo: Map<string, PoLineItem[]>;
  referenceDate?: Date;
}): SkuSimulationResult {
  const { plan, planItem, product, events, purchaseOrders, lineItemsByPo } = params;
  const referenceDate = params.referenceDate ?? new Date();

  const safetyStock = plan.safety_stock_override ?? product.safety_stock ?? 0;
  const dailyDemandRate = computeDailyDemandRate(product, events, plan.demand_method, planItem.manual_daily_demand, referenceDate);

  const existingIncomingByDay = plan.include_existing_incoming
    ? getIncomingReceiptsByDay(product.id, purchaseOrders, lineItemsByPo, plan.horizon_start, plan.horizon_end)
    : new Map<string, number>();

  const roundedQuantity = roundToMoqIncrement(planItem.planned_quantity, planItem.moq, planItem.order_increment);
  const proposedIncomingByDay = new Map<string, number>();
  if (roundedQuantity > 0) {
    const arrivalDate = plan.target_arrival_date ?? plan.horizon_end;
    const clamped = arrivalDate < plan.horizon_start ? plan.horizon_start : arrivalDate > plan.horizon_end ? plan.horizon_end : arrivalDate;
    proposedIncomingByDay.set(clamped, (proposedIncomingByDay.get(clamped) ?? 0) + roundedQuantity);
  }

  const dailySeries = buildSkuDailySeries({
    horizonStart: plan.horizon_start,
    horizonEnd: plan.horizon_end,
    startingOnHand: product.current_inventory ?? 0,
    startingAllocated: product.inventory_allocated ?? 0,
    includeAllocated: plan.include_allocated,
    dailyDemandRate,
    safetyStock,
    existingIncomingByDay,
    proposedIncomingByDay,
  });

  const lastPoint = dailySeries.at(-1) ?? null;
  const inventoryGapBeforeReceipt = dailySeries.reduce((min, point) => Math.min(min, point.baselineAvailable), 0);

  const suggestedQuantity = Math.max(
    Math.ceil(dailyDemandRate * (plan.coverage_target_days ?? 30) - (product.current_inventory ?? 0)),
    0,
  );

  const family = product.parent_product_id
    ? product.parent_products?.name ?? product.parent_product_id
    : product.name;

  const firstStockoutDateProposed = findFirstDate(dailySeries, (point) => point.isStockoutProposed);
  const daysUntilStockout = firstStockoutDateProposed
    ? Math.max(daysBetween(plan.horizon_start, firstStockoutDateProposed), 0)
    : null;
  const horizonDays = Math.max(daysBetween(plan.horizon_start, plan.horizon_end), 1);
  const urgencyScore = daysUntilStockout === null ? 0 : Math.round(Math.max(0, 100 - (daysUntilStockout / horizonDays) * 100));
  const impactScore = Math.round(
    Math.min(100, ((product.unit_price || product.unit_cost || 1) * Math.max(roundedQuantity, 1)) / 5000 * 100),
  );

  const endingCoverageDaysProposed = lastPoint ? daysOfSupply(Math.max(lastPoint.proposedAvailable, 0), dailyDemandRate) : 0;

  return {
    productId: product.id,
    planItemId: planItem.id,
    sku: product.sku,
    productName: product.name,
    category: product.category,
    family,
    dailySeries,
    startingOnHand: product.current_inventory ?? 0,
    startingAllocated: product.inventory_allocated ?? 0,
    firstBelowSafetyStockDateBaseline: findFirstDate(dailySeries, (point) => point.isBelowSafetyStockBaseline),
    firstBelowSafetyStockDateProposed: findFirstDate(dailySeries, (point) => point.isBelowSafetyStockProposed),
    firstStockoutDateBaseline: findFirstDate(dailySeries, (point) => point.isStockoutBaseline),
    firstStockoutDateProposed,
    stockoutDayCountBaseline: countDays(dailySeries, (point) => point.isStockoutBaseline),
    stockoutDayCountProposed: countDays(dailySeries, (point) => point.isStockoutProposed),
    inventoryGapBeforeReceipt: Math.min(inventoryGapBeforeReceipt, 0),
    daysOfSupplyBefore: daysOfSupply(Math.max(product.current_inventory ?? 0, 0), dailyDemandRate),
    daysOfSupplyAfter: endingCoverageDaysProposed,
    suggestedQuantity,
    plannedQuantity: planItem.planned_quantity,
    moq: planItem.moq,
    orderIncrement: planItem.order_increment,
    roundedQuantity,
    estimatedCost: roundedQuantity * Number(planItem.unit_cost ?? product.unit_cost ?? 0),
    endingCoverageDaysBaseline: lastPoint ? daysOfSupply(Math.max(lastPoint.baselineAvailable, 0), dailyDemandRate) : 0,
    endingCoverageDaysProposed,
    isSlowMoverRisk: isSlowMover(events, referenceDate),
    isOverproductionRisk: endingCoverageDaysProposed > (plan.coverage_target_days ?? 30) * 2 && Number.isFinite(endingCoverageDaysProposed),
    capacityConflict: false, // populated by runProductionSimulation once capacity buckets are known
    urgencyScore,
    impactScore,
  };
}

/**
 * Capacity buckets are keyed by manufacturer (capacity_snapshots.partner_name) and the
 * calendar week (Monday-start) of each snapshot's date. "Newly proposed" units for a
 * bucket are the sum of plan items whose plan.production_week falls in that same week —
 * this assumes production_week identifies the manufacturing week a plan is slated for,
 * since capacity_snapshots has no existing per-week commitment concept to join against.
 */
function startOfWeek(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  return toDateInput(addDays(date, diff));
}

export function computeCapacitySeries(params: {
  plan: ProductionPlan;
  items: ProductionPlanItem[];
  capacitySnapshots: CapacitySnapshot[];
  vendor: Vendor | null;
}): CapacityUtilizationBucket[] {
  const { plan, items, capacitySnapshots, vendor } = params;
  const manufacturerCapacity = capacitySnapshots.filter((snapshot) => snapshot.capacity_type === "Manufacturer");

  const buckets = new Map<string, CapacityUtilizationBucket>();
  for (const snapshot of manufacturerCapacity) {
    const weekStart = startOfWeek(snapshot.snapshot_date);
    const key = `${snapshot.partner_name}::${weekStart}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.availableUnits += snapshot.available_units;
      existing.previouslyCommittedUnits += snapshot.committed_units;
    } else {
      buckets.set(key, {
        manufacturerId: null,
        manufacturerName: snapshot.partner_name,
        bucketStart: weekStart,
        bucketEnd: toDateInput(addDays(new Date(`${weekStart}T00:00:00`), 6)),
        availableUnits: snapshot.available_units,
        previouslyCommittedUnits: snapshot.committed_units,
        newlyProposedUnits: 0,
        remainingUnits: 0,
        isOverCapacity: false,
      });
    }
  }

  if (plan.production_week) {
    const weekStart = startOfWeek(plan.production_week);
    const manufacturerName = vendor?.name ?? "Unassigned";
    const key = `${manufacturerName}::${weekStart}`;
    const newlyProposedUnits = items.reduce(
      (sum, item) => sum + roundToMoqIncrement(item.planned_quantity, item.moq, item.order_increment),
      0,
    );
    const existing = buckets.get(key);
    if (existing) {
      existing.newlyProposedUnits += newlyProposedUnits;
    } else {
      buckets.set(key, {
        manufacturerId: null,
        manufacturerName,
        bucketStart: weekStart,
        bucketEnd: toDateInput(addDays(new Date(`${weekStart}T00:00:00`), 6)),
        availableUnits: 0,
        previouslyCommittedUnits: 0,
        newlyProposedUnits,
        remainingUnits: 0,
        isOverCapacity: false,
      });
    }
  }

  return [...buckets.values()]
    .map((bucket) => {
      const remainingUnits = bucket.availableUnits - bucket.previouslyCommittedUnits - bucket.newlyProposedUnits;
      return {
        ...bucket,
        remainingUnits,
        isOverCapacity: remainingUnits < 0,
      };
    })
    .sort((a, b) => a.bucketStart.localeCompare(b.bucketStart) || a.manufacturerName.localeCompare(b.manufacturerName));
}

/**
 * "Readiness complete" for a plan item: required spec fields present, barcode present
 * whenever required, and art_status explicitly "Approved". This threshold is an
 * explicit assumption (the brief did not enumerate exact readiness rules) and is
 * intentionally centralized here so both schedule blockers and approval-gate
 * validation (Phase 5) apply the identical rule.
 */
export function getReadinessBlockers(item: ProductionPlanItem): string[] {
  const blockers: string[] = [];
  if (!item.construction) blockers.push("Construction spec is missing.");
  if (!item.sock_size) blockers.push("Size is missing.");
  if (item.barcode_required && !item.artwork_file_ref) blockers.push("Barcode required but artwork reference is missing.");
  if (item.art_status !== "Approved") blockers.push("Artwork is not yet approved.");
  return blockers;
}

const MILESTONE_SEQUENCE: Array<{ key: ProductionScheduleMilestoneKey; label: string; durationDays: number }> = [
  { key: "approval", label: "Approval", durationDays: 3 },
  { key: "po_creation", label: "PO Creation", durationDays: 2 },
  { key: "production", label: "Production", durationDays: 21 },
  { key: "quality_check", label: "Quality Check", durationDays: 4 },
  { key: "packaging", label: "Packaging", durationDays: 5 },
  { key: "freight", label: "Freight", durationDays: 14 },
  { key: "receiving", label: "Receiving", durationDays: 2 },
];

export function computeScheduleMilestones(plan: ProductionPlan, items: ProductionPlanItem[]): ProductionScheduleMilestone[] {
  const anchor = plan.planned_order_date ?? plan.horizon_start;
  let cursor = new Date(`${anchor}T00:00:00`);
  const blockerReasons = items.flatMap((item) => getReadinessBlockers(item));
  const uniqueBlockers = [...new Set(blockerReasons)];

  return MILESTONE_SEQUENCE.map((milestone) => {
    const startDate = toDateInput(cursor);
    cursor = addDays(cursor, milestone.durationDays);
    const endDate = toDateInput(addDays(cursor, -1));
    const isBlocked = milestone.key === "approval" && uniqueBlockers.length > 0;
    return {
      key: milestone.key,
      label: milestone.label,
      startDate,
      endDate,
      isBlocked,
      blockerReasons: isBlocked ? uniqueBlockers : [],
      isRequiredArrivalMarker: milestone.key === "receiving",
    };
  });
}

export function computeCostMix(
  skuResults: SkuSimulationResult[],
  groupBy: "category" | "family" = "category",
): ProductionCostMixSlice[] {
  const groups = new Map<string, ProductionCostMixSlice>();
  for (const sku of skuResults) {
    const groupKey = (groupBy === "category" ? sku.category : sku.family) ?? "Uncategorized";
    const existing = groups.get(groupKey);
    if (existing) {
      existing.plannedUnits += sku.roundedQuantity;
      existing.estimatedCost += sku.estimatedCost;
    } else {
      groups.set(groupKey, {
        groupKey,
        groupLabel: groupKey,
        plannedUnits: sku.roundedQuantity,
        estimatedCost: sku.estimatedCost,
      });
    }
  }
  return [...groups.values()].sort((a, b) => b.estimatedCost - a.estimatedCost);
}

export function computeRiskMatrix(skuResults: SkuSimulationResult[]): SkuRiskMatrixPoint[] {
  return skuResults.map((sku) => ({
    productId: sku.productId,
    sku: sku.sku,
    productName: sku.productName,
    urgencyScore: sku.urgencyScore,
    impactScore: sku.impactScore,
    isOverproduced: sku.isOverproductionRisk,
    isStockoutRisk: sku.stockoutDayCountProposed > 0,
  }));
}

function buildSummary(skuResults: SkuSimulationResult[], scheduleMilestones: ProductionScheduleMilestone[], capacitySeries: CapacityUtilizationBucket[]): ProductionSimulationSummary {
  const stockoutDates = skuResults.map((sku) => sku.firstStockoutDateProposed).filter((date): date is string => Boolean(date));
  return {
    totalPlannedUnits: skuResults.reduce((sum, sku) => sum + sku.roundedQuantity, 0),
    totalEstimatedCost: skuResults.reduce((sum, sku) => sum + sku.estimatedCost, 0),
    skuCount: skuResults.length,
    skusWithStockoutRisk: skuResults.filter((sku) => sku.stockoutDayCountProposed > 0).length,
    skusOverproduced: skuResults.filter((sku) => sku.isOverproductionRisk).length,
    firstStockoutDate: stockoutDates.length ? stockoutDates.sort()[0] : null,
    capacityConflictCount: capacitySeries.filter((bucket) => bucket.isOverCapacity).length,
    readinessBlockerCount: scheduleMilestones.reduce((sum, milestone) => sum + milestone.blockerReasons.length, 0),
    averageEndingCoverageDaysBefore: skuResults.length
      ? skuResults.reduce((sum, sku) => sum + (Number.isFinite(sku.daysOfSupplyBefore) ? sku.daysOfSupplyBefore : 0), 0) / skuResults.length
      : 0,
    averageEndingCoverageDaysAfter: skuResults.length
      ? skuResults.reduce((sum, sku) => sum + (Number.isFinite(sku.endingCoverageDaysProposed) ? sku.endingCoverageDaysProposed : 0), 0) / skuResults.length
      : 0,
  };
}

function buildDailyPortfolioSeries(skuResults: SkuSimulationResult[], horizonStart: string, horizonEnd: string): ProductionDailySeriesPoint[] {
  const dates = iterateDates(horizonStart, horizonEnd);
  return dates.map((date, index) => {
    const points = skuResults.map((sku) => sku.dailySeries[index]).filter((point): point is ProductionDailySeriesPoint => Boolean(point));
    return {
      date,
      baselineAvailable: points.reduce((sum, point) => sum + point.baselineAvailable, 0),
      proposedAvailable: points.reduce((sum, point) => sum + point.proposedAvailable, 0),
      safetyStockLine: points.reduce((sum, point) => sum + point.safetyStockLine, 0),
      zeroStockLine: 0,
      existingIncomingReceived: points.reduce((sum, point) => sum + point.existingIncomingReceived, 0),
      proposedProductionReceived: points.reduce((sum, point) => sum + point.proposedProductionReceived, 0),
      isBelowSafetyStockBaseline: points.some((point) => point.isBelowSafetyStockBaseline),
      isBelowSafetyStockProposed: points.some((point) => point.isBelowSafetyStockProposed),
      isStockoutBaseline: points.some((point) => point.isStockoutBaseline),
      isStockoutProposed: points.some((point) => point.isStockoutProposed),
    };
  });
}

export function runProductionSimulation(input: ProductionSimulationEngineInput): ProductionSimulationResult {
  const { plan, items, products, vendor, eventsByProductId, purchaseOrders, lineItemsByPo, capacitySnapshots } = input;
  const productsById = new Map(products.map((product) => [product.id, product]));

  const capacitySeries = computeCapacitySeries({ plan, items, capacitySnapshots, vendor });
  const isCapacityConstrained = capacitySeries.some((bucket) => bucket.isOverCapacity);

  const skuResults = items
    .map((planItem) => {
      const product = productsById.get(planItem.product_id);
      if (!product) return null;
      const result = computeSkuSimulationResult({
        plan,
        planItem,
        product,
        vendor,
        events: eventsByProductId.get(product.id) ?? [],
        purchaseOrders,
        lineItemsByPo,
      });
      return { ...result, capacityConflict: isCapacityConstrained };
    })
    .filter((result): result is SkuSimulationResult => result !== null);

  const scheduleMilestones = computeScheduleMilestones(plan, items);
  const costMix = computeCostMix(skuResults, "category");
  const riskMatrix = computeRiskMatrix(skuResults);
  const summary = buildSummary(skuResults, scheduleMilestones, capacitySeries);
  const dailyPortfolioSeries = buildDailyPortfolioSeries(skuResults, plan.horizon_start, plan.horizon_end);

  return {
    simulationVersion: input.simulationVersion,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    planId: plan.id,
    horizonStart: plan.horizon_start,
    horizonEnd: plan.horizon_end,
    summary,
    dailyPortfolioSeries,
    skuResults,
    capacitySeries,
    scheduleMilestones,
    costMix,
    riskMatrix,
    recommendations: [],
  };
}
