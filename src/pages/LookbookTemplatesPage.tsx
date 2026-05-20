import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable } from "@/components/DataTable";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Modal } from "@/components/Modal";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsyncData } from "@/hooks/useAsyncData";
import { lookbookTemplateService } from "@/services/lookbookTemplateService";
import { supportService } from "@/services/supportService";
import type { LookbookTemplate, LookbookTemplateItem, Product, ProductBarcode } from "@/types/domain";
import { formatCurrency } from "@/utils/format";
import {
  deriveInventoryAvailable,
  getOrderUnitLabel,
  getProductFamilyName,
  getProductVariantLabel,
  resolveCasePackQuantity,
} from "@/utils/lookbook";

type TemplateEditor = {
  template: Partial<LookbookTemplate>;
  items: Array<Partial<LookbookTemplateItem>>;
};

function getPrimaryLinkedProduct(barcode: ProductBarcode) {
  return barcode.product_barcode_links?.find((link) => link.products)?.products ?? null;
}

function truncateLinkedSku(sku: string) {
  return sku.length > 12 ? `${sku.slice(0, 9)}...` : sku;
}

export function LookbookTemplatesPage() {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<TemplateEditor | null>(null);
  const [previewing, setPreviewing] = useState<TemplateEditor | null>(null);
  const [deleting, setDeleting] = useState<LookbookTemplate | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const { data, loading, error, reload } = useAsyncData(
    async () => ({
      templates: await lookbookTemplateService.list(),
      products: await supportService.listProducts(),
      barcodes: await supportService.listBarcodes(),
    }),
    [],
  );

  const filteredTemplates = useMemo(() => {
    if (!data) return [];
    return data.templates.filter((template) =>
      [template.name, template.description ?? ""].join(" ").toLowerCase().includes(query.toLowerCase()),
    );
  }, [data, query]);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load lookbook templates"} />;

  return (
    <div className="section-stack">
      {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}
      <PageHeader
        title="Lookbook Templates"
        description="Build reusable product assortments and assign them to buyer magic links."
        actions={<button className="btn btn-primary" onClick={() => setEditing({ template: { name: "", is_active: true }, items: [] })}>Create Template</button>}
      />
      <div className="panel">
        <div className="filter-row">
          <input placeholder="Search template name or description" value={query} onChange={(event) => setQuery(event.target.value)} />
          <button className="btn btn-secondary" onClick={() => void reload()}>Refresh</button>
        </div>
      </div>
      <DataTable
        emptyMessage="No lookbook templates yet."
        columns={[
          {
            key: "name",
            title: "Template",
            render: (row) => (
              <div className="cell-stack">
                <strong>{row.name}</strong>
                <span className="helper-text">{row.description ?? "No description"}</span>
              </div>
            ),
          },
          { key: "status", title: "Status", render: (row) => <StatusBadge label={row.is_active ? "Active" : "Inactive"} /> },
          { key: "items", title: "SKUs", render: (row) => row.items.length },
          { key: "featured", title: "Featured", render: (row) => row.items.filter((item) => item.featured).length },
          {
            key: "actions",
            title: "Actions",
            render: (row) => (
              <div className="btn-row">
                <button className="btn btn-ghost btn-small" onClick={() => setPreviewing({ template: row, items: row.items })}>Preview</button>
                <button className="btn btn-secondary btn-small" onClick={() => setEditing({ template: row, items: row.items })}>Edit</button>
                <button className="btn btn-danger btn-small" onClick={() => setDeleting(row)}>Delete</button>
              </div>
            ),
          },
        ]}
        rows={filteredTemplates}
      />
      {editing ? (
        <LookbookTemplateEditor
          initialValue={editing}
          products={data.products}
          barcodes={data.barcodes}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await reload();
            setNotice({ tone: "success", message: editing.template.id ? "Template updated successfully." : "Template created successfully." });
          }}
        />
      ) : null}
      {previewing ? (
        <LookbookTemplatePreview preview={previewing} products={data.products} onClose={() => setPreviewing(null)} />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title="Delete lookbook template?"
          message={`This will remove ${deleting.name} and its product assortment.`}
          busy={false}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await lookbookTemplateService.remove(deleting.id);
            setDeleting(null);
            await reload();
            setNotice({ tone: "success", message: "Template deleted successfully." });
          }}
        />
      ) : null}
    </div>
  );
}

