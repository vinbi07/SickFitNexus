import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function LineChartCard({
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
          <LineChart data={data}>
            <XAxis dataKey={xKey} />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey={dataKey} stroke="#475467" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
