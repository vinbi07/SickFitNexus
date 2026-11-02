import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EntityFormModal } from "@/components/EntityFormModal";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Modal } from "@/components/Modal";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader, type PageHeaderAction } from "@/components/PageHeader";
import { FilterPopover } from "@/components/products/FilterPopover";
import { ProductFamilyTable } from "@/components/products/ProductFamilyTable";
import { latestShopifySync, ShopifySyncStatus } from "@/components/products/ShopifySyncStatus";
import { useReloadOnShopifySync, useShopifySync } from "@/context/ShopifySyncContext";
import { useAsyncData } from "@/hooks/useAsyncData";
import { assessProductBarcode, findDuplicateBarcodes, type BarcodeAssessment } from "@/utils/barcode";
import { inventoryService } from "@/services/inventoryService";
import { shopifyService } from "@/services/shopifyService";
import { supportService } from "@/services/supportService";
import { vendorService } from "@/services/vendorService";
import type { InventoryEvent, Product } from "@/types/domain";
import { formatCurrency } from "@/utils/format";
import {
  getProductFamilyName,
  getProductVariantLabel,
  getUnitsPerPack,
} from "@/utils/lookbook";
import { groupProductFamilies, isLowStockFamily, needsAttention, type ProductFamily } from "@/utils/productFamilies";
import {
  getInventoryHealthLabel,
  getMarginMetrics,
  getSockTypeFromName,
  isApparelProductName,
  isBundleProductName,
  isHiddenByDefaultProductName,
  isIgnoredProduct,
  isInventoryDanger,
  SOCK_TYPES,
} from "@/utils/operations";

type ProductFormValues = Partial<Product> & {
  starting_inventory?: number;
  compliance_docs_required_input?: string;
};

const NON_SOCK_FILTER_VALUE = "__non_sock__";

const BARCODE_FILTER_LABELS: Record<string, string> = {
  problems: "Barcode problems",
  unconfirmed: "Needs GS1 check",
  verified: "GS1 verified",
};

type ProductTab = "all" | "attention" | "low";

const SORT_LABELS: Record<string, string> = {
  name: "Name",
  inventory: "Inventory",
  margin: "Margin",
};

