import type { ProductionPlan, ProductionRecommendation, ProductionSimulationResult } from "@/types/domain";

/**
 * Deterministic, rule-based recommendation engine. Every rule maps directly to one row
 * of the brief's "Recommendation rule examples" table — no AI/opaque scoring involved.
 */
export function generateRecommendations(result: ProductionSimulationResult, plan: ProductionPlan): ProductionRecommendation[] {
  const recommendations: ProductionRecommendation[] = [];

  const stockoutSkus = result.skuResults.filter((sku) => sku.stockoutDayCountProposed > 0);
  if (stockoutSkus.length) {
    recommendations.push({
      id: "stockout-before-receipt",
      reasonCode: "stockout_before_receipt",
      severity: "critical",
      title: "Stockout occurs before the planned receipt date",
      explanation: `${stockoutSkus.length} SKU(s) are projected to hit zero inventory before the proposed production run arrives.`,
      impact: `${stockoutSkus.reduce((sum, sku) => sum + sku.stockoutDayCountProposed, 0)} total stockout-days across affected SKUs.`,
      affectedProductIds: stockoutSkus.map((sku) => sku.productId),
      suggestedAction: "Move the order date forward, expedite a portion of the run, split the run, or identify alternate inventory.",
      quickAction: { label: "Move order date earlier", type: "move_order_date" },
      isDismissed: false,
      dismissNote: null,
    });
  }

  const belowTargetSkus = result.skuResults.filter(
    (sku) => sku.endingCoverageDaysProposed < plan.coverage_target_days && !sku.isOverproductionRisk,
  );
  if (belowTargetSkus.length) {
    recommendations.push({
      id: "coverage-below-target",
      reasonCode: "coverage_below_target",
      severity: "warning",
      title: "Ending coverage is below target",
      explanation: `${belowTargetSkus.length} SKU(s) end the horizon with fewer days of supply than the ${plan.coverage_target_days}-day coverage target.`,
      impact: "These SKUs will likely need another reorder cycle sooner than planned.",
      affectedProductIds: belowTargetSkus.map((sku) => sku.productId),
      suggestedAction: "Increase the planned quantity to the next MOQ or case-pack increment.",
      quickAction: { label: "Increase quantity to next increment", type: "adjust_quantity" },
      isDismissed: false,
      dismissNote: null,
    });
  }

  const overproducedSkus = result.skuResults.filter((sku) => sku.isOverproductionRisk);
  if (overproducedSkus.length) {
    recommendations.push({
      id: "coverage-excessively-high",
      reasonCode: "coverage_excessively_high",
      severity: "info",
      title: "Ending coverage is excessively high",
      explanation: `${overproducedSkus.length} SKU(s) would end the horizon with more than 2x the coverage target.`,
      impact: "Capital and capacity are tied up in inventory that won't turn for a long time.",
      affectedProductIds: overproducedSkus.map((sku) => sku.productId),
      suggestedAction: "Reduce the run for these SKUs or reallocate that capacity to higher-risk SKUs.",
      quickAction: { label: "Reduce quantity", type: "reduce_quantity" },
      isDismissed: false,
      dismissNote: null,
    });
  }

  const capacityConflictSkus = result.skuResults.filter((sku) => sku.capacityConflict);
  if (capacityConflictSkus.length || result.summary.capacityConflictCount > 0) {
    recommendations.push({
      id: "capacity-exceeded",
      reasonCode: "capacity_exceeded",
      severity: "critical",
      title: "Proposed quantity exceeds available capacity",
      explanation: `${result.summary.capacityConflictCount} manufacturer/week bucket(s) are over capacity once this run is added.`,
      impact: "This run cannot be produced as planned in the selected lane/week without a conflict.",
      affectedProductIds: capacityConflictSkus.map((sku) => sku.productId),
      suggestedAction: "Choose another production week, another lane, or split the run across manufacturers.",
      quickAction: { label: "Split across manufacturers", type: "split_manufacturer" },
      isDismissed: false,
      dismissNote: null,
    });
  }

  const blockedMilestones = result.scheduleMilestones.filter((milestone) => milestone.isBlocked);
  if (blockedMilestones.length) {
    const affected = result.skuResults
      .filter((sku) => sku.roundedQuantity > 0)
      .map((sku) => sku.productId);
    recommendations.push({
      id: "readiness-blocker",
      reasonCode: "readiness_blocker",
      severity: "critical",
      title: "Artwork, barcode, card, or spec is incomplete",
      explanation: blockedMilestones.flatMap((milestone) => milestone.blockerReasons).join(" "),
      impact: "Approval is blocked until these manufacturing readiness items are resolved.",
      affectedProductIds: affected,
      suggestedAction: "Complete the missing artwork, barcode, card, or spec fields, or override with a documented reason.",
      quickAction: null,
      isDismissed: false,
      dismissNote: null,
    });
  }

  const redundantIncomingSkus = result.skuResults.filter(
    (sku) => sku.roundedQuantity > 0 && sku.daysOfSupplyBefore >= plan.coverage_target_days,
  );
  if (redundantIncomingSkus.length) {
    recommendations.push({
      id: "existing-incoming-covers-demand",
      reasonCode: "existing_incoming_covers_demand",
      severity: "info",
      title: "Existing incoming inventory already covers demand",
      explanation: `${redundantIncomingSkus.length} SKU(s) already have enough on-hand and incoming inventory to meet the coverage target without this run.`,
      impact: "The proposed quantity for these SKUs may be unnecessary.",
      affectedProductIds: redundantIncomingSkus.map((sku) => sku.productId),
      suggestedAction: "Reduce or remove the redundant proposed quantity for these SKUs.",
      quickAction: { label: "Reduce quantity", type: "reduce_quantity" },
      isDismissed: false,
      dismissNote: null,
    });
  }

  return recommendations;
}
