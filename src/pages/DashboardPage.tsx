import { BarChartCard } from "@/components/BarChartCard";
import { DashboardCard } from "@/components/DashboardCard";
import { ErrorState } from "@/components/ErrorState";
import { LineChartCard } from "@/components/LineChartCard";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsyncData } from "@/hooks/useAsyncData";
import { dashboardService } from "@/services/dashboardService";
import { formatCurrency, formatDate } from "@/utils/format";

export function DashboardPage() {
  const { data, loading, error } = useAsyncData(() => dashboardService.getSnapshot(), []);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load dashboard"} />;

  return (
    <div className="section-stack">
      <PageHeader
        title="Command Dashboard"
        description="Monitor purchasing health, stock risk, recent imports, and executive-level operational movement."
      />
      <div className="card-grid">
        <DashboardCard label="Open POs" value={data.openPoCount} footnote="Active operational workload" highlight />
        <DashboardCard label="Delayed POs" value={data.delayedPoCount} footnote="Orders currently behind plan" />
        <DashboardCard label="Low Stock Items" value={data.lowStockCount} footnote="Current inventory at or below safety stock" />
        <DashboardCard label="Projected Stockouts" value={data.projectedStockoutCount} footnote="Products at risk within 14 days" />
        <DashboardCard label="Vendor Risk" value={data.vendorRiskCount} footnote="Vendors under reliability threshold" />
        <DashboardCard label="Inventory Value" value={formatCurrency(data.inventoryValue)} footnote="Estimated on-hand value" />
      </div>
      <div className="split-grid">
        <LineChartCard title="Inventory Depletion Trend" data={data.stockTrend} xKey="date" dataKey="inventory" />
        <BarChartCard title="Spend by Vendor" data={data.spendByVendor} xKey="vendor" dataKey="spend" />
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
          <div className="panel-header"><h3>Recent CSV Imports</h3></div>
          <div className="timeline">
            {data.recentImports.map((item) => (
              <div key={item.id} className="timeline-item">
                <strong>{item.file_name}</strong>
                <p>{item.successful_rows} successful rows • {item.failed_rows} failed rows</p>
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
