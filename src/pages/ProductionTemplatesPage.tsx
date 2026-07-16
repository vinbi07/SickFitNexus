import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable } from "@/components/DataTable";
import { EntityFormModal } from "@/components/EntityFormModal";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Modal } from "@/components/Modal";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsyncData } from "@/hooks/useAsyncData";
import { productionPlanService } from "@/services/productionPlanService";
import { productionTemplateService } from "@/services/productionTemplateService";
import { supportService } from "@/services/supportService";
import { vendorService } from "@/services/vendorService";
import type { ProductionPlanTemplate, ProductionPlanTemplateItem } from "@/types/domain";

type DraftTemplateItem = Partial<ProductionPlanTemplateItem> & { product_id: string };

export function ProductionTemplatesPage() {
  const navigate = useNavigate();
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [editing, setEditing] = useState<Partial<ProductionPlanTemplate> | null>(null);
  const [deleting, setDeleting] = useState<ProductionPlanTemplate | null>(null);
  const [editingItemsFor, setEditingItemsFor] = useState<ProductionPlanTemplate | null>(null);
  const [draftItems, setDraftItems] = useState<DraftTemplateItem[]>([]);
  const [addingProductId, setAddingProductId] = useState("");
  const [savingItems, setSavingItems] = useState(false);

  const { data, loading, error, reload } = useAsyncData(
    async () => ({
      templates: await productionTemplateService.list(),
      vendors: await vendorService.list(),
      products: await supportService.listProducts(),
    }),
    [],
  );

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load production templates"} />;

  const handleOpenItemEditor = async (template: ProductionPlanTemplate) => {
    const full = await productionTemplateService.getById(template.id);
    setEditingItemsFor(full);
    setDraftItems(full.items ?? []);
  };

  const handleAddTemplateProduct = () => {
    if (!addingProductId) return;
    if (draftItems.some((item) => item.product_id === addingProductId)) return;
    const product = data.products.find((entry) => entry.id === addingProductId);
    setDraftItems((current) => [
      ...current,
      {
        product_id: addingProductId,
        mix_mode: "fixed",
        fixed_quantity: 0,
        percent_of_mix: null,
        min_quantity: null,
        max_quantity: null,
        moq: null,
        order_increment: null,
        unit_cost: product?.unit_cost ?? null,
        pack_pairs: 1,
        sort_order: current.length,
        products: product ?? null,
      } as DraftTemplateItem,
    ]);
    setAddingProductId("");
  };

  const handleSaveItems = async () => {
    if (!editingItemsFor) return;
    try {
      setSavingItems(true);
      await productionTemplateService.upsert(editingItemsFor, draftItems);
      setEditingItemsFor(null);
      await reload();
      setNotice({ tone: "success", message: "Template product mix saved." });
    } catch (err) {
      setNotice({ tone: "error", message: err instanceof Error ? err.message : "Unable to save product mix." });
    } finally {
      setSavingItems(false);
    }
  };

  const handleStartPlan = async (template: ProductionPlanTemplate) => {
    try {
      const full = await productionTemplateService.getById(template.id);
      const draft = productionTemplateService.applyTemplateToNewPlan(full);
      const created = await productionPlanService.upsert(draft.plan, draft.items);
      navigate(`/production/planner/${created.id}`);
    } catch (err) {
      setNotice({ tone: "error", message: err instanceof Error ? err.message : "Unable to start plan from template." });
    }
  };

  return (
    <div className="section-stack">
      <PageHeader
        title="Production Templates"
        description="Reusable production recipes: default manufacturer, horizon, coverage target, cost assumptions, and product mix. Applying a template creates fully editable plan values — it does not lock the plan to the template."
        actions={
          <div className="btn-row">
            <button className="btn btn-ghost" onClick={() => navigate("/production/planner")}>
              Back to Plans
            </button>
            <button
              className="btn btn-primary"
              onClick={() =>
                setEditing({
                  name: "",
                  description: "",
                  is_active: true,
                  default_horizon_days: 60,
                  default_lead_time_buffer_days: 7,
                  default_coverage_target_days: 30,
                })
              }
            >
              New Template
            </button>
          </div>
        }
      />
      {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}
      <div className="panel section-stack">
        <div className="panel-header"><h3>Templates</h3></div>
        <DataTable
          emptyMessage="No production templates yet."
          columns={[
            {
              key: "name",
              title: "Template",
              render: (row) => (
                <div className="cell-stack">
                  <strong>{row.name}</strong>
                  <span className="helper-text">{row.description ?? "No description"}</span>
                </div>
              ),
            },
            { key: "status", title: "Status", render: (row) => <StatusBadge label={row.is_active ? "Active" : "Inactive"} /> },
            { key: "vendor", title: "Default Manufacturer", render: (row) => row.vendors?.name ?? "Unassigned" },
            { key: "horizon", title: "Default Horizon", render: (row) => `${row.default_horizon_days} days` },
            { key: "coverage", title: "Coverage Target", render: (row) => `${row.default_coverage_target_days} days` },
            { key: "items", title: "SKUs", render: (row) => (row.items ?? []).length },
            {
              key: "actions",
              title: "Actions",
              render: (row) => (
                <div className="btn-row">
                  <button className="btn btn-primary btn-small" onClick={() => void handleStartPlan(row)}>
                    Start Plan
                  </button>
                  <button className="btn btn-secondary btn-small" onClick={() => setEditing(row)}>
                    Edit
                  </button>
                  <button className="btn btn-secondary btn-small" onClick={() => void handleOpenItemEditor(row)}>
                    Product Mix
                  </button>
                  <button className="btn btn-danger btn-small" onClick={() => setDeleting(row)}>
                    Delete
                  </button>
                </div>
              ),
            },
          ]}
          rows={data.templates}
        />
      </div>
      {editing ? (
        <EntityFormModal<Partial<ProductionPlanTemplate>>
          title={editing.id ? "Edit Template" : "New Template"}
          saveLabel="Save Template"
          initialValues={{
            name: editing.name ?? "",
            description: editing.description ?? "",
            is_active: editing.is_active ?? true,
            default_vendor_id: editing.default_vendor_id ?? "",
            default_horizon_days: editing.default_horizon_days ?? 60,
            default_lead_time_buffer_days: editing.default_lead_time_buffer_days ?? 7,
            default_coverage_target_days: editing.default_coverage_target_days ?? 30,
            arrival_logic: editing.arrival_logic ?? "",
            notes: editing.notes ?? "",
          }}
          fields={[
            { key: "name", label: "Template Name", required: true },
            { key: "description", label: "Description", type: "textarea" },
            {
              key: "default_vendor_id",
              label: "Default Manufacturer",
              type: "select",
              options: data.vendors.map((vendor) => ({ label: vendor.name, value: vendor.id })),
            },
            { key: "default_horizon_days", label: "Default Horizon (days)", type: "number", min: 1, step: 1 },
            { key: "default_lead_time_buffer_days", label: "Lead-Time Buffer (days)", type: "number", min: 0, step: 1 },
            { key: "default_coverage_target_days", label: "Default Coverage Target (days)", type: "number", min: 1, step: 1 },
            { key: "arrival_logic", label: "Arrival Logic Notes" },
            { key: "notes", label: "Notes", type: "textarea" },
            { key: "is_active", label: "Active", type: "checkbox" },
          ]}
          onSave={async (values) => {
            await productionTemplateService.upsert(
              {
                id: editing.id,
                ...values,
                default_vendor_id: values.default_vendor_id || null,
              },
              editing.items ?? [],
            );
            await reload();
            setNotice({ tone: "success", message: "Template saved." });
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title="Delete production template?"
          message={`This will remove "${deleting.name}". Plans already created from it are not affected.`}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await productionTemplateService.remove(deleting.id);
            setDeleting(null);
            await reload();
            setNotice({ tone: "success", message: "Template deleted." });
          }}
        />
      ) : null}
      {editingItemsFor ? (
        <Modal
          title={`Product Mix - ${editingItemsFor.name}`}
          onClose={() => setEditingItemsFor(null)}
          actions={
            <>
              <button className="btn btn-ghost" disabled={savingItems} onClick={() => setEditingItemsFor(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={savingItems} onClick={() => void handleSaveItems()}>
                {savingItems ? "Saving..." : "Save Product Mix"}
              </button>
            </>
          }
        >
          <div className="section-stack">
            <div className="btn-row">
              <select value={addingProductId} onChange={(event) => setAddingProductId(event.target.value)}>
                <option value="">Select a product to add...</option>
                {data.products
                  .filter((product) => !draftItems.some((item) => item.product_id === product.id))
                  .map((product) => (
                    <option key={product.id} value={product.id}>{product.sku} - {product.name}</option>
                  ))}
              </select>
              <button className="btn btn-secondary btn-small" disabled={!addingProductId} onClick={handleAddTemplateProduct}>
                Add Product
              </button>
            </div>
            {draftItems.length ? (
              <div className="table-shell">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Mix Mode</th>
                      <th>Fixed Qty / % of Mix</th>
                      <th>Min / Max</th>
                      <th>MOQ / Increment</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draftItems.map((item) => {
                      const product = item.products ?? data.products.find((entry) => entry.id === item.product_id);
                      return (
                        <tr key={item.product_id}>
                          <td data-label="Product">
                            <div className="cell-stack">
                              <strong>{product?.name ?? item.product_id}</strong>
                              <span className="helper-text">{product?.sku ?? ""}</span>
                            </div>
                          </td>
                          <td data-label="Mix Mode">
                            <select
                              value={item.mix_mode ?? "fixed"}
                              onChange={(event) =>
                                setDraftItems((current) =>
                                  current.map((entry) =>
                                    entry.product_id === item.product_id ? { ...entry, mix_mode: event.target.value as "fixed" | "percent" } : entry,
                                  ),
                                )
                              }
                            >
                              <option value="fixed">Fixed Quantity</option>
                              <option value="percent">Percent of Mix</option>
                            </select>
                          </td>
                          <td data-label="Fixed Qty / % of Mix">
                            <input
                              type="number"
                              min={0}
                              value={item.mix_mode === "percent" ? item.percent_of_mix ?? "" : item.fixed_quantity ?? ""}
                              onChange={(event) => {
                                const value = event.target.value ? Number(event.target.value) : null;
                                setDraftItems((current) =>
                                  current.map((entry) =>
                                    entry.product_id === item.product_id
                                      ? entry.mix_mode === "percent"
                                        ? { ...entry, percent_of_mix: value }
                                        : { ...entry, fixed_quantity: value }
                                      : entry,
                                  ),
                                );
                              }}
                            />
                          </td>
                          <td data-label="Min / Max">
                            <div className="btn-row">
                              <input
                                type="number"
                                min={0}
                                placeholder="Min"
                                value={item.min_quantity ?? ""}
                                onChange={(event) =>
                                  setDraftItems((current) =>
                                    current.map((entry) =>
                                      entry.product_id === item.product_id ? { ...entry, min_quantity: event.target.value ? Number(event.target.value) : null } : entry,
                                    ),
                                  )
                                }
                              />
                              <input
                                type="number"
                                min={0}
                                placeholder="Max"
                                value={item.max_quantity ?? ""}
                                onChange={(event) =>
                                  setDraftItems((current) =>
                                    current.map((entry) =>
                                      entry.product_id === item.product_id ? { ...entry, max_quantity: event.target.value ? Number(event.target.value) : null } : entry,
                                    ),
                                  )
                                }
                              />
                            </div>
                          </td>
                          <td data-label="MOQ / Increment">
                            <div className="btn-row">
                              <input
                                type="number"
                                min={0}
                                placeholder="MOQ"
                                value={item.moq ?? ""}
                                onChange={(event) =>
                                  setDraftItems((current) =>
                                    current.map((entry) =>
                                      entry.product_id === item.product_id ? { ...entry, moq: event.target.value ? Number(event.target.value) : null } : entry,
                                    ),
                                  )
                                }
                              />
                              <input
                                type="number"
                                min={0}
                                placeholder="Increment"
                                value={item.order_increment ?? ""}
                                onChange={(event) =>
                                  setDraftItems((current) =>
                                    current.map((entry) =>
                                      entry.product_id === item.product_id ? { ...entry, order_increment: event.target.value ? Number(event.target.value) : null } : entry,
                                    ),
                                  )
                                }
                              />
                            </div>
                          </td>
                          <td data-label="Actions">
                            <button
                              className="btn btn-danger btn-small"
                              onClick={() => setDraftItems((current) => current.filter((entry) => entry.product_id !== item.product_id))}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">No products in this template's mix yet.</div>
            )}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
