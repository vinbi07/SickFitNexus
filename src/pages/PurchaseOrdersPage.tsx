import { useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DashboardCard } from "@/components/DashboardCard";
import { DataTable } from "@/components/DataTable";
import { ErrorState } from "@/components/ErrorState";
import { InlineErrorLog } from "@/components/InlineErrorLog";
import { LoadingState } from "@/components/LoadingState";
import { Modal } from "@/components/Modal";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsyncData } from "@/hooks/useAsyncData";
import { purchaseOrderService } from "@/services/purchaseOrderService";
import { retailerService } from "@/services/retailerService";
import { supportService } from "@/services/supportService";
import { vendorService } from "@/services/vendorService";
import type { PoLineItem, Product, PurchaseOrder, PurchaseOrderStatus, PurchaseOrderType } from "@/types/domain";
import { getUiErrorLog, type UiErrorLog } from "@/utils/errors";
import { formatCurrency, formatDate } from "@/utils/format";

const purchaseOrderStatuses: PurchaseOrderStatus[] = [
  "Draft",
  "Pending",
  "Ordered",
  "In Transit",
  "Partially Received",
  "Received",
  "Cancelled",
  "Delayed",
  "Issue Flagged",
  "Closed",
];

const purchaseOrderTypes: PurchaseOrderType[] = [
  "Manufacturer PO",
  "Retailer PO",
  "Work Order",
  "Customer Reorder",
];

type PurchaseOrderEditor = {
  purchaseOrder: Partial<PurchaseOrder>;
  lineItems: Array<Partial<PoLineItem>>;
};

