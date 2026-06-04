import { useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DashboardCard } from "@/components/DashboardCard";
import { DataTable } from "@/components/DataTable";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsyncData } from "@/hooks/useAsyncData";
import { invoiceService } from "@/services/invoiceService";
import type { Invoice, InvoiceStatus } from "@/types/domain";
import { formatCurrency, formatDate } from "@/utils/format";

const invoiceStatuses: InvoiceStatus[] = ["Draft", "Sent", "Paid", "Void"];

export function InvoicesPage() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<Invoice | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const { data, loading, error, reload } = useAsyncData(
    () => invoiceService.list({ status, search }),
    [status, search],
  );

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load invoices"} />;

  const draftCount = data.filter((inv) => inv.status === "Draft").length;
  const sentCount = data.filter((inv) => inv.status === "Sent").length;
  const paidCount = data.filter((inv) => inv.status === "Paid").length;
  const voidCount = data.filter((inv) => inv.status === "Void").length;

  return (
    <div className="section-stack">
      <PageHeader
        title="Invoices"
        description="Invoices generated from Purchase Orders. Each invoice preserves the original PO line items, pricing, and account information."
        actions={(
          <div className="btn-row">
            <button className="btn btn-secondary" onClick={() => void reload()}>Refresh</button>
          </div>
        )}
      />
      {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}
      <div className="card-grid">
        <DashboardCard label="Total Invoices" value={data.length} />
        <DashboardCard label="Draft" value={draftCount} footnote="Not yet sent" />
        <DashboardCard label="Sent" value={sentCount} footnote="Awaiting payment" />
        <DashboardCard label="Paid" value={paidCount} />
        <DashboardCard label="Void" value={voidCount} />
      </div>
      <div className="panel">
        <div className="pill-row">
          <button className={`btn ${status === "" ? "btn-primary" : "btn-secondary"}`} onClick={() => setStatus("")}>All</button>
          {invoiceStatuses.map((s) => (
            <button
              key={s}
              className={`btn ${status === s ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setStatus(status === s ? "" : s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="panel">
        <div className="filter-row">
          <input
            placeholder="Search invoice number or notes"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>
      <DataTable
        emptyMessage="No invoices found. Convert a Purchase Order to an Invoice to get started."
        columns={[
          {
            key: "invoice_number",
            title: "Invoice / Account",
            render: (row) => (
              <div className="cell-stack">
                <Link className="table-link" to={`/invoices/${row.id}`}>{row.invoice_number}</Link>
                <span className="helper-text">{row.retailers?.name ?? "No account"}</span>
                <span className="helper-text">{row.buyers?.buyer_name ?? row.buyer_name_snapshot ?? "No buyer"}</span>
              </div>
            ),
          },
          {
            key: "status",
            title: "Status",
            render: (row) => <StatusBadge label={row.status} />,
          },
          {
            key: "dates",
            title: "Dates",
            render: (row) => (
              <div className="cell-stack">
                <strong>{formatDate(row.order_date)}</strong>
                {row.source_po_id ? <span className="helper-text">From PO</span> : null}
                <span className="helper-text">{row.source_channel ?? "Manual"}</span>
              </div>
            ),
          },
          {
            key: "total_cost",
            title: "Total",
            render: (row) => formatCurrency(row.total_cost),
          },
          {
            key: "actions",
            title: "Actions",
            render: (row) => (
              <div className="btn-row">
                <Link className="btn btn-ghost btn-small" to={`/invoices/${row.id}`}>View</Link>
                <Link className="btn btn-secondary btn-small" to={`/invoices/${row.id}/preview`}>Preview</Link>
                <button className="btn btn-danger btn-small" onClick={() => setDeleting(row)}>Delete</button>
              </div>
            ),
          },
        ]}
        rows={data}
      />
      {deleting ? (
        <ConfirmDialog
          title="Delete invoice?"
          message={`This will permanently remove Invoice ${deleting.invoice_number} and all of its line items.`}
          busy={busyDelete}
          onClose={() => {
            if (!busyDelete) setDeleting(null);
          }}
          onConfirm={async () => {
            try {
              setBusyDelete(true);
              await invoiceService.remove(deleting.id);
              setDeleting(null);
              await reload();
              setNotice({ tone: "success", message: "Invoice deleted successfully." });
            } catch (err) {
              setNotice({ tone: "error", message: err instanceof Error ? err.message : "Failed to delete invoice." });
            } finally {
              setBusyDelete(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}
