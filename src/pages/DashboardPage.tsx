import { BarChartCard } from "@/components/BarChartCard";
import { DashboardCard } from "@/components/DashboardCard";
import { ErrorState } from "@/components/ErrorState";
import { LineChartCard } from "@/components/LineChartCard";
import { LoadingState } from "@/components/LoadingState";
import { MultiLineChartCard } from "@/components/MultiLineChartCard";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsyncData } from "@/hooks/useAsyncData";
import { dashboardService } from "@/services/dashboardService";
import { formatCurrency, formatDate, formatNumber } from "@/utils/format";
import { useState } from "react";

export function DashboardPage() {
  const [syncingShopify, setSyncingShopify] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const { data, loading, error, reload } = useAsyncData(() => dashboardService.getSnapshot(), []);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load dashboard"} />;

  return (
    <div className="section-stack">
      <PageHeader
        title="Command Dashboard"
        description="Monitor revenue, wholesale pipeline, SKU risk, production flow, and operator priorities without changing the existing Nexus structure."
        actions={(
          <div className="btn-row">
            <button
              className="btn btn-secondary"
              disabled={syncingShopify}
              onClick={async () => {
                try {
                  setSyncingShopify(true);
                  const result = await dashboardService.syncShopifyDashboard();
                  await reload();
                  setNotice({
                    tone: "success",
                    message: `Shopify dashboard sync completed. ${result.ordersSynced ?? 0} orders and ${result.lineItemsSynced ?? 0} line items refreshed from the last ${result.lookbackDays ?? 365} days.`,
                  });
                } catch (err) {
                  setNotice({
                    tone: "error",
                    message: err instanceof Error ? err.message : "Shopify dashboard sync failed.",
                  });
                } finally {
                  setSyncingShopify(false);
                }
              }}
            >
              {syncingShopify ? "Syncing Shopify Dashboard..." : "Sync Shopify Dashboard"}
            </button>
          </div>
        )}
      />
      {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}
      {syncingShopify ? (
        <div className="panel section-stack">
          <div className="panel-header">
            <h3>Shopify Dashboard Sync In Progress</h3>
          </div>
          <div className="sync-progress-shell" aria-live="polite" aria-busy="true">
            <div className="sync-progress-bar" />
          </div>
          <p className="muted">Pulling a year of Shopify orders for dashboard revenue and DTC metrics in chunked batches.</p>
        </div>
      ) : null}
      <div className="card-grid">
        <DashboardCard
          label="Revenue YTD"
          value={formatCurrency(data.revenueYtd)}
          footnote={`${data.revenueYtdDeltaPercent >= 0 ? "+" : ""}${data.revenueYtdDeltaPercent}% vs prior YTD`}
          highlight
        />
        <DashboardCard
          label="Active Wholesale Pipeline"
          value={formatCurrency(data.activeWholesalePipelineValue)}
          footnote={`${data.activeWholesalePipelineCount} open wholesale POs`}
        />
        <DashboardCard
          label="Awaiting Action"
          value={data.awaitingActionCount}
          footnote={`${data.awaitingPoSubmissionCount} need PO submitted`}
        />
        <DashboardCard
          label="SKUs at OOS Risk <90d"
          value={data.skuOosRisk90dCount}
          footnote={`${data.skuOosRiskCriticalCount} critical`}
        />
        <DashboardCard
          label="Production POs in Flight"
          value={data.productionPosInFlightCount}
          footnote={`Next land: ${data.productionNextLandDate ? formatDate(data.productionNextLandDate) : "N/A"}`}
        />
        <DashboardCard
          label="DTC Orders Today"
          value={data.dtcOrdersTodayCount}
          footnote={formatCurrency(data.dtcOrdersTodayValue)}
        />
      </div>
      <div className="split-grid">
        <div className="panel section-stack">
          <div className="panel-header">
            <h3>Revenue Pace vs Prior YTD</h3>
          </div>
          <div className="detail-grid">
            <div className="detail-card">
              <span>Current YTD Revenue</span>
              <strong>{formatCurrency(data.revenueYtd)}</strong>
            </div>
            <div className="detail-card">
              <span>Prior YTD Baseline</span>
              <strong>{formatCurrency(data.priorRevenueYtd)}</strong>
            </div>
            <div className="detail-card">
              <span>Projected Year End</span>
              <strong>{formatCurrency(data.projectedRevenueYearEnd)}</strong>
            </div>
            <div className="detail-card">
              <span>On / Off Track</span>
              <strong className={data.revenuePaceDeltaPercent >= 0 ? "success-text" : "danger-text"}>
                {data.revenuePaceDeltaPercent >= 0 ? "+" : ""}
                {data.revenuePaceDeltaPercent}% vs prior YTD
              </strong>
            </div>
          </div>
          <p className="helper-text">
            The prior baseline line is a straight full-year benchmark: it starts at zero in January and ends at your saved prior YTD revenue in December.
          </p>
        </div>
        <MultiLineChartCard
          title="Revenue Projection"
          data={data.revenueProjectionTrend}
          xKey="label"
          series={[
            { dataKey: "actualRevenue", label: "Actual YTD", stroke: "#111111" },
            { dataKey: "projectedRevenue", label: "Projected Pace", stroke: "#e72027" },
            { dataKey: "priorBaselineRevenue", label: "Prior YTD Pace", stroke: "#69707d", strokeDasharray: "6 4" },
          ]}
        />
      </div>
      <div className="split-grid">
        <div className="panel section-stack">
          <div className="panel-header">
            <h3>Revenue by Channel (YTD)</h3>
          </div>
          <div className="stat-list">
            {data.revenueByChannelYtd.map((item) => (
              <div key={item.channel} className="stat-row">
                <div className="cell-stack">
                  <strong>{item.channel}</strong>
                  <span className="muted">YTD</span>
                </div>
                <strong>{formatCurrency(item.value)}</strong>
              </div>
            ))}
          </div>
        </div>
        <div className="panel section-stack">
          <div className="panel-header">
            <h3>Top SKUs YTD</h3>
          </div>
          <div className="stat-list">
            {data.topSkusYtd.length ? data.topSkusYtd.map((item) => (
              <div key={item.sku || item.label} className="stat-row">
                <div className="cell-stack">
                  <strong>{item.label}</strong>
                  <span className="muted">{item.units} units</span>
                </div>
                <strong>{formatCurrency(item.value)}</strong>
              </div>
            )) : (
              <div className="empty-state">No YTD SKU revenue data is available yet.</div>
            )}
          </div>
        </div>
      </div>
      <div className="section-stack">
        <div className="section-header">
          <h3>Operations Snapshot</h3>
          <span className="helper-text">Current operational depth stays in place below the new executive-level KPIs.</span>
        </div>
        <div className="card-grid">
          <DashboardCard label="Weighted Forecast" value={formatCurrency(data.weightedForecastValue)} footnote="Modeled from current retailer PO pipeline" highlight />
          <DashboardCard label="Active Pipeline" value={formatCurrency(data.activePipelineValue)} footnote={`${data.openPoCount} open operational orders`} />
          <DashboardCard label="Due in 14 Days" value={data.dueIn14DaysCount} footnote="Retailer and manufacturer deadlines approaching" />
          <DashboardCard label="Pending Intake" value={data.pendingIntakeCount} footnote="Forwarded or unprocessed PO requests" />
          <DashboardCard label="Low Stock Items" value={data.lowStockCount} footnote="Current inventory at or below safety stock" />
          <DashboardCard label="Paid to Delivery" value={`${data.avgPaidToDeliveredDays}d`} footnote="Average manufacturer lead time after invoice payment" />
        </div>
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
