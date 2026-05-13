import { useMemo, useState } from "react";
import { DataTable } from "@/components/DataTable";
import { EntityFormModal } from "@/components/EntityFormModal";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { useAsyncData } from "@/hooks/useAsyncData";
import { supportService } from "@/services/supportService";
import type { Sop } from "@/types/domain";

export function SopsPage() {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Partial<Sop> | null>(null);
  const { data, loading, error, reload } = useAsyncData(() => supportService.listSops(), []);

  const filtered = useMemo(
    () =>
      (data ?? []).filter((sop) =>
        [sop.title, sop.category, ...(sop.tags ?? [])].join(" ").toLowerCase().includes(query.toLowerCase()),
      ),
    [data, query],
  );

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load SOP library"} />;

  return (
    <div className="section-stack">
      <PageHeader
        title="SOP Library"
        description="Supabase-backed SOP quick links with favorites, categories, search, and lightweight curation."
        actions={<button className="btn btn-primary" onClick={() => setEditing({ title: "", tags: [] })}>Add SOP</button>}
      />
      <div className="panel">
        <input
          placeholder="Search SOP title, category, or tags"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <DataTable
        columns={[
          { key: "title", title: "Title", render: (row) => row.title },
          { key: "category", title: "Category", render: (row) => row.category ?? "N/A" },
          { key: "tags", title: "Tags", render: (row) => row.tags.join(", ") },
          {
            key: "favorite",
            title: "Favorite",
            render: (row) => (
              <button
                className="btn btn-ghost"
                onClick={async () => {
                  await supportService.saveSop({ ...row, is_favorite: !row.is_favorite });
                  await reload();
                }}
              >
                {row.is_favorite ? "★" : "☆"}
              </button>
            ),
          },
          { key: "link", title: "Link", render: (row) => <a href={row.external_url ?? row.file_url ?? "#"} target="_blank" rel="noreferrer">Open</a> },
        ]}
        rows={filtered}
      />
      {editing ? (
        <EntityFormModal<Partial<Sop>>
          title={editing.id ? "Edit SOP" : "Add SOP"}
          initialValues={{
            title: editing.title ?? "",
            category: editing.category ?? "",
            description: editing.description ?? "",
            external_url: editing.external_url ?? "",
            file_url: editing.file_url ?? "",
          }}
          fields={[
            { key: "title", label: "Title" },
            { key: "category", label: "Category" },
            { key: "external_url", label: "External URL" },
            { key: "file_url", label: "File URL" },
            { key: "description", label: "Description", type: "textarea" },
          ]}
          onSave={async (values) => {
            await supportService.saveSop({ ...editing, ...values, tags: editing.tags ?? [] });
            await reload();
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
