import Papa from "papaparse";
import type { NormalizedImportRow, PurchaseOrderStatus } from "@/types/domain";

export const STANDARD_FIELDS: Array<keyof NormalizedImportRow> = [
  "po_number",
  "vendor_name",
  "retailer_name",
  "location_name",
  "sku",
  "product_name",
  "quantity_ordered",
  "quantity_received",
  "unit_cost",
  "order_date",
  "ship_date",
  "eta_date",
  "expected_delivery_date",
  "actual_delivery_date",
  "status",
  "shipment_status",
  "invoice_status",
  "notes",
];

const headerAliases: Record<keyof NormalizedImportRow, string[]> = {
  po_number: ["po", "po number", "purchase order", "purchase_order", "ponumber"],
  vendor_name: ["vendor", "supplier", "vendor name", "manufacturer"],
  retailer_name: ["retailer", "account", "retailer/account", "customer", "ship to", "buyer"],
  location_name: ["location", "site", "warehouse", "facility"],
  sku: ["sku", "item sku", "product code", "part number", "item id", "upc", "barcode", "gtin", "style#"],
  product_name: ["product", "product name", "item", "description"],
  quantity_ordered: ["qty", "qty ordered", "quantity", "ordered qty", "quantity ordered"],
  quantity_received: ["qty received", "received qty", "quantity received"],
  unit_cost: ["cost", "unit cost", "unit price", "price", "unit_price"],
  order_date: ["order date", "date ordered", "po date"],
  ship_date: ["ship date", "ship_date", "ship window start"],
  eta_date: ["eta", "estimated arrival", "estimated delivery", "delivery eta"],
  expected_delivery_date: ["expected delivery", "expected delivery date", "cancel date", "cancel_date"],
  actual_delivery_date: ["delivered on", "actual delivery", "actual delivery date", "received date"],
  status: ["status", "po status", "shipment status"],
  shipment_status: ["shipment status", "shipping status", "tracking status"],
  invoice_status: ["invoice status", "invoice_state", "invoice stage"],
  notes: ["notes", "remarks", "comments", "memo"],
};

function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/[_-]+/g, " ");
}

function parseNumber(value: unknown) {
  const raw = String(value ?? "").replace(/[^0-9.-]/g, "");
  const number = Number(raw);
  return Number.isFinite(number) ? number : 0;
}

function parseDate(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function normalizeStatus(value: unknown): PurchaseOrderStatus {
  const text = String(value ?? "").trim().toLowerCase();
  if (text.includes("draft")) return "Draft";
  if (text.includes("transit")) return "In Transit";
  if (text.includes("partial")) return "Partially Received";
  if (text.includes("receive") || text.includes("delivered")) return "Received";
  if (text.includes("delay") || text.includes("late")) return "Delayed";
  if (text.includes("issue")) return "Issue Flagged";
  if (text.includes("close")) return "Closed";
  return "Ordered";
}

function normalizeInvoiceStatus(value: unknown): NormalizedImportRow["invoice_status"] {
  const text = String(value ?? "").trim().toLowerCase();
  if (text.includes("inventory")) return "Inventory in Route";
  if (text.includes("route") || text.includes("transit")) return "In Route";
  if (text.includes("ship")) return "Shipped";
  return "Open";
}

export function inferMapping(headers: string[]) {
  const mapping: Record<string, string> = {};

  for (const standardField of STANDARD_FIELDS) {
    const aliases = headerAliases[standardField];
    const detected = headers.find((header) => aliases.includes(normalizeHeader(header)));
    if (detected) {
      mapping[standardField] = detected;
    }
  }

  return mapping;
}

export function parseCsvFile(file: File) {
  return new Promise<{ headers: string[]; rows: Record<string, string>[] }>((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        resolve({
          headers: results.meta.fields ?? [],
          rows: results.data,
        });
      },
      error: reject,
    });
  });
}

export function normalizeRows(
  rows: Record<string, string>[],
  mapping: Record<string, string>,
) {
  return rows.map((row) => ({
    po_number: String(row[mapping.po_number] ?? "").trim(),
    vendor_name: String(row[mapping.vendor_name] ?? "").trim(),
    retailer_name: String(row[mapping.retailer_name] ?? "").trim(),
    location_name: String(row[mapping.location_name] ?? "").trim(),
    sku: String(row[mapping.sku] ?? "").trim(),
    product_name: String(row[mapping.product_name] ?? "").trim(),
    quantity_ordered: parseNumber(row[mapping.quantity_ordered]),
    quantity_received: parseNumber(row[mapping.quantity_received]),
    unit_cost: parseNumber(row[mapping.unit_cost]),
    order_date: parseDate(row[mapping.order_date]),
    ship_date: parseDate(row[mapping.ship_date]),
    eta_date: parseDate(row[mapping.eta_date]),
    expected_delivery_date: parseDate(row[mapping.expected_delivery_date]),
    actual_delivery_date: parseDate(row[mapping.actual_delivery_date]),
    status: normalizeStatus(row[mapping.status]),
    shipment_status: String(row[mapping.shipment_status] ?? row[mapping.status] ?? "").trim(),
    invoice_status: normalizeInvoiceStatus(row[mapping.invoice_status] ?? row[mapping.status]),
    notes: String(row[mapping.notes] ?? "").trim(),
  }));
}

export function validateNormalizedRows(rows: NormalizedImportRow[]) {
  const errors: Array<{ rowNumber: number; errorMessage: string }> = [];

  rows.forEach((row, index) => {
    if (!row.po_number) errors.push({ rowNumber: index + 2, errorMessage: "Missing PO number" });
    if (!row.vendor_name) errors.push({ rowNumber: index + 2, errorMessage: "Missing vendor name" });
    if (!row.sku) errors.push({ rowNumber: index + 2, errorMessage: "Missing SKU" });
    if (!row.product_name) errors.push({ rowNumber: index + 2, errorMessage: "Missing product name" });
    if (!row.order_date) errors.push({ rowNumber: index + 2, errorMessage: "Missing order date" });
    if (!row.retailer_name) errors.push({ rowNumber: index + 2, errorMessage: "Missing retailer/account" });
    if (row.quantity_ordered <= 0) errors.push({ rowNumber: index + 2, errorMessage: "Quantity ordered must be greater than zero" });
  });

  return errors;
}
