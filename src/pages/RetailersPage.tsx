import { useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable } from "@/components/DataTable";
import { EntityFormModal } from "@/components/EntityFormModal";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
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
  const [deleting, setDeleting] = useState<RetailerSnapshot | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const { data, loading, error, reload } = useAsyncData(async () => retailerService.getSnapshots(), []);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load accounts"} />;

  const rows = data.filter((retailer) =>
    [
      retailer.name,
      retailer.primary_contact_name,
      retailer.primary_contact_email,
      retailer.account_number,
      retailer.retailer_group,
    ]
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  return (
    <div className="section-stack">
      <PageHeader
        title="Accounts"
        description="Operate wholesale retailer accounts with quick access to contacts, SOP notes, shipping requirements, account numbers, reorder windows, and recent PO activity."
        actions={<button className="btn btn-primary" onClick={() => setEditing({ name: "", status: "Prospect" })}>Add Account</button>}
      />
      {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}
      <div className="panel">
        <div className="filter-row">
          <input placeholder="Search retailer, contact, account number, or group" value={query} onChange={(event) => setQuery(event.target.value)} />
          <button className="btn btn-secondary" onClick={() => void reload()}>
            Refresh
          </button>
        </div>
      </div>
      <DataTable
        emptyMessage="No accounts yet. Add an account to start tracking retailer operations."
        columns={[
          {
            key: "name",
            title: "Account",
            render: (row) => (
              <div className="cell-stack">
                <Link className="table-link" to={`/retailers/${row.id}`}>{row.name}</Link>
                <span className="helper-text">{row.retailer_group ?? row.account_number ?? "No group / account number"}</span>
              </div>
            ),
          },
          { key: "status", title: "Status", render: (row) => <StatusBadge label={row.status} /> },
          { key: "contact", title: "Primary Contact", render: (row) => row.primary_contact_name ?? row.primary_contact_email ?? "N/A" },
          { key: "window", title: "Next Reorder Window", render: (row) => row.next_reorder_start ? `${formatDate(row.next_reorder_start)} - ${formatDate(row.next_reorder_end)}` : "Not set" },
          { key: "spend", title: "Wholesale Revenue", render: (row) => formatCurrency(row.totalSpend) },
          { key: "locations", title: "Locations", render: (row) => row.activeLocations },
          {
            key: "actions",
            title: "Actions",
            render: (row) => (
              <div className="btn-row">
                <Link className="btn btn-ghost btn-small" to={`/retailers/${row.id}`}>Open Profile</Link>
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
          title={editing.id ? "Edit Account" : "Add Account"}
          saveLabel={editing.id ? "Save Changes" : "Create Account"}
          initialValues={{
            name: editing.name ?? "",
            status: editing.status ?? "Prospect",
            primary_contact_name: editing.primary_contact_name ?? "",
            primary_contact_email: editing.primary_contact_email ?? "",
            primary_contact_phone: editing.primary_contact_phone ?? "",
            secondary_contacts: editing.secondary_contacts ?? "",
            account_number: editing.account_number ?? "",
            retailer_group: editing.retailer_group ?? "",
            parent_retailer_id: editing.parent_retailer_id ?? "",
            ordering_cadence_days: editing.ordering_cadence_days ?? 0,
            next_reorder_start: editing.next_reorder_start ?? "",
            next_reorder_end: editing.next_reorder_end ?? "",
            shipping_requirements: editing.shipping_requirements ?? "",
            sop_notes: editing.sop_notes ?? "",
            notes: editing.notes ?? "",
          }}
          fields={[
            { key: "name", label: "Account Name", required: true },
            { key: "status", label: "Status", type: "select", options: [{ label: "Prospect", value: "Prospect" }, { label: "Pilot", value: "Pilot" }, { label: "Active", value: "Active" }, { label: "Paused", value: "Paused" }] },
            { key: "account_number", label: "Account Number" },
            { key: "retailer_group", label: "Parent / Group" },
            { key: "primary_contact_name", label: "Primary Contact" },
            { key: "primary_contact_email", label: "Email" },
            { key: "primary_contact_phone", label: "Phone" },
            { key: "ordering_cadence_days", label: "Ordering Cadence (days)", type: "number", min: 0, step: 1 },
            { key: "next_reorder_start", label: "Next Reorder Start", type: "date" },
            { key: "next_reorder_end", label: "Next Reorder End", type: "date" },
            { key: "secondary_contacts", label: "Additional Contacts", type: "textarea" },
            { key: "shipping_requirements", label: "Shipping Requirements", type: "textarea" },
            { key: "sop_notes", label: "SOP Notes", type: "textarea" },
            { key: "notes", label: "Notes", type: "textarea" },
          ]}
          onSave={async (values) => {
            if (!String(values.name ?? "").trim()) throw new Error("Account name is required.");
            await retailerService.upsert({
              ...editing,
              ...values,
              primary_contact_name: values.primary_contact_name ? String(values.primary_contact_name) : null,
              primary_contact_email: values.primary_contact_email ? String(values.primary_contact_email) : null,
              primary_contact_phone: values.primary_contact_phone ? String(values.primary_contact_phone) : null,
              secondary_contacts: values.secondary_contacts ? String(values.secondary_contacts) : null,
              account_number: values.account_number ? String(values.account_number) : null,
              retailer_group: values.retailer_group ? String(values.retailer_group) : null,
              parent_retailer_id: values.parent_retailer_id ? String(values.parent_retailer_id) : null,
              ordering_cadence_days: Number(values.ordering_cadence_days ?? 0) || null,
              next_reorder_start: values.next_reorder_start ? String(values.next_reorder_start) : null,
              next_reorder_end: values.next_reorder_end ? String(values.next_reorder_end) : null,
              shipping_requirements: values.shipping_requirements ? String(values.shipping_requirements) : null,
              sop_notes: values.sop_notes ? String(values.sop_notes) : null,
              notes: values.notes ? String(values.notes) : null,
            });
            await reload();
            setNotice({ tone: "success", message: editing.id ? "Account updated successfully." : "Account created successfully." });
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title="Delete account?"
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
              setNotice({ tone: "success", message: "Account deleted successfully." });
            } catch (err) {
              setNotice({ tone: "error", message: err instanceof Error ? err.message : "Failed to delete account." });
            } finally {
              setBusyDelete(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}
