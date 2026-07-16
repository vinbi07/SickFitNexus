import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SkuSimulationResult } from "@/types/domain";
import { formatNumber } from "@/utils/format";

type GroupBy = "sku" | "family" | "category";

function coverageValue(value: number) {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

export function CoverageComparisonChart({ skuResults }: { skuResults: SkuSimulationResult[] }) {
  const [groupBy, setGroupBy] = useState<GroupBy>("category");

  const data = useMemo(() => {
    if (groupBy === "sku") {
      return [...skuResults]
        .sort((a, b) => a.daysOfSupplyAfter - b.daysOfSupplyAfter)
        .slice(0, 8)
        .map((sku) => ({
          label: sku.sku,
          before: coverageValue(sku.daysOfSupplyBefore),
          after: coverageValue(sku.daysOfSupplyAfter),
        }));
    }

    const groups = new Map<string, { totalBefore: number; totalAfter: number; count: number }>();
    for (const sku of skuResults) {
      const key = (groupBy === "family" ? sku.family : sku.category) ?? "Uncategorized";
      const existing = groups.get(key) ?? { totalBefore: 0, totalAfter: 0, count: 0 };
      existing.totalBefore += Number.isFinite(sku.daysOfSupplyBefore) ? sku.daysOfSupplyBefore : 0;
      existing.totalAfter += Number.isFinite(sku.daysOfSupplyAfter) ? sku.daysOfSupplyAfter : 0;
      existing.count += 1;
      groups.set(key, existing);
    }
    return [...groups.entries()].map(([label, group]) => ({
      label,
      before: coverageValue(group.totalBefore / group.count),
      after: coverageValue(group.totalAfter / group.count),
    }));
  }, [skuResults, groupBy]);

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>Before vs After Coverage</h3>
        <div className="pill-row">
          {(["category", "family", "sku"] as GroupBy[]).map((option) => (
            <button
              key={option}
              className={`btn btn-small ${groupBy === option ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setGroupBy(option)}
            >
              {option === "sku" ? "Top SKUs" : option[0].toUpperCase() + option.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" />
            <YAxis label={{ value: "Days of supply", angle: -90, position: "insideLeft", fontSize: 11 }} />
            <Tooltip formatter={(value) => `${formatNumber(Number(value))} days`} />
            <Legend />
            <Bar dataKey="before" name="Before (no action)" fill="#d0d5dd" radius={[6, 6, 0, 0]} />
            <Bar dataKey="after" name="After (proposed run)" fill="#2958b3" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="chart-text-summary">
        Grouped by {groupBy}. Bars compare average days of supply before and after the proposed run.
      </p>
    </div>
  );
}
