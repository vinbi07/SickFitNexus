import type { Buyer, Invoice, InvoiceLineItem, PoLineItem, PurchaseOrder, Retailer } from "@/types/domain";

export type PurchaseOrderDocumentLine = {
  index: number;
  sku: string;
  description: string;
  upc: string;
  unit: string;
  quantity: number;
  unitCost: number;
  extendedCost: number;
  unitRetail: number;
  extendedRetail: number;
};

export type PurchaseOrderDocumentModel = {
  logoSrc: string;
  banner: string;
  documentTitle: string;
  numberLabel: string;
  poNumber: string;
  orderDate: string;
  startShipDate: string;
  shipCompleteDate: string;
  currency: string;
  billToName: string;
  billToLines: string[];
  shipToName: string;
  shipToLines: string[];
  paymentTerms: string;
  buyerName: string;
  approverName: string;
  lines: PurchaseOrderDocumentLine[];
  totalUnits: number;
  totalGrossCost: number;
  totalCost: number;
  totalRetail: number;
  notes: string;
  footerLabel: string;
};

export function formatPoDate(value: string | null | undefined) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function formatPoCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function compactLines(...values: Array<string | null | undefined>) {
  return values
    .flatMap((value) => String(value ?? "").split(/\r?\n/))
    .map((value) => value.trim())
    .filter(Boolean);
}

