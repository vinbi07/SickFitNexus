import { useMemo, useState } from "react";
import { DataTable } from "@/components/DataTable";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { UploadZone } from "@/components/UploadZone";
import { csvImportService } from "@/services/csvImportService";
import { STANDARD_FIELDS } from "@/utils/csv";
import { getErrorMessage } from "@/utils/errors";

export function CsvImportWorkflow({ onImported }: { onImported: () => Promise<void> }) {
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const previewRows = useMemo(() => rows.slice(0, 5), [rows]);
  const validationPreview = useMemo(() => {
    if (!rows.length) return [];
    return csvImportService.validateNormalizedRows(csvImportService.normalizeRows(rows, mapping)).slice(0, 8);
  }, [rows, mapping]);

  async function handleFile(file: File) {
    try {
      setError(null);
      setResultMessage(null);
      setFileName(file.name);
      const parsed = await csvImportService.parseCsvFile(file);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMapping(csvImportService.inferMapping(parsed.headers));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read CSV file");
    }
  }

  return (
    <div className="section-stack">
      <UploadZone onFileSelected={(file) => void handleFile(file)} />
      {error ? <ErrorState message={error} /> : null}
      {headers.length > 0 ? (
        <div className="panel section-stack">
          <div className="panel-header">
            <div>
              <h3>Map CSV columns</h3>
              <p className="muted">{fileName} • {rows.length} rows detected</p>
            </div>
            <div className="btn-row">
              <input
                placeholder="Preset name"
                value={presetName}
                onChange={(event) => setPresetName(event.target.value)}
              />
              <button
                className="btn btn-secondary"
                onClick={async () => {
                  await csvImportService.savePreset({ name: presetName || fileName, mapping_config: mapping });
                }}
              >
                Save Mapping Preset
              </button>
            </div>
          </div>
          <div className="form-grid">
            {STANDARD_FIELDS.map((field) => (
              <div key={field} className="field field-half">
                <label>{field}</label>
                <select
                  value={mapping[field] ?? ""}
                  onChange={(event) =>
                    setMapping((current) => ({ ...current, [field]: event.target.value }))
                  }
                >
                  <option value="">Select column</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div>
            <h3>CSV Preview</h3>
            <DataTable
              columns={headers.map((header) => ({
                key: header,
                title: header,
                render: (row: Record<string, string>) => row[header] ?? "",
              }))}
              rows={previewRows}
            />
          </div>
          <div className="btn-row">
            <button
              className="btn btn-primary"
              disabled={importing}
              onClick={async () => {
                setImporting(true);
                try {
                  setError(null);
                  setResultMessage(null);
                  const result = await csvImportService.importRows(fileName, mapping, rows);
                  setResultMessage(
                    `Import finished: ${result.successfulRows} successful rows, ${result.failedRows} failed rows.`,
                  );
                  await onImported();
                } catch (err) {
                  setError(getErrorMessage(err));
                } finally {
                  setImporting(false);
                }
              }}
            >
              {importing ? "Importing..." : "Validate and Import"}
            </button>
          </div>
          {validationPreview.length ? (
            <div className="panel" style={{ background: "#fff8ea", borderColor: "#f3ddb4", boxShadow: "none" }}>
              <strong>Validation warnings before import</strong>
              <div className="timeline" style={{ marginTop: 12 }}>
                {validationPreview.map((item) => (
                  <div key={`${item.rowNumber}-${item.errorMessage}`} className="timeline-item">
                    <strong>Row {item.rowNumber}</strong>
                    <p>{item.errorMessage}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {resultMessage ? (
            <div className="panel" style={{ background: "#ecf9f0", borderColor: "#cbe8d6", boxShadow: "none" }}>
              <strong className="success-text">{resultMessage}</strong>
            </div>
          ) : null}
        </div>
      ) : rows.length === 0 && fileName ? (
        <LoadingState message="Parsing CSV..." />
      ) : null}
    </div>
  );
}
