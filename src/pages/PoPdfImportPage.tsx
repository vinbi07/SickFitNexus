import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { CatalogItemPicker } from "@/components/orders/CatalogItemPicker";
import {
  poPdfImportService,
  type PoImportCatalog,
  type PoImportCommitResult,
} from "@/services/poPdfImportService";
import { formatDateOnly } from "@/utils/format";
import { barcodeOptionId, type CatalogOption } from "@/utils/catalogPicker";
import { computeBatchWarnings, isLineMapped, type MatchSource, type ReviewLine, type ReviewPurchaseOrder } from "@/utils/poImportMatching";
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
  return po.lines.every(isLineMapped);
}

function matchLabel(line: ReviewLine) {
  if (!line.productId && line.barcodeId) return "Barcode only: no stock held";
  return MATCH_LABELS[line.matchSource];
}

// The sample button is for testing: on in local dev, or add ?test=1 to the URL.
const SHOW_SAMPLE_BUTTON =
  import.meta.env.DEV || (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("test"));

export function PoPdfImportPage() {
  const [stage, setStage] = useState<Stage>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
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
    await loadReview(() => poPdfImportService.extract(file));
  }

  async function handleLoadSample() {
    setError(null);
    setStage("extracting");
    await loadReview(() => poPdfImportService.loadSample());
  }

  async function loadReview(read: () => ReturnType<typeof poPdfImportService.extract>) {
    try {
      const extracted = await read();
      setImportId(extracted.importId);
      setFileName(extracted.fileName);
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

  function setAlreadyProcessed(key: string | "all", alreadyProcessed: boolean) {
    updateReview(review.map((po) => (key === "all" || po.key === key ? { ...po, alreadyProcessed } : po)));
  }

  function setLineProduct(key: string, lineIndex: number, option: CatalogOption | null) {
    const productId = option?.kind === "product" ? option.product.id : null;
    const barcodeId = option?.kind === "barcode" ? option.barcode.id : null;
    updateReview(
      review.map((po) =>
        po.key !== key
          ? po
          : {
              ...po,
              lines: po.lines.map((line, index) =>
                index === lineIndex
                  ? { ...line, productId, barcodeId, matchSource: option ? "manual" : "none" }
                  : line,
              ),
            },
      ),
    );
  }

  async function handleCommit() {
    if (!importId || !catalog || !toCreate.length) return;
    setError(null);
    setStage("committing");
    try {
      const committed = await poPdfImportService.commit({
        importId,
        fileName,
        review: review.map((po) => ({ ...po, include: po.include && isReady(po) })),
        productsById: catalog.productsById,
        barcodesById: catalog.barcodesById,
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
      printPurchaseOrderDocument(`Invoices ${fileName}`.trim(), html);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the invoices to print.");
    } finally {
      setPrinting(false);
    }
  }

  function reset() {
    setStage("idle");
    setFile(null);
    setFileName("");
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
            {SHOW_SAMPLE_BUTTON ? (
              <button className="btn btn-ghost" disabled={stage === "extracting"} onClick={() => void handleLoadSample()}>
                Load sample POs (testing, no AI)
              </button>
            ) : null}
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
              Creating an invoice holds the stock it needs, up to what is in stock. Every PO in this file draws from
              the same stock, earliest ship date first. Voiding an invoice gives its held stock back.
            </p>
            <div className="btn-row">
              <button className="btn btn-primary" disabled={!toCreate.length || stage === "committing"} onClick={() => void handleCommit()}>
                {stage === "committing"
                  ? "Creating..."
                  : `Create ${toCreate.length} PO${toCreate.length === 1 ? "" : "s"} + invoice${toCreate.length === 1 ? "" : "s"}`}
              </button>
              <button
                className="btn btn-secondary"
                disabled={stage === "committing"}
                onClick={() => setAlreadyProcessed("all", !review.every((po) => po.alreadyProcessed))}
              >
                {review.every((po) => po.alreadyProcessed) ? "Unmark all as processed" : "Mark all as already processed"}
              </button>
              <button className="btn btn-ghost" disabled={stage === "committing"} onClick={reset}>Start over</button>
            </div>
            <p className="helper-text">
              Mark a PO as already processed when it has already shipped and your stock already reflects it. Its PO and
              invoice are still created, but inventory is not touched and the PO is recorded as fulfilled.
            </p>
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
                    <label className="po-import-include">
                      <input
                        type="checkbox"
                        checked={po.alreadyProcessed}
                        disabled={stage === "committing" || !po.include}
                        onChange={(event) => setAlreadyProcessed(po.key, event.target.checked)}
                      />
                      Already processed (don't touch inventory)
                    </label>
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
                    <strong>{formatDateOnly(extracted.order_date)}</strong>
                  </div>
                  <div>
                    <span className="muted">Ship window</span>
                    <strong>{formatDateOnly(extracted.start_ship_date)} to {formatDateOnly(extracted.ship_complete_date)}</strong>
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
                  <table className="data-table po-import-lines">
                    <colgroup>
                      <col className="col-item" />
                      <col className="col-po" />
                      <col className="col-upc" />
                      <col className="col-product" />
                      <col className="col-num" />
                      <col className="col-num" />
                      <col className="col-num" />
                      <col className="col-money" />
                      <col className="col-money" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Item #</th>
                        <th>On the PO</th>
                        <th>UPC</th>
                        <th>Nexus product</th>
                        <th>Qty</th>
                        <th>In stock</th>
                        <th>Hold</th>
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
                              <CatalogItemPicker
                                options={catalog?.options ?? []}
                                value={line.productId ?? (line.barcodeId ? barcodeOptionId(line.barcodeId) : null)}
                                hint={{
                                  text: [line.extracted.description, line.extracted.vendor_style].filter(Boolean).join(" "),
                                  upc: line.extracted.upc,
                                }}
                                disabled={stage === "committing"}
                                onChange={(option) => setLineProduct(po.key, lineIndex, option)}
                              />
                              <span className={`helper-text ${line.productId ? "" : "po-import-unmatched"}`}>
                                {matchLabel(line)}
                              </span>
                            </div>
                          </td>
                          <td>{line.extracted.quantity}</td>
                          <td>{line.available ?? ""}</td>
                          <td
                            className={
                              line.productId && po.include && !po.alreadyProcessed && line.allocateUnits < line.extracted.quantity
                                ? "po-import-unmatched"
                                : ""
                            }
                          >
                            {po.alreadyProcessed ? "None" : line.productId && po.include ? line.allocateUnits : ""}
                          </td>
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
                  <th>Units held</th>
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
                    <td>
                      {result.error ? "" : result.alreadyProcessed ? (
                        "Inventory not changed"
                      ) : (
                        <span className={result.unitsHeld < result.unitsOrdered ? "po-import-unmatched" : ""}>
                          {result.unitsHeld} of {result.unitsOrdered}
                        </span>
                      )}
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
