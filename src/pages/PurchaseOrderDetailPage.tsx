import { useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CommentsPanel } from "@/features/comments/CommentsPanel";
import { DataTable } from "@/components/DataTable";
import { ErrorState } from "@/components/ErrorState";
import { InventoryImpactList } from "@/components/InventoryImpactList";
import { LoadingState } from "@/components/LoadingState";
import { NotificationBanner } from "@/components/NotificationBanner";
import { OrderSummaryCard } from "@/components/OrderSummaryCard";
import { PageHeader } from "@/components/PageHeader";
import { ProductNameWithMetadata } from "@/components/ProductNameWithMetadata";
import { PurchaseOrderDocumentView } from "@/components/PurchaseOrderDocumentView";
import { PurchaseOrderDrawer } from "@/components/PurchaseOrderDrawer";
import { ManufacturerPoDocumentView } from "@/components/orders/ManufacturerPoDocumentView";
import { ReceiveInventoryModal } from "@/components/ReceiveInventoryModal";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import { useAsyncData } from "@/hooks/useAsyncData";
import { usePurchaseOrderDrawer } from "@/hooks/usePurchaseOrderDrawer";
import { dashboardService } from "@/services/dashboardService";
import { purchaseOrderService } from "@/services/purchaseOrderService";
import { sockCardService } from "@/services/sockCardService";
import { supportService } from "@/services/supportService";
import type {
  PurchaseOrderCounterEvent,
  PurchaseOrderStatus,
} from "@/types/domain";
import { daysBetween } from "@/utils/date";
import { formatCurrency, formatDate } from "@/utils/format";
import {
  getAvailableAfterIncoming,
  getInventoryHealthTone,
  getInventoryRiskStatus,
  getManufacturerDisplayName,
  getManufacturingOrderStatusLabel,
  getManufacturingOrderTitle,
  getOversoldLabel,
  getPaymentStatusLabel,
} from "@/utils/operations";
import { printPurchaseOrderDocument } from "@/utils/purchaseOrderActions";
import { buildPurchaseOrderDocumentHtml } from "@/utils/purchaseOrderDocument";
import { buildManufacturerOrderText } from "@/utils/manufacturerOrderDocument";
import { exportPoLineItemsExcel } from "@/utils/exportPoLineItemsExcel";
import { downloadManufacturerFilesZip } from "@/utils/downloadManufacturerFiles";
import { invoiceService } from "@/services/invoiceService";

const EDITABLE_PO_STATUSES: PurchaseOrderStatus[] = [
  "Draft",
  "Pending",
  "On Hold",
  "Delayed",
  "Issue Flagged",
];

function formatCounterEventTitle(event: PurchaseOrderCounterEvent) {
  switch (event.event_type) {
    case "countered":
      return "SickFit countered the order";
    case "buyer_revised":
      return "Buyer revised the live link order";
    case "accepted":
      return "Counter accepted";
    case "declined":
      return "Counter declined";
    default:
      return String(event.event_type).replaceAll("_", " ");
  }
}

function formatCounterEventMeta(event: PurchaseOrderCounterEvent) {
  const payload = event.payload as {
    skuCount?: number;
    totalUnits?: number;
    subtotal?: number;
    priorStatus?: string;
  } | null;
  const parts = [
    payload?.skuCount
      ? `${payload.skuCount} SKU${payload.skuCount === 1 ? "" : "s"}`
      : null,
    payload?.totalUnits ? `${payload.totalUnits} units` : null,
    payload?.subtotal ? formatCurrency(payload.subtotal) : null,
    payload?.priorStatus ? `From ${payload.priorStatus}` : null,
  ].filter(Boolean);
  return parts.join(" | ");
}

const DETAIL_TABS = [
  { id: "overview", label: "Overview" },
  { id: "preview", label: "Document Preview" },
  { id: "fulfillment", label: "Fulfillment" },
  { id: "documents", label: "Documents & Comms" },
  { id: "activity", label: "Activity" },
] as const;

type DetailTab = (typeof DETAIL_TABS)[number]["id"];

