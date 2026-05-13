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
import { purchaseOrderService } from "@/services/purchaseOrderService";
import type { CapacitySnapshot } from "@/types/domain";
import { daysBetween } from "@/utils/date";
import { formatDate } from "@/utils/format";

export function ProductionPage() {
  const [editing, setEditing] = useState<Partial<CapacitySnapshot> | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const { data, loading, error, reload } = useAsyncData(
    async () => ({
      capacity: await capacityService.list(),
      purchaseOrders: await purchaseOrderService.list({ poType: "Manufacturer PO" }),
    }),
    [],
  );

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load production"} />;

  const paidNoTracking = data.purchaseOrders.filter((po) => po.invoice_paid_at && !po.tracking_number);
  const activeProduction = data.purchaseOrders.filter((po) => !["Received", "Closed", "Cancelled"].includes(po.status));
  const manufacturerCapacity = data.capacity.filter((snapshot) => snapshot.capacity_type === "Manufacturer");
  const threePlCapacity = data.capacity.filter((snapshot) => snapshot.capacity_type === "3PL");

  return (
    <div className="section-stack">
      <PageHeader
        title="Production"
        description="Track manufacturer capacity, active production POs, paid-without-tracking risk, and future 3PL readiness without replacing the current Nexus architecture."
        actions={<button className="btn btn-primary" onClick={() => setEditing({ snapshot_date: new Date().toISOString().slice(0, 10), capacity_type: "Manufacturer", partner_name: "" })}>Add Capacity Snapshot</button>}
      />
      {notice ? <NotificationBanner tone={notice.tone} message={notice.tone === "success" ? notice.message : notice.message} onClose={() => setNotice(null)} /> : null}
      <div className="card-grid">
        <DashboardCard label="POs in Flight" value={activeProduction.length} />
        <DashboardCard label="Paid, No Tracking" value={paidNoTracking.length} footnote="Elevate these in vendor follow-up" />
        <DashboardCard label="Manufacturer Snapshots" value={manufacturerCapacity.length} />
        <DashboardCard label="3PL Snapshots" value={threePlCapacity.length} footnote="Manual / discovery-ready for now" />
      </div>
      <div className="split-grid">
        <div className="panel section-stack">
          <div className="panel-header"><h3>Active Manufacturer POs</h3></div>
          <DataTable
            emptyMessage="No manufacturer POs yet."
            columns={[
              { key: "po_number", title: "PO", render: (row) => row.po_number },
              { key: "vendor", title: "Manufacturer", render: (row) => row.vendors?.name ?? "Unassigned" },
              { key: "status", title: "Status", render: (row) => <StatusBadge label={row.status} /> },
              { key: "invoice_paid_at", title: "Invoice Paid", render: (row) => formatDate(row.invoice_paid_at) },
              { key: "tracking", title: "Tracking", render: (row) => row.tracking_number ?? row.tracking_status ?? "Missing" },
              { key: "aging", title: "Age Since Paid", render: (row) => row.invoice_paid_at ? `${daysBetween(row.invoice_paid_at, new Date().toISOString().slice(0, 10))}d` : "N/A" },
            ]}
            rows={activeProduction}
          />
        </div>
        <div className="panel section-stack">
          <div className="panel-header"><h3>Capacity Tracker</h3></div>
          <DataTable
            emptyMessage="No capacity snapshots yet."
            columns={[
              { key: "snapshot_date", title: "Date", render: (row) => formatDate(row.snapshot_date) },
              { key: "capacity_type", title: "Type", render: (row) => row.capacity_type },
              { key: "partner_name", title: "Partner", render: (row) => row.partner_name },
              { key: "lane_name", title: "Lane", render: (row) => row.lane_name ?? "N/A" },
              { key: "available_units", title: "Available", render: (row) => row.available_units },
              { key: "committed_units", title: "Committed", render: (row) => row.committed_units },
            ]}
            rows={data.capacity}
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
