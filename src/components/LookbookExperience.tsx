import { useState, type Dispatch, type SetStateAction } from "react";
import { Modal } from "@/components/Modal";
import { NotificationBanner } from "@/components/NotificationBanner";
import type {
  Buyer,
  Product,
  PurchaseOrder,
  PurchaseOrderCounterEvent,
  Retailer,
} from "@/types/domain";
import { formatCurrency } from "@/utils/format";
import {
  buildLineItemFromProduct,
  calculateLookbookTotals,
  deriveInventoryAvailable,
  getDisplayBarcode,
  getDisplaySku,
  getLookbookRetailPrice,
  getLookbookWholesalePrice,
  getOrderUnitLabel,
  getUnitsPerPack,
  getProductFamilyName,
  getProductVariantLabel,
  resolveCasePackQuantity,
  sortProductsByFamily,
} from "@/utils/lookbook";

type LookbookExperienceRetailer = Pick<
  Retailer,
  | "name"
  | "logo_url"
  | "brand_accent_color"
  | "lookbook_intro"
  | "order_mode_policy"
  | "edi_required"
>;
type LookbookExperienceBuyer = Pick<
  Buyer,
  "buyer_name" | "payment_terms" | "order_mode_enabled"
>;
export type LookbookBuyerProfileDraft = Pick<
  Buyer,
  | "company_name"
  | "buyer_name"
  | "buyer_email"
  | "phone"
  | "shipping_address"
  | "billing_address"
>;

