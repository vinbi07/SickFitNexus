import { AlertTriangle } from "lucide-react";
import { Bar, BarChart, Cell, Legend, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CapacityUtilizationBucket } from "@/types/domain";
import { formatDate, formatNumber } from "@/utils/format";

export function CapacityUtilizationChart({ buckets }: { buckets: CapacityUtilizationBucket[] }) {
  if (!buckets.length) {
    return (
      <div className="panel">
        <div className="panel-header"><h3>Manufacturer Capacity Utilization</h3></div>
        <div className="empty-state">No capacity snapshots for this manufacturer/week yet.</div>
      </div>
    );
  }

  const data = buckets.map((bucket) => ({
    label: `${bucket.manufacturerName} · ${formatDate(bucket.bucketStart)}`,
    previouslyCommittedUnits: bucket.previouslyCommittedUnits,
    newlyProposedUnits: bucket.newlyProposedUnits,
    availableUnits: bucket.availableUnits,
    remainingUnits: bucket.remainingUnits,
    isOverCapacity: bucket.isOverCapacity,
  }));

  const overCapacityCount = buckets.filter((bucket) => bucket.isOverCapacity).length;

  return (
    <div className="panel">
      <div className="panel-header"><h3>Manufacturer Capacity Utilization</h3></div>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis />
            <Tooltip formatter={(value) => formatNumber(Number(value))} />
            <Legend />
            <Bar dataKey="previouslyCommittedUnits" name="Previously committed" stackId="capacity" fill="#d0d5dd" />
            <Bar dataKey="newlyProposedUnits" name="Newly proposed" stackId="capacity">
              {data.map((row) => (
                <Cell key={row.label} fill={row.isOverCapacity ? "#e72027" : "#2958b3"} />
              ))}
            </Bar>
            <Line dataKey="availableUnits" name="Available capacity" stroke="#12703c" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {overCapacityCount > 0 ? (
        <p className="helper-text schedule-blocker-note">
          <AlertTriangle size={13} aria-hidden /> {overCapacityCount} bucket(s) exceed available capacity once this run is added.
        </p>
      ) : null}
      <p className="chart-text-summary">
        Stacked bars show previously committed plus newly proposed units against the available-capacity line. Red segments mark buckets over capacity.
      </p>
    </div>
  );
}
