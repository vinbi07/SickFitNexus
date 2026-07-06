const LABEL_OVERRIDES: Record<string, string> = {
  "Not Requested": "Draft",
};

function resolveClassName(normalized: string) {
  // "unpaid" must be checked before the generic "paid" match below, since "unpaid".includes("paid").
  if (normalized.includes("unpaid")) return "status-neutral";
  if (normalized.includes("critical") || normalized.includes("delay") || normalized.includes("issue") || normalized.includes("danger") || normalized.includes("oversold")) {
    return "status-danger";
  }
  if (normalized.includes("warning") || normalized.includes("partial") || normalized.includes("overdue") || normalized.includes("low") || normalized.includes("reorder")) {
    return "status-warning";
  }
  if (normalized.includes("receive") || normalized.includes("resolved") || normalized.includes("complete") || normalized.includes("safe") || normalized.includes("paid")) {
    return "status-success";
  }
  if (normalized.includes("transit") || normalized.includes("ordered") || normalized.includes("ship") || normalized.includes("route") || normalized.includes("production")) {
    return "status-info";
  }
  return "status-neutral";
}

export function StatusBadge({ label }: { label: string }) {
  const displayLabel = LABEL_OVERRIDES[label] ?? label;
  const className = resolveClassName(displayLabel.toLowerCase());

  return <span className={`status-badge ${className}`}>{displayLabel}</span>;
}
