import { Link } from "react-router-dom";
import type { ReactNode } from "react";

export function DashboardCard({
  label,
  value,
  footnote,
  highlight = false,
  to,
}: {
  label: string;
  value: ReactNode;
  footnote?: string;
  highlight?: boolean;
  to?: string;
}) {
  const content = (
    <div className={`card metric-card${highlight ? " kpi-highlight" : ""}`}>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      {footnote ? <span className="metric-footnote">{footnote}</span> : null}
    </div>
  );

  if (!to) return content;

  return (
    <Link className="dashboard-link-card" to={to}>
      {content}
    </Link>
  );
}
