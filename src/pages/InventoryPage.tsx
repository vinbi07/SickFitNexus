import { useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DashboardCard } from "@/components/DashboardCard";
import { DataTable } from "@/components/DataTable";
import { EntityFormModal } from "@/components/EntityFormModal";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Modal } from "@/components/Modal";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader } from "@/components/PageHeader";
import { ProductNameWithMetadata } from "@/components/ProductNameWithMetadata";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useDropdownPosition } from "@/hooks/useDropdownPosition";
import { dashboardService } from "@/services/dashboardService";
import { inventoryService } from "@/services/inventoryService";
import { supportService } from "@/services/supportService";
import type { InventoryEvent, InventoryItem } from "@/types/domain";
import { formatCurrency, formatDate } from "@/utils/format";
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
  isInventoryDanger,
  SOCK_TYPES,
} from "@/utils/operations";
import { getProductVariantLabel, getUnitsPerPack } from "@/utils/lookbook";

const NON_SOCK_FILTER_VALUE = "__non_sock__";

type InventoryItemFormValues = Partial<InventoryItem>;

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
  const [search, setSearch] = useState("");
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
  const viewOptions = useDropdownPosition();
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
      const matchesIgnoredOnly = !ignoredOnly || item.products?.ignored;
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
        (showIgnoredProducts || ignoredOnly || !item.products?.ignored);
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

  const viewOptionsActiveCount = [
    bundlesOnly,
    showHiddenCategories,
    showIgnoredProducts,
    ignoredOnly,
  ].filter(Boolean).length;

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

  const nonGiftCardItems = data.items.filter(
    (item) =>
      !isGiftCardProductName(item.products?.name) && !item.products?.ignored,
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
        title="Inventory"
        description="Track what is physically in stock, what is already committed to orders, and what is incoming from manufacturing."
        actions={
          <div className="btn-row">
            <button
              className="btn btn-secondary"
              onClick={() => setCleanupOpen(true)}
            >
              Clean Up Inventory
            </button>
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
              Add New Inventory
            </button>
          </div>
        }
      />
      {notice ? (
        <NotificationBanner
          tone={notice.tone}
          message={notice.message}
          onClose={() => setNotice(null)}
        />
      ) : null}
      <div className="card-grid">
        <DashboardCard
          label="Units on Hand"
          value={totalUnitsOnHand}
          footnote="Across all tracked inventory records"
        />
        <DashboardCard
          label="Danger Inventory"
          value={dangerCount}
          footnote="Products with 25 units or less on hand"
        />
        <DashboardCard
          label="Incoming Units"
          value={data.snapshot.incomingInventoryUnits}
          footnote="Manufacturer inventory still in route"
        />
        <DashboardCard
          label="Inventory Value"
          value={formatCurrency(inventoryValue)}
          footnote={`${noBundlesCount} no-bundles SKUs flagged`}
        />
      </div>
      <div className="panel">
        <div className="filter-row">
          <input
            placeholder="Search product, SKU, or location"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
          >
            <option value="">All locations</option>
            {data.locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            value={packSizeFilter}
            onChange={(event) => setPackSizeFilter(event.target.value)}
          >
            <option value="">All Pack Sizes</option>
            {[1, 2, 3, 6, 10, 12].map((count) => (
              <option key={count} value={count}>
                {count === 1 ? "1-Pack (Single)" : `${count}-Pack`}
              </option>
            ))}
          </select>
          <select
            value={sockTypeFilter}
            onChange={(event) => setSockTypeFilter(event.target.value)}
          >
            <option value="">All Sock Types</option>
            {SOCK_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
            <option value={NON_SOCK_FILTER_VALUE}>
              Other / Non-Sock (Apparel)
            </option>
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">All Statuses</option>
            {["Healthy", "Low", "Danger", "Slow Mover"].map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="danger">Sort by danger</option>
            <option value="incoming">Sort by incoming quantity</option>
            <option value="quantity">Sort by quantity</option>
          </select>
          <button
            ref={viewOptions.triggerRef}
            type="button"
            className="btn btn-secondary"
            onClick={() => viewOptions.setOpen((current) => !current)}
          >
            View Options
            {viewOptionsActiveCount > 0 ? ` (${viewOptionsActiveCount})` : ""}
          </button>
          {viewOptions.open
            ? createPortal(
                <div
                  ref={viewOptions.popoverRef}
                  className="date-picker-popover-portal view-options-popover"
                  style={{
                    top: viewOptions.position.top,
                    left: viewOptions.position.left,
                  }}
                >
                  <label className="view-options-item">
                    <input
                      type="checkbox"
                      checked={bundlesOnly}
                      onChange={(event) => setBundlesOnly(event.target.checked)}
                    />
                    Show Bundles Only
                  </label>
                  <label className="view-options-item">
                    <input
                      type="checkbox"
                      checked={showHiddenCategories}
                      onChange={(event) =>
                        setShowHiddenCategories(event.target.checked)
                      }
                    />
                    Show Bundles &amp; Gift Cards
                  </label>
                  <label className="view-options-item">
                    <input
                      type="checkbox"
                      checked={showIgnoredProducts}
                      onChange={(event) =>
                        setShowIgnoredProducts(event.target.checked)
                      }
                    />
                    Show Ignored
                  </label>
                  <label className="view-options-item">
                    <input
                      type="checkbox"
                      checked={ignoredOnly}
                      onChange={(event) => setIgnoredOnly(event.target.checked)}
                    />
                    Ignored Only
                  </label>
                  <div className="view-options-divider" />
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={() => {
                      void reload();
                      viewOptions.setOpen(false);
                    }}
                  >
                    Refresh
                  </button>
                </div>,
                document.body,
              )
            : null}
        </div>
      </div>
      <div className="panel">
        <div className="btn-row">
          <span>
            Showing {filteredItems.length} of {data.items.length} inventory
            records
          </span>
          {activeFilters.length > 0 ? (
            <>
              {activeFilters.map((filter) => (
                <button
                  key={filter.key}
                  className="btn btn-ghost btn-small"
                  onClick={filter.onClear}
                >
                  {filter.label} &times;
                </button>
              ))}
              <button
                className="btn btn-ghost btn-small"
                onClick={clearAllFilters}
              >
                Clear All Filters
              </button>
            </>
          ) : (
            <span className="helper-text">No filters applied</span>
          )}
        </div>
      </div>
      <div className="panel section-stack">
        <div className="panel-header">
          <h3>Inventory Records</h3>
        </div>
        <DataTable
          emptyMessage="No inventory records yet. Create an inventory record to assign a product to a location."
          columns={[
            {
              key: "product",
              title: "Product",
              render: (row) => (
                <ProductNameWithMetadata product={row.products} large />
              ),
            },
            {
              key: "quantities",
              title: "Stock",
              render: (row) => {
                const incoming =
                  reorderBySku.get(row.products?.sku ?? "")?.incomingQuantity ??
                  0;
                const committed = Number(
                  row.products?.inventory_allocated ?? 0,
                );
                const oversoldLabel = getOversoldLabel(row.quantity_on_hand);
                return (
                  <div className="cell-stack">
                    <strong>
                      {oversoldLabel ?? `On hand ${row.quantity_on_hand}`}
                    </strong>
                    <span className="helper-text">Committed {committed}</span>
                    <span className="helper-text">Incoming {incoming}</span>
                    {/* Committed/Incoming are product-level aggregates, not per-location,
                        so multi-location products repeat the same values on each row. */}
                    <span className="helper-text">
                      {row.locations?.name ?? "Unknown Location"}
                    </span>
                  </div>
                );
              },
            },
            {
              key: "available_after_incoming",
              title: "Available After Incoming",
              render: (row) => {
                const incoming =
                  reorderBySku.get(row.products?.sku ?? "")?.incomingQuantity ??
                  0;
                const committed = Number(
                  row.products?.inventory_allocated ?? 0,
                );
                return (
                  <strong>
                    {getAvailableAfterIncoming(
                      row.quantity_on_hand,
                      incoming,
                      committed,
                    )}
                  </strong>
                );
              },
            },
            {
              key: "planning",
              title: "Planning",
              render: (row) => {
                const margin = getMarginMetrics(
                  Number(row.products?.unit_cost ?? 0),
                  Number(row.products?.unit_price ?? 0),
                );
                return (
                  <div className="cell-stack">
                    <strong>
                      {formatCurrency(Number(row.products?.unit_cost ?? 0))}{" "}
                      COGS
                    </strong>
                    <span className="helper-text">
                      {formatCurrency(margin.marginDollars)} |{" "}
                      {margin.marginPercent.toFixed(0)}% margin
                    </span>
                    <span className="helper-text">
                      {row.products?.no_bundles
                        ? "No bundles"
                        : "Bundles allowed"}
                    </span>
                  </div>
                );
              },
            },
            {
              key: "status",
              title: "Status",
              render: (row) => {
                if (isGiftCardProductName(row.products?.name)) {
                  return <StatusBadge label="Safe" />;
                }
                const incoming =
                  reorderBySku.get(row.products?.sku ?? "")?.incomingQuantity ??
                  0;
                const tone = getInventoryHealthTone(
                  row.quantity_on_hand,
                  eventsByProductId.get(row.product_id) ?? [],
                  row.products?.safety_stock ?? 0,
                );
                return (
                  <StatusBadge
                    label={getInventoryRiskStatus(
                      row.quantity_on_hand,
                      tone,
                      incoming,
                    )}
                  />
                );
              },
            },
            {
              key: "last_updated",
              title: "Last Updated",
              render: (row) => formatDate(row.updated_at),
            },
            {
              key: "actions",
              title: "Actions",
              render: (row) => (
                <div className="btn-row">
                  <button
                    className="btn btn-ghost btn-small"
                    onClick={() => setViewing(row)}
                  >
                    View Details
                  </button>
                  <button
                    className="btn btn-secondary btn-small po-edit-btn"
                    onClick={() => setEditing(row)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-danger btn-small po-edit-btn"
                    onClick={() => setDeleting(row)}
                  >
                    Delete
                  </button>
                  <RowActionsMenu>
                    <button
                      className="btn btn-secondary btn-small po-edit-btn"
                      onClick={() => setAdjusting(row)}
                    >
                      Adjust
                    </button>
                    <button
                      className="btn btn-secondary btn-small"
                      onClick={() => setTransferring(row)}
                    >
                      Transfer
                    </button>
                    {/* TODO: deep-link vendor/product once the PO builder supports prefill query params */}
                    <Link
                      className="btn btn-secondary btn-small"
                      to="/purchase-orders/new"
                    >
                      Create Manufacturing PO
                    </Link>
                  </RowActionsMenu>
                </div>
              ),
            },
          ]}
          rows={filteredItems}
        />
      </div>
      <div className="panel section-stack">
        <div className="panel-header">
          <h3>Inventory History</h3>
        </div>
        <DataTable
          emptyMessage="No inventory events yet."
          columns={[
            {
              key: "event_type",
              title: "Event",
              render: (row) => row.event_type,
            },
            {
              key: "product",
              title: "Product",
              render: (row) => row.products?.name ?? "N/A",
            },
            {
              key: "location",
              title: "Location",
              render: (row) => row.locations?.name ?? "N/A",
            },
            {
              key: "quantity_change",
              title: "Change",
              render: (row) => row.quantity_change,
            },
            {
              key: "event_date",
              title: "Date",
              render: (row) => formatDate(row.event_date),
            },
            {
              key: "notes",
              title: "Notes",
              render: (row) => row.notes ?? "N/A",
            },
          ]}
          rows={data.events.slice(0, 20)}
        />
      </div>
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
