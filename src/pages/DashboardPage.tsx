import { Link } from "react-router-dom";
import { DashboardCard } from "@/components/DashboardCard";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsyncData } from "@/hooks/useAsyncData";
import { dashboardService } from "@/services/dashboardService";
import { formatCurrency, formatDate, formatNumber } from "@/utils/format";

export function DashboardPage() {
  const { data, loading, error } = useAsyncData(() => dashboardService.getSnapshot(), []);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load dashboard"} />;

  return (
    <div className="section-stack">
      <PageHeader
        title="Operations Dashboard"
        description="Focus the command center on wholesale revenue, incoming inventory, manufacturing invoice status, retailer visibility, and urgent inventory risks."
      />
      <div className="card-grid">
        <DashboardCard label="Wholesale Revenue" value={formatCurrency(data.wholesaleRevenueTotal)} footnote="Wholesale only. Shopify / DTC excluded." highlight />
        <DashboardCard label="Danger SKUs" value={data.dangerSkuCount} footnote="Red when on-hand inventory is 25 units or less." />
        <DashboardCard label="Incoming Inventory" value={formatNumber(data.incomingInventoryUnits)} footnote={`${data.activeSkusInRoute} active SKUs in route`} />
        <DashboardCard label="Open Invoices" value={data.openInvoiceCount} footnote="Manufacturer invoices not shipped yet" />
        <DashboardCard label="Shipped Invoices" value={data.shippedInvoiceCount} footnote={`${data.inventoryInRouteCount} still in route`} />
        <DashboardCard label="Awaiting Action" value={data.awaitingActionCount} footnote="Urgent inventory and invoice follow-up" />
      </div>
      <div className="split-grid">
        <div className="panel section-stack">
          <div className="panel-header">
            <h3>Manufacturing Snapshot</h3>
            <Link className="btn btn-secondary btn-small" to="/production">Open Manufacturing</Link>
          </div>
          <div className="stat-list">
            {data.manufacturingSnapshotRows.length ? data.manufacturingSnapshotRows.map((row) => (
              <div key={row.poId} className="stat-row">
                <div className="cell-stack">
                  <strong>{row.poNumber} | {row.manufacturer}</strong>
                  <span className="muted">
                    {row.skuCount} SKUs | {formatNumber(row.incomingUnits)} units | ETA {formatDate(row.etaDate)}
                  </span>
                  <span className="helper-text">{row.reorderWindowSummary}</span>
                </div>
                <div className="cell-stack">
                  <StatusBadge label={row.invoiceStatus} />
                  <span className="muted">{row.shipmentStatus}</span>
                </div>
              </div>
            )) : <div className="empty-state">No active manufacturing invoices are in route right now.</div>}
          </div>
        </div>
        <div className="panel section-stack">
          <div className="panel-header"><h3>Priority Feed</h3></div>
          <div className="timeline">
            {data.priorityFeed.map((item) => (
              <div key={item.id} className="timeline-item">
                <div className="panel-header">
                  <strong>{item.title}</strong>
                  <StatusBadge label={item.severity} />
                </div>
                <p>{item.detail}</p>
                {item.actionLabel ? <span className="helper-text">{item.actionLabel}</span> : null}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="split-grid">
        <div className="panel section-stack">
          <div className="panel-header"><h3>Retailer Visibility</h3></div>
          <div className="stat-list">
            {data.wholesaleAccounts.length ? data.wholesaleAccounts.map((account) => (
              <div key={account.retailerId} className="stat-row">
                <div className="cell-stack">
                  <strong>{account.retailer}</strong>
                  <span className="muted">{account.recentPoCount} recent POs</span>
                  <span className="helper-text">{account.nextWindow}</span>
                </div>
                <div className="cell-stack">
                  <span>{account.openInvoices} open</span>
                  <span>{account.shippedInvoices} shipped / route</span>
                </div>
              </div>
            )) : <div className="empty-state">No retailer activity has been logged yet.</div>}
          </div>
        </div>
        <div className="panel section-stack">
          <div className="panel-header"><h3>Inventory Danger Alerts</h3></div>
          <div className="timeline">
            {data.inventoryAlerts.length ? data.inventoryAlerts.map((item) => (
              <div key={item.sku} className={`timeline-item${item.status === "danger" ? " timeline-item-danger" : ""}`}>
                <div className="panel-header">
                  <strong>{item.productName}</strong>
                  <StatusBadge label={item.status === "danger" ? "Danger" : item.status === "warning" ? "Low" : "Healthy"} />
                </div>
                <p>{item.sku}</p>
                <span className="muted">On hand: {item.currentQuantity} | Incoming: {item.incomingQuantity}</span>
              </div>
            )) : <div className="empty-state">No inventory alerts right now.</div>}
          </div>
        </div>
      </div>
      <div className="panel section-stack">
        <div className="panel-header"><h3>SKU Reorder Windows</h3></div>
        <div className="stat-list">
          {data.skuReorderWindows.slice(0, 8).map((item) => (
            <div key={item.sku} className="stat-row">
              <div className="cell-stack">
                <strong>{item.productName}</strong>
                <span className="muted">{item.sku}</span>
              </div>
              <div className="cell-stack">
                <strong>{item.recommendation}</strong>
                <span className="muted">
                  Reorder by {item.reorderByDate ? formatDate(item.reorderByDate) : "manual review"}
                </span>
                <span className="helper-text">On hand {item.currentQuantity} | Incoming {item.incomingQuantity}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="split-grid">
        <div className="panel section-stack">
          <div className="panel-header"><h3>Recent Alerts</h3></div>
          <div className="timeline">
            {data.recentAlerts.map((alert) => (
              <div key={alert.id} className="timeline-item">
                <strong>{alert.message}</strong>
                <p>{formatDate(alert.created_at)}</p>
                <StatusBadge label={`${alert.severity} ${alert.alert_type}`} />
              </div>
            ))}
          </div>
        </div>
        <div className="panel section-stack">
          <div className="panel-header"><h3>Activity Feed</h3></div>
          <div className="timeline">
            {data.recentActivity.map((item) => (
              <div key={item.id} className="timeline-item">
                <strong>{item.title}</strong>
                <p>{item.description}</p>
                <span className="muted">{formatDate(item.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
