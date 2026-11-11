import { useRef, useState } from "react";
import Papa from "papaparse";
import { useSearchParams } from "react-router-dom";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ListTabs, ResourceTable } from "@/components/lists/ResourceTable";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Modal } from "@/components/Modal";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader } from "@/components/PageHeader";
import { useAsyncData } from "@/hooks/useAsyncData";
import { supportService } from "@/services/supportService";
import { getUiErrorLog } from "@/utils/errors";
import type { Product, ProductBarcode, ProductBarcodeLink } from "@/types/domain";
import { checkBarcode, findDuplicateBarcodes, normalizeBarcode } from "@/utils/barcode";
import { getProductFamilyName } from "@/utils/lookbook";
import { familyKeyIndex } from "@/utils/productFamilies";

type BookRowCheck = { tone: "success" | "warning" | "danger" | "neutral"; label: string; detail: string; isProblem: boolean };

/** Judges one barcode-book row: valid code, unique to its SKU, and in step with Shopify. */
function checkBookRow(row: ProductBarcode, duplicates: Map<string, string[]>): BookRowCheck {
  const code = normalizeBarcode(row.barcode_upc);
  if (!code) return { tone: "neutral", label: "Pending", detail: "No UPC yet.", isProblem: false };
  const check = checkBarcode(row.barcode_upc);
  if (!check.ok) return { tone: "danger", label: "Bad code", detail: check.reason, isProblem: true };
  const others = (duplicates.get(code) ?? []).filter((sku) => sku !== row.sku);
  if (others.length) return { tone: "danger", label: "Duplicate", detail: `Also on ${others.join(", ")}`, isProblem: true };
  const drifted = (row.product_barcode_links ?? []).find((link) => {
    const shopify = normalizeBarcode(link.products?.upc);
    return shopify && shopify !== code;
  });
  if (drifted) {
    return {
      tone: "warning",
      label: "Shopify differs",
      detail: `${drifted.products?.sku ?? "Linked product"} has ${normalizeBarcode(drifted.products?.upc)} in Shopify`,
      isProblem: true,
    };
  }
  return { tone: "success", label: "Valid", detail: "Check digit OK", isProblem: false };
}

type BarcodeFormValues = Partial<ProductBarcode> & {
  linked_product_ids?: string[];
};

const REQUIRED_HEADERS = [
  "sku",
  "handle",
  "product_name",
  "collection",
  "pack_quantity",
  "pack_unit",
  "size",
  "barcode_upc",
];

type BarcodeCsvRow = Record<string, string>;

