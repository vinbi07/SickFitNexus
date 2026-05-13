import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable } from "@/components/DataTable";
import { EntityFormModal } from "@/components/EntityFormModal";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Modal } from "@/components/Modal";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader } from "@/components/PageHeader";
import { useAsyncData } from "@/hooks/useAsyncData";
import { inventoryService } from "@/services/inventoryService";
import { purchaseOrderService } from "@/services/purchaseOrderService";
import { supportService } from "@/services/supportService";
import type { Location } from "@/types/domain";

export function LocationsPage() {
  const [editing, setEditing] = useState<Partial<Location> | null>(null);
  const [viewing, setViewing] = useState<Location | null>(null);
  const [deleting, setDeleting] = useState<Location | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const { data, loading, error, reload } = useAsyncData(
    async () => ({
      locations: await supportService.listLocations(),
      inventoryItems: await inventoryService.listItems(),
      purchaseOrders: await purchaseOrderService.list(),
    }),
    [],
  );

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load locations"} />;

  const locationTypes = [...new Set(data.locations.map((location) => location.type).filter(Boolean))] as string[];
  const filteredLocations = data.locations.filter((location) => {
    const query = search.trim().toLowerCase();
    const matchesSearch =
      !query ||
      location.name.toLowerCase().includes(query) ||
      (location.address ?? "").toLowerCase().includes(query);
    const matchesType = !type || location.type === type;
    return matchesSearch && matchesType;
  });

  return (
    <div className="section-stack">
      <PageHeader
        title="Locations"
        description="Manage warehouses and stores, and connect them to inventory records and purchase orders."
        actions={<button className="btn btn-primary" onClick={() => setEditing({ name: "" })}>Add New Location</button>}
      />
      {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}
      <div className="panel">
        <div className="filter-row">
          <input placeholder="Search name or address" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select value={type} onChange={(event) => setType(event.target.value)}>
            <option value="">All location types</option>
            {locationTypes.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <button className="btn btn-secondary" onClick={() => void reload()}>
            Refresh
          </button>
        </div>
      </div>
      <DataTable
        emptyMessage="No locations yet. Add a warehouse or store to assign inventory and purchase orders."
        columns={[
          { key: "name", title: "Name", render: (row) => <span className="table-link">{row.name}</span> },
          { key: "type", title: "Type", render: (row) => row.type ?? "N/A" },
          { key: "address", title: "Address", render: (row) => row.address ?? "N/A" },
          {
            key: "inventory_count",
            title: "Inventory Records",
            render: (row) => data.inventoryItems.filter((item) => item.location_id === row.id).length,
          },
          {
            key: "po_count",
            title: "POs",
            render: (row) => data.purchaseOrders.filter((po) => po.location_id === row.id).length,
          },
          {
            key: "actions",
            title: "Actions",
            render: (row) => (
              <div className="btn-row">
                <button className="btn btn-ghost btn-small" onClick={() => setViewing(row)}>
                  View Details
                </button>
                <button className="btn btn-secondary btn-small" onClick={() => setEditing(row)}>
                  Edit
                </button>
                <button className="btn btn-danger btn-small" onClick={() => setDeleting(row)}>
                  Delete
                </button>
              </div>
            ),
          },
        ]}
        rows={filteredLocations}
      />
      {editing ? (
        <EntityFormModal<Partial<Location>>
          title={editing.id ? "Edit Location" : "Add Location"}
          saveLabel={editing.id ? "Save Changes" : "Create Location"}
          initialValues={{
            name: editing.name ?? "",
            type: editing.type ?? "",
            address: editing.address ?? "",
          }}
          fields={[
            { key: "name", label: "Name", required: true },
            { key: "type", label: "Type" },
            { key: "address", label: "Address", type: "textarea" },
          ]}
          onSave={async (values) => {
            if (!String(values.name ?? "").trim()) throw new Error("Location name is required.");
            await supportService.saveLocation({
              ...editing,
              ...values,
              type: values.type ? String(values.type) : null,
              address: values.address ? String(values.address) : null,
            });
            await reload();
            setNotice({
              tone: "success",
              message: editing.id ? "Location updated successfully." : "Location created successfully.",
            });
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {viewing ? (
        <Modal
          title={viewing.name}
          onClose={() => setViewing(null)}
          actions={<button className="btn btn-ghost" onClick={() => setViewing(null)}>Cancel</button>}
        >
          <div className="detail-grid">
            <div className="detail-card"><span>Type</span><strong>{viewing.type ?? "N/A"}</strong></div>
            <div className="detail-card"><span>Inventory Records</span><strong>{data.inventoryItems.filter((item) => item.location_id === viewing.id).length}</strong></div>
            <div className="detail-card"><span>Purchase Orders</span><strong>{data.purchaseOrders.filter((po) => po.location_id === viewing.id).length}</strong></div>
            <div className="detail-card"><span>Updated</span><strong>{new Date(viewing.updated_at).toLocaleString()}</strong></div>
            <div className="detail-card" style={{ gridColumn: "1 / -1" }}><span>Address</span><strong>{viewing.address ?? "No address added."}</strong></div>
          </div>
        </Modal>
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title="Delete location?"
          message={`This removes ${deleting.name}. Any related records depending on this location may block deletion until they are reassigned.`}
          busy={busyDelete}
          onClose={() => {
            if (!busyDelete) setDeleting(null);
          }}
          onConfirm={async () => {
            try {
              setBusyDelete(true);
              await supportService.deleteLocation(deleting.id);
              setDeleting(null);
              await reload();
              setNotice({ tone: "success", message: "Location deleted successfully." });
            } catch (err) {
              setNotice({ tone: "error", message: err instanceof Error ? err.message : "Failed to delete location." });
            } finally {
              setBusyDelete(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}
