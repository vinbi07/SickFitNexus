import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DashboardCard } from "@/components/DashboardCard";
import { DataTable } from "@/components/DataTable";
import { EntityFormModal } from "@/components/EntityFormModal";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Modal } from "@/components/Modal";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsyncData } from "@/hooks/useAsyncData";
import { inventoryService } from "@/services/inventoryService";
import { supportService } from "@/services/supportService";
import type { InventoryItem } from "@/types/domain";
import { calculateAverageDailyUsage } from "@/utils/forecasting";
import { formatCurrency, formatDate } from "@/utils/format";

type InventoryItemFormValues = Partial<InventoryItem>;

export function InventoryPage() {
  const [editing, setEditing] = useState<InventoryItemFormValues | null>(null);
  const [viewing, setViewing] = useState<InventoryItem | null>(null);
  const [deleting, setDeleting] = useState<InventoryItem | null>(null);
  const [adjusting, setAdjusting] = useState<InventoryItem | null>(null);
  const [transferring, setTransferring] = useState<InventoryItem | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
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
  const [inventoryCategory, setInventoryCategory] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [sort, setSort] = useState("updated");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const { data, loading, error, reload } = useAsyncData(
    async () => ({
      items: await inventoryService.listItems(),
      events: await inventoryService.listEvents(),
      products: await supportService.listProducts(),
      locations: await supportService.listLocations(),
    }),
    [],
  );

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load inventory"} />;

  const eventsByProductId = new Map<string, typeof data.events>();
  data.events.forEach((event) => {
    if (!event.product_id) return;
    const current = eventsByProductId.get(event.product_id) ?? [];
    current.push(event);
    eventsByProductId.set(event.product_id, current);
  });

  const filteredItems = data.items
    .filter((item) => {
      const query = search.trim().toLowerCase();
      const matchesSearch =
        !query ||
        (item.products?.name ?? "").toLowerCase().includes(query) ||
        (item.products?.sku ?? "").toLowerCase().includes(query) ||
        (item.locations?.name ?? "").toLowerCase().includes(query);
      const matchesLocation = !locationId || item.location_id === locationId;
      const matchesCategory = !inventoryCategory || item.inventory_category === inventoryCategory;
      const usageRate = calculateAverageDailyUsage(eventsByProductId.get(item.product_id) ?? []);
      const daysRemaining = usageRate > 0 ? item.quantity_on_hand / usageRate : null;
      const threshold = Math.max(item.reorder_point, item.products?.safety_stock ?? 0);
      const isOosRisk =
        item.quantity_on_hand <= threshold ||
        (daysRemaining !== null && daysRemaining > 0 && daysRemaining <= 30);
      const isOverstock =
        daysRemaining !== null
          ? daysRemaining >= 365
          : item.quantity_on_hand > Math.max(item.target_stock, item.products?.safety_stock ?? 0);
      const matchesRisk =
        !riskFilter ||
        (riskFilter === "oos" && isOosRisk) ||
        (riskFilter === "overstock" && isOverstock);
      return matchesSearch && matchesLocation && matchesCategory && matchesRisk;
    })
    .sort((left, right) => {
      if (sort === "quantity") return right.quantity_on_hand - left.quantity_on_hand;
      if (sort === "low-stock") {
        const leftDelta = left.quantity_on_hand - left.reorder_point;
        const rightDelta = right.quantity_on_hand - right.reorder_point;
        return leftDelta - rightDelta;
      }
      return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
    });

  const totalUnitsOnHand = data.items.reduce(
    (sum, item) => sum + Number(item.quantity_on_hand ?? 0),
    0,
  );
  const projectedOosIn30Days = data.items.filter((item) => {
    if (!item.products) return false;
    const usageRate = calculateAverageDailyUsage(eventsByProductId.get(item.product_id) ?? []);
    if (usageRate <= 0) return false;
    const daysRemaining = item.quantity_on_hand / usageRate;
    return daysRemaining > 0 && daysRemaining <= 30;
  });
  const overstockOverOneYear = data.items.filter((item) => {
    if (!item.products) return false;
    const usageRate = calculateAverageDailyUsage(eventsByProductId.get(item.product_id) ?? []);
    if (usageRate <= 0) return item.quantity_on_hand > Math.max(item.target_stock, item.products.safety_stock ?? 0);
    const daysRemaining = item.quantity_on_hand / usageRate;
    return daysRemaining >= 365;
  });
  const ancillaryCount = data.items.filter((item) => {
    if (item.inventory_category !== "Core") return true;
    return Boolean(item.products?.ancillary_category);
  }).length;
  const missingCostCount = data.items.filter((item) => Number(item.products?.unit_cost ?? 0) <= 0).length;
  const inventoryValue = data.items.reduce(
    (sum, item) => sum + item.quantity_on_hand * Number(item.products?.unit_cost ?? 0),
    0,
  );

  return (
    <div className="section-stack">
      <PageHeader
        title="Inventory"
        description="Manage stock by product and location, with adjustments, transfers, low-stock visibility, ancillary packaging inventory, and full movement history."
        actions={<button className="btn btn-primary" onClick={() => setEditing({ product_id: "", location_id: "", inventory_category: "Core" })}>Add New Inventory</button>}
      />
      {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}
      <div className="card-grid">
        <DashboardCard label="Units on Hand" value={totalUnitsOnHand} footnote="Total units across all inventory records" />
        <DashboardCard label="OOS <30 Days" value={projectedOosIn30Days.length} footnote={projectedOosIn30Days.length ? "Critical risk based on recent velocity" : "No near-term projected stockouts"} />
        <DashboardCard label="Overstock >1 Yr" value={overstockOverOneYear.length} footnote={overstockOverOneYear.length ? "Slow-moving inventory flagged" : "No long-tail overstock flagged"} />
        <DashboardCard label="Inventory Value" value={formatCurrency(inventoryValue)} footnote={missingCostCount > 0 ? `${missingCostCount} records missing unit cost` : "Calculated from product unit cost"} />
      </div>
      <div className="panel">
        <div className="panel-header">
          <h3>Supporting Metrics</h3>
        </div>
        <div className="pill-row">
          <StatusBadge label={`${ancillaryCount} ancillary / packaging`} />
          <StatusBadge label={`${data.items.length} inventory records`} />
        </div>
      </div>
      <div className="panel">
        <div className="filter-row">
          <input placeholder="Search product, SKU, or location" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
            <option value="">All locations</option>
            {data.locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
          <select value={inventoryCategory} onChange={(event) => setInventoryCategory(event.target.value)}>
            <option value="">All inventory categories</option>
            <option value="Core">Core</option>
            <option value="Packaging">Packaging</option>
            <option value="Ancillary">Ancillary</option>
          </select>
          <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}>
            <option value="">All inventory risks</option>
            <option value="oos">OOS / near OOS</option>
            <option value="overstock">Overstock</option>
          </select>
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="updated">Sort by recent updates</option>
            <option value="quantity">Sort by quantity</option>
            <option value="low-stock">Sort by low stock risk</option>
          </select>
          <button className="btn btn-secondary" onClick={() => void reload()}>
            Refresh
          </button>
        </div>
      </div>
      <div className="panel section-stack">
        <div className="panel-header"><h3>Inventory Records</h3></div>
        <DataTable
          emptyMessage="No inventory records yet. Create an inventory record to assign a product to a location."
          columns={[
            {
              key: "product",
              title: "Product",
              render: (row) => (
                <div className="cell-stack">
                  <strong>{row.products?.name ?? "Unknown Product"}</strong>
                  <span className="helper-text">{row.products?.sku ?? "No SKU"}</span>
                </div>
              ),
            },
            { key: "location", title: "Location", render: (row) => row.locations?.name ?? "Unknown Location" },
            {
              key: "inventory_category",
              title: "Category",
              render: (row) => {
                if (row.inventory_category && row.inventory_category !== "Core") return row.inventory_category;
                if (row.products?.ancillary_category) return row.products.ancillary_category;
                return "Core";
              },
            },
            { key: "quantity_on_hand", title: "On Hand", render: (row) => row.quantity_on_hand },
            { key: "reorder_point", title: "Reorder Point", render: (row) => row.reorder_point },
            { key: "target_stock", title: "Target Stock", render: (row) => row.target_stock },
            {
              key: "status",
              title: "Status",
              render: (row) => {
                const threshold = Math.max(row.reorder_point, row.products?.safety_stock ?? 0);
                return row.quantity_on_hand <= threshold ? (
                  <StatusBadge label="Low Stock" />
                ) : (
                  <StatusBadge label="Healthy" />
                );
              },
            },
            {
              key: "actions",
              title: "Actions",
              render: (row) => (
                <div className="btn-row">
                  <button className="btn btn-ghost btn-small" onClick={() => setViewing(row)}>
                    View Details
                  </button>
                  <button className="btn btn-secondary btn-small" onClick={() => setEditing(row)}>
                    Edit
                  </button>
                  <button className="btn btn-secondary btn-small" onClick={() => setAdjusting(row)}>
                    Adjust
                  </button>
                  <button className="btn btn-secondary btn-small" onClick={() => setTransferring(row)}>
                    Transfer
                  </button>
                  <button className="btn btn-danger btn-small" onClick={() => setDeleting(row)}>
                    Delete
                  </button>
                </div>
              ),
            },
          ]}
          rows={filteredItems}
        />
      </div>
      <div className="panel section-stack">
        <div className="panel-header"><h3>Inventory History</h3></div>
        <DataTable
          emptyMessage="No inventory events yet."
          columns={[
            { key: "event_type", title: "Event", render: (row) => row.event_type },
            { key: "product", title: "Product", render: (row) => row.products?.name ?? "N/A" },
            { key: "location", title: "Location", render: (row) => row.locations?.name ?? "N/A" },
            { key: "quantity_change", title: "Change", render: (row) => row.quantity_change },
            { key: "event_date", title: "Date", render: (row) => formatDate(row.event_date) },
            { key: "notes", title: "Notes", render: (row) => row.notes ?? "N/A" },
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
            { key: "product_id", label: "Product", type: "select", required: true, options: data.products.map((product) => ({ label: `${product.sku} | ${product.name}`, value: product.id })) },
            { key: "location_id", label: "Location", type: "select", required: true, options: data.locations.map((location) => ({ label: location.name, value: location.id })) },
            { key: "inventory_category", label: "Inventory Category", type: "select", options: [{ label: "Core", value: "Core" }, { label: "Packaging", value: "Packaging" }, { label: "Ancillary", value: "Ancillary" }] },
            { key: "quantity_on_hand", label: "On Hand Quantity", type: "number", step: 1 },
            { key: "reorder_point", label: "Reorder Point", type: "number", min: 0, step: 1 },
            { key: "target_stock", label: "Target Stock", type: "number", min: 0, step: 1 },
            { key: "notes", label: "Notes", type: "textarea" },
          ]}
          onSave={async (values) => {
            if (!String(values.product_id ?? "").trim()) throw new Error("Product is required.");
            if (!String(values.location_id ?? "").trim()) throw new Error("Location is required.");
            await inventoryService.saveItem({
              ...editing,
              ...values,
              product_id: String(values.product_id),
              location_id: String(values.location_id),
              inventory_category: (values.inventory_category ? String(values.inventory_category) : "Core") as InventoryItem["inventory_category"],
              quantity_on_hand: Number(values.quantity_on_hand ?? 0),
              reorder_point: Number(values.reorder_point ?? 0),
              target_stock: Number(values.target_stock ?? 0),
              notes: values.notes ? String(values.notes) : null,
            });
            await reload();
            setNotice({
              tone: "success",
              message: editing.id ? "Inventory record updated successfully." : "Inventory record created successfully.",
            });
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {viewing ? (
        <Modal
          title={`${viewing.products?.name ?? "Inventory"} at ${viewing.locations?.name ?? "Location"}`}
          onClose={() => setViewing(null)}
          actions={<button className="btn btn-ghost" onClick={() => setViewing(null)}>Cancel</button>}
        >
          <div className="detail-grid">
            <div className="detail-card"><span>SKU</span><strong>{viewing.products?.sku ?? "N/A"}</strong></div>
            <div className="detail-card"><span>Vendor</span><strong>{viewing.products?.vendors?.name ?? "Unassigned"}</strong></div>
            <div className="detail-card"><span>Category</span><strong>{viewing.inventory_category !== "Core" ? viewing.inventory_category : viewing.products?.ancillary_category ?? "Core"}</strong></div>
            <div className="detail-card"><span>On Hand</span><strong>{viewing.quantity_on_hand}</strong></div>
            <div className="detail-card"><span>Reorder Point</span><strong>{viewing.reorder_point}</strong></div>
            <div className="detail-card"><span>Target Stock</span><strong>{viewing.target_stock}</strong></div>
            <div className="detail-card"><span>Unit Cost</span><strong>{formatCurrency(Number(viewing.products?.unit_cost ?? 0))}</strong></div>
            <div className="detail-card"><span>Last Updated</span><strong>{new Date(viewing.updated_at).toLocaleString()}</strong></div>
            <div className="detail-card" style={{ gridColumn: "1 / -1" }}><span>Notes</span><strong>{viewing.notes ?? "No notes added."}</strong></div>
          </div>
        </Modal>
      ) : null}
      {adjusting ? (
        <Modal
          title={`Adjust ${adjusting.products?.name ?? "Inventory"}`}
          onClose={() => setAdjusting(null)}
          actions={
            <>
              <button className="btn btn-ghost" onClick={() => setAdjusting(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  try {
                    if (!adjustmentValues.quantity_change) throw new Error("Quantity change is required.");
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
                    setNotice({ tone: "success", message: "Inventory adjusted successfully." });
                  } catch (err) {
                    setNotice({ tone: "error", message: err instanceof Error ? err.message : "Failed to adjust inventory." });
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
              <input type="number" value={adjustmentValues.quantity_change} onChange={(event) => setAdjustmentValues((current) => ({ ...current, quantity_change: Number(event.target.value) }))} />
            </div>
            <div className="field field-half">
              <label>Event Date</label>
              <input type="date" value={adjustmentValues.event_date} onChange={(event) => setAdjustmentValues((current) => ({ ...current, event_date: event.target.value }))} />
            </div>
            <div className="field field-wide">
              <label>Notes</label>
              <textarea rows={3} value={adjustmentValues.notes} onChange={(event) => setAdjustmentValues((current) => ({ ...current, notes: event.target.value }))} />
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
              <button className="btn btn-ghost" onClick={() => setTransferring(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  try {
                    if (!transferValues.target_location_id) throw new Error("Target location is required.");
                    if (transferValues.quantity <= 0) throw new Error("Transfer quantity must be greater than zero.");
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
                    setNotice({ tone: "success", message: "Inventory transferred successfully." });
                  } catch (err) {
                    setNotice({ tone: "error", message: err instanceof Error ? err.message : "Failed to transfer inventory." });
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
              <input type="number" min="1" value={transferValues.quantity} onChange={(event) => setTransferValues((current) => ({ ...current, quantity: Number(event.target.value) }))} />
            </div>
            <div className="field field-half">
              <label>Target Location</label>
              <select value={transferValues.target_location_id} onChange={(event) => setTransferValues((current) => ({ ...current, target_location_id: event.target.value }))}>
                <option value="">Select location...</option>
                {data.locations.filter((location) => location.id !== transferring.location_id).map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field field-half">
              <label>Event Date</label>
              <input type="date" value={transferValues.event_date} onChange={(event) => setTransferValues((current) => ({ ...current, event_date: event.target.value }))} />
            </div>
            <div className="field field-wide">
              <label>Notes</label>
              <textarea rows={3} value={transferValues.notes} onChange={(event) => setTransferValues((current) => ({ ...current, notes: event.target.value }))} />
            </div>
          </div>
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
              setNotice({ tone: "success", message: "Inventory record deleted successfully." });
            } catch (err) {
              setNotice({ tone: "error", message: err instanceof Error ? err.message : "Failed to delete inventory record." });
            } finally {
              setBusyDelete(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}
