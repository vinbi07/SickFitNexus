import { useState } from "react";
import type { Product } from "@/types/domain";
import { getErrorMessage } from "@/utils/errors";

type Draft = {
  variant_title: string;
  sku: string;
  upc: string;
  unit_price: string;
  unit_cost: string;
  wholesale_price: string;
  msrp: string;
  safety_stock: string;
  case_pack_quantity: string;
  weight: string;
  dimensions: string;
};

const text = (value: unknown) => (value == null ? "" : String(value));

function toDraft(product: Product): Draft {
  return {
    variant_title: text(product.variant_title),
    sku: text(product.sku),
    upc: text(product.upc),
    unit_price: text(product.unit_price ?? ""),
    unit_cost: text(product.unit_cost ?? ""),
    wholesale_price: text(product.wholesale_price ?? ""),
    msrp: text(product.msrp ?? ""),
    safety_stock: text(product.safety_stock ?? ""),
    case_pack_quantity: text(product.case_pack_quantity ?? ""),
    weight: text(product.weight),
    dimensions: text(product.dimensions),
  };
}

const money = (value: string) => (value.trim() === "" ? 0 : Math.max(Number(value), 0));
const optional = (value: string) => (value.trim() ? value.trim() : null);

/** Turns the draft into a product patch, or throws a message the person can act on. */
export function draftToPatch(draft: Draft): Partial<Product> {
  const sku = draft.sku.trim();
  if (!sku) throw new Error("SKU is required.");
  const numbers = { unit_price: draft.unit_price, unit_cost: draft.unit_cost, wholesale_price: draft.wholesale_price, msrp: draft.msrp, safety_stock: draft.safety_stock, case_pack_quantity: draft.case_pack_quantity };
  for (const [key, value] of Object.entries(numbers)) {
    if (value.trim() !== "" && !Number.isFinite(Number(value))) throw new Error(`${key.replace(/_/g, " ")} must be a number.`);
  }
  return {
    variant_title: optional(draft.variant_title),
    sku,
    upc: draft.upc.replace(/\s/g, "") || null,
    unit_price: money(draft.unit_price),
    unit_cost: money(draft.unit_cost),
    wholesale_price: money(draft.wholesale_price),
    msrp: money(draft.msrp),
    safety_stock: Math.round(money(draft.safety_stock)),
    case_pack_quantity: Math.max(Math.round(Number(draft.case_pack_quantity) || 1), 1),
    weight: optional(draft.weight),
    dimensions: optional(draft.dimensions),
  };
}

const FIELDS: Array<{ key: keyof Draft; label: string; numeric?: boolean; step?: string }> = [
  { key: "variant_title", label: "Variant title" },
  { key: "sku", label: "SKU" },
  { key: "upc", label: "UPC" },
  { key: "unit_price", label: "Price", numeric: true, step: "0.01" },
  { key: "unit_cost", label: "Cost", numeric: true, step: "0.01" },
  { key: "wholesale_price", label: "Wholesale", numeric: true, step: "0.01" },
  { key: "msrp", label: "MSRP", numeric: true, step: "0.01" },
  { key: "safety_stock", label: "Safety stock", numeric: true, step: "1" },
  { key: "case_pack_quantity", label: "Case pack", numeric: true, step: "1" },
  { key: "weight", label: "Weight" },
  { key: "dimensions", label: "Dimensions" },
];

/**
 * Edits one variant right inside its table row. Stock isn't here on purpose:
 * it comes from Shopify and inventory records, not from the product row.
 */
export function VariantEditForm({
  product,
  onSave,
  onCancel,
}: {
  product: Product;
  onSave: (patch: Partial<Product>) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(product));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    let patch: Partial<Product>;
    try {
      patch = draftToPatch(draft);
    } catch (err) {
      setError(getErrorMessage(err));
      return;
    }
    setSaving(true);
    try {
      await onSave(patch);
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <form
      className="pd-variant-edit"
      onSubmit={(event) => void submit(event)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !saving) onCancel();
      }}
    >
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="pd-variant-edit-grid">
        {FIELDS.map((field, index) => (
          <label key={field.key} className="pd-variant-edit-field">
            <span>{field.label}</span>
            <input
              type={field.numeric ? "number" : "text"}
              inputMode={field.numeric ? "decimal" : undefined}
              min={field.numeric ? 0 : undefined}
              step={field.step}
              value={draft[field.key]}
              autoFocus={index === 0}
              disabled={saving}
              onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}
            />
          </label>
        ))}
      </div>
      <div className="pd-variant-edit-actions">
        <button type="button" className="btn btn-ghost" disabled={saving} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save variant"}
        </button>
      </div>
    </form>
  );
}
