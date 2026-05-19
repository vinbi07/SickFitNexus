import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable } from "@/components/DataTable";
import { EntityFormModal } from "@/components/EntityFormModal";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Modal } from "@/components/Modal";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsyncData } from "@/hooks/useAsyncData";
import { shopifyService } from "@/services/shopifyService";
import { supportService } from "@/services/supportService";
import { vendorService } from "@/services/vendorService";
import type { Product } from "@/types/domain";
import { formatCurrency } from "@/utils/format";
import { getProductFamilyName, getProductVariantLabel } from "@/utils/lookbook";
import { getMarginMetrics, isInventoryDanger } from "@/utils/operations";

type ProductFormValues = Partial<Product> & {
  starting_inventory?: number;
  compliance_docs_required_input?: string;
};

export function ProductsPage() {
  const [editing, setEditing] = useState<ProductFormValues | null>(null);
  const [viewing, setViewing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [bundleFilter, setBundleFilter] = useState("");
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
  const parentCandidates = data.products.filter((product) => !product.parent_product_id);
  const filteredProducts = data.products
    .filter((product) => {
      const query = search.trim().toLowerCase();
      const matchesSearch =
        !query ||
        product.name.toLowerCase().includes(query) ||
        getProductFamilyName(product).toLowerCase().includes(query) ||
        getProductVariantLabel(product).toLowerCase().includes(query) ||
        product.sku.toLowerCase().includes(query) ||
        (product.description ?? "").toLowerCase().includes(query) ||
        (product.vendors?.name ?? "").toLowerCase().includes(query);
      const matchesCategory = !category || product.category === category;
      const matchesBundles =
        !bundleFilter ||
        (bundleFilter === "no-bundles" && product.no_bundles) ||
        (bundleFilter === "bundles-ok" && !product.no_bundles);
      return matchesSearch && matchesCategory && matchesBundles;
    })
    .sort((left, right) => {
      if (sort === "inventory") return right.current_inventory - left.current_inventory;
      if (sort === "margin") return getMarginMetrics(right.unit_cost, right.unit_price).marginPercent - getMarginMetrics(left.unit_cost, left.unit_price).marginPercent;
      return left.name.localeCompare(right.name);
    });

  return (
    <div className="section-stack">
      <PageHeader
        title="Products"
        description="Maintain wholesale-ready products with reusable images, pricing, COGS, margins, inventory danger visibility, and bundle eligibility."
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
            <button className="btn btn-primary" onClick={() => setEditing({ sku: "", name: "", image_url: "", no_bundles: false })}>Add New Product</button>
          </div>
        }
      />
      {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}
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
          <select value={bundleFilter} onChange={(event) => setBundleFilter(event.target.value)}>
            <option value="">All bundle states</option>
            <option value="no-bundles">No Bundles</option>
            <option value="bundles-ok">Bundles Allowed</option>
          </select>
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="name">Sort by name</option>
            <option value="inventory">Sort by inventory</option>
            <option value="margin">Sort by margin</option>
          </select>
          <button className="btn btn-secondary" onClick={() => void reload()}>
            Refresh
          </button>
        </div>
      </div>
      <DataTable
        emptyMessage="No products yet. Add your first product to start managing catalog and inventory links."
        columns={[
          {
            key: "image",
            title: "Image",
            render: (row) => (
              <div className="product-thumb-shell">
                {row.image_url ? <img className="product-thumb" src={row.image_url} alt={row.name} /> : <span className="product-thumb-fallback">{row.sku.slice(0, 2)}</span>}
              </div>
            ),
          },
          { key: "sku", title: "SKU", render: (row) => <span className="table-link">{row.sku}</span> },
          {
            key: "name",
            title: "Product",
            render: (row) => (
              <div className="cell-stack">
                <strong>{getProductFamilyName(row)}</strong>
                <span className="helper-text">
                  {getProductVariantLabel(row)}{row.category ? ` | ${row.category}` : ""}
                </span>
              </div>
            ),
          },
          { key: "variant", title: "Variant", render: (row) => getProductVariantLabel(row) },
          { key: "vendor", title: "Vendor", render: (row) => row.vendors?.name ?? "Unassigned" },
          { key: "cogs", title: "COGS", render: (row) => formatCurrency(row.unit_cost) },
          { key: "unit_price", title: "Price", render: (row) => formatCurrency(row.unit_price ?? 0) },
          {
            key: "margin",
            title: "Margin",
            render: (row) => {
              const margin = getMarginMetrics(row.unit_cost, row.unit_price);
              return `${formatCurrency(margin.marginDollars)} | ${margin.marginPercent.toFixed(0)}%`;
            },
          },
          { key: "inventory", title: "Inventory", render: (row) => row.current_inventory },
          { key: "danger", title: "Health", render: (row) => <StatusBadge label={isInventoryDanger(row.current_inventory) ? "Danger" : "Healthy"} /> },
          { key: "no_bundles", title: "No Bundles", render: (row) => row.no_bundles ? <StatusBadge label="No Bundles" /> : "Allowed" },
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
            parent_product_id: editing.parent_product_id ?? "",
            variant_title: editing.variant_title ?? "",
            variant_sort_order: editing.variant_sort_order ?? 0,
            category: editing.category ?? "",
            description: editing.description ?? "",
            vendor_id: editing.vendor_id ?? "",
            unit_cost: editing.unit_cost ?? 0,
            unit_price: editing.unit_price ?? 0,
            pack_size: editing.pack_size ?? "",
            case_pack_quantity: editing.case_pack_quantity ?? 1,
            wholesale_price: editing.wholesale_price ?? 0,
            msrp: editing.msrp ?? 0,
            upc: editing.upc ?? "",
            weight: editing.weight ?? "",
            dimensions: editing.dimensions ?? "",
            compliance_docs_required_input: (editing.compliance_docs_required ?? []).join(", "),
            compliance_docs_status: editing.compliance_docs_status ?? "Ready",
            inventory_allocated: editing.inventory_allocated ?? 0,
            safety_stock: editing.safety_stock ?? 0,
            image_url: editing.image_url ?? "",
            no_bundles: editing.no_bundles ?? false,
            shopify_handle: editing.shopify_handle ?? "",
            shopify_storefront_url: editing.shopify_storefront_url ?? "",
            shopify_admin_url: editing.shopify_admin_url ?? "",
            starting_inventory: editing.id ? undefined : 0,
          }}
          fields={[
            { key: "sku", label: "SKU", required: true },
            { key: "name", label: "Name", required: true },
            { key: "parent_product_id", label: "Parent Style", type: "select", options: parentCandidates.filter((product) => product.id !== editing.id).map((product) => ({ label: `${product.name} (${product.sku})`, value: product.id })) },
            { key: "variant_title", label: "Variant Title" },
            { key: "variant_sort_order", label: "Variant Sort Order", type: "number", min: 0, step: 1 },
            { key: "category", label: "Category" },
            { key: "vendor_id", label: "Primary Vendor", type: "select", options: data.vendors.map((vendor) => ({ label: vendor.name, value: vendor.id })) },
            { key: "unit_cost", label: "COGS", type: "number", min: 0, step: 0.01 },
            { key: "unit_price", label: "Unit Price", type: "number", min: 0, step: 0.01 },
            { key: "wholesale_price", label: "Wholesale Price", type: "number", min: 0, step: 0.01 },
            { key: "msrp", label: "MSRP", type: "number", min: 0, step: 0.01 },
            { key: "upc", label: "UPC" },
            { key: "pack_size", label: "Pack Size" },
            { key: "case_pack_quantity", label: "Case Pack Quantity", type: "number", min: 1, step: 1 },
            { key: "weight", label: "Weight" },
            { key: "dimensions", label: "Dimensions" },
            { key: "compliance_docs_required_input", label: "Compliance Docs", type: "textarea" },
            { key: "compliance_docs_status", label: "Compliance Status", type: "select", options: [{ label: "Ready", value: "Ready" }, { label: "Missing", value: "Missing" }, { label: "Pending", value: "Pending" }] },
            { key: "image_url", label: "Image URL" },
            { key: "no_bundles", label: "No Bundles", type: "checkbox" },
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
              parent_product_id: values.parent_product_id ? String(values.parent_product_id) : null,
              variant_title: values.variant_title ? String(values.variant_title) : null,
              variant_sort_order: Number(values.variant_sort_order ?? 0),
              category: values.category ? String(values.category) : null,
              description: values.description ? String(values.description) : null,
              upc: values.upc ? String(values.upc) : null,
              pack_size: values.pack_size ? String(values.pack_size) : null,
              case_pack_quantity: Math.max(Number(values.case_pack_quantity ?? 1), 1),
              wholesale_price: Number(values.wholesale_price ?? 0),
              msrp: Number(values.msrp ?? 0),
              weight: values.weight ? String(values.weight) : null,
              dimensions: values.dimensions ? String(values.dimensions) : null,
              compliance_docs_required: String(values.compliance_docs_required_input ?? "")
                .split(",")
                .map((entry) => entry.trim())
                .filter(Boolean),
              compliance_docs_status: values.compliance_docs_status ? String(values.compliance_docs_status) : null,
              image_url: values.image_url ? String(values.image_url) : null,
              no_bundles: Boolean(values.no_bundles),
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
            <div className="detail-card"><span>Parent Style</span><strong>{viewing.parent_products?.name ?? "Standalone / base style"}</strong></div>
            <div className="detail-card"><span>Variant</span><strong>{getProductVariantLabel(viewing)}</strong></div>
            <div className="detail-card"><span>Vendor</span><strong>{viewing.vendors?.name ?? "Unassigned"}</strong></div>
            <div className="detail-card"><span>Category</span><strong>{viewing.category ?? "Uncategorized"}</strong></div>
            <div className="detail-card"><span>Inventory</span><strong className={isInventoryDanger(viewing.current_inventory) ? "danger-text" : ""}>{viewing.current_inventory}</strong></div>
            <div className="detail-card"><span>COGS</span><strong>{formatCurrency(viewing.unit_cost)}</strong></div>
            <div className="detail-card"><span>Unit Price</span><strong>{formatCurrency(viewing.unit_price ?? 0)}</strong></div>
            <div className="detail-card"><span>Margin</span><strong>{getMarginMetrics(viewing.unit_cost, viewing.unit_price).marginPercent.toFixed(0)}%</strong></div>
            <div className="detail-card"><span>Wholesale</span><strong>{formatCurrency(viewing.wholesale_price ?? 0)}</strong></div>
            <div className="detail-card"><span>MSRP</span><strong>{formatCurrency(viewing.msrp ?? 0)}</strong></div>
            <div className="detail-card"><span>UPC</span><strong>{viewing.upc ?? "N/A"}</strong></div>
            <div className="detail-card"><span>Case Pack</span><strong>{viewing.case_pack_quantity}</strong></div>
            <div className="detail-card"><span>Pack Size</span><strong>{viewing.pack_size ?? "N/A"}</strong></div>
            <div className="detail-card"><span>Available</span><strong>{viewing.inventory_available ?? viewing.current_inventory}</strong></div>
            <div className="detail-card"><span>No Bundles</span><strong>{viewing.no_bundles ? "Yes" : "No"}</strong></div>
            <div className="detail-card"><span>Product Image</span><strong>{viewing.image_url ? <a href={viewing.image_url} target="_blank" rel="noreferrer">Open image</a> : "No image yet"}</strong></div>
            <div className="detail-card"><span>Compliance</span><strong>{viewing.compliance_docs_status ?? "N/A"}</strong></div>
            <div className="detail-card"><span>Shopify Sync</span><strong>{viewing.is_shopify_synced ? "Synced" : "Not synced"}</strong></div>
            <div className="detail-card"><span>Updated</span><strong>{new Date(viewing.updated_at).toLocaleString()}</strong></div>
            <div className="detail-card" style={{ gridColumn: "1 / -1" }}><span>Description</span><strong>{viewing.description ?? "No description added."}</strong></div>
            <div className="detail-card" style={{ gridColumn: "1 / -1" }}><span>Compliance Docs Required</span><strong>{viewing.compliance_docs_required?.length ? viewing.compliance_docs_required.join(", ") : "None"}</strong></div>
            {viewing.variants?.length ? (
              <div className="detail-card" style={{ gridColumn: "1 / -1" }}>
                <span>Linked Variants</span>
                <strong>{viewing.variants.map((variant) => `${getProductVariantLabel(variant)} (${variant.sku})`).join(", ")}</strong>
              </div>
            ) : null}
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
