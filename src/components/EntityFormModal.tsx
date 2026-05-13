import { useState } from "react";
import { Modal } from "@/components/Modal";

export function EntityFormModal<T extends Record<string, unknown>>({
  title,
  initialValues,
  fields,
  onSave,
  onClose,
}: {
  title: string;
  initialValues: T;
  fields: Array<{ key: keyof T; label: string; type?: "text" | "textarea" | "number" | "date" | "color" }>;
  onSave: (values: T) => Promise<void>;
  onClose: () => void;
}) {
  const [values, setValues] = useState<T>(initialValues);
  const [saving, setSaving] = useState(false);

  return (
    <Modal
      title={title}
      onClose={onClose}
      actions={
        <button
          className="btn btn-primary"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            await onSave(values);
            setSaving(false);
            onClose();
          }}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      }
    >
      <div className="form-grid">
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
            ) : (
              <input
                type={field.type ?? "text"}
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
