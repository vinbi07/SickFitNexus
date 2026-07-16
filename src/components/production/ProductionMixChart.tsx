import { DashboardCard } from "@/components/DashboardCard";
import type { ProductionCostMixSlice } from "@/types/domain";
import { formatCurrency, formatNumber } from "@/utils/format";

/**
 * Total planned units and estimated cost for this run, shown as two plain figures
 * rather than a chart or a group-by-group breakdown.
 */
export function ProductionMixChart({
  costMix,
}: {
  costMix: ProductionCostMixSlice[];
}) {
  const totalUnits = costMix.reduce(
    (sum, slice) => sum + slice.plannedUnits,
    0,
  );
  const totalCost = costMix.reduce(
    (sum, slice) => sum + slice.estimatedCost,
    0,
  );

  return (
    <div className="section-stack">
      <div className="section-stack">
        <DashboardCard label="Planned Units" value={formatNumber(totalUnits)} />
        <DashboardCard
          label="Estimated Cost"
          value={formatCurrency(totalCost)}
        />
      </div>
    </div>
  );
}