function PurchaseOrderModal({
  initialValue,
  products,
  vendors,
  retailers,
  locations,
  onClose,
  onSaved,
}: {
  initialValue: PurchaseOrderEditor;
  products: Product[];
  vendors: Array<{ id: string; name: string }>;
  retailers: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [purchaseOrder, setPurchaseOrder] = useState<Partial<PurchaseOrder>>({
    po_number: initialValue.purchaseOrder.po_number ?? "",
    vendor_id: initialValue.purchaseOrder.vendor_id ?? "",
    retailer_id: initialValue.purchaseOrder.retailer_id ?? "",
    location_id: initialValue.purchaseOrder.location_id ?? "",
    po_type: initialValue.purchaseOrder.po_type ?? "Retailer PO",
    status: initialValue.purchaseOrder.status ?? "Pending",
    order_date: initialValue.purchaseOrder.order_date ?? new Date().toISOString().slice(0, 10),
    submitted_at: initialValue.purchaseOrder.submitted_at ?? new Date().toISOString().slice(0, 10),
    expected_delivery_date: initialValue.purchaseOrder.expected_delivery_date ?? "",
    actual_delivery_date: initialValue.purchaseOrder.actual_delivery_date ?? "",
    invoice_paid_at: initialValue.purchaseOrder.invoice_paid_at ?? "",
    tracking_number: initialValue.purchaseOrder.tracking_number ?? "",
    tracking_status: initialValue.purchaseOrder.tracking_status ?? "",
    source_channel: initialValue.purchaseOrder.source_channel ?? "Email forward",
    notes: initialValue.purchaseOrder.notes ?? "",
  });
  const [lineItems, setLineItems] = useState<Array<Partial<PoLineItem>>>(
    initialValue.lineItems.length
      ? initialValue.lineItems
      : [{ product_id: "", sku: "", product_name: "", quantity_ordered: 1, quantity_received: 0, unit_cost: 0 }],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<UiErrorLog | null>(null);
  const totalCost = lineItems.reduce(
    (sum, item) => sum + Number(item.quantity_ordered ?? 0) * Number(item.unit_cost ?? 0),
    0,
  );

  return (
    <Modal
      title={initialValue.purchaseOrder.id ? "Edit Purchase Order" : "Create Purchase Order"}
      onClose={onClose}
      actions={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={saving}
            onClick={async () => {
              try {
                setSaving(true);
                setError(null);
                if (!String(purchaseOrder.po_number ?? "").trim()) throw new Error("PO number is required.");
                if (!lineItems.length) throw new Error("Add at least one line item.");
                lineItems.forEach((item, index) => {
                  if (!String(item.product_name ?? "").trim()) throw new Error(`Line item ${index + 1} must include a product name.`);
                  if (Number(item.quantity_ordered ?? 0) <= 0) throw new Error(`Line item ${index + 1} must have a quantity ordered greater than zero.`);
                });
                await purchaseOrderService.savePurchaseOrder({
                  purchaseOrder: {
                    ...initialValue.purchaseOrder,
                    ...purchaseOrder,
                    vendor_id: purchaseOrder.vendor_id ? String(purchaseOrder.vendor_id) : null,
                    retailer_id: purchaseOrder.retailer_id ? String(purchaseOrder.retailer_id) : null,
                    location_id: purchaseOrder.location_id ? String(purchaseOrder.location_id) : null,
                    notes: purchaseOrder.notes ? String(purchaseOrder.notes) : null,
                    tracking_number: purchaseOrder.tracking_number ? String(purchaseOrder.tracking_number) : null,
                    tracking_status: purchaseOrder.tracking_status ? String(purchaseOrder.tracking_status) : null,
                    source_channel: purchaseOrder.source_channel ? String(purchaseOrder.source_channel) : null,
                  },
                  lineItems: lineItems.map((item) => ({
                    ...item,
                    sku: String(item.sku ?? ""),
                    product_name: String(item.product_name ?? ""),
                    quantity_ordered: Number(item.quantity_ordered ?? 0),
                    quantity_received: Number(item.quantity_received ?? 0),
                    unit_cost: Number(item.unit_cost ?? 0),
                  })),
                });
                await onSaved(initialValue.purchaseOrder.id ? "Purchase order updated successfully." : "Purchase order created successfully.");
                onClose();
              } catch (err) {
                setError(getUiErrorLog(err, "We couldn't save this purchase order"));
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving..." : initialValue.purchaseOrder.id ? "Save Changes" : "Create PO"}
          </button>
        </>
      }
    >
      <div className="form-grid">
        {error ? <InlineErrorLog error={error} /> : null}
        <div className="field">
          <label>PO Number</label>
          <input value={String(purchaseOrder.po_number ?? "")} onChange={(event) => setPurchaseOrder((current) => ({ ...current, po_number: event.target.value }))} />
        </div>
        <div className="field">
          <label>PO Type</label>
          <select value={String(purchaseOrder.po_type ?? "Retailer PO")} onChange={(event) => setPurchaseOrder((current) => ({ ...current, po_type: event.target.value as PurchaseOrderType }))}>
            {purchaseOrderTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Retailer</label>
          <select value={String(purchaseOrder.retailer_id ?? "")} onChange={(event) => setPurchaseOrder((current) => ({ ...current, retailer_id: event.target.value }))}>
            <option value="">No retailer</option>
            {retailers.map((retailer) => <option key={retailer.id} value={retailer.id}>{retailer.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Vendor / Manufacturer</label>
          <select value={String(purchaseOrder.vendor_id ?? "")} onChange={(event) => setPurchaseOrder((current) => ({ ...current, vendor_id: event.target.value }))}>
            <option value="">No vendor</option>
            {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Location</label>
          <select value={String(purchaseOrder.location_id ?? "")} onChange={(event) => setPurchaseOrder((current) => ({ ...current, location_id: event.target.value }))}>
            <option value="">No location</option>
            {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Status</label>
          <select value={String(purchaseOrder.status ?? "Pending")} onChange={(event) => setPurchaseOrder((current) => ({ ...current, status: event.target.value as PurchaseOrderStatus }))}>
            {purchaseOrderStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Order Date</label>
          <input type="date" value={String(purchaseOrder.order_date ?? "")} onChange={(event) => setPurchaseOrder((current) => ({ ...current, order_date: event.target.value }))} />
        </div>
        <div className="field">
          <label>Submitted</label>
          <input type="date" value={String(purchaseOrder.submitted_at ?? "")} onChange={(event) => setPurchaseOrder((current) => ({ ...current, submitted_at: event.target.value }))} />
        </div>
        <div className="field">
          <label>Expected Delivery</label>
          <input type="date" value={String(purchaseOrder.expected_delivery_date ?? "")} onChange={(event) => setPurchaseOrder((current) => ({ ...current, expected_delivery_date: event.target.value }))} />
        </div>
        <div className="field">
          <label>Actual Delivery</label>
          <input type="date" value={String(purchaseOrder.actual_delivery_date ?? "")} onChange={(event) => setPurchaseOrder((current) => ({ ...current, actual_delivery_date: event.target.value }))} />
        </div>
        <div className="field">
          <label>Invoice Paid</label>
          <input type="date" value={String(purchaseOrder.invoice_paid_at ?? "")} onChange={(event) => setPurchaseOrder((current) => ({ ...current, invoice_paid_at: event.target.value }))} />
        </div>
        <div className="field">
          <label>Tracking Number</label>
          <input value={String(purchaseOrder.tracking_number ?? "")} onChange={(event) => setPurchaseOrder((current) => ({ ...current, tracking_number: event.target.value }))} />
        </div>
        <div className="field">
          <label>Tracking Status</label>
          <input value={String(purchaseOrder.tracking_status ?? "")} onChange={(event) => setPurchaseOrder((current) => ({ ...current, tracking_status: event.target.value }))} />
        </div>
        <div className="field">
          <label>Source Channel</label>
          <input value={String(purchaseOrder.source_channel ?? "")} onChange={(event) => setPurchaseOrder((current) => ({ ...current, source_channel: event.target.value }))} />
        </div>
        <div className="field field-wide">
          <label>Notes</label>
          <textarea rows={4} value={String(purchaseOrder.notes ?? "")} onChange={(event) => setPurchaseOrder((current) => ({ ...current, notes: event.target.value }))} />
        </div>
        <div className="form-section-title" style={{ gridColumn: "1 / -1" }}>
          <div className="panel-header">
            <h3>PO Builder Line Items</h3>
            <button
              className="btn btn-secondary btn-small"
              onClick={() =>
                setLineItems((current) => [
                  ...current,
                  { product_id: "", sku: "", product_name: "", quantity_ordered: 1, quantity_received: 0, unit_cost: 0 },
                ])
              }
            >
              Add Line Item
            </button>
          </div>
        </div>
        {lineItems.map((item, index) => (
          <div key={item.id ?? `${index}-${item.sku ?? "line"}`} className="detail-card" style={{ gridColumn: "1 / -1" }}>
            <div className="form-grid">
              <div className="field">
                <label>Product</label>
                <select
                  value={String(item.product_id ?? "")}
                  onChange={(event) => {
                    const nextProduct = products.find((product) => product.id === event.target.value);
                    setLineItems((current) =>
                      current.map((lineItem, lineIndex) =>
                        lineIndex === index
                          ? {
                              ...lineItem,
                              product_id: event.target.value,
                              sku: nextProduct?.sku ?? lineItem.sku,
                              product_name: nextProduct?.name ?? lineItem.product_name,
                              unit_cost: nextProduct?.unit_cost ?? lineItem.unit_cost,
                            }
                          : lineItem,
                      ),
                    );
                  }}
                >
                  <option value="">Select product...</option>
                  {products.map((product) => <option key={product.id} value={product.id}>{product.sku} | {product.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>SKU</label>
                <input value={String(item.sku ?? "")} onChange={(event) => setLineItems((current) => current.map((lineItem, lineIndex) => lineIndex === index ? { ...lineItem, sku: event.target.value } : lineItem))} />
              </div>
              <div className="field">
                <label>Product Name</label>
                <input value={String(item.product_name ?? "")} onChange={(event) => setLineItems((current) => current.map((lineItem, lineIndex) => lineIndex === index ? { ...lineItem, product_name: event.target.value } : lineItem))} />
              </div>
              <div className="field">
                <label>Qty Ordered</label>
                <input type="number" min="1" value={String(item.quantity_ordered ?? 0)} onChange={(event) => setLineItems((current) => current.map((lineItem, lineIndex) => lineIndex === index ? { ...lineItem, quantity_ordered: Number(event.target.value) } : lineItem))} />
              </div>
              <div className="field">
                <label>Qty Received</label>
                <input type="number" min="0" value={String(item.quantity_received ?? 0)} onChange={(event) => setLineItems((current) => current.map((lineItem, lineIndex) => lineIndex === index ? { ...lineItem, quantity_received: Number(event.target.value) } : lineItem))} />
              </div>
              <div className="field">
                <label>Unit Cost</label>
                <input type="number" min="0" step="0.01" value={String(item.unit_cost ?? 0)} onChange={(event) => setLineItems((current) => current.map((lineItem, lineIndex) => lineIndex === index ? { ...lineItem, unit_cost: Number(event.target.value) } : lineItem))} />
              </div>
              <div className="field">
                <label>Line Total</label>
                <input value={formatCurrency(Number(item.quantity_ordered ?? 0) * Number(item.unit_cost ?? 0))} disabled />
              </div>
              <div className="field">
                <label>Actions</label>
                <button className="btn btn-danger btn-small" onClick={() => setLineItems((current) => current.filter((_, lineIndex) => lineIndex !== index))}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
        <div className="detail-card" style={{ gridColumn: "1 / -1" }}>
          <span>Total Cost</span>
          <strong>{formatCurrency(totalCost)}</strong>
        </div>
      </div>
    </Modal>
  );
}

export function PurchaseOrdersPage() {
  const [status, setStatus] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [retailerId, setRetailerId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [poType, setPoType] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("eta");
  const [editing, setEditing] = useState<PurchaseOrderEditor | null>(null);
  const [deleting, setDeleting] = useState<PurchaseOrder | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const { data, loading, error, reload } = useAsyncData(
    async () => ({
      purchaseOrders: await purchaseOrderService.list({ status, vendorId, retailerId, locationId, poType, search }),
      vendors: await vendorService.list(),
      retailers: await retailerService.list(),
      locations: await supportService.listLocations(),
      products: await supportService.listProducts(),
    }),
    [status, vendorId, retailerId, locationId, poType, search],
  );

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load purchase orders"} />;

  const sortedPurchaseOrders = [...data.purchaseOrders].sort((left, right) => {
    if (sort === "cost") return right.total_cost - left.total_cost;
    if (sort === "status") return left.status.localeCompare(right.status);
    return new Date(left.expected_delivery_date ?? "").getTime() - new Date(right.expected_delivery_date ?? "").getTime();
  });

  const openOrders = data.purchaseOrders.filter((po) => !["Received", "Closed", "Cancelled"].includes(po.status));
  const pendingOrders = data.purchaseOrders.filter((po) => po.status === "Pending");
  const inTransitOrders = data.purchaseOrders.filter((po) => po.status === "In Transit");
  const deliveredRecent = data.purchaseOrders.filter((po) => po.status === "Received" || po.status === "Closed");

  return (
    <div className="section-stack">
      <PageHeader
        title="Purchase Orders"
        description="Centralized command-center management for intake, PO building, retailer orders, manufacturer orders, generated forms, and delivery lifecycle tracking."
        actions={
          <div className="btn-row">
            <button className="btn btn-secondary" onClick={() => void reload()}>
              Refresh
            </button>
            <button
              className="btn btn-primary"
              onClick={() =>
                setEditing({
                  purchaseOrder: {
                    po_number: `PO-${new Date().toISOString().slice(0, 10)}`,
                    vendor_id: "",
                    retailer_id: "",
                    location_id: "",
                    po_type: "Retailer PO",
                    status: "Pending",
                    order_date: new Date().toISOString().slice(0, 10),
                    submitted_at: new Date().toISOString().slice(0, 10),
                    source_channel: "Email forward",
                  },
                  lineItems: [],
                })
              }
            >
              Add New PO
            </button>
          </div>
        }
      />
      {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}
      <div className="card-grid">
        <DashboardCard label="Open" value={openOrders.length} />
        <DashboardCard label="Pending Intake" value={pendingOrders.length} footnote="New or unprocessed requests" />
        <DashboardCard label="In Transit" value={inTransitOrders.length} />
        <DashboardCard label="Delivered / Closed" value={deliveredRecent.length} />
      </div>
      <div className="panel">
        <div className="pill-row">
          <button className={`btn ${status === "" ? "btn-primary" : "btn-secondary"}`} onClick={() => setStatus("")}>All orders</button>
          <button className={`btn ${poType === "Retailer PO" ? "btn-primary" : "btn-secondary"}`} onClick={() => setPoType(poType === "Retailer PO" ? "" : "Retailer PO")}>Retailer POs</button>
          <button className={`btn ${poType === "Manufacturer PO" ? "btn-primary" : "btn-secondary"}`} onClick={() => setPoType(poType === "Manufacturer PO" ? "" : "Manufacturer PO")}>Manufacturer POs</button>
          <button className={`btn ${status === "Pending" ? "btn-primary" : "btn-secondary"}`} onClick={() => setStatus(status === "Pending" ? "" : "Pending")}>Pending</button>
          <button className={`btn ${status === "In Transit" ? "btn-primary" : "btn-secondary"}`} onClick={() => setStatus(status === "In Transit" ? "" : "In Transit")}>Shipped</button>
        </div>
      </div>
      <div className="panel">
        <div className="filter-row">
          <input placeholder="Search PO number or notes" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select value={vendorId} onChange={(event) => setVendorId(event.target.value)}>
            <option value="">All vendors</option>
            {data.vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
          </select>
          <select value={retailerId} onChange={(event) => setRetailerId(event.target.value)}>
            <option value="">All retailers</option>
            {data.retailers.map((retailer) => <option key={retailer.id} value={retailer.id}>{retailer.name}</option>)}
          </select>
          <select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
            <option value="">All locations</option>
            {data.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="eta">Sort by ETA</option>
            <option value="cost">Sort by total cost</option>
            <option value="status">Sort by status</option>
          </select>
        </div>
      </div>
      <DataTable
        emptyMessage="No purchase orders found. Create a PO to start tracking intake, line items, and delivery movement."
        columns={[
          {
            key: "po_number",
            title: "PO",
            render: (row) => (
              <div className="cell-stack">
                <Link className="table-link" to={`/purchase-orders/${row.id}`}>{row.po_number}</Link>
                <span className="helper-text">{formatDate(row.order_date)}</span>
              </div>
            ),
          },
          { key: "po_type", title: "Type", render: (row) => row.po_type },
          { key: "retailer", title: "Retailer", render: (row) => row.retailers?.name ?? "N/A" },
          { key: "vendor", title: "Vendor", render: (row) => row.vendors?.name ?? "Unassigned" },
          { key: "status", title: "Status", render: (row) => <StatusBadge label={row.status} /> },
          { key: "expected_delivery_date", title: "ETA", render: (row) => formatDate(row.expected_delivery_date) },
          { key: "tracking", title: "Tracking", render: (row) => row.tracking_status ?? row.tracking_number ?? "N/A" },
          { key: "total_cost", title: "Total Cost", render: (row) => formatCurrency(row.total_cost) },
          {
            key: "actions",
            title: "Actions",
            render: (row) => (
              <div className="btn-row">
                <Link className="btn btn-ghost btn-small" to={`/purchase-orders/${row.id}`}>
                  View Details
                </Link>
                <button
                  className="btn btn-secondary btn-small"
                  onClick={async () => {
                    try {
                      const detail = await purchaseOrderService.getById(row.id);
                      setEditing({ purchaseOrder: detail.purchaseOrder, lineItems: detail.lineItems });
                    } catch (err) {
                      setNotice({ tone: "error", message: err instanceof Error ? err.message : "Failed to load PO for editing." });
                    }
                  }}
                >
                  Edit
                </button>
                <button className="btn btn-danger btn-small" onClick={() => setDeleting(row)}>
                  Delete
                </button>
              </div>
            ),
          },
        ]}
        rows={sortedPurchaseOrders}
      />
      {editing ? (
        <PurchaseOrderModal
          initialValue={editing}
          products={data.products}
          vendors={data.vendors}
          retailers={data.retailers}
          locations={data.locations}
          onClose={() => setEditing(null)}
          onSaved={async (message) => {
            await reload();
            setNotice({ tone: "success", message });
          }}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title="Delete purchase order?"
          message={`This will permanently remove PO ${deleting.po_number} and all of its line items.`}
          busy={busyDelete}
          onClose={() => {
            if (!busyDelete) setDeleting(null);
          }}
          onConfirm={async () => {
            try {
              setBusyDelete(true);
              await purchaseOrderService.remove(deleting.id);
              setDeleting(null);
              await reload();
              setNotice({ tone: "success", message: "Purchase order deleted successfully." });
            } catch (err) {
              setNotice({ tone: "error", message: err instanceof Error ? err.message : "Failed to delete purchase order." });
            } finally {
              setBusyDelete(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}
