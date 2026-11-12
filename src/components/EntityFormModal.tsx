import { useState } from "react";
import { Modal } from "@/components/Modal";
import { FileUploadCell } from "@/components/orders/FileUploadCell";
import type { UploadFolder } from "@/services/storageService";
import { getErrorMessage } from "@/utils/errors";

export function EntityFormModal<T extends Record<string, unknown>>({
  title,
  initialValues,
  fields,
  onSave,
  onClose,
  saveLabel,
  className,
}: {
  title: string;
  initialValues: T;
  fields: Array<{
    key: keyof T;
    label: string;
    type?: "text" | "textarea" | "number" | "date" | "color" | "select" | "checkbox" | "image";
    required?: boolean;
    min?: number;
    step?: number;
    options?: Array<{ label: string; value: string }>;
    folder?: UploadFolder;
    /** Fields sharing a section render together as one column of the form. */
    section?: string;
  }>;
  onSave: (values: T) => Promise<void>;
  onClose: () => void;
  saveLabel?: string;
  /** Extra class on the modal shell, e.g. to make it wider. */
  className?: string;
}) {
  const [values, setValues] = useState<T>(initialValues);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sectionNames = [
    ...new Set(fields.map((field) => field.section).filter((name): name is string => Boolean(name))),
  ];

  const renderField = (field: (typeof fields)[number]) => (
    <div
      key={String(field.key)}
      className={`field ${field.type === "textarea" || (field.section && field.type === "image") ? "field-wide" : ""}${
        field.type === "checkbox" ? " field-checkbox" : ""
      }`}
    >
      <label>{field.label}</label>
      {field.type === "textarea" ? (
        <textarea
          rows={field.section ? 3 : 4}
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
      ) : field.type === "checkbox" ? (
        <input
          type="checkbox"
          checked={Boolean(values[field.key])}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              [field.key]: event.target.checked,
            }))
          }
        />
      ) : field.type === "image" ? (
        <div className="image-field">
          <FileUploadCell
            className="mfr-upload-cell--product"
            value={values[field.key] ? String(values[field.key]) : null}
            folder={field.folder ?? "products"}
            accept="image/*"
            label={field.label}
            onChange={(url) =>
              setValues((current) => ({ ...current, [field.key]: url }))
            }
          />
          <input
            type="text"
            placeholder="Or paste an image URL"
            value={String(values[field.key] ?? "")}
            onChange={(event) =>
              setValues((current) => ({ ...current, [field.key]: event.target.value }))
            }
          />
        </div>
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
  );

  return (
    <Modal
      title={title}
      onClose={onClose}
      className={className}
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
      {sectionNames.length ? (
        <>
          {error ? <div className="form-error">{error}</div> : null}
          <div className="form-sections">
            {sectionNames.map((name) => (
              <section key={name} className="form-section">
                <h4 className="form-section-title">{name}</h4>
                <div className="form-grid">
                  {fields.filter((field) => field.section === name).map(renderField)}
                </div>
              </section>
            ))}
          </div>
          {fields.some((field) => !field.section) ? (
            <div className="form-grid">{fields.filter((field) => !field.section).map(renderField)}</div>
          ) : null}
        </>
      ) : (
        <div className="form-grid">
          {error ? <div className="form-error field-wide">{error}</div> : null}
          {fields.map(renderField)}
        </div>
      )}
    </Modal>
  );
}
