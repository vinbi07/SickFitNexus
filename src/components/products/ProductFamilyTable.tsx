import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { PageHeaderAction } from "@/components/PageHeader";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import type { Product } from "@/types/domain";
import type { BarcodeAssessment } from "@/utils/barcode";
import { formatCurrency, formatNumber } from "@/utils/format";
import { getProductVariantLabel } from "@/utils/lookbook";
import type { ProductFamily } from "@/utils/productFamilies";
import { isRetiredFromShopify } from "@/utils/operations";

function plural(count: number, word: string) {
  return `${formatNumber(count)} ${word}${count === 1 ? "" : "s"}`;
}

function Thumb({ product, name }: { product: Product; name: string }) {
  return product.image_url ? (
    <img className="pf-thumb" src={product.image_url} alt="" loading="lazy" />
  ) : (
    <span className="pf-thumb pf-thumb-empty" aria-hidden="true">
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function Checkbox({
  checked,
  indeterminate = false,
  label,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      className="pf-check"
      aria-label={label}
      checked={checked}
      ref={(element) => {
        if (element) element.indeterminate = indeterminate;
      }}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}

function ActionsMenu({ actions }: { actions: PageHeaderAction[] }) {
  return (
    <div className="pf-actions" onClick={(event) => event.stopPropagation()}>
      <RowActionsMenu>
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className={`btn btn-ghost${action.danger ? " menu-item-danger" : ""}`}
            disabled={action.disabled}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        ))}
      </RowActionsMenu>
    </div>
  );
}

function StockText({ family }: { family: ProductFamily }) {
  const variants = family.variants.length > 1 ? ` · ${plural(family.variants.length, "variant")}` : "";
  if (family.stockState === "Out of stock") {
    return <span className="pf-stock is-out">Out of stock{variants}</span>;
  }
  const tone = family.stockState === "Danger" || family.stockState === "Low" ? " is-low" : "";
  const flag =
    family.stockState === "Danger" || family.stockState === "Low"
      ? "Low stock"
      : family.stockState === "Slow Mover"
        ? "Slow mover"
        : null;
  return (
    <span className={`pf-stock${tone}`}>
      {formatNumber(family.totalStock)} in stock{variants}
      {flag ? <em>{flag}</em> : null}
      {family.outOfStockCount > 0 && family.variants.length > 1 ? (
        <em className="is-out">{plural(family.outOfStockCount, "variant")} out</em>
      ) : null}
    </span>
  );
}

function PriceText({ family }: { family: ProductFamily }) {
  if (!family.maxPrice) return <span className="pf-muted">—</span>;
  const price =
    family.minPrice === family.maxPrice
      ? formatMoney(family.minPrice)
      : `${formatMoney(family.minPrice)} – ${formatMoney(family.maxPrice)}`;
  return (
    <span className="pf-price">
      {price}
      {family.marginPercent != null ? <em>{family.marginPercent}% margin</em> : null}
    </span>
  );
}

function formatMoney(value: number) {
  return Number.isInteger(value) ? formatCurrency(value) : `$${value.toFixed(2)}`;
}

/**
 * Shopify-style product list: one row per product, variants folded in and
 * expandable, a header that turns into bulk actions when rows are selected.
 */
