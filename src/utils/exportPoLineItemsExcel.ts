import * as XLSX from "xlsx";
import type { PoLineItem, PurchaseOrder } from "@/types/domain";

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

function yn(val: boolean | null | undefined): string {
  if (val === true) return "Yes";
  if (val === false) return "No";
  return "";
}

function str(val: string | null | undefined): string {
  return val ?? "";
}

function num(val: number | null | undefined): number | string {
  return val ?? "";
}

export function exportPoLineItemsExcel(lines: PoLineItem[], purchaseOrder: PurchaseOrder): void {
  const rows = lines.map((line, index) => ({
    "Line #": (line.sort_order ?? index) + 1,
    "Product Name": str(line.product_name),
    "Variant": str(line.variant_label),
    "Colorway": str(line.pantone),
    "Construction": str(line.construction),
    "SKU": str(line.sku),
    "UPC": str(line.upc),
    "Box No": str(line.box_no),
    "Sock Size": str(line.sock_size),
    "Pack Pairs": num(line.pack_pairs),
    "Qty Ordered": num(line.quantity_ordered),
    "Unit Cost": num(line.unit_cost),
    "Extended Cost": num(line.extended_cost),
    "Unit Retail": num(line.unit_retail),
    "Extended Retail": num(line.extended_retail),
    "Barcode Required": yn(line.barcode_required),
    "Art Status": str(line.art_status),
    "Art Note": str(line.art_note),
    "Rib L/R": yn(line.rib_lr),
    "Toe": yn(line.toe),
    "Pattern": yn(line.pattern),
    "Signature": yn(line.signature),
    "Foot Text": str(line.foot_text),
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Line Items");

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = `MFR_PO_${sanitize(purchaseOrder.po_number ?? "PO")}_line_items.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(href);
}
