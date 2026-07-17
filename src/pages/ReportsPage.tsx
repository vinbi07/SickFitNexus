import { useState } from "react";
import { BarChartCard } from "@/components/BarChartCard";
import { DashboardCard } from "@/components/DashboardCard";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { useAsyncData } from "@/hooks/useAsyncData";
import { reportService } from "@/services/reportService";
import { downloadCsv } from "@/utils/export";
import { formatCurrency } from "@/utils/format";
import { isGiftCardProductName, isIgnoredProduct } from "@/utils/operations";

export function ReportsPage() {
  const [reportType, setReportType] = useState("po-summary");
  const { data, loading, error } = useAsyncData(() => reportService.getExecutiveDataset(), []);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load reports"} />;

  const delayedOrders = data.purchaseOrders.filter((po) => po.status === "Delayed");
  const projectedStockouts = data.alerts.filter((alert) => alert.alert_type === "Projected Stockout");
  const inventoryRisk = data.products.filter(
    (product) =>
      !isGiftCardProductName(product.name) &&
      !isIgnoredProduct(product) &&
      product.current_inventory <= product.safety_stock,
  );

  const exportRows =
    reportType === "vendor-performance"
      ? data.purchaseOrders.map((po) => ({
          po_number: po.po_number,
          vendor: po.vendors?.name ?? "Unassigned",
          total_cost: po.total_cost,
          status: po.status,
        }))
      : data.purchaseOrders.map((po) => ({
          po_number: po.po_number,
          status: po.status,
          total_cost: po.total_cost,
          order_date: po.order_date,
        }));

  return (
    <div className="section-stack">
      <PageHeader
        title="Executive Reporting"
        description="Summarize PO health, vendor performance, inventory risk, delayed orders, and projected stockouts."
        actions={
          <div className="btn-row">
            <select value={reportType} onChange={(event) => setReportType(event.target.value)}>
              <option value="po-summary">PO Summary</option>
              <option value="vendor-performance">Vendor Performance</option>
              <option value="inventory-risk">Inventory Risk</option>
              <option value="delayed-orders">Delayed Orders</option>
              <option value="projected-stockouts">Projected Stockouts</option>
            </select>
            <button className="btn btn-primary" onClick={() => downloadCsv(`${reportType}.csv`, exportRows)}>
              Export CSV
            </button>
            <button className="btn btn-secondary" onClick={() => window.print()}>
              Print View
            </button>
          </div>
        }
      />
      <div className="card-grid">
        <DashboardCard label="Total PO Spend" value={formatCurrency(data.purchaseOrders.reduce((sum, po) => sum + po.total_cost, 0))} />
        <DashboardCard label="Delayed Orders" value={delayedOrders.length} />
        <DashboardCard label="Projected Stockouts" value={projectedStockouts.length} />
        <DashboardCard label="Inventory Risk Items" value={inventoryRisk.length} />
      </div>
      <BarChartCard
        title="Open PO Spend"
        data={data.purchaseOrders.slice(0, 8).map((po) => ({ po: po.po_number, spend: po.total_cost }))}
        xKey="po"
        dataKey="spend"
      />
    </div>
  );
}
