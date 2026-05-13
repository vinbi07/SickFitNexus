import { useState } from "react";
import { DashboardCard } from "@/components/DashboardCard";
import { DataTable } from "@/components/DataTable";
import { EntityFormModal } from "@/components/EntityFormModal";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsyncData } from "@/hooks/useAsyncData";
import { inventoryService } from "@/services/inventoryService";
import { supportService } from "@/services/supportService";
import type { InventoryEvent } from "@/types/domain";
import { calculateForecastMetric } from "@/utils/forecasting";
import { formatCurrency, formatDate, formatNumber } from "@/utils/format";

export function InventoryPage() {
  const [showAdjustment, setShowAdjustment] = useState(false);
  const { data, loading, error, reload } = useAsyncData(
    async () => ({
      products: await inventoryService.listProducts(),
      events: await inventoryService.listEvents(),
      locations: await supportService.listLocations(),
    }),
    [],
  );

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load inventory"} />;

  const lowStock = data.products.filter((product) => product.current_inventory <= product.safety_stock);
  const inventoryValue = data.products.reduce((sum, product) => sum + product.current_inventory * product.unit_cost, 0);

  return (
    <div className="section-stack">
      <PageHeader
        title="Inventory Tracking"
        description="Track current stock, movement by event, and manual adjustments that drive forecasting quality."
        actions={
          <button className="btn btn-primary" onClick={() => setShowAdjustment(true)}>
            Manual Adjustment
          </button>
        }
      />
      <div className="card-grid">
        <DashboardCard label="Products Tracked" value={data.products.length} />
        <DashboardCard label="Low Inventory" value={lowStock.length} footnote="At or below safety stock" />
        <DashboardCard label="Inventory Value" value={formatCurrency(inventoryValue)} />
        <DashboardCard label="Recent Events" value={data.events.length} footnote="Movement records in system" />
      </div>
      <div className="panel section-stack">
        <div className="panel-header"><h3>Inventory by Product</h3></div>
        <DataTable
          columns={[
            { key: "sku", title: "SKU", render: (row) => row.sku },
            { key: "name", title: "Product", render: (row) => row.name },
            { key: "current_inventory", title: "On Hand", render: (row) => row.current_inventory },
            { key: "safety_stock", title: "Safety Stock", render: (row) => row.safety_stock },
            {
              key: "forecast",
              title: "Forecast",
              render: (row) => {
                const metric = calculateForecastMetric(
                  row,
                  data.events.filter((event) => event.product_id === row.id),
                  5,
                );
                return metric.projectedDaysRemaining !== null
                  ? `${formatNumber(metric.projectedDaysRemaining, 1)} days`
                  : "Not enough usage data";
              },
            },
            {
              key: "status",
              title: "Status",
              render: (row) =>
                row.current_inventory <= row.safety_stock ? (
                  <StatusBadge label="Low Stock" />
                ) : (
                  <StatusBadge label="Healthy" />
                ),
            },
          ]}
          rows={data.products}
        />
      </div>
      <div className="panel section-stack">
        <div className="panel-header"><h3>Inventory Event Timeline</h3></div>
        <DataTable
          columns={[
            { key: "event_type", title: "Event", render: (row) => row.event_type },
            { key: "product", title: "Product", render: (row) => row.products?.name ?? "N/A" },
            { key: "location", title: "Location", render: (row) => row.locations?.name ?? "N/A" },
            { key: "quantity_change", title: "Change", render: (row) => row.quantity_change },
            { key: "event_date", title: "Date", render: (row) => formatDate(row.event_date) },
            { key: "notes", title: "Notes", render: (row) => row.notes ?? "N/A" },
          ]}
          rows={data.events}
        />
      </div>
      {showAdjustment ? (
        <EntityFormModal<Partial<InventoryEvent>>
          title="Create Inventory Adjustment"
          initialValues={{
            event_type: "Manual Adjustment",
            quantity_change: 0,
            event_date: new Date().toISOString().slice(0, 10),
            notes: "",
            product_id: data.products[0]?.id ?? "",
            location_id: data.locations[0]?.id ?? "",
          }}
          fields={[
            { key: "product_id", label: "Product ID" },
            { key: "location_id", label: "Location ID" },
            { key: "event_type", label: "Event Type" },
            { key: "quantity_change", label: "Quantity Change", type: "number" },
            { key: "event_date", label: "Event Date", type: "date" },
            { key: "notes", label: "Notes", type: "textarea" },
          ]}
          onSave={async (values) => {
            await inventoryService.createAdjustment(values);
            await reload();
          }}
          onClose={() => setShowAdjustment(false)}
        />
      ) : null}
    </div>
  );
}