function LookbookTemplatePreview({
  preview,
  products,
  onClose,
}: {
  preview: TemplateEditor;
  products: Product[];
  onClose: () => void;
}) {
  const previewProducts = [...preview.items]
    .sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0))
    .map((item) => ({
      item,
      product: products.find((entry) => entry.id === item.product_id) ?? item.products ?? null,
    }))
    .filter((entry): entry is { item: Partial<LookbookTemplateItem>; product: Product } => Boolean(entry.product));

  return (
    <Modal
      title={`Preview | ${preview.template.name ?? "Lookbook Template"}`}
      onClose={onClose}
      actions={<button className="btn btn-ghost" onClick={onClose}>Close</button>}
    >
      <div className="lookbook-shell" style={{ padding: 0, background: "transparent", minHeight: "auto" }}>
        <div className="lookbook-hero" style={{ marginBottom: 18 }}>
          <div>
            <p className="lookbook-kicker">Preview mode</p>
            <h1>{preview.template.name ?? "Lookbook Template"}</h1>
            <span>{preview.template.description ?? "Read-only preview of the assigned buyer experience."}</span>
          </div>
        </div>
        {!previewProducts.length ? (
          <div className="empty-state">No products selected for this template yet.</div>
        ) : (
          <div className="lookbook-grid">
            {previewProducts.map(({ item, product }) => (
              <article key={`${product.id}-${item.sort_order ?? 0}`} className="lookbook-card">
                <div className="lookbook-card-media">
                  {product.image_url ? <img src={product.image_url} alt={getProductFamilyName(product)} /> : <span>{product.sku.slice(0, 2)}</span>}
                </div>
                <div className="lookbook-card-body">
                  <div className="lookbook-card-topline">
                    <strong className="lookbook-card-title">{getProductFamilyName(product)}</strong>
                    <div className="lookbook-card-badge-row">
                      <span className="lookbook-card-sku">{getProductVariantLabel(product)} | {product.sku}</span>
                      {item.featured ? <StatusBadge label="Featured" /> : null}
                    </div>
                  </div>
                  <p className="lookbook-card-copy">SKU {product.sku} | UPC {product.upc ?? "Pending"}</p>
                  <p className="lookbook-card-copy">Pack {product.pack_size ?? "1 Pack"} | {resolveCasePackQuantity(product)} {getOrderUnitLabel(product)}/case</p>
                  <p className="lookbook-card-copy">{product.weight ?? "Weight TBD"} | {product.dimensions ?? "Dimensions TBD"}</p>
                  <div className="lookbook-price-row">
                    <div><span>Wholesale</span><strong>{formatCurrency(product.wholesale_price)}</strong></div>
                    <div><span>MSRP</span><strong>{formatCurrency(product.msrp)}</strong></div>
                  </div>
                  <div className="lookbook-card-footer">
                    <span>{deriveInventoryAvailable(product)} {getOrderUnitLabel(product)} available</span>
                    <span>{product.compliance_docs_status === "Missing" ? "Compliance docs missing" : "Compliance ready"}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function LookbookTemplateEditor({
  initialValue,
  products,
  barcodes,
  onClose,
  onSaved,
}: {
  initialValue: TemplateEditor;
  products: Product[];
  barcodes: ProductBarcode[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [template, setTemplate] = useState<Partial<LookbookTemplate>>({
    id: initialValue.template.id,
    name: initialValue.template.name ?? "",
    description: initialValue.template.description ?? "",
    is_active: initialValue.template.is_active ?? true,
  });
  const [items, setItems] = useState<Array<Partial<LookbookTemplateItem>>>(initialValue.items);
  const [search, setSearch] = useState("");

  const selectedIds = new Set(items.map((item) => item.product_id).filter(Boolean));
  const filteredBarcodes = [...barcodes]
    .sort((left, right) => {
      const productComparison = left.product_name.localeCompare(right.product_name);
      if (productComparison !== 0) return productComparison;
      return left.sku.localeCompare(right.sku);
    })
    .filter((barcode) => {
      const linkedProducts = (barcode.product_barcode_links ?? [])
        .map((link) => link.products)
        .filter((product): product is Product => Boolean(product));
      return [
        barcode.product_name,
        barcode.sku,
        barcode.handle ?? "",
        barcode.collection ?? "",
        barcode.barcode_upc ?? "",
        barcode.size ?? "",
        ...linkedProducts.flatMap((product) => [
          product.name,
          product.sku,
          product.category ?? "",
          product.variant_title ?? "",
          product.parent_products?.name ?? "",
        ]),
      ].join(" ").toLowerCase().includes(search.toLowerCase());
    });

  return (
    <div className="modal-backdrop">
      <div className="modal-shell" style={{ width: "min(1100px, 100%)" }}>
        <div className="panel-header">
          <div>
            <h2>{template.id ? "Edit Lookbook Template" : "Create Lookbook Template"}</h2>
            <p className="modal-message">Choose exactly which products appear for buyers assigned to this template.</p>
          </div>
          <div className="btn-row">
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={async () => {
                if (!String(template.name ?? "").trim()) throw new Error("Template name is required.");
                await lookbookTemplateService.upsert(template, items);
                await onSaved();
                onClose();
              }}
            >
              Save Template
            </button>
          </div>
        </div>
        <div className="form-grid" style={{ marginTop: 16 }}>
          <div className="field">
            <label>Name</label>
            <input value={String(template.name ?? "")} onChange={(event) => setTemplate((current) => ({ ...current, name: event.target.value }))} />
          </div>
          <div className="field">
            <label>Status</label>
            <select value={template.is_active ? "active" : "inactive"} onChange={(event) => setTemplate((current) => ({ ...current, is_active: event.target.value === "active" }))}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="field field-wide">
            <label>Description</label>
            <textarea rows={3} value={String(template.description ?? "")} onChange={(event) => setTemplate((current) => ({ ...current, description: event.target.value }))} />
          </div>
        </div>
        <div className="split-grid" style={{ marginTop: 18 }}>
          <div className="panel section-stack">
            <div className="panel-header"><h3>Catalog</h3></div>
            <div className="filter-row">
              <input placeholder="Search barcode catalog" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <DataTable
              emptyMessage="No barcode rows match this search."
              columns={[
                {
                  key: "add",
                  title: "Add",
                  render: (row) => {
                    const linkedProduct = getPrimaryLinkedProduct(row);
                    const isAdded = linkedProduct ? selectedIds.has(linkedProduct.id) : false;
                    return (
                      <button
                        className="btn btn-secondary btn-small"
                        disabled={!linkedProduct || isAdded}
                        onClick={() => {
                          if (!linkedProduct) return;
                          setItems((current) => [
                            ...current,
                            {
                              product_id: linkedProduct.id,
                              sort_order: current.length,
                              featured: false,
                            },
                          ]);
                        }}
                      >
                        {!linkedProduct ? "Unlinked" : isAdded ? "Added" : "Add"}
                      </button>
                    );
                  },
                },
                {
                  key: "link",
                  title: "Shopify Link",
                  render: (row) => {
                    const linkedProduct = getPrimaryLinkedProduct(row);
                    return linkedProduct ? (
                      <div className="cell-stack">
                        <StatusBadge label="Linked" />
                        <span className="helper-text" title={linkedProduct.sku}>{truncateLinkedSku(linkedProduct.sku)}</span>
                      </div>
                    ) : (
                      <div className="cell-stack">
                        <StatusBadge label="Warning" />
                        <span className="helper-text">Not linked to a Shopify product.</span>
                      </div>
                    );
                  },
                },
                {
                  key: "image",
                  title: "Image",
                  render: (row) => {
                    const linkedProduct = getPrimaryLinkedProduct(row);
                    return (
                      <div className="product-thumb-shell">
                        {linkedProduct?.image_url ? (
                          <img className="product-thumb" src={linkedProduct.image_url} alt={getProductFamilyName(linkedProduct)} />
                        ) : (
                          <span className="product-thumb-fallback">{row.sku.slice(0, 2)}</span>
                        )}
                      </div>
                    );
                  },
                },
                { key: "sku", title: "SKU", render: (row) => row.sku },
                {
                  key: "name",
                  title: "Barcode Product",
                  render: (row) => (
                    <div className="cell-stack">
                      <strong>{row.product_name}</strong>
                      <span className="helper-text">
                        UPC {row.barcode_upc ?? "Pending"}{row.size ? ` | ${row.size}` : ""}{row.handle ? ` | ${row.handle}` : ""}
                      </span>
                    </div>
                  ),
                },
                { key: "collection", title: "Collection", render: (row) => row.collection ?? "N/A" },
              ]}
              rows={filteredBarcodes}
            />
          </div>
          <div className="panel section-stack">
            <div className="panel-header"><h3>Template Assortment</h3></div>
            {items.length ? (
              <div className="timeline">
                {[...items]
                  .sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0))
                  .map((item, index) => {
                  const product = products.find((entry) => entry.id === item.product_id);
                  return (
                    <div key={`${item.product_id}-${index}`} className="detail-card">
                      <div className="panel-header">
                        <div className="inventory-product-cell">
                          <div className="product-thumb-shell">
                            {product?.image_url ? (
                              <img className="product-thumb" src={product.image_url} alt={getProductFamilyName(product)} />
                            ) : (
                              <span className="product-thumb-fallback">{product?.sku?.slice(0, 2) ?? "NA"}</span>
                            )}
                          </div>
                          <div>
                            <strong>{product ? getProductFamilyName(product) : "Unknown product"}</strong>
                            <p className="helper-text">
                              {product ? `${getProductVariantLabel(product)} | ${product.sku}` : "SKU missing"}
                            </p>
                          </div>
                        </div>
                        <button
                          className="btn btn-danger btn-small"
                          onClick={() => setItems((current) => current.filter((entry) => entry.product_id !== item.product_id))}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="form-grid" style={{ marginTop: 12 }}>
                        <div className="field">
                          <label>Sort Order</label>
                          <input
                            type="number"
                            value={String(item.sort_order ?? index)}
                            onChange={(event) =>
                              setItems((current) =>
                                current.map((entry) =>
                                  entry.product_id === item.product_id
                                    ? { ...entry, sort_order: Number(event.target.value) }
                                    : entry,
                                ),
                              )
                            }
                          />
                        </div>
                        <div className="field">
                          <label>Featured</label>
                          <select
                            value={item.featured ? "yes" : "no"}
                            onChange={(event) =>
                              setItems((current) =>
                                current.map((entry) =>
                                  entry.product_id === item.product_id
                                    ? { ...entry, featured: event.target.value === "yes" }
                                    : entry,
                                ),
                              )
                            }
                          >
                            <option value="no">No</option>
                            <option value="yes">Yes</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">No products selected for this template yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
