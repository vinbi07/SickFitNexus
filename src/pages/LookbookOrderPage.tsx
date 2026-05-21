import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { NotificationBanner } from "@/components/NotificationBanner";
import { useAsyncData } from "@/hooks/useAsyncData";
import { lookbookOrderService } from "@/services/lookbookOrderService";
import type { LookbookOrderInputLine, Product, PurchaseOrder } from "@/types/domain";
import { formatCurrency } from "@/utils/format";
import {
  buildLineItemFromProduct,
  calculateLookbookTotals,
  deriveInventoryAvailable,
  getDisplaySku,
  getLookbookMetaLine,
  getLookbookRetailPrice,
  getLookbookWholesalePrice,
  getOrderUnitLabel,
  getProductFamilyName,
  getProductVariantLabel,
  resolveCasePackQuantity,
  sortProductsByFamily,
} from "@/utils/lookbook";

export function LookbookOrderPage() {
  const { token = "" } = useParams();
  const { data, loading, error, reload } = useAsyncData(() => lookbookOrderService.loadByToken(token), [token]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [quantityWarnings, setQuantityWarnings] = useState<Record<string, string>>({});
  const [busyAction, setBusyAction] = useState<"draft" | "quote" | "submit" | null>(null);
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState<PurchaseOrder | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const selectedProducts = useMemo(() => {
    if (!data) return [];
    return sortProductsByFamily(data.products)
      .filter((product) => Number(quantities[product.id] ?? 0) > 0)
      .map((product) => buildLineItemFromProduct(product, Number(quantities[product.id] ?? 0)));
  }, [data, quantities]);

  const totals = useMemo(
    () =>
      calculateLookbookTotals(
        selectedProducts.map((line) => ({
          sku: String(line.sku ?? ""),
          unit_quantity: Number(line.unit_quantity ?? 0),
          extended_cost: Number(line.extended_cost ?? 0),
          extended_retail: Number(line.extended_retail ?? 0),
        })),
      ),
    [selectedProducts],
  );

  const displayProducts = useMemo(() => sortProductsByFamily(data?.products ?? []), [data]);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load this lookbook"} />;

  async function handleSave(action: "draft" | "quote" | "submit") {
    try {
      setBusyAction(action);
      setNotice(null);
      const activeData = data;
      if (!activeData) throw new Error("Lookbook data is unavailable.");
      const lines: LookbookOrderInputLine[] = Object.entries(quantities)
        .filter(([, caseQty]) => Number(caseQty) > 0)
        .map(([productId, requested_case_quantity]) => {
          const product = activeData.products.find((entry) => entry.id === productId);
          return {
            product_id: productId,
            sku: product?.sku ?? "",
            requested_case_quantity: Number(requested_case_quantity),
          };
        });
      const po = await lookbookOrderService.save(token, lines, action, notes);
      if (action === "submit") {
        setSubmitted(po);
      } else {
        setNotice({
          tone: "success",
          message: action === "quote" ? "Quote request saved and queued for review." : "Draft saved successfully.",
        });
      }
      await reload();
    } catch (err) {
      setNotice({
        tone: "error",
        message: err instanceof Error ? err.message : "Unable to save your order.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  if (submitted) {
    return (
      <div className="lookbook-shell">
        <div className="lookbook-confirmation card">
          <div className="lookbook-confirmation-mark">OK</div>
          <h1>Order submitted</h1>
          <p>Your SickFit purchase order has been received and routed for approval.</p>
          <strong>{submitted.po_number}</strong>
          <span>A confirmation notice has been queued for email delivery.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="lookbook-shell">
      <div className="lookbook-hero">
        <div>
          <p className="lookbook-kicker">Order mode | {data.retailer.name} can submit a PO from this page</p>
          <h1>SickFit Wholesale Lookbook</h1>
          <span>{data.buyer.buyer_name} | {data.buyer.payment_terms ?? "Terms pending"}</span>
        </div>
      </div>
      {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}
      {!data.products.length ? (
        <div className="empty-state">No products are available for ordering right now.</div>
      ) : (
        <div className="lookbook-layout">
          <div className="lookbook-grid">
            {displayProducts.map((product: Product) => {
              const caseQty = Number(quantities[product.id] ?? 0);
              const selected = caseQty > 0;
              const packsPerCase = resolveCasePackQuantity(product);
              const orderUnitLabel = getOrderUnitLabel(product);
              const orderedUnits = caseQty * packsPerCase;
              const wholesalePrice = getLookbookWholesalePrice(product);
              const lineTotal = orderedUnits * wholesalePrice;
              const availableUnits = deriveInventoryAvailable(product);
              const maxCaseQuantity = Math.floor(availableUnits / packsPerCase);
              const limitMessage = maxCaseQuantity > 0
                ? `Only ${maxCaseQuantity} case${maxCaseQuantity === 1 ? "" : "s"} available right now.`
                : "This item is currently out of stock.";
              const displaySku = getDisplaySku(product);
              const metaLine = getLookbookMetaLine(product);
              const quantityWarning = quantityWarnings[product.id];

              return (
                <article key={product.id} className={`lookbook-card${selected ? " lookbook-card-selected" : ""}`}>
                  <div className="lookbook-card-media">
                    {product.image_url ? <img src={product.image_url} alt={product.name} /> : <span>{displaySku.slice(0, 2)}</span>}
                  </div>
                  <div className="lookbook-card-body">
                    <div className="lookbook-card-topline">
                      <strong className="lookbook-card-title">{getProductFamilyName(product)}</strong>
                      <span className="lookbook-card-sku">{getProductVariantLabel(product)} | {displaySku}</span>
                    </div>
                    {metaLine ? <p className="lookbook-card-copy">{metaLine}</p> : null}
                    <p className="lookbook-card-copy">{packsPerCase} {orderUnitLabel}/case | {product.weight ?? "Weight TBD"} | {product.dimensions ?? "Dimensions TBD"}</p>
                    <div className="lookbook-price-row">
                      <div><span>Wholesale</span><strong>{formatCurrency(wholesalePrice)}</strong></div>
                      <div><span>MSRP</span><strong>{formatCurrency(getLookbookRetailPrice(product))}</strong></div>
                    </div>
                    <div className="lookbook-stepper">
                      <button
                        className="btn btn-secondary btn-small"
                        onClick={() => {
                          setQuantities((current) => ({ ...current, [product.id]: Math.max(caseQty - 1, 0) }));
                          setQuantityWarnings((current) => {
                            if (!current[product.id]) return current;
                            const next = { ...current };
                            delete next[product.id];
                            return next;
                          });
                        }}
                      >
                        -
                      </button>
                      <div>
                        <strong>{caseQty} cases</strong>
                        <span>{orderedUnits} {orderUnitLabel} | {formatCurrency(lineTotal)}</span>
                      </div>
                      <button
                        className="btn btn-primary btn-small"
                        disabled={maxCaseQuantity <= 0}
                        onClick={() => {
                          if (caseQty >= maxCaseQuantity) {
                            setQuantityWarnings((current) => ({ ...current, [product.id]: limitMessage }));
                            return;
                          }

                          setQuantities((current) => ({ ...current, [product.id]: caseQty + 1 }));
                          setQuantityWarnings((current) => {
                            if (!current[product.id]) return current;
                            const next = { ...current };
                            delete next[product.id];
                            return next;
                          });
                        }}
                      >
                        +
                      </button>
                    </div>
                    {quantityWarning ? <p className="helper-text danger-text">{quantityWarning}</p> : null}
                    <div className="lookbook-card-footer">
                      <span>{availableUnits} {orderUnitLabel} available</span>
                      {product.compliance_docs_status === "Missing" ? <span>Compliance docs missing</span> : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <aside className="lookbook-summary panel">
            <div className="panel-header"><h3>Order Summary</h3></div>
            <div className="detail-grid">
              <div className="detail-card"><span>Retailer</span><strong>{data.retailer.name}</strong></div>
              <div className="detail-card"><span>Selected SKUs</span><strong>{totals.skuCount}</strong></div>
              <div className="detail-card"><span>Total Units</span><strong>{totals.totalUnits}</strong></div>
              <div className="detail-card"><span>Payment Terms</span><strong>{data.buyer.payment_terms ?? "Not set"}</strong></div>
              <div className="detail-card" style={{ gridColumn: "1 / -1" }}><span>Shipping</span><strong>Calculated at fulfillment</strong></div>
              <div className="detail-card" style={{ gridColumn: "1 / -1" }}><span>Compliance</span><strong>{selectedProducts.some((line) => data.products.find((product) => product.id === line.product_id)?.compliance_docs_status === "Missing") ? "Missing docs warning" : "Ready to submit"}</strong></div>
            </div>
            <div className="timeline">
              {selectedProducts.length ? selectedProducts.map((line) => {
                const selectedProduct = data.products.find((product) => product.id === line.product_id);
                const fallbackName = String(line.product_name ?? line.sku ?? "Selected item");

                return (
                  <div key={String(line.product_id)} className="timeline-item">
                    <strong>{getProductFamilyName(selectedProduct ?? { name: fallbackName })}</strong>
                    <p className="helper-text">
                      {getProductVariantLabel(
                        selectedProduct ?? {
                          name: fallbackName,
                          variant_title: null,
                          parent_product_id: null,
                        },
                      )} | {line.sku}
                    </p>
                    <p>{line.case_quantity} cases | {line.unit_quantity} ordered</p>
                    <span className="muted">{formatCurrency(Number(line.extended_cost ?? 0))}</span>
                  </div>
                );
              }) : <div className="empty-state">No selected items yet.</div>}
            </div>
            <div className="po-total-card lookbook-total-card">
              <div><span>Subtotal</span><strong>{formatCurrency(totals.subtotal)}</strong></div>
              <div><span>Estimated Total</span><strong>{formatCurrency(totals.subtotal)}</strong></div>
            </div>
            <div className="field field-wide">
              <label>Notes</label>
              <textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </div>
            <div className="btn-row">
              <button className="btn btn-secondary" disabled={Boolean(busyAction)} onClick={() => void handleSave("draft")}>{busyAction === "draft" ? "Saving..." : "Save Draft"}</button>
              <button className="btn btn-ghost" disabled={Boolean(busyAction)} onClick={() => void handleSave("quote")}>{busyAction === "quote" ? "Saving..." : "Request Quote"}</button>
              <button className="btn btn-primary" disabled={Boolean(busyAction)} onClick={() => void handleSave("submit")}>{busyAction === "submit" ? "Submitting..." : "Submit PO to SickFit"}</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
