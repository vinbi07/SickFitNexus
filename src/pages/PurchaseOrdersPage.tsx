import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DashboardCard } from "@/components/DashboardCard";
import { DataTable } from "@/components/DataTable";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader } from "@/components/PageHeader";
import { PurchaseOrderDrawer } from "@/components/PurchaseOrderDrawer";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import { useAsyncData } from "@/hooks/useAsyncData";
import { usePurchaseOrderDrawer } from "@/hooks/usePurchaseOrderDrawer";
import { purchaseOrderService } from "@/services/purchaseOrderService";
import { invoiceService } from "@/services/invoiceService";
import { retailerService } from "@/services/retailerService";
import { supportService } from "@/services/supportService";
import { supplyChainService } from "@/services/supplyChainService";
import { vendorService } from "@/services/vendorService";
import type {
  PurchaseOrder,
  PurchaseOrderStatus,
  PurchaseOrderType,
} from "@/types/domain";
import { formatCurrency, formatDate, formatDateOnly } from "@/utils/format";
import { getPoTargetDate } from "@/utils/operations";
import { DEFAULT_LEAD_TIME_SETTINGS } from "@/utils/leadTime";
import { nextStepLabel, type StageContext } from "@/utils/productionStage";

function localTodayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// Falls back to planning defaults so the list still renders before the
// supply chain settings migration has been applied.
async function loadStageContext(): Promise<StageContext> {
  const [settings, shutdowns] = await Promise.all([
    supplyChainService.getSettings().catch(() => null),
    supplyChainService.listShutdowns().catch(() => []),
  ]);
  return { settings: settings ?? DEFAULT_LEAD_TIME_SETTINGS, shutdowns, today: localTodayIso() };
}

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

function closeActionsMenu(event: { currentTarget: HTMLElement }) {
  event.currentTarget.closest("details")?.removeAttribute("open");
}

// Nothing left to do on these, so the Next column says so instead of showing a dash.
const DONE_STATUSES = new Set<PurchaseOrder["status"]>(["Fulfilled", "Received", "Closed", "Cancelled"]);

