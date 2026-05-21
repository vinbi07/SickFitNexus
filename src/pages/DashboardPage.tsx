import { useState } from "react";
import { Link } from "react-router-dom";
import { BarChartCard } from "@/components/BarChartCard";
import { DashboardCard } from "@/components/DashboardCard";
import { DonutChartCard } from "@/components/DonutChartCard";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { MultiLineChartCard } from "@/components/MultiLineChartCard";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsyncData } from "@/hooks/useAsyncData";
import { dashboardService } from "@/services/dashboardService";
import { formatCurrency, formatDate, formatNumber } from "@/utils/format";

export function DashboardPage() {
  const [syncingShopifyDashboard, setSyncingShopifyDashboard] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const { data, loading, error, reload } = useAsyncData(() => dashboardService.getSnapshot(), []);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load dashboard"} />;

  const channelRevenueRows = data.revenueByChannelYtd.filter((item) => item.channel !== "DTC + Shopify");
  const topChannelValue = channelRevenueRows[0]?.value ?? 0;
  const totalChannelRevenue = channelRevenueRows.reduce((sum, item) => sum + item.value, 0);
  const dtcShopifyRevenue = data.revenueByChannelYtd.find((item) => item.channel === "DTC + Shopify")?.value ?? 0;

  return (
    <div className="section-stack">
      <PageHeader
        title="Operations Dashboard"
        description="Focus the command center on wholesale revenue, incoming inventory, manufacturing invoice status, retailer visibility, and urgent inventory risks."
      />
      {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}
      <div className="section-stack">
        <div className="section-header">
          <h2>Operations</h2>
          <span className="helper-text">Revenue, products, retailers, vendor spend, and inventory risk.</span>
        </div>
        <div className="card-grid dashboard-card-grid">
          <DashboardCard label="Wholesale Revenue" value={formatCurrency(data.wholesaleRevenueTotal)} footnote="Wholesale only. Shopify / DTC excluded." highlight to="/reports" />
          <DashboardCard
            label="DTC + Shopify Revenue"
            value={formatCurrency(dtcShopifyRevenue)}
            footnote="Direct-to-consumer revenue contribution"
            to="/reports"
            action={(
              <button
                type="button"
                className="btn btn-ghost btn-small dashboard-card-icon-button"
                disabled={syncingShopifyDashboard}
                aria-label={syncingShopifyDashboard ? "Syncing Shopify dashboard" : "Sync Shopify dashboard"}
                title={syncingShopifyDashboard ? "Syncing Shopify dashboard" : "Sync Shopify dashboard"}
                onClick={async () => {
                  try {
                    setSyncingShopifyDashboard(true);
                    const result = await dashboardService.syncShopifyDashboard();
                    await reload();
                    setNotice({
                      tone: "success",
                      message: `Shopify dashboard sync completed. ${result.ordersSynced ?? 0} orders and ${result.lineItemsSynced ?? 0} line items refreshed.`,
                    });
                  } catch (err) {
                    setNotice({
                      tone: "error",
                      message: err instanceof Error ? err.message : "Shopify dashboard sync failed.",
                    });
                  } finally {
                    setSyncingShopifyDashboard(false);
                  }
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M20 12a8 8 0 1 1-2.34-5.66"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                  <path
                    d="M20 4v6h-6"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
              </button>
            )}
          />
          <DashboardCard label="SKUs at OOS Risk < 90d" value={data.skuOosRisk90dCount} footnote={`${data.skuOosRiskCriticalCount} critical`} to="/products" />
          <DashboardCard label="Danger SKUs" value={data.dangerSkuCount} footnote="Red when on-hand inventory is 25 units or less." to="/inventory" />
          <DashboardCard label="Awaiting Action" value={data.awaitingActionCount} footnote="Urgent inventory and invoice follow-up" to="/alerts" />
        </div>
        <div className="split-grid">
          <div className="panel section-stack">
            <div className="panel-header">
              <h3>Revenue Pace vs Prior YTD</h3>
              <Link className="btn btn-secondary btn-small" to="/reports">Open Reports</Link>
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
                  {data.revenuePaceDeltaPercent}% vs prior pace
                </strong>
              </div>
            </div>
            <p className="helper-text">
              Baseline pace uses the saved prior-year YTD benchmark and spreads it across the full year for a pace comparison.
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
              <h3>Revenue by Channel</h3>
              <span className="helper-text">Wholesale channels only</span>
            </div>
            <div className="channel-lane-board">
              {channelRevenueRows.length ? channelRevenueRows.map((item, index) => {
                const widthPercent = topChannelValue > 0 ? Math.max((item.value / topChannelValue) * 100, 8) : 0;
                const sharePercent = totalChannelRevenue > 0 ? Math.round((item.value / totalChannelRevenue) * 100) : 0;

                return (
                  <div key={item.channel} className="channel-lane-row">
                    <div className="channel-lane-meta">
                      <span className="channel-lane-rank">{String(index + 1).padStart(2, "0")}</span>
                      <div className="cell-stack">
                        <strong>{item.channel}</strong>
                        <span className="muted">{sharePercent}% of shown channel revenue</span>
                      </div>
                    </div>
                    <div className="channel-lane-track" aria-hidden="true">
                      <div className="channel-lane-fill" style={{ width: `${widthPercent}%` }} />
                    </div>
                    <strong className="channel-lane-value">{formatCurrency(item.value)}</strong>
                  </div>
                );
              }) : <div className="empty-state">No wholesale channel revenue data is available yet.</div>}
            </div>
          </div>
          <div className="panel section-stack">
            <div className="panel-header">
              <h3>Top SKUs YTD</h3>
              <Link className="btn btn-secondary btn-small" to="/products">Open Products</Link>
            </div>
            <div className="stat-list">
              {data.topSkusYtd.length ? data.topSkusYtd.map((item) => (
                <Link key={item.sku || item.label} className="dashboard-link-row" to="/products">
                  <div className="stat-row">
                    <div className="cell-stack">
                      <strong>{item.label}</strong>
                      <span className="muted">{item.sku || "SKU unavailable"}</span>
                    </div>
                    <div className="cell-stack">
                      <strong>{formatCurrency(item.value)}</strong>
                      <span className="muted">{formatNumber(item.units)} units</span>
                    </div>
                  </div>
                </Link>
              )) : <div className="empty-state">No YTD SKU revenue data is available yet.</div>}
            </div>
          </div>
        </div>
        <div className="split-grid">
          <div className="dashboard-panel-shell">
            <BarChartCard title="Retailer Pipeline Value" data={data.pipelineByRetailer} xKey="retailer" dataKey="value" />
            <Link className="dashboard-panel-action" to="/retailers">Open Accounts</Link>
          </div>
          <div className="dashboard-panel-shell">
            <DonutChartCard title="Inventory Status Breakdown" data={data.inventoryStatusBreakdown} />
            <Link className="dashboard-panel-action" to="/inventory">Open Inventory</Link>
          </div>
        </div>
        <div className="split-grid">
          <div className="dashboard-panel-shell">
            <BarChartCard title="Spend by Vendor" data={data.spendByVendor} xKey="vendor" dataKey="spend" />
            <Link className="dashboard-panel-action" to="/vendors">Open Vendors</Link>
          </div>
          <div className="panel section-stack">
            <div className="panel-header">
              <h3>Retailer Visibility</h3>
              <Link className="btn btn-secondary btn-small" to="/retailers">Open Accounts</Link>
            </div>
            <div className="stat-list">
              {data.wholesaleAccounts.length ? data.wholesaleAccounts.map((account) => (
                <Link key={account.retailerId} className="dashboard-link-row" to={`/retailers/${account.retailerId}`}>
                  <div className="stat-row">
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
                </Link>
              )) : <div className="empty-state">No retailer activity has been logged yet.</div>}
            </div>
          </div>
        </div>
        <div className="split-grid">
          <div className="panel section-stack">
            <div className="panel-header">
              <h3>Inventory Danger Alerts</h3>
              <Link className="btn btn-secondary btn-small" to="/inventory">Open Inventory</Link>
            </div>
            <div className="timeline">
              {data.inventoryAlerts.length ? data.inventoryAlerts.map((item) => (
                <Link key={item.sku} className="dashboard-link-row" to="/inventory">
                  <div className={`timeline-item${item.status === "danger" ? " timeline-item-danger" : ""}`}>
                    <div className="panel-header">
                      <strong>{item.productName}</strong>
                      <StatusBadge label={item.status === "danger" ? "Danger" : item.status === "warning" ? "Low" : "Healthy"} />
                    </div>
                    <p>{item.sku}</p>
                    <span className="muted">On hand: {item.currentQuantity} | Incoming: {item.incomingQuantity}</span>
                  </div>
                </Link>
              )) : <div className="empty-state">No inventory alerts right now.</div>}
            </div>
          </div>
          <div className="panel section-stack">
            <div className="panel-header">
              <h3>SKU Reorder Windows</h3>
              <Link className="btn btn-secondary btn-small" to="/products">Open Products</Link>
            </div>
            <div className="stat-list">
              {data.skuReorderWindows.slice(0, 8).map((item) => (
                <Link key={item.sku} className="dashboard-link-row" to="/products">
                  <div className="stat-row">
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
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="section-stack">
        <div className="section-header">
          <h2>Manufacturing</h2>
          <span className="helper-text">Inbound inventory, invoice status, production timing, and manufacturer activity.</span>
        </div>
        <div className="card-grid dashboard-card-grid">
          <DashboardCard label="Incoming Inventory" value={formatNumber(data.incomingInventoryUnits)} footnote={`${data.activeSkusInRoute} active SKUs in route`} to="/production" />
          <DashboardCard label="Open Invoices / POs in Flight" value={data.openInvoiceCount} footnote="Manufacturer POs not shipped yet" to="/purchase-orders" />
          <DashboardCard label="Shipped Invoices" value={data.shippedInvoiceCount} footnote={`${data.inventoryInRouteCount} still in route`} to="/production" />
        </div>
        <div className="split-grid">
          <div className="dashboard-panel-shell">
            <MultiLineChartCard
              title="Production to Arrival Timeline"
              data={data.productionTimelineTrend}
              xKey="label"
              series={[
                { dataKey: "orderToArrivalDays", label: "Order to Arrival", stroke: "#111111" },
                { dataKey: "paidToArrivalDays", label: "Paid to Arrival", stroke: "#e72027" },
              ]}
            />
            <Link className="dashboard-panel-action" to="/production">Open Manufacturing</Link>
          </div>
          <div className="dashboard-panel-shell">
            <BarChartCard
              title="Incoming Inventory by Manufacturer"
              data={data.incomingInventoryByManufacturer}
              xKey="manufacturer"
              dataKey="units"
            />
            <Link className="dashboard-panel-action" to="/production">Open Manufacturing</Link>
          </div>
        </div>
        <div className="split-grid">
          <div className="panel section-stack">
            <div className="panel-header">
              <h3>Manufacturing Snapshot</h3>
              <Link className="btn btn-secondary btn-small" to="/production">Open Manufacturing</Link>
            </div>
            <div className="stat-list">
              {data.manufacturingSnapshotRows.length ? data.manufacturingSnapshotRows.map((row) => (
                <Link key={row.poId} className="dashboard-link-row" to={`/purchase-orders/${row.poId}`}>
                  <div className="stat-row">
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
                </Link>
              )) : <div className="empty-state">No active manufacturing invoices are in route right now.</div>}
            </div>
          </div>
          <div className="panel section-stack">
            <div className="panel-header">
              <h3>Priority Feed</h3>
              <Link className="btn btn-secondary btn-small" to="/alerts">Open Alerts</Link>
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
        </div>
      </div>
      <div className="split-grid">
        <div className="panel section-stack">
          <div className="panel-header">
            <h3>Recent Alerts</h3>
            <Link className="btn btn-secondary btn-small" to="/alerts">Open Alerts</Link>
          </div>
          <div className="timeline">
            {data.recentAlerts.map((alert) => (
              <Link key={alert.id} className="dashboard-link-row" to="/alerts">
                <div className="timeline-item">
                  <strong>{alert.message}</strong>
                  <p>{formatDate(alert.created_at)}</p>
                  <StatusBadge label={`${alert.severity} ${alert.alert_type}`} />
                </div>
              </Link>
            ))}
          </div>
        </div>
        <div className="panel section-stack">
          <div className="panel-header">
            <h3>Activity Feed</h3>
            <Link className="btn btn-secondary btn-small" to="/reports">Open Reports</Link>
          </div>
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
