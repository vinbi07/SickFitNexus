import {
  ComposedChart,
  Line,
  Bar,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  Legend,
  XAxis,
  YAxis,
} from "recharts";
import { InfoTooltip } from "@/components/Tooltip";
import type { ProductionDailySeriesPoint } from "@/types/domain";
import { formatDate, formatNumber } from "@/utils/format";

const SERIES_DESCRIPTIONS: Record<string, string> = {
  "Baseline (no action)": "What happens to inventory if nothing more is produced — just today's stock running down against demand.",
  "With proposed run": "Projected inventory if this plan's proposed quantities are produced and received as scheduled.",
  "Safety stock": "The minimum buffer you want on hand at all times, independent of this plan.",
  "Existing incoming": "Units already on order from prior POs, landing during this window.",
  "Proposed receipt": "The units this plan would add, landing on the Target Arrival Date.",
  "Target arrival": "The dashed marker for when this plan's units need to arrive.",
  "Stockout gap": "The shaded region marks days the baseline (no action) line runs out of stock.",
};

type LegendPayloadEntry = { value?: string; color?: string };

function InventoryProjectionLegend({ payload }: { payload?: LegendPayloadEntry[] }) {
  const entries = [
    ...(payload ?? []),
    { value: "Target arrival", color: "#6941c6" },
    { value: "Stockout gap", color: "#e72027" },
  ];

  return (
    <ul className="chart-legend-key">
      {entries.map((entry) => (
        <li key={entry.value} className="chart-legend-key-item">
          <span className="chart-legend-swatch" style={{ background: entry.color }} />
          {entry.value}
          {entry.value && SERIES_DESCRIPTIONS[entry.value] ? <InfoTooltip content={SERIES_DESCRIPTIONS[entry.value]} /> : null}
        </li>
      ))}
    </ul>
  );
}

function InventoryProjectionTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ProductionDailySeriesPoint }> }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;

  return (
    <div className="chart-tooltip">
      <strong>{formatDate(point.date)}</strong>
      <div>Baseline (no action): {formatNumber(point.baselineAvailable)} units</div>
      <div>With proposed run: {formatNumber(point.proposedAvailable)} units</div>
      <div>Safety stock target: {formatNumber(point.safetyStockLine)} units</div>
      {point.existingIncomingReceived > 0 ? <div>Existing incoming: +{formatNumber(point.existingIncomingReceived)} units</div> : null}
      {point.proposedProductionReceived > 0 ? <div>Proposed receipt: +{formatNumber(point.proposedProductionReceived)} units</div> : null}
      {point.isStockoutBaseline ? <div className="danger-text">⚠ Stockout (no action)</div> : null}
      {point.isStockoutProposed ? <div className="danger-text">⚠ Stockout (proposed)</div> : null}
      {!point.isStockoutProposed && point.isBelowSafetyStockProposed ? <div className="warning-text">⚠ Below safety stock (proposed)</div> : null}
    </div>
  );
}

/**
 * Hero chart: baseline vs proposed inventory over the horizon, with safety-stock and
 * zero-stock reference lines, existing/proposed receipt bars, a target-arrival marker,
 * and a shaded stockout gap. Built directly on Recharts primitives (not the simple
 * MultiLineChartCard wrapper) since it needs ReferenceArea/ReferenceLine and a
 * secondary receipts axis that the wrapper does not support.
 */
export function InventoryProjectionChart({
  title,
  series,
  targetArrivalDate,
}: {
  title: string;
  series: ProductionDailySeriesPoint[];
  targetArrivalDate: string | null;
}) {
  const firstStockoutIndex = series.findIndex((point) => point.isStockoutBaseline);
  let stockoutGap: { start: string; end: string } | null = null;
  if (firstStockoutIndex >= 0) {
    let endIndex = firstStockoutIndex;
    while (endIndex + 1 < series.length && series[endIndex + 1].isStockoutBaseline) endIndex += 1;
    stockoutGap = { start: series[firstStockoutIndex].date, end: series[endIndex].date };
  }

  const firstStockoutDate = series.find((point) => point.isStockoutProposed)?.date ?? null;
  const lastPoint = series.at(-1);

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>
          {title}
          <InfoTooltip content="Shows projected inventory over time with and without this plan's proposed production. Each point is the inventory level at the end of that day (after that day's demand and any receipts), not a live snapshot." />
        </h3>
      </div>

      <div className="chart-wrap chart-wrap-hero">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={series} margin={{ bottom: 8 }}>
            <XAxis dataKey="date" tickFormatter={(value: string) => formatDate(value)} />
            <YAxis yAxisId="units" />
            <YAxis yAxisId="receipts" orientation="right" />
            <Tooltip content={<InventoryProjectionTooltip />} />
            <Legend content={<InventoryProjectionLegend />} />
            {stockoutGap ? (
              <ReferenceArea
                yAxisId="units"
                x1={stockoutGap.start}
                x2={stockoutGap.end}
                fill="#e72027"
                fillOpacity={0.12}
                label={{ value: "Stockout gap (no action)", position: "insideTopLeft", fontSize: 11, fill: "#b41f29" }}
              />
            ) : null}
            <ReferenceLine yAxisId="units" y={0} stroke="#69707d" strokeDasharray="3 3" label={{ value: "Zero stock", position: "insideBottomLeft", fontSize: 10 }} />
            {targetArrivalDate ? (
              <ReferenceLine
                yAxisId="units"
                x={targetArrivalDate}
                stroke="#6941c6"
                strokeDasharray="4 4"
                label={{ value: "Target arrival", position: "top", fontSize: 10, fill: "#6941c6" }}
              />
            ) : null}
            <Bar yAxisId="receipts" dataKey="existingIncomingReceived" name="Existing incoming" fill="#d0d5dd" barSize={10} />
            <Bar yAxisId="receipts" dataKey="proposedProductionReceived" name="Proposed receipt" fill="#2958b3" barSize={10} />
            <Line yAxisId="units" type="monotone" dataKey="safetyStockLine" name="Safety stock" stroke="#945f08" strokeDasharray="5 5" dot={false} strokeWidth={2} />
            <Line yAxisId="units" type="monotone" dataKey="baselineAvailable" name="Baseline (no action)" stroke="#e72027" strokeWidth={3} dot={false} />
            <Line yAxisId="units" type="monotone" dataKey="proposedAvailable" name="With proposed run" stroke="#2958b3" strokeWidth={3} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="chart-text-summary">
        {stockoutGap
          ? `Without action, inventory runs out around ${formatDate(stockoutGap.start)}.`
          : "No baseline stockout is projected in this horizon."}{" "}
        {firstStockoutDate
          ? `Even with the proposed run, a stockout is still projected around ${formatDate(firstStockoutDate)}.`
          : "The proposed run avoids a stockout in this horizon."}{" "}
        {lastPoint ? `Ending proposed inventory: ${formatNumber(lastPoint.proposedAvailable)} units.` : null}
      </p>
    </div>
  );
}