export function PurchaseOrdersPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    isOpen: drawerOpen,
    poId: drawerPoId,
    mode: drawerMode,
    openDrawer,
    closeDrawer,
  } = usePurchaseOrderDrawer();
  const [status, setStatus] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [retailerId, setRetailerId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [poType, setPoType] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("eta");
  const [showArchived, setShowArchived] = useState(false);
  const [deleting, setDeleting] = useState<PurchaseOrder | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const { data, loading, error, reload } = useAsyncData(
    async () => ({
      purchaseOrders: await purchaseOrderService.list({
        status,
        vendorId,
        retailerId,
        locationId,
        poType,
        search,
      }),
      vendors: await vendorService.list(),
      retailers: await retailerService.list(),
      locations: await supportService.listLocations(),
      stageContext: await loadStageContext(),
    }),
    [status, vendorId, retailerId, locationId, poType, search],
  );

  if (loading) return <LoadingState />;
  if (error || !data)
    return <ErrorState message={error ?? "Unable to load purchase orders"} />;

  const handleConvertToInvoice = async (row: PurchaseOrder) => {
    try {
      const invoice = await invoiceService.convertFromPo(row.id);
      setNotice({
        tone: "success",
        message: `Invoice ${invoice.invoice_number} created from PO ${row.po_number}.`,
      });
      navigate(`/invoices/${invoice.id}`);
    } catch (err) {
      setNotice({
        tone: "error",
        message:
          err instanceof Error
            ? err.message
            : "Failed to convert PO to invoice.",
      });
    }
  };

  const handleArchive = async (row: PurchaseOrder, archived: boolean) => {
    try {
      await purchaseOrderService.setArchived(row.id, archived);
      await reload();
      setNotice({
        tone: "success",
        message: archived
          ? `PO ${row.po_number} archived. Find it under "Archived".`
          : `PO ${row.po_number} restored.`,
      });
    } catch (err) {
      setNotice({
        tone: "error",
        message: err instanceof Error ? err.message : "Unable to update archive status.",
      });
    }
  };

  // Archived POs live behind the "Archived" toggle; the cards always count active ones.
  const activePurchaseOrders = data.purchaseOrders.filter((po) => !po.archived_at);
  const archivedCount = data.purchaseOrders.length - activePurchaseOrders.length;
  const visiblePurchaseOrders = showArchived
    ? data.purchaseOrders.filter((po) => po.archived_at)
    : activePurchaseOrders;

  const sortedPurchaseOrders = [...visiblePurchaseOrders].sort((left, right) => {
    if (sort === "cost") return right.total_cost - left.total_cost;
    if (sort === "status") return left.status.localeCompare(right.status);
    return (
      new Date(left.expected_delivery_date ?? "").getTime() -
      new Date(right.expected_delivery_date ?? "").getTime()
    );
  });

  const openOrders = activePurchaseOrders.filter(
    (po) =>
      !["Received", "Closed", "Cancelled", "Fulfilled"].includes(po.status),
  );
  const pendingOrders = activePurchaseOrders.filter(
    (po) => po.status === "Pending",
  );
  const pendingApprovalOrders = activePurchaseOrders.filter(
    (po) => po.approval_status === "Pending Approval",
  );
  const inTransitOrders = activePurchaseOrders.filter(
    (po) => po.status === "In Transit",
  );
  const deliveredRecent = activePurchaseOrders.filter((po) =>
    ["Received", "Closed", "Fulfilled"].includes(po.status),
  );

  return (
    <div className="section-stack">
      <PageHeader
        title="Purchase Orders"
        description="Review retailer/customer POs, update statuses, and check whether inventory is available to fulfill each order."
        actions={
          <div className="btn-row">
            <button className="btn btn-secondary" onClick={() => void reload()}>
              Refresh
            </button>
            <Link className="btn btn-primary" to="/purchase-orders/new/wizard">
              Add New PO
            </Link>
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
        <DashboardCard label="Open" value={openOrders.length} />
        <DashboardCard
          label="Pending Intake"
          value={pendingOrders.length}
          footnote="New or unprocessed orders"
        />
        <DashboardCard
          label="Buyer Queue"
          value={pendingApprovalOrders.length}
          footnote="Awaiting SickFit approval"
        />
        <DashboardCard label="In Transit" value={inTransitOrders.length} />
        <DashboardCard
          label="Delivered / Closed"
          value={deliveredRecent.length}
        />
      </div>
      <div className="panel">
        <div className="pill-row">
          <button
            className={`btn ${status === "" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setStatus("")}
          >
            All orders
          </button>
          <button
            className={`btn ${poType === purchaseOrderTypes[1] ? "btn-primary" : "btn-secondary"}`}
            onClick={() =>
              setPoType(
                poType === purchaseOrderTypes[1] ? "" : purchaseOrderTypes[1],
              )
            }
          >
            Retailer POs
          </button>
          <button
            className={`btn ${poType === purchaseOrderTypes[0] ? "btn-primary" : "btn-secondary"}`}
            onClick={() =>
              setPoType(
                poType === purchaseOrderTypes[0] ? "" : purchaseOrderTypes[0],
              )
            }
          >
            Manufacturer Orders
          </button>
          <button
            className={`btn ${status === purchaseOrderStatuses[1] ? "btn-primary" : "btn-secondary"}`}
            onClick={() =>
              setStatus(
                status === purchaseOrderStatuses[1]
                  ? ""
                  : purchaseOrderStatuses[1],
              )
            }
          >
            Pending
          </button>
          <button
            className={`btn ${status === "Pending Approval" ? "btn-primary" : "btn-secondary"}`}
            onClick={() =>
              setStatus(status === "Pending Approval" ? "" : "Pending Approval")
            }
          >
            Pending Approval
          </button>
          <button
            className={`btn ${status === "In Transit" ? "btn-primary" : "btn-secondary"}`}
            onClick={() =>
              setStatus(status === "In Transit" ? "" : "In Transit")
            }
          >
            Shipped
          </button>
          <button
            className={`btn ${showArchived ? "btn-primary" : "btn-secondary"}`}
            aria-pressed={showArchived}
            onClick={() => setShowArchived(!showArchived)}
          >
            Archived{archivedCount ? ` (${archivedCount})` : ""}
          </button>
        </div>
      </div>
      <div className="panel">
        <div className="filter-row">
          <input
            placeholder="Search PO number or notes"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            value={vendorId}
            onChange={(event) => setVendorId(event.target.value)}
          >
            <option value="">All vendors</option>
            {data.vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
          <select
            value={retailerId}
            onChange={(event) => setRetailerId(event.target.value)}
          >
            <option value="">All retailers</option>
            {data.retailers.map((retailer) => (
              <option key={retailer.id} value={retailer.id}>
                {retailer.name}
              </option>
            ))}
          </select>
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
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="eta">Sort by ETA</option>
            <option value="cost">Sort by total cost</option>
            <option value="status">Sort by status</option>
          </select>
        </div>
      </div>
      <DataTable
        emptyMessage={
          showArchived
            ? "No archived purchase orders match these filters."
            : "No purchase orders found. Create a PO to start tracking line items, document previews, and delivery movement."
        }
        className="table-shell-menus"
        onRowClick={(row) => openDrawer(row.id, "view")}
        columns={[
          {
            key: "po_number",
            title: "Account / PO",
            render: (row) => (
              <div
                className="cell-stack"
                onClick={(event) => event.stopPropagation()}
              >
                <Link className="table-link" to={`/purchase-orders/${row.id}`}>
                  {row.retailers?.name ??
                    row.vendors?.name ??
                    row.bill_to_company_name ??
                    "Unassigned"}
                </Link>
                <span className="helper-text">
                  {row.po_number} · {row.po_type}
                </span>
                {(row.buyers?.buyer_name ?? row.buyer_name_snapshot) ? (
                  <span className="helper-text">
                    {row.buyers?.buyer_name ?? row.buyer_name_snapshot}
                  </span>
                ) : null}
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
                <strong>
                  {(() => {
                    const target = getPoTargetDate(row);
                    return target ? `${target.label} ${formatDate(target.date)}` : "No date set";
                  })()}
                </strong>
                <span className="helper-text">
                  Ordered {formatDate(row.order_date)}
                </span>
                <span className="helper-text">
                  {row.shipment_status ??
                    row.tracking_status ??
                    row.tracking_number ??
                    "No shipment status"}
                </span>
              </div>
            ),
          },
          {
            key: "next",
            title: "Next",
            render: (row) => {
              const next = row.po_type === "Manufacturer PO" ? nextStepLabel(row, data.stageContext) : null;
              if (!next) {
                if (DONE_STATUSES.has(row.status)) return <span className="helper-text">No action needed</span>;
                if (row.po_type === "Manufacturer PO") return <span className="helper-text">—</span>;
                return (
                  <strong>
                    {row.approval_status === "Pending Approval" ? "Needs approval" : "Ship, then mark fulfilled"}
                  </strong>
                );
              }
              return (
                <div className="cell-stack">
                  {next.tone === "neutral" ? (
                    <strong>{next.text}</strong>
                  ) : (
                    <span className={`status-badge ${next.tone === "late" ? "status-danger" : "status-warning"}`}>
                      {next.text}
                    </span>
                  )}
                  {next.expected ? (
                    <span className="helper-text">Expected {formatDateOnly(next.expected)}</span>
                  ) : null}
                </div>
              );
            },
          },
          {
            key: "source",
            title: "Source",
            render: (row) => (
              <div className="cell-stack">
                <strong>{row.source_channel ?? "Manual"}</strong>
                {row.po_type === "Manufacturer PO" ? (
                  <span className="helper-text">
                    {row.vendors?.name ?? "Unassigned vendor"}
                  </span>
                ) : null}
              </div>
            ),
          },
          {
            key: "total_cost",
            title: "Total",
            render: (row) => formatCurrency(row.total_cost),
          },
          {
            key: "actions",
            title: "Actions",
            render: (row) => (
              <div
                className="btn-row"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  className="btn btn-ghost btn-small"
                  onClick={() => openDrawer(row.id, "view")}
                >
                  View
                </button>
                <button
                  className="btn btn-secondary btn-small po-edit-btn"
                  onClick={() => openDrawer(row.id, "edit")}
                >
                  Edit
                </button>
                <button
                  className="btn btn-danger btn-small po-edit-btn"
                  onClick={() => setDeleting(row)}
                >
                  Delete
                </button>
                <details className="actions-dropdown">
                  <summary
                    className="btn btn-ghost btn-small actions-dropdown-icon"
                    aria-label="More actions"
                  >
                    +
                  </summary>
                  <div className="actions-dropdown-menu">
                    <button
                      type="button"
                      onClick={(event) => {
                        closeActionsMenu(event);
                        navigate(`/purchase-orders/new?copyFrom=${row.id}`);
                      }}
                    >
                      Duplicate
                    </button>
                    {row.po_type !== "Manufacturer PO" ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          closeActionsMenu(event);
                          navigate(`/purchase-orders/${row.id}/preview`);
                        }}
                      >
                        Preview
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={(event) => {
                        closeActionsMenu(event);
                        handleConvertToInvoice(row);
                      }}
                    >
                      To Invoice
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        closeActionsMenu(event);
                        void handleArchive(row, !row.archived_at);
                      }}
                    >
                      {row.archived_at ? "Unarchive" : "Archive"}
                    </button>
                  </div>
                </details>
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
              setNotice({
                tone: "success",
                message: "Purchase order deleted successfully.",
              });
            } catch (err) {
              setNotice({
                tone: "error",
                message:
                  err instanceof Error
                    ? err.message
                    : "Failed to delete purchase order.",
              });
            } finally {
              setBusyDelete(false);
            }
          }}
        />
      ) : null}
      <PurchaseOrderDrawer
        purchaseOrderId={drawerPoId}
        open={drawerOpen}
        mode={drawerMode}
        canEdit={Boolean(user)}
        onClose={closeDrawer}
        onSaved={() => void reload()}
        onDeleted={() => void reload()}
        onOpenFullPage={(id) => navigate(`/purchase-orders/${id}`)}
        onDuplicate={(id) => navigate(`/purchase-orders/new?copyFrom=${id}`)}
        onConvertedToInvoice={(invoiceId) => navigate(`/invoices/${invoiceId}`)}
      />
    </div>
  );
}
