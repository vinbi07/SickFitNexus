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
import type { Sop } from "@/types/domain";

export function SopsPage() {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Partial<Sop> | null>(null);
  const [viewing, setViewing] = useState<Sop | null>(null);
  const [deleting, setDeleting] = useState<Sop | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const { data, loading, error, reload } = useAsyncData(() => supportService.listSops(), []);

  const filtered = useMemo(
    () =>
      (data ?? []).filter((sop) =>
        [sop.title, sop.category, sop.description, ...(sop.tags ?? [])]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [data, query],
  );

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load SOP library"} />;

  return (
    <div className="section-stack">
      <PageHeader
        title="SOP Library"
        description="Manage SOP quick links, categories, favorites, and supporting documentation in one place."
        actions={<button className="btn btn-primary" onClick={() => setEditing({ title: "", tags: [] })}>Add SOP</button>}
      />
      {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}
      <div className="panel">
        <div className="filter-row">
          <input
            placeholder="Search SOP title, category, description, or tags"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button className="btn btn-secondary" onClick={() => void reload()}>
            Refresh
          </button>
        </div>
      </div>
      <DataTable
        emptyMessage="No SOPs yet. Add a standard operating procedure to start building the library."
        columns={[
          {
            key: "title",
            title: "Title",
            render: (row) => (
              <div className="cell-stack">
                <strong>{row.title}</strong>
                <span className="helper-text">{row.category ?? "Uncategorized"}</span>
              </div>
            ),
          },
          { key: "tags", title: "Tags", render: (row) => row.tags.length ? row.tags.join(", ") : "No tags" },
          { key: "favorite", title: "Favorite", render: (row) => (row.is_favorite ? "Yes" : "No") },
          { key: "link", title: "Link", render: (row) => <a href={row.external_url ?? row.file_url ?? "#"} target="_blank" rel="noreferrer">Open</a> },
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
        rows={filtered}
      />
      {editing ? (
        <EntityFormModal<Partial<Sop>>
          title={editing.id ? "Edit SOP" : "Add SOP"}
          saveLabel={editing.id ? "Save Changes" : "Create SOP"}
          initialValues={{
            title: editing.title ?? "",
            category: editing.category ?? "",
            description: editing.description ?? "",
            external_url: editing.external_url ?? "",
            file_url: editing.file_url ?? "",
            is_favorite: editing.is_favorite ?? false,
            tags: (editing.tags ?? []).join(", "),
          } as Partial<Sop> & { tags: string }}
          fields={[
            { key: "title", label: "Title", required: true },
            { key: "category", label: "Category" },
            { key: "external_url", label: "External URL" },
            { key: "file_url", label: "File URL" },
            { key: "tags", label: "Tags (comma separated)" },
            { key: "description", label: "Description", type: "textarea" },
          ]}
          onSave={async (values) => {
            if (!String(values.title ?? "").trim()) throw new Error("Title is required.");
            await supportService.saveSop({
              ...editing,
              ...values,
              category: values.category ? String(values.category) : null,
              description: values.description ? String(values.description) : null,
              external_url: values.external_url ? String(values.external_url) : null,
              file_url: values.file_url ? String(values.file_url) : null,
              tags: String(values.tags ?? "")
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean),
            } as Partial<Sop>);
            await reload();
            setNotice({ tone: "success", message: editing.id ? "SOP updated successfully." : "SOP created successfully." });
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {viewing ? (
        <Modal
          title={viewing.title}
          onClose={() => setViewing(null)}
          actions={<button className="btn btn-ghost" onClick={() => setViewing(null)}>Cancel</button>}
        >
          <div className="detail-grid">
            <div className="detail-card"><span>Category</span><strong>{viewing.category ?? "Uncategorized"}</strong></div>
            <div className="detail-card"><span>Favorite</span><strong>{viewing.is_favorite ? "Yes" : "No"}</strong></div>
            <div className="detail-card"><span>External URL</span><strong>{viewing.external_url ?? "N/A"}</strong></div>
            <div className="detail-card"><span>File URL</span><strong>{viewing.file_url ?? "N/A"}</strong></div>
            <div className="detail-card"><span>Tags</span><strong>{viewing.tags.length ? viewing.tags.join(", ") : "No tags"}</strong></div>
            <div className="detail-card"><span>Updated</span><strong>{new Date(viewing.updated_at).toLocaleString()}</strong></div>
            <div className="detail-card" style={{ gridColumn: "1 / -1" }}><span>Description</span><strong>{viewing.description ?? "No description added."}</strong></div>
          </div>
        </Modal>
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title="Delete SOP?"
          message={`This will permanently remove "${deleting.title}" from the SOP library.`}
          busy={busyDelete}
          onClose={() => {
            if (!busyDelete) setDeleting(null);
          }}
          onConfirm={async () => {
            try {
              setBusyDelete(true);
              await supportService.deleteSop(deleting.id);
              setDeleting(null);
              await reload();
              setNotice({ tone: "success", message: "SOP deleted successfully." });
            } catch (err) {
              setNotice({ tone: "error", message: err instanceof Error ? err.message : "Failed to delete SOP." });
            } finally {
              setBusyDelete(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}
