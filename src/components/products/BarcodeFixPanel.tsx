import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check, Copy, ExternalLink, RefreshCw, X } from "lucide-react";
import type { Product } from "@/types/domain";
import type { BarcodeAssessment } from "@/utils/barcode";
import type { BarcodeFixPlan } from "@/utils/barcodeFix";

export interface BarcodeFixItem {
  variant: Product;
  assessment: BarcodeAssessment;
  plan: BarcodeFixPlan;
  /** Deep link to this variant in Shopify admin, when it is synced. */
  shopifyUrl: string | null;
}

function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="pd-code-chip"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          // Clipboard blocked: the code is still visible to select by hand.
        }
      }}
      aria-label={`Copy ${code}`}
    >
      <span>{code}</span>
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
    </button>
  );
}

function ShopifyLink({ url, children }: { url: string | null; children: ReactNode }) {
  if (!url) return <>{children}</>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="table-link pd-inline-link">
      {children}
      <ExternalLink size={13} aria-hidden="true" />
    </a>
  );
}

/** Plain-language cause and numbered steps for one variant's barcode problem. */
function FixSteps({ item }: { item: BarcodeFixItem }) {
  const { plan, variant, shopifyUrl } = item;
  const inShopify = <ShopifyLink url={shopifyUrl}>open this variant in Shopify</ShopifyLink>;
  const finish = <li>Come back here and press <strong>Re-check</strong>. Nexus pulls the barcode from Shopify and checks it again.</li>;
  const bookLink = <Link className="table-link" to="/barcodes?tab=unlinked">barcode book</Link>;

  if (plan.status === "duplicate") {
    const others = plan.conflicts;
    const othersText = others.length ? others.map((other) => other.name || other.sku).join(", ") : "another variant";
    return (
      <>
        <p className="pd-fix-why">
          {plan.code} is also on {othersText}. Each barcode can point to only one variant, otherwise a scan at a
          retailer or the warehouse rings up the wrong item.
        </p>
        <ol className="pd-fix-steps">
          {plan.keeper === "this" ? (
            <>
              <li>Your barcode book assigns {plan.code} to {variant.sku}, so this variant keeps it. Change the other products instead.</li>
              {others.map((other) => (
                <li key={other.id}>
                  Open <Link className="table-link" to={`/products/${other.id}`}>{other.name || other.sku}</Link>
                  {other.adminUrl ? <> (<ShopifyLink url={other.adminUrl}>in Shopify</ShopifyLink>)</> : null} and replace
                  its barcode with that product's own code from the {bookLink}.
                </li>
              ))}
            </>
          ) : plan.keeper === "other" && plan.bookCode ? (
            <>
              <li>
                Your barcode book gives {variant.sku} a different code: <CopyCode code={plan.bookCode} />. The duplicate
                most likely came from copying another product's barcode.
              </li>
              <li>Copy that code, {inShopify}, and paste it into the <strong>Barcode</strong> field. Save in Shopify.</li>
            </>
          ) : (
            <>
              <li>
                Neither product has this code in your barcode book, so look {plan.code} up in GS1 US Data Hub to see which
                product it was issued for.
              </li>
              <li>
                Keep the code on that product. Give the other one its own unused code from the {bookLink} or GS1, entered
                in Shopify's <strong>Barcode</strong> field ({inShopify}
                {others.map((other) =>
                  other.adminUrl ? (
                    <span key={other.id}>
                      , or <ShopifyLink url={other.adminUrl}>{other.name || other.sku}</ShopifyLink>
                    </span>
                  ) : null,
                )}
                ).
              </li>
            </>
          )}
          {finish}
        </ol>
      </>
    );
  }

  if (plan.status === "invalid") {
    return (
      <>
        <p className="pd-fix-why">
          {plan.code} isn't a valid barcode: {item.assessment.detail.toLowerCase()}. Scanners will reject it.
        </p>
        <ol className="pd-fix-steps">
          {plan.bookCode ? (
            <li>
              Your barcode book has <CopyCode code={plan.bookCode} /> for {variant.sku}. Use it.
            </li>
          ) : plan.repairs.length ? (
            <li>
              It may be one of these. Confirm against your GS1 list or the printed packaging before using one:
              <ul className="pd-fix-options">
                {plan.repairs.map((repair) => (
                  <li key={repair.code}>
                    <CopyCode code={repair.code} /> <span>{repair.reason}</span>
                  </li>
                ))}
              </ul>
            </li>
          ) : (
            <li>Find the right code on your GS1 list or the printed packaging.</li>
          )}
          <li>{shopifyUrl ? <>Then {inShopify}</> : "Then open this variant in Shopify"} and replace the <strong>Barcode</strong> field. Save in Shopify.</li>
          {finish}
        </ol>
      </>
    );
  }

  if (plan.status === "missing") {
    return (
      <>
        <p className="pd-fix-why">This variant has no barcode, so it can't go on a factory order or a retailer listing.</p>
        <ol className="pd-fix-steps">
          <li>
            Pick an unused code from your {bookLink}, or create one in GS1 US Data Hub, and link it to {variant.sku}.
          </li>
          <li>{shopifyUrl ? <>Then {inShopify}</> : "Then open this variant in Shopify"} and enter it in the <strong>Barcode</strong> field. Save in Shopify.</li>
          {finish}
        </ol>
      </>
    );
  }

  // mismatch
  return (
    <>
      <p className="pd-fix-why">
        {plan.code ? <>Shopify has {plan.code}, but your barcode book links {plan.bookCode} to {variant.sku}.</> : <>Shopify has no barcode, but your barcode book links {plan.bookCode} to {variant.sku}.</>}
      </p>
      <ol className="pd-fix-steps">
        <li>Check which one is printed on the packaging, or listed in GS1 US Data Hub.</li>
        <li>
          If the book is right, copy {plan.bookCode ? <CopyCode code={plan.bookCode} /> : "it"}, {inShopify}, and paste it into the{" "}
          <strong>Barcode</strong> field.
        </li>
        <li>
          If Shopify is right, the book row is linked to the wrong SKU. Fix the link on the{" "}
          <Link className="table-link" to="/barcodes?tab=problems">Barcodes</Link> page.
        </li>
        {finish}
      </ol>
    </>
  );
}

/**
 * How to fix one variant's barcode, opened from its tag in the variants
 * table. Barcodes live in Shopify, so the fix happens there and Re-check
 * pulls the result back.
 */
export function BarcodeFix({
  item,
  rechecking,
  disabled,
  onRecheck,
  onClose,
}: {
  item: BarcodeFixItem;
  rechecking: boolean;
  disabled: boolean;
  onRecheck: () => void;
  onClose: () => void;
}) {
  return (
    <div className="pd-fix" id={`fix-${item.variant.id}`}>
      <header className="pd-fix-header">
        <strong>How to fix: {item.assessment.label.toLowerCase()}</strong>
        <button type="button" className="pf-chevron" aria-label="Close fix steps" onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      <FixSteps item={item} />
      <div className="pd-fix-actions">
        {item.shopifyUrl ? (
          <a className="btn btn-secondary btn-small" href={item.shopifyUrl} target="_blank" rel="noreferrer">
            Open variant in Shopify
          </a>
        ) : null}
        <button type="button" className="btn btn-ghost btn-small" disabled={disabled} onClick={onRecheck}>
          <RefreshCw size={14} aria-hidden="true" className={rechecking ? "sync-spin" : undefined} />
          {rechecking ? "Checking…" : "Re-check"}
        </button>
      </div>
    </div>
  );
}
