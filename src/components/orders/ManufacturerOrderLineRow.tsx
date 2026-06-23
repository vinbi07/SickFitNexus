import type { PoLineItem, SockCard } from "@/types/domain";
import type { CatalogDesignOption } from "@/services/orderDesignService";
import { calculateCardsUsed } from "@/services/sockCardService";
import { FileUploadCell } from "./FileUploadCell";
import { DesignSearchPicker } from "./DesignSearchPicker";

export type ManufacturerBuilderLine = Partial<PoLineItem> & {
  tempId: string;
  colorway?: string;
  hex?: string;
};

const ART_STATUS_OPTIONS = ["ON FILE", "NEEDED", "NA"] as const;
const CONSTRUCTION_OPTIONS = ["Crew", "Ankle", "Quarter", "No Show", "Slouch"] as const;

type Props = {
  line: ManufacturerBuilderLine;
  index: number;
  sockCards: SockCard[];
  catalogOptions: CatalogDesignOption[];
  onUpdate: (index: number, patch: Partial<ManufacturerBuilderLine>) => void;
  onRemove: (index: number) => void;
  onOpenNewDesign: () => void;
};

function Flag({ active, label, title, onClick }: { active: boolean; label: string; title: string; onClick: () => void }) {
  return (
    <button type="button" title={title} onClick={onClick} className={`mfr-flag-chip${active ? " mfr-flag-chip-on" : ""}`}>
      {label}
    </button>
  );
}

