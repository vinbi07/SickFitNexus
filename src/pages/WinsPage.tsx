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
import type { Win } from "@/types/domain";
import { formatDate } from "@/utils/format";

export function WinsPage() {
  const [editing, setEditing] = useState<Partial<Win> | null>(null);
  const [viewing, setViewing] = useState<Win | null>(null);
  const [deleting, setDeleting] = useState<Win | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const { data, loading, error, reload } = useAsyncData(() => supportService.listWins(), []);

  const filteredWins = useMemo(
    () =>
      (data ?? []).filter((win) =>
        [win.title, win.description, win.created_by].join(" ").toLowerCase().includes(query.toLowerCase()),
      ),
    [data, query],
  );

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load wins board"} />;

  return (
    <div className="section-stack">
      <PageHeader
        title="Wins Board"
        description="Capture operational milestones, celebrate team momentum, and manage the wins feed."
        actions={<button className="btn btn-primary" onClick={() => setEditing({ title: "" })}>Create Win</button>}
      />
      {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}
      <div className="panel">
        <div className="filter-row">
          <input placeholder="Search title, description, or creator" value={query} onChange={(event) => setQuery(event.target.value)} />
          <button className="btn btn-secondary" onClick={() => void reload()}>
            Refresh
          </button>
        </div>
      </div>
      <DataTable
        emptyMessage="No wins yet. Create a win to start capturing milestones and team momentum."
        columns={[
          {
            key: "title",
            title: "Title",
            render: (row) => (
              <div className="cell-stack">
                <strong>{row.title}</strong>
                <span className="helper-text">{row.created_by ?? "Unknown creator"}</span>
              </div>
            ),
          },
          { key: "description", title: "Description", render: (row) => row.description ?? "N/A" },
          { key: "reaction_count", title: "Reactions", render: (row) => row.reaction_count },
          { key: "created_at", title: "Created", render: (row) => formatDate(row.created_at) },
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
        rows={filteredWins}
      />
      {editing ? (
        <EntityFormModal<Partial<Win>>
          title={editing.id ? "Edit Win" : "Create Win"}
          saveLabel={editing.id ? "Save Changes" : "Create Win"}
          initialValues={{
            title: editing.title ?? "",
            description: editing.description ?? "",
            created_by: editing.created_by ?? "",
            image_url: editing.image_url ?? "",
          }}
          fields={[
            { key: "title", label: "Title", required: true },
            { key: "created_by", label: "Created By" },
            { key: "image_url", label: "Image URL" },
            { key: "description", label: "Description", type: "textarea" },
          ]}
          onSave={async (values) => {
            if (!String(values.title ?? "").trim()) throw new Error("Title is required.");
            await supportService.saveWin({
              ...editing,
              ...values,
              description: values.description ? String(values.description) : null,
              created_by: values.created_by ? String(values.created_by) : null,
              image_url: values.image_url ? String(values.image_url) : null,
              reaction_count: editing.reaction_count ?? 0,
            });
            await reload();
            setNotice({ tone: "success", message: editing.id ? "Win updated successfully." : "Win created successfully." });
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
            <div className="detail-card"><span>Created By</span><strong>{viewing.created_by ?? "N/A"}</strong></div>
            <div className="detail-card"><span>Reactions</span><strong>{viewing.reaction_count}</strong></div>
            <div className="detail-card"><span>Created</span><strong>{new Date(viewing.created_at).toLocaleString()}</strong></div>
            <div className="detail-card"><span>Updated</span><strong>{new Date(viewing.updated_at).toLocaleString()}</strong></div>
            <div className="detail-card"><span>Image URL</span><strong>{viewing.image_url ?? "N/A"}</strong></div>
            <div className="detail-card"><span>Related Entity</span><strong>{viewing.related_entity_type ?? "N/A"}</strong></div>
            <div className="detail-card" style={{ gridColumn: "1 / -1" }}><span>Description</span><strong>{viewing.description ?? "No description added."}</strong></div>
          </div>
        </Modal>
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title="Delete win?"
          message={`This will permanently remove "${deleting.title}" from the wins board.`}
          busy={busyDelete}
          onClose={() => {
            if (!busyDelete) setDeleting(null);
          }}
          onConfirm={async () => {
            try {
              setBusyDelete(true);
              await supportService.deleteWin(deleting.id);
              setDeleting(null);
              await reload();
              setNotice({ tone: "success", message: "Win deleted successfully." });
            } catch (err) {
              setNotice({ tone: "error", message: err instanceof Error ? err.message : "Failed to delete win." });
            } finally {
              setBusyDelete(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}
