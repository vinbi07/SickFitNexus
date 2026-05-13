import type { ReactNode } from "react";

export function DashboardCard({
  label,
  value,
  footnote,
  highlight = false,
}: {
  label: string;
  value: ReactNode;
  footnote?: string;
  highlight?: boolean;
}) {
  return (
    <div className={`card metric-card${highlight ? " kpi-highlight" : ""}`}>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      {footnote ? <span className="metric-footnote">{footnote}</span> : null}
    </div>
  );
}
