import type { Buyer, Location, PoLineItem, ProductBarcode, Product, Retailer } from "@/types/domain";

export type PoWizardLineItem = Partial<PoLineItem> & { tempId: string };

export type PoWizardHeader = {
  id?: string;
  po_number: string;
  vendor_id: string;
  retailer_id: string;
  buyer_id: string;
  location_id: string;
  order_date: string;
  start_ship_date: string;
  ship_complete_date: string;
  currency_code: string;
  bill_to_company_name: string;
  bill_to_contact_name: string;
  bill_to_street: string;
  bill_to_city: string;
  bill_to_state: string;
  bill_to_zip: string;
  bill_to_phone: string;
  bill_to_email: string;
  ship_to_company_name: string;
  ship_to_attention: string;
  ship_to_street: string;
  ship_to_city: string;
  ship_to_state: string;
  ship_to_zip: string;
  ship_to_phone: string;
  payment_terms_snapshot: string;
  buyer_name_snapshot: string;
  approver_name_snapshot: string;
  notes: string;
};

export type PoWizardState = {
  header: PoWizardHeader;
  lineItems: PoWizardLineItem[];
};

export type PoWizardAction =
  | { type: "SET_HEADER_FIELD"; field: keyof PoWizardHeader; value: string }
  | { type: "APPLY_RETAILER"; retailer: Retailer | null; buyer: Buyer | null; location: Location | null }
  | { type: "APPLY_BUYER"; buyer: Buyer | null }
  | { type: "APPLY_LOCATION"; location: Location | null }
  | { type: "COPY_BILL_TO_SHIP_TO" }
  | { type: "ADD_LINES_FROM_BARCODES"; barcodes: ProductBarcode[] }
  | { type: "UPDATE_LINE"; index: number; patch: Partial<PoWizardLineItem> }
  | { type: "REMOVE_LINE"; index: number }
  | { type: "RESET"; state: PoWizardState };

export const DEFAULT_PAYMENT_TERMS = ["Net 15", "Net 30", "Net 45", "Net 60"];

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function splitAddressParts(address: string | null | undefined) {
  const text = String(address ?? "").trim();
  if (!text) return { street: "", city: "", state: "", zip: "" };
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length >= 2) {
    const street = lines[0];
    const cityStateZip = lines[1].match(
      /^(.*?)(?:,\s*([A-Za-z]{2}))?(?:\s+(\d{5}(?:-\d{4})?))?$/,
    );
    return {
      street,
      city: cityStateZip?.[1]?.trim() ?? "",
      state: cityStateZip?.[2]?.trim() ?? "",
      zip: cityStateZip?.[3]?.trim() ?? "",
    };
  }
  return { street: text, city: "", state: "", zip: "" };
}

export function buildEmptyPoWizardHeader(poNumber: string): PoWizardHeader {
  return {
    po_number: poNumber,
    vendor_id: "",
    retailer_id: "",
    buyer_id: "",
    location_id: "",
    order_date: today(),
    start_ship_date: "",
    ship_complete_date: "",
    currency_code: "USD",
    bill_to_company_name: "",
    bill_to_contact_name: "",
    bill_to_street: "",
    bill_to_city: "",
    bill_to_state: "",
    bill_to_zip: "",
    bill_to_phone: "",
    bill_to_email: "",
    ship_to_company_name: "",
    ship_to_attention: "",
    ship_to_street: "",
    ship_to_city: "",
    ship_to_state: "",
    ship_to_zip: "",
    ship_to_phone: "",
    payment_terms_snapshot: "Net 30",
    buyer_name_snapshot: "",
    approver_name_snapshot: "",
    notes: "",
  };
}

export function buildEmptyPoLineItem(index: number): PoWizardLineItem {
  return {
    tempId: `line-${Date.now()}-${index}`,
    product_id: "",
    sku: "",
    upc: "",
    product_name: "",
    description: "",
    unit: "EA",
    quantity_ordered: 1,
    quantity_received: 0,
    unit_cost: 0,
    unit_retail: 0,
    extended_cost: 0,
    extended_retail: 0,
    unit_quantity: 1,
    sort_order: index,
    case_pack_quantity: 1,
    case_quantity: 1,
    variant_label: "",
  };
}

function normalizePoSku(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/--\d+$/, "")
    .trim();
}

