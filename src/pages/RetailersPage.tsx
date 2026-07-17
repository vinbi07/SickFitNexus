import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
import { retailerService } from "@/services/retailerService";
import { supportService } from "@/services/supportService";
import { vendorService } from "@/services/vendorService";
import type { Retailer, Vendor } from "@/types/domain";
import { formatCurrency, formatDate, formatNumber } from "@/utils/format";

type RetailerSnapshot = Retailer & {
  totalPos: number;
  totalSpend: number;
  activeLocations: number;
  compliantRequirements: number;
  atRiskRequirements: number;
};

type VendorScorecard = Vendor & {
  totalPos: number;
  totalSpend: number;
  averageDeliveryDelay: number;
  latePoPercentage: number;
  fillRate: number;
  concentrationRisk: number;
  reliabilityScore: number;
};

export function RetailersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: "retailers" | "vendors" = searchParams.get("tab") === "vendors" ? "vendors" : "retailers";
  const setActiveTab = (tab: "retailers" | "vendors") =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab === "retailers") next.delete("tab");
      else next.set("tab", tab);
      return next;
    });

  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const [editingRetailer, setEditingRetailer] = useState<Partial<Retailer> | null>(null);
  const [deletingRetailer, setDeletingRetailer] = useState<RetailerSnapshot | null>(null);
  const [busyDeleteRetailer, setBusyDeleteRetailer] = useState(false);
  const [retailerQuery, setRetailerQuery] = useState("");
  const retailers = useAsyncData(async () => retailerService.getSnapshots(), []);

  const [editingVendor, setEditingVendor] = useState<Partial<Vendor> | null>(null);
  const [viewingVendor, setViewingVendor] = useState<VendorScorecard | null>(null);
  const [deletingVendor, setDeletingVendor] = useState<VendorScorecard | null>(null);
  const [busyDeleteVendor, setBusyDeleteVendor] = useState(false);
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorSort, setVendorSort] = useState("reliability");
  const vendors = useAsyncData(async () => ({
    scorecards: (await vendorService.getScorecards()) as VendorScorecard[],
    products: await supportService.listProducts(),
  }), []);

  if (retailers.loading || vendors.loading) return <LoadingState />;
  if (retailers.error || !retailers.data) return <ErrorState message={retailers.error ?? "Unable to load accounts"} />;
  if (vendors.error || !vendors.data) return <ErrorState message={vendors.error ?? "Unable to load vendors"} />;

  const retailerRows = retailers.data.filter((retailer) =>
    [
      retailer.name,
      retailer.primary_contact_name,
      retailer.primary_contact_email,
      retailer.account_number,
      retailer.supplier_id,
      retailer.activation_id,
      retailer.retailer_group,
    ]
      .join(" ")
      .toLowerCase()
      .includes(retailerQuery.toLowerCase()),
  );

  const vendorRows = vendors.data.scorecards
    .filter((row) => {
      const query = vendorSearch.trim().toLowerCase();
      return (
        !query ||
        row.name.toLowerCase().includes(query) ||
        (row.contact_email ?? "").toLowerCase().includes(query) ||
        (row.contact_phone ?? "").toLowerCase().includes(query)
      );
    })
    .sort((left, right) => {
      if (vendorSort === "spend") return right.totalSpend - left.totalSpend;
      if (vendorSort === "delay") return right.averageDeliveryDelay - left.averageDeliveryDelay;
      return right.reliabilityScore - left.reliabilityScore;
    });

  return (
    <div className="section-stack">
      <PageHeader
        title="Accounts"
        description={
          activeTab === "retailers"
            ? "Operate wholesale retailer accounts with quick access to contacts, SOP notes, shipping requirements, account numbers, reorder windows, and recent PO activity."
            : "Manage supplier records, contacts, lead times, and operational performance."
        }
        actions={
          activeTab === "retailers" ? (
            <button
              className="btn btn-primary"
              onClick={() => setEditingRetailer({ name: "", status: "Prospect", order_mode_policy: "enabled", edi_required: false })}
            >
              Add Account
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => setEditingVendor({ name: "" })}>Add Vendor</button>
          )
        }
      />
      {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}

      <div className="wizard-steps" role="tablist" aria-label="Accounts view">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "retailers"}
          className={`wizard-step${activeTab === "retailers" ? " is-active" : ""}`}
          onClick={() => setActiveTab("retailers")}
        >
          <span className="wizard-step-label">Retailers</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "vendors"}
          className={`wizard-step${activeTab === "vendors" ? " is-active" : ""}`}
          onClick={() => setActiveTab("vendors")}
        >
          <span className="wizard-step-label">Vendors</span>
        </button>
      </div>

      {activeTab === "retailers" ? (
        <>
          <div className="panel">
            <div className="filter-row">
              <input
                placeholder="Search retailer, contact, account number, or group"
                value={retailerQuery}
                onChange={(event) => setRetailerQuery(event.target.value)}
              />
              <button className="btn btn-secondary" onClick={() => void retailers.reload()}>
                Refresh
              </button>
            </div>
          </div>
          <DataTable
            emptyMessage="No accounts yet. Add an account to start tracking retailer operations."
            columns={[
              {
                key: "name",
                title: "Account",
                render: (row) => (
                  <div className="cell-stack">
                    <Link className="table-link" to={`/retailers/${row.id}`}>{row.name}</Link>
                    <span className="helper-text">{row.retailer_group ?? row.account_number ?? "No group / account number"}</span>
                  </div>
                ),
              },
              {
                key: "status",
                title: "Status / Contact",
                render: (row) => (
                  <div className="cell-stack">
                    <StatusBadge label={row.status} />
                    <span className="helper-text">{row.primary_contact_name ?? row.primary_contact_email ?? "No primary contact"}</span>
                  </div>
                ),
              },
              {
                key: "activity",
                title: "Revenue / Activity",
                render: (row) => (
                  <div className="cell-stack">
                    <strong>{formatCurrency(row.totalSpend)}</strong>
                    <span className="helper-text">{row.activeLocations} active locations</span>
                  </div>
                ),
              },
              {
                key: "window",
                title: "Reorder Window",
                render: (row) => (
                  <div className="cell-stack">
                    <strong>{row.next_reorder_start ? formatDate(row.next_reorder_start) : "Not set"}</strong>
                    <span className="helper-text">{row.next_reorder_end ? `Ends ${formatDate(row.next_reorder_end)}` : "No end date"}</span>
                  </div>
                ),
              },
              {
                key: "actions",
                title: "Actions",
                render: (row) => (
                  <div className="btn-row">
                    <Link className="btn btn-ghost btn-small" to={`/retailers/${row.id}`}>Open Profile</Link>
                    <button className="btn btn-secondary btn-small" onClick={() => setEditingRetailer(row)}>Edit</button>
                    <button className="btn btn-danger btn-small" onClick={() => setDeletingRetailer(row)}>Delete</button>
                  </div>
                ),
              },
            ]}
            rows={retailerRows}
          />
          {editingRetailer ? (
            <EntityFormModal<Partial<Retailer>>
              title={editingRetailer.id ? "Edit Account" : "Add Account"}
              saveLabel={editingRetailer.id ? "Save Changes" : "Create Account"}
              initialValues={{
                name: editingRetailer.name ?? "",
                status: editingRetailer.status ?? "Prospect",
                primary_contact_name: editingRetailer.primary_contact_name ?? "",
                primary_contact_email: editingRetailer.primary_contact_email ?? "",
                primary_contact_phone: editingRetailer.primary_contact_phone ?? "",
                secondary_contacts: editingRetailer.secondary_contacts ?? "",
                account_number: editingRetailer.account_number ?? "",
                supplier_id: editingRetailer.supplier_id ?? "",
                activation_id: editingRetailer.activation_id ?? "",
                retailer_group: editingRetailer.retailer_group ?? "",
                parent_retailer_id: editingRetailer.parent_retailer_id ?? "",
                logo_url: editingRetailer.logo_url ?? "",
                brand_accent_color: editingRetailer.brand_accent_color ?? "#e72027",
                lookbook_intro: editingRetailer.lookbook_intro ?? "",
                ordering_cadence_days: editingRetailer.ordering_cadence_days ?? 0,
                default_payment_terms: editingRetailer.default_payment_terms ?? "",
                order_mode_policy: editingRetailer.order_mode_policy ?? "enabled",
                edi_required: editingRetailer.edi_required ?? false,
                next_reorder_start: editingRetailer.next_reorder_start ?? "",
                next_reorder_end: editingRetailer.next_reorder_end ?? "",
                shipping_requirements: editingRetailer.shipping_requirements ?? "",
                billing_company_name: editingRetailer.billing_company_name ?? "",
                billing_contact_name: editingRetailer.billing_contact_name ?? "",
                billing_street: editingRetailer.billing_street ?? "",
                billing_city: editingRetailer.billing_city ?? "",
                billing_state: editingRetailer.billing_state ?? "",
                billing_zip: editingRetailer.billing_zip ?? "",
                billing_phone: editingRetailer.billing_phone ?? "",
                billing_email: editingRetailer.billing_email ?? "",
                shipping_company_name: editingRetailer.shipping_company_name ?? "",
                shipping_attention: editingRetailer.shipping_attention ?? "",
                shipping_street: editingRetailer.shipping_street ?? "",
                shipping_city: editingRetailer.shipping_city ?? "",
                shipping_state: editingRetailer.shipping_state ?? "",
                shipping_zip: editingRetailer.shipping_zip ?? "",
                shipping_phone: editingRetailer.shipping_phone ?? "",
                sop_notes: editingRetailer.sop_notes ?? "",
                notes: editingRetailer.notes ?? "",
              }}
              fields={[
                { key: "name", label: "Account Name", required: true },
                { key: "status", label: "Status", type: "select", options: [{ label: "Prospect", value: "Prospect" }, { label: "Pilot", value: "Pilot" }, { label: "Active", value: "Active" }, { label: "Paused", value: "Paused" }] },
                { key: "account_number", label: "Account Number" },
                { key: "supplier_id", label: "Supplier ID" },
                { key: "activation_id", label: "Activation ID" },
                { key: "retailer_group", label: "Parent / Group" },
                { key: "logo_url", label: "Retailer Logo", type: "image", folder: "retailer-logos" },
                { key: "brand_accent_color", label: "Brand Accent Color" },
                { key: "primary_contact_name", label: "Primary Contact" },
                { key: "primary_contact_email", label: "Email" },
                { key: "primary_contact_phone", label: "Phone" },
                { key: "ordering_cadence_days", label: "Ordering Cadence (days)", type: "number", min: 0, step: 1 },
                { key: "default_payment_terms", label: "Default Payment Terms" },
                { key: "order_mode_policy", label: "Order Mode Policy", type: "select", options: [{ label: "Enabled", value: "enabled" }, { label: "Catalog Only", value: "catalog_only" }, { label: "EDI Only", value: "edi_only" }] },
                { key: "edi_required", label: "EDI Required", type: "checkbox" },
                { key: "next_reorder_start", label: "Next Reorder Start", type: "date" },
                { key: "next_reorder_end", label: "Next Reorder End", type: "date" },
                { key: "secondary_contacts", label: "Additional Contacts", type: "textarea" },
                { key: "shipping_requirements", label: "Shipping Requirements", type: "textarea" },
                { key: "billing_company_name", label: "Billing Company Name" },
                { key: "billing_contact_name", label: "Billing Contact Name" },
                { key: "billing_street", label: "Billing Street" },
                { key: "billing_city", label: "Billing City" },
                { key: "billing_state", label: "Billing State" },
                { key: "billing_zip", label: "Billing Zip" },
                { key: "billing_phone", label: "Billing Phone" },
                { key: "billing_email", label: "Billing Email" },
                { key: "shipping_company_name", label: "Shipping Company Name" },
                { key: "shipping_attention", label: "Shipping Attention" },
                { key: "shipping_street", label: "Shipping Street" },
                { key: "shipping_city", label: "Shipping City" },
                { key: "shipping_state", label: "Shipping State" },
                { key: "shipping_zip", label: "Shipping Zip" },
                { key: "shipping_phone", label: "Shipping Phone" },
                { key: "sop_notes", label: "SOP Notes", type: "textarea" },
                { key: "lookbook_intro", label: "Lookbook Intro", type: "textarea" },
                { key: "notes", label: "Notes", type: "textarea" },
              ]}
              onSave={async (values) => {
                if (!String(values.name ?? "").trim()) throw new Error("Account name is required.");
                await retailerService.upsert({
                  ...editingRetailer,
                  ...values,
                  primary_contact_name: values.primary_contact_name ? String(values.primary_contact_name) : null,
                  primary_contact_email: values.primary_contact_email ? String(values.primary_contact_email) : null,
                  primary_contact_phone: values.primary_contact_phone ? String(values.primary_contact_phone) : null,
                  secondary_contacts: values.secondary_contacts ? String(values.secondary_contacts) : null,
                  account_number: values.account_number ? String(values.account_number) : null,
                  supplier_id: values.supplier_id ? String(values.supplier_id) : null,
                  activation_id: values.activation_id ? String(values.activation_id) : null,
                  retailer_group: values.retailer_group ? String(values.retailer_group) : null,
                  parent_retailer_id: values.parent_retailer_id ? String(values.parent_retailer_id) : null,
                  logo_url: values.logo_url ? String(values.logo_url) : null,
                  brand_accent_color: values.brand_accent_color ? String(values.brand_accent_color) : null,
                  lookbook_intro: values.lookbook_intro ? String(values.lookbook_intro) : null,
                  ordering_cadence_days: Number(values.ordering_cadence_days ?? 0) || null,
                  default_payment_terms: values.default_payment_terms ? String(values.default_payment_terms) : null,
                  order_mode_policy: (values.order_mode_policy ? String(values.order_mode_policy) : "enabled") as Retailer["order_mode_policy"],
                  edi_required: Boolean(values.edi_required),
                  next_reorder_start: values.next_reorder_start ? String(values.next_reorder_start) : null,
                  next_reorder_end: values.next_reorder_end ? String(values.next_reorder_end) : null,
                  shipping_requirements: values.shipping_requirements ? String(values.shipping_requirements) : null,
                  billing_company_name: values.billing_company_name ? String(values.billing_company_name) : null,
                  billing_contact_name: values.billing_contact_name ? String(values.billing_contact_name) : null,
                  billing_street: values.billing_street ? String(values.billing_street) : null,
                  billing_city: values.billing_city ? String(values.billing_city) : null,
                  billing_state: values.billing_state ? String(values.billing_state) : null,
                  billing_zip: values.billing_zip ? String(values.billing_zip) : null,
                  billing_phone: values.billing_phone ? String(values.billing_phone) : null,
                  billing_email: values.billing_email ? String(values.billing_email) : null,
                  shipping_company_name: values.shipping_company_name ? String(values.shipping_company_name) : null,
                  shipping_attention: values.shipping_attention ? String(values.shipping_attention) : null,
                  shipping_street: values.shipping_street ? String(values.shipping_street) : null,
                  shipping_city: values.shipping_city ? String(values.shipping_city) : null,
                  shipping_state: values.shipping_state ? String(values.shipping_state) : null,
                  shipping_zip: values.shipping_zip ? String(values.shipping_zip) : null,
                  shipping_phone: values.shipping_phone ? String(values.shipping_phone) : null,
                  sop_notes: values.sop_notes ? String(values.sop_notes) : null,
                  notes: values.notes ? String(values.notes) : null,
                });
                await retailers.reload();
                setNotice({ tone: "success", message: editingRetailer.id ? "Account updated successfully." : "Account created successfully." });
              }}
              onClose={() => setEditingRetailer(null)}
            />
          ) : null}
          {deletingRetailer ? (
            <ConfirmDialog
              title="Delete account?"
              message={`This will permanently remove ${deletingRetailer.name}.`}
              busy={busyDeleteRetailer}
              onClose={() => {
                if (!busyDeleteRetailer) setDeletingRetailer(null);
              }}
              onConfirm={async () => {
                try {
                  setBusyDeleteRetailer(true);
                  await retailerService.remove(deletingRetailer.id);
                  setDeletingRetailer(null);
                  await retailers.reload();
                  setNotice({ tone: "success", message: "Account deleted successfully." });
                } catch (err) {
                  setNotice({ tone: "error", message: err instanceof Error ? err.message : "Failed to delete account." });
                } finally {
                  setBusyDeleteRetailer(false);
                }
              }}
            />
          ) : null}
        </>
      ) : (
        <>
          <div className="panel">
            <div className="filter-row">
              <input placeholder="Search vendor, email, phone" value={vendorSearch} onChange={(event) => setVendorSearch(event.target.value)} />
              <select value={vendorSort} onChange={(event) => setVendorSort(event.target.value)}>
                <option value="reliability">Sort by reliability</option>
                <option value="spend">Sort by spend</option>
                <option value="delay">Sort by delay</option>
              </select>
              <button className="btn btn-secondary" onClick={() => void vendors.reload()}>
                Refresh
              </button>
            </div>
          </div>
          <DataTable
            emptyMessage="No vendors yet. Add suppliers to connect products and purchase orders."
            columns={[
              {
                key: "name",
                title: "Vendor / Contact",
                render: (row) => (
                  <div className="cell-stack">
                    <span className="table-link">{row.name}</span>
                    <span className="helper-text">{row.contact_email ?? row.contact_phone ?? "No contact info"}</span>
                  </div>
                ),
              },
              {
                key: "activity",
                title: "Spend / POs",
                render: (row) => (
                  <div className="cell-stack">
                    <strong>{formatCurrency(row.totalSpend)}</strong>
                    <span className="helper-text">{row.totalPos} POs | Lead {row.lead_time_days ?? 0} days</span>
                  </div>
                ),
              },
              {
                key: "performance",
                title: "Performance",
                render: (row) => (
                  <div className="cell-stack">
                    <strong>{formatNumber(row.fillRate, 1)}% fill</strong>
                    <span className="helper-text">{formatNumber(row.averageDeliveryDelay, 1)} days avg delay</span>
                  </div>
                ),
              },
              {
                key: "reliabilityScore",
                title: "Reliability",
                render: (row) => (
                  <StatusBadge label={`${Math.round(row.reliabilityScore)} ${row.reliabilityScore < 65 ? "High Risk" : "Stable"}`} />
                ),
              },
              {
                key: "actions",
                title: "Actions",
                render: (row) => (
                  <div className="btn-row">
                    <button className="btn btn-ghost btn-small" onClick={() => setViewingVendor(row)}>
                      View Details
                    </button>
                    <button className="btn btn-secondary btn-small" onClick={() => setEditingVendor(row)}>
                      Edit
                    </button>
                    <button className="btn btn-danger btn-small" onClick={() => setDeletingVendor(row)}>
                      Delete
                    </button>
                  </div>
                ),
              },
            ]}
            rows={vendorRows}
          />
          {editingVendor ? (
            <EntityFormModal<Partial<Vendor>>
              title={editingVendor.id ? "Edit Vendor" : "Add Vendor"}
              saveLabel={editingVendor.id ? "Save Changes" : "Create Vendor"}
              initialValues={{
                name: editingVendor.name ?? "",
                contact_email: editingVendor.contact_email ?? "",
                contact_phone: editingVendor.contact_phone ?? "",
                lead_time_days: editingVendor.lead_time_days ?? 0,
                notes: editingVendor.notes ?? "",
              }}
              fields={[
                { key: "name", label: "Name", required: true },
                { key: "contact_email", label: "Email" },
                { key: "contact_phone", label: "Phone" },
                { key: "lead_time_days", label: "Lead Time (days)", type: "number", min: 0, step: 1 },
                { key: "notes", label: "Notes", type: "textarea" },
              ]}
              onSave={async (values) => {
                if (!String(values.name ?? "").trim()) throw new Error("Vendor name is required.");
                await vendorService.upsert({
                  ...editingVendor,
                  ...values,
                  contact_email: values.contact_email ? String(values.contact_email) : null,
                  contact_phone: values.contact_phone ? String(values.contact_phone) : null,
                  notes: values.notes ? String(values.notes) : null,
                  lead_time_days: Number(values.lead_time_days ?? 0),
                });
                await vendors.reload();
                setNotice({
                  tone: "success",
                  message: editingVendor.id ? "Vendor updated successfully." : "Vendor created successfully.",
                });
              }}
              onClose={() => setEditingVendor(null)}
            />
          ) : null}
          {viewingVendor ? (
            <Modal
              title={viewingVendor.name}
              onClose={() => setViewingVendor(null)}
              actions={<button className="btn btn-ghost" onClick={() => setViewingVendor(null)}>Cancel</button>}
            >
              <div className="detail-grid">
                <div className="detail-card"><span>Email</span><strong>{viewingVendor.contact_email ?? "N/A"}</strong></div>
                <div className="detail-card"><span>Phone</span><strong>{viewingVendor.contact_phone ?? "N/A"}</strong></div>
                <div className="detail-card"><span>Lead Time</span><strong>{viewingVendor.lead_time_days ?? 0} days</strong></div>
                <div className="detail-card"><span>Reliability</span><strong>{Math.round(viewingVendor.reliabilityScore)}</strong></div>
                <div className="detail-card"><span>Total Spend</span><strong>{formatCurrency(viewingVendor.totalSpend)}</strong></div>
                <div className="detail-card"><span>Linked Products</span><strong>{vendors.data.products.filter((product) => product.vendor_id === viewingVendor.id).length}</strong></div>
                <div className="detail-card"><span>Average Delay</span><strong>{formatNumber(viewingVendor.averageDeliveryDelay, 1)} days</strong></div>
                <div className="detail-card"><span>Fill Rate</span><strong>{formatNumber(viewingVendor.fillRate, 1)}%</strong></div>
                <div className="detail-card" style={{ gridColumn: "1 / -1" }}><span>Notes</span><strong>{viewingVendor.notes ?? "No notes added."}</strong></div>
              </div>
            </Modal>
          ) : null}
          {deletingVendor ? (
            <ConfirmDialog
              title="Delete vendor?"
              message={`This removes ${deletingVendor.name}. Products and purchase orders linked to this vendor may need reassignment first.`}
              busy={busyDeleteVendor}
              onClose={() => {
                if (!busyDeleteVendor) setDeletingVendor(null);
              }}
              onConfirm={async () => {
                try {
                  setBusyDeleteVendor(true);
                  await vendorService.remove(deletingVendor.id);
                  setDeletingVendor(null);
                  await vendors.reload();
                  setNotice({ tone: "success", message: "Vendor deleted successfully." });
                } catch (err) {
                  setNotice({ tone: "error", message: err instanceof Error ? err.message : "Failed to delete vendor." });
                } finally {
                  setBusyDeleteVendor(false);
                }
              }}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
