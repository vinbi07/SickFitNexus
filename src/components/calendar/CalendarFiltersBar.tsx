import { useEffect, useRef } from "react";
import {
  CALENDAR_CATEGORY_LABELS,
  CALENDAR_EVENT_CATEGORIES,
  CALENDAR_EVENT_STATUSES,
  CALENDAR_STATUS_LABELS,
  type CalendarEventCategory,
  type CalendarEventStatus,
  type CalendarFilterState,
} from "@/lib/calendar/calendarTypes";
import type { Product, Retailer, Vendor } from "@/types/domain";

const TITLE_ID = "calendar-filters-drawer-title";

function toggleInList<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function CalendarFiltersBar({
  open,
  onClose,
  filters,
  onChange,
  onReset,
  retailerOptions,
  manufacturerOptions,
  productOptions,
  ownerOptions,
}: {
  open: boolean;
  onClose: () => void;
  filters: CalendarFilterState;
  onChange: (patch: Partial<CalendarFilterState>) => void;
  onReset: () => void;
  retailerOptions: Retailer[];
  manufacturerOptions: Vendor[];
  productOptions: Product[];
  ownerOptions: string[];
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <>
      {open ? <div className="po-drawer-backdrop" onClick={onClose} /> : null}
      <div
        className={`po-drawer calendar-filters-drawer ${open ? "po-drawer-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        ref={panelRef}
        tabIndex={-1}
      >
        <div className="po-drawer-header">
          <div className="po-drawer-header-title">
            <h3 id={TITLE_ID}>Filters</h3>
          </div>
          <div className="po-drawer-header-actions">
            <button type="button" className="po-drawer-close" onClick={onClose} aria-label="Close filters">
              ✕
            </button>
          </div>
        </div>

        <div className="po-drawer-body">
          <fieldset className="calendar-filter-group">
            <legend>Category</legend>
            {CALENDAR_EVENT_CATEGORIES.map((category: CalendarEventCategory) => (
              <label key={category} className="calendar-filter-checkbox">
                <input
                  type="checkbox"
                  checked={filters.categories.includes(category)}
                  onChange={() => onChange({ categories: toggleInList(filters.categories, category) })}
                />
                {CALENDAR_CATEGORY_LABELS[category]}
              </label>
            ))}
          </fieldset>

          <fieldset className="calendar-filter-group">
            <legend>Status</legend>
            {CALENDAR_EVENT_STATUSES.map((status: CalendarEventStatus) => (
              <label key={status} className="calendar-filter-checkbox">
                <input
                  type="checkbox"
                  checked={filters.statuses.includes(status)}
                  onChange={() => onChange({ statuses: toggleInList(filters.statuses, status) })}
                />
                {CALENDAR_STATUS_LABELS[status]}
              </label>
            ))}
          </fieldset>

          <fieldset className="calendar-filter-group">
            <legend>Priority</legend>
            {(["high", "medium", "low"] as const).map((priority) => (
              <label key={priority} className="calendar-filter-checkbox">
                <input
                  type="checkbox"
                  checked={filters.priority.includes(priority)}
                  onChange={() => onChange({ priority: toggleInList(filters.priority, priority) })}
                />
                {priority[0].toUpperCase() + priority.slice(1)}
              </label>
            ))}
          </fieldset>

          <div className="field">
            <label htmlFor="calendar-filter-retailer">Retailer / Account</label>
            <select
              id="calendar-filter-retailer"
              value={filters.retailerId ?? ""}
              onChange={(event) => onChange({ retailerId: event.target.value || null })}
            >
              <option value="">All retailers</option>
              {retailerOptions.map((retailer) => (
                <option key={retailer.id} value={retailer.id}>
                  {retailer.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="calendar-filter-manufacturer">Manufacturer</label>
            <select
              id="calendar-filter-manufacturer"
              value={filters.manufacturerId ?? ""}
              onChange={(event) => onChange({ manufacturerId: event.target.value || null })}
            >
              <option value="">All manufacturers</option>
              {manufacturerOptions.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="calendar-filter-product">Product</label>
            <select
              id="calendar-filter-product"
              value={filters.productId ?? ""}
              onChange={(event) => onChange({ productId: event.target.value || null })}
            >
              <option value="">All products</option>
              {productOptions.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="calendar-filter-owner">Owner</label>
            <select
              id="calendar-filter-owner"
              value={filters.ownerLabel ?? ""}
              onChange={(event) => onChange({ ownerLabel: event.target.value || null })}
            >
              <option value="">All owners</option>
              {ownerOptions.map((owner) => (
                <option key={owner} value={owner}>
                  {owner}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="calendar-filter-generated">Source</label>
            <select
              id="calendar-filter-generated"
              value={filters.generatedFilter}
              onChange={(event) =>
                onChange({ generatedFilter: event.target.value as CalendarFilterState["generatedFilter"] })
              }
            >
              <option value="all">All events</option>
              <option value="automatic">Automatically generated</option>
              <option value="manual">Manually created</option>
            </select>
          </div>

          <fieldset className="calendar-filter-group">
            <legend>Quick filters</legend>
            <label className="calendar-filter-checkbox">
              <input
                type="checkbox"
                checked={filters.overdueOnly}
                onChange={(event) => onChange({ overdueOnly: event.target.checked })}
              />
              Overdue only
            </label>
            <label className="calendar-filter-checkbox">
              <input
                type="checkbox"
                checked={filters.needsActionOnly}
                onChange={(event) => onChange({ needsActionOnly: event.target.checked })}
              />
              Needs action
            </label>
          </fieldset>
        </div>

        <div className="po-drawer-footer">
          <button type="button" className="btn btn-ghost" onClick={onReset}>
            Reset Filters
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </>
  );
}
