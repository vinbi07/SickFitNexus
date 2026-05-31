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
import { supportService } from "@/services/supportService";
import { vendorService } from "@/services/vendorService";
import type { Vendor } from "@/types/domain";
import { formatCurrency, formatNumber } from "@/utils/format";

type VendorScorecard = Vendor & {
  totalPos: number;
  totalSpend: number;
  averageDeliveryDelay: number;
  latePoPercentage: number;
  fillRate: number;
  concentrationRisk: number;
  reliabilityScore: number;
};

export function VendorsPage() {
  const [editing, setEditing] = useState<Partial<Vendor> | null>(null);
  const [viewing, setViewing] = useState<VendorScorecard | null>(null);
  const [deleting, setDeleting] = useState<VendorScorecard | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("reliability");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const { data, loading, error, reload } = useAsyncData(async () => ({
    scorecards: (await vendorService.getScorecards()) as VendorScorecard[],
    products: await supportService.listProducts(),
  }), []);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load vendors"} />;

  const filteredRows = data.scorecards
    .filter((row) => {
      const query = search.trim().toLowerCase();
      return (
        !query ||
        row.name.toLowerCase().includes(query) ||
        (row.contact_email ?? "").toLowerCase().includes(query) ||
        (row.contact_phone ?? "").toLowerCase().includes(query)
      );
    })
    .sort((left, right) => {
      if (sort === "spend") return right.totalSpend - left.totalSpend;
      if (sort === "delay") return right.averageDeliveryDelay - left.averageDeliveryDelay;
      return right.reliabilityScore - left.reliabilityScore;
    });

  return (
    <div className="section-stack">
      <PageHeader
        title="Vendors"
        description="Manage supplier records, contacts, lead times, and operational performance."
        actions={<button className="btn btn-primary" onClick={() => setEditing({ name: "" })}>Add New Vendor</button>}
      />
      {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}
      <div className="panel">
        <div className="filter-row">
          <input placeholder="Search vendor, email, phone" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="reliability">Sort by reliability</option>
            <option value="spend">Sort by spend</option>
            <option value="delay">Sort by delay</option>
          </select>
          <button className="btn btn-secondary" onClick={() => void reload()}>
            Refresh
          </button>
        </div>
      </div>
      <DataTable
        emptyMessage="No vendors yet. Add suppliers to connect products and purchase orders."
        columns={[
          {
            key: "name",
            title: "Vendor / Contact",
            render: (row) => (
              <div className="cell-stack">
                <span className="table-link">{row.name}</span>
                <span className="helper-text">{row.contact_email ?? row.contact_phone ?? "No contact info"}</span>
              </div>
            ),
          },
          {
            key: "activity",
            title: "Spend / POs",
            render: (row) => (
              <div className="cell-stack">
                <strong>{formatCurrency(row.totalSpend)}</strong>
                <span className="helper-text">{row.totalPos} POs | Lead {row.lead_time_days ?? 0} days</span>
              </div>
            ),
          },
          {
            key: "performance",
            title: "Performance",
            render: (row) => (
              <div className="cell-stack">
                <strong>{formatNumber(row.fillRate, 1)}% fill</strong>
                <span className="helper-text">{formatNumber(row.averageDeliveryDelay, 1)} days avg delay</span>
              </div>
            ),
          },
          {
            key: "reliabilityScore",
            title: "Reliability",
            render: (row) => (
              <StatusBadge label={`${Math.round(row.reliabilityScore)} ${row.reliabilityScore < 65 ? "High Risk" : "Stable"}`} />
            ),
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
                <button className="btn btn-danger btn-small" onClick={() => setDeleting(row)}>
                  Delete
                </button>
              </div>
            ),
          },
        ]}
        rows={filteredRows}
      />
      {editing ? (
        <EntityFormModal<Partial<Vendor>>
          title={editing.id ? "Edit Vendor" : "Add Vendor"}
          saveLabel={editing.id ? "Save Changes" : "Create Vendor"}
          initialValues={{
            name: editing.name ?? "",
            contact_email: editing.contact_email ?? "",
            contact_phone: editing.contact_phone ?? "",
            lead_time_days: editing.lead_time_days ?? 0,
            notes: editing.notes ?? "",
          }}
          fields={[
            { key: "name", label: "Name", required: true },
            { key: "contact_email", label: "Email" },
            { key: "contact_phone", label: "Phone" },
            { key: "lead_time_days", label: "Lead Time (days)", type: "number", min: 0, step: 1 },
            { key: "notes", label: "Notes", type: "textarea" },
          ]}
          onSave={async (values) => {
            if (!String(values.name ?? "").trim()) throw new Error("Vendor name is required.");
            await vendorService.upsert({
              ...editing,
              ...values,
              contact_email: values.contact_email ? String(values.contact_email) : null,
              contact_phone: values.contact_phone ? String(values.contact_phone) : null,
              notes: values.notes ? String(values.notes) : null,
              lead_time_days: Number(values.lead_time_days ?? 0),
            });
            await reload();
            setNotice({
              tone: "success",
              message: editing.id ? "Vendor updated successfully." : "Vendor created successfully.",
            });
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {viewing ? (
        <Modal
          title={viewing.name}
          onClose={() => setViewing(null)}
          actions={<button className="btn btn-ghost" onClick={() => setViewing(null)}>Cancel</button>}
        >
          <div className="detail-grid">
            <div className="detail-card"><span>Email</span><strong>{viewing.contact_email ?? "N/A"}</strong></div>
            <div className="detail-card"><span>Phone</span><strong>{viewing.contact_phone ?? "N/A"}</strong></div>
            <div className="detail-card"><span>Lead Time</span><strong>{viewing.lead_time_days ?? 0} days</strong></div>
            <div className="detail-card"><span>Reliability</span><strong>{Math.round(viewing.reliabilityScore)}</strong></div>
            <div className="detail-card"><span>Total Spend</span><strong>{formatCurrency(viewing.totalSpend)}</strong></div>
            <div className="detail-card"><span>Linked Products</span><strong>{data.products.filter((product) => product.vendor_id === viewing.id).length}</strong></div>
            <div className="detail-card"><span>Average Delay</span><strong>{formatNumber(viewing.averageDeliveryDelay, 1)} days</strong></div>
            <div className="detail-card"><span>Fill Rate</span><strong>{formatNumber(viewing.fillRate, 1)}%</strong></div>
            <div className="detail-card" style={{ gridColumn: "1 / -1" }}><span>Notes</span><strong>{viewing.notes ?? "No notes added."}</strong></div>
          </div>
        </Modal>
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title="Delete vendor?"
          message={`This removes ${deleting.name}. Products and purchase orders linked to this vendor may need reassignment first.`}
          busy={busyDelete}
          onClose={() => {
            if (!busyDelete) setDeleting(null);
          }}
          onConfirm={async () => {
            try {
              setBusyDelete(true);
              await vendorService.remove(deleting.id);
              setDeleting(null);
              await reload();
              setNotice({ tone: "success", message: "Vendor deleted successfully." });
            } catch (err) {
              setNotice({ tone: "error", message: err instanceof Error ? err.message : "Failed to delete vendor." });
            } finally {
              setBusyDelete(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}
