import { useEffect, useMemo, useState } from "react";
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
  const [hydratedDraftId, setHydratedDraftId] = useState<string | null>(null);

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

  useEffect(() => {
    if (!data?.existingDraft?.id || hydratedDraftId === data.existingDraft.id) return;
    const nextQuantities = data.existingDraftLineItems.reduce<Record<string, number>>((accumulator, line) => {
      if (line.product_id) {
        accumulator[line.product_id] = Number(line.case_quantity ?? 0);
      }
      return accumulator;
    }, {});
    setQuantities(nextQuantities);
    setNotes(data.existingDraft.buyer_notes ?? data.existingDraft.notes ?? "");
    setHydratedDraftId(data.existingDraft.id);
  }, [data, hydratedDraftId]);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load this lookbook"} />;

  const orderingDisabled = !data.buyer.order_mode_enabled || data.retailer.order_mode_policy !== "enabled" || data.retailer.edi_required;
  const accentColor = data.retailer.brand_accent_color ?? "#344054";
  const activeOrderState = data.existingDraft?.status ?? null;
  const primarySubmitLabel = activeOrderState === "Countered" ? "Submit Revised PO" : "Submit PO to SickFit";

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
      <div className="lookbook-shell" style={{ ["--lookbook-accent" as never]: accentColor }}>
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

  if (data.expired) {
    return (
      <div className="lookbook-shell" style={{ ["--lookbook-accent" as never]: accentColor }}>
        <div className="lookbook-hero">
          <div>
            <p className="lookbook-kicker">{data.retailer.name} | Buyer showroom</p>
            <h1>SickFit Wholesale Lookbook</h1>
            <span>This link has expired. Contact SickFit for a refreshed buyer link.</span>
          </div>
        </div>
        <div className="lookbook-confirmation card">
          <div className="lookbook-confirmation-mark">!</div>
          <h1>Link expired</h1>
          <p>{data.retailer.lookbook_intro ?? "This personalized wholesale showroom is no longer active."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="lookbook-shell" style={{ ["--lookbook-accent" as never]: accentColor }}>
      <div className="lookbook-hero">
        <div>
          <p className="lookbook-kicker">{data.retailer.name} | {orderingDisabled ? "Catalog experience" : "Order mode"}</p>
          <h1>SickFit Wholesale Lookbook</h1>
          <span>{data.buyer.buyer_name} | {data.buyer.payment_terms ?? "Terms pending"}</span>
          {data.retailer.lookbook_intro ? <p className="lookbook-intro">{data.retailer.lookbook_intro}</p> : null}
        </div>
        {data.retailer.logo_url ? (
          <div className="lookbook-hero-logo">
            <img src={data.retailer.logo_url} alt={`${data.retailer.name} logo`} />
          </div>
        ) : null}
      </div>
      {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}
      {activeOrderState === "Countered" ? (
        <NotificationBanner tone="error" message={data.existingDraft?.internal_notes ?? "SickFit sent back a counter update for this order. Revise quantities below and resubmit in the same link."} />
      ) : null}
      {activeOrderState === "On Hold" ? (
        <NotificationBanner tone="error" message={data.existingDraft?.hold_reason ?? "This order is waiting on compliance review. You can still review the assortment while SickFit follows up."} />
      ) : null}
      {activeOrderState === "Draft" ? (
        <NotificationBanner tone="success" message="Your previous draft has been restored below so you can keep editing it." />
      ) : null}
      {activeOrderState === "Pending Approval" ? (
        <NotificationBanner tone="success" message="Your order is already pending SickFit approval. You can review the saved order details below." />
      ) : null}
      {orderingDisabled ? (
        <NotificationBanner
          tone="error"
          message={data.retailer.edi_required
            ? "This retailer must submit purchase orders through the normal EDI channel."
            : "Order mode is disabled for this retailer. Use the lookbook as a catalog and submit the PO through the normal channel."}
        />
      ) : null}
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
                        −
                      </button>
                      <div>
                        <input
                          type="number"
                          className="lookbook-qty-input"
                          min={0}
                          max={maxCaseQuantity > 0 ? maxCaseQuantity : 0}
                          value={caseQty}
                          disabled={maxCaseQuantity <= 0}
                          onChange={(e) => {
                            const val = Math.min(Math.max(0, Math.floor(Number(e.target.value) || 0)), maxCaseQuantity > 0 ? maxCaseQuantity : 0);
                            setQuantities((current) => ({ ...current, [product.id]: val }));
                            if (val >= maxCaseQuantity && maxCaseQuantity > 0) {
                              setQuantityWarnings((current) => ({ ...current, [product.id]: limitMessage }));
                            } else {
                              setQuantityWarnings((current) => {
                                if (!current[product.id]) return current;
                                const next = { ...current };
                                delete next[product.id];
                                return next;
                              });
                            }
                          }}
                        />
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
            <div className="lookbook-summary-header">
              <h3>Your Order</h3>
              {totals.skuCount > 0 ? <span className="lookbook-summary-badge">{totals.skuCount} item{totals.skuCount !== 1 ? "s" : ""}</span> : null}
            </div>

            {data.existingDraft ? (
              <div className="lookbook-summary-section">
                <p className="lookbook-summary-label">Live link status</p>
                <div className="lookbook-line-item">
                  <div className="lookbook-line-main">
                    <strong className="lookbook-line-name">{data.existingDraft.po_number}</strong>
                    <strong className="lookbook-line-price">{data.existingDraft.status}</strong>
                  </div>
                  <div className="lookbook-line-sub">
                    <span>{data.existingDraft.requested_action} request</span>
                    <span>{data.existingDraft.updated_at ? new Date(data.existingDraft.updated_at).toLocaleString() : ""}</span>
                  </div>
                </div>
                {data.counterEvents.length ? (
                  <div className="lookbook-line-list lookbook-scroll-area">
                    {data.counterEvents.slice(0, 3).map((event) => (
                      <div key={event.id} className="lookbook-line-item">
                        <div className="lookbook-line-main">
                          <strong className="lookbook-line-name">{event.event_type.replaceAll("_", " ")}</strong>
                          <strong className="lookbook-line-price">{event.actor_label ?? "SickFit"}</strong>
                        </div>
                        <div className="lookbook-line-sub">
                          <span>{event.notes ?? "No note provided"}</span>
                          <span>{new Date(event.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="lookbook-summary-meta">
              <div>
                <span>Ordering for</span>
                <strong>{data.retailer.name}</strong>
              </div>
            </div>

            <div className="lookbook-summary-section">
              <p className="lookbook-summary-label">What you're ordering</p>
              {selectedProducts.length ? (
                <div className="lookbook-line-list lookbook-scroll-area">
                  {selectedProducts.map((line) => {
                    const selectedProduct = data.products.find((product) => product.id === line.product_id);
                    const fallbackName = String(line.product_name ?? line.sku ?? "Selected item");
                    const hasComplianceIssue = selectedProduct?.compliance_docs_status === "Missing";
                    return (
                      <div key={String(line.product_id)} className="lookbook-line-item">
                        <div className="lookbook-line-main">
                          <strong className="lookbook-line-name">{getProductFamilyName(selectedProduct ?? { name: fallbackName })}</strong>
                          <div className="lookbook-line-right">
                            <strong className="lookbook-line-price">{formatCurrency(Number(line.extended_cost ?? 0))}</strong>
                            <button
                              className="lookbook-line-remove"
                              title="Remove from order"
                              onClick={() => {
                                setQuantities((current) => ({ ...current, [String(line.product_id)]: 0 }));
                                setQuantityWarnings((current) => {
                                  if (!current[String(line.product_id)]) return current;
                                  const next = { ...current };
                                  delete next[String(line.product_id)];
                                  return next;
                                });
                              }}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                        <div className="lookbook-line-sub">
                          <span>{getProductVariantLabel(selectedProduct ?? { name: fallbackName, variant_title: null, parent_product_id: null })} · {line.sku}</span>
                          <span>{line.case_quantity} cases · {line.unit_quantity} units</span>
                        </div>
                        {hasComplianceIssue ? <p className="lookbook-line-warning">SickFit will follow up about missing paperwork for this item</p> : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="lookbook-summary-empty">Add products from the catalogue on the left to build your order.</p>
              )}
            </div>

            {selectedProducts.length > 0 ? (
              <div className="lookbook-subtotal-row">
                <span>Subtotal <span className="lookbook-subtotal-units">({totals.totalUnits} units)</span></span>
                <strong>{formatCurrency(totals.subtotal)}</strong>
              </div>
            ) : null}

            <p className="lookbook-shipping-note">Shipping is calculated at the time of fulfillment.</p>

            <div className="field field-wide">
              <label>Note to SickFit <span className="lookbook-optional">— optional</span></label>
              <textarea rows={3} placeholder="Special instructions, delivery windows, questions..." value={notes} onChange={(event) => setNotes(event.target.value)} />
            </div>

            <div className="lookbook-actions">
              {!orderingDisabled ? (
                <>
                  <button className="btn btn-primary lookbook-submit-btn" disabled={Boolean(busyAction)} onClick={() => void handleSave("submit")}>
                    {busyAction === "submit" ? "Submitting..." : primarySubmitLabel}
                  </button>
                  <div className="lookbook-secondary-actions">
                    <button className="btn btn-ghost" disabled={Boolean(busyAction)} onClick={() => void handleSave("quote")}>{busyAction === "quote" ? "Saving..." : "Request Quote"}</button>
                  </div>
                </>
              ) : (
                <div className="lookbook-secondary-actions">
                  <button className="btn btn-secondary" disabled>Use Normal PO Channel</button>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
