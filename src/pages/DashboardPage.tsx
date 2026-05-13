import { BarChartCard } from "@/components/BarChartCard";
import { DashboardCard } from "@/components/DashboardCard";
import { ErrorState } from "@/components/ErrorState";
import { LineChartCard } from "@/components/LineChartCard";
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
        title="Command Dashboard"
        description="Monitor weighted forecast, pipeline movement, due-soon orders, SKU risk, and manufacturer lead-time health without changing the existing Nexus structure."
      />
      <div className="card-grid">
        <DashboardCard label="Weighted Forecast" value={formatCurrency(data.weightedForecastValue)} footnote="Modeled from current retailer PO pipeline" highlight />
        <DashboardCard label="Active Pipeline" value={formatCurrency(data.activePipelineValue)} footnote={`${data.openPoCount} open operational orders`} />
        <DashboardCard label="Due in 14 Days" value={data.dueIn14DaysCount} footnote="Retailer and manufacturer deadlines approaching" />
        <DashboardCard label="Pending Intake" value={data.pendingIntakeCount} footnote="Forwarded or unprocessed PO requests" />
        <DashboardCard label="Low Stock Items" value={data.lowStockCount} footnote="Current inventory at or below safety stock" />
        <DashboardCard label="Paid to Delivery" value={`${data.avgPaidToDeliveredDays}d`} footnote="Average manufacturer lead time after invoice payment" />
      </div>
      <div className="split-grid">
        <div className="panel section-stack">
          <div className="panel-header">
            <h3>Priority Feed</h3>
          </div>
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
        <div className="panel section-stack">
          <div className="panel-header"><h3>Upcoming Reorder Windows</h3></div>
          <div className="timeline">
            {data.reorderWindows.length ? data.reorderWindows.map((item) => (
              <div key={item.retailer} className="timeline-item">
                <strong>{item.retailer}</strong>
                <p>{item.window}</p>
                <span className="muted">{item.productHint}</span>
              </div>
            )) : <div className="empty-state">No retailer reorder windows calculated yet.</div>}
          </div>
        </div>
      </div>
      <div className="split-grid">
        <BarChartCard title="Retailer Pipeline Value" data={data.pipelineByRetailer} xKey="retailer" dataKey="value" />
        <LineChartCard title="Manufacturer Paid-to-Delivery Trend" data={data.leadTimeTrend} xKey="label" dataKey="days" />
      </div>
      <div className="split-grid">
        <LineChartCard title="Inventory by Record" data={data.stockTrend} xKey="date" dataKey="inventory" />
        <BarChartCard title="Spend by Vendor" data={data.spendByVendor} xKey="vendor" dataKey="spend" />
      </div>
      <div className="split-grid">
        <div className="panel section-stack">
          <div className="panel-header"><h3>Recent CSV Imports</h3></div>
          <div className="timeline">
            {data.recentImports.map((item) => (
              <div key={item.id} className="timeline-item">
                <strong>{item.file_name}</strong>
                <p>{item.successful_rows} successful rows | {item.failed_rows} failed rows</p>
              </div>
            ))}
          </div>
        </div>
        <div className="panel section-stack">
          <div className="panel-header"><h3>Quick SOP Links</h3></div>
          <div className="quick-links">
            {data.quickSops.map((sop) => (
              <a
                key={sop.id}
                className="quick-link-card"
                href={sop.external_url ?? sop.file_url ?? "#"}
                target="_blank"
                rel="noreferrer"
              >
                <strong>{sop.title}</strong>
                <p className="muted">{sop.category}</p>
              </a>
            ))}
          </div>
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
          <div className="helper-text">Inventory value: {formatCurrency(data.inventoryValue)} | Vendor risk count: {formatNumber(data.vendorRiskCount)}</div>
        </div>
      </div>
    </div>
  );
}
