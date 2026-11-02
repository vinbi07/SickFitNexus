import { useEffect, useState } from "react";
import { DatePickerField } from "@/components/DatePickerField";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { useAsyncData } from "@/hooks/useAsyncData";
import { supplyChainService } from "@/services/supplyChainService";
import type { FactoryShutdown, SupplyChainSettings } from "@/types/domain";
import { getErrorMessage } from "@/utils/errors";
import { diffInDays, totalLeadDays } from "@/utils/leadTime";

type NumericKey =
  | "prod_days"
  | "pack_days"
  | "sea_days"
  | "air_days"
  | "port_to_wh_days"
  | "buffer_days"
  | "packaging_reorder_pct"
  | "sea_rate_per_pair"
  | "air_rate_per_pair";

const FIELDS: { key: NumericKey; label: string; step?: string; optional?: boolean }[] = [
  { key: "prod_days", label: "Production days (paid to done)" },
  { key: "pack_days", label: "Packing days (inside production)" },
  { key: "sea_days", label: "Sea transit days" },
  { key: "air_days", label: "Air transit days" },
  { key: "port_to_wh_days", label: "Port to warehouse days" },
  { key: "buffer_days", label: "Safety buffer days" },
  { key: "packaging_reorder_pct", label: "Reorder packaging at % left" },
  { key: "sea_rate_per_pair", label: "Sea freight $ per pair", step: "0.01", optional: true },
  { key: "air_rate_per_pair", label: "Air freight $ per pair", step: "0.01", optional: true },
];

const EMPTY_SHUTDOWN = { name: "", start_date: "", end_date: "" };

export function LeadTimeSettingsPanel() {
  const { data, loading, error, reload } = useAsyncData(
    () => Promise.all([supplyChainService.getSettings(), supplyChainService.listShutdowns()]),
    [],
  );
  const [values, setValues] = useState<SupplyChainSettings | null>(null);
  const [draft, setDraft] = useState(EMPTY_SHUTDOWN);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (data) setValues(data[0]);
  }, [data]);

  if (loading) return <LoadingState message="Loading lead times..." />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load lead times"} />;
  if (!values) return null;

  const shutdowns: FactoryShutdown[] = data[1];

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      setBusy(true);
      setMessage(null);
      await action();
      await reload();
      setMessage(success);
    } catch (actionError) {
      setMessage(getErrorMessage(actionError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel section-stack">
      <div className="panel-header">
        <h3>Lead Times &amp; Factory Shutdowns</h3>
      </div>
      <p className="helper-text">
        Planning defaults for factory orders. Expected arrival dates and order-by dates count from these, and
        production that overlaps a shutdown is pushed out by the shutdown's length. Full lead time today:{" "}
        {totalLeadDays("Sea", values)} days by sea, {totalLeadDays("Air", values)} days by air.
      </p>
      <div className="form-grid">
        {FIELDS.map((field) => (
          <div className="field field-half" key={field.key}>
            <label>{field.label}</label>
            <input
              type="number"
              min="0"
              step={field.step ?? "1"}
              value={values[field.key] ?? ""}
              onChange={(event) => {
                const raw = event.target.value;
                setValues((current) =>
                  current
                    ? { ...current, [field.key]: raw === "" ? (field.optional ? null : 0) : Number(raw) }
                    : current,
                );
              }}
            />
          </div>
        ))}
      </div>
      <div className="btn-row">
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={() => run(() => supplyChainService.saveSettings(values), "Lead times saved.")}
        >
          {busy ? "Saving..." : "Save Lead Times"}
        </button>
      </div>

      <h4>Factory shutdowns</h4>
      <p className="helper-text">
        Add Chinese New Year and any other closures. Confirm exact dates with the factory each year.
      </p>
      <div className="table-shell">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Start</th>
              <th>End</th>
              <th>Days</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shutdowns.length ? (
              shutdowns.map((shutdown) => (
                <tr key={shutdown.id}>
                  <td>{shutdown.name}</td>
                  <td>{shutdown.start_date}</td>
                  <td>{shutdown.end_date}</td>
                  <td>{diffInDays(shutdown.end_date, shutdown.start_date)}</td>
                  <td>
                    <button
                      className="btn btn-danger btn-small"
                      type="button"
                      disabled={busy}
                      onClick={() => run(() => supplyChainService.deleteShutdown(shutdown.id), "Shutdown removed.")}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="helper-text">
                  No shutdowns yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="form-grid">
        <div className="field field-half">
          <label>Name</label>
          <input
            placeholder="e.g. Chinese New Year 2027"
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          />
        </div>
        <div className="field field-half">
          <DatePickerField
            label="Start"
            value={draft.start_date}
            onChange={(value) => setDraft((current) => ({ ...current, start_date: value ?? "" }))}
          />
        </div>
        <div className="field field-half">
          <DatePickerField
            label="End"
            value={draft.end_date}
            minDate={draft.start_date || null}
            onChange={(value) => setDraft((current) => ({ ...current, end_date: value ?? "" }))}
          />
        </div>
      </div>
      <div className="btn-row">
        <button
          className="btn btn-secondary"
          type="button"
          disabled={busy || !draft.name.trim() || !draft.start_date || !draft.end_date || draft.end_date < draft.start_date}
          onClick={() =>
            run(async () => {
              await supplyChainService.saveShutdown({ ...draft, name: draft.name.trim() });
              setDraft(EMPTY_SHUTDOWN);
            }, "Shutdown added.")
          }
        >
          Add Shutdown
        </button>
      </div>
      {message ? (
        <p className={/saved|added|removed/.test(message) ? "success-text" : "danger-text"}>{message}</p>
      ) : null}
    </div>
  );
}
