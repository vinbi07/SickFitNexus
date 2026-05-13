import { DataTable } from "@/components/DataTable";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsyncData } from "@/hooks/useAsyncData";
import { alertService } from "@/services/alertService";
import { formatDate } from "@/utils/format";

export function AlertsPage() {
  const { data, loading, error, reload } = useAsyncData(() => alertService.list(), []);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load alerts"} />;

  return (
    <div className="section-stack">
      <PageHeader
        title="Alerts"
        description="Rule-based operational alerts for overdue POs, stockout risk, inventory mismatches, and missing data."
        actions={
          <div className="btn-row">
            <button
              className="btn btn-secondary"
              onClick={async () => {
                await alertService.generateOperationalAlerts();
                await reload();
              }}
            >
              Generate Alerts
            </button>
          </div>
        }
      />
      <DataTable
        columns={[
          { key: "alert_type", title: "Type", render: (row) => row.alert_type },
          { key: "severity", title: "Severity", render: (row) => <StatusBadge label={row.severity} /> },
          { key: "message", title: "Message", render: (row) => row.message },
          { key: "related_entity_type", title: "Entity", render: (row) => row.related_entity_type ?? "N/A" },
          { key: "created_at", title: "Created", render: (row) => formatDate(row.created_at) },
          {
            key: "action",
            title: "Action",
            render: (row) =>
              row.is_resolved ? (
                <StatusBadge label="Resolved" />
              ) : (
                <button
                  className="btn btn-ghost"
                  onClick={async () => {
                    await alertService.resolve(row.id);
                    await reload();
                  }}
                >
                  Resolve
                </button>
              ),
          },
        ]}
        rows={data}
      />
    </div>
  );
}
