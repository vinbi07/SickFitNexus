import type { ReactNode } from "react";

export interface SummaryItem {
  label: string;
  value: ReactNode;
  note?: ReactNode;
}

/**
 * The few facts a page leads with, read left to right in one calm row.
 * Capped at four so the top of a page never turns into a metrics wall.
 */
export function SummaryStrip({ items }: { items: SummaryItem[] }) {
  const shown = items.slice(0, 4);
  return (
    <dl className="nx-summary">
      {shown.map((item) => (
        <div className="nx-summary-item" key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
          {item.note ? <dd className="nx-summary-note">{item.note}</dd> : null}
        </div>
      ))}
    </dl>
  );
}
