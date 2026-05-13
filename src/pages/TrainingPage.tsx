import { useMemo, useState } from "react";
import { DataTable } from "@/components/DataTable";
import { EntityFormModal } from "@/components/EntityFormModal";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsyncData } from "@/hooks/useAsyncData";
import { supportService } from "@/services/supportService";
import type { TrainingModule, TrainingProgress } from "@/types/domain";
import { formatDate, formatNumber } from "@/utils/format";

export function TrainingPage() {
  const [participantName, setParticipantName] = useState("Operations Team");
  const [editing, setEditing] = useState<Partial<TrainingModule> | null>(null);
  const { data, loading, error, reload } = useAsyncData(
    async () => ({
      modules: await supportService.listTrainingModules(),
      progress: await supportService.listTrainingProgress(),
    }),
    [],
  );

  const progressPercentage = useMemo(() => {
    if (!data || !data.modules.length) return 0;
    const completed = data.progress.filter((item) => item.is_complete && item.participant_name === participantName).length;
    return (completed / data.modules.length) * 100;
  }, [data, participantName]);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load training library"} />;

  return (
    <div className="section-stack">
      <PageHeader
        title="Training / Airport Lab Lite"
        description="Keep operational onboarding lightweight with modules, videos, and participant completion tracking."
        actions={<button className="btn btn-primary" onClick={() => setEditing({ title: "" })}>Add Module</button>}
      />
      <div className="card-grid">
        <div className="card metric-card">
          <span className="metric-label">Participant</span>
          <input value={participantName} onChange={(event) => setParticipantName(event.target.value)} />
        </div>
        <div className="card metric-card">
          <span className="metric-label">Progress</span>
          <strong className="metric-value">{formatNumber(progressPercentage, 0)}%</strong>
        </div>
      </div>
      <DataTable
        columns={[
          { key: "title", title: "Module", render: (row) => row.title },
          { key: "category", title: "Category", render: (row) => row.category ?? "N/A" },
          { key: "estimated_minutes", title: "Minutes", render: (row) => row.estimated_minutes },
          { key: "video_url", title: "Video", render: (row) => row.video_url ? <a href={row.video_url} target="_blank" rel="noreferrer">Open</a> : "N/A" },
          {
            key: "progress",
            title: "Completion",
            render: (row) => {
              const record = data.progress.find(
                (item) => item.module_id === row.id && item.participant_name === participantName,
              );
              return (
                <button
                  className="btn btn-ghost"
                  onClick={async () => {
                    await supportService.saveTrainingProgress({
                      ...(record as Partial<TrainingProgress>),
                      module_id: row.id,
                      participant_name: participantName,
                      is_complete: !record?.is_complete,
                      completed_at: !record?.is_complete ? new Date().toISOString() : null,
                    });
                    await reload();
                  }}
                >
                  {record?.is_complete ? <StatusBadge label={`Complete ${formatDate(record.completed_at)}`} /> : "Mark Complete"}
                </button>
              );
            },
          },
        ]}
        rows={data.modules}
      />
      {editing ? (
        <EntityFormModal<Partial<TrainingModule>>
          title={editing.id ? "Edit Module" : "Add Module"}
          initialValues={{
            title: editing.title ?? "",
            category: editing.category ?? "",
            description: editing.description ?? "",
            video_url: editing.video_url ?? "",
            estimated_minutes: editing.estimated_minutes ?? 15,
          }}
          fields={[
            { key: "title", label: "Title" },
            { key: "category", label: "Category" },
            { key: "video_url", label: "Video URL" },
            { key: "estimated_minutes", label: "Estimated Minutes", type: "number" },
            { key: "description", label: "Description", type: "textarea" },
          ]}
          onSave={async (values) => {
            await supportService.saveTrainingModule({
              ...editing,
              ...values,
              resource_links: editing.resource_links ?? [],
              sort_order: editing.sort_order ?? 0,
            });
            await reload();
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
