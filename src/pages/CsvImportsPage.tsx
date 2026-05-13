import { useState } from "react";
import { DataTable } from "@/components/DataTable";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { CsvImportWorkflow } from "@/features/csv-import/CsvImportWorkflow";
import { useAsyncData } from "@/hooks/useAsyncData";
import { csvImportService } from "@/services/csvImportService";
import { formatDate } from "@/utils/format";

export function CsvImportsPage() {
  const { data, loading, error, reload } = useAsyncData(
    async () => ({
      imports: await csvImportService.listImports(),
      presets: await csvImportService.listPresets(),
    }),
    [],
  );
  const [selectedImportId, setSelectedImportId] = useState<string | null>(null);
  const { data: errors } = useAsyncData(
    () => (selectedImportId ? csvImportService.listImportErrors(selectedImportId) : Promise.resolve([])),
    [selectedImportId],
  );

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load imports"} />;

  return (
    <div className="section-stack">
      <PageHeader
        title="CSV Import + Normalization"
        description="Upload vendor PO files, map inconsistent headers, validate rows, and inspect import history with failures."
      />
      <CsvImportWorkflow onImported={reload} />
      <div className="panel section-stack">
        <div className="panel-header">
          <h3>Saved Mapping Presets</h3>
        </div>
        <DataTable
          columns={[
            { key: "name", title: "Preset", render: (row) => row.name },
            { key: "updated_at", title: "Updated", render: (row) => formatDate(row.updated_at) },
          ]}
          rows={data.presets}
        />
      </div>
      <div className="panel section-stack">
        <div className="panel-header">
          <h3>Import History</h3>
        </div>
        <DataTable
          columns={[
            { key: "file_name", title: "File", render: (row) => row.file_name },
            { key: "status", title: "Status", render: (row) => <StatusBadge label={row.import_status} /> },
            { key: "rows", title: "Rows", render: (row) => `${row.successful_rows}/${row.row_count}` },
            { key: "failed", title: "Failed", render: (row) => row.failed_rows },
            { key: "created_at", title: "Imported", render: (row) => formatDate(row.created_at) },
            {
              key: "actions",
              title: "Actions",
              render: (row) => (
                <button className="btn btn-ghost" onClick={() => setSelectedImportId(row.id)}>
                  Review Failed Rows
                </button>
              ),
            },
          ]}
          rows={data.imports}
        />
      </div>
      {selectedImportId ? (
        <Modal title="Import Errors" onClose={() => setSelectedImportId(null)}>
          <DataTable
            columns={[
              { key: "row_number", title: "Row", render: (row) => row.row_number },
              { key: "error_message", title: "Error", render: (row) => row.error_message },
              { key: "raw_row", title: "Raw Row", render: (row) => JSON.stringify(row.raw_row) },
            ]}
            rows={errors ?? []}
            emptyMessage="No failed rows for this import."
          />
        </Modal>
      ) : null}
    </div>
  );
}
