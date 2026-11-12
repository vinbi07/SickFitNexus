import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable } from "@/components/DataTable";
import { Disclosure } from "@/components/Disclosure";
import { FilterChips, ListTabs, ResourceTable } from "@/components/lists/ResourceTable";
import { FilterPopover } from "@/components/products/FilterPopover";
import { ProductsSectionNav } from "@/components/products/ProductsSectionNav";
import { latestShopifySync, ShopifySyncStatus } from "@/components/products/ShopifySyncStatus";
import { useReloadOnShopifySync, useShopifySync } from "@/context/ShopifySyncContext";
import { EntityFormModal } from "@/components/EntityFormModal";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Modal } from "@/components/Modal";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader } from "@/components/PageHeader";
import { SummaryStrip } from "@/components/SummaryStrip";
import { useAsyncData } from "@/hooks/useAsyncData";
import { dashboardService } from "@/services/dashboardService";
import { inventoryService } from "@/services/inventoryService";
import { shopifyService } from "@/services/shopifyService";
import { supportService } from "@/services/supportService";
import type { InventoryEvent, InventoryItem } from "@/types/domain";
import { formatCurrency, formatDate, formatNumber } from "@/utils/format";
import {
  findDuplicateInventoryGroups,
  getAvailableAfterIncoming,
  getInventoryHealthLabel,
  getInventoryHealthTone,
  getInventoryRiskStatus,
  getMarginMetrics,
  getOversoldLabel,
  getSockTypeFromName,
  isApparelProductName,
  isBundleProductName,
  isGiftCardProductName,
  isHiddenByDefaultProductName,
  isIgnoredProduct,
  isInventoryDanger,
  SOCK_TYPES,
} from "@/utils/operations";
import { getProductFamilyName, getProductVariantLabel, getUnitsPerPack } from "@/utils/lookbook";
import { familyKeyIndex } from "@/utils/productFamilies";

const NON_SOCK_FILTER_VALUE = "__non_sock__";

type InventoryItemFormValues = Partial<InventoryItem>;

type InventoryTab = "all" | "reorder" | "incoming";

