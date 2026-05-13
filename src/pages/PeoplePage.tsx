import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable } from "@/components/DataTable";
import { EntityFormModal } from "@/components/EntityFormModal";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Modal } from "@/components/Modal";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader } from "@/components/PageHeader";
import { useAsyncData } from "@/hooks/useAsyncData";
import { supportService } from "@/services/supportService";
import type { Person } from "@/types/domain";

export function PeoplePage() {
  const [editing, setEditing] = useState<Partial<Person> | null>(null);
  const [viewing, setViewing] = useState<Person | null>(null);
  const [deleting, setDeleting] = useState<Person | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const { data, loading, error, reload } = useAsyncData(() => supportService.listPeople(), []);

  const filteredPeople = useMemo(
    () =>
      (data ?? []).filter((person) =>
        [
          person.name,
          person.role,
          person.company,
          person.email,
          person.phone,
          ...(person.expertise_tags ?? []),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [data, query],
  );

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load people directory"} />;

  return (
    <div className="section-stack">
      <PageHeader
        title="People Directory"
        description="Manage mentors, vendor contacts, and operational experts with direct contact details."
        actions={<button className="btn btn-primary" onClick={() => setEditing({ name: "", expertise_tags: [] })}>Add Person</button>}
      />
      {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}
      <div className="panel">
        <div className="filter-row">
          <input placeholder="Search people, company, role, contact, or expertise" value={query} onChange={(event) => setQuery(event.target.value)} />
          <button className="btn btn-secondary" onClick={() => void reload()}>
            Refresh
          </button>
        </div>
      </div>
      <DataTable
        emptyMessage="No people yet. Add a person to build out the directory."
        columns={[
          {
            key: "name",
            title: "Name",
            render: (row) => (
              <div className="cell-stack">
                <strong>{row.name}</strong>
                <span className="helper-text">{row.role ?? "No role listed"}</span>
              </div>
            ),
          },
          { key: "company", title: "Company", render: (row) => row.company ?? "N/A" },
          { key: "expertise_tags", title: "Expertise", render: (row) => row.expertise_tags.length ? row.expertise_tags.join(", ") : "N/A" },
          { key: "email", title: "Contact", render: (row) => row.email ? <a href={`mailto:${row.email}`}>{row.email}</a> : "N/A" },
          { key: "calendar_url", title: "Calendar", render: (row) => row.calendar_url ? <a href={row.calendar_url} target="_blank" rel="noreferrer">Open</a> : "N/A" },
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
        rows={filteredPeople}
      />
      {editing ? (
        <EntityFormModal<Partial<Person>>
          title={editing.id ? "Edit Person" : "Add Person"}
          saveLabel={editing.id ? "Save Changes" : "Create Person"}
          initialValues={{
            name: editing.name ?? "",
            role: editing.role ?? "",
            company: editing.company ?? "",
            email: editing.email ?? "",
            phone: editing.phone ?? "",
            calendar_url: editing.calendar_url ?? "",
            notes: editing.notes ?? "",
            expertise_tags: (editing.expertise_tags ?? []).join(", "),
          } as Partial<Person> & { expertise_tags: string }}
          fields={[
            { key: "name", label: "Name", required: true },
            { key: "role", label: "Role" },
            { key: "company", label: "Company" },
            { key: "email", label: "Email" },
            { key: "phone", label: "Phone" },
            { key: "calendar_url", label: "Calendar URL" },
            { key: "expertise_tags", label: "Expertise Tags (comma separated)" },
            { key: "notes", label: "Notes", type: "textarea" },
          ]}
          onSave={async (values) => {
            if (!String(values.name ?? "").trim()) throw new Error("Name is required.");
            await supportService.savePerson({
              ...editing,
              ...values,
              role: values.role ? String(values.role) : null,
              company: values.company ? String(values.company) : null,
              email: values.email ? String(values.email) : null,
              phone: values.phone ? String(values.phone) : null,
              calendar_url: values.calendar_url ? String(values.calendar_url) : null,
              notes: values.notes ? String(values.notes) : null,
              expertise_tags: String(values.expertise_tags ?? "")
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean),
            } as Partial<Person>);
            await reload();
            setNotice({ tone: "success", message: editing.id ? "Person updated successfully." : "Person created successfully." });
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
            <div className="detail-card"><span>Role</span><strong>{viewing.role ?? "N/A"}</strong></div>
            <div className="detail-card"><span>Company</span><strong>{viewing.company ?? "N/A"}</strong></div>
            <div className="detail-card"><span>Email</span><strong>{viewing.email ?? "N/A"}</strong></div>
            <div className="detail-card"><span>Phone</span><strong>{viewing.phone ?? "N/A"}</strong></div>
            <div className="detail-card"><span>Calendar</span><strong>{viewing.calendar_url ?? "N/A"}</strong></div>
            <div className="detail-card"><span>Expertise</span><strong>{viewing.expertise_tags.length ? viewing.expertise_tags.join(", ") : "N/A"}</strong></div>
            <div className="detail-card" style={{ gridColumn: "1 / -1" }}><span>Notes</span><strong>{viewing.notes ?? "No notes added."}</strong></div>
          </div>
        </Modal>
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title="Delete person?"
          message={`This will permanently remove "${deleting.name}" from the people directory.`}
          busy={busyDelete}
          onClose={() => {
            if (!busyDelete) setDeleting(null);
          }}
          onConfirm={async () => {
            try {
              setBusyDelete(true);
              await supportService.deletePerson(deleting.id);
              setDeleting(null);
              await reload();
              setNotice({ tone: "success", message: "Person deleted successfully." });
            } catch (err) {
              setNotice({ tone: "error", message: err instanceof Error ? err.message : "Failed to delete person." });
            } finally {
              setBusyDelete(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}
