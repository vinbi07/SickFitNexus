import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function BarChartCard({
  title,
  data,
  dataKey,
  xKey,
}: {
  title: string;
  data: Array<Record<string, string | number>>;
  dataKey: string;
  xKey: string;
}) {
  return (
    <div className="panel">
      <div className="panel-header">
        <h3>{title}</h3>
      </div>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey={xKey} />
            <YAxis />
            <Tooltip />
            <Bar dataKey={dataKey} fill="#e72027" radius={[10, 10, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
