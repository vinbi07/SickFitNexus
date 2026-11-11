import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
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
  /** Cell for a product's summary row when rows are grouped into variants. */
  renderGroup?: (rows: T[]) => ReactNode;
  /** Cell for a row shown under its group (e.g. just the variant, not the product name again). */
  renderVariant?: (row: T) => ReactNode;
}

/** Rows that share a key, in the order their first row appears. */
function groupRows<T>(rows: T[], keyOf: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()].map(([key, members]) => ({ key, rows: members }));
}

function Actions({ actions }: { actions: PageHeaderAction[] }) {
  return (
    <div className="pf-actions" onClick={(event) => event.stopPropagation()}>
      <RowActionsMenu>
        {actions.map((action) => (
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
  );
}

/**
 * Shopify-style list table: calm rows, whole-row click, and a quiet "⋯"
 * menu per row instead of a wall of buttons. Shares the product list styles.
 *
 * With `groupBy`, rows sharing a key fold under one summary row that opens to
 * show each of them, like variants under a product. A key with a single row
 * shows that row as usual.
 */
export function ResourceTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  actionsFor,
  emptyMessage,
  rowClassName,
  groupBy,
  groupLabel,
  groupActionsFor,
  defaultExpanded = false,
}: {
  rows: T[];
  columns: Array<ResourceColumn<T>>;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  actionsFor?: (row: T) => PageHeaderAction[];
  emptyMessage: string;
  rowClassName?: (row: T) => string | undefined;
  groupBy?: (row: T) => string;
  /** Names a group for screen readers, e.g. the product name. */
  groupLabel?: (rows: T[]) => string;
  groupActionsFor?: (rows: T[]) => PageHeaderAction[];
  /** Start with every group open, e.g. while searching. */
  defaultExpanded?: boolean;
}) {
  // Groups the person has flipped from the default.
  const [toggled, setToggled] = useState<Set<string>>(new Set());

  if (!rows.length) return <div className="empty-state">{emptyMessage}</div>;

  const cellClass = (column: ResourceColumn<T>) =>
    [column.align === "right" ? "rt-num" : "", column.hideOnMobile ? "rt-hide-mobile" : ""].filter(Boolean).join(" ") ||
    undefined;
  const toggle = (key: string) =>
    setToggled((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (groupBy) {
    const groups = groupRows(rows, groupBy);
    const plainRow = (row: T, asVariant: boolean) => (
      <tr
        key={rowKey(row)}
        className={[
          asVariant ? "rt-row rt-variant" : "rt-row",
          onRowClick ? "is-clickable" : "",
          rowClassName?.(row) ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={onRowClick ? () => onRowClick(row) : undefined}
      >
        {columns.map((column, index) => (
          <td key={column.key} className={cellClass(column)} data-label={column.title}>
            {index === 0 ? (
              asVariant ? (
                <div className="rt-variant-cell">{(column.renderVariant ?? column.render)(row)}</div>
              ) : (
                <div className="rt-group-cell">
                  <span className="pf-chevron-space" aria-hidden="true" />
                  {column.render(row)}
                </div>
              )
            ) : asVariant && column.renderVariant ? (
              column.renderVariant(row)
            ) : (
              column.render(row)
            )}
          </td>
        ))}
        {actionsFor ? (
          <td className="pf-col-actions">
            <Actions actions={actionsFor(row)} />
          </td>
        ) : null}
      </tr>
    );

    return (
      <div className="pf-shell">
        <table className="pf-table rt-table rt-grouped">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={cellClass(column)} style={column.width ? { width: column.width } : undefined}>
                  {column.title}
                </th>
              ))}
              {actionsFor || groupActionsFor ? (
                <th className="pf-col-actions">
                  <span className="visually-hidden">Actions</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {groups.flatMap((group) => {
              if (group.rows.length === 1) return [plainRow(group.rows[0], false)];
              const isOpen = defaultExpanded !== toggled.has(group.key);
              const label = groupLabel?.(group.rows) ?? "this product";
              return [
                <tr
                  key={`group:${group.key}`}
                  className={`rt-row rt-group is-clickable${isOpen ? " is-open" : ""}`}
                  onClick={() => toggle(group.key)}
                >
                  {columns.map((column, index) => (
                    <td key={column.key} className={cellClass(column)} data-label={column.title}>
                      {index === 0 ? (
                        <div className="rt-group-cell">
                          <button
                            type="button"
                            className="pf-chevron"
                            aria-expanded={isOpen}
                            aria-label={`${isOpen ? "Hide" : "Show"} variants for ${label}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggle(group.key);
                            }}
                          >
                            <ChevronRight size={16} aria-hidden="true" />
                          </button>
                          {(column.renderGroup ?? (() => column.render(group.rows[0])))(group.rows)}
                        </div>
                      ) : column.renderGroup ? (
                        column.renderGroup(group.rows)
                      ) : null}
                    </td>
                  ))}
                  {actionsFor || groupActionsFor ? (
                    <td className="pf-col-actions">
                      {groupActionsFor ? <Actions actions={groupActionsFor(group.rows)} /> : null}
                    </td>
                  ) : null}
                </tr>,
                ...(isOpen ? group.rows.map((row) => plainRow(row, true)) : []),
              ];
            })}
          </tbody>
        </table>
      </div>
    );
  }

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
                  <Actions actions={actionsFor(row)} />
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