export function InventoryPage() {
  const [editing, setEditing] = useState<InventoryItemFormValues | null>(null);
  const [viewing, setViewing] = useState<InventoryItem | null>(null);
  const [deleting, setDeleting] = useState<InventoryItem | null>(null);
  const [adjusting, setAdjusting] = useState<InventoryItem | null>(null);
  const [transferring, setTransferring] = useState<InventoryItem | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [adjustmentValues, setAdjustmentValues] = useState({
    quantity_change: 0,
    event_date: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const [transferValues, setTransferValues] = useState({
    quantity: 0,
    target_location_id: "",
    event_date: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  // ?q= lets other pages (e.g. a product's "Manage inventory") open this list already searched.
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [locationId, setLocationId] = useState("");
  const [category, setCategory] = useState("");
  const [bundlesOnly, setBundlesOnly] = useState(false);
  const [ignoredOnly, setIgnoredOnly] = useState(false);
  const [packSizeFilter, setPackSizeFilter] = useState("");
  const [sockTypeFilter, setSockTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showHiddenCategories, setShowHiddenCategories] = useState(false);
  const [showIgnoredProducts, setShowIgnoredProducts] = useState(false);
  const [sort, setSort] = useState("danger");
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const navigate = useNavigate();
  const [tab, setTab] = useState<InventoryTab>("all");
  const [syncingAll, setSyncingAll] = useState(false);
  const { data, loading, error, reload } = useAsyncData(
    async () => ({
      items: await inventoryService.listItems(),
      events: await inventoryService.listEvents(),
      products: await supportService.listProducts(),
      locations: await supportService.listLocations(),
      snapshot: await dashboardService.getSnapshot(),
    }),
    [],
  );

  useReloadOnShopifySync(reload);
  const { running: shopifySyncing, syncNow: syncShopifyNow } = useShopifySync();

  if (loading) return <LoadingState />;
  if (error || !data)
    return <ErrorState message={error ?? "Unable to load inventory"} />;

  const reorderBySku = new Map(
    data.snapshot.skuReorderWindows.map((item) => [item.sku, item]),
  );

  const eventsByProductId = new Map<string, InventoryEvent[]>();
  data.events.forEach((event) => {
    if (!event.product_id) return;
    const bucket = eventsByProductId.get(event.product_id) ?? [];
    bucket.push(event);
    eventsByProductId.set(event.product_id, bucket);
  });

  const categories = [
    ...new Set(data.items.map((item) => item.products?.category).filter(Boolean)),
  ] as string[];

  const filteredItems = data.items
    .filter((item) => {
      const query = search.trim().toLowerCase();
      const matchesSearch =
        !query ||
        (item.products?.name ?? "").toLowerCase().includes(query) ||
        (item.products?.sku ?? "").toLowerCase().includes(query) ||
        (item.locations?.name ?? "").toLowerCase().includes(query);
      const matchesLocation = !locationId || item.location_id === locationId;
      const itemEvents = eventsByProductId.get(item.product_id) ?? [];
      const label = getInventoryHealthLabel(
        item.quantity_on_hand,
        itemEvents,
        item.products?.safety_stock ?? 0,
      );
      const matchesCategory =
        !category || item.products?.category === category;
      const matchesBundlesOnly =
        !bundlesOnly || isBundleProductName(item.products?.name);
      const matchesIgnoredOnly = !ignoredOnly || (item.products ? isIgnoredProduct(item.products) : false);
      const matchesPackSize =
        !packSizeFilter ||
        (item.products ? getUnitsPerPack(item.products) : null) ===
          Number(packSizeFilter);
      const matchesSockType =
        !sockTypeFilter ||
        (sockTypeFilter === NON_SOCK_FILTER_VALUE
          ? isApparelProductName(item.products?.name)
          : getSockTypeFromName(item.products?.name) === sockTypeFilter);
      const matchesStatus = !statusFilter || label === statusFilter;
      const matchesVisibility =
        (showHiddenCategories ||
          bundlesOnly ||
          !isHiddenByDefaultProductName(item.products?.name)) &&
        (showIgnoredProducts || ignoredOnly || !(item.products && isIgnoredProduct(item.products)));
      return (
        matchesSearch &&
        matchesLocation &&
        matchesCategory &&
        matchesBundlesOnly &&
        matchesIgnoredOnly &&
        matchesPackSize &&
        matchesSockType &&
        matchesStatus &&
        matchesVisibility
      );
    })
    .sort((left, right) => {
      if (sort === "quantity")
        return right.quantity_on_hand - left.quantity_on_hand;
      if (sort === "incoming") {
        const leftIncoming =
          reorderBySku.get(left.products?.sku ?? "")?.incomingQuantity ?? 0;
        const rightIncoming =
          reorderBySku.get(right.products?.sku ?? "")?.incomingQuantity ?? 0;
        return rightIncoming - leftIncoming;
      }
      const leftDanger = isInventoryDanger(
        left.quantity_on_hand,
        eventsByProductId.get(left.product_id) ?? [],
      )
        ? -1
        : left.quantity_on_hand;
      const rightDanger = isInventoryDanger(
        right.quantity_on_hand,
        eventsByProductId.get(right.product_id) ?? [],
      )
        ? -1
        : right.quantity_on_hand;
      return leftDanger - rightDanger;
    });

  // Sellable now. Before migration 034 runs, only quantity_on_hand exists (and holds available).
  const availableOf = (item: InventoryItem) => Number(item.quantity_available ?? item.quantity_on_hand ?? 0);
  const committedOf = (item: InventoryItem) =>
    Number(item.quantity_committed ?? 0) + Number(item.products?.inventory_allocated ?? 0);
  const incomingOf = (item: InventoryItem) => reorderBySku.get(item.products?.sku ?? "")?.incomingQuantity ?? 0;
  // Only problems get a status note; healthy stock stays quiet.
  const statusOf = (item: InventoryItem): { label: string; tone: "danger" | "warning" | "info" } | null => {
    if (isGiftCardProductName(item.products?.name)) return null;
    const tone = getInventoryHealthTone(
      availableOf(item),
      eventsByProductId.get(item.product_id) ?? [],
      item.products?.safety_stock ?? 0,
    );
    const risk = getInventoryRiskStatus(availableOf(item), tone, incomingOf(item));
    if (risk === "Oversold") return { label: "Oversold", tone: "danger" };
    if (risk === "Low Stock") return { label: "Low stock", tone: "danger" };
    if (risk === "Reorder Soon") return { label: "Reorder soon", tone: "warning" };
    if (risk === "Incoming Shipment") return { label: "Incoming", tone: "info" };
    return null;
  };
  const needsReorder = (item: InventoryItem) => {
    const status = statusOf(item);
    return status?.tone === "danger" || status?.tone === "warning";
  };
  const tabCounts = {
    all: filteredItems.length,
    reorder: filteredItems.filter(needsReorder).length,
    incoming: filteredItems.filter((item) => incomingOf(item) > 0).length,
  };
  const visibleItems = filteredItems.filter((item) =>
    tab === "reorder" ? needsReorder(item) : tab === "incoming" ? incomingOf(item) > 0 : true,
  );

  // Fold records under their product like the Products list: variants (and locations) open from one row.
  const familyIndex = familyKeyIndex(data.products);
  const productById = new Map(data.products.map((product) => [product.id, product]));
  const familyOf = (item: InventoryItem) => familyIndex.get(item.product_id) ?? item.product_id;
  const familyNameOf = (rows: InventoryItem[]) => {
    const root = productById.get(familyOf(rows[0])) ?? rows[0].products;
    return root ? getProductFamilyName(root) : "Unknown product";
  };
  /** One entry per SKU, so per-SKU numbers (incoming, holds) aren't counted once per location. */
  const distinctSkus = (rows: InventoryItem[]) => [...new Map(rows.map((row) => [row.product_id, row])).values()];
  const groupAvailable = (rows: InventoryItem[]) =>
    rows.reduce((sum, row) => sum + availableOf(row), 0) +
    distinctSkus(rows).reduce((sum, row) => sum + incomingOf(row) - Number(row.products?.inventory_allocated ?? 0), 0);
  const STATUS_RANK = { danger: 0, warning: 1, info: 2 } as const;
  const groupStatus = (rows: InventoryItem[]) => {
    const statuses = rows.map(statusOf).filter((status): status is NonNullable<typeof status> => Boolean(status));
    if (!statuses.length) return null;
    const worst = statuses.reduce((best, status) => (STATUS_RANK[status.tone] < STATUS_RANK[best.tone] ? status : best));
    const count = statuses.filter((status) => status.label === worst.label).length;
    return { ...worst, label: count > 1 ? `${worst.label} · ${count}` : worst.label };
  };
  const plural = (count: number, word: string) => `${formatNumber(count)} ${word}${count === 1 ? "" : "s"}`;

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
  if (locationId) {
    const locationName =
      data.locations.find((location) => location.id === locationId)?.name ??
      "Selected";
    activeFilters.push({
      key: "location",
      label: `Location: ${locationName}`,
      onClear: () => setLocationId(""),
    });
  }
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
    setLocationId("");
    setCategory("");
    setBundlesOnly(false);
    setIgnoredOnly(false);
    setPackSizeFilter("");
    setSockTypeFilter("");
    setStatusFilter("");
    setShowHiddenCategories(false);
    setShowIgnoredProducts(false);
  };

  const syncAllFromShopify = async () => {
    try {
      setSyncingAll(true);
      const result = await syncShopifyNow();
      setNotice({
        tone: "success",
        message: `Shopify sync completed. ${result.inventoryRecordsSynced ?? 0} inventory records updated.`,
      });
    } catch (err) {
      setNotice({ tone: "error", message: err instanceof Error ? err.message : "Shopify sync failed." });
    } finally {
      setSyncingAll(false);
    }
  };

  const nonGiftCardItems = data.items.filter(
    (item) =>
      !isGiftCardProductName(item.products?.name) && !(item.products && isIgnoredProduct(item.products)),
  );
  const totalUnitsOnHand = nonGiftCardItems.reduce(
    (sum, item) => sum + Number(item.quantity_on_hand ?? 0),
    0,
  );
  const dangerCount = nonGiftCardItems.filter((item) =>
    isInventoryDanger(
      item.quantity_on_hand,
      eventsByProductId.get(item.product_id) ?? [],
    ),
  ).length;
  const noBundlesCount = data.items.filter((item) =>
    Boolean(item.products?.no_bundles),
  ).length;
  const inventoryValue = nonGiftCardItems.reduce(
    (sum, item) =>
      sum + item.quantity_on_hand * Number(item.products?.unit_cost ?? 0),
    0,
  );

  return (
    <div className="section-stack">
      <PageHeader
        title="Products"
        primaryAction={
          <button
            className="btn btn-primary"
            onClick={() =>
              setEditing({
                product_id: "",
                location_id: "",
                inventory_category: "Core",
              })
            }
          >
            Add inventory
          </button>
        }
        secondaryActions={[
          {
            label: syncingAll || shopifySyncing ? "Syncing Shopify…" : "Sync from Shopify",
            disabled: syncingAll || shopifySyncing,
            onClick: () => void syncAllFromShopify(),
          },
          { label: "Clean up inventory", onClick: () => setCleanupOpen(true) },
          { label: "Refresh list", onClick: () => void reload() },
        ]}
      />
      <ProductsSectionNav />
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
      <SummaryStrip
        items={[
          { label: "Units on hand", value: formatNumber(totalUnitsOnHand) },
          { label: "Need reorder", value: formatNumber(dangerCount), note: "25 units or less" },
          { label: "Incoming", value: formatNumber(data.snapshot.incomingInventoryUnits), note: "from manufacturing" },
          { label: "Inventory value", value: formatCurrency(inventoryValue), note: "at cost" },
        ]}
      />
      <section className="product-list">
        <ListTabs
          label="Inventory views"
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "all", label: "All", count: tabCounts.all },
            { key: "reorder", label: "Needs reorder", count: tabCounts.reorder },
            { key: "incoming", label: "Incoming", count: tabCounts.incoming },
          ]}
        />
        <div className="product-list-toolbar">
          <input
            className="product-list-search"
            type="search"
            aria-label="Search inventory"
            placeholder="Search by product, SKU or location"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <label className="product-list-sort">
            <span>Location</span>
            <select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
              <option value="">All locations</option>
              {data.locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          <FilterPopover
            activeCount={activeFilters.filter((filter) => filter.key !== "search" && filter.key !== "location").length}
            onClearAll={clearAllFilters}
          >
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
              <option value="danger">Most urgent</option>
              <option value="quantity">On hand</option>
              <option value="incoming">Incoming</option>
            </select>
          </label>
          <span className="product-list-count">
            {visibleItems.length} {visibleItems.length === 1 ? "record" : "records"}
          </span>
        </div>
        <FilterChips filters={activeFilters} onClearAll={clearAllFilters} />
        <ResourceTable
          rows={visibleItems}
          rowKey={(row) => row.id}
          emptyMessage={
            data.items.length
              ? tab === "all"
                ? "No inventory matches these filters."
                : "Nothing here right now."
              : "No inventory yet. Add a record to put a product at a location."
          }
          onRowClick={(row) => setAdjusting(row)}
          rowClassName={(row) => (Number(row.quantity_on_hand) < 0 ? "is-alert" : undefined)}
          groupBy={familyOf}
          groupLabel={familyNameOf}
          // Opening everything while narrowing down saves a click per product.
          defaultExpanded={tab !== "all" || activeFilters.length > 0}
          groupActionsFor={(rows) => [
            { label: "Open product", onClick: () => navigate(`/products/${rows[0].product_id}`) },
            { label: "Create manufacturing PO", onClick: () => navigate("/purchase-orders/new?type=manufacturer") },
          ]}
          actionsFor={(row) => [
            { label: "Adjust stock", onClick: () => setAdjusting(row) },
            { label: "Transfer", onClick: () => setTransferring(row) },
            { label: "Open product", onClick: () => navigate(`/products/${row.product_id}`) },
            { label: "Details", onClick: () => setViewing(row) },
            { label: "Edit record", onClick: () => setEditing(row) },
            { label: "Create manufacturing PO", onClick: () => navigate("/purchase-orders/new?type=manufacturer") },
            { label: "Delete", danger: true, onClick: () => setDeleting(row) },
          ]}
          columns={[
            {
              key: "product",
              title: "Product",
              render: (row) => (
                <div className="pf-product">
                  {row.products?.image_url ? (
                    <img className="pf-thumb" src={row.products.image_url} alt="" loading="lazy" />
                  ) : (
                    <span className="pf-thumb pf-thumb-empty" aria-hidden="true">
                      {(row.products?.name ?? "?").slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <div className="pf-name">
                    <strong className="rt-title">{row.products ? getProductFamilyName(row.products) : "Unknown product"}</strong>
                    <span>
                      {row.products ? getProductVariantLabel(row.products) : ""}
                      {row.products?.sku ? ` · ${row.products.sku}` : ""}
                    </span>
                  </div>
                </div>
              ),
              renderGroup: (rows) => {
                const root = productById.get(familyOf(rows[0])) ?? rows[0].products;
                const name = familyNameOf(rows);
                const skus = distinctSkus(rows).length;
                const locations = new Set(rows.map((row) => row.location_id)).size;
                return (
                  <div className="pf-product">
                    {root?.image_url ? (
                      <img className="pf-thumb" src={root.image_url} alt="" loading="lazy" />
                    ) : (
                      <span className="pf-thumb pf-thumb-empty" aria-hidden="true">
                        {name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <div className="pf-name">
                      <strong className="rt-title">{name}</strong>
                      <span>
                        {[skus > 1 ? plural(skus, "variant") : null, locations > 1 ? plural(locations, "location") : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                  </div>
                );
              },
              renderVariant: (row) => (
                <div className="pf-variant-name">
                  <strong>{row.products ? getProductVariantLabel(row.products) : "Unknown product"}</strong>
                  <span>{row.products?.sku}</span>
                </div>
              ),
            },
            {
              key: "location",
              title: "Location",
              hideOnMobile: true,
              render: (row) => row.locations?.name ?? <span className="pf-muted">—</span>,
              renderGroup: (rows) => {
                const names = [...new Set(rows.map((row) => row.locations?.name ?? "Unknown"))];
                return names.length === 1 ? names[0] : <span className="pf-muted">{plural(names.length, "location")}</span>;
              },
            },
            {
              key: "on_hand",
              title: "On hand",
              align: "right",
              render: (row) => {
                const qty = Number(row.quantity_on_hand ?? 0);
                return <strong className={qty < 0 ? "rt-alert" : undefined}>{formatNumber(qty)}</strong>;
              },
              renderGroup: (rows) => {
                const qty = rows.reduce((sum, row) => sum + Number(row.quantity_on_hand ?? 0), 0);
                return <strong className={qty < 0 ? "rt-alert" : undefined}>{formatNumber(qty)}</strong>;
              },
            },
            {
              key: "committed",
              title: "Committed",
              align: "right",
              hideOnMobile: true,
              render: (row) => formatNumber(committedOf(row)),
              renderGroup: (rows) =>
                formatNumber(
                  rows.reduce((sum, row) => sum + Number(row.quantity_committed ?? 0), 0) +
                    distinctSkus(rows).reduce((sum, row) => sum + Number(row.products?.inventory_allocated ?? 0), 0),
                ),
            },
            {
              key: "incoming",
              title: "Incoming",
              align: "right",
              hideOnMobile: true,
              render: (row) => {
                const incoming = incomingOf(row);
                return incoming ? formatNumber(incoming) : <span className="pf-muted">—</span>;
              },
              renderGroup: (rows) => {
                const incoming = distinctSkus(rows).reduce((sum, row) => sum + incomingOf(row), 0);
                return incoming ? formatNumber(incoming) : <span className="pf-muted">—</span>;
              },
            },
            {
              key: "available",
              title: "Available",
              align: "right",
              render: (row) => {
                // Shopify already takes its own orders out of "available"; subtract only Nexus wholesale holds.
                const available = getAvailableAfterIncoming(
                  availableOf(row),
                  incomingOf(row),
                  Number(row.products?.inventory_allocated ?? 0),
                );
                const status = statusOf(row);
                return (
                  <span className="rt-available">
                    <strong className={available < 0 ? "rt-alert" : undefined}>{formatNumber(available)}</strong>
                    {status ? <em className={`rt-status is-${status.tone}`}>{status.label}</em> : null}
                  </span>
                );
              },
              renderGroup: (rows) => {
                const available = groupAvailable(rows);
                const status = groupStatus(rows);
                return (
                  <span className="rt-available">
                    <strong className={available < 0 ? "rt-alert" : undefined}>{formatNumber(available)}</strong>
                    {status ? <em className={`rt-status is-${status.tone}`}>{status.label}</em> : null}
                  </span>
                );
              },
            },
          ]}
        />
      </section>
      <section className="product-list">
        <div className="rt-section-head">
          <h3>Recent stock changes</h3>
          <span className="helper-text">Last {Math.min(20, data.events.length)} adjustments, receipts and sales</span>
        </div>
        <Disclosure summary="Show recent changes" openSummary="Hide recent changes">
          <ResourceTable
            rows={data.events.slice(0, 20)}
            rowKey={(row) => row.id}
            emptyMessage="No stock changes yet."
            columns={[
              { key: "date", title: "Date", render: (row) => formatDate(row.event_date) },
              { key: "product", title: "Product", render: (row) => row.products?.name ?? "—" },
              { key: "event", title: "Change", render: (row) => row.event_type },
              {
                key: "qty",
                title: "Units",
                align: "right",
                render: (row) => {
                  const change = Number(row.quantity_change ?? 0);
                  return <span className={change < 0 ? "rt-alert" : "rt-positive"}>{change > 0 ? `+${change}` : change}</span>;
                },
              },
              { key: "location", title: "Location", hideOnMobile: true, render: (row) => row.locations?.name ?? "—" },
              { key: "notes", title: "Notes", hideOnMobile: true, render: (row) => row.notes ?? <span className="pf-muted">—</span> },
            ]}
          />
        </Disclosure>
      </section>
      {editing ? (
        <EntityFormModal<InventoryItemFormValues>
          title={editing.id ? "Edit Inventory Record" : "Add Inventory Record"}
          saveLabel={editing.id ? "Save Changes" : "Create Inventory Record"}
          initialValues={{
            product_id: editing.product_id ?? "",
            location_id: editing.location_id ?? "",
            inventory_category: editing.inventory_category ?? "Core",
            quantity_on_hand: editing.quantity_on_hand ?? 0,
            reorder_point: editing.reorder_point ?? 0,
            target_stock: editing.target_stock ?? 0,
            notes: editing.notes ?? "",
          }}
          fields={[
            {
              key: "product_id",
              label: "Product",
              type: "select",
              required: true,
              options: data.products.map((product) => ({
                label: `${product.sku} | ${product.name}`,
                value: product.id,
              })),
            },
            {
              key: "location_id",
              label: "Location",
              type: "select",
              required: true,
              options: data.locations.map((location) => ({
                label: location.name,
                value: location.id,
              })),
            },
            {
              key: "inventory_category",
              label: "Inventory Category",
              type: "select",
              options: [
                { label: "Core", value: "Core" },
                { label: "Packaging", value: "Packaging" },
              ],
            },
            {
              key: "quantity_on_hand",
              label: "On Hand Quantity",
              type: "number",
              step: 1,
            },
            {
              key: "reorder_point",
              label: "Reorder Point",
              type: "number",
              min: 0,
              step: 1,
            },
            {
              key: "target_stock",
              label: "Target Stock",
              type: "number",
              min: 0,
              step: 1,
            },
            { key: "notes", label: "Notes", type: "textarea" },
          ]}
          onSave={async (values) => {
            if (!String(values.product_id ?? "").trim())
              throw new Error("Product is required.");
            if (!String(values.location_id ?? "").trim())
              throw new Error("Location is required.");
            await inventoryService.saveItem({
              ...editing,
              ...values,
              product_id: String(values.product_id),
              location_id: String(values.location_id),
              inventory_category: (values.inventory_category
                ? String(values.inventory_category)
                : "Core") as InventoryItem["inventory_category"],
              quantity_on_hand: Number(values.quantity_on_hand ?? 0),
              reorder_point: Number(values.reorder_point ?? 0),
              target_stock: Number(values.target_stock ?? 0),
              notes: values.notes ? String(values.notes) : null,
            });
            await reload();
            setNotice({
              tone: "success",
              message: editing.id
                ? "Inventory record updated successfully."
                : "Inventory record created successfully.",
            });
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {viewing ? (
        <Modal
          title={`${viewing.products?.name ?? "Inventory"} at ${viewing.locations?.name ?? "Location"}`}
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
              <strong>{viewing.products?.sku ?? "N/A"}</strong>
            </div>
            <div className="detail-card">
              <span>Vendor</span>
              <strong>{viewing.products?.vendors?.name ?? "Unassigned"}</strong>
            </div>
            <div className="detail-card">
              <span>Current Quantity</span>
              <strong>
                {getOversoldLabel(viewing.quantity_on_hand) ??
                  viewing.quantity_on_hand}
              </strong>
            </div>
            <div className="detail-card">
              <span>Committed</span>
              <strong>
                {Number(viewing.products?.inventory_allocated ?? 0)}
              </strong>
            </div>
            <div className="detail-card">
              <span>Incoming Quantity</span>
              <strong>
                {reorderBySku.get(viewing.products?.sku ?? "")
                  ?.incomingQuantity ?? 0}
              </strong>
            </div>
            <div className="detail-card">
              <span>Available After Incoming</span>
              <strong>
                {getAvailableAfterIncoming(
                  viewing.quantity_on_hand,
                  reorderBySku.get(viewing.products?.sku ?? "")
                    ?.incomingQuantity ?? 0,
                  Number(viewing.products?.inventory_allocated ?? 0),
                )}
              </strong>
            </div>
            <div className="detail-card">
              <span>COGS</span>
              <strong>
                {formatCurrency(Number(viewing.products?.unit_cost ?? 0))}
              </strong>
            </div>
            <div className="detail-card">
              <span>Margin</span>
              <strong>
                {getMarginMetrics(
                  Number(viewing.products?.unit_cost ?? 0),
                  Number(viewing.products?.unit_price ?? 0),
                ).marginPercent.toFixed(0)}
                %
              </strong>
            </div>
            <div className="detail-card">
              <span>No Bundles</span>
              <strong>{viewing.products?.no_bundles ? "Yes" : "No"}</strong>
            </div>
            <div className="detail-card">
              <span>Status</span>
              <strong
                className={
                  !isGiftCardProductName(viewing.products?.name) &&
                  isInventoryDanger(
                    viewing.quantity_on_hand,
                    eventsByProductId.get(viewing.product_id) ?? [],
                  )
                    ? "danger-text"
                    : ""
                }
              >
                {isGiftCardProductName(viewing.products?.name)
                  ? "Healthy"
                  : getInventoryHealthLabel(
                      viewing.quantity_on_hand,
                      eventsByProductId.get(viewing.product_id) ?? [],
                      viewing.products?.safety_stock ?? 0,
                    )}
              </strong>
            </div>
            <div className="detail-card">
              <span>Reorder Window</span>
              <strong>
                {reorderBySku.get(viewing.products?.sku ?? "")
                  ?.recommendation ?? "Manual review"}
              </strong>
            </div>
            <div className="detail-card">
              <span>Last Updated</span>
              <strong>{new Date(viewing.updated_at).toLocaleString()}</strong>
            </div>
            <div className="detail-card" style={{ gridColumn: "1 / -1" }}>
              <span>Notes</span>
              <strong>{viewing.notes ?? "No notes added."}</strong>
            </div>
          </div>
        </Modal>
      ) : null}
      {adjusting ? (
        <Modal
          title={`Adjust ${adjusting.products?.name ?? "Inventory"}`}
          onClose={() => setAdjusting(null)}
          actions={
            <>
              <button
                className="btn btn-ghost"
                onClick={() => setAdjusting(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  try {
                    if (!adjustmentValues.quantity_change)
                      throw new Error("Quantity change is required.");
                    await inventoryService.createAdjustment({
                      product_id: adjusting.product_id,
                      location_id: adjusting.location_id,
                      event_type: "Manual Adjustment",
                      quantity_change: Number(adjustmentValues.quantity_change),
                      event_date: adjustmentValues.event_date,
                      notes: adjustmentValues.notes || null,
                    });
                    setAdjusting(null);
                    setAdjustmentValues({
                      quantity_change: 0,
                      event_date: new Date().toISOString().slice(0, 10),
                      notes: "",
                    });
                    await reload();
                    setNotice({
                      tone: "success",
                      message: "Inventory adjusted successfully.",
                    });
                  } catch (err) {
                    setNotice({
                      tone: "error",
                      message:
                        err instanceof Error
                          ? err.message
                          : "Failed to adjust inventory.",
                    });
                  }
                }}
              >
                Save Adjustment
              </button>
            </>
          }
        >
          <div className="form-grid">
            <div className="field field-half">
              <label>Quantity Change</label>
              <input
                type="number"
                value={adjustmentValues.quantity_change}
                onChange={(event) =>
                  setAdjustmentValues((current) => ({
                    ...current,
                    quantity_change: Number(event.target.value),
                  }))
                }
              />
            </div>
            <div className="field field-half">
              <label>Event Date</label>
              <input
                type="date"
                value={adjustmentValues.event_date}
                onChange={(event) =>
                  setAdjustmentValues((current) => ({
                    ...current,
                    event_date: event.target.value,
                  }))
                }
              />
            </div>
            <div className="field field-wide">
              <label>Notes</label>
              <textarea
                rows={3}
                value={adjustmentValues.notes}
                onChange={(event) =>
                  setAdjustmentValues((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
              />
            </div>
          </div>
        </Modal>
      ) : null}
      {transferring ? (
        <Modal
          title={`Transfer ${transferring.products?.name ?? "Inventory"}`}
          onClose={() => setTransferring(null)}
          actions={
            <>
              <button
                className="btn btn-ghost"
                onClick={() => setTransferring(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  try {
                    if (!transferValues.target_location_id)
                      throw new Error("Target location is required.");
                    if (transferValues.quantity <= 0)
                      throw new Error(
                        "Transfer quantity must be greater than zero.",
                      );
                    await inventoryService.transferItem({
                      inventoryItemId: transferring.id,
                      targetLocationId: transferValues.target_location_id,
                      quantity: Number(transferValues.quantity),
                      notes: transferValues.notes,
                      eventDate: transferValues.event_date,
                    });
                    setTransferring(null);
                    setTransferValues({
                      quantity: 0,
                      target_location_id: "",
                      event_date: new Date().toISOString().slice(0, 10),
                      notes: "",
                    });
                    await reload();
                    setNotice({
                      tone: "success",
                      message: "Inventory transferred successfully.",
                    });
                  } catch (err) {
                    setNotice({
                      tone: "error",
                      message:
                        err instanceof Error
                          ? err.message
                          : "Failed to transfer inventory.",
                    });
                  }
                }}
              >
                Transfer
              </button>
            </>
          }
        >
          <div className="form-grid">
            <div className="field field-half">
              <label>Quantity</label>
              <input
                type="number"
                min="1"
                value={transferValues.quantity}
                onChange={(event) =>
                  setTransferValues((current) => ({
                    ...current,
                    quantity: Number(event.target.value),
                  }))
                }
              />
            </div>
            <div className="field field-half">
              <label>Target Location</label>
              <select
                value={transferValues.target_location_id}
                onChange={(event) =>
                  setTransferValues((current) => ({
                    ...current,
                    target_location_id: event.target.value,
                  }))
                }
              >
                <option value="">Select location...</option>
                {data.locations
                  .filter(
                    (location) => location.id !== transferring.location_id,
                  )
                  .map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="field field-half">
              <label>Event Date</label>
              <input
                type="date"
                value={transferValues.event_date}
                onChange={(event) =>
                  setTransferValues((current) => ({
                    ...current,
                    event_date: event.target.value,
                  }))
                }
              />
            </div>
            <div className="field field-wide">
              <label>Notes</label>
              <textarea
                rows={3}
                value={transferValues.notes}
                onChange={(event) =>
                  setTransferValues((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
              />
            </div>
          </div>
        </Modal>
      ) : null}
      {cleanupOpen ? (
        <Modal
          title="Clean Up Inventory"
          onClose={() => setCleanupOpen(false)}
          actions={
            <button
              className="btn btn-ghost"
              onClick={() => setCleanupOpen(false)}
            >
              Close
            </button>
          }
        >
          {(() => {
            const duplicateGroups = findDuplicateInventoryGroups(data.items);
            if (!duplicateGroups.length) {
              return (
                <div className="empty-state">
                  No duplicate inventory records found. Every SKU at each
                  location maps to a single product record.
                </div>
              );
            }
            return (
              <div className="section-stack">
                <p className="modal-message">
                  {duplicateGroups.length} SKU/location group(s) found with more
                  than one product record. Review each row and delete the ones
                  that should not exist.
                </p>
                {duplicateGroups.map((group) => (
                  <div
                    key={`${group.sku}::${group.locationId}`}
                    className="panel section-stack"
                  >
                    <div className="panel-header">
                      <h3>
                        {group.sku} at {group.locationName}
                      </h3>
                    </div>
                    <DataTable
                      emptyMessage="No rows."
                      columns={[
                        {
                          key: "product",
                          title: "Product",
                          render: (row: InventoryItem) => (
                            <div className="cell-stack">
                              <strong>
                                {row.products?.name ?? "Unknown Product"}
                              </strong>
                              <span className="helper-text">
                                {row.products
                                  ? getProductVariantLabel(row.products)
                                  : ""}
                              </span>
                            </div>
                          ),
                        },
                        {
                          key: "quantity",
                          title: "On Hand",
                          render: (row: InventoryItem) => row.quantity_on_hand,
                        },
                        {
                          key: "notes",
                          title: "Notes",
                          render: (row: InventoryItem) => row.notes ?? "N/A",
                        },
                        {
                          key: "updated",
                          title: "Last Updated",
                          render: (row: InventoryItem) =>
                            new Date(row.updated_at).toLocaleString(),
                        },
                        {
                          key: "actions",
                          title: "Actions",
                          render: (row: InventoryItem) => (
                            <button
                              className="btn btn-danger btn-small"
                              onClick={() => setDeleting(row)}
                            >
                              Delete
                            </button>
                          ),
                        },
                      ]}
                      rows={group.items}
                    />
                  </div>
                ))}
              </div>
            );
          })()}
        </Modal>
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title="Delete inventory record?"
          message={`This will remove the ${deleting.products?.name ?? "inventory"} record from ${deleting.locations?.name ?? "this location"}.`}
          busy={busyDelete}
          onClose={() => {
            if (!busyDelete) setDeleting(null);
          }}
          onConfirm={async () => {
            try {
              setBusyDelete(true);
              await inventoryService.removeItem(deleting.id);
              setDeleting(null);
              await reload();
              setNotice({
                tone: "success",
                message: "Inventory record deleted successfully.",
              });
            } catch (err) {
              setNotice({
                tone: "error",
                message:
                  err instanceof Error
                    ? err.message
                    : "Failed to delete inventory record.",
              });
            } finally {
              setBusyDelete(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}
