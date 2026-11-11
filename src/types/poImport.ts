// Shape returned by /api/po-import/extract. Values are as printed on the PO;
// cleanup and catalog matching happen in src/utils/poImportMatching.ts.

export interface ExtractedAddress {
  company: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

export interface ExtractedPoLine {
  line_number: string | null;
  retailer_item_number: string | null;
  vendor_style: string | null;
  description: string | null;
  upc: string | null;
  quantity: number;
  unit: string | null;
  unit_cost: number;
  unit_retail: number | null;
}

export interface ExtractedPurchaseOrder {
  po_number: string;
  order_date: string | null;
  start_ship_date: string | null;
  ship_complete_date: string | null;
  buyer_name: string | null;
  payment_terms_raw: string | null;
  currency: string | null;
  bill_to: ExtractedAddress;
  ship_to: ExtractedAddress & { store_code: string | null };
  additional_ship_to: string | null;
  lines: ExtractedPoLine[];
  total_cost: number | null;
  total_retail: number | null;
}

export interface PoExtractionResponse {
  purchase_orders: ExtractedPurchaseOrder[];
}