export function BarcodesPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [editing, setEditing] = useState<BarcodeFormValues | null>(null);
  const [deleting, setDeleting] = useState<ProductBarcode | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState("");
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState<"all" | "problems" | "unlinked">(
    initialTab === "problems" || initialTab === "unlinked" ? initialTab : "all",
  );
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const { data, loading, error, reload } = useAsyncData(
    async () => ({
      barcodes: await supportService.listBarcodes(),
      products: await supportService.listProducts(),
    }),
    [],
  );

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load barcodes"} />;

  const duplicates = findDuplicateBarcodes(data.barcodes.map((barcode) => ({ owner: barcode.sku, code: barcode.barcode_upc })));
  const checks = new Map(data.barcodes.map((barcode) => [barcode.id, checkBookRow(barcode, duplicates)]));

  const searchedBarcodes = data.barcodes.filter((barcode) => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchesQuery =
      !normalizedQuery ||
      [
        barcode.sku,
        barcode.handle ?? "",
        barcode.product_name,
        barcode.collection ?? "",
        barcode.barcode_upc ?? "",
        ...(barcode.product_barcode_links ?? []).flatMap((link) => [link.products?.sku ?? "", link.products?.name ?? ""]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    return matchesQuery;
  });
  const isUnlinked = (barcode: ProductBarcode) => !(barcode.product_barcode_links?.length ?? 0);
  const tabCounts = {
    all: searchedBarcodes.length,
    problems: searchedBarcodes.filter((barcode) => checks.get(barcode.id)?.isProblem).length,
    unlinked: searchedBarcodes.filter(isUnlinked).length,
  };
  const filteredBarcodes = searchedBarcodes.filter((barcode) =>
    tab === "problems" ? checks.get(barcode.id)?.isProblem : tab === "unlinked" ? isUnlinked(barcode) : true,
  );

  // Fold book rows under the product their linked variants belong to (like the Products list);
  // rows not linked yet fall back to their Shopify handle.
  const familyIndex = familyKeyIndex(data.products);
  const productById = new Map(data.products.map((product) => [product.id, product]));
  const linkedFamilyOf = (row: ProductBarcode) => {
    const productId = row.product_barcode_links?.find((link) => familyIndex.has(link.product_id))?.product_id;
    return productId ? familyIndex.get(productId)! : null;
  };
  const groupOf = (row: ProductBarcode) => {
    const family = linkedFamilyOf(row);
    if (family) return `product:${family}`;
    return row.handle?.trim() ? `handle:${row.handle.trim().toLowerCase()}` : `row:${row.id}`;
  };
  const groupNameOf = (rows: ProductBarcode[]) => {
    const family = linkedFamilyOf(rows[0]);
    const root = family ? productById.get(family) : null;
    return root ? getProductFamilyName(root) : rows[0].product_name;
  };
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

  async function handleImportFile(file: File) {
    setImporting(true);
    setNotice(null);

    try {
      const parsedRows = await new Promise<BarcodeCsvRow[]>((resolve, reject) => {
        Papa.parse<BarcodeCsvRow>(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            const headers = (results.meta.fields ?? []).map((field) => field.trim());
            const missingHeaders = REQUIRED_HEADERS.filter((field) => !headers.includes(field));
            if (missingHeaders.length) {
              reject(new Error(`CSV is missing required headers: ${missingHeaders.join(", ")}`));
              return;
            }

            if (results.errors.length) {
              reject(new Error(results.errors[0]?.message ?? "Unable to parse barcode CSV."));
              return;
            }

            resolve(results.data);
          },
          error: reject,
        });
      });

      const result = await supportService.importBarcodes(parsedRows);
      await reload();
      setNotice({
        tone: "success",
        message: [
          `${result.importedCount} new barcode ${result.importedCount === 1 ? "row" : "rows"} added, ${result.updatedCount} updated.`,
          result.linkedCount ? `${result.linkedCount} linked to products.` : "",
          result.unmatchedSkus.length
            ? `No product found for ${result.unmatchedSkus.length} SKU${result.unmatchedSkus.length === 1 ? "" : "s"} (${result.unmatchedSkus.slice(0, 3).join(", ")}${result.unmatchedSkus.length > 3 ? ", …" : ""}); link those on the Not linked tab.`
            : "",
          result.repeatedSkus.length ? `${result.repeatedSkus.length} SKU${result.repeatedSkus.length === 1 ? " was" : "s were"} in the file twice; the last row was used.` : "",
        ]
          .filter(Boolean)
          .join(" "),
      });
    } catch (err) {
      setNotice({
        tone: "error",
        message: err instanceof Error ? err.message : "Barcode import failed.",
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="section-stack">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: "none" }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleImportFile(file);
          }
        }}
      />
      <PageHeader
        title="Barcodes"
        description="Your GS1 barcode book. Products and factory orders are checked against it."
        primaryAction={
          <button
            className="btn btn-primary"
            onClick={() =>
              setEditing({
                sku: "",
                handle: "",
                product_name: "",
                collection: "",
                pack_quantity: 1,
                pack_unit: "",
                size: "",
                barcode_upc: "",
                linked_product_ids: [],
              })
            }
          >
            Add barcode
          </button>
        }
        secondaryActions={[
          {
            label: importing ? "Importing CSV…" : "Import barcode book (CSV)",
            disabled: importing,
            onClick: () => fileInputRef.current?.click(),
          },
          { label: "Refresh list", onClick: () => void reload() },
        ]}
      />
      {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}
      <section className="product-list">
        <ListTabs
          label="Barcode views"
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "all", label: "All", count: tabCounts.all },
            { key: "problems", label: "Problems", count: tabCounts.problems },
            { key: "unlinked", label: "Not linked", count: tabCounts.unlinked },
          ]}
        />
        <div className="product-list-toolbar">
          <input
            className="product-list-search"
            type="search"
            aria-label="Search barcodes"
            placeholder="Search by product, SKU, UPC, collection or linked product"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <span className="product-list-count">
            {filteredBarcodes.length} {filteredBarcodes.length === 1 ? "barcode" : "barcodes"}
          </span>
        </div>
        <ResourceTable
          rows={filteredBarcodes}
          rowKey={(row) => row.id}
          emptyMessage={
            data.barcodes.length
              ? tab === "all"
                ? "No barcodes match this search."
                : "Nothing here right now."
              : "No barcodes yet. Import your barcode book CSV or add one."
          }
          onRowClick={(row) => setEditing(row)}
          actionsFor={(row) => [
            { label: "Edit", onClick: () => setEditing(row) },
            { label: "Delete", danger: true, onClick: () => setDeleting(row) },
          ]}
          groupBy={groupOf}
          groupLabel={groupNameOf}
          // Opening everything while searching or on a filtered tab saves a click per product.
          defaultExpanded={tab !== "all" || Boolean(query.trim())}
          columns={[
            {
              key: "product",
              title: "Product",
              render: (row) => (
                <div className="pf-name">
                  <strong className="rt-title">{row.product_name}</strong>
                  <span>
                    {row.sku}
                    {row.collection ? ` · ${row.collection}` : ""}
                  </span>
                </div>
              ),
              renderGroup: (rows) => {
                const collections = [...new Set(rows.map((row) => row.collection).filter(Boolean))];
                return (
                  <div className="pf-name">
                    <strong className="rt-title">{groupNameOf(rows)}</strong>
                    <span>
                      {plural(rows.length, "barcode")}
                      {collections.length === 1 ? ` · ${collections[0]}` : ""}
                    </span>
                  </div>
                );
              },
              renderVariant: (row) => (
                <div className="pf-variant-name">
                  <strong>{row.product_name}</strong>
                  <span>
                    {row.sku}
                    {row.size ? ` · ${row.size}` : ""}
                  </span>
                </div>
              ),
            },
            {
              key: "upc",
              title: "UPC",
              render: (row) => {
                const check = checks.get(row.id)!;
                return (
                  <div className="pf-name">
                    <span className="rt-code">{row.barcode_upc ?? "—"}</span>
                    {check.isProblem || check.tone === "neutral" ? (
                      <span className={check.tone === "danger" ? "rt-status is-danger" : "rt-status is-warning"} title={check.detail}>
                        {check.label}: {check.detail}
                      </span>
                    ) : null}
                  </div>
                );
              },
              renderGroup: (rows) => {
                const results = rows.map((row) => checks.get(row.id)!);
                const problems = results.filter((check) => check.isProblem);
                const pending = results.filter((check) => check.tone === "neutral").length;
                if (problems.length) {
                  const danger = problems.some((check) => check.tone === "danger");
                  return (
                    <span className={danger ? "rt-status is-danger" : "rt-status is-warning"}>
                      {problems.length === rows.length ? "All need a fix" : `${plural(problems.length, "barcode")} need a fix`}
                    </span>
                  );
                }
                if (pending) return <span className="rt-group-sub">{pending} pending UPC</span>;
                return <span className="rt-group-sub">All valid</span>;
              },
            },
            {
              key: "pack",
              title: "Pack",
              hideOnMobile: true,
              render: (row) => (
                <span>
                  {row.pack_quantity ?? "?"} {row.pack_unit ?? "unit"}
                  {row.size ? ` · ${row.size}` : ""}
                </span>
              ),
            },
            {
              key: "linked",
              title: "Linked products",
              render: (row) => {
                const links = row.product_barcode_links ?? [];
                if (!links.length) return <span className="pf-muted">Not linked</span>;
                return (
                  <div className="rt-links">
                    <strong>{links.length === 1 ? "1 product" : `${links.length} products`}</strong>
                    <span>
                      {links
                        .slice(0, 2)
                        .map((link) => link.products?.sku ?? link.product_id)
                        .join(", ")}
                      {links.length > 2 ? ` +${links.length - 2}` : ""}
                    </span>
                  </div>
                );
              },
              renderGroup: (rows) => {
                const linked = new Set(rows.flatMap((row) => (row.product_barcode_links ?? []).map((link) => link.product_id))).size;
                const unlinked = rows.filter(isUnlinked).length;
                return (
                  <div className="rt-links">
                    <strong>{linked ? plural(linked, "product") : "Not linked"}</strong>
                    {unlinked && linked ? <span>{unlinked} not linked</span> : null}
                  </div>
                );
              },
            },
          ]}
        />
      </section>
      {editing ? (
        <BarcodeEditorModal
          initialValue={editing}
          products={data.products}
          onClose={() => setEditing(null)}
          onSaved={async (values) => {
            await supportService.saveBarcode({
              ...editing,
              ...values,
              handle: values.handle ? String(values.handle) : null,
              collection: values.collection ? String(values.collection) : null,
              pack_quantity:
                values.pack_quantity === null || values.pack_quantity === undefined || String(values.pack_quantity) === ""
                  ? null
                  : Number(values.pack_quantity),
              pack_unit: values.pack_unit ? String(values.pack_unit) : null,
              size: values.size ? String(values.size) : null,
              barcode_upc: values.barcode_upc ? String(values.barcode_upc) : null,
              product_barcode_links: (values.linked_product_ids ?? []).map((productId) => ({
                product_id: String(productId),
              })) as ProductBarcodeLink[],
            });
            await reload();
            setNotice({
              tone: "success",
              message: editing.id ? "Barcode row updated successfully." : "Barcode row created successfully.",
            });
          }}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title="Delete barcode row?"
          message={`This will permanently remove ${deleting.product_name} (${deleting.sku}) from the barcode staging catalog.`}
          busy={busyDelete}
          onClose={() => {
            if (!busyDelete) setDeleting(null);
          }}
          onConfirm={async () => {
            try {
              setBusyDelete(true);
              await supportService.deleteBarcode(deleting.id);
              setDeleting(null);
              await reload();
              setNotice({ tone: "success", message: "Barcode row deleted successfully." });
            } catch (err) {
              setNotice({ tone: "error", message: err instanceof Error ? err.message : "Failed to delete barcode row." });
            } finally {
              setBusyDelete(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function BarcodeEditorModal({
  initialValue,
  products,
  onClose,
  onSaved,
}: {
  initialValue: BarcodeFormValues;
  products: Product[];
  onClose: () => void;
  onSaved: (values: BarcodeFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<BarcodeFormValues>({
    sku: initialValue.sku ?? "",
    handle: initialValue.handle ?? "",
    product_name: initialValue.product_name ?? "",
    collection: initialValue.collection ?? "",
    pack_quantity: initialValue.pack_quantity ?? 1,
    pack_unit: initialValue.pack_unit ?? "",
    size: initialValue.size ?? "",
    barcode_upc: initialValue.barcode_upc ?? "",
    linked_product_ids: (initialValue.product_barcode_links ?? []).map((link) => link.product_id),
  });
  const [productQuery, setProductQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; details: string[] } | null>(null);

  const selectedProducts = products.filter((product) => (values.linked_product_ids ?? []).includes(product.id));
  const filteredProducts = products
    .filter((product) => {
      const query = productQuery.trim().toLowerCase();
      if (!query) return true;
      return [product.name, product.sku, product.variant_title ?? "", product.upc ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .slice(0, 12);
  const toggleLink = (productId: string) =>
    setValues((current) => {
      const selected = new Set(current.linked_product_ids ?? []);
      if (selected.has(productId)) selected.delete(productId);
      else selected.add(productId);
      return { ...current, linked_product_ids: [...selected] };
    });

  return (
    <Modal
      className="modal-wide"
      title={initialValue.id ? "Edit Barcode Row" : "Add Barcode Row"}
      onClose={onClose}
      actions={(
        <>
          <button className="btn btn-ghost" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={saving}
            onClick={async () => {
              try {
                if (!String(values.sku ?? "").trim()) throw new Error("SKU is required.");
                if (!String(values.product_name ?? "").trim()) throw new Error("Barcode product name is required.");

                setSaving(true);
                setError(null);
                await onSaved(values);
                onClose();
              } catch (err) {
                const uiError = getUiErrorLog(err, "Unable to save barcode row");
                console.error("Barcode editor save failed", {
                  values,
                  error: err,
                  uiError,
                });
                setError({ message: uiError.message, details: uiError.details });
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving..." : initialValue.id ? "Save Changes" : "Create Barcode Row"}
          </button>
        </>
      )}
    >
      <div className="barcode-editor">
        <div className="form-grid barcode-editor-fields">
        {error ? (
          <div className="form-error field-wide">
            <div>{error.message}</div>
            {error.details.length ? (
              <div style={{ marginTop: 8 }}>
                {error.details.map((detail) => (
                  <div key={detail}>{detail}</div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="field">
          <label>SKU</label>
          <input value={String(values.sku ?? "")} onChange={(event) => setValues((current) => ({ ...current, sku: event.target.value }))} />
        </div>
        <div className="field">
          <label>Handle</label>
          <input value={String(values.handle ?? "")} onChange={(event) => setValues((current) => ({ ...current, handle: event.target.value }))} />
        </div>
        <div className="field">
          <label>Collection</label>
          <input value={String(values.collection ?? "")} onChange={(event) => setValues((current) => ({ ...current, collection: event.target.value }))} />
        </div>
        <div className="field field-wide">
          <label>Barcode Product Name</label>
          <input value={String(values.product_name ?? "")} onChange={(event) => setValues((current) => ({ ...current, product_name: event.target.value }))} />
        </div>
        <div className="field">
          <label>Pack Quantity</label>
          <input
            type="number"
            min={0}
            step={1}
            value={String(values.pack_quantity ?? "")}
            onChange={(event) => setValues((current) => ({ ...current, pack_quantity: Number(event.target.value) }))}
          />
        </div>
        <div className="field">
          <label>Pack Unit</label>
          <input value={String(values.pack_unit ?? "")} onChange={(event) => setValues((current) => ({ ...current, pack_unit: event.target.value }))} />
        </div>
        <div className="field">
          <label>Size</label>
          <input value={String(values.size ?? "")} onChange={(event) => setValues((current) => ({ ...current, size: event.target.value }))} />
        </div>
        <div className="field field-wide">
          <label>Barcode UPC</label>
          <input
            inputMode="numeric"
            aria-describedby="barcode-upc-check"
            value={String(values.barcode_upc ?? "")}
            onChange={(event) => setValues((current) => ({ ...current, barcode_upc: event.target.value }))}
          />
          {String(values.barcode_upc ?? "").trim()
            ? (() => {
                const check = checkBarcode(values.barcode_upc);
                return (
                  <span id="barcode-upc-check" className={check.ok ? "success-text" : "danger-text"}>
                    {check.ok ? "Check digit OK" : check.reason}
                  </span>
                );
              })()
            : null}
        </div>
        </div>

        <section className="barcode-editor-links" aria-labelledby="barcode-links-title">
          <div className="barcode-editor-links-head">
            <h4 id="barcode-links-title">
              Linked products{selectedProducts.length ? ` (${selectedProducts.length})` : ""}
            </h4>
            {selectedProducts.length ? (
              <button
                className="btn btn-ghost btn-small"
                type="button"
                onClick={() => setValues((current) => ({ ...current, linked_product_ids: [] }))}
              >
                Clear all
              </button>
            ) : null}
          </div>
          {selectedProducts.length ? (
            <ul className="barcode-editor-linked">
              {selectedProducts.map((product) => (
                <li key={product.id}>
                  <div className="cell-stack">
                    <strong>{product.name}</strong>
                    <span className="helper-text">
                      {product.sku}
                      {product.variant_title ? ` · ${product.variant_title}` : ""}
                      {product.upc ? ` · UPC ${product.upc}` : " · No UPC in Shopify"}
                    </span>
                  </div>
                  <button className="btn btn-ghost btn-small" type="button" onClick={() => toggleLink(product.id)}>
                    Unlink
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="helper-text">No products linked yet. Search below to attach one or more variants.</p>
          )}

          <input
            className="barcode-editor-search"
            type="search"
            aria-label="Search products to link"
            placeholder="Search product name, SKU, variant, or UPC"
            value={productQuery}
            onChange={(event) => setProductQuery(event.target.value)}
          />
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>
                    <span className="visually-hidden">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => {
                  const isLinked = (values.linked_product_ids ?? []).includes(product.id);
                  return (
                    <tr key={product.id}>
                      <td>
                        <div className="cell-stack">
                          <strong>{product.name}</strong>
                          <span className="helper-text">{product.variant_title ?? product.category ?? "Base product"}</span>
                        </div>
                      </td>
                      <td><span className="product-sku-cell">{product.sku}</span></td>
                      <td>
                        <button
                          className={`btn btn-small ${isLinked ? "btn-secondary" : "btn-ghost"}`}
                          type="button"
                          aria-pressed={isLinked}
                          onClick={() => toggleLink(product.id)}
                        >
                          {isLinked ? "Linked" : "Link"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!filteredProducts.length ? (
                  <tr>
                    <td colSpan={3}>
                      <div className="empty-state" style={{ padding: 18 }}>
                        No products match that search yet.
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Modal>
  );
}
