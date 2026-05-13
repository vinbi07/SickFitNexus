import { useState } from "react";
import { Link } from "react-router-dom";
import { DataTable } from "@/components/DataTable";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsyncData } from "@/hooks/useAsyncData";
import { purchaseOrderService } from "@/services/purchaseOrderService";
import { vendorService } from "@/services/vendorService";
import { supportService } from "@/services/supportService";
import { formatCurrency, formatDate } from "@/utils/format";

export function PurchaseOrdersPage() {
  const [status, setStatus] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [search, setSearch] = useState("");
  const { data, loading, error, reload } = useAsyncData(
    async () => ({
      purchaseOrders: await purchaseOrderService.list({ status, vendorId, locationId, search }),
      vendors: await vendorService.list(),
      locations: await supportService.listLocations(),
    }),
    [status, vendorId, locationId, search],
  );

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load purchase orders"} />;

  return (
    <div className="section-stack">
      <PageHeader
        title="PO Tracking"
        description="Search and filter operational purchase orders by status, vendor, location, and date context."
        actions={
          <div className="btn-row">
            <button className="btn btn-secondary" onClick={() => void reload()}>
              Refresh
            </button>
          </div>
        }
      />
      <div className="panel">
        <div className="filter-row">
          <input placeholder="Search PO, vendor, notes" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            {["Draft", "Ordered", "In Transit", "Partially Received", "Received", "Delayed", "Issue Flagged", "Closed"].map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
          <select value={vendorId} onChange={(event) => setVendorId(event.target.value)}>
            <option value="">All vendors</option>
            {data.vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
          </select>
          <select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
            <option value="">All locations</option>
            {data.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
        </div>
      </div>
      <DataTable
        columns={[
          { key: "po_number", title: "PO", render: (row) => <Link to={`/purchase-orders/${row.id}`}>{row.po_number}</Link> },
          { key: "vendor", title: "Vendor", render: (row) => row.vendors?.name ?? "Unassigned" },
          { key: "location", title: "Location", render: (row) => row.locations?.name ?? "N/A" },
          { key: "status", title: "Status", render: (row) => <StatusBadge label={row.status} /> },
          { key: "order_date", title: "Order Date", render: (row) => formatDate(row.order_date) },
          { key: "expected_delivery_date", title: "ETA", render: (row) => formatDate(row.expected_delivery_date) },
          { key: "total_cost", title: "Total Cost", render: (row) => formatCurrency(row.total_cost) },
        ]}
        rows={data.purchaseOrders}
      />
    </div>
  );
}
