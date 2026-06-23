import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DashboardCard } from "@/components/DashboardCard";
import { DataTable } from "@/components/DataTable";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsyncData } from "@/hooks/useAsyncData";
import { purchaseOrderService } from "@/services/purchaseOrderService";
import { invoiceService } from "@/services/invoiceService";
import { retailerService } from "@/services/retailerService";
import { supportService } from "@/services/supportService";
import { vendorService } from "@/services/vendorService";
import type { PurchaseOrder, PurchaseOrderStatus, PurchaseOrderType } from "@/types/domain";
import { formatCurrency, formatDate } from "@/utils/format";

const purchaseOrderStatuses: PurchaseOrderStatus[] = [
  "Draft",
  "Pending",
  "On Hold",
  "Countered",
  "Ordered",
  "In Transit",
  "Partially Received",
  "Received",
  "Fulfilled",
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

export function PurchaseOrdersPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [retailerId, setRetailerId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [poType, setPoType] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("eta");
  const [deleting, setDeleting] = useState<PurchaseOrder | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const { data, loading, error, reload } = useAsyncData(
    async () => ({
      purchaseOrders: await purchaseOrderService.list({ status, vendorId, retailerId, locationId, poType, search }),
      vendors: await vendorService.list(),
      retailers: await retailerService.list(),
      locations: await supportService.listLocations(),
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

  const openOrders = data.purchaseOrders.filter((po) => !["Received", "Closed", "Cancelled", "Fulfilled"].includes(po.status));
  const pendingOrders = data.purchaseOrders.filter((po) => po.status === "Pending");
  const pendingApprovalOrders = data.purchaseOrders.filter((po) => po.approval_status === "Pending Approval");
  const inTransitOrders = data.purchaseOrders.filter((po) => po.status === "In Transit");
  const deliveredRecent = data.purchaseOrders.filter((po) => ["Received", "Closed", "Fulfilled"].includes(po.status));

  return (
    <div className="section-stack">
      <PageHeader
        title="Purchase Orders"
        description="Centralized command-center management for intake, builder workflows, retailer orders, manufacturer orders, document previews, and delivery lifecycle tracking."
        actions={(
          <div className="btn-row">
            <button className="btn btn-secondary" onClick={() => void reload()}>
              Refresh
            </button>
            <Link className="btn btn-primary" to="/purchase-orders/new">
              Add New PO
            </Link>
          </div>
        )}
      />
      {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}
      <div className="card-grid">
        <DashboardCard label="Open" value={openOrders.length} />
        <DashboardCard label="Pending Intake" value={pendingOrders.length} footnote="New or unprocessed requests" />
        <DashboardCard label="Buyer Queue" value={pendingApprovalOrders.length} footnote="Awaiting SickFit approval" />
        <DashboardCard label="In Transit" value={inTransitOrders.length} />
        <DashboardCard label="Delivered / Closed" value={deliveredRecent.length} />
      </div>
      <div className="panel">
        <div className="pill-row">
          <button className={`btn ${status === "" ? "btn-primary" : "btn-secondary"}`} onClick={() => setStatus("")}>All orders</button>
          <button className={`btn ${poType === purchaseOrderTypes[1] ? "btn-primary" : "btn-secondary"}`} onClick={() => setPoType(poType === purchaseOrderTypes[1] ? "" : purchaseOrderTypes[1])}>Retailer POs</button>
          <button className={`btn ${poType === purchaseOrderTypes[0] ? "btn-primary" : "btn-secondary"}`} onClick={() => setPoType(poType === purchaseOrderTypes[0] ? "" : purchaseOrderTypes[0])}>Manufacturer POs</button>
          <button className={`btn ${status === purchaseOrderStatuses[1] ? "btn-primary" : "btn-secondary"}`} onClick={() => setStatus(status === purchaseOrderStatuses[1] ? "" : purchaseOrderStatuses[1])}>Pending</button>
          <button className={`btn ${status === "Pending Approval" ? "btn-primary" : "btn-secondary"}`} onClick={() => setStatus(status === "Pending Approval" ? "" : "Pending Approval")}>Pending Approval</button>
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
        emptyMessage="No purchase orders found. Create a PO to start tracking line items, document previews, and delivery movement."
        columns={[
          {
            key: "po_number",
            title: "PO / Account",
            render: (row) => (
              <div className="cell-stack">
                <Link className="table-link" to={`/purchase-orders/${row.id}`}>{row.po_number}</Link>
                <span className="helper-text">{row.retailers?.name ?? "No retailer"} | {row.po_type}</span>
                <span className="helper-text">{row.buyers?.buyer_name ?? row.buyer_name_snapshot ?? "No buyer"}</span>
              </div>
            ),
          },
          {
            key: "status",
            title: "Status",
            render: (row) => (
              <div className="cell-stack">
                <StatusBadge label={row.status} />
                <StatusBadge label={row.approval_status} />
                <StatusBadge label={row.invoice_status ?? "Open"} />
              </div>
            ),
          },
          {
            key: "dates",
            title: "Dates",
            render: (row) => (
              <div className="cell-stack">
                <strong>{formatDate(row.eta_date ?? row.expected_delivery_date)}</strong>
                <span className="helper-text">Ordered {formatDate(row.order_date)}</span>
                <span className="helper-text">{row.shipment_status ?? row.tracking_status ?? row.tracking_number ?? "No shipment status"}</span>
              </div>
            ),
          },
          {
            key: "source",
            title: "Source",
            render: (row) => (
              <div className="cell-stack">
                <strong>{row.source_channel ?? "Manual"}</strong>
                <span className="helper-text">{row.vendors?.name ?? "Unassigned vendor"}</span>
              </div>
            ),
          },
          { key: "total_cost", title: "Total", render: (row) => formatCurrency(row.total_cost) },
          {
            key: "actions",
            title: "Actions",
            render: (row) => (
              <div className="btn-row">
                <Link className="btn btn-ghost btn-small" to={`/purchase-orders/${row.id}`}>View</Link>
                <Link className="btn btn-secondary btn-small" to={`/purchase-orders/${row.id}/edit`}>Edit</Link>
                <button className="btn btn-secondary btn-small" onClick={() => navigate(`/purchase-orders/new?copyFrom=${row.id}`)}>Duplicate</button>
                {row.po_type !== "Manufacturer PO" ? (
                  <Link className="btn btn-secondary btn-small" to={`/purchase-orders/${row.id}/preview`}>Preview</Link>
                ) : null}
                <button
                  className="btn btn-secondary btn-small"
                  onClick={async () => {
                    try {
                      const invoice = await invoiceService.convertFromPo(row.id);
                      setNotice({ tone: "success", message: `Invoice ${invoice.invoice_number} created from PO ${row.po_number}.` });
                      navigate(`/invoices/${invoice.id}`);
                    } catch (err) {
                      setNotice({ tone: "error", message: err instanceof Error ? err.message : "Failed to convert PO to invoice." });
                    }
                  }}
                >
                  To Invoice
                </button>
                <button className="btn btn-danger btn-small" onClick={() => setDeleting(row)}>Delete</button>
              </div>
            ),
          },
        ]}
        rows={sortedPurchaseOrders}
      />
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
