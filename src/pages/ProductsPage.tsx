import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable } from "@/components/DataTable";
import { EntityFormModal } from "@/components/EntityFormModal";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Modal } from "@/components/Modal";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader } from "@/components/PageHeader";
import { useAsyncData } from "@/hooks/useAsyncData";
import { shopifyService } from "@/services/shopifyService";
import { supportService } from "@/services/supportService";
import { vendorService } from "@/services/vendorService";
import type { Product } from "@/types/domain";
import { formatCurrency } from "@/utils/format";

type ProductFormValues = Partial<Product> & {
  starting_inventory?: number;
};

export function ProductsPage() {
  const [editing, setEditing] = useState<ProductFormValues | null>(null);
  const [viewing, setViewing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("name");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const { data, loading, error, reload } = useAsyncData(
    async () => ({
      products: await supportService.listProducts(),
      vendors: await vendorService.list(),
    }),
    [],
  );

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load products"} />;

  const categories = [...new Set(data.products.map((product) => product.category).filter(Boolean))] as string[];
  const filteredProducts = data.products
    .filter((product) => {
      const query = search.trim().toLowerCase();
      const matchesSearch =
        !query ||
        product.name.toLowerCase().includes(query) ||
        product.sku.toLowerCase().includes(query) ||
        (product.description ?? "").toLowerCase().includes(query) ||
        (product.vendors?.name ?? "").toLowerCase().includes(query);
      const matchesCategory = !category || product.category === category;
      return matchesSearch && matchesCategory;
    })
    .sort((left, right) => {
      if (sort === "inventory") return right.current_inventory - left.current_inventory;
      if (sort === "price") return right.unit_price - left.unit_price;
      return left.name.localeCompare(right.name);
    });

  return (
    <div className="section-stack">
      <PageHeader
        title="Products"
        description="Maintain SKUs, pricing, vendor ownership, and inventory-linked product metadata. Safety stock is auto-calculated from usage velocity and vendor lead time."
        actions={
          <div className="btn-row">
            <button
              className="btn btn-secondary"
              disabled={syncingAll}
              onClick={async () => {
                try {
                  setSyncingAll(true);
                  const result = await shopifyService.syncAllProducts();
                  await reload();
                  setNotice({
                    tone: "success",
                    message: `Shopify sync completed. ${result.productsSynced ?? 0} products, ${result.inventoryRecordsSynced ?? 0} inventory records, and ${result.usageEventsSynced ?? 0} usage events updated.`,
                  });
                } catch (err) {
                  setNotice({ tone: "error", message: err instanceof Error ? err.message : "Shopify sync failed." });
                } finally {
                  setSyncingAll(false);
                }
              }}
            >
              {syncingAll ? "Syncing Shopify..." : "Sync All Shopify"}
            </button>
            <button className="btn btn-primary" onClick={() => setEditing({ sku: "", name: "" })}>Add New Product</button>
          </div>
        }
      />
      {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}
      {syncingAll ? (
        <div className="panel section-stack">
          <div className="panel-header">
            <h3>Shopify Sync In Progress</h3>
          </div>
          <div className="sync-progress-shell" aria-live="polite" aria-busy="true">
            <div className="sync-progress-bar" />
          </div>
          <p className="muted">Pulling products and inventory from Shopify. This can take a moment for larger catalogs.</p>
        </div>
      ) : null}
      <div className="panel">
        <div className="filter-row">
          <input
            placeholder="Search SKU, product, vendor, description"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">All categories</option>
            {categories.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="name">Sort by name</option>
            <option value="inventory">Sort by inventory</option>
            <option value="price">Sort by price</option>
          </select>
          <button className="btn btn-secondary" onClick={() => void reload()}>
            Refresh
          </button>
        </div>
      </div>
      <DataTable
        emptyMessage="No products yet. Add your first product to start managing catalog and inventory links."
        columns={[
          { key: "sku", title: "SKU", render: (row) => <span className="table-link">{row.sku}</span> },
          {
            key: "name",
            title: "Product",
            render: (row) => (
              <div className="cell-stack">
                <strong>{row.name}</strong>
                <span className="helper-text">{row.category ?? "Uncategorized"}</span>
              </div>
            ),
          },
          { key: "vendor", title: "Vendor", render: (row) => row.vendors?.name ?? "Unassigned" },
          {
            key: "shopify",
            title: "Shopify",
            render: (row) =>
              row.shopify_storefront_url ? (
                <a href={row.shopify_storefront_url} target="_blank" rel="noreferrer">
                  {row.is_shopify_synced ? "Linked" : "Draft link"}
                </a>
              ) : (
                "Not linked"
              ),
          },
          { key: "unit_cost", title: "Unit Cost", render: (row) => formatCurrency(row.unit_cost) },
          { key: "unit_price", title: "Unit Price", render: (row) => formatCurrency(row.unit_price ?? 0) },
          { key: "current_inventory", title: "Inventory", render: (row) => row.current_inventory },
          { key: "safety_stock", title: "Safety Stock", render: (row) => `${row.safety_stock} auto` },
          {
            key: "actions",
            title: "Actions",
            render: (row) => (
              <div className="btn-row">
                <button className="btn btn-ghost btn-small" onClick={() => setViewing(row)}>
                  View Details
                </button>
                <button
                  className="btn btn-ghost btn-small"
                  onClick={async () => {
                    try {
                      const result = await shopifyService.syncProduct(row);
                      await reload();
                      setNotice({
                        tone: "success",
                        message: `${row.name} synced with Shopify inventory and ${result.usageEventsSynced ?? 0} recent usage events.`,
                      });
                    } catch (err) {
                      setNotice({ tone: "error", message: err instanceof Error ? err.message : "Failed to sync Shopify metadata." });
                    }
                  }}
                >
                  Sync Shopify
                </button>
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
        rows={filteredProducts}
      />
      {editing ? (
        <EntityFormModal<ProductFormValues>
          title={editing.id ? "Edit Product" : "Add Product"}
          saveLabel={editing.id ? "Save Changes" : "Create Product"}
          initialValues={{
            sku: editing.sku ?? "",
            name: editing.name ?? "",
            category: editing.category ?? "",
            description: editing.description ?? "",
            vendor_id: editing.vendor_id ?? "",
            unit_cost: editing.unit_cost ?? 0,
            unit_price: editing.unit_price ?? 0,
            safety_stock: editing.safety_stock ?? 0,
            ancillary_category: editing.ancillary_category ?? "",
            shopify_handle: editing.shopify_handle ?? "",
            shopify_storefront_url: editing.shopify_storefront_url ?? "",
            shopify_admin_url: editing.shopify_admin_url ?? "",
            starting_inventory: editing.id ? undefined : 0,
          }}
          fields={[
            { key: "sku", label: "SKU", required: true },
            { key: "name", label: "Name", required: true },
            { key: "category", label: "Category" },
            { key: "vendor_id", label: "Primary Vendor", type: "select", options: data.vendors.map((vendor) => ({ label: vendor.name, value: vendor.id })) },
            { key: "unit_cost", label: "Unit Cost", type: "number", min: 0, step: 0.01 },
            { key: "unit_price", label: "Unit Price", type: "number", min: 0, step: 0.01 },
            { key: "ancillary_category", label: "Ancillary Category" },
            { key: "shopify_handle", label: "Shopify Handle" },
            { key: "shopify_storefront_url", label: "Shopify Storefront URL" },
            { key: "shopify_admin_url", label: "Shopify Admin URL" },
            ...(editing.id ? [] : [{ key: "starting_inventory" as const, label: "Starting Inventory", type: "number" as const, step: 1 }]),
            { key: "description", label: "Description", type: "textarea" },
          ]}
          onSave={async (values) => {
            if (!String(values.sku ?? "").trim()) throw new Error("SKU is required.");
            if (!String(values.name ?? "").trim()) throw new Error("Product name is required.");
            await supportService.saveProduct({
              ...editing,
              ...values,
              vendor_id: values.vendor_id ? String(values.vendor_id) : null,
              category: values.category ? String(values.category) : null,
              description: values.description ? String(values.description) : null,
              ancillary_category: values.ancillary_category ? String(values.ancillary_category) : null,
              shopify_handle: values.shopify_handle ? String(values.shopify_handle) : null,
              shopify_storefront_url: values.shopify_storefront_url ? String(values.shopify_storefront_url) : null,
              shopify_admin_url: values.shopify_admin_url ? String(values.shopify_admin_url) : null,
              current_inventory: editing.id ? editing.current_inventory : Number(values.starting_inventory ?? 0),
            });
            await reload();
            setNotice({
              tone: "success",
              message: editing.id
                ? "Product updated successfully. Inventory stays managed from Inventory records."
                : "Product created successfully.",
            });
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {viewing ? (
        <Modal
          title={`Product ${viewing.sku}`}
          onClose={() => setViewing(null)}
          actions={<button className="btn btn-ghost" onClick={() => setViewing(null)}>Cancel</button>}
        >
          <div className="detail-grid">
            <div className="detail-card"><span>Name</span><strong>{viewing.name}</strong></div>
            <div className="detail-card"><span>Vendor</span><strong>{viewing.vendors?.name ?? "Unassigned"}</strong></div>
            <div className="detail-card"><span>Category</span><strong>{viewing.category ?? "Uncategorized"}</strong></div>
            <div className="detail-card"><span>Inventory</span><strong>{viewing.current_inventory}</strong></div>
            <div className="detail-card"><span>Unit Cost</span><strong>{formatCurrency(viewing.unit_cost)}</strong></div>
            <div className="detail-card"><span>Unit Price</span><strong>{formatCurrency(viewing.unit_price ?? 0)}</strong></div>
            <div className="detail-card"><span>Safety Stock</span><strong>{viewing.safety_stock} (auto-calculated)</strong></div>
            <div className="detail-card"><span>Shopify Sync</span><strong>{viewing.is_shopify_synced ? "Synced" : "Not synced"}</strong></div>
            <div className="detail-card"><span>Updated</span><strong>{new Date(viewing.updated_at).toLocaleString()}</strong></div>
            <div className="detail-card"><span>Storefront</span><strong>{viewing.shopify_storefront_url ? <a href={viewing.shopify_storefront_url} target="_blank" rel="noreferrer">Open product</a> : "N/A"}</strong></div>
            <div className="detail-card"><span>Admin</span><strong>{viewing.shopify_admin_url ? <a href={viewing.shopify_admin_url} target="_blank" rel="noreferrer">Open admin</a> : "N/A"}</strong></div>
            <div className="detail-card" style={{ gridColumn: "1 / -1" }}><span>Description</span><strong>{viewing.description ?? "No description added."}</strong></div>
            <div className="detail-card" style={{ gridColumn: "1 / -1" }}><span>Safety Stock Logic</span><strong>Calculated from inventory usage history plus vendor lead time, with an extra variability buffer.</strong></div>
            <div className="detail-card" style={{ gridColumn: "1 / -1" }}><span>Inventory Source</span><strong>Inventory is derived from Inventory records by location, not edited directly on the product.</strong></div>
          </div>
        </Modal>
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title="Delete product?"
          message={`This will permanently remove ${deleting.name}. Continue only if you no longer need this SKU in the system.`}
          busy={busyDelete}
          onClose={() => {
            if (!busyDelete) setDeleting(null);
          }}
          onConfirm={async () => {
            try {
              setBusyDelete(true);
              await supportService.deleteProduct(deleting.id);
              setDeleting(null);
              await reload();
              setNotice({ tone: "success", message: "Product deleted successfully." });
            } catch (err) {
              setNotice({ tone: "error", message: err instanceof Error ? err.message : "Failed to delete product." });
            } finally {
              setBusyDelete(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}
