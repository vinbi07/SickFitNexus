import { useState, type ReactNode } from "react";

export interface DataTableColumn<T> {
  key: string;
  title: ReactNode;
  width?: string;
  /** Secondary columns stay hidden until "Show all columns" is turned on. */
  priority?: "primary" | "secondary";
  render: (row: T) => ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  emptyMessage = "No records available.",
  className,
  onRowClick,
}: {
  columns: Array<DataTableColumn<T>>;
  rows: T[];
  emptyMessage?: string;
  className?: string;
  onRowClick?: (row: T) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const secondaryCount = columns.filter((column) => column.priority === "secondary").length;
  const visibleColumns = showAll ? columns : columns.filter((column) => column.priority !== "secondary");

  if (!rows.length) {
    return <div className="empty-state">{emptyMessage}</div>;
  }

  return (
    <div className={className ? `table-shell ${className}` : "table-shell"}>
      {secondaryCount ? (
        <div className="table-toolbar">
          <button className="btn btn-ghost btn-small" type="button" onClick={() => setShowAll((current) => !current)}>
            {showAll ? "Show fewer columns" : `Show all columns (+${secondaryCount})`}
          </button>
        </div>
      ) : null}
      <table className="data-table">
        <thead>
          <tr>
            {visibleColumns.map((column) => (
              <th key={column.key} style={column.width ? { width: column.width } : undefined}>{column.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={index}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? "row-clickable" : undefined}
            >
              {visibleColumns.map((column) => (
                <td key={column.key} data-label={typeof column.title === "string" ? column.title : undefined}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