export function ProductFamilyTable({
  families,
  selectedIds,
  onSelectionChange,
  bulkActions,
  barcodeOf,
  categoryOf,
  actionsFor,
  onOpen,
  emptyMessage,
}: {
  families: ProductFamily[];
  selectedIds: Set<string>;
  onSelectionChange: (next: Set<string>) => void;
  bulkActions: ReactNode;
  barcodeOf: (product: Product) => BarcodeAssessment | undefined;
  categoryOf: (family: ProductFamily) => string;
  actionsFor: (products: Product[], family: ProductFamily) => PageHeaderAction[];
  onOpen: (product: Product) => void;
  emptyMessage: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (!families.length) return <div className="empty-state">{emptyMessage}</div>;

  const allIds = families.flatMap((family) => family.variants.map((variant) => variant.id));
  const selectedCount = allIds.filter((id) => selectedIds.has(id)).length;
  const setIds = (ids: string[], checked: boolean) => {
    const next = new Set(selectedIds);
    ids.forEach((id) => (checked ? next.add(id) : next.delete(id)));
    onSelectionChange(next);
  };
  const toggleExpanded = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const headerCheckbox = (
    <Checkbox
      label="Select all products"
      checked={selectedCount > 0 && selectedCount === allIds.length}
      indeterminate={selectedCount > 0 && selectedCount < allIds.length}
      onChange={(checked) => setIds(allIds, checked)}
    />
  );

  return (
    <div className="pf-shell">
      <table className="pf-table">
        <thead>
          {selectedCount > 0 ? (
            <tr className="pf-bulk">
              <th className="pf-col-check">{headerCheckbox}</th>
              <th colSpan={6}>
                <div className="pf-bulk-bar">
                  <strong>{formatNumber(selectedCount)} selected</strong>
                  {bulkActions}
                </div>
              </th>
            </tr>
          ) : (
            <tr>
              <th className="pf-col-check">{headerCheckbox}</th>
              <th>Product</th>
              <th>Inventory</th>
              <th>Price</th>
              <th className="pf-col-vendor">Vendor</th>
              <th className="pf-col-category">Category</th>
              <th className="pf-col-actions">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          )}
        </thead>
        <tbody>
          {families.map((family) => {
            const ids = family.variants.map((variant) => variant.id);
            const picked = ids.filter((id) => selectedIds.has(id)).length;
            const isFamily = family.variants.length > 1;
            const isOpen = expanded.has(family.key);
            const target = isFamily ? family.root : family.variants[0];
            const subline = isFamily ? plural(family.variants.length, "variant") : getProductVariantLabel(family.variants[0]);
            return [
              <tr
                key={family.key}
                className={`pf-row${picked ? " is-selected" : ""}${isOpen ? " is-open" : ""}`}
                onClick={() => onOpen(target)}
              >
                <td className="pf-col-check">
                  <Checkbox
                    label={`Select ${family.name}`}
                    checked={picked > 0 && picked === ids.length}
                    indeterminate={picked > 0 && picked < ids.length}
                    onChange={(checked) => setIds(ids, checked)}
                  />
                </td>
                <td>
                  <div className="pf-product">
                    {isFamily ? (
                      <button
                        type="button"
                        className="pf-chevron"
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? "Hide" : "Show"} variants for ${family.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleExpanded(family.key);
                        }}
                      >
                        <ChevronRight size={16} aria-hidden="true" />
                      </button>
                    ) : (
                      <span className="pf-chevron-space" aria-hidden="true" />
                    )}
                    <Thumb product={family.root} name={family.name} />
                    <div className="pf-name">
                      <Link to={`/products/${target.id}`} onClick={(event) => event.stopPropagation()}>
                        {family.name}
                      </Link>
                      <span>
                        {subline}
                        {family.variants.every(isRetiredFromShopify) ? (
                          <span className="pf-retired">
                            {family.variants.some((variant) => variant.shopify_removed_at) ? "Removed from Shopify" : "Archived in Shopify"}
                          </span>
                        ) : null}
                        {family.barcodeProblemCount > 0 ? (
                          <span
                            className="pf-flag"
                            title={`${plural(family.barcodeProblemCount, "variant")} need${family.barcodeProblemCount === 1 ? "s" : ""} a barcode fix`}
                          >
                            Barcode fix
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </div>
                </td>
                <td>
                  <StockText family={family} />
                </td>
                <td>
                  <PriceText family={family} />
                </td>
                <td className="pf-col-vendor">{family.root.vendors?.name ?? <span className="pf-muted">—</span>}</td>
                <td className="pf-col-category">{categoryOf(family) || <span className="pf-muted">—</span>}</td>
                <td className="pf-col-actions">
                  <ActionsMenu actions={actionsFor(family.variants, family)} />
                </td>
              </tr>,
              ...(isOpen
                ? family.variants.map((variant) => {
                    const barcode = barcodeOf(variant);
                    const stock = Number(variant.current_inventory ?? 0);
                    return (
                      <tr
                        key={variant.id}
                        className={`pf-variant${selectedIds.has(variant.id) ? " is-selected" : ""}`}
                        onClick={() => onOpen(variant)}
                      >
                        <td className="pf-col-check">
                          <Checkbox
                            label={`Select ${variant.sku}`}
                            checked={selectedIds.has(variant.id)}
                            onChange={(checked) => setIds([variant.id], checked)}
                          />
                        </td>
                        <td>
                          <div className="pf-variant-name">
                            <strong>{getProductVariantLabel(variant)}</strong>
                            <span>{variant.sku}</span>
                            {barcode?.isProblem ? (
                              <span className="status-badge status-danger" title={barcode.detail}>
                                {barcode.label}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <span className={`pf-stock${stock <= 0 ? " is-out" : ""}`}>
                            {stock <= 0 ? "Out of stock" : `${formatNumber(stock)} in stock`}
                          </span>
                        </td>
                        <td>
                          {Number(variant.unit_price ?? 0) > 0 ? (
                            formatMoney(Number(variant.unit_price))
                          ) : (
                            <span className="pf-muted">—</span>
                          )}
                        </td>
                        <td className="pf-col-vendor" />
                        <td className="pf-col-category" />
                        <td className="pf-col-actions">
                          <ActionsMenu actions={actionsFor([variant], family)} />
                        </td>
                      </tr>
                    );
                  })
                : []),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
