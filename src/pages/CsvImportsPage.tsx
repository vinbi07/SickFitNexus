import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable } from "@/components/DataTable";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Modal } from "@/components/Modal";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { CsvImportWorkflow } from "@/features/csv-import/CsvImportWorkflow";
import { useAsyncData } from "@/hooks/useAsyncData";
import { csvImportService } from "@/services/csvImportService";
import { formatDate } from "@/utils/format";

export function CsvImportsPage() {
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const { data, loading, error, reload } = useAsyncData(
    async () => ({
      imports: await csvImportService.listImports(),
      presets: await csvImportService.listPresets(),
    }),
    [],
  );
  const [selectedImportId, setSelectedImportId] = useState<string | null>(null);
  const [showReset, setShowReset] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [undoingImportId, setUndoingImportId] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);
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
        description="Upload wholesale PO files, preview and validate a Shields-style template, undo mistakes safely, and keep the app ready for future PDF-to-CSV intake."
        actions={
          <button className="btn btn-danger" onClick={() => setShowReset(true)}>
            Reset Imported Data
          </button>
        }
      />
      {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}
      <CsvImportWorkflow onImported={reload} />
      <div className="panel section-stack">
        <div className="panel-header">
          <h3>Future PDF Intake</h3>
        </div>
        <div className="timeline">
          <div className="timeline-item">
            <strong>AI-assisted PDF to CSV placeholder</strong>
            <p>Converted PO data should land in the same CSV template used here so validation, preview, undo import, and error handling continue to work without a separate import path.</p>
          </div>
          <div className="timeline-item">
            <strong>Audit trail structure reserved</strong>
            <p>The data model now leaves room for record-level audit logging later without requiring authentication to ship first.</p>
          </div>
        </div>
      </div>
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
                <div className="btn-row">
                  <button className="btn btn-ghost btn-small" onClick={() => setSelectedImportId(row.id)}>
                    Review Failed Rows
                  </button>
                  <button
                    className="btn btn-secondary btn-small"
                    disabled={row.import_status === "Rolled Back"}
                    onClick={() => setUndoingImportId(row.id)}
                  >
                    {row.import_status === "Rolled Back" ? "Rolled Back" : "Undo Import"}
                  </button>
                </div>
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
      {showReset ? (
        <Modal
          title="Reset Imported Data"
          onClose={() => {
            if (!resetting) {
              setShowReset(false);
              setResetPassword("");
            }
          }}
          actions={
            <>
              <button
                className="btn btn-ghost"
                disabled={resetting}
                onClick={() => {
                  setShowReset(false);
                  setResetPassword("");
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                disabled={resetting}
                onClick={async () => {
                  try {
                    setResetting(true);
                    await csvImportService.resetImportedData(resetPassword);
                    setShowReset(false);
                    setResetPassword("");
                    await reload();
                    setNotice({
                      tone: "success",
                      message: "Imported purchase orders, related events, and import logs were reset successfully.",
                    });
                  } catch (resetError) {
                    setNotice({
                      tone: "error",
                      message: resetError instanceof Error ? resetError.message : "Failed to reset imported data.",
                    });
                  } finally {
                    setResetting(false);
                  }
                }}
              >
                {resetting ? "Resetting..." : "Reset Data"}
              </button>
            </>
          }
        >
          <div className="section-stack">
            <p className="modal-message">
              This clears imported purchase orders, their line items, related PO inventory events, and import logs.
              It does not remove products, vendors, or locations that may have been created earlier.
            </p>
            <div className="field">
              <label>Reset Password</label>
              <input
                type="password"
                value={resetPassword}
                onChange={(event) => setResetPassword(event.target.value)}
                placeholder="Enter reset password"
              />
            </div>
          </div>
        </Modal>
      ) : null}
      {undoingImportId ? (
        <ConfirmDialog
          title="Undo this import?"
          message="This rolls back records created or updated by this import when lineage metadata is available. Older imports created before lineage support may not be reversible."
          confirmLabel="Undo Import"
          busy={undoing}
          onClose={() => {
            if (!undoing) setUndoingImportId(null);
          }}
          onConfirm={async () => {
            try {
              setUndoing(true);
              await csvImportService.undoImport(undoingImportId);
              setUndoingImportId(null);
              await reload();
              setNotice({
                tone: "success",
                message: "Import rolled back successfully using import lineage.",
              });
            } catch (undoError) {
              setNotice({
                tone: "error",
                message: undoError instanceof Error ? undoError.message : "Failed to roll back import.",
              });
            } finally {
              setUndoing(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}
