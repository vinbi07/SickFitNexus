import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DashboardCard } from "@/components/DashboardCard";
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
  const [priorityDrawerOpen, setPriorityDrawerOpen] = useState(false);
  const [highlightedSectionId, setHighlightedSectionId] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);
  const { data, loading, error, reload } = useAsyncData(() => dashboardService.getSnapshot(), []);

  useEffect(() => () => {
    if (highlightTimeoutRef.current) {
      window.clearTimeout(highlightTimeoutRef.current);
    }
  }, []);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load dashboard"} />;

  const channelRevenueRows = data.revenueByChannelYtd.filter((item) => item.channel !== "DTC + Shopify");
  const activeChannelRows = channelRevenueRows.filter((item) => item.value > 0);
  const inactiveChannelRows = channelRevenueRows.filter((item) => item.value <= 0);
  const topChannelValue = activeChannelRows[0]?.value ?? 0;
  const totalChannelRevenue = activeChannelRows.reduce((sum, item) => sum + item.value, 0);
  const urgentPriorityItems = data.priorityFeed.filter((item) => item.severity === "danger" || item.severity === "warning");
  const priorityItems = (urgentPriorityItems.length ? urgentPriorityItems : data.priorityFeed).slice(0, 4);
  const criticalAlerts = data.recentAlerts
    .filter((alert) => ["Critical", "High"].includes(alert.severity))
    .slice(0, 3);
  const highlightSection = (sectionId: string) => {
    setHighlightedSectionId(sectionId);

    if (highlightTimeoutRef.current) {
      window.clearTimeout(highlightTimeoutRef.current);
    }

    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedSectionId((currentSectionId) => currentSectionId === sectionId ? null : currentSectionId);
    }, 1400);
  };
  const dashboardSectionClass = (sectionId: string, className: string) => (
    highlightedSectionId === sectionId ? `${className} dashboard-section-highlight` : className
  );

  return (
    <div className="dashboard-command dashboard-calm">
      <PageHeader
        title="Operations Dashboard"
        description="A calmer command overview: what is healthy, what is moving, and what needs action."
      />
      {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}

      <nav className="dashboard-jump-nav" aria-label="Dashboard sections">
        <a href="#dashboard-summary" onClick={() => highlightSection("dashboard-summary")}>Summary</a>
        <a href="#dashboard-accounts" onClick={() => highlightSection("dashboard-accounts")}>Revenue & Accounts</a>
        <a href="#dashboard-health" onClick={() => highlightSection("dashboard-health")}>Wholesale Health</a>
        <a href="#dashboard-manufacturing" onClick={() => highlightSection("dashboard-manufacturing")}>Manufacturing</a>
        <a href="#dashboard-inventory" onClick={() => highlightSection("dashboard-inventory")}>Inventory Risk</a>
        <button type="button" onClick={() => setPriorityDrawerOpen(true)}>Needs Attention</button>
      </nav>

      <section id="dashboard-summary" className={dashboardSectionClass("dashboard-summary", "dashboard-section")}>
        <div className="dashboard-section-header">
          <div>
            <p className="section-eyebrow">Command Summary</p>
            <h2>Business state in one pass</h2>
          </div>
          <div className="btn-row">
            <Link className="btn btn-secondary btn-small" to="/alerts">Open Alerts</Link>
            <Link className="btn btn-primary btn-small" to="/purchase-orders/new">New PO</Link>
          </div>
        </div>
        <div className="command-kpi-strip dashboard-kpi-strip">
          <DashboardCard label="Wholesale Revenue" value={formatCurrency(data.wholesaleRevenueTotal)} footnote={`${data.revenuePaceDeltaPercent >= 0 ? "+" : ""}${data.revenuePaceDeltaPercent}% vs prior pace`} highlight to="/reports" />
          <DashboardCard label="Danger SKUs" value={data.dangerSkuCount} footnote={`${data.skuOosRiskCriticalCount} critical OOS risks`} to="/inventory" />
          <DashboardCard label="Awaiting Action" value={data.awaitingActionCount} footnote="Stops and follow-ups" to="/alerts" />
          <DashboardCard label="Incoming Inventory" value={formatNumber(data.incomingInventoryUnits)} footnote={`${data.activeSkusInRoute} active SKUs in route`} to="/production" />
          <DashboardCard label="Open Invoices" value={data.openInvoiceCount} footnote="POs in flight" to="/purchase-orders" />
          <DashboardCard label="Shipped Invoices" value={data.shippedInvoiceCount} footnote={`${data.inventoryInRouteCount} still in route`} to="/production" />
        </div>
      </section>

      <div className="dashboard-focus-grid">
        <main className="dashboard-main-column">
          <section id="dashboard-accounts" className={dashboardSectionClass("dashboard-accounts", "dashboard-section panel section-stack")}>
            <div className="dashboard-section-header">
              <div>
                <p className="section-eyebrow">Revenue & Accounts</p>
                <h2>Channel and retailer signals</h2>
              </div>
              <div className="btn-row">
                <Link className="btn btn-secondary btn-small" to="/retailers">Open Accounts</Link>
                <Link className="btn btn-secondary btn-small" to="/products">Open Products</Link>
              </div>
            </div>
            <div className="dashboard-summary-grid">
              <div className="section-stack">
                <div className="panel-header">
                  <h3>Channel Lanes</h3>
                  <span className="helper-text">Top wholesale channels</span>
                </div>
                <div className="channel-lane-board">
                  {activeChannelRows.length ? activeChannelRows.map((item, index) => {
                    const widthPercent = topChannelValue > 0 ? Math.max((item.value / topChannelValue) * 100, 8) : 0;
                    const sharePercent = totalChannelRevenue > 0 ? Math.round((item.value / totalChannelRevenue) * 100) : 0;

                    return (
                      <div key={item.channel} className="channel-lane-row">
                        <div className="channel-lane-meta">
                          <span className="channel-lane-rank">{String(index + 1).padStart(2, "0")}</span>
                          <div className="cell-stack">
                            <strong>{item.channel}</strong>
                            <span className="muted">{sharePercent}% of channel revenue</span>
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
                {inactiveChannelRows.length ? (
                  <details className="channel-zero-foldout">
                    <summary>
                      <span>Accounts without YTD sales</span>
                      <strong>{inactiveChannelRows.length} hidden</strong>
                    </summary>
                    <div className="compact-data-list">
                      {inactiveChannelRows.map((item) => (
                        <div key={item.channel} className="compact-data-row">
                          <div className="cell-stack">
                            <strong>{item.channel}</strong>
                            <span className="muted">No YTD revenue attached</span>
                          </div>
                          <strong>{formatCurrency(item.value)}</strong>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>

              <div className="section-stack">
                <div className="panel-header">
                  <h3>Account Velocity</h3>
                  <span className="helper-text">Top active accounts</span>
                </div>
                <div className="compact-data-list">
                  {data.wholesaleAccounts.length ? data.wholesaleAccounts.slice(0, 3).map((account) => (
                    <Link key={account.retailerId} className="compact-data-row dashboard-row-airy" to={`/retailers/${account.retailerId}`}>
                      <div className="cell-stack">
                        <strong>{account.retailer}</strong>
                        <span className="muted">{account.recentPoCount} recent POs | {account.nextWindow}</span>
                      </div>
                      <div className="cell-stack">
                        <span>{account.openInvoices} open</span>
                        <span>{account.shippedInvoices} shipped</span>
                      </div>
                    </Link>
                  )) : <div className="empty-state">No retailer activity has been logged yet.</div>}
                </div>
              </div>
            </div>
          </section>

          <section id="dashboard-health" className={dashboardSectionClass("dashboard-health", "dashboard-section dashboard-primary-panel")}>
            <div className="dashboard-section-header">
              <div>
                <p className="section-eyebrow">Revenue & Wholesale Health</p>
                <h2>Revenue pace and active operating context</h2>
              </div>
              <Link className="btn btn-secondary btn-small" to="/reports">Open Reports</Link>
            </div>
            <div className="dashboard-primary-grid">
              <div className="dashboard-chart-shell">
                <MultiLineChartCard
                  title="Revenue Projection"
                  data={data.revenueProjectionTrend}
                  xKey="label"
                  series={[
                    { dataKey: "actualRevenue", label: "Actual YTD", stroke: "#0f172a" },
                    { dataKey: "projectedRevenue", label: "Projected Pace", stroke: "#475467" },
                    { dataKey: "priorBaselineRevenue", label: "Prior YTD Pace", stroke: "#94a3b8", strokeDasharray: "6 4" },
                  ]}
                />
              </div>
              <div className="dashboard-summary-stack">
                <div className="detail-card"><span>Current YTD</span><strong>{formatCurrency(data.revenueYtd)}</strong></div>
                <div className="detail-card"><span>Prior YTD</span><strong>{formatCurrency(data.priorRevenueYtd)}</strong></div>
                <div className="detail-card"><span>Projected Year End</span><strong>{formatCurrency(data.projectedRevenueYearEnd)}</strong></div>
                <div className="detail-card">
                  <span>Pace Signal</span>
                  <strong className={data.revenuePaceDeltaPercent >= 0 ? "success-text" : "danger-text"}>
                    {data.revenuePaceDeltaPercent >= 0 ? "+" : ""}{data.revenuePaceDeltaPercent}% vs prior pace
                  </strong>
                </div>
              </div>
            </div>
          </section>

          <div className="dashboard-secondary-grid">
            <section id="dashboard-manufacturing" className={dashboardSectionClass("dashboard-manufacturing", "dashboard-section panel section-stack")}>
              <div className="dashboard-section-header">
                <div>
                  <p className="section-eyebrow">Manufacturing Pulse</p>
                  <h2>Inbound production needing visibility</h2>
                </div>
                <Link className="btn btn-secondary btn-small" to="/production">Open Manufacturing</Link>
              </div>
              <div className="density-table">
                {data.manufacturingSnapshotRows.length ? data.manufacturingSnapshotRows.slice(0, 3).map((row) => (
                  <Link key={row.poId} className="density-row dashboard-row-airy" to={`/purchase-orders/${row.poId}`}>
                    <div className="cell-stack">
                      <strong>{row.poNumber} | {row.manufacturer}</strong>
                      <span className="muted">{row.reorderWindowSummary}</span>
                    </div>
                    <span className="density-value">{formatNumber(row.incomingUnits)} units</span>
                    <span>{formatDate(row.etaDate)}</span>
                    <StatusBadge label={row.invoiceStatus || row.shipmentStatus} />
                  </Link>
                )) : <div className="empty-state">No active manufacturing invoices are in route right now.</div>}
              </div>
            </section>

            <section id="dashboard-inventory" className={dashboardSectionClass("dashboard-inventory", "dashboard-section panel section-stack")}>
              <div className="dashboard-section-header">
                <div>
                  <p className="section-eyebrow">Inventory Risk</p>
                  <h2>Top stops and reorder pressure</h2>
                </div>
                <Link className="btn btn-secondary btn-small" to="/inventory">Open Inventory</Link>
              </div>
              <div className="compact-data-list">
                {data.inventoryAlerts.length ? data.inventoryAlerts.slice(0, 3).map((item) => (
                  <Link key={item.sku} className={`compact-data-row dashboard-row-airy${item.status === "danger" ? " compact-data-row-danger" : ""}`} to="/inventory">
                    <div className="cell-stack">
                      <strong>{item.productName}</strong>
                      <span className="muted">{item.sku} | On hand {item.currentQuantity} | Incoming {item.incomingQuantity}</span>
                    </div>
                    <StatusBadge label={item.status === "danger" ? "Critical" : item.status === "warning" ? "Low" : "Healthy"} />
                  </Link>
                )) : <div className="empty-state">No inventory alerts right now.</div>}
              </div>
            </section>
          </div>

          <details className="dashboard-more panel">
            <summary>
              <span>Secondary insights</span>
              <strong>Top SKUs, reorder windows, Shopify sync, and recent activity</strong>
            </summary>
            <div className="dashboard-more-grid">
              <section className="section-stack">
                <div className="panel-header">
                  <h3>Top SKUs YTD</h3>
                  <Link className="btn btn-secondary btn-small" to="/products">Products</Link>
                </div>
                <div className="compact-data-list">
                  {data.topSkusYtd.slice(0, 5).map((item) => (
                    <Link key={item.sku || item.label} className="compact-data-row" to="/products">
                      <div className="cell-stack">
                        <strong>{item.label}</strong>
                        <span className="muted">{item.sku || "SKU unavailable"}</span>
                      </div>
                      <div className="cell-stack">
                        <strong>{formatCurrency(item.value)}</strong>
                        <span>{formatNumber(item.units)} units</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>

              <section className="section-stack">
                <div className="panel-header">
                  <h3>SKU Reorder Windows</h3>
                  <Link className="btn btn-secondary btn-small" to="/products">Products</Link>
                </div>
                <div className="compact-data-list">
                  {data.skuReorderWindows.slice(0, 5).map((item) => (
                    <Link key={item.sku} className="compact-data-row" to="/products">
                      <div className="cell-stack">
                        <strong>{item.productName}</strong>
                        <span className="muted">{item.sku}</span>
                      </div>
                      <div className="cell-stack">
                        <strong>{item.recommendation}</strong>
                        <span>{item.reorderByDate ? formatDate(item.reorderByDate) : "Manual review"}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>

              <section className="section-stack">
                <div className="panel-header">
                  <h3>DTC + Shopify</h3>
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    disabled={syncingShopifyDashboard}
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
                    {syncingShopifyDashboard ? "Syncing..." : "Sync"}
                  </button>
                </div>
                <div className="detail-card">
                  <span>Trailing 12 Months</span>
                  <strong>{formatCurrency(data.dtcShopifyRevenueTrailingYear)}</strong>
                </div>
              </section>

              <section className="section-stack">
                <div className="panel-header">
                  <h3>Recent Activity</h3>
                  <Link className="btn btn-secondary btn-small" to="/reports">Reports</Link>
                </div>
                <div className="timeline">
                  {data.recentActivity.slice(0, 4).map((item) => (
                    <div key={item.id} className="timeline-item">
                      <strong>{item.title}</strong>
                      <p>{item.description}</p>
                      <span className="muted">{formatDate(item.created_at)}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </details>
        </main>

        {priorityDrawerOpen ? (
          <>
            <button
              type="button"
              className="priority-drawer-backdrop"
              aria-label="Close priority drawer"
              onClick={() => setPriorityDrawerOpen(false)}
            />

            <aside className="inspector-panel dashboard-priority-rail priority-drawer priority-drawer-open">
              <section id="dashboard-actions" className="panel section-stack">
                <div className="dashboard-section-header">
                  <div>
                    <p className="section-eyebrow">Needs Attention</p>
                    <h2>Action rail</h2>
                  </div>
                  <div className="btn-row">
                    <Link className="btn btn-secondary btn-small" to="/alerts">View all</Link>
                    <button type="button" className="btn btn-ghost btn-small" onClick={() => setPriorityDrawerOpen(false)}>Close</button>
                  </div>
                </div>
                <div className="timeline">
                  {priorityItems.map((item) => (
                    <div key={item.id} className={`timeline-item${item.severity === "danger" ? " timeline-item-danger" : ""}`}>
                      <div className="panel-header">
                        <strong>{item.title}</strong>
                        <StatusBadge label={item.severity} />
                      </div>
                      <p>{item.detail}</p>
                      {item.actionLabel ? <span className="helper-text">{item.actionLabel}</span> : null}
                    </div>
                  ))}
                </div>
              </section>

              <section className="panel section-stack">
                <div className="panel-header">
                  <h3>Critical Alerts</h3>
                  <Link className="btn btn-secondary btn-small" to="/alerts">Open</Link>
                </div>
                <div className="timeline">
                  {(criticalAlerts.length ? criticalAlerts : data.recentAlerts.slice(0, 3)).map((alert) => (
                    <Link key={alert.id} className="dashboard-link-row" to="/alerts">
                      <div className="timeline-item">
                        <strong>{alert.message}</strong>
                        <p>{formatDate(alert.created_at)}</p>
                        <StatusBadge label={`${alert.severity} ${alert.alert_type}`} />
                      </div>
                    </Link>
                  ))}
                </div>
              </section>

              <section className="panel section-stack">
                <div className="panel-header">
                  <h3>Awaiting Action</h3>
                  <Link className="btn btn-secondary btn-small" to="/purchase-orders">Open POs</Link>
                </div>
                <div className="detail-grid">
                  <div className="detail-card"><span>Awaiting</span><strong>{data.awaitingActionCount}</strong></div>
                  <div className="detail-card"><span>PO Submit</span><strong>{data.awaitingPoSubmissionCount}</strong></div>
                  <div className="detail-card"><span>Open Invoices</span><strong>{data.openInvoiceCount}</strong></div>
                  <div className="detail-card"><span>Danger SKUs</span><strong className="danger-text">{data.dangerSkuCount}</strong></div>
                </div>
              </section>
            </aside>
          </>
        ) : null}
      </div>
    </div>
  );
}
