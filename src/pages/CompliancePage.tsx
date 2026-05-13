import { useState } from "react";
import { DataTable } from "@/components/DataTable";
import { EntityFormModal } from "@/components/EntityFormModal";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsyncData } from "@/hooks/useAsyncData";
import { complianceService } from "@/services/complianceService";
import { retailerService } from "@/services/retailerService";
import { downloadCsv } from "@/utils/export";
import { formatDate } from "@/utils/format";

export function CompliancePage() {
  const [editing, setEditing] = useState<null | {
    retailer_id: string;
    custom_retailer_name: string;
    requirement_type_id: string;
    status: string;
    expires_at: string;
    notes: string;
    document_title: string;
    document_file_url: string;
  }>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const { data, loading, error, reload } = useAsyncData(
    async () => ({
      matrix: await complianceService.getMatrix(),
      retailers: await retailerService.list(),
      requirementTypes: await complianceService.listRequirementTypes(),
    }),
    [],
  );

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load compliance"} />;

  return (
    <div className="section-stack">
      <PageHeader
        title="Compliance"
        description="Track required retailer certifications, expiration windows, missing docs, and exportable packet data."
        actions={
          <div className="btn-row">
            <button
              className="btn btn-secondary"
              onClick={() =>
                downloadCsv(
                  "compliance-packet-export.csv",
                  data.matrix.map((row) => ({
                    retailer: row.retailers?.name,
                    requirement: row.requirement_types?.name,
                    status: row.status,
                    expires_at: row.expires_at,
                    documents: row.documents.map((document) => document.title).join("; "),
                  })),
                )
              }
            >
              Export Packet CSV
            </button>
            <button className="btn btn-primary" onClick={() => setEditing({ retailer_id: "", custom_retailer_name: "", requirement_type_id: "", status: "Missing", expires_at: "", notes: "", document_title: "", document_file_url: "" })}>
              Add Requirement
            </button>
          </div>
        }
      />
      {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}
      <DataTable
        emptyMessage="No compliance requirements yet."
        columns={[
          { key: "retailer", title: "Retailer", render: (row) => row.retailers?.name ?? "N/A" },
          { key: "requirement", title: "Required Doc", render: (row) => row.requirement_types?.name ?? "N/A" },
          { key: "status", title: "Status", render: (row) => <StatusBadge label={row.status} /> },
          { key: "expires_at", title: "Expires", render: (row) => formatDate(row.expires_at) },
          { key: "documents", title: "Documents", render: (row) => row.documents.length ? row.documents.map((document) => document.title).join(", ") : "No files" },
          {
            key: "open_file",
            title: "File",
            render: (row) => {
              const linkedDocument = row.documents.find((document) => document.file_url);
              return linkedDocument?.file_url ? (
                <a href={linkedDocument.file_url} target="_blank" rel="noreferrer">
                  Open file
                </a>
              ) : (
                "N/A"
              );
            },
          },
          { key: "notes", title: "Notes", render: (row) => row.notes ?? "N/A" },
        ]}
        rows={data.matrix}
      />
      {editing ? (
        <EntityFormModal<typeof editing>
          title="Add Compliance Requirement"
          saveLabel="Save Requirement"
          initialValues={editing}
          fields={[
            { key: "retailer_id", label: "Retailer", type: "select", options: data.retailers.map((retailer) => ({ label: retailer.name, value: retailer.id })) },
            { key: "custom_retailer_name", label: "Or Add Custom Retailer" },
            { key: "requirement_type_id", label: "Requirement Type", type: "select", required: true, options: data.requirementTypes.map((type) => ({ label: type.name, value: type.id })) },
            { key: "status", label: "Status", type: "select", options: [{ label: "Missing", value: "Missing" }, { label: "Renewing", value: "Renewing" }, { label: "Compliant", value: "Compliant" }] },
            { key: "expires_at", label: "Expires At", type: "date" },
            { key: "document_title", label: "Document Title" },
            { key: "document_file_url", label: "Document File URL" },
            { key: "notes", label: "Notes", type: "textarea" },
          ]}
          onSave={async (values) => {
            const selectedRetailerId = String(values.retailer_id ?? "").trim();
            const customRetailerName = String(values.custom_retailer_name ?? "").trim();
            let retailerId = selectedRetailerId;

            if (!retailerId && !customRetailerName) {
              throw new Error("Select a retailer or enter a custom retailer name.");
            }

            if (!retailerId && customRetailerName) {
              const savedRetailer = await retailerService.upsert({
                name: customRetailerName,
                status: "Prospect",
              });
              retailerId = savedRetailer.id;
            }

            const savedRequirement = await complianceService.upsertRequirement({
              retailer_id: retailerId,
              requirement_type_id: String(values.requirement_type_id),
              status: values.status as "Missing" | "Renewing" | "Compliant",
              expires_at: values.expires_at ? String(values.expires_at) : null,
              notes: values.notes ? String(values.notes) : null,
            });

            const documentTitle = String(values.document_title ?? "").trim();
            const documentFileUrl = String(values.document_file_url ?? "").trim();

            if (documentTitle || documentFileUrl) {
              await complianceService.saveDocument({
                retailer_requirement_id: savedRequirement.id,
                title: documentTitle || "Compliance document",
                file_url: documentFileUrl || null,
                expires_at: values.expires_at ? String(values.expires_at) : null,
              });
            }

            await reload();
            setNotice({
              tone: "success",
              message:
                customRetailerName && !selectedRetailerId
                  ? "Retailer created and compliance requirement saved."
                  : documentTitle || documentFileUrl
                    ? "Compliance requirement and document link saved."
                    : "Compliance requirement saved.",
            });
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
