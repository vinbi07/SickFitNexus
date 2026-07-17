import type { ReactNode } from "react";

export function DataTable<T>({
  columns,
  rows,
  emptyMessage = "No records available.",
  className,
  onRowClick,
}: {
  columns: Array<{ key: string; title: ReactNode; width?: string; render: (row: T) => ReactNode }>;
  rows: T[];
  emptyMessage?: string;
  className?: string;
  onRowClick?: (row: T) => void;
}) {
  if (!rows.length) {
    return <div className="empty-state">{emptyMessage}</div>;
  }

  return (
    <div className={className ? `table-shell ${className}` : "table-shell"}>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
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
              {columns.map((column) => (
                <td key={column.key} data-label={column.title}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
