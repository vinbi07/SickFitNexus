import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";

export function MultiLineChartCard({
  title,
  data,
  xKey,
  series,
}: {
  title: string;
  data: Array<Record<string, string | number | null>>;
  xKey: string;
  series: Array<{
    dataKey: string;
    label: string;
    stroke: string;
    strokeDasharray?: string;
    connectNulls?: boolean;
  }>;
}) {
  return (
    <div className="panel">
      <div className="panel-header">
        <h3>{title}</h3>
      </div>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <XAxis dataKey={xKey} />
            <YAxis />
            <Tooltip />
            <Legend />
            {series.map((line) => (
              <Line
                key={line.dataKey}
                type="monotone"
                dataKey={line.dataKey}
                name={line.label}
                stroke={line.stroke}
                strokeWidth={3}
                strokeDasharray={line.strokeDasharray}
                dot={false}
                connectNulls={line.connectNulls ?? true}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
