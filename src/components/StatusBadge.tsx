export function StatusBadge({ label }: { label: string }) {
  const normalized = label.toLowerCase();
  const className = normalized.includes("critical") || normalized.includes("delay") || normalized.includes("issue")
    ? "status-danger"
    : normalized.includes("warning") || normalized.includes("partial") || normalized.includes("overdue")
      ? "status-warning"
      : normalized.includes("receive") || normalized.includes("resolved") || normalized.includes("complete")
        ? "status-success"
        : normalized.includes("transit") || normalized.includes("ordered")
          ? "status-info"
          : "status-neutral";

  return <span className={`status-badge ${className}`}>{label}</span>;
}
