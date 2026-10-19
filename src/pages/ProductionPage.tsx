import { useState } from "react";
import { Link } from "react-router-dom";
import { DashboardCard } from "@/components/DashboardCard";
import { DataTable } from "@/components/DataTable";
import { EntityFormModal } from "@/components/EntityFormModal";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader } from "@/components/PageHeader";
import { ReceiveInventoryModal } from "@/components/ReceiveInventoryModal";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsyncData } from "@/hooks/useAsyncData";
import { capacityService } from "@/services/capacityService";
import { dashboardService } from "@/services/dashboardService";
import { purchaseOrderService } from "@/services/purchaseOrderService";
import { supportService } from "@/services/supportService";
import type { CapacitySnapshot, PoLineItem, PurchaseOrder } from "@/types/domain";
import { formatDate, formatNumber } from "@/utils/format";
import { getManufacturingOrderTitle } from "@/utils/operations";

export function ProductionPage() {
  const [editing, setEditing] = useState<Partial<CapacitySnapshot> | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [receiving, setReceiving] = useState<{ purchaseOrder: PurchaseOrder; lineItems: PoLineItem[] } | null>(null);
  const [reorderQueueTab, setReorderQueueTab] = useState<"attention" | "watch">("attention");
  const { data, loading, error, reload } = useAsyncData(
    async () => ({
      capacity: await capacityService.list(),
      snapshot: await dashboardService.getSnapshot(),
      locations: await supportService.listLocations(),
    }),
    [],
  );

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load manufacturing"} />;

  const manufacturerCapacity = data.capacity.filter((entry) => entry.capacity_type === "Manufacturer");
  const reorderQueueRows = data.snapshot.skuReorderWindows
    .filter((item) => item.recommendation.startsWith("Watch manually") === (reorderQueueTab === "watch"))
    .slice(0, 5);

  const handleMarkAsPaid = async (poId: string) => {
    try {
      await purchaseOrderService.markAsPaid(poId);
      await reload();
      setNotice({ tone: "success", message: "Manufacturing order marked as paid." });
    } catch (err) {
      setNotice({ tone: "error", message: err instanceof Error ? err.message : "Unable to mark as paid." });
    }
  };

  const handleMarkAsShipped = async (poId: string) => {
    try {
      await purchaseOrderService.markAsShipped(poId);
      await reload();
      setNotice({ tone: "success", message: "Manufacturing order marked as shipped." });
    } catch (err) {
      setNotice({ tone: "error", message: err instanceof Error ? err.message : "Unable to mark as shipped." });
    }
  };

  const handleOpenReceive = async (poId: string) => {
    try {
      const detail = await purchaseOrderService.getById(poId);
      setReceiving({ purchaseOrder: detail.purchaseOrder, lineItems: detail.lineItems });
    } catch (err) {
      setNotice({ tone: "error", message: err instanceof Error ? err.message : "Unable to load manufacturing order." });
    }
  };

  return (
    <div className="section-stack">
      <PageHeader
        title="Production & Restock"
        description="Track what SickFit has ordered from manufacturers, what has been paid, what is in production, what is expected to arrive, and how it affects inventory."
        actions={<button className="btn btn-primary" onClick={() => setEditing({ snapshot_date: new Date().toISOString().slice(0, 10), capacity_type: "Manufacturer", partner_name: "" })}>Add Capacity Snapshot</button>}
      />
      {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}
      <div className="card-grid">
        <DashboardCard label="Active SKUs in Route" value={data.snapshot.activeSkusInRoute} footnote="Unique SKUs tied to active manufacturer invoices" />
        <DashboardCard label="Units in Route" value={formatNumber(data.snapshot.incomingInventoryUnits)} footnote="Outstanding manufacturer quantity" />
        <DashboardCard label="Open Invoices" value={data.snapshot.openInvoiceCount} />
        <DashboardCard label="Shipped Invoices" value={data.snapshot.shippedInvoiceCount} />
        <DashboardCard label="Inventory in Route" value={data.snapshot.inventoryInRouteCount} footnote="Invoices still moving toward inventory" />
        <DashboardCard label="Reorder Windows" value={data.snapshot.skuReorderWindows.filter((item) => item.recommendation !== "Monitor window").length} footnote="SKUs needing active reorder review" />
      </div>
      <div className="panel section-stack">
        <div className="panel-header"><h3>Manufacturing Orders</h3></div>
        <DataTable
          emptyMessage="No active manufacturing orders yet."
          columns={[
            {
              key: "manufacturer",
              title: "Manufacturer",
              render: (row) => (
                <div className="cell-stack">
                  <strong>{row.manufacturer}</strong>
                  <span className="helper-text">{getManufacturingOrderTitle({ po_number: row.poNumber })}</span>
                </div>
              ),
            },
            {
              key: "status",
              title: "Status / Payment",
              render: (row) => (
                <div className="cell-stack">
                  <StatusBadge label={row.manufacturingStatus} />
                  <StatusBadge label={row.paymentStatus} />
                </div>
              ),
            },
            {
              key: "dates",
              title: "Dates",
              render: (row) => (
                <div className="cell-stack">
                  <span className="helper-text">Ordered {formatDate(row.orderDate)}</span>
                  <span className="helper-text">Ship {formatDate(row.shipDate)}</span>
                  <strong>Arrival {formatDate(row.etaDate)}</strong>
                </div>
              ),
            },
            { key: "incomingUnits", title: "Incoming Units", render: (row) => formatNumber(row.incomingUnits) },
            {
              key: "inventoryImpact",
              title: "Inventory Impact",
              render: (row) => (
                <span className="hover-tooltip" tabIndex={0}>
                  {row.inventoryImpactSummary}
                  {row.inventoryImpactItems.length ? (
                    <span className="hover-tooltip-panel">
                      <ul>
                        {row.inventoryImpactItems.map((item) => (
                          <li key={item.productName}>
                            <span>{item.productName}</span>
                            <strong>+{item.incomingUnits}</strong>
                          </li>
                        ))}
                      </ul>
                    </span>
                  ) : null}
                </span>
              ),
            },
            {
              key: "actions",
              title: "Actions",
              render: (row) => (
                <div className="btn-row">
                  <Link className="btn btn-ghost btn-small" to={`/purchase-orders/${row.poId}`}>View Details</Link>
                  <Link className="btn btn-secondary btn-small po-edit-btn" to={`/purchase-orders/${row.poId}/edit`}>Edit</Link>
                  <button
                    className="btn btn-secondary btn-small"
                    disabled={row.paymentStatus === "Paid"}
                    onClick={() => void handleMarkAsPaid(row.poId)}
                  >
                    Mark as Paid
                  </button>
                  <button
                    className="btn btn-secondary btn-small"
                    disabled={Boolean(row.shipDate)}
                    onClick={() => void handleMarkAsShipped(row.poId)}
                  >
                    Mark as Shipped
                  </button>
                  <button
                    className="btn btn-primary btn-small"
                    disabled={row.manufacturingStatus === "Received"}
                    onClick={() => void handleOpenReceive(row.poId)}
                  >
                    Receive Inventory
                  </button>
                </div>
              ),
            },
          ]}
          rows={data.snapshot.manufacturingSnapshotRows}
        />
      </div>
      <div className="split-grid">
        <div className="panel section-stack">
          <div className="panel-header">
            <h3>SKU Reorder Queue</h3>
            <div className="pill-row">
              <button
                className={`btn btn-small ${reorderQueueTab === "attention" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setReorderQueueTab("attention")}
              >
                Needs Attention
              </button>
              <button
                className={`btn btn-small ${reorderQueueTab === "watch" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setReorderQueueTab("watch")}
              >
                Watch
              </button>
            </div>
          </div>
          <div className="timeline">
            {reorderQueueRows.length ? reorderQueueRows.map((item) => (
              <div key={item.sku} className="timeline-item">
                <strong>{item.productName}</strong>
                <p>{item.sku}</p>
                <span className="muted">
                  {item.recommendation} | Reorder by {item.reorderByDate ? formatDate(item.reorderByDate) : "manual review"}
                </span>
                <span className="helper-text">On hand {item.currentQuantity} | Incoming {item.incomingQuantity}</span>
                {reorderQueueTab === "attention" ? (
                  <div className="btn-row">
                    {/* TODO: deep-link vendor/product once the PO builder supports prefill query params */}
                    <Link className="btn btn-secondary btn-small" to="/purchase-orders/new">
                      Create Manufacturing PO
                    </Link>
                  </div>
                ) : null}
              </div>
            )) : (
              <div className="empty-state">
                {reorderQueueTab === "watch" ? "No watch-only SKUs right now." : "No SKUs need attention right now."}
              </div>
            )}
          </div>
        </div>
        <div className="panel section-stack">
          <div className="panel-header"><h3>Manufacturer Capacity Tracker</h3></div>
          <DataTable
            emptyMessage="No manufacturer capacity snapshots yet."
            columns={[
              { key: "snapshot_date", title: "Date", render: (row) => formatDate(row.snapshot_date) },
              {
                key: "partner",
                title: "Partner / Lane",
                render: (row) => (
                  <div className="cell-stack">
                    <strong>{row.partner_name}</strong>
                    <span className="helper-text">{row.lane_name ?? "No lane"}</span>
                  </div>
                ),
              },
              {
                key: "capacity",
                title: "Capacity",
                render: (row) => (
                  <div className="cell-stack">
                    <strong>{row.available_units} available</strong>
                    <span className="helper-text">{row.committed_units} committed</span>
                  </div>
                ),
              },
            ]}
            rows={manufacturerCapacity}
          />
        </div>
      </div>
      {editing ? (
        <EntityFormModal<Partial<CapacitySnapshot>>
          title="Add Capacity Snapshot"
          saveLabel="Save Snapshot"
          initialValues={{
            snapshot_date: editing.snapshot_date ?? new Date().toISOString().slice(0, 10),
            capacity_type: editing.capacity_type ?? "Manufacturer",
            partner_name: editing.partner_name ?? "",
            lane_name: editing.lane_name ?? "",
            available_units: editing.available_units ?? 0,
            committed_units: editing.committed_units ?? 0,
            notes: editing.notes ?? "",
          }}
          fields={[
            { key: "snapshot_date", label: "Snapshot Date", type: "date", required: true },
            { key: "capacity_type", label: "Capacity Type", type: "select", options: [{ label: "Manufacturer", value: "Manufacturer" }, { label: "3PL", value: "3PL" }] },
            { key: "partner_name", label: "Partner Name", required: true },
            { key: "lane_name", label: "Lane Name" },
            { key: "available_units", label: "Available Units", type: "number", min: 0, step: 1 },
            { key: "committed_units", label: "Committed Units", type: "number", min: 0, step: 1 },
            { key: "notes", label: "Notes", type: "textarea" },
          ]}
          onSave={async (values) => {
            await capacityService.upsert({
              snapshot_date: String(values.snapshot_date),
              capacity_type: values.capacity_type as "Manufacturer" | "3PL",
              partner_name: String(values.partner_name),
              lane_name: values.lane_name ? String(values.lane_name) : null,
              available_units: Number(values.available_units ?? 0),
              committed_units: Number(values.committed_units ?? 0),
              notes: values.notes ? String(values.notes) : null,
            });
            await reload();
            setNotice({ tone: "success", message: "Capacity snapshot saved." });
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {receiving ? (
        <ReceiveInventoryModal
          purchaseOrder={receiving.purchaseOrder}
          lineItems={receiving.lineItems}
          locations={data.locations}
          onClose={() => setReceiving(null)}
          onConfirm={async (lines) => {
            try {
              const result = await purchaseOrderService.receiveInventory(receiving.purchaseOrder.id, lines);
              setReceiving(null);
              await reload();
              setNotice({
                tone: "success",
                message: result.unitsToAddInShopify
                  ? `Receipt recorded. Add ${result.unitsToAddInShopify} units in Shopify. They will show in Nexus on the next Shopify check.`
                  : "Inventory received successfully.",
              });
            } catch (err) {
              setNotice({ tone: "error", message: err instanceof Error ? err.message : "Unable to receive inventory." });
            }
          }}
        />
      ) : null}
    </div>
  );
}
