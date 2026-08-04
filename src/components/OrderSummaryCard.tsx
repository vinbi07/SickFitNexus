import type { ReactNode } from "react";

type SummaryField = {
  label: string;
  value: ReactNode;
};

type OrderSummaryCardProps = {
  heading: string;
  metaLine: string;
  statusControl: ReactNode;
  fields: SummaryField[];
  primaryAction?: ReactNode;
};

export function OrderSummaryCard({ heading, metaLine, statusControl, fields, primaryAction }: OrderSummaryCardProps) {
  return (
    <div className="panel section-stack">
      <div className="panel-header">
        <div className="cell-stack">
          <h3>{heading}</h3>
          <span className="helper-text">{metaLine}</span>
        </div>
        <div className="btn-row">
          {statusControl}
          {primaryAction}
        </div>
      </div>
      <div className="stat-strip">
        {fields.map((field) => (
          <div className="stat-item" key={field.label}>
            <span>{field.label}</span>
            <strong>{field.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
