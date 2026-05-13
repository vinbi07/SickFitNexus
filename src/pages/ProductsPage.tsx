import { useState } from "react";
import { DataTable } from "@/components/DataTable";
import { EntityFormModal } from "@/components/EntityFormModal";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { useAsyncData } from "@/hooks/useAsyncData";
import { supportService } from "@/services/supportService";
import type { Product } from "@/types/domain";
import { formatCurrency } from "@/utils/format";

export function ProductsPage() {
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const { data, loading, error, reload } = useAsyncData(() => supportService.listProducts(), []);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load products"} />;

  return (
    <div className="section-stack">
      <PageHeader
        title="Products"
        description="Maintain SKUs, unit cost, current inventory, and safety stock assumptions used by forecasting."
        actions={<button className="btn btn-primary" onClick={() => setEditing({ sku: "", name: "" })}>Add Product</button>}
      />
      <DataTable
        columns={[
          { key: "sku", title: "SKU", render: (row) => row.sku },
          { key: "name", title: "Name", render: (row) => row.name },
          { key: "category", title: "Category", render: (row) => row.category ?? "N/A" },
          { key: "unit_cost", title: "Unit Cost", render: (row) => formatCurrency(row.unit_cost) },
          { key: "current_inventory", title: "Inventory", render: (row) => row.current_inventory },
          { key: "safety_stock", title: "Safety Stock", render: (row) => row.safety_stock },
        ]}
        rows={data}
      />
      {editing ? (
        <EntityFormModal<Partial<Product>>
          title={editing.id ? "Edit Product" : "Add Product"}
          initialValues={{
            sku: editing.sku ?? "",
            name: editing.name ?? "",
            category: editing.category ?? "",
            unit_cost: editing.unit_cost ?? 0,
            current_inventory: editing.current_inventory ?? 0,
            safety_stock: editing.safety_stock ?? 0,
          }}
          fields={[
            { key: "sku", label: "SKU" },
            { key: "name", label: "Name" },
            { key: "category", label: "Category" },
            { key: "unit_cost", label: "Unit Cost", type: "number" },
            { key: "current_inventory", label: "Current Inventory", type: "number" },
            { key: "safety_stock", label: "Safety Stock", type: "number" },
          ]}
          onSave={async (values) => {
            await supportService.saveProduct({ ...editing, ...values });
            await reload();
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
