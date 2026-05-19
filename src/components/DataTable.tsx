import type { ReactNode } from "react";

export function DataTable<T>({
  columns,
  rows,
  emptyMessage = "No records available.",
  className,
}: {
  columns: Array<{ key: string; title: string; render: (row: T) => ReactNode }>;
  rows: T[];
  emptyMessage?: string;
  className?: string;
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
              <th key={column.key}>{column.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map((column) => (
                <td key={column.key}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
