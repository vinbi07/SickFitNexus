import { useState } from "react";
import { Modal } from "@/components/Modal";
import { ProductNameWithMetadata } from "@/components/ProductNameWithMetadata";
import { isShopifyLinked } from "@/services/inventoryService";
import type { Location, PoLineItem, PurchaseOrder } from "@/types/domain";

type ReceiveInventoryModalProps = {
  purchaseOrder: PurchaseOrder;
  lineItems: PoLineItem[];
  locations: Location[];
  onClose: () => void;
  onConfirm: (lines: Array<{ lineItemId: string; productId: string; locationId: string; quantityToReceive: number }>) => Promise<void>;
};

export function ReceiveInventoryModal({ purchaseOrder, lineItems, locations, onClose, onConfirm }: ReceiveInventoryModalProps) {
  const receivableLines = lineItems.filter(
    (item) => Number(item.quantity_ordered ?? 0) - Number(item.quantity_received ?? 0) > 0 && item.product_id,
  );
  const shopifyLines = receivableLines.filter((item) => item.products && isShopifyLinked(item.products));
  const [locationId, setLocationId] = useState(purchaseOrder.location_id ?? "");
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(
      receivableLines.map((item) => [
        item.id,
        Number(item.quantity_ordered ?? 0) - Number(item.quantity_received ?? 0),
      ]),
    ),
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  return (
    <Modal
      title="Receive Inventory?"
      onClose={onClose}
      actions={(
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={submitting}
            onClick={async () => {
              if (!locationId) {
                setFormError("Select a location to receive inventory into.");
                return;
              }
              setFormError(null);
              setSubmitting(true);
              try {
                await onConfirm(
                  receivableLines
                    .map((item) => ({
                      lineItemId: item.id,
                      productId: item.product_id as string,
                      locationId,
                      quantityToReceive: Number(quantities[item.id] ?? 0),
                    }))
                    .filter((line) => line.quantityToReceive > 0),
                );
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {submitting ? "Receiving..." : "Confirm Receive Inventory"}
          </button>
        </>
      )}
    >
      <p className="modal-message">
        This records the received quantities from this manufacturing order.
        {shopifyLines.length
          ? " Products sold on Shopify are not added to stock here. Shopify keeps that count, so add those units in Shopify and they will show in Nexus on the next check."
          : " The quantities are added to the location below."}
      </p>
      <div className="field">
        <label>Receiving Location</label>
        <select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
          <option value="">Select location...</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>{location.name}</option>
          ))}
        </select>
      </div>
      {formError ? <p className="danger-text">{formError}</p> : null}
      <div className="section-stack">
        {receivableLines.length ? receivableLines.map((item) => (
          <div key={item.id} className="detail-card">
            <ProductNameWithMetadata product={item.products} fallbackName={item.product_name} fallbackSku={item.sku} linkToDetail={false} />
            {item.products && isShopifyLinked(item.products) ? (
              <p className="helper-text">Sold on Shopify: add these units in Shopify after receiving.</p>
            ) : null}
            <div className="form-grid">
              <div className="field field-half">
                <label>Quantity Ordered</label>
                <input value={item.quantity_ordered} disabled />
              </div>
              <div className="field field-half">
                <label>Already Received</label>
                <input value={item.quantity_received ?? 0} disabled />
              </div>
              <div className="field field-half">
                <label>Quantity to Receive</label>
                <input
                  type="number"
                  min={0}
                  max={Number(item.quantity_ordered ?? 0) - Number(item.quantity_received ?? 0)}
                  value={quantities[item.id] ?? 0}
                  onChange={(event) =>
                    setQuantities((current) => ({ ...current, [item.id]: Number(event.target.value) }))
                  }
                />
              </div>
            </div>
          </div>
        )) : <div className="empty-state">All line items on this order have already been received.</div>}
      </div>
    </Modal>
  );
}
