import { ProductSearchAddField } from "@/components/documents/ProductSearchAddField";
import type { ProductBarcode } from "@/types/domain";
import { formatCurrency } from "@/utils/format";
import type { PoWizardAction, PoWizardState } from "@/state/purchaseOrderWizardReducer";

export function isPoStepLineItemsValid(state: PoWizardState): boolean {
  const named = state.lineItems.filter((item) => String(item.product_name ?? "").trim());
  if (!named.length) return false;
  return named.every((item) => Number(item.quantity_ordered ?? 0) > 0);
}

export function PoStepLineItems({
  state,
  dispatch,
  barcodes,
}: {
  state: PoWizardState;
  dispatch: (action: PoWizardAction) => void;
  barcodes: ProductBarcode[];
}) {
  const lines = state.lineItems;
  const totalCost = lines.reduce((sum, item) => sum + Number(item.extended_cost ?? 0), 0);
  const totalRetail = lines.reduce((sum, item) => sum + Number(item.extended_retail ?? 0), 0);

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="lookbook-kicker">Line Items</p>
          <h3>Products On This Order</h3>
        </div>
      </div>

      <ProductSearchAddField
        barcodes={barcodes}
        onAdd={(barcode) => dispatch({ type: "ADD_LINES_FROM_BARCODES", barcodes: [barcode] })}
      />

      <div className="wizard-line-grid-scroll">
        <div className="wizard-line-grid">
          <div className="wizard-line-grid-head">
            <span>Line</span>
            <span>SKU</span>
            <span>Description</span>
            <span>Qty</span>
            <span>Unit Cost</span>
            <span>Ext Cost</span>
            <span>Actions</span>
          </div>
          {lines.map((item, index) => (
            <div key={item.id ?? item.tempId} className="wizard-line-grid-row">
              <span>{index + 1}</span>
              <input
                value={String(item.sku ?? "")}
                onChange={(event) => dispatch({ type: "UPDATE_LINE", index, patch: { sku: event.target.value } })}
              />
              <input
                value={String(item.description ?? item.product_name ?? "")}
                onChange={(event) =>
                  dispatch({
                    type: "UPDATE_LINE",
                    index,
                    patch: { description: event.target.value, product_name: event.target.value },
                  })
                }
              />
              <input
                type="number"
                min="0"
                value={String(item.quantity_ordered ?? 0)}
                onChange={(event) =>
                  dispatch({ type: "UPDATE_LINE", index, patch: { quantity_ordered: Number(event.target.value) } })
                }
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={String(item.unit_cost ?? 0)}
                onChange={(event) =>
                  dispatch({ type: "UPDATE_LINE", index, patch: { unit_cost: Number(event.target.value) } })
                }
              />
              <span>{formatCurrency(Number(item.extended_cost ?? 0))}</span>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => dispatch({ type: "REMOVE_LINE", index })}>
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="wizard-review-row">
        <strong>Total Cost</strong>
        <strong>{formatCurrency(totalCost)}</strong>
      </div>
      <div className="wizard-review-row">
        <span className="helper-text">Total Suggested Retail</span>
        <span>{formatCurrency(totalRetail)}</span>
      </div>
    </div>
  );
}
