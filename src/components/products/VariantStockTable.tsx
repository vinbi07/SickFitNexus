import { Fragment, useState } from "react";
import { ChevronRight, Pencil } from "lucide-react";
import type { InventoryEvent, Product } from "@/types/domain";
import { BarcodeFix, type BarcodeFixItem } from "@/components/products/BarcodeFixPanel";
import { VariantEditForm } from "@/components/products/VariantEditForm";
import type { BarcodeAssessment } from "@/utils/barcode";
import { formatCurrency, formatDateOnly, formatNumber } from "@/utils/format";
import { getProductVariantLabel } from "@/utils/lookbook";

export interface VariantRow {
  product: Product;
  onHand: number;
  available: number;
  committed: number;
  incoming: number;
  sold: number;
  /** Null when the variant isn't selling. */
  daysLeft: number | null;
  /** Only problems; healthy stock stays quiet. */
  status: { label: string; tone: "danger" | "warning" | "neutral" } | null;
  barcode: BarcodeAssessment;
  locations: Array<{ name: string; onHand: number; available: number }>;
  recentSales: InventoryEvent[];
}

/** Groups a UPC like Shopify prints it: 0 12345 67890 5. */
function formatUpc(code: string) {
  const digits = code.replace(/\s/g, "");
  if (digits.length === 12) return `${digits[0]} ${digits.slice(1, 6)} ${digits.slice(6, 11)} ${digits[11]}`;
  if (digits.length === 13) return `${digits[0]} ${digits.slice(1, 7)} ${digits.slice(7)}`;
  return digits;
}

function formatMoney(value: number) {
  return Number.isInteger(value) ? formatCurrency(value) : `$${value.toFixed(2)}`;
}

