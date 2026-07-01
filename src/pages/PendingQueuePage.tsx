import { useState } from "react";
import { DataTable } from "@/components/DataTable";
import { EntityFormModal } from "@/components/EntityFormModal";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsyncData } from "@/hooks/useAsyncData";
import { intakeService } from "@/services/intakeService";
import { formatDate } from "@/utils/format";

export function PendingQueuePage() {
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const { data, loading, error, reload } = useAsyncData(() => intakeService.list(), []);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load the pending queue"} />;

  return (
    <div className="section-stack">
      <PageHeader
        title="Pending Queue"
        description="Internal review queue for inbound retailer/order requests before conversion into live records."
        actions={<button className="btn btn-primary" onClick={() => setCreating(true)}>Add to Queue</button>}
      />
      {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}
      <DataTable
        emptyMessage="No pending intake requests yet."
        columns={[
          { key: "status", title: "Status", render: (row) => <StatusBadge label={row.status} /> },
          {
            key: "request",
            title: "Item",
            render: (row) => (
              <div className="cell-stack">
                <strong>{row.subject}</strong>
                <span className="helper-text">{row.request_type} | {row.source_channel}</span>
              </div>
            ),
          },
          {
            key: "account",
            title: "Account / Buyer",
            render: (row) => (
              <div className="cell-stack">
                <strong>{row.retailer_name ?? "No retailer"}</strong>
                <span className="helper-text">{row.buyer_name ?? "No buyer"}</span>
              </div>
            ),
          },
          {
            key: "created",
            title: "Created",
            render: (row) => (
              <div className="cell-stack">
                <strong>{formatDate(row.created_at)}</strong>
                <span className="helper-text">{row.created_by_label ?? "System"}</span>
              </div>
            ),
          },
          {
            key: "actions",
            title: "Actions",
            render: (row) => (
              <div className="btn-row">
                <button
                  className="btn btn-secondary btn-small"
                  onClick={async () => {
                    try {
                      await intakeService.update({ id: row.id, status: row.status === "Pending" ? "In Review" : "Pending" });
                      await reload();
                    } catch (err) {
                      setNotice({ tone: "error", message: err instanceof Error ? err.message : "Unable to update queue status." });
                    }
                  }}
                >
                  {row.status === "Pending" ? "Start Review" : "Return to Pending"}
                </button>
                <button
                  className="btn btn-primary btn-small"
                  onClick={async () => {
                    try {
                      await intakeService.convertToRetailerOrPo({
                        intakeRequestId: row.id,
                        retailer: row.retailer_name ? { name: row.retailer_name, status: "Prospect" } : null,
                        purchaseOrder: row.retailer_name ? { po_number: `INTAKE-${row.id.slice(0, 8)}`, po_type: "Retailer PO", status: "Pending", notes: row.notes ?? row.subject } : null,
                      });
                      await reload();
                      setNotice({ tone: "success", message: "Pending request converted successfully." });
                    } catch (err) {
                      setNotice({ tone: "error", message: err instanceof Error ? err.message : "Unable to convert this pending request." });
                    }
                  }}
                >
                  Convert
                </button>
              </div>
            ),
          },
        ]}
        rows={data}
      />
      {creating ? (
        <EntityFormModal<Record<string, string>>
          title="Add to Queue"
          saveLabel="Add to Queue"
          initialValues={{
            request_type: "order",
            source_channel: "Manual",
            retailer_name: "",
            buyer_name: "",
            buyer_email: "",
            subject: "",
            requested_action: "",
            attachment_title: "",
            attachment_url: "",
            notes: "",
          }}
          fields={[
            { key: "request_type", label: "Type", type: "select", options: [{ label: "Order", value: "order" }, { label: "Retailer", value: "retailer" }, { label: "Other", value: "other" }] },
            { key: "source_channel", label: "Source", type: "select", options: [{ label: "Manual", value: "Manual" }, { label: "Forwarded Email", value: "Forwarded Email" }, { label: "Drag and Drop", value: "Drag and Drop" }] },
            { key: "retailer_name", label: "Retailer" },
            { key: "buyer_name", label: "Buyer" },
            { key: "buyer_email", label: "Buyer Email" },
            { key: "subject", label: "Subject", required: true },
            { key: "requested_action", label: "Next Action" },
            { key: "attachment_title", label: "Attachment Title" },
            { key: "attachment_url", label: "Attachment URL" },
            { key: "notes", label: "Notes", type: "textarea" },
          ]}
          onSave={async (values) => {
            await intakeService.create(
              {
                request_type: values.request_type as "order" | "retailer" | "other",
                source_channel: values.source_channel as "Forwarded Email" | "Drag and Drop" | "Manual",
                retailer_name: values.retailer_name || null,
                buyer_name: values.buyer_name || null,
                buyer_email: values.buyer_email || null,
                subject: values.subject,
                requested_action: values.requested_action || null,
                notes: values.notes || null,
              },
              values.attachment_title || values.attachment_url
                ? [{ title: values.attachment_title || "Attachment", file_url: values.attachment_url || null }]
                : [],
            );
            await reload();
            setNotice({ tone: "success", message: "Pending intake request created." });
          }}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </div>
  );
}
