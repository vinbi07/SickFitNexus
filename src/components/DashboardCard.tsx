import { Link } from "react-router-dom";
import type { ReactNode } from "react";

export function DashboardCard({
  label,
  value,
  footnote,
  highlight = false,
  to,
  action,
}: {
  label: string;
  value: ReactNode;
  footnote?: string;
  highlight?: boolean;
  to?: string;
  action?: ReactNode;
}) {
  const content = (
    <div className={`card metric-card${highlight ? " kpi-highlight" : ""}`}>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      {footnote ? <span className="metric-footnote">{footnote}</span> : null}
    </div>
  );

  if (!to && !action) return content;

  const linkedContent = to ? (
    <Link className="dashboard-link-card" to={to}>
      {content}
    </Link>
  ) : content;

  return (
    <div className="dashboard-card-shell">
      {linkedContent}
      {action ? <div className="dashboard-card-action">{action}</div> : null}
    </div>
  );
}
