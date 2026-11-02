import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import type { WeeklySalesPoint } from "@/utils/productSales";
import { formatNumber } from "@/utils/format";

function weekLabel(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(year, month - 1, day));
}

function SalesTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: WeeklySalesPoint }> }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="pd-chart-tip">
      <span>Week of {weekLabel(point.weekStart)}</span>
      <strong>{formatNumber(point.units)} sold</strong>
    </div>
  );
}

/** Weekly units sold across every variant; one quiet series, no grid. */
export function SalesChart({ series }: { series: WeeklySalesPoint[] }) {
  return (
    <div className="pd-chart" role="img" aria-label={`Weekly units sold: ${series.map((point) => point.units).join(", ")}`}>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={series} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="weekStart"
            tickFormatter={weekLabel}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={24}
            tick={{ fontSize: 12 }}
          />
          <Tooltip content={<SalesTooltip />} cursor={{ className: "pd-chart-cursor" }} />
          <Bar dataKey="units" className="pd-chart-bar" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
