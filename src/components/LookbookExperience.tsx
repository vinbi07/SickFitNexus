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
  groupLookbookFamilies,
  resolveCasePackQuantity,
  sortProductsByFamily,
  type LookbookFamily,
} from "@/utils/lookbook";

function formatRange(values: number[]) {
  const priced = values.filter((value) => value > 0);
  if (!priced.length) return formatCurrency(0);
  const min = Math.min(...priced);
  const max = Math.max(...priced);
  return min === max
    ? formatCurrency(min)
    : `${formatCurrency(min)}–${formatCurrency(max)}`;
}

function singular(unitLabel: string) {
  return unitLabel.replace(/s$/, "");
}

/** One style in the catalog: shared image and pricing, one order row per variant. */
function LookbookFamilyCard({
  family,
  quantities,
  quantityWarnings,
  onChangeQuantity,
}: {
  family: LookbookFamily;
  quantities: Record<string, number>;
  quantityWarnings: Record<string, string>;
  onChangeQuantity: (product: Product, cases: number) => void;
}) {
  const { variants } = family;
  const root = variants[0];
  const selectedCount = variants.filter(
    (variant) => Number(quantities[variant.id] ?? 0) > 0,
  ).length;
  const totalAvailable = variants.reduce(
    (sum, variant) => sum + deriveInventoryAvailable(variant),
    0,
  );
  const missingDocs = variants.some(
    (variant) => variant.compliance_docs_status === "Missing",
  );
  const singleVariant = variants.length === 1;

  return (
    <article
      className={`lookbook-card${selectedCount ? " lookbook-card-selected" : ""}`}
    >
      <div className="lookbook-card-media">
        {family.imageUrl ? (
          <img src={family.imageUrl} alt={family.name} />
        ) : (
          <span>{getDisplaySku(root).slice(0, 2)}</span>
        )}
        {selectedCount ? (
          <span className="lookbook-card-flag">
            {selectedCount} in order
          </span>
        ) : null}
      </div>
      <div className="lookbook-card-body">
        <div className="lookbook-card-topline">
          <strong className="lookbook-card-title">{family.name}</strong>
          <span className="lookbook-card-sku">
            {singleVariant
              ? getDisplaySku(root)
              : `${variants.length} variants`}
            {" · "}
            {totalAvailable > 0 ? "In stock" : "Out of stock"}
            {missingDocs ? " · Compliance docs missing" : ""}
          </span>
        </div>
        <div className="lookbook-price-row">
          <div>
            <span>Wholesale</span>
            <strong>
              {formatRange(variants.map(getLookbookWholesalePrice))}
            </strong>
          </div>
          <div>
            <span>MSRP</span>
            <strong>{formatRange(variants.map(getLookbookRetailPrice))}</strong>
          </div>
        </div>

        <ul className="lookbook-variant-list">
          {variants.map((variant) => {
            const caseQty = Number(quantities[variant.id] ?? 0);
            const packsPerCase = resolveCasePackQuantity(variant);
            const unitLabel = getOrderUnitLabel(variant);
            const available = deriveInventoryAvailable(variant);
            const maxCases = Math.floor(available / packsPerCase);
            const wholesale = getLookbookWholesalePrice(variant);
            const orderedUnits = caseQty * packsPerCase;
            const label = singleVariant
              ? `Case of ${packsPerCase} ${unitLabel}`
              : getProductVariantLabel(variant);
            const warning = quantityWarnings[variant.id];

            return (
              <li
                key={variant.id}
                className={`lookbook-variant-row${caseQty > 0 ? " is-selected" : ""}${maxCases <= 0 ? " is-out" : ""}`}
              >
                <div className="lookbook-variant-info">
                  <strong>{label}</strong>
                  <span>
                    {formatCurrency(wholesale)}/{singular(unitLabel)}
                    {" · "}
                    {maxCases > 0
                      ? `${available} ${unitLabel} available`
                      : "Out of stock"}
                  </span>
                </div>
                <div className="lookbook-variant-stepper">
                  <button
                    type="button"
                    aria-label={`Remove one case of ${family.name} ${label}`}
                    disabled={caseQty <= 0}
                    onClick={() => onChangeQuantity(variant, caseQty - 1)}
                  >
                    −
                  </button>
                  <input
                    type="number"
                    className="lookbook-qty-input"
                    aria-label={`Cases of ${family.name} ${label}`}
                    min={0}
                    max={Math.max(maxCases, 0)}
                    value={caseQty}
                    disabled={maxCases <= 0}
                    onChange={(event) =>
                      onChangeQuantity(variant, Number(event.target.value))
                    }
                  />
                  <button
                    type="button"
                    aria-label={`Add one case of ${family.name} ${label}`}
                    disabled={maxCases <= 0}
                    onClick={() => onChangeQuantity(variant, caseQty + 1)}
                  >
                    +
                  </button>
                </div>
                <div className="lookbook-variant-total">
                  {caseQty > 0
                    ? `${orderedUnits} ${unitLabel} | ${formatCurrency(orderedUnits * wholesale)}`
                    : singleVariant
                      ? "Cases"
                      : `Case of ${packsPerCase}`}
                </div>
                {warning ? (
                  <p className="lookbook-variant-warning">{warning}</p>
                ) : null}
              </li>
            );
          })}
        </ul>

        <details className="lookbook-specs">
          <summary>Product details</summary>
          <table className="lookbook-spec-table">
            <thead>
              <tr>
                {singleVariant ? null : <th>Variant</th>}
                <th>SKU</th>
                <th>Barcode</th>
                <th>Case pack</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((variant) => {
                const unitsPerPack = getUnitsPerPack(variant) ?? 1;
                return (
                  <tr key={variant.id}>
                    {singleVariant ? null : (
                      <td>{getProductVariantLabel(variant)}</td>
                    )}
                    <td>{getDisplaySku(variant)}</td>
                    <td>{getDisplayBarcode(variant)}</td>
                    <td>
                      {resolveCasePackQuantity(variant)} ×{" "}
                      {unitsPerPack > 1 ? `${unitsPerPack}-pack` : "single"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <dl className="lookbook-spec-list">
            <div className="lookbook-spec-row">
              <dt>Weight</dt>
              <dd>{root.weight ?? "Weight TBD"}</dd>
            </div>
            <div className="lookbook-spec-row">
              <dt>Dimensions</dt>
              <dd>{root.dimensions ?? "15 × 10 × 0.2 in"}</dd>
            </div>
          </dl>
        </details>
      </div>
    </article>
  );
}

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
  const families = groupLookbookFamilies(products);

  const clearWarning = (productId: string) =>
    setQuantityWarnings((current) => {
      if (!current[productId]) return current;
      const next = { ...current };
      delete next[productId];
      return next;
    });

  /** Sets a SKU's case count, clamped to what's available, and flags the cap. */
  const changeQuantity = (product: Product, requested: number) => {
    const maxCases = Math.floor(
      deriveInventoryAvailable(product) / resolveCasePackQuantity(product),
    );
    const next = Math.min(Math.max(0, Math.floor(requested) || 0), Math.max(maxCases, 0));
    setQuantities((current) => ({ ...current, [product.id]: next }));
    if (requested > next || (next >= maxCases && requested > 0)) {
      setQuantityWarnings((current) => ({
        ...current,
        [product.id]:
          maxCases > 0
            ? `Only ${maxCases} case${maxCases === 1 ? "" : "s"} available right now.`
            : "This item is currently out of stock.",
      }));
    } else {
      clearWarning(product.id);
    }
  };

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
              {families.map((family) => (
                <LookbookFamilyCard
                  key={family.key}
                  family={family}
                  quantities={quantities}
                  quantityWarnings={quantityWarnings}
                  onChangeQuantity={changeQuantity}
                />
              ))}
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
                                  clearWarning(String(line.product_id));
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
