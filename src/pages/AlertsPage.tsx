import { DataTable } from "@/components/DataTable";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsyncData } from "@/hooks/useAsyncData";
import { alertService, type AlertListItem } from "@/services/alertService";
import { Link } from "react-router-dom";
import { formatDate, formatNumber } from "@/utils/format";

function getSeverityRank(severity: AlertListItem["severity"]) {
  switch (severity) {
    case "Critical":
      return 4;
    case "High":
      return 3;
    case "Medium":
      return 2;
    case "Low":
    default:
      return 1;
  }
}

function isInventoryAlert(alert: AlertListItem) {
  return alert.related_entity_type === "product" || ["Low Stock", "Projected Stockout"].includes(alert.alert_type);
}

function isPurchaseOrderAlert(alert: AlertListItem) {
  return alert.related_entity_type === "purchase_order";
}

function AlertAction({ alert, onResolve }: { alert: AlertListItem; onResolve: (id: string) => Promise<void> }) {
  if (alert.is_resolved) return <StatusBadge label="Resolved" />;

  return (
    <button className="btn btn-ghost" onClick={() => void onResolve(alert.id)}>
      Resolve
    </button>
  );
}

function AlertSource({ alert }: { alert: AlertListItem }) {
  if (!alert.sourceHref) {
    return <strong>{alert.sourceLabel}</strong>;
  }

  return (
    <Link className="table-link" to={alert.sourceHref}>
      {alert.sourceLabel}
    </Link>
  );
}

function AlertTimeline({
  title,
  helper,
  alerts,
  onResolve,
  emptyMessage,
}: {
  title: string;
  helper: string;
  alerts: AlertListItem[];
  onResolve: (id: string) => Promise<void>;
  emptyMessage: string;
}) {
  return (
    <div className="panel section-stack">
      <div className="panel-header">
        <div>
          <h3>{title}</h3>
          <span className="helper-text">{helper}</span>
        </div>
        <StatusBadge label={`${alerts.length} alerts`} />
      </div>
      <div className="timeline">
        {alerts.length ? alerts.map((alert) => (
          <div key={alert.id} className={`timeline-item${getSeverityRank(alert.severity) >= 3 ? " timeline-item-danger" : ""}`}>
            <div className="panel-header">
              <div className="cell-stack">
                <strong>{alert.message}</strong>
                <span className="muted">{alert.alert_type} {alert.related_entity_type ? `| ${alert.related_entity_type.replace("_", " ")}` : ""}</span>
              </div>
              <StatusBadge label={alert.severity} />
            </div>
            <div className="detail-grid">
              <div className="detail-card">
                <span>Created</span>
                <strong>{formatDate(alert.created_at)}</strong>
              </div>
              <div className="detail-card">
                <span>Source</span>
                <strong><AlertSource alert={alert} /></strong>
              </div>
              <div className="detail-card">
                <span>Status</span>
                <strong>{alert.is_resolved ? "Resolved" : "Open"}</strong>
              </div>
              <div className="detail-card">
                <span>Action</span>
                <strong>{alert.is_resolved ? "Closed" : "Needs follow-up"}</strong>
              </div>
              <div className="detail-card">
                <span>Owner Cue</span>
                <strong>{isInventoryAlert(alert) ? "Inventory / replenishment" : isPurchaseOrderAlert(alert) ? "PO / vendor follow-up" : "Operations review"}</strong>
              </div>
            </div>
            <div className="btn-row">
              <AlertAction alert={alert} onResolve={onResolve} />
            </div>
          </div>
        )) : <div className="empty-state">{emptyMessage}</div>}
      </div>
    </div>
  );
}