function Upc({
  product,
  barcode,
  fixOpen,
  onToggleFix,
}: {
  product: Product;
  barcode: BarcodeAssessment;
  fixOpen: boolean;
  /** Present when this problem has fix steps to show. */
  onToggleFix?: () => void;
}) {
  const tag =
    barcode.isProblem && onToggleFix ? (
      <button
        type="button"
        className={`status-badge status-danger pd-fix-tag${fixOpen ? " is-open" : ""}`}
        aria-expanded={fixOpen}
        aria-controls={`fix-${product.id}`}
        title={fixOpen ? "Hide fix steps" : `${barcode.detail} Press to see how to fix it.`}
        onClick={(event) => {
          event.stopPropagation();
          onToggleFix();
        }}
      >
        {barcode.label}
      </button>
    ) : null;
  if (!product.upc) {
    return <span className="pd-upc is-missing">{tag ?? (barcode.status === "mismatch" ? barcode.label : "No UPC")}</span>;
  }
  return (
    <span className="pd-upc">
      <span className="pd-upc-code">UPC {formatUpc(product.upc)}</span>
      {barcode.isProblem ? (
        tag ?? (
          <span className="status-badge status-danger" title={barcode.detail}>
            {barcode.label}
          </span>
        )
      ) : barcode.status === "verified" ? (
        <span className="pd-upc-ok" title={barcode.detail}>
          {barcode.label}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Every variant of the product on one table: stock, sales pace and UPC.
 * A row opens in place to show stock by location and its latest sales,
 * and can switch to an inline form to edit that variant.
 */
export function VariantStockTable({
  rows,
  soldLabel,
  showPrice,
  focusId,
  fixOf,
  recheckingId,
  onRecheck,
  onSaveVariant,
}: {
  rows: VariantRow[];
  soldLabel: string;
  showPrice: boolean;
  focusId: string | null;
  fixOf: (productId: string) => BarcodeFixItem | undefined;
  recheckingId: string | null;
  onRecheck: (product: Product) => void;
  /** Saves edits to one variant; omit to hide editing. */
  onSaveVariant?: (product: Product, patch: Partial<Product>) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fixOpen, setFixOpen] = useState<Set<string>>(new Set());
  const toggleFix = (id: string) =>
    setFixOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [open, setOpen] = useState<Set<string>>(() => new Set(focusId && rows.length > 1 ? [focusId] : []));
  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const columns = showPrice ? 8 : 7;

  return (
    <div className="pd-variants">
      <table className="pd-variant-table">
        <thead>
          <tr>
            <th>Variant</th>
            {showPrice ? <th className="pd-num">Price</th> : null}
            <th className="pd-num">On hand</th>
            <th className="pd-num">Available</th>
            <th className="pd-num pd-col-optional">Incoming</th>
            <th className="pd-num">{soldLabel}</th>
            <th className="pd-num">Days left</th>
            <th>
              <span className="visually-hidden">Status</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isOpen = open.has(row.product.id);
            const label = getProductVariantLabel(row.product);
            const fix = fixOf(row.product.id);
            const showFix = Boolean(fix) && fixOpen.has(row.product.id);
            return (
              <Fragment key={row.product.id}>
                <tr
                  className={`pd-variant-row${isOpen ? " is-open" : ""}${row.product.id === focusId ? " is-focus" : ""}`}
                  onClick={() => toggle(row.product.id)}
                >
                  <td>
                    <div className="pd-variant-cell">
                      <button
                        type="button"
                        className="pf-chevron"
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? "Hide" : "Show"} details for ${label}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggle(row.product.id);
                        }}
                      >
                        <ChevronRight size={16} aria-hidden="true" />
                      </button>
                      <div className="pd-variant-name">
                        <strong>{label}</strong>
                        <span>
                          {row.product.sku}
                          <Upc
                            product={row.product}
                            barcode={row.barcode}
                            fixOpen={showFix}
                            onToggleFix={fix ? () => toggleFix(row.product.id) : undefined}
                          />
                        </span>
                      </div>
                    </div>
                  </td>
                  {showPrice ? (
                    <td className="pd-num">
                      {Number(row.product.unit_price ?? 0) > 0 ? formatMoney(Number(row.product.unit_price)) : <span className="pf-muted">—</span>}
                    </td>
                  ) : null}
                  <td className="pd-num">{formatNumber(row.onHand)}</td>
                  <td className={`pd-num${row.available <= 0 ? " is-out" : ""}`}>{formatNumber(row.available)}</td>
                  <td className="pd-num pd-col-optional">{row.incoming ? formatNumber(row.incoming) : <span className="pf-muted">—</span>}</td>
                  <td className="pd-num">{formatNumber(row.sold)}</td>
                  <td className="pd-num">{row.daysLeft == null ? <span className="pf-muted">—</span> : formatNumber(row.daysLeft)}</td>
                  <td>{row.status ? <span className={`pd-pill is-${row.status.tone}`}>{row.status.label}</span> : null}</td>
                </tr>
                {fix && showFix ? (
                  <tr className="pd-fix-row">
                    <td colSpan={columns}>
                      <BarcodeFix
                        item={fix}
                        rechecking={recheckingId === row.product.id}
                        disabled={recheckingId !== null}
                        onRecheck={() => onRecheck(row.product)}
                        onClose={() => toggleFix(row.product.id)}
                      />
                    </td>
                  </tr>
                ) : null}
                {isOpen && editingId === row.product.id && onSaveVariant ? (
                  <tr className="pd-variant-detail">
                    <td colSpan={columns}>
                      <h4>Edit {label}</h4>
                      <VariantEditForm
                        product={row.product}
                        onCancel={() => setEditingId(null)}
                        onSave={async (patch) => {
                          await onSaveVariant(row.product, patch);
                          setEditingId(null);
                        }}
                      />
                    </td>
                  </tr>
                ) : isOpen ? (
                  <tr className="pd-variant-detail">
                    <td colSpan={columns}>
                      {onSaveVariant ? (
                        <div className="pd-variant-detail-actions">
                          <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditingId(row.product.id)}>
                            <Pencil size={14} aria-hidden="true" />
                            Edit variant
                          </button>
                        </div>
                      ) : null}
                      <div className="pd-variant-detail-grid">
                        <div>
                          <h4>Stock by location</h4>
                          {row.locations.length ? (
                            <ul className="pd-plain-list">
                              {row.locations.map((location) => (
                                <li key={location.name}>
                                  <span>{location.name}</span>
                                  <span>
                                    {formatNumber(location.onHand)} on hand · {formatNumber(location.available)} available
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="pd-quiet">No location stock synced yet.</p>
                          )}
                          {row.committed ? <p className="pd-quiet">{formatNumber(row.committed)} committed to open orders.</p> : null}
                        </div>
                        <div>
                          <h4>Latest sales</h4>
                          {row.recentSales.length ? (
                            <ul className="pd-plain-list">
                              {row.recentSales.map((event) => (
                                <li key={event.id}>
                                  <span>{formatDateOnly(event.event_date)}</span>
                                  <span>{formatNumber(Math.abs(event.quantity_change))} sold</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="pd-quiet">No Shopify sales recorded.</p>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
