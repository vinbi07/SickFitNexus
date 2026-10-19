import { describe, expect, it } from "vitest";
import type { Invoice, InvoiceLineItem } from "@/types/domain";
import { buildInvoiceDocumentHtml, buildInvoiceDocumentModel } from "@/utils/purchaseOrderDocument";

// PO 4500894141: the hand-made sample invoice shipped this to DFW; the PO says San Antonio.
const invoice: Partial<Invoice> = {
  invoice_number: "24391",
  invoice_date: "2026-10-05",
  due_date: "2026-11-04",
  ship_date: "2026-10-09",
  customer_po_number: "4500894141",
  payment_terms_snapshot: "NT30 Net due in 30 days",
  bill_to_company_name: "The Paradies Shops LLC",
  bill_to_street: "2849 Paces Ferry Road SE",
  bill_to_city: "Atlanta",
  bill_to_state: "GA",
  bill_to_zip: "30339",
  ship_to_company_name: "9225 Paradies SAT",
  ship_to_street: "10000 John Saunders Bay 41",
  ship_to_city: "San Antonio",
  ship_to_state: "TX",
  ship_to_zip: "78216",
};

const lineItems: Array<Partial<InvoiceLineItem>> = [
  { product_name: "SF Texas Pink Socks", sku: "CRW-P01-LTD-TX-PNK", upc: "850065635187", quantity_ordered: 24, unit_cost: 8, extended_cost: 192 },
  { product_name: "Texas Grey Socks", sku: "CRW-P01-LTD-TX-GRY", upc: "850065635132", quantity_ordered: 24, unit_cost: 8, extended_cost: 192 },
  { product_name: "Texas Creme Socks", sku: "CRW-P01-LTD-TX-CRM", upc: "850065635026", quantity_ordered: 24, unit_cost: 8, extended_cost: 192 },
];

describe("invoice document", () => {
  it("builds the remit-style model from the invoice", () => {
    const model = buildInvoiceDocumentModel(invoice, lineItems);
    expect(model.invoiceDate).toBe("10/05/2026");
    expect(model.dueDate).toBe("11/04/2026");
    expect(model.terms).toBe("Net 30");
    expect(model.total).toBe(576);
    expect(model.billToLines[0]).toBe("The Paradies Shops LLC");
    expect(model.shipToLines).toEqual([
      "The Paradies Shops LLC",
      "9225 Paradies SAT",
      "10000 John Saunders Bay 41",
      "San Antonio, TX 78216",
    ]);
  });

  it("renders the customer PO number, UPCs and escapes values", () => {
    const html = buildInvoiceDocumentHtml({ ...invoice, ship_to_company_name: "<script>x</script>" }, lineItems);
    expect(html).toContain("PO# <strong>4500894141</strong>");
    expect(html).toContain("UPC: 850065635132");
    expect(html).toContain("$576.00");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("Look Book");
  });
});
