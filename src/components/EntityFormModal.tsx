import { useState } from "react";
import { Modal } from "@/components/Modal";
import { getErrorMessage } from "@/utils/errors";

export function EntityFormModal<T extends Record<string, unknown>>({
  title,
  initialValues,
  fields,
  onSave,
  onClose,
  saveLabel,
}: {
  title: string;
  initialValues: T;
  fields: Array<{
    key: keyof T;
    label: string;
    type?: "text" | "textarea" | "number" | "date" | "color" | "select";
    required?: boolean;
    min?: number;
    step?: number;
    options?: Array<{ label: string; value: string }>;
  }>;
  onSave: (values: T) => Promise<void>;
  onClose: () => void;
  saveLabel?: string;
}) {
  const [values, setValues] = useState<T>(initialValues);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal
      title={title}
      onClose={onClose}
      actions={
        <>
          <button className="btn btn-ghost" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={saving}
            onClick={async () => {
              try {
                setSaving(true);
                setError(null);
                await onSave(values);
                onClose();
              } catch (err) {
                setError(getErrorMessage(err));
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving..." : saveLabel ?? "Save"}
          </button>
        </>
      }
    >
      <div className="form-grid">
        {error ? <div className="form-error field-wide">{error}</div> : null}
        {fields.map((field) => (
          <div key={String(field.key)} className={`field ${field.type === "textarea" ? "field-wide" : ""}`}>
            <label>{field.label}</label>
            {field.type === "textarea" ? (
              <textarea
                rows={4}
                value={String(values[field.key] ?? "")}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [field.key]: event.target.value }))
                }
              />
            ) : field.type === "select" ? (
              <select
                value={String(values[field.key] ?? "")}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [field.key]: event.target.value }))
                }
              >
                <option value="">Select...</option>
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={field.type ?? "text"}
                required={field.required}
                min={field.min}
                step={field.step}
                value={String(values[field.key] ?? "")}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [field.key]:
                      field.type === "number" ? Number(event.target.value) : event.target.value,
                  }))
                }
              />
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