export function LookbookExperience({
  mode,
  retailer,
  buyer,
  products,
  existingDraft,
  counterEvents,
  quantities,
  setQuantities,
  quantityWarnings,
  setQuantityWarnings,
  notes,
  onNotesChange,
  notice,
  onDismissNotice,
  busyAction,
  onSubmit,
  onClosePreview,
  profile,
  onProfileChange,
  onSaveProfile,
  savingProfile,
}: {
  mode: "live" | "preview";
  retailer: LookbookExperienceRetailer;
  buyer: LookbookExperienceBuyer;
  products: Product[];
  existingDraft: PurchaseOrder | null;
  counterEvents: PurchaseOrderCounterEvent[];
  quantities: Record<string, number>;
  setQuantities: Dispatch<SetStateAction<Record<string, number>>>;
  quantityWarnings: Record<string, string>;
  setQuantityWarnings: Dispatch<SetStateAction<Record<string, string>>>;
  notes: string;
  onNotesChange: (value: string) => void;
  notice?: { tone: "success" | "error"; message: string } | null;
  onDismissNotice?: () => void;
  busyAction?: "draft" | "quote" | "submit" | null;
  onSubmit?: (action: "draft" | "quote" | "submit") => void;
  onClosePreview?: () => void;
  profile?: LookbookBuyerProfileDraft;
  onProfileChange?: (
    field: keyof LookbookBuyerProfileDraft,
    value: string,
  ) => void;
  onSaveProfile?: () => void | Promise<void>;
  savingProfile?: boolean;
}) {
  const [profileModal, setProfileModal] = useState<"review" | "submit" | null>(
    null,
  );
  const orderingDisabled =
    !buyer.order_mode_enabled ||
    retailer.order_mode_policy !== "enabled" ||
    retailer.edi_required;
  const accentColor = retailer.brand_accent_color ?? "#344054";
  const activeOrderState = existingDraft?.status ?? null;
  const primarySubmitLabel =
    activeOrderState === "Countered"
      ? "Submit Revised PO"
      : "Submit PO to SickFit";
  const displayProducts = sortProductsByFamily(products);

  const selectedProducts = sortProductsByFamily(products)
    .filter((product) => Number(quantities[product.id] ?? 0) > 0)
    .map((product) =>
      buildLineItemFromProduct(product, Number(quantities[product.id] ?? 0)),
    );

  const totals = calculateLookbookTotals(
    selectedProducts.map((line) => ({
      sku: String(line.sku ?? ""),
      unit_quantity: Number(line.unit_quantity ?? 0),
      extended_cost: Number(line.extended_cost ?? 0),
      extended_retail: Number(line.extended_retail ?? 0),
    })),
  );

  return (
    <>
      <div
        className="lookbook-shell"
        style={{ ["--lookbook-accent" as never]: accentColor }}
      >
        <div className="lookbook-hero">
          <div>
            <p className="lookbook-kicker">
              {retailer.name} |{" "}
              {mode === "preview"
                ? "Preview mode"
                : orderingDisabled
                  ? "Catalog experience"
                  : "Order mode"}
            </p>
            <h1>SickFit Wholesale Lookbook</h1>
            <span>
              {buyer.buyer_name} | {buyer.payment_terms ?? "Terms pending"}
            </span>
            {retailer.lookbook_intro ? (
              <p className="lookbook-intro">{retailer.lookbook_intro}</p>
            ) : null}
          </div>
          {retailer.logo_url ? (
            <div className="lookbook-hero-logo">
              <img src={retailer.logo_url} alt={`${retailer.name} logo`} />
            </div>
          ) : null}
        </div>
        {notice ? (
          <NotificationBanner
            tone={notice.tone}
            message={notice.message}
            onClose={onDismissNotice}
          />
        ) : null}
        {activeOrderState === "Countered" ? (
          <NotificationBanner
            tone="error"
            message={
              existingDraft?.internal_notes ??
              "SickFit sent back a counter update for this order. Revise quantities below and resubmit in the same link."
            }
          />
        ) : null}
        {activeOrderState === "On Hold" ? (
          <NotificationBanner
            tone="error"
            message={
              existingDraft?.hold_reason ??
              "This order is waiting on compliance review. You can still review the assortment while SickFit follows up."
            }
          />
        ) : null}
        {activeOrderState === "Draft" ? (
          <NotificationBanner
            tone="success"
            message="Your previous draft has been restored below so you can keep editing it."
          />
        ) : null}
        {activeOrderState === "Pending Approval" ? (
          <NotificationBanner
            tone="success"
            message="Your order is already pending SickFit approval. You can review the saved order details below."
          />
        ) : null}
        {orderingDisabled ? (
          <NotificationBanner
            tone="error"
            message={
              retailer.edi_required
                ? "This retailer must submit purchase orders through the normal EDI channel."
                : "Order mode is disabled for this retailer. Use the lookbook as a catalog and submit the PO through the normal channel."
            }
          />
        ) : null}
        {!products.length ? (
          <div className="empty-state">
            No products are available for ordering right now.
          </div>
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
                const maxCaseQuantity = Math.floor(
                  availableUnits / packsPerCase,
                );
                const limitMessage =
                  maxCaseQuantity > 0
                    ? `Only ${maxCaseQuantity} case${maxCaseQuantity === 1 ? "" : "s"} available right now.`
                    : "This item is currently out of stock.";
                const displaySku = getDisplaySku(product);
                const displayBarcode = getDisplayBarcode(product);
                const quantityWarning = quantityWarnings[product.id];
                const unitsPerPack = getUnitsPerPack(product) ?? 1;
                const packTypeLabel =
                  unitsPerPack > 1 ? `${unitsPerPack}-Pack` : "Single Pack";

                return (
                  <article
                    key={product.id}
                    className={`lookbook-card${selected ? " lookbook-card-selected" : ""}`}
                  >
                    <div className="lookbook-card-media">
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} />
                      ) : (
                        <span>{displaySku.slice(0, 2)}</span>
                      )}
                    </div>
                    <div className="lookbook-card-body">
                      <div className="lookbook-card-topline">
                        <strong className="lookbook-card-title">
                          {getProductFamilyName(product)}
                        </strong>
                      </div>
                      <div className="lookbook-price-row">
                        <div>
                          <span>Wholesale</span>
                          <strong>{formatCurrency(wholesalePrice)}</strong>
                        </div>
                        <div>
                          <span>MSRP</span>
                          <strong>
                            {formatCurrency(getLookbookRetailPrice(product))}
                          </strong>
                        </div>
                      </div>
                      <div className="lookbook-stepper">
                        <button
                          className="btn btn-secondary btn-small"
                          onClick={() => {
                            setQuantities((current) => ({
                              ...current,
                              [product.id]: Math.max(caseQty - 1, 0),
                            }));
                            setQuantityWarnings((current) => {
                              if (!current[product.id]) return current;
                              const next = { ...current };
                              delete next[product.id];
                              return next;
                            });
                          }}
                        >
                          −1 Case
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
                              const val = Math.min(
                                Math.max(
                                  0,
                                  Math.floor(Number(e.target.value) || 0),
                                ),
                                maxCaseQuantity > 0 ? maxCaseQuantity : 0,
                              );
                              setQuantities((current) => ({
                                ...current,
                                [product.id]: val,
                              }));
                              if (
                                val >= maxCaseQuantity &&
                                maxCaseQuantity > 0
                              ) {
                                setQuantityWarnings((current) => ({
                                  ...current,
                                  [product.id]: limitMessage,
                                }));
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
                          <span style={{ textAlign: "center" }}>
                            {orderedUnits} {orderUnitLabel}
                            <br />
                            <strong>{formatCurrency(lineTotal)}</strong>
                          </span>
                        </div>
                        <button
                          className="btn btn-primary btn-small"
                          disabled={maxCaseQuantity <= 0}
                          onClick={() => {
                            if (caseQty >= maxCaseQuantity) {
                              setQuantityWarnings((current) => ({
                                ...current,
                                [product.id]: limitMessage,
                              }));
                              return;
                            }

                            setQuantities((current) => ({
                              ...current,
                              [product.id]: caseQty + 1,
                            }));
                            setQuantityWarnings((current) => {
                              if (!current[product.id]) return current;
                              const next = { ...current };
                              delete next[product.id];
                              return next;
                            });
                          }}
                        >
                          +1 Case
                        </button>
                      </div>
                      {quantityWarning ? (
                        <p className="helper-text danger-text">
                          {quantityWarning}
                        </p>
                      ) : null}
                      <div className="lookbook-card-footer">
                        <span>
                          {availableUnits} {orderUnitLabel} available
                        </span>
                        {product.compliance_docs_status === "Missing" ? (
                          <span>Compliance docs missing</span>
                        ) : null}
                      </div>
                      <dl className="lookbook-spec-list">
                        <div className="lookbook-spec-row">
                          <dt>SKU</dt>
                          <dd>{displaySku}</dd>
                        </div>
                        <div className="lookbook-spec-row">
                          <dt>Case Pack</dt>
                          <dd>
                            {packsPerCase} {orderUnitLabel}/case
                          </dd>
                        </div>
                        <div className="lookbook-spec-row">
                          <dt>Pack Type</dt>
                          <dd>{packTypeLabel}</dd>
                        </div>
                        <div className="lookbook-spec-row">
                          <dt>Weight</dt>
                          <dd>{product.weight ?? "Weight TBD"}</dd>
                        </div>
                        <div className="lookbook-spec-row">
                          <dt>Dimensions</dt>
                          <dd>{product.dimensions ?? "15 × 10 × 0.2 in"}</dd>
                        </div>
                        <div className="lookbook-spec-row">
                          <dt>Barcode</dt>
                          <dd>{displayBarcode}</dd>
                        </div>
                      </dl>
                    </div>
                  </article>
                );
              })}
            </div>
            <aside className="lookbook-summary panel">
              <div className="lookbook-summary-header">
                <h3>Your Order</h3>
                {totals.skuCount > 0 ? (
                  <span className="lookbook-summary-badge">
                    {totals.skuCount} item{totals.skuCount !== 1 ? "s" : ""}
                  </span>
                ) : null}
              </div>
              {profile ? (
                <div className="btn-row">
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={() => setProfileModal("review")}
                  >
                    Review Your Information
                  </button>
                </div>
              ) : null}

              {existingDraft ? (
                <div className="lookbook-summary-section">
                  <p className="lookbook-summary-label">Live link status</p>
                  <div className="lookbook-line-item">
                    <div className="lookbook-line-main">
                      <strong className="lookbook-line-name">
                        {existingDraft.po_number}
                      </strong>
                      <strong className="lookbook-line-price">
                        {existingDraft.status}
                      </strong>
                    </div>
                    <div className="lookbook-line-sub">
                      <span>{existingDraft.requested_action} request</span>
                      <span>
                        {existingDraft.updated_at
                          ? new Date(existingDraft.updated_at).toLocaleString()
                          : ""}
                      </span>
                    </div>
                  </div>
                  {counterEvents.length ? (
                    <div className="lookbook-line-list lookbook-scroll-area">
                      {counterEvents.slice(0, 3).map((event) => (
                        <div key={event.id} className="lookbook-line-item">
                          <div className="lookbook-line-main">
                            <strong className="lookbook-line-name">
                              {event.event_type.replaceAll("_", " ")}
                            </strong>
                            <strong className="lookbook-line-price">
                              {event.actor_label ?? "SickFit"}
                            </strong>
                          </div>
                          <div className="lookbook-line-sub">
                            <span>{event.notes ?? "No note provided"}</span>
                            <span>
                              {new Date(event.created_at).toLocaleString()}
                            </span>
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
                  <strong>{retailer.name}</strong>
                </div>
              </div>

              <div className="lookbook-summary-section">
                <p className="lookbook-summary-label">What you're ordering</p>
                {selectedProducts.length ? (
                  <div className="lookbook-line-list lookbook-scroll-area">
                    {selectedProducts.map((line) => {
                      const selectedProduct = products.find(
                        (product) => product.id === line.product_id,
                      );
                      const fallbackName = String(
                        line.product_name ?? line.sku ?? "Selected item",
                      );
                      const hasComplianceIssue =
                        selectedProduct?.compliance_docs_status === "Missing";
                      return (
                        <div
                          key={String(line.product_id)}
                          className="lookbook-line-item"
                        >
                          <div className="lookbook-line-main">
                            <strong className="lookbook-line-name">
                              {getProductFamilyName(
                                selectedProduct ?? { name: fallbackName },
                              )}
                            </strong>
                            <div className="lookbook-line-right">
                              <strong className="lookbook-line-price">
                                {formatCurrency(
                                  Number(line.extended_cost ?? 0),
                                )}
                              </strong>
                              <button
                                className="lookbook-line-remove"
                                title="Remove from order"
                                onClick={() => {
                                  setQuantities((current) => ({
                                    ...current,
                                    [String(line.product_id)]: 0,
                                  }));
                                  setQuantityWarnings((current) => {
                                    if (!current[String(line.product_id)])
                                      return current;
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
                            <span>
                              {getProductVariantLabel(
                                selectedProduct ?? {
                                  name: fallbackName,
                                  variant_title: null,
                                  parent_product_id: null,
                                },
                              )}{" "}
                              · {line.sku}
                            </span>
                            <span>
                              {line.case_quantity} cases · {line.unit_quantity}{" "}
                              units
                            </span>
                          </div>
                          {hasComplianceIssue ? (
                            <p className="lookbook-line-warning">
                              SickFit will follow up about missing paperwork for
                              this item
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="lookbook-summary-empty">
                    Add products from the catalogue on the left to build your
                    order.
                  </p>
                )}
              </div>

              {selectedProducts.length > 0 ? (
                <div className="lookbook-subtotal-row">
                  <span>
                    Subtotal{" "}
                    <span className="lookbook-subtotal-units">
                      ({totals.totalUnits} units)
                    </span>
                  </span>
                  <strong>{formatCurrency(totals.subtotal)}</strong>
                </div>
              ) : null}

              <p className="lookbook-shipping-note">
                Shipping is calculated at the time of fulfillment.
              </p>

              <div className="field field-wide">
                <label>
                  Note to SickFit{" "}
                  <span className="lookbook-optional">— optional</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="Special instructions, delivery windows, questions..."
                  value={notes}
                  onChange={(event) => onNotesChange(event.target.value)}
                  disabled={mode === "preview"}
                />
              </div>

              <div className="lookbook-actions">
                {mode === "preview" ? (
                  <div className="lookbook-secondary-actions">
                    <button
                      className="btn btn-primary"
                      onClick={onClosePreview}
                    >
                      Close Preview
                    </button>
                  </div>
                ) : !orderingDisabled ? (
                  <>
                    <button
                      className="btn btn-primary lookbook-submit-btn"
                      disabled={Boolean(busyAction)}
                      onClick={() =>
                        profile
                          ? setProfileModal("submit")
                          : onSubmit?.("submit")
                      }
                    >
                      {busyAction === "submit"
                        ? "Submitting..."
                        : primarySubmitLabel}
                    </button>
                    <div className="lookbook-secondary-actions">
                      <button
                        className="btn btn-ghost"
                        disabled={Boolean(busyAction)}
                        onClick={() => onSubmit?.("quote")}
                      >
                        {busyAction === "quote" ? "Saving..." : "Request Quote"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="lookbook-secondary-actions">
                    <button className="btn btn-secondary" disabled>
                      Use Normal PO Channel
                    </button>
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
      {profile && profileModal ? (
        <Modal
          title="Your Business Information"
          onClose={() => setProfileModal(null)}
          actions={
            profileModal === "review" ? (
              <>
                <button
                  className="btn btn-ghost"
                  onClick={() => setProfileModal(null)}
                >
                  Close
                </button>
                {mode === "live" ? (
                  <button
                    className="btn btn-primary"
                    disabled={Boolean(savingProfile)}
                    onClick={() => {
                      void Promise.resolve(onSaveProfile?.()).then(() =>
                        setProfileModal(null),
                      );
                    }}
                  >
                    {savingProfile ? "Saving..." : "Save Information"}
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <button
                  className="btn btn-ghost"
                  disabled={Boolean(busyAction)}
                  onClick={() => setProfileModal(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  disabled={Boolean(busyAction)}
                  onClick={() => {
                    setProfileModal(null);
                    onSubmit?.("submit");
                  }}
                >
                  {busyAction === "submit"
                    ? "Submitting..."
                    : "Confirm & Submit PO"}
                </button>
              </>
            )
          }
        >
          <div className="section-stack">
            {profileModal === "submit" ? (
              <p className="helper-text">
                Please review your information before submitting your PO to
                SickFit.
              </p>
            ) : null}
            <p className="helper-text">
              Company Name, Buyer Name, Buyer Email, Shipping Address, and
              Billing Address are required before you can submit a PO.
            </p>
            <div className="form-grid">
              <div className="field">
                <label>Company Name *</label>
                <input
                  value={profile.company_name ?? ""}
                  disabled={mode === "preview"}
                  onChange={(event) =>
                    onProfileChange?.("company_name", event.target.value)
                  }
                />
              </div>
              <div className="field">
                <label>Buyer Name *</label>
                <input
                  value={profile.buyer_name ?? ""}
                  disabled={mode === "preview"}
                  onChange={(event) =>
                    onProfileChange?.("buyer_name", event.target.value)
                  }
                />
              </div>
              <div className="field">
                <label>Buyer Email *</label>
                <input
                  value={profile.buyer_email ?? ""}
                  disabled={mode === "preview"}
                  onChange={(event) =>
                    onProfileChange?.("buyer_email", event.target.value)
                  }
                />
              </div>
              <div className="field">
                <label>Phone</label>
                <input
                  value={profile.phone ?? ""}
                  disabled={mode === "preview"}
                  onChange={(event) =>
                    onProfileChange?.("phone", event.target.value)
                  }
                />
              </div>
              <div className="field field-wide">
                <label>Shipping Address *</label>
                <textarea
                  rows={3}
                  value={profile.shipping_address ?? ""}
                  disabled={mode === "preview"}
                  onChange={(event) =>
                    onProfileChange?.("shipping_address", event.target.value)
                  }
                />
              </div>
              <div className="field field-wide">
                <label>Billing Address *</label>
                <textarea
                  rows={3}
                  value={profile.billing_address ?? ""}
                  disabled={mode === "preview"}
                  onChange={(event) =>
                    onProfileChange?.("billing_address", event.target.value)
                  }
                />
              </div>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
