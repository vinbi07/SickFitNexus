import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** Secondary detail that stays out of the way until asked for. Collapsed by default. */
export function Disclosure({
  summary = "Show more details",
  openSummary = "Show less",
  defaultOpen = false,
  children,
}: {
  summary?: string;
  openSummary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <details className="nx-disclosure" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="nx-disclosure-summary">
        <span>{open ? openSummary : summary}</span>
        <ChevronDown size={16} aria-hidden="true" className="nx-disclosure-icon" />
      </summary>
      <div className="nx-disclosure-body">{children}</div>
    </details>
  );
}
