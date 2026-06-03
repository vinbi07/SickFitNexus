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
  "Pairs", "Cards", "EXW", "Cost", "Pantone", "Barcode / UPC", "Art", "Foot Text", "Specs", "Box", "",
];

export function ManufacturerOrderGrid({
  lines,
  sockCards,
  catalogOptions,
  onUpdate,
  onRemove,
  onAddBlank,
  onOpenNewDesign,
}: Props) {
  const totalPairs = lines.reduce((sum, l) => sum + Number(l.quantity_ordered ?? 0), 0);
  const totalCost = lines.reduce((sum, l) => sum + Number(l.quantity_ordered ?? 0) * Number(l.unit_cost ?? 1.89), 0);

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="lookbook-kicker">Production Order</p>
          <h3>Manufacturer Order Lines</h3>
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn-ghost btn-small" onClick={onOpenNewDesign}>
            + New Design
          </button>
          <button type="button" className="btn btn-secondary btn-small" onClick={onAddBlank}>
            + Blank Line
          </button>
        </div>
      </div>

      <div className="mfr-grid-scroll">
        <table className="mfr-grid-table">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th key={col}>{col}</th>
              ))}
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
                <td colSpan={COLUMNS.length} style={{ textAlign: "center", padding: "24px 0", color: "var(--color-muted, #888)" }}>
                  No lines yet — pick a design above or add a blank line.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="po-totals-bar">
        <div className="detail-card"><span>SKUs</span><strong>{lines.length}</strong></div>
        <div className="detail-card"><span>Total Pairs</span><strong>{totalPairs}</strong></div>
        <div className="detail-card"><span>Goods (EXW)</span><strong>${totalCost.toFixed(2)}</strong></div>
      </div>
    </div>
  );
}
