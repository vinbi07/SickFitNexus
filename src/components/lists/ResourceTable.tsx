import type { ReactNode } from "react";
import type { PageHeaderAction } from "@/components/PageHeader";
import { RowActionsMenu } from "@/components/RowActionsMenu";

export interface ResourceColumn<T> {
  key: string;
  title: string;
  render: (row: T) => ReactNode;
  /** Right-align numbers so columns of quantities line up. */
  align?: "left" | "right";
  /** Hidden on narrow screens; the row still opens to show everything. */
  hideOnMobile?: boolean;
  width?: string;
}

/**
 * Shopify-style list table: calm rows, whole-row click, and a quiet "⋯"
 * menu per row instead of a wall of buttons. Shares the product list styles.
 */
export function ResourceTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  actionsFor,
  emptyMessage,
  rowClassName,
}: {
  rows: T[];
  columns: Array<ResourceColumn<T>>;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  actionsFor?: (row: T) => PageHeaderAction[];
  emptyMessage: string;
  rowClassName?: (row: T) => string | undefined;
}) {
  if (!rows.length) return <div className="empty-state">{emptyMessage}</div>;

  const cellClass = (column: ResourceColumn<T>) =>
    [column.align === "right" ? "rt-num" : "", column.hideOnMobile ? "rt-hide-mobile" : ""].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className="pf-shell">
      <table className="pf-table rt-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={cellClass(column)} style={column.width ? { width: column.width } : undefined}>
                {column.title}
              </th>
            ))}
            {actionsFor ? (
              <th className="pf-col-actions">
                <span className="visually-hidden">Actions</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={["rt-row", onRowClick ? "is-clickable" : "", rowClassName?.(row) ?? ""].filter(Boolean).join(" ")}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((column) => (
                <td key={column.key} className={cellClass(column)} data-label={column.title}>
                  {column.render(row)}
                </td>
              ))}
              {actionsFor ? (
                <td className="pf-col-actions">
                  <div className="pf-actions" onClick={(event) => event.stopPropagation()}>
                    <RowActionsMenu>
                      {actionsFor(row).map((action) => (
                        <button
                          key={action.label}
                          type="button"
                          className={`btn btn-ghost${action.danger ? " menu-item-danger" : ""}`}
                          disabled={action.disabled}
                          onClick={action.onClick}
                        >
                          {action.label}
                        </button>
                      ))}
                    </RowActionsMenu>
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Tabs + count chips used by the list pages. */
export function ListTabs<K extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: Array<{ key: K; label: string; count?: number }>;
  value: K;
  onChange: (key: K) => void;
  label: string;
}) {
  return (
    <div className="product-list-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={value === tab.key}
          className={`product-list-tab${value === tab.key ? " is-active" : ""}`}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
          {tab.count != null ? <span className="product-list-tab-count">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Removable chips for active filters, plus "Clear all". */
export function FilterChips({
  filters,
  onClearAll,
}: {
  filters: Array<{ key: string; label: string; onClear: () => void }>;
  onClearAll: () => void;
}) {
  if (!filters.length) return null;
  return (
    <div className="product-list-chips">
      {filters.map((filter) => (
        <button key={filter.key} type="button" className="filter-chip" onClick={filter.onClear}>
          {filter.label}
          <span aria-hidden="true">×</span>
          <span className="visually-hidden">Remove filter</span>
        </button>
      ))}
      <button type="button" className="btn btn-ghost btn-small" onClick={onClearAll}>
        Clear all
      </button>
    </div>
  );
}