function getLinkedBarcodeProduct(barcode: ProductBarcode) {
  return (
    (barcode.product_barcode_links ?? []).find((link) => link.products)
      ?.products ?? null
  );
}

export function buildPoLineItemFromBarcode(
  barcode: ProductBarcode,
  index: number,
): PoWizardLineItem {
  const product = getLinkedBarcodeProduct(barcode) as Product | null;
  const quantity = 1;
  const unitCost = Number(product?.wholesale_price || product?.unit_cost || 0);
  const unitRetail = Number(product?.unit_price || product?.msrp || 0);
  return {
    tempId: `line-${barcode.id}-${Date.now()}-${index}`,
    product_id: product?.id ?? null,
    sku: normalizePoSku(
      /^SF-\d+$/.test(String(barcode.sku ?? ""))
        ? product?.sku || barcode.sku
        : barcode.sku || product?.sku,
    ),
    upc: barcode.barcode_upc ?? product?.upc ?? "",
    product_name: barcode.product_name,
    description: barcode.product_name,
    variant_label: product?.variant_title ?? barcode.size ?? "",
    unit: barcode.pack_unit ?? product?.pack_unit ?? product?.pack_size ?? "EA",
    quantity_ordered: quantity,
    quantity_received: 0,
    unit_cost: unitCost,
    unit_retail: unitRetail,
    extended_cost: quantity * unitCost,
    extended_retail: quantity * unitRetail,
    unit_quantity: quantity,
    case_pack_quantity: Number(product?.case_pack_quantity ?? barcode.pack_quantity ?? 1),
    case_quantity: Number(barcode.pack_quantity ?? 1),
    sort_order: index,
  };
}

export function normalizePoWizardLineItems(items: PoWizardLineItem[]) {
  return items.map((item, index) => {
    const quantity = Number(item.quantity_ordered ?? 0);
    const unitCost = Number(item.unit_cost ?? 0);
    const unitRetail = Number(item.unit_retail ?? 0);
    return {
      ...item,
      quantity_ordered: quantity,
      unit_quantity: quantity,
      extended_cost: quantity * unitCost,
      extended_retail: quantity * unitRetail,
      sort_order: index,
    };
  });
}

export function createInitialPoWizardState(poNumber: string): PoWizardState {
  return {
    header: buildEmptyPoWizardHeader(poNumber),
    lineItems: [buildEmptyPoLineItem(0)],
  };
}

