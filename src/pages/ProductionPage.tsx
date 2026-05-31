import { useState } from "react";
import { DashboardCard } from "@/components/DashboardCard";
import { DataTable } from "@/components/DataTable";
import { EntityFormModal } from "@/components/EntityFormModal";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsyncData } from "@/hooks/useAsyncData";
import { capacityService } from "@/services/capacityService";
import { dashboardService } from "@/services/dashboardService";
import type { CapacitySnapshot } from "@/types/domain";
import { formatDate, formatNumber } from "@/utils/format";

export function ProductionPage() {
  const [editing, setEditing] = useState<Partial<CapacitySnapshot> | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const { data, loading, error, reload } = useAsyncData(
    async () => ({
      capacity: await capacityService.list(),
      snapshot: await dashboardService.getSnapshot(),
    }),
    [],
  );

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load manufacturing"} />;

  const manufacturerCapacity = data.capacity.filter((entry) => entry.capacity_type === "Manufacturer");

  return (
    <div className="section-stack">
      <PageHeader
        title="Operations -> Manufacturing"
        description="Track active SKUs in route, open and shipped invoices, incoming inventory, and reorder timing from actual shipment and invoice data."
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
      <div className="split-grid">
        <div className="panel section-stack">
          <div className="panel-header"><h3>Invoice and Shipment Flow</h3></div>
          <DataTable
            emptyMessage="No active manufacturing invoices yet."
            columns={[
              {
                key: "poNumber",
                title: "PO / Manufacturer",
                render: (row) => (
                  <div className="cell-stack">
                    <strong>{row.poNumber}</strong>
                    <span className="helper-text">{row.manufacturer}</span>
                  </div>
                ),
              },
              {
                key: "status",
                title: "Invoice / Shipment",
                render: (row) => (
                  <div className="cell-stack">
                    <StatusBadge label={row.invoiceStatus} />
                    <span className="helper-text">{row.shipmentStatus || "No shipment status"}</span>
                  </div>
                ),
              },
              {
                key: "dates",
                title: "Dates",
                render: (row) => (
                  <div className="cell-stack">
                    <strong>ETA {formatDate(row.etaDate)}</strong>
                    <span className="helper-text">Ship {formatDate(row.shipDate)}</span>
                  </div>
                ),
              },
              { key: "incomingUnits", title: "Units", render: (row) => formatNumber(row.incomingUnits) },
            ]}
            rows={data.snapshot.manufacturingSnapshotRows}
          />
        </div>
        <div className="panel section-stack">
          <div className="panel-header"><h3>SKU Reorder Queue</h3></div>
          <div className="timeline">
            {data.snapshot.skuReorderWindows.slice(0, 10).map((item) => (
              <div key={item.sku} className="timeline-item">
                <strong>{item.productName}</strong>
                <p>{item.sku}</p>
                <span className="muted">
                  {item.recommendation} | Reorder by {item.reorderByDate ? formatDate(item.reorderByDate) : "manual review"}
                </span>
                <span className="helper-text">On hand {item.currentQuantity} | Incoming {item.incomingQuantity}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="split-grid">
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
    </div>
  );
}
