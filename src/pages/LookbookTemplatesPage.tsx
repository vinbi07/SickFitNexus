import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CopyShareLinkButton } from "@/components/CopyShareLinkButton";
import { CreatePOFromLookbookModal } from "@/components/CreatePOFromLookbookModal";
import { DataTable } from "@/components/DataTable";
import { EntityFormModal } from "@/components/EntityFormModal";
import { ErrorState } from "@/components/ErrorState";
import { ExportPdfButton } from "@/components/ExportPdfButton";
import { LoadingState } from "@/components/LoadingState";
import { LookbookStatusBadge } from "@/components/LookbookStatusBadge";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsyncData } from "@/hooks/useAsyncData";
import { buildLookbookUrl } from "@/lib/publicUrl";
import { buyerService } from "@/services/buyerService";
import { lookbookService } from "@/services/lookbookService";
import { lookbookTemplateService } from "@/services/lookbookTemplateService";
import { retailerService } from "@/services/retailerService";
import { supportService } from "@/services/supportService";
import type { Buyer, LookbookTemplate } from "@/types/domain";
import { formatDate } from "@/utils/format";
import { buildLookbookDocumentHtml } from "@/utils/lookbookDocument";
import { printLookbookDocument } from "@/utils/lookbookActions";

export function LookbookTemplatesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [lookbookQuery, setLookbookQuery] = useState("");
  const [deleting, setDeleting] = useState<LookbookTemplate | null>(null);
  const [creatingPoFor, setCreatingPoFor] = useState<Buyer | null>(null);
  const [creatingLookbookAccount, setCreatingLookbookAccount] = useState<Partial<Buyer> | null>(null);
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const { data, loading, error, reload } = useAsyncData(
    async () => ({
      templates: await lookbookTemplateService.list(),
      products: await supportService.listProducts(),
      barcodes: await supportService.listBarcodes(),
      lookbooks: await lookbookService.listLookbooks(),
      retailers: await retailerService.list(),
    }),
    [],
  );

  useEffect(() => {
    const state = location.state as { notice?: { tone: "success" | "error"; message: string } } | null;
    if (state?.notice) {
      setNotice(state.notice);
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredTemplates = useMemo(() => {
    if (!data) return [];
    return data.templates.filter((template) =>
      [template.name, template.description ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
  }, [data, query]);

  const filteredLookbooks = useMemo(() => {
    if (!data) return [];
    return data.lookbooks.filter(({ buyer }) =>
      [
        buyer.retailers?.name ?? "",
        buyer.company_name,
        buyer.buyer_name,
        buyer.buyer_email,
        buyer.lookbook_templates?.name ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(lookbookQuery.toLowerCase()),
    );
  }, [data, lookbookQuery]);

  if (loading) return <LoadingState />;
  if (error || !data)
    return (
      <ErrorState message={error ?? "Unable to load lookbook templates"} />
    );

  function getLookbookProducts(buyer: Buyer) {
    if (!data) return [];
    if (buyer.lookbook_template_id) {
      const template = data.templates.find((entry) => entry.id === buyer.lookbook_template_id);
      const productIds = new Set((template?.items ?? []).map((item) => item.product_id));
      return data.products.filter((product) => productIds.has(product.id));
    }
    return data.products.filter((product) => Number(product.case_pack_quantity ?? 0) > 0);
  }

  return (
    <div className="section-stack">
      {notice ? (
        <NotificationBanner
          tone={notice.tone}
          message={notice.message}
          onClose={() => setNotice(null)}
        />
      ) : null}
      <PageHeader
        title="Lookbooks"
        description="Create account-specific product lookbooks for retailers, airport accounts, and store buyers. Preview, export, share, and turn selected products into a Retailer PO."
      />
      <div className="panel section-stack">
        <div className="panel-header">
          <h3>Lookbooks</h3>
          <button
            className="btn btn-primary"
            onClick={() =>
              setCreatingLookbookAccount({
                retailer_id: "",
                buyer_name: "",
                buyer_email: "",
                order_mode_enabled: true,
                lookbook_status: "draft",
              })
            }
          >
            Create Lookbook
          </button>
        </div>
        <div className="filter-row">
          <input
            placeholder="Search account, buyer, or template"
            value={lookbookQuery}
            onChange={(event) => setLookbookQuery(event.target.value)}
          />
          <button className="btn btn-secondary" onClick={() => void reload()}>
            Refresh
          </button>
        </div>
        <DataTable
          emptyMessage="No buyer accounts have a lookbook magic link yet."
          columns={[
            {
              key: "account",
              title: "Account",
              render: ({ buyer }) => (
                <div className="cell-stack">
                  <Link className="table-link" to={`/retailers/${buyer.retailer_id}`}>
                    {buyer.retailers?.name ?? buyer.company_name}
                  </Link>
                  <span className="helper-text">{buyer.buyer_name}</span>
                </div>
              ),
            },
            {
              key: "template",
              title: "Lookbook",
              render: ({ buyer }) => buyer.lookbook_templates?.name ?? "All wholesale products",
            },
            {
              key: "status",
              title: "Status",
              render: ({ buyer, purchaseOrders }) => (
                <LookbookStatusBadge buyer={buyer} purchaseOrders={purchaseOrders} />
              ),
            },
            {
              key: "products",
              title: "Products",
              render: ({ buyer }) => {
                if (!buyer.lookbook_template_id) return "All wholesale products";
                const template = data.templates.find((entry) => entry.id === buyer.lookbook_template_id);
                return template?.items.length ?? 0;
              },
            },
            {
              key: "created_at",
              title: "Created",
              render: ({ buyer }) => formatDate(buyer.created_at),
            },
            {
              key: "updated_at",
              title: "Last Updated",
              render: ({ buyer }) => formatDate(buyer.updated_at),
            },
            {
              key: "last_accessed_at",
              title: "Last Viewed",
              render: ({ buyer }) => (buyer.last_accessed_at ? formatDate(buyer.last_accessed_at) : "Never"),
            },
            {
              key: "converted_po",
              title: "Converted PO",
              render: ({ purchaseOrders }) => {
                const convertedPo = purchaseOrders.find((po) => po.status !== "Cancelled");
                return convertedPo ? (
                  <Link className="table-link" to={`/purchase-orders/${convertedPo.id}`}>
                    {convertedPo.po_number}
                  </Link>
                ) : (
                  "N/A"
                );
              },
            },
            {
              key: "actions",
              title: "Actions",
              width: "26%",
              render: ({ buyer }) => {
                const products = getLookbookProducts(buyer);
                const hasAssortment = products.length > 0;
                const noAssortmentTitle = !hasAssortment ? "Assign a product assortment first" : undefined;
                const accountName = buyer.retailers?.name ?? buyer.company_name;
                return (
                  <div className="btn-row">
                    <button
                      className="btn btn-ghost btn-small"
                      disabled={!hasAssortment}
                      title={noAssortmentTitle}
                      onClick={() => navigate(`/lookbook-templates/preview/${buyer.id}`)}
                    >
                      Preview
                    </button>
                    <ExportPdfButton
                      disabled={!hasAssortment}
                      title={noAssortmentTitle}
                      onClick={() => {
                        const html = buildLookbookDocumentHtml({
                          accountName,
                          buyerName: buyer.buyer_name,
                          retailer: buyer.retailers ?? null,
                          products,
                          generatedDate: formatDate(new Date().toISOString()),
                        });
                        printLookbookDocument(html);
                      }}
                    />
                    <CopyShareLinkButton
                      url={buildLookbookUrl(buyer.access_token)}
                      onCopied={() => setNotice({ tone: "success", message: "Share link copied." })}
                    />
                    <button
                      className="btn btn-secondary btn-small"
                      disabled={!hasAssortment}
                      title={noAssortmentTitle}
                      onClick={() => setCreatingPoFor(buyer)}
                    >
                      Create PO from Lookbook
                    </button>
                    <button
                      className="btn btn-ghost btn-small"
                      disabled={!buyer.lookbook_template_id}
                      title={!buyer.lookbook_template_id ? "Assign a product assortment first" : undefined}
                      onClick={() => {
                        if (!buyer.lookbook_template_id) return;
                        navigate(`/lookbook-templates/${buyer.lookbook_template_id}/edit`);
                      }}
                    >
                      Edit Products
                    </button>
                  </div>
                );
              },
            },
          ]}
          rows={filteredLookbooks}
        />
      </div>
      <div className="panel section-stack">
        <div className="panel-header">
          <h3>Lookbook Templates</h3>
          <button className="btn btn-primary" onClick={() => navigate("/lookbook-templates/new")}>
            Create Template
          </button>
        </div>
        <div className="filter-row">
          <input
            placeholder="Search template name or description"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <DataTable
          emptyMessage="No lookbook templates yet."
          columns={[
            {
              key: "name",
              title: "Template",
              render: (row) => (
                <div className="cell-stack">
                  <strong>{row.name}</strong>
                  <span className="helper-text">
                    {row.description ?? "No description"}
                  </span>
                </div>
              ),
            },
            {
              key: "status",
              title: "Status",
              render: (row) => (
                <StatusBadge label={row.is_active ? "Active" : "Inactive"} />
              ),
            },
            { key: "items", title: "SKUs", render: (row) => row.items.length },
            {
              key: "featured",
              title: "Featured",
              render: (row) => row.items.filter((item) => item.featured).length,
            },
            {
              key: "actions",
              title: "Actions",
              render: (row) => (
                <div className="btn-row">
                  <button
                    className="btn btn-ghost btn-small"
                    onClick={() =>
                      navigate("/lookbook-templates/preview", {
                        state: {
                          products: row.items
                            .map((item) => data.products.find((product) => product.id === item.product_id))
                            .filter((product): product is (typeof data.products)[number] => Boolean(product)),
                          title: row.name,
                          description: row.description,
                        },
                      })
                    }
                  >
                    Preview
                  </button>
                  <button
                    className="btn btn-secondary btn-small po-edit-btn"
                    onClick={() => navigate(`/lookbook-templates/${row.id}/edit`)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-danger btn-small po-edit-btn"
                    onClick={() => setDeleting(row)}
                  >
                    Delete
                  </button>
                </div>
              ),
            },
          ]}
          rows={filteredTemplates}
        />
      </div>
      {creatingPoFor ? (
        <CreatePOFromLookbookModal
          buyer={creatingPoFor}
          products={getLookbookProducts(creatingPoFor)}
          onClose={() => setCreatingPoFor(null)}
        />
      ) : null}
      {creatingLookbookAccount ? (
        <EntityFormModal<Partial<Buyer>>
          title="Create Lookbook"
          saveLabel="Create Lookbook"
          initialValues={{
            retailer_id: creatingLookbookAccount.retailer_id ?? "",
            company_name: creatingLookbookAccount.company_name ?? "",
            buyer_name: creatingLookbookAccount.buyer_name ?? "",
            buyer_email: creatingLookbookAccount.buyer_email ?? "",
            phone: creatingLookbookAccount.phone ?? "",
            billing_address: creatingLookbookAccount.billing_address ?? "",
            shipping_address: creatingLookbookAccount.shipping_address ?? "",
            payment_terms: creatingLookbookAccount.payment_terms ?? "",
            compliance_requirements: creatingLookbookAccount.compliance_requirements ?? "",
            assigned_sales_rep: creatingLookbookAccount.assigned_sales_rep ?? "",
            lookbook_template_id: creatingLookbookAccount.lookbook_template_id ?? "",
            lookbook_status: creatingLookbookAccount.lookbook_status ?? "draft",
            link_validity_days: creatingLookbookAccount.link_validity_days ?? 30,
            order_mode_enabled: creatingLookbookAccount.order_mode_enabled ?? true,
            token_expires_at: creatingLookbookAccount.token_expires_at ?? "",
          }}
          fields={[
            {
              key: "retailer_id",
              label: "Account",
              type: "select",
              required: true,
              options: data.retailers.map((retailer) => ({ label: retailer.name, value: retailer.id })),
            },
            { key: "company_name", label: "Company Name" },
            { key: "buyer_name", label: "Buyer Name", required: true },
            { key: "buyer_email", label: "Buyer Email", required: true },
            { key: "phone", label: "Phone" },
            { key: "payment_terms", label: "Payment Terms" },
            { key: "assigned_sales_rep", label: "Assigned Sales Rep" },
            {
              key: "lookbook_template_id",
              label: "Lookbook Template",
              type: "select",
              options: data.templates.map((template) => ({ label: template.name, value: template.id })),
            },
            {
              key: "lookbook_status",
              label: "Lookbook Status",
              type: "select",
              options: [
                { label: "Draft", value: "draft" },
                { label: "Ready to Share", value: "ready" },
              ],
            },
            { key: "link_validity_days", label: "Link Validity (days)", type: "number", min: 1, step: 1 },
            { key: "billing_address", label: "Billing Address", type: "textarea" },
            { key: "shipping_address", label: "Shipping Address", type: "textarea" },
            { key: "compliance_requirements", label: "Compliance Requirements", type: "textarea" },
            { key: "token_expires_at", label: "Token Expires", type: "date" },
            { key: "order_mode_enabled", label: "Order Mode Enabled", type: "checkbox" },
          ]}
          onSave={async (values) => {
            if (!values.retailer_id) throw new Error("Select an account before creating a lookbook.");
            await buyerService.upsert({
              ...values,
              link_validity_days: Number(values.link_validity_days ?? 30),
            });
            await reload();
            setNotice({ tone: "success", message: "Lookbook created successfully." });
          }}
          onClose={() => setCreatingLookbookAccount(null)}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title="Delete lookbook template?"
          message={`This will remove ${deleting.name} and its product assortment.`}
          busy={false}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await lookbookTemplateService.remove(deleting.id);
            setDeleting(null);
            await reload();
            setNotice({
              tone: "success",
              message: "Template deleted successfully.",
            });
          }}
        />
      ) : null}
    </div>
  );
}
