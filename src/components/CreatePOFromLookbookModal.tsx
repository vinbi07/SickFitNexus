import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "@/components/Modal";
import { StatusBadge } from "@/components/StatusBadge";
import { LoadingState } from "@/components/LoadingState";
import { useAsyncData } from "@/hooks/useAsyncData";
import { dashboardService } from "@/services/dashboardService";
import { lookbookService } from "@/services/lookbookService";
import type { Buyer, Product } from "@/types/domain";
import { formatCurrency } from "@/utils/format";
import {
  getDisplaySku,
  getLookbookWholesalePrice,
  getOrderUnitLabel,
  getProductFamilyName,
  getProductVariantLabel,
  resolveCasePackQuantity,
  sortProductsByFamily,
} from "@/utils/lookbook";

export function CreatePOFromLookbookModal({
  buyer,
  products,
  onClose,
}: {
  buyer: Buyer;
  products: Product[];
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [confirmedAnother, setConfirmedAnother] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, loading } = useAsyncData(
    async () => ({
      existingOrder: await lookbookService.getExistingLookbookOrder(buyer.id),
      snapshot: await dashboardService.getSnapshot(),
    }),
    [buyer.id],
  );

  const inventoryBySku = useMemo(() => {
    const map = new Map<string, { currentQuantity: number; incomingQuantity: number; riskStatus: string }>();
    data?.snapshot.inventoryAlerts.forEach((alert) => {
      map.set(alert.sku, {
        currentQuantity: alert.currentQuantity,
        incomingQuantity: alert.incomingQuantity,
        riskStatus: alert.riskStatus,
      });
    });
    return map;
  }, [data]);

  const sortedProducts = useMemo(() => sortProductsByFamily(products), [products]);
  const selectedLines = sortedProducts
    .map((product) => ({ product, caseQuantity: Number(quantities[product.id] ?? 0) }))
    .filter((line) => line.caseQuantity > 0);
  const totalUnits = selectedLines.reduce(
    (sum, line) => sum + line.caseQuantity * resolveCasePackQuantity(line.product),
    0,
  );
  const totalCost = selectedLines.reduce(
    (sum, line) =>
      sum + line.caseQuantity * resolveCasePackQuantity(line.product) * getLookbookWholesalePrice(line.product),
    0,
  );

  const showExistingWarning = Boolean(data?.existingOrder) && !confirmedAnother;

  async function handleCreate() {
    try {
      setBusy(true);
      setError(null);
      const po = await lookbookService.createDraftPurchaseOrderFromLookbook(buyer, selectedLines);
      navigate(`/purchase-orders/${po.id}`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create a PO from this lookbook.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Create PO from Lookbook?"
      onClose={onClose}
      actions={
        showExistingWarning ? (
          <>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-secondary" onClick={() => setConfirmedAnother(true)}>Create Another</button>
          </>
        ) : (
          <>
            <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button
              className="btn btn-primary"
              disabled={busy || loading || !selectedLines.length}
              title={!selectedLines.length ? "Add products before creating a PO." : undefined}
              onClick={() => void handleCreate()}
            >
              {busy ? "Creating..." : "Create Draft PO"}
            </button>
          </>
        )
      }
    >
      {loading ? (
        <LoadingState />
      ) : showExistingWarning && data?.existingOrder ? (
        <div className="section-stack">
          <p className="modal-message">
            This lookbook already has a generated order: <strong>{data.existingOrder.po_number}</strong> ({data.existingOrder.status}).
          </p>
          <p className="helper-text">Creating another will start a new, separate draft PO for this account.</p>
        </div>
      ) : (
        <div className="section-stack">
          <p className="modal-message">
            This will create a Draft Retailer PO using the selected products in this lookbook.
          </p>
          <div className="detail-grid">
            <div className="detail-card"><span>Account</span><strong>{buyer.retailers?.name ?? buyer.company_name}</strong></div>
            <div className="detail-card"><span>Products Selected</span><strong>{selectedLines.length}</strong></div>
            <div className="detail-card"><span>Total Units</span><strong>{totalUnits}</strong></div>
            <div className="detail-card"><span>Estimated Total</span><strong>{formatCurrency(totalCost)}</strong></div>
          </div>
          {error ? <p className="helper-text danger-text">{error}</p> : null}
          {!sortedProducts.length ? (
            <div className="empty-state">No products assigned to this lookbook yet.</div>
          ) : (
            <div className="timeline lookbook-scroll-area">
              {sortedProducts.map((product) => {
                const caseQty = Number(quantities[product.id] ?? 0);
                const inventory = inventoryBySku.get(product.sku);
                return (
                  <div key={product.id} className="detail-card">
                    <div className="panel-header">
                      <div>
                        <strong>{getProductFamilyName(product)}</strong>
                        <p className="helper-text">{getProductVariantLabel(product)} | {getDisplaySku(product)}</p>
                      </div>
                      <div className="lookbook-stepper">
                        <button
                          className="btn btn-secondary btn-small"
                          onClick={() => setQuantities((current) => ({ ...current, [product.id]: Math.max(caseQty - 1, 0) }))}
                        >
                          −1 Case
                        </button>
                        <input
                          type="number"
                          className="lookbook-qty-input"
                          min={0}
                          value={caseQty}
                          onChange={(event) =>
                            setQuantities((current) => ({
                              ...current,
                              [product.id]: Math.max(0, Math.floor(Number(event.target.value) || 0)),
                            }))
                          }
                        />
                        <button
                          className="btn btn-primary btn-small"
                          onClick={() => setQuantities((current) => ({ ...current, [product.id]: caseQty + 1 }))}
                        >
                          +1 Case
                        </button>
                      </div>
                    </div>
                    <p className="helper-text">
                      Quantity in Lookbook: {caseQty * resolveCasePackQuantity(product)} {getOrderUnitLabel(product)}
                    </p>
                    {inventory ? (
                      <p className="helper-text">
                        Current Stock: {inventory.currentQuantity} · Incoming: {inventory.incomingQuantity} ·{" "}
                        <StatusBadge label={inventory.riskStatus} />
                      </p>
                    ) : (
                      <p className="helper-text">
                        Current Stock: {product.current_inventory} · <StatusBadge label="Safe" />
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
