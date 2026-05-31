import { useRef, useState } from "react";
import Papa from "papaparse";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable } from "@/components/DataTable";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Modal } from "@/components/Modal";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader } from "@/components/PageHeader";
import { useAsyncData } from "@/hooks/useAsyncData";
import { supportService } from "@/services/supportService";
import { getUiErrorLog } from "@/utils/errors";
import type { Product, ProductBarcode, ProductBarcodeLink } from "@/types/domain";

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
  const [linkFilter, setLinkFilter] = useState("");
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

  const filteredBarcodes = data.barcodes.filter((barcode) => {
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
    const linkCount = barcode.product_barcode_links?.length ?? 0;
    const matchesLink =
      !linkFilter ||
      (linkFilter === "linked" && linkCount > 0) ||
      (linkFilter === "unlinked" && linkCount === 0);
    return matchesQuery && matchesLink;
  });

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
        message: `Imported ${result.importedCount} barcode rows into the staging catalog.`,
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
      <PageHeader
        title="Barcodes"
        description="Manage barcode-book staging records in a standalone catalog before linking them into products and lookbook workflows."
        actions={(
          <div className="btn-row">
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
            <button className="btn btn-secondary" disabled={importing} onClick={() => fileInputRef.current?.click()}>
              {importing ? "Importing CSV..." : "Import CSV"}
            </button>
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
              Add Barcode
            </button>
          </div>
        )}
      />
      {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}
      <div className="panel">
        <div className="filter-row">
          <input
            placeholder="Search SKU, handle, product, collection, barcode, or linked product"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select value={linkFilter} onChange={(event) => setLinkFilter(event.target.value)}>
            <option value="">All barcode rows</option>
            <option value="linked">Linked to products</option>
            <option value="unlinked">Unlinked</option>
          </select>
          <button className="btn btn-secondary" onClick={() => void reload()}>
            Refresh
          </button>
        </div>
      </div>
      <DataTable
        emptyMessage="No barcode rows yet. Import the barcode book CSV or add a record manually."
        columns={[
          {
            key: "product_name",
            title: "Barcode Product / SKU",
            render: (row) => (
              <div className="cell-stack">
                <strong>{row.product_name}</strong>
                <span className="helper-text">{row.sku}</span>
                <span className="helper-text">{row.handle ?? "No handle"}{row.collection ? ` | ${row.collection}` : ""}</span>
              </div>
            ),
          },
          { key: "barcode", title: "UPC", render: (row) => <span className="product-compact-cell">{row.barcode_upc ?? "Pending"}</span> },
          {
            key: "pack",
            title: "Pack / Size",
            render: (row) => (
              <div className="cell-stack">
                <strong>{row.pack_quantity ?? "?"} {row.pack_unit ?? "Unit"}</strong>
                <span className="helper-text">{row.size ?? "No size"}</span>
              </div>
            ),
          },
          {
            key: "linked_products",
            title: "Linked Products",
            render: (row) => (
              <div className="cell-stack">
                <strong>{row.product_barcode_links?.length ? `${row.product_barcode_links.length} linked` : "Unlinked"}</strong>
                <span className="helper-text">
                  {row.product_barcode_links?.length
                    ? row.product_barcode_links.slice(0, 3).map((link) => link.products?.sku ?? link.product_id).join(", ")
                    : "No products linked yet"}
                </span>
              </div>
            ),
          },
          {
            key: "actions",
            title: "Actions",
            render: (row) => (
              <div className="btn-row">
                <button className="btn btn-secondary btn-small" onClick={() => setEditing(row)}>
                  Edit
                </button>
                <button className="btn btn-danger btn-small" onClick={() => setDeleting(row)}>
                  Delete
                </button>
              </div>
            ),
          },
        ]}
        rows={filteredBarcodes}
      />
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

  return (
    <Modal
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
      <div className="form-grid">
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
          <input value={String(values.barcode_upc ?? "")} onChange={(event) => setValues((current) => ({ ...current, barcode_upc: event.target.value }))} />
        </div>
        <div className="field field-wide">
          <label>Linked Products</label>
          <div className="panel" style={{ padding: 14 }}>
            <div className="cell-stack">
              <strong>{selectedProducts.length ? `${selectedProducts.length} products linked` : "No products linked yet"}</strong>
              <span className="helper-text">
                {selectedProducts.length
                  ? selectedProducts
                      .slice(0, 4)
                      .map((product) => `${product.sku}${product.variant_title ? ` | ${product.variant_title}` : ""}`)
                      .join(", ")
                  : "Search below and attach one or more product variants."}
              </span>
            </div>
            <div className="filter-row" style={{ marginTop: 12 }}>
              <input
                placeholder="Search product name, SKU, variant, or UPC"
                value={productQuery}
                onChange={(event) => setProductQuery(event.target.value)}
              />
              <button
                className="btn btn-ghost btn-small"
                type="button"
                onClick={() => setValues((current) => ({ ...current, linked_product_ids: [] }))}
              >
                Clear Links
              </button>
            </div>
            <div className="table-shell" style={{ marginTop: 12 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Product</th>
                    <th>SKU</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => {
                    const isLinked = (values.linked_product_ids ?? []).includes(product.id);
                    return (
                      <tr key={product.id}>
                        <td>
                          <button
                            className={`btn btn-small ${isLinked ? "btn-secondary" : "btn-ghost"}`}
                            type="button"
                            onClick={() =>
                              setValues((current) => {
                                const selected = new Set(current.linked_product_ids ?? []);
                                if (selected.has(product.id)) {
                                  selected.delete(product.id);
                                } else {
                                  selected.add(product.id);
                                }
                                return { ...current, linked_product_ids: [...selected] };
                              })
                            }
                          >
                            {isLinked ? "Linked" : "Link Product"}
                          </button>
                        </td>
                        <td>
                          <div className="cell-stack">
                            <strong>{product.name}</strong>
                            <span className="helper-text">{product.variant_title ?? product.category ?? "Base product"}</span>
                          </div>
                        </td>
                        <td><span className="product-sku-cell">{product.sku}</span></td>
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
          </div>
        </div>
      </div>
    </Modal>
  );
}
