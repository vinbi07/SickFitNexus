import type { SockCard } from "@/types/domain";
import type { CatalogDesignOption } from "@/services/orderDesignService";
import { ManufacturerOrderLineRow, type ManufacturerBuilderLine } from "./ManufacturerOrderLineRow";

type Props = {
  lines: ManufacturerBuilderLine[];
  sockCards: SockCard[];
  catalogOptions: CatalogDesignOption[];
  onUpdate: (index: number, patch: Partial<ManufacturerBuilderLine>) => void;
  onRemove: (index: number) => void;
  onAddBlank: () => void;
  onOpenNewDesign: () => void;
};

const COLUMNS = [
  "#", "Design / SKU", "Colorway", "Sock Card", "Pack", "Size", "Constr.",
  "Pairs", "Cards", "EXW", "Cost", "Pantone", "Barcode / UPC", "Art", "Foot Text", "Specs", "Box",
  "Mockup", "Artwork", "",
];

export function ManufacturerOrderGrid({ lines, sockCards, catalogOptions, onUpdate, onRemove, onAddBlank, onOpenNewDesign }: Props) {
  return (
    <div>
      <div className="mfr-grid-toolbar">
        <span style={{ fontSize: 11, color: "var(--brand-muted)", letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 600 }}>
          Order Lines
        </span>
        <div className="mfr-grid-toolbar-spacer" />
        <button type="button" className="btn btn-ghost btn-small" onClick={onOpenNewDesign}>+ New Design</button>
        <button type="button" className="btn btn-ghost btn-small" onClick={onAddBlank}>+ Blank Line</button>
      </div>

      <div className="mfr-gridwrap" style={{ borderRadius: "0 0 var(--brand-radius) var(--brand-radius)", borderTop: "none" }}>
        <table className="mfr-grid-table">
          <thead>
            <tr>
              {COLUMNS.map((col) => <th key={col}>{col}</th>)}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <ManufacturerOrderLineRow
                key={line.id ?? line.tempId}
                line={line}
                index={index}
                sockCards={sockCards}
                catalogOptions={catalogOptions}
                onUpdate={onUpdate}
                onRemove={onRemove}
                onOpenNewDesign={onOpenNewDesign}
              />
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} style={{ textAlign: "center", padding: "32px 0", color: "var(--brand-muted)", fontSize: 13 }}>
                  No lines yet — search a design above or add a blank line.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
