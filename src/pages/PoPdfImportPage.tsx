import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import {
  poPdfImportService,
  type PoImportCatalog,
  type PoImportCommitResult,
} from "@/services/poPdfImportService";
import { formatDate } from "@/utils/format";
import { computeBatchWarnings, type MatchSource, type ReviewPurchaseOrder } from "@/utils/poImportMatching";
import { buildInvoiceDocumentHtml, formatPoCurrency } from "@/utils/purchaseOrderDocument";
import { printPurchaseOrderDocument } from "@/utils/purchaseOrderActions";

type Stage = "idle" | "extracting" | "review" | "committing" | "done";

const MATCH_LABELS: Record<MatchSource, string> = {
  alias: "Matched: saved mapping",
  upc: "Matched: UPC",
  barcode: "Matched: barcode",
  sku: "Matched: SKU",
  manual: "Matched: picked",
  none: "Needs mapping",
};

function isReady(po: ReviewPurchaseOrder) {
  return po.lines.every((line) => Boolean(line.productId));
}

export function PoPdfImportPage() {
  const [stage, setStage] = useState<Stage>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewPurchaseOrder[]>([]);
  const [catalog, setCatalog] = useState<PoImportCatalog | null>(null);
  const [results, setResults] = useState<PoImportCommitResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);

  const retailerNames = useMemo(
    () => new Map((catalog?.retailers ?? []).map((retailer) => [retailer.id, retailer.name])),
    [catalog],
  );
  const toCreate = review.filter((po) => po.include && isReady(po));
  const blocked = review.filter((po) => po.include && !isReady(po));

  async function handleExtract() {
    if (!file) return;
    setError(null);
    setStage("extracting");
    try {
      const extracted = await poPdfImportService.extract(file);
      setImportId(extracted.importId);
      setReview(extracted.review);
      setCatalog(extracted.catalog);
      setStage("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the PDF.");
      setStage("idle");
    }
  }

  function updateReview(next: ReviewPurchaseOrder[]) {
    setReview(catalog ? computeBatchWarnings(next, catalog.productsById) : next);
  }

  function setInclude(key: string, include: boolean) {
    updateReview(review.map((po) => (po.key === key ? { ...po, include } : po)));
  }

  function setLineProduct(key: string, lineIndex: number, productId: string) {
    updateReview(
      review.map((po) =>
        po.key !== key
          ? po
          : {
              ...po,
              lines: po.lines.map((line, index) =>
                index === lineIndex
                  ? { ...line, productId: productId || null, matchSource: productId ? "manual" : "none" }
                  : line,
              ),
            },
      ),
    );
  }

  async function handleCommit() {
    if (!importId || !file || !catalog || !toCreate.length) return;
    setError(null);
    setStage("committing");
    try {
      const committed = await poPdfImportService.commit({
        importId,
        fileName: file.name,
        review: review.map((po) => ({ ...po, include: po.include && isReady(po) })),
        productsById: catalog.productsById,
      });
      setResults(committed);
      setStage("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the purchase orders.");
      setStage("review");
    }
  }

  async function handlePrintAll() {
    const invoiceIds = results.map((result) => result.invoiceId).filter((id): id is string => Boolean(id));
    if (!invoiceIds.length) return;
    setPrinting(true);
    try {
      const invoices = await poPdfImportService.loadInvoicesForPrint(invoiceIds);
      const html = invoices
        .map(({ invoice, lineItems }) => buildInvoiceDocumentHtml(invoice, lineItems, invoice.buyers ?? null, invoice.retailers ?? null))
        .join('<div style="page-break-after:always;break-after:page;"></div>');
      printPurchaseOrderDocument(`Invoices ${file?.name ?? ""}`.trim(), html);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the invoices to print.");
    } finally {
      setPrinting(false);
    }
  }

  function reset() {
    setStage("idle");
    setFile(null);
    setImportId(null);
    setReview([]);
    setResults([]);
    setError(null);
  }

  return (
    <div className="section-stack">
      <PageHeader
        title="Import PO PDF"
        description="Upload retailer purchase orders as a PDF. Nexus reads every PO in the file, matches each line to your products, checks stock, and creates the Retailer POs and their invoices."
        actions={
          <div className="btn-row">
            <Link className="btn btn-ghost" to="/purchase-orders">Back to Purchase Orders</Link>
          </div>
        }
      />
      {error ? <NotificationBanner tone="error" message={error} onClose={() => setError(null)} /> : null}

      {stage === "idle" || stage === "extracting" ? (
        <div className="panel">
          <div className="panel-header">
            <h3>1. Choose the PDF</h3>
          </div>
          <div className="form-grid">
            <div className="field field-wide">
              <label htmlFor="po-pdf">Purchase order PDF (up to about 3 MB)</label>
              <input
                id="po-pdf"
                type="file"
                accept="application/pdf,.pdf"
                disabled={stage === "extracting"}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <p className="helper-text">
            A file can hold several POs. Other pages, such as invoices or cover sheets, are skipped.
          </p>
          <div className="btn-row">
            <button className="btn btn-primary" disabled={!file || stage === "extracting"} onClick={() => void handleExtract()}>
              {stage === "extracting" ? "Reading the PDF. This can take a minute..." : "Read purchase orders"}
            </button>
          </div>
        </div>
      ) : null}

      {stage === "review" || stage === "committing" ? (
        <>
          <div className="panel">
            <div className="panel-header">
              <h3>2. Review {review.length} purchase order{review.length === 1 ? "" : "s"}</h3>
            </div>
            <p className="helper-text">
              Invoices bill the full PO quantity at the PO price. Product names, SKUs and UPCs come from your catalog.
              Stock warnings count every PO in this file together, earliest ship date first.
            </p>
            <div className="btn-row">
              <button className="btn btn-primary" disabled={!toCreate.length || stage === "committing"} onClick={() => void handleCommit()}>
                {stage === "committing"
                  ? "Creating..."
                  : `Create ${toCreate.length} PO${toCreate.length === 1 ? "" : "s"} + invoice${toCreate.length === 1 ? "" : "s"}`}
              </button>
              <button className="btn btn-ghost" disabled={stage === "committing"} onClick={reset}>Start over</button>
            </div>
            {blocked.length ? (
              <p className="helper-text">
                {blocked.length} PO{blocked.length === 1 ? " has" : "s have"} lines that still need a product. Map them below to include them.
              </p>
            ) : null}
          </div>

          {review.map((po) => {
            const extracted = po.extracted;
            const total = extracted.lines.reduce((sum, line) => sum + line.quantity * line.unit_cost, 0);
            return (
              <div className="panel" key={po.key}>
                <div className="panel-header">
                  <h3>
                    <label className="po-import-include">
                      <input
                        type="checkbox"
                        checked={po.include}
                        disabled={stage === "committing"}
                        onChange={(event) => setInclude(po.key, event.target.checked)}
                      />
                      PO {extracted.po_number}
                    </label>
                  </h3>
                  <div className="btn-row">
                    {po.duplicateOfPoId ? (
                      <Link className="btn btn-ghost btn-small" to={`/purchase-orders/${po.duplicateOfPoId}`}>
                        Already imported
                      </Link>
                    ) : null}
                    <StatusBadge label={isReady(po) ? "Ready" : "Needs mapping"} />
                  </div>
                </div>
                <div className="po-import-meta">
                  <div>
                    <span className="muted">Retailer</span>
                    <strong>{po.retailerId ? retailerNames.get(po.retailerId) : `New: ${extracted.bill_to.company ?? "Unknown"}`}</strong>
                  </div>
                  <div>
                    <span className="muted">Ship to</span>
                    <strong>
                      {[extracted.ship_to.store_code, extracted.ship_to.company].filter(Boolean).join(" ")}
                      {extracted.ship_to.city ? `, ${extracted.ship_to.city} ${extracted.ship_to.state ?? ""}` : ""}
                    </strong>
                  </div>
                  <div>
                    <span className="muted">Order date</span>
                    <strong>{formatDate(extracted.order_date)}</strong>
                  </div>
                  <div>
                    <span className="muted">Ship window</span>
                    <strong>{formatDate(extracted.start_ship_date)} to {formatDate(extracted.ship_complete_date)}</strong>
                  </div>
                  <div>
                    <span className="muted">Terms</span>
                    <strong>{extracted.payment_terms_raw ?? "Not printed"}</strong>
                  </div>
                  <div>
                    <span className="muted">Total</span>
                    <strong>{formatPoCurrency(total)}</strong>
                  </div>
                </div>
                <div className="table-shell">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Item #</th>
                        <th>On the PO</th>
                        <th>UPC</th>
                        <th>Nexus product</th>
                        <th>Qty</th>
                        <th>Unit cost</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {po.lines.map((line, lineIndex) => (
                        <tr key={`${po.key}-${lineIndex}`}>
                          <td>{line.extracted.retailer_item_number ?? ""}</td>
                          <td>
                            <div className="cell-stack">
                              <span>{line.extracted.description}</span>
                              <span className="helper-text">{line.extracted.vendor_style}</span>
                            </div>
                          </td>
                          <td>{line.extracted.upc}</td>
                          <td>
                            <div className="cell-stack">
                              <select
                                value={line.productId ?? ""}
                                disabled={stage === "committing"}
                                onChange={(event) => setLineProduct(po.key, lineIndex, event.target.value)}
                              >
                                <option value="">Choose a product...</option>
                                {(catalog?.products ?? []).map((product) => (
                                  <option key={product.id} value={product.id}>
                                    {product.name} ({product.sku})
                                  </option>
                                ))}
                              </select>
                              <span className={`helper-text ${line.productId ? "" : "po-import-unmatched"}`}>
                                {MATCH_LABELS[line.matchSource]}
                              </span>
                            </div>
                          </td>
                          <td>{line.extracted.quantity}</td>
                          <td>{formatPoCurrency(line.extracted.unit_cost)}</td>
                          <td>{formatPoCurrency(line.extracted.quantity * line.extracted.unit_cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {po.warnings.length ? (
                  <ul className="po-import-warnings">
                    {po.warnings.map((warning, index) => (
                      <li key={index} className={`po-import-warning-${warning.kind}`}>{warning.message}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </>
      ) : null}

      {stage === "done" ? (
        <div className="panel">
          <div className="panel-header">
            <h3>3. Created</h3>
            <div className="btn-row">
              <button
                className="btn btn-primary"
                disabled={printing || !results.some((result) => result.invoiceId)}
                onClick={() => void handlePrintAll()}
              >
                {printing ? "Preparing..." : "Print all invoices"}
              </button>
              <button className="btn btn-ghost" onClick={reset}>Import another PDF</button>
            </div>
          </div>
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>PO</th>
                  <th>Invoice</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => (
                  <tr key={result.poNumber}>
                    <td>
                      {result.purchaseOrderId ? (
                        <Link className="table-link" to={`/purchase-orders/${result.purchaseOrderId}`}>{result.poNumber}</Link>
                      ) : result.poNumber}
                    </td>
                    <td>
                      {result.invoiceId ? (
                        <Link className="table-link" to={`/invoices/${result.invoiceId}`}>{result.invoiceNumber}</Link>
                      ) : ""}
                    </td>
                    <td>{result.error ? <span className="po-import-unmatched">{result.error}</span> : "Created"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
