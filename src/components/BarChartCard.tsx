import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function BarChartCard({
  title,
  data,
  dataKey,
  xKey,
  layout = "vertical",
}: {
  title: string;
  data: Array<Record<string, string | number>>;
  dataKey: string;
  xKey: string;
  layout?: "vertical" | "horizontal";
}) {
  const isHorizontal = layout === "horizontal";

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>{title}</h3>
      </div>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout={isHorizontal ? "vertical" : "horizontal"}>
            <XAxis
              dataKey={isHorizontal ? undefined : xKey}
              type={isHorizontal ? "number" : "category"}
            />
            <YAxis
              dataKey={isHorizontal ? xKey : undefined}
              type={isHorizontal ? "category" : "number"}
              width={isHorizontal ? 120 : 60}
            />
            <Tooltip />
            <Bar dataKey={dataKey} fill="#e72027" radius={[10, 10, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
