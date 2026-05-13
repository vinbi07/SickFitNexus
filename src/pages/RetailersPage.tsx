import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable } from "@/components/DataTable";
import { EntityFormModal } from "@/components/EntityFormModal";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Modal } from "@/components/Modal";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsyncData } from "@/hooks/useAsyncData";
import { retailerService } from "@/services/retailerService";
import type { Retailer } from "@/types/domain";
import { formatCurrency, formatDate } from "@/utils/format";

type RetailerSnapshot = Retailer & {
  totalPos: number;
  totalSpend: number;
  activeLocations: number;
  compliantRequirements: number;
  atRiskRequirements: number;
};

export function RetailersPage() {
  const [editing, setEditing] = useState<Partial<Retailer> | null>(null);
  const [viewing, setViewing] = useState<RetailerSnapshot | null>(null);
  const [deleting, setDeleting] = useState<RetailerSnapshot | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const { data, loading, error, reload } = useAsyncData(async () => retailerService.getSnapshots(), []);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load retailers"} />;

  const rows = data.filter((retailer) =>
    [retailer.name, retailer.primary_contact_name, retailer.primary_contact_email]
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  return (
    <div className="section-stack">
      <PageHeader
        title="Retailers"
        description="Track first-class retailer accounts, cadence, next reorder windows, account status, and demand context."
        actions={<button className="btn btn-primary" onClick={() => setEditing({ name: "", status: "Prospect" })}>Add Retailer</button>}
      />
      {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}
      <div className="panel">
        <div className="filter-row">
          <input placeholder="Search retailer or contact" value={query} onChange={(event) => setQuery(event.target.value)} />
          <button className="btn btn-secondary" onClick={() => void reload()}>
            Refresh
          </button>
        </div>
      </div>
      <DataTable
        emptyMessage="No retailers yet. Add an account to start cadence and compliance tracking."
        columns={[
          { key: "name", title: "Retailer", render: (row) => <span className="table-link">{row.name}</span> },
          { key: "status", title: "Status", render: (row) => <StatusBadge label={row.status} /> },
          { key: "contact", title: "Primary Contact", render: (row) => row.primary_contact_name ?? row.primary_contact_email ?? "N/A" },
          { key: "cadence", title: "Cadence", render: (row) => row.ordering_cadence_days ? `${row.ordering_cadence_days}d` : "Not enough history" },
          { key: "window", title: "Next Reorder Window", render: (row) => row.next_reorder_start ? `${formatDate(row.next_reorder_start)} - ${formatDate(row.next_reorder_end)}` : "Not set" },
          { key: "spend", title: "PO Spend", render: (row) => formatCurrency(row.totalSpend) },
          {
            key: "actions",
            title: "Actions",
            render: (row) => (
              <div className="btn-row">
                <button className="btn btn-ghost btn-small" onClick={() => setViewing(row)}>View</button>
                <button className="btn btn-secondary btn-small" onClick={() => setEditing(row)}>Edit</button>
                <button className="btn btn-danger btn-small" onClick={() => setDeleting(row)}>Delete</button>
              </div>
            ),
          },
        ]}
        rows={rows}
      />
      {editing ? (
        <EntityFormModal<Partial<Retailer>>
          title={editing.id ? "Edit Retailer" : "Add Retailer"}
          saveLabel={editing.id ? "Save Changes" : "Create Retailer"}
          initialValues={{
            name: editing.name ?? "",
            status: editing.status ?? "Prospect",
            primary_contact_name: editing.primary_contact_name ?? "",
            primary_contact_email: editing.primary_contact_email ?? "",
            primary_contact_phone: editing.primary_contact_phone ?? "",
            ordering_cadence_days: editing.ordering_cadence_days ?? 0,
            next_reorder_start: editing.next_reorder_start ?? "",
            next_reorder_end: editing.next_reorder_end ?? "",
            notes: editing.notes ?? "",
          }}
          fields={[
            { key: "name", label: "Retailer", required: true },
            { key: "status", label: "Status", type: "select", options: [{ label: "Prospect", value: "Prospect" }, { label: "Pilot", value: "Pilot" }, { label: "Active", value: "Active" }, { label: "Paused", value: "Paused" }] },
            { key: "primary_contact_name", label: "Primary Contact" },
            { key: "primary_contact_email", label: "Email" },
            { key: "primary_contact_phone", label: "Phone" },
            { key: "ordering_cadence_days", label: "Ordering Cadence (days)", type: "number", min: 0, step: 1 },
            { key: "next_reorder_start", label: "Next Reorder Start", type: "date" },
            { key: "next_reorder_end", label: "Next Reorder End", type: "date" },
            { key: "notes", label: "Notes", type: "textarea" },
          ]}
          onSave={async (values) => {
            if (!String(values.name ?? "").trim()) throw new Error("Retailer name is required.");
            await retailerService.upsert({
              ...editing,
              ...values,
              primary_contact_name: values.primary_contact_name ? String(values.primary_contact_name) : null,
              primary_contact_email: values.primary_contact_email ? String(values.primary_contact_email) : null,
              primary_contact_phone: values.primary_contact_phone ? String(values.primary_contact_phone) : null,
              ordering_cadence_days: Number(values.ordering_cadence_days ?? 0) || null,
              next_reorder_start: values.next_reorder_start ? String(values.next_reorder_start) : null,
              next_reorder_end: values.next_reorder_end ? String(values.next_reorder_end) : null,
              notes: values.notes ? String(values.notes) : null,
            });
            await reload();
            setNotice({ tone: "success", message: editing.id ? "Retailer updated successfully." : "Retailer created successfully." });
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {viewing ? (
        <Modal title={viewing.name} onClose={() => setViewing(null)} actions={<button className="btn btn-ghost" onClick={() => setViewing(null)}>Close</button>}>
          <div className="detail-grid">
            <div className="detail-card"><span>Status</span><strong>{viewing.status}</strong></div>
            <div className="detail-card"><span>Contact</span><strong>{viewing.primary_contact_name ?? viewing.primary_contact_email ?? "N/A"}</strong></div>
            <div className="detail-card"><span>Cadence</span><strong>{viewing.ordering_cadence_days ? `${viewing.ordering_cadence_days} days` : "Not enough history"}</strong></div>
            <div className="detail-card"><span>PO Spend</span><strong>{formatCurrency(viewing.totalSpend)}</strong></div>
            <div className="detail-card"><span>PO Count</span><strong>{viewing.totalPos}</strong></div>
            <div className="detail-card"><span>Active Locations</span><strong>{viewing.activeLocations}</strong></div>
            <div className="detail-card"><span>Compliant Requirements</span><strong>{viewing.compliantRequirements}</strong></div>
            <div className="detail-card"><span>At Risk Requirements</span><strong>{viewing.atRiskRequirements}</strong></div>
            <div className="detail-card"><span>Next Reorder Start</span><strong>{formatDate(viewing.next_reorder_start)}</strong></div>
            <div className="detail-card"><span>Next Reorder End</span><strong>{formatDate(viewing.next_reorder_end)}</strong></div>
            <div className="detail-card" style={{ gridColumn: "1 / -1" }}><span>Notes</span><strong>{viewing.notes ?? "No notes added."}</strong></div>
          </div>
        </Modal>
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title="Delete retailer?"
          message={`This will permanently remove ${deleting.name}.`}
          busy={busyDelete}
          onClose={() => {
            if (!busyDelete) setDeleting(null);
          }}
          onConfirm={async () => {
            try {
              setBusyDelete(true);
              await retailerService.remove(deleting.id);
              setDeleting(null);
              await reload();
              setNotice({ tone: "success", message: "Retailer deleted successfully." });
            } catch (err) {
              setNotice({ tone: "error", message: err instanceof Error ? err.message : "Failed to delete retailer." });
            } finally {
              setBusyDelete(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}