export function PurchaseOrderDetailPage() {
  const params = useParams();
  const navigate = useNavigate();
  const poId = params.id ?? "";
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: DetailTab = DETAIL_TABS.some((tab) => tab.id === searchParams.get("tab"))
    ? (searchParams.get("tab") as DetailTab)
    : "overview";
  const setActiveTab = (tab: DetailTab) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab === "overview") next.delete("tab");
      else next.set("tab", tab);
      return next;
    });
  const {
    isOpen: drawerOpen,
    poId: drawerPoId,
    mode: drawerMode,
    openDrawer,
    closeDrawer,
  } = usePurchaseOrderDrawer();
  const actionsMenuRef = useRef<HTMLDetailsElement>(null);
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [newMessage, setNewMessage] = useState({
    sender_name: "",
    sender_role: "",
    channel: "Internal Note",
    body: "",
  });
  const [newDocument, setNewDocument] = useState({
    document_type: "Other",
    title: "",
    file_url: "",
  });
  const { data, loading, error, reload } = useAsyncData(
    () => purchaseOrderService.getById(poId),
    [poId],
  );
  const { data: sockCards } = useAsyncData(
    () => sockCardService.listCards(),
    [],
  );
  const { data: snapshot } = useAsyncData(
    () => dashboardService.getSnapshot(),
    [],
  );
  const { data: locations } = useAsyncData(
    () => supportService.listLocations(),
    [],
  );
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [receiving, setReceiving] = useState(false);

  if (loading) return <LoadingState />;
  if (error || !data)
    return (
      <ErrorState message={error ?? "Unable to load purchase order detail"} />
    );

  const reorderBySku = new Map(
    (snapshot?.skuReorderWindows ?? []).map((item) => [item.sku, item]),
  );

  const handleStatusChange = async (nextStatus: string) => {
    if (!nextStatus) return;
    setStatusUpdating(true);
    try {
      await purchaseOrderService.updateStatus(
        poId,
        nextStatus as PurchaseOrderStatus,
      );
      await reload();
      setNotice({
        tone: "success",
        message: `PO status changed to ${nextStatus}.`,
      });
    } catch (err) {
      setNotice({
        tone: "error",
        message:
          err instanceof Error ? err.message : "Unable to update PO status.",
      });
    } finally {
      setStatusUpdating(false);
    }
  };

  const paidToDeliveredDays =
    data.purchaseOrder.invoice_paid_at &&
    data.purchaseOrder.actual_delivery_date
      ? daysBetween(
          data.purchaseOrder.invoice_paid_at,
          data.purchaseOrder.actual_delivery_date,
        )
      : null;
  const generated = data.generatedDocuments[0];
  const isManufacturerPo = data.purchaseOrder.po_type === "Manufacturer PO";
  const manufacturingStatus = getManufacturingOrderStatusLabel(
    data.purchaseOrder,
  );
  const paymentStatus = getPaymentStatusLabel(data.purchaseOrder);
  const currentDocumentHtml = buildPurchaseOrderDocumentHtml(
    data.purchaseOrder,
    data.lineItems,
    data.purchaseOrder.buyers ?? null,
    data.purchaseOrder.retailers ?? null,
  );

  const handleMarkAsPaid = async () => {
    try {
      await purchaseOrderService.markAsPaid(poId);
      await reload();
      setNotice({
        tone: "success",
        message: "Manufacturing order marked as paid.",
      });
    } catch (err) {
      setNotice({
        tone: "error",
        message: err instanceof Error ? err.message : "Unable to mark as paid.",
      });
    }
  };

  const handleMarkAsShipped = async () => {
    try {
      await purchaseOrderService.markAsShipped(poId);
      await reload();
      setNotice({
        tone: "success",
        message: "Manufacturing order marked as shipped.",
      });
    } catch (err) {
      setNotice({
        tone: "error",
        message:
          err instanceof Error ? err.message : "Unable to mark as shipped.",
      });
    }
  };

  const handleConvertToInvoice = async () => {
    try {
      const invoice = await invoiceService.convertFromPo(poId);
      setNotice({
        tone: "success",
        message: `Invoice ${invoice.invoice_number} created. Click View Invoice to open it.`,
      });
      navigate(`/invoices/${invoice.id}`);
    } catch (err) {
      setNotice({
        tone: "error",
        message:
          err instanceof Error
            ? err.message
            : "Failed to convert PO to invoice.",
      });
    }
  };

  const handleEmailPo = () => {
    const recipients = [
      data.purchaseOrder.bill_to_email,
      data.purchaseOrder.retailers?.primary_contact_email,
    ]
      .filter(Boolean)
      .join(",");
    window.location.href = `mailto:${encodeURIComponent(recipients)}?subject=${encodeURIComponent(`Purchase Order ${data.purchaseOrder.po_number}`)}&body=${encodeURIComponent(`Please review Purchase Order ${data.purchaseOrder.po_number}.\n\nPreview link: ${window.location.origin}/purchase-orders/${poId}/preview`)}`;
  };

  const handleApprove = async () => {
    try {
      await purchaseOrderService.approve(poId);
      await reload();
      setNotice({ tone: "success", message: "PO approved successfully." });
    } catch (err) {
      setNotice({
        tone: "error",
        message: err instanceof Error ? err.message : "Unable to approve PO.",
      });
    }
  };

  const handleCounter = async () => {
    const response = window.prompt(
      "Add counter note for the buyer",
      data.purchaseOrder.internal_notes ?? "",
    );
    if (response === null) return;
    try {
      await purchaseOrderService.counter(poId, response);
      await reload();
      setNotice({
        tone: "success",
        message: "PO moved to countered status.",
      });
    } catch (err) {
      setNotice({
        tone: "error",
        message:
          err instanceof Error ? err.message : "Unable to counter this PO.",
      });
    }
  };

  const handleQueueForFulfillment = async () => {
    try {
      await purchaseOrderService.queueForFulfillment(poId);
      await reload();
      setNotice({
        tone: "success",
        message: "PO queued for fulfillment.",
      });
    } catch (err) {
      setNotice({
        tone: "error",
        message: err instanceof Error ? err.message : "Unable to queue PO.",
      });
    }
  };

  const handleFulfill = async () => {
    try {
      await purchaseOrderService.fulfill(poId);
      await reload();
      setNotice({
        tone: "success",
        message: "PO fulfilled and inventory committed.",
      });
    } catch (err) {
      setNotice({
        tone: "error",
        message: err instanceof Error ? err.message : "Unable to fulfill PO.",
      });
    }
  };

  const handleReject = async () => {
    try {
      await purchaseOrderService.reject(
        poId,
        "Cancelled from approval workspace.",
      );
      await reload();
      setNotice({
        tone: "success",
        message: "PO rejected and allocation released.",
      });
    } catch (err) {
      setNotice({
        tone: "error",
        message: err instanceof Error ? err.message : "Unable to reject PO.",
      });
    }
  };

  function runAndClose(action: () => void) {
    if (actionsMenuRef.current) actionsMenuRef.current.open = false;
    action();
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
        title={
          isManufacturerPo
            ? getManufacturerDisplayName(
                data.purchaseOrder,
                data.purchaseOrder.vendors,
              )
            : (data.purchaseOrder.retailers?.name ??
              data.purchaseOrder.bill_to_company_name ??
              "Purchase Order")
        }
        description={
          isManufacturerPo
            ? `Manufacturing Order · ${getManufacturingOrderTitle(data.purchaseOrder)}`
            : `PO ${data.purchaseOrder.po_number} · ${data.purchaseOrder.po_type}${data.purchaseOrder.buyers?.buyer_name ? ` | ${data.purchaseOrder.buyers.buyer_name}` : ""}`
        }
        actions={
          <div className="btn-row">
            <StatusBadge label={data.purchaseOrder.status} />
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => runAndClose(() => openDrawer(poId, "edit"))}
            >
              Edit General Info
            </button>
            <details className="actions-dropdown" ref={actionsMenuRef}>
              <summary className="btn btn-secondary btn-small">Actions</summary>
              <div className="actions-dropdown-menu">
                <button
                  type="button"
                  onClick={() =>
                    runAndClose(() => navigate(`/purchase-orders/${poId}/edit`))
                  }
                >
                  Edit PO
                </button>
                <button
                  type="button"
                  onClick={() =>
                    runAndClose(() =>
                      navigate(`/purchase-orders/new?copyFrom=${poId}`),
                    )
                  }
                >
                  Duplicate PO
                </button>
                <button
                  type="button"
                  onClick={() =>
                    runAndClose(() => void handleConvertToInvoice())
                  }
                >
                  Convert to Invoice
                </button>
                <button
                  type="button"
                  onClick={() => runAndClose(handleEmailPo)}
                >
                  Email PO
                </button>
                {isManufacturerPo ? (
                  <>
                    <button
                      type="button"
                      disabled={paymentStatus === "Paid"}
                      onClick={() => runAndClose(() => void handleMarkAsPaid())}
                    >
                      Mark as Paid
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(data.purchaseOrder.ship_date)}
                      onClick={() =>
                        runAndClose(() => void handleMarkAsShipped())
                      }
                    >
                      Mark as Shipped
                    </button>
                    <button
                      type="button"
                      disabled={manufacturingStatus === "Received"}
                      onClick={() => runAndClose(() => setReceiving(true))}
                    >
                      Receive Inventory
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => runAndClose(() => void handleApprove())}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => runAndClose(() => void handleCounter())}
                    >
                      Counter
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        runAndClose(() => void handleQueueForFulfillment())
                      }
                    >
                      Queue for Fulfillment
                    </button>
                    <button
                      type="button"
                      onClick={() => runAndClose(() => void handleFulfill())}
                    >
                      Fulfill
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => runAndClose(() => void handleReject())}
                    >
                      Reject / Cancel
                    </button>
                  </>
                )}
              </div>
            </details>
          </div>
        }
      />
      <OrderSummaryCard
        heading={
          data.purchaseOrder.retailers?.name ??
          data.purchaseOrder.vendors?.name ??
          data.purchaseOrder.bill_to_company_name ??
          "Purchase Order"
        }
        metaLine={
          isManufacturerPo
            ? `Manufacturing Order · ${getManufacturingOrderTitle(data.purchaseOrder)}`
            : `PO ${data.purchaseOrder.po_number} · ${data.purchaseOrder.po_type}${data.purchaseOrder.buyers?.buyer_name ? ` | ${data.purchaseOrder.buyers.buyer_name}` : ""}`
        }
        statusControl={
          <div className="cell-stack">
            <StatusBadge
              label={
                isManufacturerPo
                  ? manufacturingStatus
                  : data.purchaseOrder.status
              }
            />
            {!isManufacturerPo &&
            EDITABLE_PO_STATUSES.includes(data.purchaseOrder.status) ? (
              <select
                disabled={statusUpdating}
                value=""
                onChange={(event) =>
                  void handleStatusChange(event.target.value)
                }
              >
                <option value="">Change status...</option>
                {EDITABLE_PO_STATUSES.filter(
                  (status) => status !== data.purchaseOrder.status,
                ).map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            ) : !isManufacturerPo ? (
              <span className="helper-text">
                Use Approve/Fulfill/Reject for this status — they update
                inventory too.
              </span>
            ) : null}
          </div>
        }
        fields={
          isManufacturerPo
            ? [
                {
                  label: "Ordered",
                  value: formatDate(data.purchaseOrder.order_date),
                },
                {
                  label: "Expected Ship",
                  value: formatDate(data.purchaseOrder.ship_date),
                },
                {
                  label: "Expected Arrival",
                  value: formatDate(
                    data.purchaseOrder.eta_date ??
                      data.purchaseOrder.expected_delivery_date,
                  ),
                },
                {
                  label: "Received Date",
                  value: data.purchaseOrder.actual_delivery_date
                    ? formatDate(data.purchaseOrder.actual_delivery_date)
                    : "Not yet received",
                },
                {
                  label: "Payment Status",
                  value: <StatusBadge label={paymentStatus} />,
                },
                { label: "Total Units", value: data.purchaseOrder.total_units },
                {
                  label: "Total Cost",
                  value: formatCurrency(data.purchaseOrder.total_cost),
                },
                {
                  label: "Inventory Impact",
                  value: <InventoryImpactList lineItems={data.lineItems} />,
                },
              ]
            : [
                {
                  label: "Created",
                  value: formatDate(data.purchaseOrder.order_date),
                },
                {
                  label: "Needed By",
                  value: formatDate(
                    data.purchaseOrder.eta_date ??
                      data.purchaseOrder.expected_delivery_date,
                  ),
                },
                {
                  label: "Payment Status",
                  value: (
                    <StatusBadge
                      label={data.purchaseOrder.invoice_status ?? "Open"}
                    />
                  ),
                },
                {
                  label: "Fulfillment Status",
                  value: (
                    <StatusBadge label={data.purchaseOrder.allocation_status} />
                  ),
                },
                { label: "Total Units", value: data.purchaseOrder.total_units },
                {
                  label: "Total Cost",
                  value: formatCurrency(data.purchaseOrder.total_cost),
                },
                {
                  label: "Paid to Delivered",
                  value:
                    paidToDeliveredDays !== null
                      ? `${paidToDeliveredDays}d`
                      : "Open",
                },
              ]
        }
      />
      <div className="wizard-steps" role="tablist" aria-label="Purchase order detail sections">
        {DETAIL_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`wizard-step${activeTab === tab.id ? " is-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="wizard-step-label">{tab.label}</span>
          </button>
        ))}
      </div>
      {activeTab === "preview" ? (
      <div className="panel">
        <div className="panel-header">
          <h3>PO Preview</h3>
          <div className="btn-row">
            {isManufacturerPo ? (
              <>
                {data.lineItems.some(
                  (l) => l.mockup_file_ref || l.artwork_file_ref,
                ) ? (
                  <button
                    className="btn btn-ghost btn-small"
                    disabled={downloading}
                    onClick={async () => {
                      setDownloading(true);
                      try {
                        await downloadManufacturerFilesZip(
                          data.lineItems,
                          data.purchaseOrder.po_number ?? "PO",
                        );
                      } finally {
                        setDownloading(false);
                      }
                    }}
                  >
                    {downloading ? "Zipping…" : "Download Files"}
                  </button>
                ) : null}
                <button
                  className="btn btn-ghost btn-small"
                  disabled={exporting}
                  onClick={() => {
                    setExporting(true);
                    try {
                      exportPoLineItemsExcel(
                        data.lineItems,
                        data.purchaseOrder,
                      );
                    } finally {
                      setExporting(false);
                    }
                  }}
                >
                  {exporting ? "Exporting…" : "Export Excel"}
                </button>
                <button
                  className="btn btn-ghost btn-small"
                  onClick={() => {
                    const text = buildManufacturerOrderText(
                      data.purchaseOrder,
                      data.lineItems,
                      sockCards ?? [],
                    );
                    void navigator.clipboard.writeText(text).then(() => {
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1400);
                    });
                  }}
                >
                  {copied ? "Copied ✓" : "Copy Text"}
                </button>
              </>
            ) : (
              <button
                className="btn btn-secondary btn-small"
                onClick={() => {
                  printPurchaseOrderDocument(
                    `PO ${data.purchaseOrder.po_number}`,
                    currentDocumentHtml,
                  );
                }}
              >
                Print / Save PDF
              </button>
            )}
          </div>
        </div>
        {isManufacturerPo ? (
          <ManufacturerPoDocumentView
            purchaseOrder={data.purchaseOrder}
            lineItems={data.lineItems}
          />
        ) : (
          <PurchaseOrderDocumentView
            purchaseOrder={data.purchaseOrder}
            lineItems={data.lineItems}
          />
        )}
      </div>
      ) : null}
      {activeTab === "overview" ? (
      <>
      <div className="panel section-stack">
        <div className="panel-header">
          <h3>Lifecycle</h3>
        </div>
        <div className="detail-grid">
          {(
            [
              {
                label: "Retailer",
                value: data.purchaseOrder.retailers?.name ?? "N/A",
                show: Boolean(data.purchaseOrder.retailers?.name),
              },
              {
                label: "Buyer",
                value: data.purchaseOrder.buyers?.buyer_name ?? "N/A",
                show: Boolean(data.purchaseOrder.buyers?.buyer_name),
              },
              {
                label: "Vendor",
                value: data.purchaseOrder.vendors?.name ?? "N/A",
                show: Boolean(data.purchaseOrder.vendors?.name),
              },
              {
                label: "Ship Date",
                value: formatDate(data.purchaseOrder.ship_date),
                show: Boolean(data.purchaseOrder.ship_date),
              },
              {
                label: "ETA",
                value: formatDate(
                  data.purchaseOrder.eta_date ??
                    data.purchaseOrder.expected_delivery_date,
                ),
                show: Boolean(
                  data.purchaseOrder.eta_date ??
                    data.purchaseOrder.expected_delivery_date,
                ),
              },
              {
                label: "Approval",
                value: data.purchaseOrder.approval_status,
                show: true,
              },
              {
                label: "Allocation",
                value: data.purchaseOrder.allocation_status,
                show: true,
              },
              {
                label: "Invoice Status",
                value: data.purchaseOrder.invoice_status ?? "Open",
                show: true,
              },
              {
                label: "Invoice Paid",
                value: formatDate(data.purchaseOrder.invoice_paid_at),
                show: Boolean(data.purchaseOrder.invoice_paid_at),
              },
              {
                label: "Shipment Status",
                value:
                  data.purchaseOrder.shipment_status ??
                  data.purchaseOrder.tracking_status ??
                  "None",
                show: Boolean(
                  data.purchaseOrder.shipment_status ??
                    data.purchaseOrder.tracking_status,
                ),
              },
              {
                label: "Tracking",
                value: data.purchaseOrder.tracking_number ?? "None",
                show: Boolean(data.purchaseOrder.tracking_number),
              },
              {
                label: "Source Channel",
                value: data.purchaseOrder.source_channel ?? "N/A",
                show: Boolean(data.purchaseOrder.source_channel),
              },
              {
                label: "Generated Form",
                value: data.purchaseOrder.generated_form_url ? (
                  <a
                    href={data.purchaseOrder.generated_form_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open
                  </a>
                ) : (
                  "Not generated"
                ),
                show: Boolean(data.purchaseOrder.generated_form_url),
              },
              {
                label: "Counter Status",
                value: data.purchaseOrder.counter_status,
                show: true,
              },
              {
                label: "Compliance Snapshot",
                value: String(
                  (
                    data.purchaseOrder.compliance_snapshot as {
                      summary?: string;
                    } | null
                  )?.summary ?? "No compliance snapshot recorded.",
                ),
                show: Boolean(
                  (
                    data.purchaseOrder.compliance_snapshot as {
                      summary?: string;
                    } | null
                  )?.summary,
                ),
                wide: true,
              },
              {
                label: "Hold Reason",
                value: data.purchaseOrder.hold_reason ?? "No hold reason.",
                show: Boolean(data.purchaseOrder.hold_reason),
                wide: true,
              },
              {
                label: "Buyer Notes",
                value: data.purchaseOrder.buyer_notes ?? "No buyer notes added.",
                show: Boolean(data.purchaseOrder.buyer_notes),
                wide: true,
              },
              {
                label: "Internal Notes",
                value:
                  data.purchaseOrder.internal_notes ??
                  "No internal notes added.",
                show: Boolean(data.purchaseOrder.internal_notes),
                wide: true,
              },
              {
                label: "Notes",
                value: data.purchaseOrder.notes ?? "No notes added.",
                show: Boolean(data.purchaseOrder.notes),
                wide: true,
              },
            ] satisfies Array<{
              label: string;
              value: ReactNode;
              show: boolean;
              wide?: boolean;
            }>
          )
            .filter((field) => field.show)
            .map((field) => (
              <div
                className="detail-card"
                key={field.label}
                style={field.wide ? { gridColumn: "1 / -1" } : undefined}
              >
                <span>{field.label}</span>
                <strong>{field.value}</strong>
              </div>
            ))}
        </div>
      </div>
      <div className="panel section-stack">
        <div className="panel-header">
          <h3>PO Line Items</h3>
        </div>
        <DataTable
          columns={[
            {
              key: "product_name",
              title: "Product",
              width: "25%",
              render: (row) => (
                <ProductNameWithMetadata
                  product={row.products}
                  fallbackName={row.product_name}
                  fallbackSku={row.sku}
                />
              ),
            },
            {
              key: "case_quantity",
              title: "Cases",
              render: (row) => row.case_quantity,
            },
            {
              key: "quantity_ordered",
              title: "Ordered",
              render: (row) => row.quantity_ordered,
            },
            {
              key: "unit_quantity",
              title: "Units",
              render: (row) => row.unit_quantity,
            },
            {
              key: "quantity_received",
              title: "Received",
              render: (row) => row.quantity_received,
            },
            {
              key: "unit_cost",
              title: "Unit Cost",
              render: (row) => formatCurrency(row.unit_cost),
            },
            {
              key: "line_total",
              title: "Extended Cost",
              render: (row) =>
                formatCurrency(row.extended_cost || row.line_total),
            },
            {
              key: "inventory_status",
              title: "Inventory",
              render: (row) => {
                const product = row.products;
                if (!product) return <StatusBadge label="Unknown" />;
                const incoming =
                  reorderBySku.get(row.sku)?.incomingQuantity ?? 0;
                const tone = getInventoryHealthTone(
                  product.current_inventory,
                  [],
                  product.safety_stock ?? 0,
                );
                const riskStatus = getInventoryRiskStatus(
                  product.current_inventory,
                  tone,
                  incoming,
                );
                const label = riskStatus === "Safe" ? "In Stock" : riskStatus;
                if (!isManufacturerPo) return <StatusBadge label={label} />;
                const incomingFromThisOrder = Math.max(
                  Number(row.quantity_ordered ?? 0) -
                    Number(row.quantity_received ?? 0),
                  0,
                );
                const committed = Number(product.inventory_allocated ?? 0);
                return (
                  <div className="cell-stack">
                    <StatusBadge label={label} />
                    <span className="helper-text">
                      {getOversoldLabel(product.current_inventory) ??
                        `Current Stock: ${product.current_inventory}`}
                    </span>
                    <span className="helper-text">
                      Incoming From This Order: {incomingFromThisOrder}
                    </span>
                    <span className="helper-text">
                      Available After Incoming:{" "}
                      {getAvailableAfterIncoming(
                        product.current_inventory,
                        incoming,
                        committed,
                      )}
                    </span>
                  </div>
                );
              },
            },
          ]}
          rows={data.lineItems}
        />
      </div>
      </>
      ) : null}
      {activeTab === "fulfillment" ? (
      <>
      <div className="split-grid">
        <div className="panel section-stack">
          <div className="panel-header">
            <h3>Reservation Ledger</h3>
          </div>
          <div className="scroll-panel">
            <DataTable
              columns={[
                {
                  key: "product_id",
                  title: "Product",
                  render: (row) => row.product_id,
                },
                {
                  key: "reserved_units",
                  title: "Units",
                  render: (row) => row.reserved_units,
                },
                {
                  key: "status",
                  title: "Status",
                  render: (row) => <StatusBadge label={row.status} />,
                },
                {
                  key: "actor_label",
                  title: "Actor",
                  render: (row) => row.actor_label ?? "Buyer flow",
                },
                {
                  key: "updated_at",
                  title: "Updated",
                  render: (row) => formatDate(row.updated_at),
                },
              ]}
              rows={data.reservations}
              emptyMessage="No reservation records yet."
            />
          </div>
        </div>
        <div className="panel section-stack">
          <div className="panel-header">
            <h3>Status History</h3>
          </div>
          <div className="scroll-panel">
            <DataTable
              columns={[
                {
                  key: "from_status",
                  title: "From",
                  render: (row) => row.from_status ?? "N/A",
                },
                {
                  key: "to_status",
                  title: "To",
                  render: (row) => row.to_status,
                },
                {
                  key: "actor_label",
                  title: "Actor",
                  render: (row) => row.actor_label ?? "System",
                },
                {
                  key: "notes",
                  title: "Notes",
                  render: (row) => row.notes ?? "N/A",
                },
                {
                  key: "created_at",
                  title: "When",
                  render: (row) => formatDate(row.created_at),
                },
              ]}
              rows={data.statusHistory}
              emptyMessage="No status history yet."
            />
          </div>
        </div>
      </div>
      <div className="split-grid">
        <div className="panel section-stack">
          <div className="panel-header">
            <h3>Counter Workflow</h3>
          </div>
          <div className="timeline scroll-panel">
            {data.counterEvents.length ? (
              data.counterEvents.map((event) => (
                <div
                  key={event.id}
                  className={`timeline-item ${event.event_type === "countered" ? "timeline-item-danger" : ""}`}
                >
                  <strong>{formatCounterEventTitle(event)}</strong>
                  <p>{event.actor_label ?? "Buyer"}</p>
                  {formatCounterEventMeta(event) ? (
                    <p>{formatCounterEventMeta(event)}</p>
                  ) : null}
                  <p>{event.notes ?? "No note provided."}</p>
                  <span className="muted">{formatDate(event.created_at)}</span>
                </div>
              ))
            ) : (
              <div className="empty-state">No counter activity yet.</div>
            )}
          </div>
        </div>
        <div className="panel section-stack">
          <div className="panel-header">
            <h3>Compliance Holds</h3>
          </div>
          <div className="scroll-panel">
            <DataTable
              columns={[
                {
                  key: "summary",
                  title: "Summary",
                  render: (row) => row.summary,
                },
                {
                  key: "missing_docs",
                  title: "Missing Docs",
                  render: (row) => row.missing_docs.join(", ") || "None",
                },
                {
                  key: "status",
                  title: "Status",
                  render: (row) => <StatusBadge label={row.status} />,
                },
                {
                  key: "created_at",
                  title: "Created",
                  render: (row) => formatDate(row.created_at),
                },
              ]}
              rows={data.complianceHolds}
              emptyMessage="No compliance holds on this order."
            />
          </div>
        </div>
      </div>
      </>
      ) : null}
      {activeTab === "documents" ? (
      <div className="split-grid">
        <div className="panel section-stack">
          <div className="panel-header">
            <h3>Generated PO Documents</h3>
          </div>
          <DataTable
            columns={[
              { key: "title", title: "Title", render: (row) => row.title },
              {
                key: "created_by_label",
                title: "Created By",
                render: (row) => row.created_by_label ?? "System",
              },
              {
                key: "created_at",
                title: "Created",
                render: (row) => formatDate(row.created_at),
              },
            ]}
            rows={data.generatedDocuments}
            emptyMessage="No generated PO documents yet."
          />
        </div>
        <div className="panel section-stack">
          <div className="panel-header">
            <h3>Manufacturer / Retailer Comms</h3>
          </div>
          <div className="timeline">
            {data.messages.map((message) => (
              <div key={message.id} className="timeline-item">
                <strong>
                  {message.sender_name} | {message.channel}
                </strong>
                <p>{message.body}</p>
                <span className="muted">{formatDate(message.created_at)}</span>
              </div>
            ))}
          </div>
          <div className="form-grid">
            <div className="field field-half">
              <label>Sender</label>
              <input
                value={newMessage.sender_name}
                onChange={(event) =>
                  setNewMessage((current) => ({
                    ...current,
                    sender_name: event.target.value,
                  }))
                }
              />
            </div>
            <div className="field field-half">
              <label>Role</label>
              <input
                value={newMessage.sender_role}
                onChange={(event) =>
                  setNewMessage((current) => ({
                    ...current,
                    sender_role: event.target.value,
                  }))
                }
              />
            </div>
            <div className="field field-half">
              <label>Channel</label>
              <select
                value={newMessage.channel}
                onChange={(event) =>
                  setNewMessage((current) => ({
                    ...current,
                    channel: event.target.value,
                  }))
                }
              >
                <option>Email</option>
                <option>Text</option>
                <option>Call</option>
                <option>Internal Note</option>
              </select>
            </div>
            <div className="field field-wide">
              <label>Message</label>
              <textarea
                rows={3}
                value={newMessage.body}
                onChange={(event) =>
                  setNewMessage((current) => ({
                    ...current,
                    body: event.target.value,
                  }))
                }
              />
            </div>
          </div>
          <div className="btn-row">
            <button
              className="btn btn-primary"
              onClick={async () => {
                await purchaseOrderService.saveMessage({
                  purchase_order_id: poId,
                  sender_name: newMessage.sender_name,
                  sender_role: newMessage.sender_role || null,
                  channel: newMessage.channel as
                    | "Email"
                    | "Text"
                    | "Call"
                    | "Internal Note",
                  body: newMessage.body,
                });
                setNewMessage({
                  sender_name: "",
                  sender_role: "",
                  channel: "Internal Note",
                  body: "",
                });
                await reload();
              }}
            >
              Add Communication
            </button>
          </div>
        </div>
        <div className="panel section-stack">
          <div className="panel-header">
            <h3>Documents</h3>
          </div>
          <div className="timeline">
            {data.documents.map((document) => (
              <div key={document.id} className="timeline-item">
                <strong>{document.title}</strong>
                <p>{document.document_type}</p>
                <span className="muted">{formatDate(document.created_at)}</span>
                {document.file_url ? (
                  <a href={document.file_url} target="_blank" rel="noreferrer">
                    Open file
                  </a>
                ) : null}
              </div>
            ))}
          </div>
          <div className="form-grid">
            <div className="field field-half">
              <label>Document Type</label>
              <select
                value={newDocument.document_type}
                onChange={(event) =>
                  setNewDocument((current) => ({
                    ...current,
                    document_type: event.target.value,
                  }))
                }
              >
                <option>Retailer Intake</option>
                <option>Generated Form</option>
                <option>Invoice</option>
                <option>Tracking</option>
                <option>Other</option>
              </select>
            </div>
            <div className="field field-half">
              <label>Title</label>
              <input
                value={newDocument.title}
                onChange={(event) =>
                  setNewDocument((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </div>
            <div className="field field-wide">
              <label>File URL</label>
              <input
                value={newDocument.file_url}
                onChange={(event) =>
                  setNewDocument((current) => ({
                    ...current,
                    file_url: event.target.value,
                  }))
                }
              />
            </div>
          </div>
          <div className="btn-row">
            <button
              className="btn btn-primary"
              onClick={async () => {
                await purchaseOrderService.saveDocument({
                  purchase_order_id: poId,
                  document_type: newDocument.document_type as
                    | "Retailer Intake"
                    | "Generated Form"
                    | "Invoice"
                    | "Tracking"
                    | "Other",
                  title: newDocument.title,
                  file_url: newDocument.file_url || null,
                });
                setNewDocument({
                  document_type: "Other",
                  title: "",
                  file_url: "",
                });
                await reload();
              }}
            >
              Attach Document
            </button>
          </div>
        </div>
      </div>
      ) : null}
      {activeTab === "activity" ? (
      <div className="split-grid">
        <div className="panel section-stack">
          <div className="panel-header">
            <h3>Queued Notifications</h3>
          </div>
          <div className="timeline">
            {data.notifications.length ? (
              data.notifications.map((notification) => (
                <div key={notification.id} className="timeline-item">
                  <strong>{notification.subject}</strong>
                  <p>
                    {notification.recipient_type} · {notification.status}
                  </p>
                  <span className="muted">
                    {notification.recipient_email ??
                      notification.recipient_name ??
                      "Internal queue"}
                  </span>
                </div>
              ))
            ) : (
              <div className="empty-state">No queued notifications yet.</div>
            )}
          </div>
        </div>
        <div className="panel section-stack">
          <div className="panel-header">
            <h3>Activity Timeline</h3>
          </div>
          <div className="timeline">
            {data.activity.map((event) => (
              <div key={event.id} className="timeline-item">
                <strong>{event.title}</strong>
                <p>{event.description}</p>
                <span className="muted">{formatDate(event.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
        <CommentsPanel
          entityType="purchase_order"
          entityId={poId}
          comments={data.comments}
          onSaved={reload}
        />
      </div>
      ) : null}
      {receiving ? (
        <ReceiveInventoryModal
          purchaseOrder={data.purchaseOrder}
          lineItems={data.lineItems}
          locations={locations ?? []}
          onClose={() => setReceiving(false)}
          onConfirm={async (lines) => {
            try {
              await purchaseOrderService.receiveInventory(poId, lines);
              setReceiving(false);
              await reload();
              setNotice({
                tone: "success",
                message: "Inventory received successfully.",
              });
            } catch (err) {
              setNotice({
                tone: "error",
                message:
                  err instanceof Error
                    ? err.message
                    : "Unable to receive inventory.",
              });
            }
          }}
        />
      ) : null}
      <PurchaseOrderDrawer
        purchaseOrderId={drawerPoId}
        open={drawerOpen}
        mode={drawerMode}
        canEdit={Boolean(user)}
        onClose={closeDrawer}
        onSaved={() => void reload()}
        onDeleted={() => navigate("/purchase-orders")}
        onOpenFullPage={(id) => navigate(`/purchase-orders/${id}/edit`)}
        onDuplicate={(id) => navigate(`/purchase-orders/new?copyFrom=${id}`)}
        onConvertedToInvoice={(invoiceId) => navigate(`/invoices/${invoiceId}`)}
      />
    </div>
  );
}
