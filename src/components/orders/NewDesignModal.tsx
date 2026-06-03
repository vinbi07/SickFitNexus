import { useState } from "react";
import { Modal } from "@/components/Modal";
import { orderDesignService } from "@/services/orderDesignService";
import type { OrderDesign, SockCard } from "@/types/domain";
import { getErrorMessage } from "@/utils/errors";

type Props = {
  sockCards: SockCard[];
  onSaved: (design: OrderDesign) => void;
  onClose: () => void;
};

const ART_STATUS_OPTIONS = ["NEEDED", "ON FILE", "NA"] as const;
const CONSTRUCTION_OPTIONS = ["Crew", "Ankle", "Quarter", "No Show", "Slouch"] as const;

export function NewDesignModal({ sockCards, onSaved, onClose }: Props) {
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

  async function handleSave() {
    try {
      setSaving(true);
      setErrorMsg(null);
      if (!String(form.name ?? "").trim()) throw new Error("Design name is required.");
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
        <p style={{ color: "var(--color-danger, #c0392b)", marginBottom: 12, fontSize: 13 }}>{errorMsg}</p>
      ) : null}

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
          <select value={form.construction ?? "Crew"} onChange={(e) => set("construction", e.target.value)}>
            {CONSTRUCTION_OPTIONS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="field field-half">
          <label>Default Sock Card</label>
          <select
            value={form.default_sock_card_id ?? ""}
            onChange={(e) => set("default_sock_card_id", e.target.value || null)}
          >
            <option value="">— none —</option>
            {sockCards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}
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
          <select value={form.art_status ?? "NEEDED"} onChange={(e) => set("art_status", e.target.value as OrderDesign["art_status"])}>
            {ART_STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
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
          <input
            value={String(form.mockup_file_ref ?? "")}
            onChange={(e) => set("mockup_file_ref", e.target.value || null)}
            placeholder="URL or file reference"
          />
        </div>
        <div className="field field-wide">
          <label>Artwork File Ref</label>
          <input
            value={String(form.art_file_ref ?? "")}
            onChange={(e) => set("art_file_ref", e.target.value || null)}
            placeholder="URL or file reference"
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
          <label key={key} style={{ fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={Boolean(form[key])}
              onChange={(e) => set(key, e.target.checked as OrderDesign[typeof key])}
            />
            {label}
          </label>
        ))}
      </div>

      <div className="btn-row" style={{ marginTop: 20, justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void handleSave()}>
          {saving ? "Saving…" : "Save Design"}
        </button>
      </div>
    </Modal>
  );
}
