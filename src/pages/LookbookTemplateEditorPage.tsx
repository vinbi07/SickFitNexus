import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DataTable } from "@/components/DataTable";
import { ErrorState } from "@/components/ErrorState";
import { InlineErrorLog } from "@/components/InlineErrorLog";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsyncData } from "@/hooks/useAsyncData";
import { lookbookTemplateService } from "@/services/lookbookTemplateService";
import { supportService } from "@/services/supportService";
import type { LookbookTemplate, LookbookTemplateItem, Product, ProductBarcode } from "@/types/domain";
import { getUiErrorLog, type UiErrorLog } from "@/utils/errors";
import { getProductFamilyName, getProductVariantLabel } from "@/utils/lookbook";

function getPrimaryLinkedProduct(barcode: ProductBarcode) {
  return barcode.product_barcode_links?.find((link) => link.products)?.products ?? null;
}

function truncateLinkedSku(sku: string) {
  return sku.length > 12 ? `${sku.slice(0, 9)}...` : sku;
}

export function LookbookTemplateEditorPage() {
  const params = useParams();
  const editId = params.id ?? "";
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<UiErrorLog | null>(null);

  const { data, loading, error: loadError } = useAsyncData(
    async () => ({
      template: editId ? await lookbookTemplateService.getById(editId) : null,
      products: await supportService.listProducts(),
      barcodes: await supportService.listBarcodes(),
    }),
    [editId],
  );

  const [template, setTemplate] = useState<Partial<LookbookTemplate> | null>(null);
  const [items, setItems] = useState<Array<Partial<LookbookTemplateItem>>>([]);
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  if (loading) return <LoadingState />;
  if (loadError || !data) return <ErrorState message={loadError ?? "Unable to load this lookbook template"} />;

  if (hydratedFor !== editId) {
    setTemplate({
      id: data.template?.id,
      name: data.template?.name ?? "",
      description: data.template?.description ?? "",
      is_active: data.template?.is_active ?? true,
    });
    setItems(data.template?.items ?? []);
    setHydratedFor(editId);
    return <LoadingState />;
  }

  const selectedIds = new Set(items.map((item) => item.product_id).filter(Boolean));
  const filteredBarcodes = [...data.barcodes]
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
      ]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase());
    });

  const previewProducts = items
    .map((item) => data.products.find((product) => product.id === item.product_id))
    .filter((product): product is Product => Boolean(product));

  async function handleSave() {
    try {
      setSaving(true);
      setError(null);
      if (!String(template?.name ?? "").trim()) {
        throw new Error("Template name is required.");
      }
      await lookbookTemplateService.upsert(template ?? {}, items);
      navigate("/lookbook-templates", {
        state: {
          notice: {
            tone: "success",
            message: editId ? "Template updated successfully." : "Template created successfully.",
          },
        },
      });
    } catch (err) {
      setError(getUiErrorLog(err, "We couldn't save this lookbook template"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="section-stack">
      <PageHeader
        title={editId ? "Edit Lookbook Template" : "Create Lookbook Template"}
        description="Choose exactly which products appear for buyers assigned to this template."
        actions={
          <div className="btn-row">
            <button className="btn btn-ghost" onClick={() => navigate("/lookbook-templates")} disabled={saving}>
              Cancel
            </button>
            <button
              className="btn btn-secondary"
              onClick={() =>
                navigate("/lookbook-templates/preview", {
                  state: { products: previewProducts, title: template?.name, description: template?.description },
                })
              }
            >
              Preview
            </button>
            <button className="btn btn-primary" disabled={saving} onClick={() => void handleSave()}>
              {saving ? "Saving..." : "Save Template"}
            </button>
          </div>
        }
      />
      {error ? <InlineErrorLog error={error} /> : null}
      <div className="panel">
        <div className="form-grid">
          <div className="field">
            <label>Name</label>
            <input
              value={String(template?.name ?? "")}
              onChange={(event) => setTemplate((current) => ({ ...current, name: event.target.value }))}
            />
          </div>
          <div className="field">
            <label>Status</label>
            <select
              value={template?.is_active ? "active" : "inactive"}
              onChange={(event) =>
                setTemplate((current) => ({ ...current, is_active: event.target.value === "active" }))
              }
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="field field-wide">
            <label>Description</label>
            <textarea
              rows={3}
              value={String(template?.description ?? "")}
              onChange={(event) => setTemplate((current) => ({ ...current, description: event.target.value }))}
            />
          </div>
        </div>
      </div>
      <div className="split-grid">
        <div className="panel section-stack">
          <div className="panel-header">
            <h3>Catalog</h3>
          </div>
          <div className="filter-row">
            <input
              placeholder="Search barcode catalog"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
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
                          { product_id: linkedProduct.id, sort_order: current.length, featured: false },
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
                      <span className="helper-text" title={linkedProduct.sku}>
                        {truncateLinkedSku(linkedProduct.sku)}
                      </span>
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
                        <img
                          className="product-thumb"
                          src={linkedProduct.image_url}
                          alt={getProductFamilyName(linkedProduct)}
                        />
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
                      UPC {row.barcode_upc ?? "Pending"}
                      {row.size ? ` | ${row.size}` : ""}
                      {row.handle ? ` | ${row.handle}` : ""}
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
          <div className="panel-header">
            <h3>Template Assortment</h3>
          </div>
          {items.length ? (
            <div className="timeline">
              {[...items]
                .sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0))
                .map((item, index) => {
                  const product = data.products.find((entry) => entry.id === item.product_id);
                  return (
                    <div key={`${item.product_id}-${index}`} className="detail-card">
                      <div className="panel-header">
                        <div className="inventory-product-cell">
                          <div className="product-thumb-shell">
                            {product?.image_url ? (
                              <img
                                className="product-thumb"
                                src={product.image_url}
                                alt={getProductFamilyName(product)}
                              />
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
                          onClick={() =>
                            setItems((current) => current.filter((entry) => entry.product_id !== item.product_id))
                          }
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
  );
}