function escapeHtml(value: string | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildPurchaseOrderDocumentModel(
  purchaseOrder: Partial<PurchaseOrder>,
  lineItems: Array<Partial<PoLineItem>>,
  buyer?: Buyer | null,
  retailer?: Retailer | null,
  overrides?: { documentTitle?: string; numberLabel?: string; poNumber?: string },
): PurchaseOrderDocumentModel {
  const submittedDate = purchaseOrder.submitted_at ?? purchaseOrder.order_date ?? purchaseOrder.created_at ?? null;
  const submittedDateLabel = formatPoDate(submittedDate);
  const billToName = purchaseOrder.bill_to_company_name ?? buyer?.company_name ?? retailer?.name ?? "Retailer Account";
  const shipToName = purchaseOrder.ship_to_company_name ?? buyer?.company_name ?? retailer?.name ?? "Retailer Account";
  const buyerName = purchaseOrder.buyer_name_snapshot ?? buyer?.buyer_name ?? "Buyer";
  const approverName = purchaseOrder.approver_name_snapshot ?? purchaseOrder.approved_by ?? retailer?.name ?? "Pending approval";
  const lineModels = lineItems.map((item, index) => ({
    index: index + 1,
    sku: String(item.sku ?? "N/A"),
    description: String(item.description ?? item.product_name ?? "Product"),
    upc: String(item.upc ?? "N/A"),
    unit: String(item.unit ?? "EA"),
    quantity: Number(item.unit_quantity ?? item.quantity_ordered ?? 0),
    unitCost: Number(item.unit_cost ?? 0),
    extendedCost: Number(item.extended_cost ?? item.line_total ?? 0),
    unitRetail: Number(item.unit_retail ?? 0),
    extendedRetail: Number(item.extended_retail ?? 0),
  }));

  return {
    logoSrc: "/assets/SickFit Logo.png",
    banner: submittedDateLabel
      ? `Auto-generated · ${buyerName} submitted via Look Book on ${submittedDateLabel}`
      : `Auto-generated · ${buyerName} submitted via Look Book`,
    documentTitle: overrides?.documentTitle ?? "Purchase Order",
    numberLabel: overrides?.numberLabel ?? "PO Number",
    poNumber: overrides?.poNumber ?? String(purchaseOrder.po_number ?? "Pending"),
    orderDate: formatPoDate(purchaseOrder.order_date),
    startShipDate: formatPoDate(purchaseOrder.start_ship_date ?? purchaseOrder.ship_date),
    shipCompleteDate: formatPoDate(purchaseOrder.ship_complete_date ?? purchaseOrder.expected_delivery_date),
    currency: String(purchaseOrder.currency_code ?? "USD"),
    billToName,
    billToLines: compactLines(
      purchaseOrder.bill_to_contact_name ? `${purchaseOrder.bill_to_contact_name}, Buyer` : `${buyerName}, Buyer`,
      compactLines(
        purchaseOrder.bill_to_street,
        [purchaseOrder.bill_to_city, purchaseOrder.bill_to_state, purchaseOrder.bill_to_zip].filter(Boolean).join(", "),
      ).join("\n"),
      purchaseOrder.bill_to_phone ?? buyer?.phone,
      purchaseOrder.bill_to_email ?? buyer?.buyer_email,
    ),
    shipToName,
    shipToLines: compactLines(
      `Attn: ${purchaseOrder.ship_to_attention ?? buyerName}`,
      compactLines(
        purchaseOrder.ship_to_street,
        [purchaseOrder.ship_to_city, purchaseOrder.ship_to_state, purchaseOrder.ship_to_zip].filter(Boolean).join(", "),
      ).join("\n"),
      purchaseOrder.ship_to_phone ?? buyer?.phone,
      buyer?.compliance_requirements ? `Compliance: ${buyer.compliance_requirements}` : null,
    ),
    paymentTerms: purchaseOrder.payment_terms_snapshot ?? buyer?.payment_terms ?? retailer?.default_payment_terms ?? "Terms pending",
    buyerName,
    approverName,
    lines: lineModels,
    totalUnits: Number(purchaseOrder.total_units ?? lineModels.reduce((sum, item) => sum + item.quantity, 0)),
    totalGrossCost: lineModels.reduce((sum, item) => sum + item.extendedCost, 0),
    totalCost: Number(purchaseOrder.subtotal ?? purchaseOrder.total_cost ?? lineModels.reduce((sum, item) => sum + item.extendedCost, 0)),
    totalRetail: Number(purchaseOrder.total_retail ?? lineModels.reduce((sum, item) => sum + item.extendedRetail, 0)),
    notes: String(purchaseOrder.buyer_notes ?? purchaseOrder.notes ?? "No notes / special instructions provided."),
    footerLabel: `SICKFIT × ${String(retailer?.name ?? billToName).toUpperCase()} · CONFIDENTIAL`,
  };
}

// ─── Manufacturer PO document (mirrors exportPoLineItemsExcel column layout) ──

export type ManufacturerPoDocumentLine = {
  index: number;
  productName: string;
  variant: string;
  colorway: string;
  construction: string;
  sku: string;
  upc: string;
  boxNo: string;
  sockSize: string;
  packPairs: number | string;
  qtyOrdered: number | string;
  unitCost: number | string;
  extendedCost: number | string;
  unitRetail: number | string;
  extendedRetail: number | string;
  barcodeRequired: string;
  artStatus: string;
  artNote: string;
  ribLr: string;
  toe: string;
  pattern: string;
  signature: string;
  footText: string;
};

export type ManufacturerPoDocumentModel = {
  logoSrc: string;
  documentTitle: string;
  numberLabel: string;
  poNumber: string;
  orderDate: string;
  startShipDate: string;
  shipCompleteDate: string;
  currency: string;
  lines: ManufacturerPoDocumentLine[];
  totalPairs: number;
  totalGoodsCost: number;
  notes: string;
  footerLabel: string;
};

function mfrYn(val: boolean | null | undefined): string {
  if (val === true) return "Yes";
  if (val === false) return "No";
  return "";
}

function mfrStr(val: string | null | undefined): string {
  return val ?? "";
}

function mfrNum(val: number | null | undefined): number | string {
  return val ?? "";
}

export function buildManufacturerPoDocumentModel(
  purchaseOrder: Partial<PurchaseOrder>,
  lineItems: Array<Partial<PoLineItem>>,
): ManufacturerPoDocumentModel {
  const lines: ManufacturerPoDocumentLine[] = lineItems.map((line, index) => ({
    index: (line.sort_order ?? index) + 1,
    productName: mfrStr(line.product_name),
    variant: mfrStr(line.variant_label),
    colorway: mfrStr(line.pantone),
    construction: mfrStr(line.construction),
    sku: mfrStr(line.sku),
    upc: mfrStr(line.upc),
    boxNo: mfrStr(line.box_no),
    sockSize: mfrStr(line.sock_size),
    packPairs: mfrNum(line.pack_pairs),
    qtyOrdered: mfrNum(line.quantity_ordered),
    unitCost: mfrNum(line.unit_cost),
    extendedCost: mfrNum(line.extended_cost),
    unitRetail: mfrNum(line.unit_retail),
    extendedRetail: mfrNum(line.extended_retail),
    barcodeRequired: mfrYn(line.barcode_required),
    artStatus: mfrStr(line.art_status),
    artNote: mfrStr(line.art_note),
    ribLr: mfrYn(line.rib_lr),
    toe: mfrYn(line.toe),
    pattern: mfrYn(line.pattern),
    signature: mfrYn(line.signature),
    footText: mfrStr(line.foot_text),
  }));

  return {
    logoSrc: "/assets/SickFit Logo.png",
    documentTitle: "Manufacturer Production Order",
    numberLabel: "PO Number",
    poNumber: String(purchaseOrder.po_number ?? "Pending"),
    orderDate: formatPoDate(purchaseOrder.order_date),
    startShipDate: formatPoDate(purchaseOrder.start_ship_date ?? purchaseOrder.ship_date),
    shipCompleteDate: formatPoDate(purchaseOrder.ship_complete_date ?? purchaseOrder.expected_delivery_date),
    currency: String(purchaseOrder.currency_code ?? "USD"),
    lines,
    totalPairs: lineItems.reduce((sum, item) => sum + Number(item.quantity_ordered ?? 0), 0),
    totalGoodsCost: lineItems.reduce((sum, item) => sum + Number(item.quantity_ordered ?? 0) * Number(item.unit_cost ?? 0), 0),
    notes: String(purchaseOrder.internal_notes ?? purchaseOrder.notes ?? "No notes / special instructions provided."),
    footerLabel: "SICKFIT × FOSHAN LION KING · CONFIDENTIAL",
  };
}

export function getPurchaseOrderDocumentStyles() {
  return `
    .po-wrap{display:block;font-family:Copernicus,Georgia,serif;color:#111;padding:1px;box-sizing:border-box;}
    .po-banner{background:#5dcaa5;color:#0d3d2e;padding:8px 14px;border-radius:12px 12px 0 0;font-size:11px;letter-spacing:.04em;display:flex;align-items:center;gap:8px;}
    .po-doc{background:#fff;border:0.5px solid #ddd7cb;overflow:hidden;box-sizing:border-box;}
    .po-head{background:#fff;color:#111;padding:18px 22px;display:flex;justify-content:space-between;align-items:center;border-bottom:0.5px solid #e6e3da;}
    .po-head .l{display:flex;align-items:center;gap:14px;}
    .po-head .sf{width:58px;height:58px;display:grid;place-items:center;flex-shrink:0;}
    .po-head .sf img{max-width:100%;max-height:100%;object-fit:contain;display:block;}
    .po-head .title{font-size:18px;font-weight:700;letter-spacing:.18em;line-height:1;color:#111;}
    .po-head .titlesub{font-size:10px;color:#666;letter-spacing:.18em;text-transform:uppercase;margin-top:3px;}
    .po-head .r{text-align:right;font-size:10px;color:#666;line-height:1.5;letter-spacing:.04em;}
    .po-meta{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr .6fr;background:#f7f4ec;border-bottom:0.5px solid #e6e3da;}
    .po-meta>div{padding:9px 14px;border-right:0.5px solid #e6e3da;font-size:10px;}
    .po-meta>div:last-child{border-right:none;}
    .po-meta .lab,.po-addr .lab,.po-terms .lab,.po-notes .lab{color:#888;text-transform:uppercase;letter-spacing:.1em;font-size:9px;margin-bottom:2px;}
    .po-meta .val,.po-terms .val{color:#111;font-weight:600;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}
    .po-addr{display:grid;grid-template-columns:1fr 1fr;border-bottom:0.5px solid #e6e3da;}
    .po-addr>div{padding:12px 16px;border-right:0.5px solid #e6e3da;}
    .po-addr>div:last-child{border-right:none;}
    .po-addr .name{font-size:13px;font-weight:600;color:#111;margin-bottom:2px;}
    .po-addr .row{font-size:11px;color:#444;line-height:1.5;}
    .po-terms{display:grid;grid-template-columns:1fr 1.4fr 1.4fr;background:#fafaf7;border-bottom:0.5px solid #e6e3da;}
    .po-terms>div{padding:9px 16px;border-right:0.5px solid #e6e3da;}
    .po-terms>div:last-child{border-right:none;}
    .po-items{font-size:10px;}
    .po-table{width:100%;border-collapse:collapse;table-layout:fixed;border-right:0.5px solid #eee;box-sizing:border-box;}
    .po-table .col-n{width:24px;}
    .po-table .col-sku{width:92px;}
    .po-table .col-description{width:auto;}
    .po-table .col-upc{width:92px;}
    .po-table .col-unit{width:40px;}
    .po-table .col-qty{width:44px;}
    .po-table .col-money{width:70px;}
    .po-table .col-money-wide{width:78px;}
    .po-table thead th{padding:8px 6px;font-size:9px;letter-spacing:.08em;text-transform:uppercase;border-right:0.5px solid #e6e3da;border-bottom:0.5px solid #e6e3da;background:#f3f4f6;color:#111;font-weight:600;text-align:left;}
    .po-table thead th:last-child{border-right:none;}
    .po-table tbody tr:nth-child(even){background:#fafaf7;}
    .po-table tbody td{padding:8px 6px;font-size:10px;color:#222;border-right:0.5px solid #eee;border-bottom:0.5px solid #eee;line-height:1.3;vertical-align:top;overflow-wrap:anywhere;}
    .po-table tbody td:last-child{border-right:none;}
    .po-table tbody tr:last-child td{border-bottom:none;}
    .po-items .r{text-align:right;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}
    .po-items .code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:9px;color:#555;}
    .po-items .n{color:#888;text-align:center;}
    .po-totals{background:#fff;color:#111;padding:14px 22px;display:flex;justify-content:flex-end;gap:32px;border-top:0.5px solid #e6e3da;}
    .po-totals>div{text-align:right;}
    .po-totals .lab{font-size:9px;color:#888;letter-spacing:.14em;text-transform:uppercase;margin-bottom:3px;}
    .po-totals .val{font-size:18px;font-weight:600;color:#111;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}
    .po-totals .val.accent{color:#e24b4a;}
    .po-notes{padding:14px 22px;background:#fafaf7;border-top:0.5px solid #e6e3da;}
    .po-notes .note{font-size:11px;color:#444;line-height:1.5;}
    .po-foot{background:#fff;color:#888;padding:10px 22px;display:flex;justify-content:space-between;font-size:9px;letter-spacing:.1em;border-top:0.5px solid #e6e3da;}
    .mfr-doc-scroll{overflow-x:auto;}
    .mfr-doc-table{table-layout:auto;min-width:1400px;}
    .mfr-doc-table th,.mfr-doc-table td{white-space:nowrap;}
    .mfr-doc-table td.r,.mfr-doc-table th.r{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}
  `.trim();
}

export function getPurchaseOrderDocumentFontStyles() {
  return `
    @font-face {
      font-family: "Copernicus";
      src: url("/fonts/CopernicusTrial-Book-BF66160450c2e92.ttf") format("truetype");
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: "Copernicus";
      src: url("/fonts/CopernicusTrial-Semibold-BF66160451692c7.ttf") format("truetype");
      font-weight: 600;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: "Copernicus";
      src: url("/fonts/CopernicusTrial-Bold-BF6616045097aac.ttf") format("truetype");
      font-weight: 700;
      font-style: normal;
      font-display: swap;
    }
  `.trim();
}

export function buildPurchaseOrderDocumentHtml(
  purchaseOrder: Partial<PurchaseOrder>,
  lineItems: Array<Partial<PoLineItem>>,
  buyer?: Buyer | null,
  retailer?: Retailer | null,
  overrides?: { documentTitle?: string; numberLabel?: string; poNumber?: string },
) {
  const model = buildPurchaseOrderDocumentModel(purchaseOrder, lineItems, buyer, retailer, overrides);
  const linesMarkup = model.lines.map((line) => `
    <tr>
      <td class="n">${line.index}</td>
      <td class="code">${escapeHtml(line.sku)}</td>
      <td>${escapeHtml(line.description)}</td>
      <td class="code">${escapeHtml(line.upc)}</td>
      <td class="r">${escapeHtml(line.unit)}</td>
      <td class="r">${line.quantity}</td>
      <td class="r">${escapeHtml(formatPoCurrency(line.unitCost))}</td>
      <td class="r">${escapeHtml(formatPoCurrency(line.extendedCost))}</td>
      <td class="r">${escapeHtml(formatPoCurrency(line.unitRetail))}</td>
      <td class="r">${escapeHtml(formatPoCurrency(line.extendedRetail))}</td>
    </tr>
  `).join("");

  return `
    <div class="po-wrap">
      <div class="po-doc">
        <div class="po-head">
          <div class="l">
            <div class="sf">
              <img src="${escapeHtml(model.logoSrc)}" alt="SickFit logo" />
            </div>
            <div>
              <div class="title">SICKFIT</div>
              <div class="titlesub">${escapeHtml(model.documentTitle)}</div>
            </div>
          </div>
          <div class="r">
            <div>1000 Ballpark Way</div>
            <div>Arlington, TX 76011</div>
            <div>sales@sickfitofficial.com</div>
          </div>
        </div>
        <div class="po-meta">
          <div><div class="lab">${escapeHtml(model.numberLabel)}</div><div class="val">${escapeHtml(model.poNumber)}</div></div>
          <div><div class="lab">Order Date</div><div class="val">${escapeHtml(model.orderDate)}</div></div>
          <div><div class="lab">Start Ship</div><div class="val">${escapeHtml(model.startShipDate)}</div></div>
          <div><div class="lab">Ship Complete</div><div class="val">${escapeHtml(model.shipCompleteDate)}</div></div>
          <div><div class="lab">Currency</div><div class="val">${escapeHtml(model.currency)}</div></div>
        </div>
        <div class="po-addr">
          <div>
            <div class="lab">Bill To</div>
            <div class="name">${escapeHtml(model.billToName)}</div>
            ${model.billToLines.map((line) => `<div class="row">${escapeHtml(line)}</div>`).join("")}
          </div>
          <div>
            <div class="lab">Ship To</div>
            <div class="name">${escapeHtml(model.shipToName)}</div>
            ${model.shipToLines.map((line) => `<div class="row">${escapeHtml(line)}</div>`).join("")}
          </div>
        </div>
        <div class="po-terms">
          <div><div class="lab">Payment Terms</div><div class="val">${escapeHtml(model.paymentTerms)}</div></div>
          <div><div class="lab">Buyer</div><div class="val">${escapeHtml(model.buyerName)}</div></div>
          <div><div class="lab">Approver</div><div class="val">${escapeHtml(model.approverName)}</div></div>
        </div>
        <div class="po-items">
          <table class="po-table">
            <colgroup>
              <col class="col-n" />
              <col class="col-sku" />
              <col class="col-description" />
              <col class="col-upc" />
              <col class="col-unit" />
              <col class="col-qty" />
              <col class="col-money" />
              <col class="col-money" />
              <col class="col-money" />
              <col class="col-money-wide" />
            </colgroup>
            <thead>
              <tr>
                <th>#</th>
                <th>SKU</th>
                <th>Description</th>
                <th>UPC</th>
                <th>Unit</th>
                <th class="r">Qty</th>
                <th class="r">Unit Cost</th>
                <th class="r">Ext. Cost</th>
                <th class="r"><strong>Suggested</strong> <strong>Retail</strong></th>
                <th class="r">Ext. Retail</th>
              </tr>
            </thead>
            <tbody>
              ${linesMarkup}
            </tbody>
          </table>
        </div>
        <div class="po-totals">
          <div><div class="lab">Total Units</div><div class="val">${model.totalUnits}</div></div>
          <div><div class="lab">Total Gross Cost</div><div class="val">${escapeHtml(formatPoCurrency(model.totalGrossCost))}</div></div>
          <div><div class="lab">Total Cost</div><div class="val">${escapeHtml(formatPoCurrency(model.totalCost))}</div></div>
          <div><div class="lab">Total Suggested Retail</div><div class="val accent">${escapeHtml(formatPoCurrency(model.totalRetail))}</div></div>
        </div>
        <div class="po-notes">
          <div class="lab">Notes / Special Instructions</div>
          <div class="note">${escapeHtml(model.notes)}</div>
        </div>
        <div class="po-foot">
          <span>${escapeHtml(model.footerLabel)}</span>
          <span>PAGE 1 OF 1</span>
        </div>
      </div>
    </div>
  `.trim();
}

// ─── Invoice document helpers ─────────────────────────────────────────────────
// Maps an Invoice to the shared PurchaseOrderDocumentModel using invoice-specific
// labels, then reuses all existing rendering logic.

function mapInvoiceToPo(invoice: Partial<Invoice>): Partial<PurchaseOrder> {
  return {
    po_number: invoice.invoice_number,
    vendor_id: invoice.vendor_id ?? null,
    retailer_id: invoice.retailer_id ?? null,
    buyer_id: invoice.buyer_id ?? null,
    location_id: invoice.location_id ?? null,
    order_date: invoice.order_date ?? null,
    ship_date: invoice.ship_date ?? null,
    start_ship_date: invoice.start_ship_date ?? null,
    ship_complete_date: invoice.ship_complete_date ?? null,
    eta_date: invoice.eta_date ?? null,
    expected_delivery_date: invoice.expected_delivery_date ?? null,
    actual_delivery_date: invoice.actual_delivery_date ?? null,
    submitted_at: invoice.submitted_at ?? null,
    bill_to_company_name: invoice.bill_to_company_name ?? null,
    bill_to_contact_name: invoice.bill_to_contact_name ?? null,
    bill_to_street: invoice.bill_to_street ?? null,
    bill_to_city: invoice.bill_to_city ?? null,
    bill_to_state: invoice.bill_to_state ?? null,
    bill_to_zip: invoice.bill_to_zip ?? null,
    bill_to_phone: invoice.bill_to_phone ?? null,
    bill_to_email: invoice.bill_to_email ?? null,
    ship_to_company_name: invoice.ship_to_company_name ?? null,
    ship_to_attention: invoice.ship_to_attention ?? null,
    ship_to_street: invoice.ship_to_street ?? null,
    ship_to_city: invoice.ship_to_city ?? null,
    ship_to_state: invoice.ship_to_state ?? null,
    ship_to_zip: invoice.ship_to_zip ?? null,
    ship_to_phone: invoice.ship_to_phone ?? null,
    payment_terms_snapshot: invoice.payment_terms_snapshot ?? null,
    buyer_name_snapshot: invoice.buyer_name_snapshot ?? null,
    approver_name_snapshot: invoice.approver_name_snapshot ?? null,
    subtotal: invoice.subtotal ?? 0,
    total_cost: invoice.total_cost ?? 0,
    total_units: invoice.total_units ?? 0,
    total_retail: invoice.total_retail ?? 0,
    currency_code: invoice.currency_code ?? "USD",
    notes: invoice.notes ?? null,
    buyer_notes: invoice.buyer_notes ?? null,
    vendors: invoice.vendors,
    retailers: invoice.retailers,
    buyers: invoice.buyers,
    locations: invoice.locations,
  };
}

function mapInvoiceLineItemsToPo(lineItems: Array<Partial<InvoiceLineItem>>): Array<Partial<PoLineItem>> {
  return lineItems.map((item) => ({
    id: item.id,
    sku: item.sku,
    upc: item.upc ?? null,
    product_name: item.product_name,
    variant_label: item.variant_label ?? null,
    description: item.description ?? null,
    unit: item.unit,
    case_pack_quantity: item.case_pack_quantity,
    case_quantity: item.case_quantity,
    unit_quantity: item.unit_quantity,
    quantity_ordered: item.quantity_ordered,
    unit_cost: item.unit_cost,
    unit_retail: item.unit_retail,
    line_total: item.line_total,
    extended_cost: item.extended_cost,
    extended_retail: item.extended_retail,
    sort_order: item.sort_order,
  }));
}

export function buildInvoiceDocumentModel(
  invoice: Partial<Invoice>,
  lineItems: Array<Partial<InvoiceLineItem>>,
  buyer?: Buyer | null,
  retailer?: Retailer | null,
): PurchaseOrderDocumentModel {
  return buildPurchaseOrderDocumentModel(
    mapInvoiceToPo(invoice),
    mapInvoiceLineItemsToPo(lineItems),
    buyer,
    retailer,
    { documentTitle: "Invoice", numberLabel: "Invoice Number" },
  );
}

export function buildInvoiceDocumentHtml(
  invoice: Partial<Invoice>,
  lineItems: Array<Partial<InvoiceLineItem>>,
  buyer?: Buyer | null,
  retailer?: Retailer | null,
): string {
  return buildPurchaseOrderDocumentHtml(
    mapInvoiceToPo(invoice),
    mapInvoiceLineItemsToPo(lineItems),
    buyer,
    retailer,
    { documentTitle: "Invoice", numberLabel: "Invoice Number" },
  );
}
