import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { SlidersHorizontal } from "lucide-react";
import { useDropdownPosition } from "@/hooks/useDropdownPosition";

/** One "Filter" button that holds every secondary filter, Shopify-style. */
export function FilterPopover({
  activeCount,
  onClearAll,
  children,
}: {
  activeCount: number;
  onClearAll: () => void;
  children: ReactNode;
}) {
  const dropdown = useDropdownPosition();

  return (
    <>
      <button
        ref={dropdown.triggerRef}
        type="button"
        className="btn btn-secondary"
        aria-expanded={dropdown.open}
        aria-haspopup="dialog"
        onClick={() => dropdown.setOpen((current) => !current)}
      >
        <SlidersHorizontal size={16} aria-hidden="true" />
        Filter
        {activeCount > 0 ? <span className="filter-count">{activeCount}</span> : null}
      </button>
      {dropdown.open
        ? createPortal(
            <div
              ref={dropdown.popoverRef}
              role="dialog"
              aria-label="Filters"
              className="date-picker-popover-portal filter-popover"
              style={{ top: dropdown.position.top, left: dropdown.position.left }}
            >
              <div className="filter-popover-body">{children}</div>
              <div className="filter-popover-foot">
                <button type="button" className="btn btn-ghost btn-small" disabled={!activeCount} onClick={onClearAll}>
                  Clear all
                </button>
                <button type="button" className="btn btn-primary btn-small" onClick={() => dropdown.setOpen(false)}>
                  Done
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