export function ProductsPage() {
  const [editing, setEditing] = useState<ProductFormValues | null>(null);
  const [viewing, setViewing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [busyBulkDelete, setBusyBulkDelete] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [bundlesOnly, setBundlesOnly] = useState(false);
  const [ignoredOnly, setIgnoredOnly] = useState(false);
  const [packSizeFilter, setPackSizeFilter] = useState("");
  const [sockTypeFilter, setSockTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [barcodeFilter, setBarcodeFilter] = useState("");
  const [showHiddenCategories, setShowHiddenCategories] = useState(false);
  const [showIgnoredProducts, setShowIgnoredProducts] = useState(false);
  const [sort, setSort] = useState("name");
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const navigate = useNavigate();
  const [tab, setTab] = useState<ProductTab>("all");
  const { data, loading, error, reload } = useAsyncData(
    async () => ({
      products: await supportService.listProducts(),
      vendors: await vendorService.list(),
      events: await inventoryService.listEvents(),
    }),
    [],
  );

  useReloadOnShopifySync(reload);
  const { running: shopifySyncing, syncNow: syncShopifyNow } = useShopifySync();

  // The product page sends "Edit" here as ?edit=<id>: open the form, then drop the param.
  const [searchParams, setSearchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  useEffect(() => {
    if (!editId || !data) return;
    const product = data.products.find((candidate) => candidate.id === editId);
    if (product) setEditing(product);
    setSearchParams((params) => {
      params.delete("edit");
      return params;
    }, { replace: true });
  }, [editId, data, setSearchParams]);

  if (loading) return <LoadingState />;
  if (error || !data)
    return <ErrorState message={error ?? "Unable to load products"} />;

  const eventsByProductId = new Map<string, InventoryEvent[]>();
  data.events.forEach((event) => {
    if (!event.product_id) return;
    const bucket = eventsByProductId.get(event.product_id) ?? [];
    bucket.push(event);
    eventsByProductId.set(event.product_id, bucket);
  });

  const healthOf = (product: Product) =>
    getInventoryHealthLabel(product.current_inventory, eventsByProductId.get(product.id) ?? [], product.safety_stock ?? 0);

  // Barcode health per product: check digit, duplicates, and agreement with the barcode book.
  const barcodeDuplicates = findDuplicateBarcodes(
    data.products.filter((product) => !isIgnoredProduct(product)).map((product) => ({ owner: product.sku, code: product.upc })),
  );
  const barcodeByProductId = new Map<string, BarcodeAssessment>(
    data.products.map((product) => [
      product.id,
      assessProductBarcode(
        product.upc,
        (product.product_barcode_links ?? []).map((link) => link.product_barcodes?.barcode_upc ?? "").filter(Boolean),
        barcodeDuplicates,
        product.sku,
      ),
    ]),
  );

  const categories = [
    ...new Set(
      data.products.map((product) => product.category).filter(Boolean),
    ),
  ] as string[];
  const parentCandidates = data.products.filter(
    (product) => !product.parent_product_id,
  );
  // Visibility (bundles, gift cards, ignored) decides which SKUs exist in the list;
  // the other filters decide which products show. A product shows when any of its
  // variants matches, so searching a variant SKU finds the whole product.
  const isVisible = (product: Product) =>
    (showHiddenCategories || bundlesOnly || !isHiddenByDefaultProductName(product.name)) &&
    (showIgnoredProducts || ignoredOnly || !isIgnoredProduct(product));
  const matchesFilters = (product: Product) => {
    const query = search.trim().toLowerCase();
    const matchesSearch =
      !query ||
      product.name.toLowerCase().includes(query) ||
      getProductFamilyName(product).toLowerCase().includes(query) ||
      getProductVariantLabel(product).toLowerCase().includes(query) ||
      product.sku.toLowerCase().includes(query) ||
      (product.upc ?? "").toLowerCase().includes(query) ||
      (product.description ?? "").toLowerCase().includes(query) ||
      (product.vendors?.name ?? "").toLowerCase().includes(query);
    const matchesCategory = !category || product.category === category;
    const matchesBundlesOnly = !bundlesOnly || isBundleProductName(product.name);
    const matchesIgnoredOnly = !ignoredOnly || isIgnoredProduct(product);
    const matchesPackSize = !packSizeFilter || getUnitsPerPack(product) === Number(packSizeFilter);
    const matchesSockType =
      !sockTypeFilter ||
      (sockTypeFilter === NON_SOCK_FILTER_VALUE
        ? isApparelProductName(product.name)
        : getSockTypeFromName(product.name) === sockTypeFilter);
    const matchesStatus = !statusFilter || healthOf(product) === statusFilter;
    const barcode = barcodeByProductId.get(product.id);
    const matchesBarcode =
      !barcodeFilter || (barcodeFilter === "problems" ? Boolean(barcode?.isProblem) : barcode?.status === barcodeFilter);
    return (
      matchesSearch &&
      matchesCategory &&
      matchesBundlesOnly &&
      matchesIgnoredOnly &&
      matchesPackSize &&
      matchesSockType &&
      matchesStatus &&
      matchesBarcode
    );
  };

  const allFamilies = groupProductFamilies(data.products.filter(isVisible), {
    healthOf,
    hasBarcodeProblem: (product) => Boolean(barcodeByProductId.get(product.id)?.isProblem),
  });
  const matchingFamilies = allFamilies.filter((family) => family.variants.some(matchesFilters));
  const tabCounts = {
    all: matchingFamilies.length,
    attention: matchingFamilies.filter(needsAttention).length,
    low: matchingFamilies.filter(isLowStockFamily).length,
  };
  const families = matchingFamilies
    .filter((family) => (tab === "attention" ? needsAttention(family) : tab === "low" ? isLowStockFamily(family) : true))
    .sort((left, right) => {
      if (sort === "inventory") return right.totalStock - left.totalStock;
      if (sort === "margin") return (right.marginPercent ?? -1) - (left.marginPercent ?? -1);
      return left.name.localeCompare(right.name);
    });
  const categoryOf = (family: ProductFamily) => getSockTypeFromName(family.root.name) ?? family.root.category ?? "";

  
  const activeFilters: Array<{
    key: string;
    label: string;
    onClear: () => void;
  }> = [];
  if (search.trim())
    activeFilters.push({
      key: "search",
      label: `Search: "${search.trim()}"`,
      onClear: () => setSearch(""),
    });
  if (category)
    activeFilters.push({
      key: "category",
      label: `Category: ${category}`,
      onClear: () => setCategory(""),
    });
  if (bundlesOnly)
    activeFilters.push({
      key: "bundlesOnly",
      label: "Bundles Only",
      onClear: () => setBundlesOnly(false),
    });
  if (ignoredOnly)
    activeFilters.push({
      key: "ignoredOnly",
      label: "Ignored Only",
      onClear: () => setIgnoredOnly(false),
    });
  if (packSizeFilter) {
    const label =
      packSizeFilter === "1" ? "1-Pack (Single)" : `${packSizeFilter}-Pack`;
    activeFilters.push({
      key: "packSize",
      label: `Pack Size: ${label}`,
      onClear: () => setPackSizeFilter(""),
    });
  }
  if (sockTypeFilter) {
    const label =
      sockTypeFilter === NON_SOCK_FILTER_VALUE
        ? "Other / Non-Sock (Apparel)"
        : sockTypeFilter;
    activeFilters.push({
      key: "sockType",
      label: `Sock Type: ${label}`,
      onClear: () => setSockTypeFilter(""),
    });
  }
  if (statusFilter)
    activeFilters.push({
      key: "status",
      label: `Status: ${statusFilter}`,
      onClear: () => setStatusFilter(""),
    });
  if (barcodeFilter)
    activeFilters.push({
      key: "barcode",
      label: `Barcode: ${BARCODE_FILTER_LABELS[barcodeFilter] ?? barcodeFilter}`,
      onClear: () => setBarcodeFilter(""),
    });
  if (showHiddenCategories)
    activeFilters.push({
      key: "showHidden",
      label: "Showing Bundles & Gift Cards",
      onClear: () => setShowHiddenCategories(false),
    });
  if (showIgnoredProducts)
    activeFilters.push({
      key: "showIgnored",
      label: "Showing Ignored",
      onClear: () => setShowIgnoredProducts(false),
    });

  const clearAllFilters = () => {
    setSearch("");
    setCategory("");
    setBundlesOnly(false);
    setIgnoredOnly(false);
    setPackSizeFilter("");
    setSockTypeFilter("");
    setStatusFilter("");
    setBarcodeFilter("");
    setShowHiddenCategories(false);
    setShowIgnoredProducts(false);
  };

  const bulkToggles: Array<{
    key: keyof Product;
    onLabel: string;
    offLabel: string;
  }> = [
    {
      key: "ignored",
      onLabel: "Ignore Selected",
      offLabel: "Unignore Selected",
    },
  ];

  const syncAllFromShopify = async () => {
    try {
      setSyncingAll(true);
      const result = await syncShopifyNow();
      setNotice({
        tone: "success",
        message: `Shopify sync completed. ${result.productsSynced ?? 0} products, ${result.inventoryRecordsSynced ?? 0} inventory records, and ${result.usageEventsSynced ?? 0} usage events updated.`,
      });
    } catch (err) {
      setNotice({ tone: "error", message: err instanceof Error ? err.message : "Shopify sync failed." });
    } finally {
      setSyncingAll(false);
    }
  };

  const syncProducts = async (products: Product[]) => {
    try {
      let usage = 0;
      for (const product of products) {
        const result = await shopifyService.syncProduct(product);
        usage += result.usageEventsSynced ?? 0;
      }
      await reload();
      setNotice({
        tone: "success",
        message: `${products.length === 1 ? products[0].name : `${products.length} variants`} synced with Shopify (${usage} recent usage events).`,
      });
    } catch (err) {
      setNotice({ tone: "error", message: err instanceof Error ? err.message : "Failed to sync with Shopify." });
    }
  };

  const setIgnored = async (products: Product[], ignored: boolean) => {
    try {
      await supportService.bulkUpdateProducts(
        products.map((product) => product.id),
        { ignored },
      );
      await reload();
      setNotice({
        tone: "success",
        message: `${products.length === 1 ? products[0].name : `${products.length} variants`} ${ignored ? "ignored" : "restored"}.`,
      });
    } catch (err) {
      setNotice({ tone: "error", message: err instanceof Error ? err.message : "Failed to update ignore status." });
    }
  };

  // The "⋯" menu for a product or a single variant.
  const actionsFor = (products: Product[], family: ProductFamily): PageHeaderAction[] => {
    const single = products.length === 1 ? products[0] : null;
    const allIgnored = products.every((product) => product.ignored);
    return [
      { label: "Edit", onClick: () => setEditing(single ?? family.root) },
      ...(single ? [{ label: "Quick view", onClick: () => setViewing(single) }] : []),
      { label: "Sync with Shopify", onClick: () => void syncProducts(products) },
      { label: allIgnored ? "Unignore" : "Ignore", onClick: () => void setIgnored(products, !allIgnored) },
      {
        label: single ? "Delete" : `Delete ${products.length} variants`,
        danger: true,
        onClick: () => {
          if (single) {
            setDeleting(single);
          } else {
            setSelectedIds(new Set(products.map((product) => product.id)));
            setBulkDeleting(true);
          }
        },
      },
    ];
  };

  const applyBulkPatch = async (patch: Partial<Product>) => {
    try {
      const ids = [...selectedIds];
      await supportService.bulkUpdateProducts(ids, patch);
      setSelectedIds(new Set());
      await reload();
      setNotice({
        tone: "success",
        message: `Updated ${ids.length} products.`,
      });
    } catch (err) {
      setNotice({
        tone: "error",
        message:
          err instanceof Error
            ? err.message
            : "Failed to update selected products.",
      });
    }
  };

  return (
    <div className="section-stack">
      <PageHeader
        title="Products"
        primaryAction={
          <button
            className="btn btn-primary"
            onClick={() =>
              setEditing({
                sku: "",
                name: "",
                image_url: "",
                no_bundles: false,
                ignored: false,
              })
            }
          >
            Add product
          </button>
        }
        secondaryActions={[
          {
            label: syncingAll || shopifySyncing ? "Syncing Shopify…" : "Sync all from Shopify",
            disabled: syncingAll || shopifySyncing,
            onClick: () => void syncAllFromShopify(),
          },
          { label: "Refresh list", onClick: () => void reload() },
        ]}
      />
      {notice ? (
        <NotificationBanner
          tone={notice.tone}
          message={notice.message}
          onClose={() => setNotice(null)}
        />
      ) : null}
      <ShopifySyncStatus
        lastSyncedAt={latestShopifySync(data.products)}
        onSynced={(message) => setNotice({ tone: "success", message })}
        onError={(message) => setNotice({ tone: "error", message })}
      />
      <section className="product-list">
        <div className="product-list-tabs" role="tablist" aria-label="Product views">
          {(
            [
              ["all", "All"],
              ["attention", "Needs attention"],
              ["low", "Low stock"],
            ] as Array<[ProductTab, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              className={`product-list-tab${tab === value ? " is-active" : ""}`}
              onClick={() => setTab(value)}
            >
              {label}
              <span className="product-list-tab-count">{tabCounts[value]}</span>
            </button>
          ))}
        </div>
        <div className="product-list-toolbar">
          <input
            className="product-list-search"
            type="search"
            aria-label="Search products"
            placeholder="Search by name, SKU, UPC or vendor"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <FilterPopover activeCount={activeFilters.filter((filter) => filter.key !== "search").length} onClearAll={clearAllFilters}>
            <label className="filter-field">
              <span>Category</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="">All categories</option>
                {categories.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span>Sock type</span>
              <select value={sockTypeFilter} onChange={(event) => setSockTypeFilter(event.target.value)}>
                <option value="">All sock types</option>
                {SOCK_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
                <option value={NON_SOCK_FILTER_VALUE}>Other / non-sock (apparel)</option>
              </select>
            </label>
            <label className="filter-field">
              <span>Pack size</span>
              <select value={packSizeFilter} onChange={(event) => setPackSizeFilter(event.target.value)}>
                <option value="">All pack sizes</option>
                {[1, 2, 3, 6, 10, 12].map((count) => (
                  <option key={count} value={count}>
                    {count === 1 ? "1-pack (single)" : `${count}-pack`}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span>Stock health</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="">Any</option>
                {["Healthy", "Low", "Danger", "Slow Mover"].map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span>Barcode</span>
              <select value={barcodeFilter} onChange={(event) => setBarcodeFilter(event.target.value)}>
                <option value="">Any</option>
                {Object.entries(BARCODE_FILTER_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="filter-checks">
              <legend>Show</legend>
              <label>
                <input type="checkbox" checked={bundlesOnly} onChange={(event) => setBundlesOnly(event.target.checked)} />
                Bundles only
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showHiddenCategories}
                  onChange={(event) => setShowHiddenCategories(event.target.checked)}
                />
                Include bundles and gift cards
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showIgnoredProducts}
                  onChange={(event) => setShowIgnoredProducts(event.target.checked)}
                />
                Include ignored and removed from Shopify
              </label>
              <label>
                <input type="checkbox" checked={ignoredOnly} onChange={(event) => setIgnoredOnly(event.target.checked)} />
                Ignored only
              </label>
            </fieldset>
          </FilterPopover>
          <label className="product-list-sort">
            <span>Sort</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <span className="product-list-count">
            {families.length} {families.length === 1 ? "product" : "products"}
          </span>
        </div>
        {activeFilters.length ? (
          <div className="product-list-chips">
            {activeFilters.map((filter) => (
              <button key={filter.key} type="button" className="filter-chip" onClick={filter.onClear}>
                {filter.label}
                <span aria-hidden="true">×</span>
                <span className="visually-hidden">Remove filter</span>
              </button>
            ))}
            <button type="button" className="btn btn-ghost btn-small" onClick={clearAllFilters}>
              Clear all
            </button>
          </div>
        ) : null}
        <ProductFamilyTable
          families={families}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          barcodeOf={(product) => barcodeByProductId.get(product.id)}
          categoryOf={categoryOf}
          actionsFor={actionsFor}
          onOpen={(product) => navigate(`/products/${product.id}`)}
          emptyMessage={
            data.products.length
              ? tab === "all"
                ? "No products match these filters."
                : "Nothing here right now."
              : "No products yet. Add one, or sync from Shopify."
          }
          bulkActions={
            <>
              <button className="btn btn-secondary btn-small" onClick={() => void applyBulkPatch({ ignored: true })}>
                Ignore
              </button>
              <button className="btn btn-secondary btn-small" onClick={() => void applyBulkPatch({ ignored: false })}>
                Unignore
              </button>
              <button className="btn btn-danger btn-small" onClick={() => setBulkDeleting(true)}>
                Delete
              </button>
              <button className="btn btn-ghost btn-small" onClick={() => setSelectedIds(new Set())}>
                Clear selection
              </button>
            </>
          }
        />
      </section>
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
            compliance_docs_required_input: (
              editing.compliance_docs_required ?? []
            ).join(", "),
            compliance_docs_status: editing.compliance_docs_status ?? "Ready",
            inventory_allocated: editing.inventory_allocated ?? 0,
            safety_stock: editing.safety_stock ?? 0,
            image_url: editing.image_url ?? "",
            no_bundles: editing.no_bundles ?? false,
            ignored: editing.ignored ?? false,
            shopify_handle: editing.shopify_handle ?? "",
            shopify_storefront_url: editing.shopify_storefront_url ?? "",
            shopify_admin_url: editing.shopify_admin_url ?? "",
            starting_inventory: editing.id ? undefined : 0,
          }}
          fields={[
            { key: "sku", label: "SKU", required: true },
            { key: "name", label: "Name", required: true },
            {
              key: "parent_product_id",
              label: "Parent Style",
              type: "select",
              options: parentCandidates
                .filter((product) => product.id !== editing.id)
                .map((product) => ({
                  label: `${product.name} (${product.sku})`,
                  value: product.id,
                })),
            },
            { key: "variant_title", label: "Variant Title" },
            {
              key: "variant_sort_order",
              label: "Variant Sort Order",
              type: "number",
              min: 0,
              step: 1,
            },
            { key: "category", label: "Category" },
            {
              key: "vendor_id",
              label: "Primary Vendor",
              type: "select",
              options: data.vendors.map((vendor) => ({
                label: vendor.name,
                value: vendor.id,
              })),
            },
            {
              key: "unit_cost",
              label: "COGS",
              type: "number",
              min: 0,
              step: 0.01,
            },
            {
              key: "unit_price",
              label: "Unit Price",
              type: "number",
              min: 0,
              step: 0.01,
            },
            {
              key: "wholesale_price",
              label: "Wholesale Price",
              type: "number",
              min: 0,
              step: 0.01,
            },
            { key: "msrp", label: "MSRP", type: "number", min: 0, step: 0.01 },
            { key: "upc", label: "UPC" },
            { key: "pack_size", label: "Pack Size" },
            {
              key: "case_pack_quantity",
              label: "Case Pack Quantity",
              type: "number",
              min: 1,
              step: 1,
            },
            { key: "weight", label: "Weight" },
            { key: "dimensions", label: "Dimensions" },
            {
              key: "compliance_docs_required_input",
              label: "Compliance Docs",
              type: "textarea",
            },
            {
              key: "compliance_docs_status",
              label: "Compliance Status",
              type: "select",
              options: [
                { label: "Ready", value: "Ready" },
                { label: "Missing", value: "Missing" },
                { label: "Pending", value: "Pending" },
              ],
            },
            { key: "image_url", label: "Product Image", type: "image" },
            { key: "no_bundles", label: "No Bundles", type: "checkbox" },
            { key: "ignored", label: "Ignore Product", type: "checkbox" },
            { key: "shopify_handle", label: "Shopify Handle" },
            { key: "shopify_storefront_url", label: "Shopify Storefront URL" },
            { key: "shopify_admin_url", label: "Shopify Admin URL" },
            ...(editing.id
              ? []
              : [
                  {
                    key: "starting_inventory" as const,
                    label: "Starting Inventory",
                    type: "number" as const,
                    step: 1,
                  },
                ]),
            { key: "description", label: "Description", type: "textarea" },
          ]}
          onSave={async (values) => {
            if (!String(values.sku ?? "").trim())
              throw new Error("SKU is required.");
            if (!String(values.name ?? "").trim())
              throw new Error("Product name is required.");
            await supportService.saveProduct({
              ...editing,
              ...values,
              vendor_id: values.vendor_id ? String(values.vendor_id) : null,
              parent_product_id: values.parent_product_id
                ? String(values.parent_product_id)
                : null,
              variant_title: values.variant_title
                ? String(values.variant_title)
                : null,
              variant_sort_order: Number(values.variant_sort_order ?? 0),
              category: values.category ? String(values.category) : null,
              description: values.description
                ? String(values.description)
                : null,
              upc: values.upc ? String(values.upc) : null,
              pack_size: values.pack_size ? String(values.pack_size) : null,
              case_pack_quantity: Math.max(
                Number(values.case_pack_quantity ?? 1),
                1,
              ),
              wholesale_price: Number(values.wholesale_price ?? 0),
              msrp: Number(values.msrp ?? 0),
              weight: values.weight ? String(values.weight) : null,
              dimensions: values.dimensions ? String(values.dimensions) : null,
              compliance_docs_required: String(
                values.compliance_docs_required_input ?? "",
              )
                .split(",")
                .map((entry) => entry.trim())
                .filter(Boolean),
              compliance_docs_status: values.compliance_docs_status
                ? String(values.compliance_docs_status)
                : null,
              image_url: values.image_url ? String(values.image_url) : null,
              no_bundles: Boolean(values.no_bundles),
              ignored: Boolean(values.ignored),
              shopify_handle: values.shopify_handle
                ? String(values.shopify_handle)
                : null,
              shopify_storefront_url: values.shopify_storefront_url
                ? String(values.shopify_storefront_url)
                : null,
              shopify_admin_url: values.shopify_admin_url
                ? String(values.shopify_admin_url)
                : null,
              current_inventory: editing.id
                ? editing.current_inventory
                : Number(values.starting_inventory ?? 0),
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
          actions={
            <button className="btn btn-ghost" onClick={() => setViewing(null)}>
              Cancel
            </button>
          }
        >
          <div className="detail-grid">
            <div className="detail-card">
              <span>SKU</span>
              <strong>{viewing.sku}</strong>
            </div>
            <div className="detail-card">
              <span>Name</span>
              <strong>{viewing.name}</strong>
            </div>
            <div className="detail-card">
              <span>Parent Style</span>
              <strong>
                {viewing.parent_products?.name ?? "Standalone / base style"}
              </strong>
            </div>
            <div className="detail-card">
              <span>Variant</span>
              <strong>{getProductVariantLabel(viewing)}</strong>
            </div>
            <div className="detail-card">
              <span>Vendor</span>
              <strong>{viewing.vendors?.name ?? "Unassigned"}</strong>
            </div>
            <div className="detail-card">
              <span>Category</span>
              <strong>{viewing.category ?? "Uncategorized"}</strong>
            </div>
            <div className="detail-card">
              <span>Inventory</span>
              <strong
                className={
                  isInventoryDanger(
                    viewing.current_inventory,
                    eventsByProductId.get(viewing.id) ?? [],
                  )
                    ? "danger-text"
                    : ""
                }
              >
                {viewing.current_inventory}
              </strong>
            </div>
            <div className="detail-card">
              <span>COGS</span>
              <strong>{formatCurrency(viewing.unit_cost)}</strong>
            </div>
            <div className="detail-card">
              <span>Unit Price</span>
              <strong>{formatCurrency(viewing.unit_price ?? 0)}</strong>
            </div>
            <div className="detail-card">
              <span>Margin</span>
              <strong>
                {getMarginMetrics(
                  viewing.unit_cost,
                  viewing.unit_price,
                ).marginPercent.toFixed(0)}
                %
              </strong>
            </div>
            <div className="detail-card">
              <span>Wholesale</span>
              <strong>{formatCurrency(viewing.wholesale_price ?? 0)}</strong>
            </div>
            <div className="detail-card">
              <span>MSRP</span>
              <strong>{formatCurrency(viewing.msrp ?? 0)}</strong>
            </div>
            <div className="detail-card">
              <span>UPC</span>
              <strong>{viewing.upc ?? "N/A"}</strong>
            </div>
            <div className="detail-card">
              <span>Weight</span>
              <strong>{viewing.weight ?? "N/A"}</strong>
            </div>
            <div className="detail-card">
              <span>Case Pack</span>
              <strong>{viewing.case_pack_quantity}</strong>
            </div>
            <div className="detail-card">
              <span>Pack Size</span>
              <strong>{viewing.pack_size ?? "N/A"}</strong>
            </div>
            <div className="detail-card">
              <span>Available</span>
              <strong>
                {viewing.inventory_available ?? viewing.current_inventory}
              </strong>
            </div>
            <div className="detail-card">
              <span>No Bundles</span>
              <strong>{viewing.no_bundles ? "Yes" : "No"}</strong>
            </div>
            <div className="detail-card">
              <span>Ignored</span>
              <strong>{viewing.ignored ? "Yes" : "No"}</strong>
            </div>
            <div className="detail-card">
              <span>Product Image</span>
              <strong>
                {viewing.image_url ? (
                  <a href={viewing.image_url} target="_blank" rel="noreferrer">
                    Open image
                  </a>
                ) : (
                  "No image yet"
                )}
              </strong>
            </div>
            <div className="detail-card">
              <span>Compliance</span>
              <strong>{viewing.compliance_docs_status ?? "N/A"}</strong>
            </div>
            <div className="detail-card">
              <span>Shopify Sync</span>
              <strong>
                {viewing.is_shopify_synced ? "Synced" : "Not synced"}
              </strong>
            </div>
            <div className="detail-card">
              <span>Updated</span>
              <strong>{new Date(viewing.updated_at).toLocaleString()}</strong>
            </div>
            <div className="detail-card" style={{ gridColumn: "1 / -1" }}>
              <span>Description</span>
              <strong>{viewing.description ?? "No description added."}</strong>
            </div>
            <div className="detail-card" style={{ gridColumn: "1 / -1" }}>
              <span>Compliance Docs Required</span>
              <strong>
                {viewing.compliance_docs_required?.length
                  ? viewing.compliance_docs_required.join(", ")
                  : "None"}
              </strong>
            </div>
            {viewing.variants?.length ? (
              <div className="detail-card" style={{ gridColumn: "1 / -1" }}>
                <span>Linked Variants</span>
                <strong>
                  {viewing.variants
                    .map(
                      (variant) =>
                        `${getProductVariantLabel(variant)} (${variant.sku})`,
                    )
                    .join(", ")}
                </strong>
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
              setNotice({
                tone: "success",
                message: "Product deleted successfully.",
              });
            } catch (err) {
              setNotice({
                tone: "error",
                message:
                  err instanceof Error
                    ? err.message
                    : "Failed to delete product.",
              });
            } finally {
              setBusyDelete(false);
            }
          }}
        />
      ) : null}
      {bulkDeleting ? (
        <ConfirmDialog
          title="Delete selected products?"
          message={`This will permanently remove ${selectedIds.size} products. Continue only if you no longer need these SKUs in the system.`}
          busy={busyBulkDelete}
          onClose={() => {
            if (!busyBulkDelete) setBulkDeleting(false);
          }}
          onConfirm={async () => {
            try {
              setBusyBulkDelete(true);
              const ids = [...selectedIds];
              await supportService.deleteProducts(ids);
              setBulkDeleting(false);
              setSelectedIds(new Set());
              await reload();
              setNotice({
                tone: "success",
                message: `Deleted ${ids.length} products successfully.`,
              });
            } catch (err) {
              setNotice({
                tone: "error",
                message:
                  err instanceof Error
                    ? err.message
                    : "Failed to delete selected products.",
              });
            } finally {
              setBusyBulkDelete(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}
