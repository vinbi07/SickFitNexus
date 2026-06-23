import { useState } from "react";
import { Modal } from "@/components/Modal";
import { orderDesignService } from "@/services/orderDesignService";
import type { CatalogDesignOption } from "@/services/orderDesignService";
import type { OrderDesign, SockCard } from "@/types/domain";
import { getErrorMessage } from "@/utils/errors";
import { FileUploadCell } from "./FileUploadCell";
import { DesignSearchPicker } from "./DesignSearchPicker";

type Props = {
  sockCards: SockCard[];
  catalogOptions: CatalogDesignOption[];
  onSaved: (design: OrderDesign) => void;
  onClose: () => void;
};

const ART_STATUS_OPTIONS = ["NEEDED", "ON FILE", "NA"] as const;
const CONSTRUCTION_OPTIONS = [
  "Crew",
  "Ankle",
  "Quarter",
  "No Show",
  "Slouch",
] as const;

export function NewDesignModal({
  sockCards,
  catalogOptions,
  onSaved,
  onClose,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<OrderDesign>>({
    type: "custom",
    art_status: "NEEDED",
    rib_lr: true,
    toe: true,
    pattern: false,
    signature: false,
    barcode_required: false,
    exw_cost: 1.89,
    retail_price: 0,
    in_shopify: false,
  });

  function set<K extends keyof OrderDesign>(key: K, value: OrderDesign[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function applyCatalogOption(optionId: string) {
    const option = catalogOptions.find((o) => o.id === optionId);
    if (!option) return;
    const d = option.design;
    setForm((current) => ({
      ...current,
      name: d.name ?? current.name,
      partner: d.partner ?? current.partner,
      colorway: d.colorway ?? current.colorway,
      pantone: d.pantone ?? current.pantone,
      hex: d.hex ?? current.hex,
      construction: d.construction ?? current.construction,
      default_sock_card_id:
        d.default_sock_card_id ?? current.default_sock_card_id,
      exw_cost: d.exw_cost ?? current.exw_cost,
      retail_price: d.retail_price ?? current.retail_price,
      barcode: d.barcode ?? current.barcode,
      barcode_required: d.barcode_required ?? current.barcode_required,

      art_status: d.art_status ?? current.art_status,
      foot_text: d.foot_text ?? current.foot_text,
      mockup_file_ref: d.mockup_file_ref ?? current.mockup_file_ref,
      art_file_ref: d.art_file_ref ?? current.art_file_ref,
      rib_lr: d.rib_lr ?? current.rib_lr,
      toe: d.toe ?? current.toe,
      pattern: d.pattern ?? current.pattern,
      signature: d.signature ?? current.signature,
    }));
  }

  async function handleSave() {
    try {
      setSaving(true);
      setErrorMsg(null);
      if (!String(form.name ?? "").trim())
        throw new Error("Design name is required.");
      const saved = await orderDesignService.saveDesign(form);
      onSaved(saved);
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New Custom Design" onClose={onClose}>
      {errorMsg ? (
        <p
          style={{
            color: "var(--color-danger, #c0392b)",
            marginBottom: 12,
            fontSize: 13,
          }}
        >
          {errorMsg}
        </p>
      ) : null}

      <div className="field field-wide" style={{ marginBottom: 12 }}>
        <label>Search Designs & Products</label>
        <DesignSearchPicker
          selectedLabel=""
          catalogOptions={catalogOptions}
          onSetDesign={applyCatalogOption}
        />
      </div>

      <div className="form-grid">
        <div className="field field-wide">
          <label>Design Name *</label>
          <input
            value={String(form.name ?? "")}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Crew BCA Socks – WNBA Dallas Wings"
          />
        </div>
        <div className="field field-half">
          <label>Partner / Account</label>
          <input
            value={String(form.partner ?? "")}
            onChange={(e) => set("partner", e.target.value)}
            placeholder="e.g. Dallas Wings, Vanguard"
          />
        </div>
        <div className="field field-half">
          <label>Colorway</label>
          <input
            value={String(form.colorway ?? "")}
            onChange={(e) => set("colorway", e.target.value)}
            placeholder="e.g. Pink"
          />
        </div>
        <div className="field field-half">
          <label>Pantone</label>
          <input
            value={String(form.pantone ?? "")}
            onChange={(e) => set("pantone", e.target.value)}
            placeholder="e.g. 812 C or (on file)"
          />
        </div>
        <div className="field field-half">
          <label>Hex Color (swatch)</label>
          <input
            type="color"
            value={String(form.hex ?? "#444444")}
            onChange={(e) => set("hex", e.target.value)}
          />
        </div>
        <div className="field field-half">
          <label>Construction</label>
          <select
            value={form.construction ?? "Crew"}
            onChange={(e) => set("construction", e.target.value)}
          >
            {CONSTRUCTION_OPTIONS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="field field-half">
          <label>Default Sock Card</label>
          <select
            value={form.default_sock_card_id ?? ""}
            onChange={(e) =>
              set("default_sock_card_id", e.target.value || null)
            }
          >
            <option value="">— none —</option>
            {sockCards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field field-half">
          <label>EXW Cost ($)</label>
          <input
            type="number"
            step={0.01}
            min={0}
            value={form.exw_cost ?? 1.89}
            onChange={(e) => set("exw_cost", Number(e.target.value))}
          />
        </div>
        <div className="field field-half">
          <label>Retail Price ($)</label>
          <input
            type="number"
            step={0.01}
            min={0}
            value={form.retail_price ?? 0}
            onChange={(e) => set("retail_price", Number(e.target.value))}
          />
        </div>
        <div className="field field-half">
          <label>Barcode / UPC</label>
          <input
            value={String(form.barcode ?? "")}
            onChange={(e) => set("barcode", e.target.value || null)}
            placeholder="UPC string"
          />
        </div>
        <div className="field field-half">
          <label>Art Status</label>
          <select
            value={form.art_status ?? "NEEDED"}
            onChange={(e) =>
              set("art_status", e.target.value as OrderDesign["art_status"])
            }
          >
            {ART_STATUS_OPTIONS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="field field-wide">
          <label>Foot Text</label>
          <input
            value={String(form.foot_text ?? "")}
            onChange={(e) => set("foot_text", e.target.value || null)}
            placeholder="e.g. BUILT DIFFERENT MADE FOR THE RESILIENT"
          />
        </div>
        <div className="field field-wide">
          <label>Mockup File Ref</label>
          <FileUploadCell
            value={form.mockup_file_ref}
            folder="mockups"
            accept="image/*"
            label="Mock"
            onChange={(url) => set("mockup_file_ref", url)}
          />
        </div>
        <div className="field field-wide">
          <label>Artwork File Ref</label>
          <FileUploadCell
            value={form.art_file_ref}
            folder="artwork"
            accept="image/*,application/pdf,.ai,.eps,.svg"
            label="Art"
            onChange={(url) => set("art_file_ref", url)}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8 }}>
        {(
          [
            { key: "rib_lr", label: "SickFit on Rib L/R" },
            { key: "toe", label: "SickFit on Toe" },
            { key: "pattern", label: "Pattern" },
            { key: "signature", label: "Signature" },
            { key: "barcode_required", label: "Barcode Required" },
          ] as Array<{ key: keyof OrderDesign; label: string }>
        ).map(({ key, label }) => (
          <label
            key={key}
            style={{
              fontSize: 13,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <input
              type="checkbox"
              checked={Boolean(form[key])}
              onChange={(e) =>
                set(key, e.target.checked as OrderDesign[typeof key])
              }
            />
            {label}
          </label>
        ))}
      </div>

      <div
        className="btn-row"
        style={{ marginTop: 20, justifyContent: "flex-end" }}
      >
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving}
          onClick={() => void handleSave()}
        >
          {saving ? "Saving…" : "Save Design"}
        </button>
      </div>
    </Modal>
  );
}
