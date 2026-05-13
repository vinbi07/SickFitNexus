import { useState } from "react";
import { DataTable } from "@/components/DataTable";
import { EntityFormModal } from "@/components/EntityFormModal";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { useAsyncData } from "@/hooks/useAsyncData";
import { supportService } from "@/services/supportService";
import type { Win } from "@/types/domain";
import { formatDate } from "@/utils/format";

export function WinsPage() {
  const [editing, setEditing] = useState<Partial<Win> | null>(null);
  const { data, loading, error, reload } = useAsyncData(() => supportService.listWins(), []);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load wins board"} />;

  return (
    <div className="section-stack">
      <PageHeader
        title="Wins Board"
        description="Capture lightweight wins, operational milestones, and team updates without turning this into chat."
        actions={<button className="btn btn-primary" onClick={() => setEditing({ title: "" })}>Create Win</button>}
      />
      <DataTable
        columns={[
          { key: "title", title: "Title", render: (row) => row.title },
          { key: "description", title: "Description", render: (row) => row.description ?? "N/A" },
          { key: "created_by", title: "Created By", render: (row) => row.created_by ?? "N/A" },
          { key: "reaction_count", title: "Reactions", render: (row) => row.reaction_count },
          { key: "created_at", title: "Created", render: (row) => formatDate(row.created_at) },
          {
            key: "action",
            title: "Action",
            render: (row) => (
              <button
                className="btn btn-ghost"
                onClick={async () => {
                  await supportService.saveWin({ ...row, reaction_count: row.reaction_count + 1 });
                  await reload();
                }}
              >
                +1
              </button>
            ),
          },
        ]}
        rows={data}
      />
      {editing ? (
        <EntityFormModal<Partial<Win>>
          title={editing.id ? "Edit Win" : "Create Win"}
          initialValues={{
            title: editing.title ?? "",
            description: editing.description ?? "",
            created_by: editing.created_by ?? "",
            image_url: editing.image_url ?? "",
          }}
          fields={[
            { key: "title", label: "Title" },
            { key: "created_by", label: "Created By" },
            { key: "image_url", label: "Image URL" },
            { key: "description", label: "Description", type: "textarea" },
          ]}
          onSave={async (values) => {
            await supportService.saveWin({ ...editing, ...values, reaction_count: editing.reaction_count ?? 0 });
            await reload();
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