export function purchaseOrderWizardReducer(
  state: PoWizardState,
  action: PoWizardAction,
): PoWizardState {
  switch (action.type) {
    case "SET_HEADER_FIELD":
      return { ...state, header: { ...state.header, [action.field]: action.value } };

    case "APPLY_RETAILER": {
      const { retailer, buyer, location } = action;
      const billToAddress = buyer?.billing_address
        ? splitAddressParts(buyer.billing_address)
        : {
            street: retailer?.billing_street ?? "",
            city: retailer?.billing_city ?? "",
            state: retailer?.billing_state ?? "",
            zip: retailer?.billing_zip ?? "",
          };
      const shipToAddress = location?.address
        ? splitAddressParts(location.address)
        : buyer?.shipping_address
          ? splitAddressParts(buyer.shipping_address)
          : {
              street: retailer?.shipping_street ?? "",
              city: retailer?.shipping_city ?? "",
              state: retailer?.shipping_state ?? "",
              zip: retailer?.shipping_zip ?? "",
            };
      const current = state.header;
      return {
        ...state,
        header: {
          ...current,
          retailer_id: retailer?.id ?? "",
          buyer_id: buyer?.id ?? "",
          location_id: location?.id ?? "",
          bill_to_company_name:
            buyer?.company_name ?? retailer?.billing_company_name ?? retailer?.name ?? current.bill_to_company_name,
          bill_to_contact_name:
            buyer?.buyer_name ?? retailer?.billing_contact_name ?? retailer?.primary_contact_name ?? current.bill_to_contact_name,
          bill_to_street: billToAddress.street || current.bill_to_street,
          bill_to_city: billToAddress.city || current.bill_to_city,
          bill_to_state: billToAddress.state || current.bill_to_state,
          bill_to_zip: billToAddress.zip || current.bill_to_zip,
          bill_to_phone: buyer?.phone ?? retailer?.billing_phone ?? retailer?.primary_contact_phone ?? current.bill_to_phone,
          bill_to_email: buyer?.buyer_email ?? retailer?.billing_email ?? retailer?.primary_contact_email ?? current.bill_to_email,
          ship_to_company_name: location?.name ?? retailer?.shipping_company_name ?? retailer?.name ?? current.ship_to_company_name,
          ship_to_attention: buyer?.buyer_name ?? retailer?.shipping_attention ?? retailer?.primary_contact_name ?? current.ship_to_attention,
          ship_to_street: shipToAddress.street || current.ship_to_street,
          ship_to_city: shipToAddress.city || current.ship_to_city,
          ship_to_state: shipToAddress.state || current.ship_to_state,
          ship_to_zip: shipToAddress.zip || current.ship_to_zip,
          ship_to_phone: buyer?.phone ?? retailer?.shipping_phone ?? retailer?.primary_contact_phone ?? current.ship_to_phone,
          payment_terms_snapshot: buyer?.payment_terms ?? retailer?.default_payment_terms ?? current.payment_terms_snapshot,
          buyer_name_snapshot: buyer?.buyer_name ?? current.buyer_name_snapshot,
          approver_name_snapshot: retailer?.primary_contact_name ?? current.approver_name_snapshot,
        },
      };
    }

    case "APPLY_BUYER": {
      const { buyer } = action;
      const current = state.header;
      if (!buyer) return { ...state, header: { ...current, buyer_id: "" } };
      const address = splitAddressParts(buyer.billing_address);
      return {
        ...state,
        header: {
          ...current,
          buyer_id: buyer.id,
          retailer_id: buyer.retailer_id,
          bill_to_company_name: buyer.company_name || current.bill_to_company_name,
          bill_to_contact_name: buyer.buyer_name || current.bill_to_contact_name,
          bill_to_street: address.street || current.bill_to_street,
          bill_to_city: address.city || current.bill_to_city,
          bill_to_state: address.state || current.bill_to_state,
          bill_to_zip: address.zip || current.bill_to_zip,
          bill_to_phone: buyer.phone ?? current.bill_to_phone,
          bill_to_email: buyer.buyer_email || current.bill_to_email,
          payment_terms_snapshot: buyer.payment_terms ?? current.payment_terms_snapshot,
          buyer_name_snapshot: buyer.buyer_name || current.buyer_name_snapshot,
        },
      };
    }

    case "APPLY_LOCATION": {
      const { location } = action;
      const current = state.header;
      const address = splitAddressParts(location?.address);
      return {
        ...state,
        header: {
          ...current,
          location_id: location?.id ?? "",
          ship_to_company_name: location?.name ?? current.ship_to_company_name,
          ship_to_street: address.street || current.ship_to_street,
          ship_to_city: address.city || current.ship_to_city,
          ship_to_state: address.state || current.ship_to_state,
          ship_to_zip: address.zip || current.ship_to_zip,
        },
      };
    }

    case "COPY_BILL_TO_SHIP_TO": {
      const current = state.header;
      return {
        ...state,
        header: {
          ...current,
          ship_to_company_name: current.bill_to_company_name,
          ship_to_attention: current.bill_to_contact_name,
          ship_to_street: current.bill_to_street,
          ship_to_city: current.bill_to_city,
          ship_to_state: current.bill_to_state,
          ship_to_zip: current.bill_to_zip,
          ship_to_phone: current.bill_to_phone,
        },
      };
    }

    case "ADD_LINES_FROM_BARCODES": {
      const base = normalizePoWizardLineItems(state.lineItems).filter((item) =>
        String(item.product_name ?? "").trim(),
      );
      const additions = action.barcodes.map((barcode, index) =>
        buildPoLineItemFromBarcode(barcode, base.length + index),
      );
      return { ...state, lineItems: normalizePoWizardLineItems([...base, ...additions]) };
    }

    case "UPDATE_LINE":
      return {
        ...state,
        lineItems: normalizePoWizardLineItems(
          state.lineItems.map((line, index) => (index === action.index ? { ...line, ...action.patch } : line)),
        ),
      };

    case "REMOVE_LINE":
      return {
        ...state,
        lineItems: normalizePoWizardLineItems(state.lineItems.filter((_, index) => index !== action.index)),
      };

    case "RESET":
      return action.state;

    default:
      return state;
  }
}
