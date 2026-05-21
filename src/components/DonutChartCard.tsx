import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export function DonutChartCard({
  title,
  data,
}: {
  title: string;
  data: Array<{
    label: string;
    value: number;
    color: string;
  }>;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="panel section-stack">
      <div className="panel-header">
        <h3>{title}</h3>
        <span className="helper-text">{total} tracked SKUs</span>
      </div>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="58%"
              outerRadius="82%"
              paddingAngle={2}
            >
              {data.map((entry) => (
                <Cell key={entry.label} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => [value, "SKUs"]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="stat-list">
        {data.map((item) => {
          const percent = total > 0 ? Math.round((item.value / total) * 100) : 0;

          return (
            <div key={item.label} className="stat-row">
              <div className="chart-legend-label">
                <span className="chart-legend-swatch" style={{ backgroundColor: item.color }} aria-hidden="true" />
                <strong>{item.label}</strong>
              </div>
              <span className="muted">{item.value} SKUs · {percent}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