export function AlertsPage() {
  const { data, loading, error, reload } = useAsyncData(() => alertService.list(), []);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load alerts"} />;

  const unresolvedAlerts = data.filter((alert) => !alert.is_resolved);
  const resolvedAlerts = data.filter((alert) => alert.is_resolved);
  const immediateAlerts = unresolvedAlerts.filter((alert) => getSeverityRank(alert.severity) >= 3);
  const inventoryAlerts = unresolvedAlerts.filter(isInventoryAlert);
  const purchaseOrderAlerts = unresolvedAlerts.filter(isPurchaseOrderAlert);
  const watchlistAlerts = unresolvedAlerts.filter((alert) => !immediateAlerts.includes(alert) && !purchaseOrderAlerts.includes(alert));
  const criticalCount = unresolvedAlerts.filter((alert) => alert.severity === "Critical").length;
  const revenueRiskCount = inventoryAlerts.filter((alert) => getSeverityRank(alert.severity) >= 3).length;

  const handleResolve = async (id: string) => {
    await alertService.resolve(id);
    await reload();
  };

  return (
    <div className="section-stack">
      <PageHeader
        title="Alerts"
        description="An executive triage board for immediate fixes, revenue-risk inventory issues, PO follow-up, and the full operating alert log."
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

      <div className="card-grid">
        <div className="card metric-card">
          <span>Open Alerts</span>
          <strong>{formatNumber(unresolvedAlerts.length)}</strong>
          <p>Everything still waiting on action.</p>
        </div>
        <div className="card metric-card">
          <span>Do First</span>
          <strong>{formatNumber(immediateAlerts.length)}</strong>
          <p>Critical and high-severity issues that should be reviewed first.</p>
        </div>
        <div className="card metric-card">
          <span>Revenue Risk</span>
          <strong>{formatNumber(revenueRiskCount)}</strong>
          <p>Top-priority inventory alerts, already ranked by sales contribution.</p>
        </div>
        <div className="card metric-card">
          <span>Resolved</span>
          <strong>{formatNumber(resolvedAlerts.length)}</strong>
          <p>Closed items retained for visibility and follow-through.</p>
        </div>
      </div>

      <div className="panel section-stack">
        <div className="panel-header">
          <div>
            <h3>CEO View</h3>
            <span className="helper-text">Start with the highest urgency work, then move into inventory revenue risk and PO follow-up.</span>
          </div>
          <StatusBadge label={criticalCount > 0 ? `${criticalCount} critical` : "No critical alerts"} />
        </div>
        <div className="detail-grid">
          <div className="detail-card">
            <span>1. Immediate Action</span>
            <strong>{immediateAlerts[0]?.message ?? "No urgent blockers right now."}</strong>
          </div>
          <div className="detail-card">
            <span>2. Revenue at Risk</span>
            <strong>{inventoryAlerts[0]?.message ?? "No inventory-led revenue risks are open."}</strong>
          </div>
          <div className="detail-card">
            <span>3. PO Follow-Up</span>
            <strong>{purchaseOrderAlerts[0]?.message ?? "No PO follow-up is pending."}</strong>
          </div>
          <div className="detail-card">
            <span>Open vs Resolved</span>
            <strong>{unresolvedAlerts.length} open | {resolvedAlerts.length} resolved</strong>
          </div>
        </div>
      </div>

      <AlertTimeline
        title="Do First"
        helper="Critical and high-severity alerts. This is the fastest read on what needs executive attention now."
        alerts={immediateAlerts}
        onResolve={handleResolve}
        emptyMessage="No critical or high-severity alerts are open."
      />

      <div className="split-grid">
        <AlertTimeline
          title="Revenue at Risk"
          helper="Low-stock and stockout-related product alerts. Higher-selling products are already prioritized first."
          alerts={inventoryAlerts}
          onResolve={handleResolve}
          emptyMessage="No active inventory revenue risks are open."
        />
        <AlertTimeline
          title="PO Follow-Up"
          helper="Missing dates, overdue purchase orders, and supplier-side issues that can block inbound inventory."
          alerts={purchaseOrderAlerts}
          onResolve={handleResolve}
          emptyMessage="No purchase order follow-up is pending."
        />
      </div>

      <div className="split-grid">
        <AlertTimeline
          title="Watchlist"
          helper="Medium and low-severity items that still deserve monitoring but do not belong at the top of the queue."
          alerts={watchlistAlerts}
          onResolve={handleResolve}
          emptyMessage="No watchlist items are open."
        />
        <AlertTimeline
          title="Recently Resolved"
          helper="Closed alerts for context, accountability, and a quick sense of what has already been handled."
          alerts={resolvedAlerts.slice(0, 8)}
          onResolve={handleResolve}
          emptyMessage="No resolved alerts yet."
        />
      </div>

      <div className="panel section-stack">
        <div className="panel-header">
          <div>
            <h3>All Alerts</h3>
            <span className="helper-text">Complete alert log in sorted order for detailed review.</span>
          </div>
        </div>
        <DataTable
          columns={[
            { key: "alert_type", title: "Type", render: (row) => row.alert_type },
            { key: "severity", title: "Severity", render: (row) => <StatusBadge label={row.severity} /> },
            { key: "message", title: "Message", render: (row) => row.message },
            { key: "source", title: "Source", render: (row) => <AlertSource alert={row} /> },
            { key: "related_entity_type", title: "Entity", render: (row) => row.related_entity_type ?? "N/A" },
            { key: "created_at", title: "Created", render: (row) => formatDate(row.created_at) },
            {
              key: "action",
              title: "Action",
              render: (row) => <AlertAction alert={row} onResolve={handleResolve} />,
            },
          ]}
          rows={data}
        />
      </div>
    </div>
  );
}
