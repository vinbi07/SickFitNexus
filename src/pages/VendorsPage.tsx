import { useState } from "react";
import { DataTable } from "@/components/DataTable";
import { EntityFormModal } from "@/components/EntityFormModal";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsyncData } from "@/hooks/useAsyncData";
import { vendorService } from "@/services/vendorService";
import type { Vendor } from "@/types/domain";
import { formatCurrency, formatNumber } from "@/utils/format";

export function VendorsPage() {
  const [editing, setEditing] = useState<Partial<Vendor> | null>(null);
  const { data, loading, error, reload } = useAsyncData(() => vendorService.getScorecards(), []);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load vendors"} />;

  return (
    <div className="section-stack">
      <PageHeader
        title="Vendor Scorecards"
        description="Track reliability, spend concentration, fill rate, and delay trends by supplier."
        actions={<button className="btn btn-primary" onClick={() => setEditing({ name: "" })}>Add Vendor</button>}
      />
      <DataTable
        columns={[
          { key: "name", title: "Vendor", render: (row) => row.name },
          { key: "totalPos", title: "POs", render: (row) => row.totalPos },
          { key: "totalSpend", title: "Spend", render: (row) => formatCurrency(row.totalSpend) },
          { key: "averageDeliveryDelay", title: "Avg Delay", render: (row) => `${formatNumber(row.averageDeliveryDelay, 1)} days` },
          { key: "fillRate", title: "Fill Rate", render: (row) => `${formatNumber(row.fillRate, 1)}%` },
          { key: "latePoPercentage", title: "Late PO %", render: (row) => `${formatNumber(row.latePoPercentage, 1)}%` },
          { key: "concentrationRisk", title: "Spend Share", render: (row) => `${formatNumber(row.concentrationRisk, 1)}%` },
          {
            key: "reliabilityScore",
            title: "Reliability",
            render: (row) => (
              <StatusBadge
                label={`${Math.round(row.reliabilityScore)} ${row.reliabilityScore < 65 ? "High Risk" : "Stable"}`}
              />
            ),
          },
        ]}
        rows={data}
      />
      {editing ? (
        <EntityFormModal<Partial<Vendor>>
          title={editing.id ? "Edit Vendor" : "Add Vendor"}
          initialValues={{
            name: editing.name ?? "",
            contact_email: editing.contact_email ?? "",
            contact_phone: editing.contact_phone ?? "",
            notes: editing.notes ?? "",
          }}
          fields={[
            { key: "name", label: "Name" },
            { key: "contact_email", label: "Email" },
            { key: "contact_phone", label: "Phone" },
            { key: "notes", label: "Notes", type: "textarea" },
          ]}
          onSave={async (values) => {
            await vendorService.upsert({ ...editing, ...values });
            await reload();
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
