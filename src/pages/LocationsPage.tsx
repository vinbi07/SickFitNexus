import { useState } from "react";
import { DataTable } from "@/components/DataTable";
import { EntityFormModal } from "@/components/EntityFormModal";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { useAsyncData } from "@/hooks/useAsyncData";
import { supportService } from "@/services/supportService";
import type { Location } from "@/types/domain";

export function LocationsPage() {
  const [editing, setEditing] = useState<Partial<Location> | null>(null);
  const { data, loading, error, reload } = useAsyncData(() => supportService.listLocations(), []);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load locations"} />;

  return (
    <div className="section-stack">
      <PageHeader
        title="Locations"
        description="Maintain facilities and warehouse locations that support inventory and PO routing."
        actions={<button className="btn btn-primary" onClick={() => setEditing({ name: "" })}>Add Location</button>}
      />
      <DataTable
        columns={[
          { key: "name", title: "Name", render: (row) => row.name },
          { key: "type", title: "Type", render: (row) => row.type ?? "N/A" },
          { key: "address", title: "Address", render: (row) => row.address ?? "N/A" },
        ]}
        rows={data}
      />
      {editing ? (
        <EntityFormModal<Partial<Location>>
          title={editing.id ? "Edit Location" : "Add Location"}
          initialValues={{
            name: editing.name ?? "",
            type: editing.type ?? "",
            address: editing.address ?? "",
          }}
          fields={[
            { key: "name", label: "Name" },
            { key: "type", label: "Type" },
            { key: "address", label: "Address", type: "textarea" },
          ]}
          onSave={async (values) => {
            await supportService.saveLocation({ ...editing, ...values });
            await reload();
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