export function ManufacturerOrderLineRow({ line, index, sockCards, catalogOptions, onUpdate, onRemove, onOpenNewDesign }: Props) {
  const qty = Number(line.quantity_ordered ?? 0);
  const pack = Number(line.pack_pairs ?? 1);
  const cards = calculateCardsUsed(qty, pack);
  const exw = Number(line.unit_cost ?? 1.89);
  const cost = qty * exw;

  function set(patch: Partial<ManufacturerBuilderLine>) { onUpdate(index, patch); }

  function setCard(cardId: string) {
    const card = sockCards.find((c) => c.id === cardId) ?? null;
    set({
      sock_card_id: cardId || null,
      pack_pairs: card?.pack_pairs ?? 1,
      sock_size: card?.size ?? null,
      construction: line.construction || card?.style || "Crew",
    });
  }

  function setDesign(optionId: string) {
    const option = catalogOptions.find((o) => o.id === optionId);
    if (!option) return;
    const d = option.design;
    const card = sockCards.find((c) => c.id === d.default_sock_card_id) ?? null;
    set({
      design_id: d.id ?? null,
      product_id: d.product_id ?? null,
      product_name: d.name ?? "",
      description: d.name ?? "",
      upc: d.barcode ?? "",
      colorway: d.colorway ?? "",
      hex: d.hex ?? "",
      variant_label: d.colorway ?? "",
      unit: "pairs",
      unit_cost: Number(d.exw_cost ?? 1.89),
      unit_retail: Number(d.retail_price ?? 0),
      sock_card_id: d.default_sock_card_id ?? null,
      pack_pairs: card?.pack_pairs ?? 1,
      sock_size: card?.size ?? null,
      construction: d.construction ?? card?.style ?? "Crew",
      pantone: d.pantone ?? null,
      barcode_required: Boolean(d.barcode_required),
      art_status: d.art_status ?? "NEEDED",
      art_note: null,
      mockup_file_ref: d.mockup_file_ref ?? null,
      artwork_file_ref: d.art_file_ref ?? null,
      rib_lr: d.rib_lr ?? true,
      toe: d.toe ?? true,
      pattern: d.pattern ?? false,
      signature: d.signature ?? false,
      foot_text: d.foot_text ?? null,
      spec_snapshot: d as Record<string, unknown>,
    });
  }

  const artClass = line.art_status === "ON FILE" ? "mfr-art-on" : line.art_status === "NEEDED" ? "mfr-art-need" : "mfr-art-na";

  return (
    <tr className={line.art_status === "NEEDED" ? "mfr-row-flagged" : ""}>
      <td className="mfr-col-num">{index + 1}</td>

      {/* Design search */}
      <td style={{ minWidth: 200 }}>
        <DesignSearchPicker
          selectedLabel={catalogOptions.find((o) => o.id === line.design_id)?.label ?? (line.product_name ?? "")}
          catalogOptions={catalogOptions}
          onSetDesign={setDesign}
          onOpenNewDesign={onOpenNewDesign}
        />
        <input
          value={String(line.product_name ?? "")}
          placeholder="SKU name override"
          onChange={(e) => set({ product_name: e.target.value, description: e.target.value })}
          style={{ width: "100%", marginTop: 3, fontSize: 11 }}
        />
      </td>

      {/* Colorway + hex swatch */}
      <td style={{ minWidth: 110 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {line.hex ? (
            <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: line.hex, border: "1px solid #ccc", flexShrink: 0 }} />
          ) : null}
          <input
            value={String(line.colorway ?? line.variant_label ?? "")}
            placeholder="Colorway"
            onChange={(e) => set({ colorway: e.target.value, variant_label: e.target.value })}
            style={{ width: "100%" }}
          />
        </div>
      </td>

      {/* Sock card */}
      <td style={{ minWidth: 150 }}>
        <select value={line.sock_card_id ?? ""} onChange={(e) => setCard(e.target.value)} style={{ width: "100%" }}>
          <option value="">— card —</option>
          {sockCards.map((card) => (
            <option key={card.id} value={card.id}>{card.name}</option>
          ))}
        </select>
      </td>

      {/* Pack */}
      <td style={{ width: 52, textAlign: "center" }}>
        <input className="mfr-mono" type="number" value={line.pack_pairs ?? 1} onChange={(e) => set({ pack_pairs: Number(e.target.value) })} style={{ width: 50 }} />
      </td>

      {/* Size */}
      <td style={{ minWidth: 100 }}>
        <input value={String(line.sock_size ?? "")} placeholder="Size" onChange={(e) => set({ sock_size: e.target.value })} style={{ width: "100%" }} />
      </td>

      {/* Construction */}
      <td style={{ minWidth: 96 }}>
        <select value={line.construction ?? "Crew"} onChange={(e) => set({ construction: e.target.value })} style={{ width: "100%" }}>
          {CONSTRUCTION_OPTIONS.map((c) => <option key={c}>{c}</option>)}
        </select>
      </td>

      {/* Pairs */}
      <td style={{ width: 68 }}>
        <input className="mfr-mono" type="number" min={0} value={line.quantity_ordered ?? 0} onChange={(e) => set({ quantity_ordered: Number(e.target.value) })} style={{ width: 66 }} />
      </td>

      {/* Cards (computed) */}
      <td className="mfr-cards-cell" style={{ width: 58, textAlign: "center" }}>
        <input className="mfr-mono" value={cards} readOnly style={{ width: 54, textAlign: "center" }} />
      </td>

      {/* EXW */}
      <td style={{ width: 68 }}>
        <input className="mfr-mono" type="number" min={0} step={0.01} value={exw} onChange={(e) => set({ unit_cost: Number(e.target.value) })} style={{ width: 66 }} />
      </td>

      {/* Cost */}
      <td style={{ width: 80, textAlign: "right" }}>
        <span className="mfr-mono" style={{ fontSize: 12 }}>${cost.toFixed(2)}</span>
      </td>

      {/* Pantone */}
      <td style={{ minWidth: 96 }}>
        <input value={String(line.pantone ?? "")} placeholder="Pantone" onChange={(e) => set({ pantone: e.target.value })} style={{ width: "100%" }} />
      </td>

      {/* Barcode / UPC */}
      <td style={{ minWidth: 130 }}>
        <input
          className="mfr-mono"
          value={String(line.upc ?? "")}
          placeholder={line.barcode_required ? "UPC required" : "UPC"}
          onChange={(e) => set({ upc: e.target.value })}
          style={{ width: "100%", borderColor: line.barcode_required && !String(line.upc ?? "").trim() ? "var(--brand-primary)" : undefined }}
        />
        <div style={{ marginTop: 2 }}>
          <label style={{ fontSize: 10, color: "var(--brand-muted)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            <input type="checkbox" checked={Boolean(line.barcode_required)} onChange={(e) => set({ barcode_required: e.target.checked })} style={{ width: "auto" }} />
            Required
          </label>
        </div>
      </td>

      {/* Art status */}
      <td style={{ minWidth: 96 }}>
        <select className={artClass} value={line.art_status ?? "NEEDED"} onChange={(e) => set({ art_status: e.target.value })} style={{ width: "100%" }}>
          {ART_STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <input value={String(line.art_note ?? "")} placeholder="note" onChange={(e) => set({ art_note: e.target.value })} style={{ width: "100%", fontSize: 10, marginTop: 3 }} />
      </td>

      {/* Foot text */}
      <td style={{ minWidth: 130 }}>
        <input value={String(line.foot_text ?? "")} placeholder="Foot text (optional)" onChange={(e) => set({ foot_text: e.target.value })} style={{ width: "100%" }} />
      </td>

      {/* Spec flags */}
      <td style={{ whiteSpace: "nowrap" }}>
        <Flag active={Boolean(line.rib_lr)} label="R" title="SickFit on rib L/R" onClick={() => set({ rib_lr: !line.rib_lr })} />
        <Flag active={Boolean(line.toe)} label="T" title="SickFit on toe" onClick={() => set({ toe: !line.toe })} />
        <Flag active={Boolean(line.pattern)} label="P" title="Pattern" onClick={() => set({ pattern: !line.pattern })} />
        <Flag active={Boolean(line.signature)} label="S" title="Signature" onClick={() => set({ signature: !line.signature })} />
      </td>

      {/* Box */}
      <td style={{ width: 46 }}>
        <input value={String(line.box_no ?? "1")} onChange={(e) => set({ box_no: e.target.value })} style={{ width: 44 }} />
      </td>

      {/* Mockup */}
      <td style={{ width: 62, textAlign: "center" }}>
        <FileUploadCell
          value={line.mockup_file_ref}
          folder="mockups"
          accept="image/*"
          label="Mock"
          onChange={(url) => set({ mockup_file_ref: url })}
        />
      </td>

      {/* Artwork */}
      <td style={{ width: 62, textAlign: "center" }}>
        <FileUploadCell
          value={line.artwork_file_ref}
          folder="artwork"
          accept="image/*,application/pdf,.ai,.eps,.svg"
          label="Art"
          onChange={(url) => set({ artwork_file_ref: url })}
        />
      </td>

      {/* Remove */}
      <td>
        <button type="button" className="btn btn-ghost btn-small mfr-del-btn" onClick={() => onRemove(index)} title="Remove">×</button>
      </td>
    </tr>
  );
}
