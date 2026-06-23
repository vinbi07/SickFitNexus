import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { InlineErrorLog } from "@/components/InlineErrorLog";
import { LoadingState } from "@/components/LoadingState";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader } from "@/components/PageHeader";
import { PurchaseOrderDocumentView } from "@/components/PurchaseOrderDocumentView";
import { ManufacturerOrderGrid } from "@/components/orders/ManufacturerOrderGrid";
import { ManufacturerOrderCheckPanel } from "@/components/orders/ManufacturerOrderCheckPanel";
import { SockCardDrawPanel } from "@/components/orders/SockCardDrawPanel";
import { SendToTinaPreview } from "@/components/orders/SendToTinaPreview";
import { NewDesignModal } from "@/components/orders/NewDesignModal";
import type { ManufacturerBuilderLine } from "@/components/orders/ManufacturerOrderLineRow";
import { useAsyncData } from "@/hooks/useAsyncData";
import { buyerService } from "@/services/buyerService";
import { orderDesignService } from "@/services/orderDesignService";
import { purchaseOrderService } from "@/services/purchaseOrderService";
import { retailerService } from "@/services/retailerService";
import { sockCardService, calculateCardsUsed } from "@/services/sockCardService";
import { supportService } from "@/services/supportService";
import { vendorService } from "@/services/vendorService";
import type { OrderDesign, PoLineItem, Product, ProductBarcode, PurchaseOrder, SockCard } from "@/types/domain";
import { getUiErrorLog, type UiErrorLog } from "@/utils/errors";
import { formatCurrency } from "@/utils/format";
import { assertSupabase } from "@/lib/supabase";
import { buildManufacturerOrderHtml } from "@/utils/manufacturerOrderDocument";
import { hasStopIssues, validateManufacturerOrder } from "@/utils/manufacturerOrderValidation";
import { downloadManufacturerFilesZip } from "@/utils/downloadManufacturerFiles";

type BuilderLineItem = Partial<PoLineItem> & { tempId: string };

type BuilderState = {
  id?: string;
  po_number: string;
  vendor_id: string;
  retailer_id: string;
  buyer_id: string;
  location_id: string;
  po_type: PurchaseOrder["po_type"];
  status: PurchaseOrder["status"];
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

const DEFAULT_PAYMENT_TERMS = ["Net 15", "Net 30", "Net 45", "Net 60"];
const AUTOSAVE_PREFIX = "sickfit-po-builder";
const RECENT_PRODUCTS_KEY = "sickfit-po-recent-products";
const RECENT_RETAILERS_KEY = "sickfit-po-recent-retailers";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function buildEmptyLineItem(index: number): BuilderLineItem {
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

function buildEmptyMfrLine(index: number): ManufacturerBuilderLine {
  return {
    tempId: `mfr-${Date.now()}-${index}`,
    product_name: "",
    sku: "",
    upc: "",
    unit: "pairs",
    quantity_ordered: 0,
    quantity_received: 0,
    unit_cost: 1.89,
    unit_retail: 0,
    extended_cost: 0,
    extended_retail: 0,
    unit_quantity: 0,
    sort_order: index,
    case_pack_quantity: 1,
    case_quantity: 1,
    pack_pairs: 1,
    art_status: "NEEDED",
    rib_lr: true,
    toe: true,
    pattern: false,
    signature: false,
    barcode_required: false,
    box_no: "1",
    colorway: "",
  };
}

function buildLineFromDesign(design: Partial<OrderDesign>, sockCards: SockCard[], index: number): ManufacturerBuilderLine {
  const card = sockCards.find((c) => c.id === design.default_sock_card_id) ?? null;
  const quantity = 0;
  const unitCost = Number(design.exw_cost ?? 1.89);
  return {
    tempId: `design-${design.id ?? Date.now()}-${index}`,
    design_id: design.id ?? null,
    product_id: design.product_id ?? null,
    sku: "",
    upc: design.barcode ?? "",
    product_name: design.name ?? "",
    description: design.name ?? "",
    variant_label: design.colorway ?? "",
    colorway: design.colorway ?? "",
    hex: design.hex ?? "",
    unit: "pairs",
    quantity_ordered: quantity,
    quantity_received: 0,
    unit_cost: unitCost,
    unit_retail: Number(design.retail_price ?? 0),
    extended_cost: 0,
    extended_retail: 0,
    unit_quantity: quantity,
    case_pack_quantity: 1,
    case_quantity: 1,
    sort_order: index,
    spec_snapshot: design as Record<string, unknown>,
    sock_card_id: design.default_sock_card_id ?? null,
    pack_pairs: card?.pack_pairs ?? 1,
    sock_size: card?.size ?? null,
    construction: design.construction ?? card?.style ?? "Crew",
    cards_used: 0,
    box_no: "1",
    pantone: design.pantone ?? null,
    barcode_required: Boolean(design.barcode_required),
    art_status: design.art_status ?? "NEEDED",
    art_note: null,
    mockup_file_ref: design.mockup_file_ref ?? null,
    artwork_file_ref: design.art_file_ref ?? null,
    rib_lr: design.rib_lr ?? true,
    toe: design.toe ?? true,
    pattern: design.pattern ?? false,
    signature: design.signature ?? false,
    foot_text: design.foot_text ?? null,
  };
}

function buildEmptyBuilderState(poNumber: string): BuilderState {
  return {
    po_number: poNumber,
    vendor_id: "",
    retailer_id: "",
    buyer_id: "",
    location_id: "",
    po_type: "Retailer PO",
    status: "Draft",
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

function splitAddressParts(address: string | null | undefined) {
  const text = String(address ?? "").trim();
  if (!text) return { street: "", city: "", state: "", zip: "" };
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length >= 2) {
    const street = lines[0];
    const cityStateZip = lines[1].match(/^(.*?)(?:,\s*([A-Za-z]{2}))?(?:\s+(\d{5}(?:-\d{4})?))?$/);
    return {
      street,
      city: cityStateZip?.[1]?.trim() ?? "",
      state: cityStateZip?.[2]?.trim() ?? "",
      zip: cityStateZip?.[3]?.trim() ?? "",
    };
  }
  return { street: text, city: "", state: "", zip: "" };
}

function getLinkedBarcodeProduct(barcode: ProductBarcode) {
  return (barcode.product_barcode_links ?? []).find((link) => link.products)?.products ?? null;
}

function normalizePoSku(value: string | null | undefined) {
  return String(value ?? "").replace(/--\d+$/, "").trim();
}

function buildLineItemFromBarcode(barcode: ProductBarcode, index: number): BuilderLineItem {
  const product = getLinkedBarcodeProduct(barcode);
  const quantity = 1;
  const unitCost = Number(product?.wholesale_price || product?.unit_cost || 0);
  const unitRetail = Number(product?.unit_price || product?.msrp || 0);
  return {
    tempId: `line-${barcode.id}-${Date.now()}-${index}`,
    product_id: product?.id ?? null,
    sku: normalizePoSku(
      /^SF-\d+$/.test(String(barcode.sku ?? ""))
        ? (product?.sku || barcode.sku)
        : (barcode.sku || product?.sku)
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

function normalizeBuilderLineItems(items: BuilderLineItem[]) {
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

function readLocalList(key: string) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [] as string[];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map((value) => String(value)) : [];
  } catch {
    return [];
  }
}

function writeLocalList(key: string, values: string[]) {
  window.localStorage.setItem(key, JSON.stringify(values.slice(0, 8)));
}

export function PurchaseOrderBuilderPage() {
  const params = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = params.id ?? "";
  const duplicateFromId = searchParams.get("copyFrom") ?? "";
  const isEditMode = Boolean(editId);
  const autosaveKey = `${AUTOSAVE_PREFIX}:${isEditMode ? editId : duplicateFromId || "new"}`;
  const [purchaseOrder, setPurchaseOrder] = useState<BuilderState | null>(null);
  const [lineItems, setLineItems] = useState<BuilderLineItem[]>([]);
  const [mfrLines, setMfrLines] = useState<ManufacturerBuilderLine[]>([]);
  const [localSockCards, setLocalSockCards] = useState<SockCard[]>([]);
  const [showNewDesignModal, setShowNewDesignModal] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [activeProductIndex, setActiveProductIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [error, setError] = useState<UiErrorLog | null>(null);
  const initializedRef = useRef(false);
  const autosaveNoticeRef = useRef(false);

  const { data, loading, error: loadError } = useAsyncData(async () => {
    const [retailers, buyers, locations, products, vendors, catalogOptions, sockCards] = await Promise.all([
      retailerService.list(),
      buyerService.list(),
      supportService.listLocations(),
      supportService.listBarcodes(),
      vendorService.list(),
      orderDesignService.listCatalog(),
      sockCardService.listCards(),
    ]);
    const sourceDetail = editId
      ? await purchaseOrderService.getById(editId)
      : duplicateFromId
        ? await purchaseOrderService.getById(duplicateFromId)
        : null;
    const poNumber = editId ? sourceDetail?.purchaseOrder.po_number ?? "" : await purchaseOrderService.generatePoNumber();
    return { retailers, buyers, locations, barcodes: products, vendors, sourceDetail, poNumber, catalogOptions, sockCards };
  }, [editId, duplicateFromId]);

  useEffect(() => {
    if (loading || !data || initializedRef.current) return;

    setLocalSockCards(data.sockCards);

    const draft = !editId ? window.localStorage.getItem(autosaveKey) : null;
    if (draft) {
      try {
        const parsed = JSON.parse(draft) as { purchaseOrder: BuilderState; lineItems: BuilderLineItem[] };
        setPurchaseOrder(parsed.purchaseOrder);
        setLineItems(parsed.lineItems.length ? normalizeBuilderLineItems(parsed.lineItems) : [buildEmptyLineItem(0)]);
        initializedRef.current = true;
        autosaveNoticeRef.current = true;
        return;
      } catch {
        window.localStorage.removeItem(autosaveKey);
      }
    }

    if (data.sourceDetail?.purchaseOrder) {
      const source = data.sourceDetail.purchaseOrder;
      setPurchaseOrder({
        id: editId ? source.id : undefined,
        po_number: editId ? source.po_number : data.poNumber,
        vendor_id: source.vendor_id ?? "",
        retailer_id: source.retailer_id ?? "",
        buyer_id: source.buyer_id ?? "",
        location_id: source.location_id ?? "",
        po_type: source.po_type,
        status: editId ? source.status : "Draft",
        order_date: source.order_date ?? today(),
        start_ship_date: source.start_ship_date ?? "",
        ship_complete_date: source.ship_complete_date ?? "",
        currency_code: source.currency_code ?? "USD",
        bill_to_company_name: source.bill_to_company_name ?? "",
        bill_to_contact_name: source.bill_to_contact_name ?? "",
        bill_to_street: source.bill_to_street ?? "",
        bill_to_city: source.bill_to_city ?? "",
        bill_to_state: source.bill_to_state ?? "",
        bill_to_zip: source.bill_to_zip ?? "",
        bill_to_phone: source.bill_to_phone ?? "",
        bill_to_email: source.bill_to_email ?? "",
        ship_to_company_name: source.ship_to_company_name ?? "",
        ship_to_attention: source.ship_to_attention ?? "",
        ship_to_street: source.ship_to_street ?? "",
        ship_to_city: source.ship_to_city ?? "",
        ship_to_state: source.ship_to_state ?? "",
        ship_to_zip: source.ship_to_zip ?? "",
        ship_to_phone: source.ship_to_phone ?? "",
        payment_terms_snapshot: source.payment_terms_snapshot ?? "Net 30",
        buyer_name_snapshot: source.buyer_name_snapshot ?? "",
        approver_name_snapshot: source.approver_name_snapshot ?? "",
        notes: source.notes ?? "",
      });
      const sourceLines = data.sourceDetail.lineItems;
      if (source.po_type === "Manufacturer PO") {
        setMfrLines(
          sourceLines.length
            ? sourceLines.map((item, index) => ({
                ...item,
                tempId: item.id || `mfr-${index}`,
                colorway: String(item.variant_label ?? ""),
              }))
            : [buildEmptyMfrLine(0)],
        );
      } else {
        setLineItems(
          normalizeBuilderLineItems(
            sourceLines.length
              ? sourceLines.map((item, index) => ({
                  ...item,
                  tempId: item.id || `line-${index}`,
                }))
              : [buildEmptyLineItem(0)],
          ),
        );
      }
    } else {
      setPurchaseOrder(buildEmptyBuilderState(data.poNumber));
      setLineItems([buildEmptyLineItem(0)]);
    }

    initializedRef.current = true;
  }, [autosaveKey, data, editId, loading]);

  useEffect(() => {
    if (!initializedRef.current || !purchaseOrder || isEditMode) return;
    const handle = window.setTimeout(() => {
      window.localStorage.setItem(
        autosaveKey,
        JSON.stringify({ purchaseOrder, lineItems: normalizeBuilderLineItems(lineItems) }),
      );
      if (!autosaveNoticeRef.current) {
        autosaveNoticeRef.current = true;
        setNotice({ tone: "success", message: "Draft autosaved locally so you can jump back in without losing your work." });
      }
    }, 600);
    return () => window.clearTimeout(handle);
  }, [autosaveKey, isEditMode, lineItems, purchaseOrder]);

  if (loading || !purchaseOrder || !data) return <LoadingState />;
  if (loadError) return <InlineErrorLog error={getUiErrorLog(loadError, "We couldn't load the purchase order builder")} />;
  const builderData = data;
  const builderPo = purchaseOrder;

  const recentProductIds = readLocalList(RECENT_PRODUCTS_KEY);
  const recentRetailerIds = readLocalList(RECENT_RETAILERS_KEY);
  const buyersForRetailer = builderData.buyers.filter((buyer) => !builderPo.retailer_id || buyer.retailer_id === builderPo.retailer_id);
  const locationsForRetailer = builderData.locations.filter((location) => !builderPo.retailer_id || location.retailer_id === builderPo.retailer_id);
  const recentProducts = recentProductIds
    .map((id) => builderData.barcodes.find((barcode) => barcode.id === id))
    .filter((barcode): barcode is ProductBarcode => Boolean(barcode));
  const filteredProducts = [...builderData.barcodes]
    .filter((barcode) => {
      if (!productSearch.trim()) return true;
      const linkedProducts = (barcode.product_barcode_links ?? [])
        .map((link) => link.products)
        .filter((product): product is Product => Boolean(product));
      const haystack = [
        barcode.product_name,
        barcode.sku,
        barcode.barcode_upc ?? "",
        barcode.collection ?? "",
        barcode.size ?? "",
        barcode.handle ?? "",
        barcode.pack_unit ?? "",
        linkedProducts.map((product) => [product.name, product.sku, product.upc ?? "", product.category ?? "", product.variant_title ?? ""].join(" ")).join(" "),
      ].join(" ").toLowerCase();
      return haystack.includes(productSearch.trim().toLowerCase());
    })
    .sort((left, right) => {
      const needle = productSearch.trim().toLowerCase();
      if (!needle) return left.product_name.localeCompare(right.product_name);
      const leftStarts = `${left.sku} ${left.product_name}`.toLowerCase().startsWith(needle) ? -1 : 0;
      const rightStarts = `${right.sku} ${right.product_name}`.toLowerCase().startsWith(needle) ? -1 : 0;
      return leftStarts - rightStarts || left.product_name.localeCompare(right.product_name);
    })
    .slice(0, 30);

  const normalizedLines = normalizeBuilderLineItems(lineItems);
  const totalCost = normalizedLines.reduce((sum, item) => sum + Number(item.extended_cost ?? 0), 0);
  const totalRetail = normalizedLines.reduce((sum, item) => sum + Number(item.extended_retail ?? 0), 0);
  const totalUnits = normalizedLines.reduce((sum, item) => sum + Number(item.quantity_ordered ?? 0), 0);

  const previewPurchaseOrder = {
    id: builderPo.id ?? "preview",
    po_number: builderPo.po_number,
    vendor_id: builderPo.vendor_id || null,
    retailer_id: builderPo.retailer_id || null,
    buyer_id: builderPo.buyer_id || null,
    location_id: builderPo.location_id || null,
    status: builderPo.status,
    po_type: builderPo.po_type,
    approval_status: "Not Requested",
    allocation_status: "Not Allocated",
    order_date: builderPo.order_date || null,
    ship_date: null,
    submitted_at: builderPo.order_date || null,
    eta_date: null,
    expected_delivery_date: null,
    actual_delivery_date: null,
    invoice_status: "Open",
    invoice_paid_at: null,
    tracking_number: null,
    shipment_status: null,
    tracking_status: null,
    generated_form_url: null,
    source_channel: "Manual Builder",
    currency_code: builderPo.currency_code,
    bill_to_company_name: builderPo.bill_to_company_name || null,
    bill_to_contact_name: builderPo.bill_to_contact_name || null,
    bill_to_street: builderPo.bill_to_street || null,
    bill_to_city: builderPo.bill_to_city || null,
    bill_to_state: builderPo.bill_to_state || null,
    bill_to_zip: builderPo.bill_to_zip || null,
    bill_to_phone: builderPo.bill_to_phone || null,
    bill_to_email: builderPo.bill_to_email || null,
    ship_to_company_name: builderPo.ship_to_company_name || null,
    ship_to_attention: builderPo.ship_to_attention || null,
    ship_to_street: builderPo.ship_to_street || null,
    ship_to_city: builderPo.ship_to_city || null,
    ship_to_state: builderPo.ship_to_state || null,
    ship_to_zip: builderPo.ship_to_zip || null,
    ship_to_phone: builderPo.ship_to_phone || null,
    payment_terms_snapshot: builderPo.payment_terms_snapshot || null,
    buyer_name_snapshot: builderPo.buyer_name_snapshot || null,
    approver_name_snapshot: builderPo.approver_name_snapshot || null,
    compliance_snapshot: {},
    buyer_notes: null,
    internal_notes: null,
    hold_reason: null,
    counter_status: "None",
    start_ship_date: builderPo.start_ship_date || null,
    ship_complete_date: builderPo.ship_complete_date || null,
    subtotal: totalCost,
    total_units: totalUnits,
    total_retail: totalRetail,
    requested_action: "draft",
    approved_at: null,
    approved_by: null,
    queued_for_fulfillment_at: null,
    cancelled_at: null,
    total_cost: totalCost,
    source_file_name: null,
    notes: builderPo.notes || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    vendors: builderData.vendors.find((vendor) => vendor.id === builderPo.vendor_id) ?? null,
    retailers: builderData.retailers.find((retailer) => retailer.id === builderPo.retailer_id) ?? null,
    buyers: builderData.buyers.find((buyer) => buyer.id === builderPo.buyer_id) ?? null,
    locations: builderData.locations.find((location) => location.id === builderPo.location_id) ?? null,
  } satisfies PurchaseOrder;

  function updatePurchaseOrder<K extends keyof BuilderState>(key: K, value: BuilderState[K]) {
    setPurchaseOrder((current) => (current ? { ...current, [key]: value } : current));
  }

  function applyRetailer(retailerId: string) {
    const retailer = builderData.retailers.find((entry) => entry.id === retailerId) ?? null;
    const buyer = builderData.buyers.find((entry) => entry.retailer_id === retailerId) ?? null;
    const location = builderData.locations.find((entry) => entry.retailer_id === retailerId) ?? null;
    const billToAddress = splitAddressParts(buyer?.billing_address);
    const shipToAddress = splitAddressParts(location?.address ?? buyer?.shipping_address);

    setPurchaseOrder((current) => {
      if (!current) return current;
      return {
        ...current,
        retailer_id: retailerId,
        buyer_id: buyer?.id ?? "",
        location_id: location?.id ?? "",
        bill_to_company_name: buyer?.company_name ?? retailer?.name ?? current.bill_to_company_name,
        bill_to_contact_name: buyer?.buyer_name ?? retailer?.primary_contact_name ?? current.bill_to_contact_name,
        bill_to_street: billToAddress.street || current.bill_to_street,
        bill_to_city: billToAddress.city || current.bill_to_city,
        bill_to_state: billToAddress.state || current.bill_to_state,
        bill_to_zip: billToAddress.zip || current.bill_to_zip,
        bill_to_phone: buyer?.phone ?? retailer?.primary_contact_phone ?? current.bill_to_phone,
        bill_to_email: buyer?.buyer_email ?? retailer?.primary_contact_email ?? current.bill_to_email,
        ship_to_company_name: location?.name ?? retailer?.name ?? current.ship_to_company_name,
        ship_to_attention: buyer?.buyer_name ?? retailer?.primary_contact_name ?? current.ship_to_attention,
        ship_to_street: shipToAddress.street || current.ship_to_street,
        ship_to_city: shipToAddress.city || current.ship_to_city,
        ship_to_state: shipToAddress.state || current.ship_to_state,
        ship_to_zip: shipToAddress.zip || current.ship_to_zip,
        ship_to_phone: buyer?.phone ?? retailer?.primary_contact_phone ?? current.ship_to_phone,
        payment_terms_snapshot: buyer?.payment_terms ?? retailer?.default_payment_terms ?? current.payment_terms_snapshot,
        buyer_name_snapshot: buyer?.buyer_name ?? current.buyer_name_snapshot,
        approver_name_snapshot: retailer?.primary_contact_name ?? current.approver_name_snapshot,
      };
    });
    if (retailerId) {
      writeLocalList(RECENT_RETAILERS_KEY, [retailerId, ...recentRetailerIds.filter((id) => id !== retailerId)]);
    }
  }

  function applyBuyer(buyerId: string) {
    const buyer = builderData.buyers.find((entry) => entry.id === buyerId) ?? null;
    if (!buyer) {
      updatePurchaseOrder("buyer_id", "");
      return;
    }
    const address = splitAddressParts(buyer.billing_address);
    setPurchaseOrder((current) => {
      if (!current) return current;
      return {
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
      };
    });
  }

  function applyLocation(locationId: string) {
    const location = builderData.locations.find((entry) => entry.id === locationId) ?? null;
    const address = splitAddressParts(location?.address);
    setPurchaseOrder((current) => {
      if (!current) return current;
      return {
        ...current,
        location_id: locationId,
        ship_to_company_name: location?.name ?? current.ship_to_company_name,
        ship_to_street: address.street || current.ship_to_street,
        ship_to_city: address.city || current.ship_to_city,
        ship_to_state: address.state || current.ship_to_state,
        ship_to_zip: address.zip || current.ship_to_zip,
      };
    });
  }

  function copyBillToShipTo() {
    setPurchaseOrder((current) => {
      if (!current) return current;
      return {
        ...current,
        ship_to_company_name: current.bill_to_company_name,
        ship_to_attention: current.bill_to_contact_name,
        ship_to_street: current.bill_to_street,
        ship_to_city: current.bill_to_city,
        ship_to_state: current.bill_to_state,
        ship_to_zip: current.bill_to_zip,
        ship_to_phone: current.bill_to_phone,
      };
    });
  }

  function addProductsByIds(productIds: string[]) {
    const selectedBarcodes = productIds
      .map((productId) => builderData.barcodes.find((barcode) => barcode.id === productId))
      .filter((barcode): barcode is ProductBarcode => Boolean(barcode));
    if (!selectedBarcodes.length) return;

    setLineItems((current) => {
      const base = normalizeBuilderLineItems(current);
      const additions = selectedBarcodes.map((barcode, index) => buildLineItemFromBarcode(barcode, base.length + index));
      return normalizeBuilderLineItems([...base, ...additions]);
    });

    writeLocalList(
      RECENT_PRODUCTS_KEY,
      [...selectedBarcodes.map((barcode) => barcode.id), ...recentProductIds.filter((id) => !productIds.includes(id))],
    );
    setSelectedProductIds([]);
    setProductSearch("");
  }

  function duplicateLine(index: number) {
    setLineItems((current) => {
      const clone = { ...current[index], id: undefined, tempId: `dup-${Date.now()}-${index}` };
      const next = [...current];
      next.splice(index + 1, 0, clone);
      return normalizeBuilderLineItems(next);
    });
  }

  function moveLine(index: number, direction: -1 | 1) {
    setLineItems((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return normalizeBuilderLineItems(next);
    });
  }

  async function savePurchaseOrder(nextStatus: PurchaseOrder["status"]) {
    try {
      setSaving(true);
      setError(null);
      if (!builderPo.po_number.trim()) throw new Error("PO number is required.");
      if (!builderPo.bill_to_company_name.trim()) throw new Error("Bill To company name is required.");
      if (!builderPo.ship_to_company_name.trim()) throw new Error("Ship To company name is required.");
      const validLineItems = normalizeBuilderLineItems(lineItems).filter((item) => String(item.product_name ?? "").trim());
      if (!validLineItems.length) throw new Error("Add at least one product line before saving.");
      validLineItems.forEach((item, index) => {
        if (Number(item.quantity_ordered ?? 0) <= 0) throw new Error(`Line ${index + 1} needs a quantity greater than zero.`);
      });

      const savedPo = await purchaseOrderService.savePurchaseOrder({
        purchaseOrder: {
          id: builderPo.id,
          po_number: builderPo.po_number,
          vendor_id: builderPo.vendor_id || null,
          retailer_id: builderPo.retailer_id || null,
          buyer_id: builderPo.buyer_id || null,
          location_id: builderPo.location_id || null,
          po_type: builderPo.po_type,
          status: nextStatus,
          order_date: builderPo.order_date || null,
          start_ship_date: builderPo.start_ship_date || null,
          ship_complete_date: builderPo.ship_complete_date || null,
          currency_code: builderPo.currency_code || "USD",
          bill_to_company_name: builderPo.bill_to_company_name,
          bill_to_contact_name: builderPo.bill_to_contact_name,
          bill_to_street: builderPo.bill_to_street,
          bill_to_city: builderPo.bill_to_city,
          bill_to_state: builderPo.bill_to_state,
          bill_to_zip: builderPo.bill_to_zip,
          bill_to_phone: builderPo.bill_to_phone,
          bill_to_email: builderPo.bill_to_email,
          ship_to_company_name: builderPo.ship_to_company_name,
          ship_to_attention: builderPo.ship_to_attention,
          ship_to_street: builderPo.ship_to_street,
          ship_to_city: builderPo.ship_to_city,
          ship_to_state: builderPo.ship_to_state,
          ship_to_zip: builderPo.ship_to_zip,
          ship_to_phone: builderPo.ship_to_phone,
          payment_terms_snapshot: builderPo.payment_terms_snapshot,
          buyer_name_snapshot: builderPo.buyer_name_snapshot,
          approver_name_snapshot: builderPo.approver_name_snapshot,
          notes: builderPo.notes || null,
          buyers: builderData.buyers.find((buyer) => buyer.id === builderPo.buyer_id) ?? null,
          retailers: builderData.retailers.find((retailer) => retailer.id === builderPo.retailer_id) ?? null,
        },
        lineItems: validLineItems.map((item, index) => ({
          id: item.id,
          product_id: item.product_id || null,
          sku: String(item.sku ?? ""),
          upc: String(item.upc ?? ""),
          product_name: String(item.product_name ?? ""),
          description: String(item.description ?? item.product_name ?? ""),
          variant_label: String(item.variant_label ?? ""),
          unit: String(item.unit ?? "EA"),
          quantity_ordered: Number(item.quantity_ordered ?? 0),
          quantity_received: Number(item.quantity_received ?? 0),
          unit_cost: Number(item.unit_cost ?? 0),
          unit_retail: Number(item.unit_retail ?? 0),
          unit_quantity: Number(item.quantity_ordered ?? 0),
          case_pack_quantity: Number(item.case_pack_quantity ?? 1),
          case_quantity: Number(item.case_quantity ?? 1),
          extended_cost: Number(item.extended_cost ?? 0),
          extended_retail: Number(item.extended_retail ?? 0),
          sort_order: index,
        })),
      });
      window.localStorage.removeItem(autosaveKey);
      navigate(`/purchase-orders/${savedPo.id}`);
    } catch (err) {
      setError(getUiErrorLog(err, "We couldn't save this purchase order"));
    } finally {
      setSaving(false);
    }
  }

  // ── Manufacturer PO helpers ──────────────────────────────────────────────
  function updateMfrLine(index: number, patch: Partial<ManufacturerBuilderLine>) {
    setMfrLines((current) =>
      current.map((line, i) => {
        if (i !== index) return line;
        const updated = { ...line, ...patch };
        const qty = Number(updated.quantity_ordered ?? 0);
        const pack = Number(updated.pack_pairs ?? 1);
        const unitCost = Number(updated.unit_cost ?? 1.89);
        const unitRetail = Number(updated.unit_retail ?? 0);
        return {
          ...updated,
          cards_used: calculateCardsUsed(qty, pack),
          extended_cost: qty * unitCost,
          extended_retail: qty * unitRetail,
          unit_quantity: qty,
        };
      }),
    );
  }

  function removeMfrLine(index: number) {
    setMfrLines((current) => current.filter((_, i) => i !== index));
  }

  function addBlankMfrLine() {
    setMfrLines((current) => [...current, buildEmptyMfrLine(current.length)]);
  }

  function handleNewDesignSaved(design: OrderDesign) {
    setShowNewDesignModal(false);
    const newLine = buildLineFromDesign(design, localSockCards, mfrLines.length);
    setMfrLines((current) => [...current, newLine]);
  }

  async function saveManufacturerOrder(isDraft: boolean) {
    try {
      setSaving(true);
      setError(null);
      if (!builderPo.po_number.trim()) throw new Error("PO number is required.");

      const validLines = mfrLines.filter((line) => String(line.product_name ?? "").trim());
      if (!validLines.length) throw new Error("Add at least one design line before saving.");

      const nextStatus: PurchaseOrder["status"] = isDraft ? "Draft" : "Ordered";

      if (!isDraft) {
        const issues = validateManufacturerOrder(validLines, localSockCards);
        if (hasStopIssues(issues)) {
          throw new Error(
            `Order has ${issues.filter((i) => i.severity === "stop").length} STOP issue(s). Fix them before sending.`,
          );
        }
      }

      const poPayload: Parameters<typeof purchaseOrderService.savePurchaseOrder>[0] = {
        purchaseOrder: {
          id: builderPo.id,
          po_number: builderPo.po_number,
          vendor_id: builderPo.vendor_id || null,
          retailer_id: null,
          buyer_id: null,
          location_id: null,
          po_type: "Manufacturer PO",
          status: nextStatus,
          order_date: builderPo.order_date || null,
          start_ship_date: builderPo.start_ship_date || null,
          ship_complete_date: builderPo.ship_complete_date || null,
          currency_code: builderPo.currency_code || "USD",
          bill_to_company_name: "Foshan Lion King Clothing Co., Ltd.",
          bill_to_contact_name: "Tina",
          bill_to_street: builderPo.bill_to_street || null,
          bill_to_city: builderPo.bill_to_city || null,
          bill_to_state: builderPo.bill_to_state || null,
          bill_to_zip: builderPo.bill_to_zip || null,
          bill_to_phone: builderPo.bill_to_phone || null,
          bill_to_email: builderPo.bill_to_email || null,
          ship_to_company_name: builderPo.ship_to_company_name || "Foshan Lion King",
          ship_to_attention: "Tina",
          ship_to_street: null,
          ship_to_city: null,
          ship_to_state: null,
          ship_to_zip: null,
          ship_to_phone: null,
          payment_terms_snapshot: null,
          buyer_name_snapshot: null,
          approver_name_snapshot: null,
          notes: builderPo.notes || null,
        },
        lineItems: validLines.map((item, index) => {
          const qty = Number(item.quantity_ordered ?? 0);
          const pack = Number(item.pack_pairs ?? 1);
          const unitCost = Number(item.unit_cost ?? 1.89);
          const unitRetail = Number(item.unit_retail ?? 0);
          return {
            id: item.id,
            product_id: item.product_id || null,
            design_id: item.design_id || null,
            sku: String(item.sku ?? ""),
            upc: String(item.upc ?? ""),
            product_name: String(item.product_name ?? ""),
            description: String(item.product_name ?? ""),
            variant_label: String(item.colorway ?? item.variant_label ?? ""),
            unit: "pairs",
            quantity_ordered: qty,
            quantity_received: 0,
            unit_cost: unitCost,
            unit_retail: unitRetail,
            unit_quantity: qty,
            case_pack_quantity: 1,
            case_quantity: 1,
            extended_cost: qty * unitCost,
            extended_retail: qty * unitRetail,
            sort_order: index,
            spec_snapshot: item.spec_snapshot ?? {},
            sock_card_id: item.sock_card_id || null,
            pack_pairs: pack,
            sock_size: item.sock_size || null,
            construction: item.construction || null,
            cards_used: calculateCardsUsed(qty, pack),
            box_no: item.box_no || null,
            pantone: item.pantone || null,
            barcode_required: Boolean(item.barcode_required),
            art_status: item.art_status || "NEEDED",
            art_note: item.art_note || null,
            mockup_file_ref: item.mockup_file_ref || null,
            artwork_file_ref: item.artwork_file_ref || null,
            rib_lr: item.rib_lr ?? true,
            toe: item.toe ?? true,
            pattern: item.pattern ?? false,
            signature: item.signature ?? false,
            foot_text: item.foot_text || null,
          };
        }),
      };

      const savedPo = await purchaseOrderService.savePurchaseOrder(poPayload);

      if (!isDraft) {
        // Generate Tina document using the manufacturer-specific formatter
        const supabase = assertSupabase();
        const { data: savedLines } = await supabase
          .from("po_line_items")
          .select("*")
          .eq("purchase_order_id", savedPo.id);

        const tinaHtml = buildManufacturerOrderHtml(savedPo, (savedLines ?? []) as PoLineItem[], localSockCards);

        // Check if a generated doc already exists
        const { data: existingDoc } = await supabase
          .from("generated_purchase_order_documents")
          .select("id")
          .eq("purchase_order_id", savedPo.id)
          .maybeSingle();

        await supabase.from("generated_purchase_order_documents").upsert({
          id: existingDoc?.id,
          purchase_order_id: savedPo.id,
          document_format: "html",
          title: `Manufacturer Order ${savedPo.po_number} — Tina`,
          body_html: tinaHtml,
        });

        // Confirm sock card draw (decrement inventory + ledger)
        await sockCardService.confirmDraw(savedPo.id, (savedLines ?? []) as PoLineItem[]);

        // Download all attached mockup/artwork files as a ZIP
        await downloadManufacturerFilesZip((savedLines ?? []) as PoLineItem[], savedPo.po_number);
      }

      window.localStorage.removeItem(autosaveKey);
      navigate(`/purchase-orders/${savedPo.id}`);
    } catch (err) {
      setError(getUiErrorLog(err, "We couldn't save this manufacturer order"));
    } finally {
      setSaving(false);
    }
  }

  function handleUpdateSockCard(id: string, onHand: number) {
    setLocalSockCards((prev) => prev.map((c) => (c.id === id ? { ...c, on_hand: onHand } : c)));
  }

  // ── Manufacturer PO render branch ─────────────────────────────────────────
  if (builderPo.po_type === "Manufacturer PO") {
    const mfrPreviewPo: PurchaseOrder = {
      ...previewPurchaseOrder,
      bill_to_company_name: "Foshan Lion King Clothing Co., Ltd.",
      bill_to_contact_name: "Tina",
    };

    const mfrTotalPairs = mfrLines.reduce((s, l) => s + Number(l.quantity_ordered ?? 0), 0);
    const mfrTotalCards = mfrLines.reduce((s, l) => {
      const p = Number(l.pack_pairs ?? 1);
      return s + (p > 0 ? Math.ceil(Number(l.quantity_ordered ?? 0) / p) : 0);
    }, 0);
    const mfrTotalGoods = mfrLines.reduce((s, l) => s + Number(l.quantity_ordered ?? 0) * Number(l.unit_cost ?? 1.89), 0);

    return (
      <div className="section-stack po-builder-shell">
        {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}
        {showNewDesignModal ? (
          <NewDesignModal
            sockCards={localSockCards}
            catalogOptions={builderData.catalogOptions}
            onSaved={handleNewDesignSaved}
            onClose={() => setShowNewDesignModal(false)}
          />
        ) : null}
        <PageHeader
          title={isEditMode ? `Edit ${builderPo.po_number}` : "Manufacturer Order Builder"}
          description="Production order for Foshan Lion King — auto-fills specs, tracks sock card draw, generates the Tina document."
          actions={(
            <div className="btn-row">
              <Link className="btn btn-ghost" to={builderPo.id ? `/purchase-orders/${builderPo.id}` : "/purchase-orders"}>
                Cancel
              </Link>
              <div className="field field-half" style={{ margin: 0 }}>
                <select
                  value={builderPo.po_type}
                  onChange={(e) => updatePurchaseOrder("po_type", e.target.value as PurchaseOrder["po_type"])}
                  style={{ fontSize: 13 }}
                >
                  <option value="Manufacturer PO">Manufacturer PO</option>
                  <option value="Retailer PO">Retailer PO</option>
                  <option value="Customer Reorder">Customer Reorder</option>
                  <option value="Work Order">Work Order</option>
                </select>
              </div>
              <button className="btn btn-secondary" disabled={saving} onClick={() => void saveManufacturerOrder(true)}>
                {saving ? "Saving..." : "Save Draft"}
              </button>
              <button className="btn btn-primary" disabled={saving} onClick={() => void saveManufacturerOrder(false)}>
                {saving ? "Saving..." : "Confirm & Send to Tina"}
              </button>
            </div>
          )}
        />
        {error ? <InlineErrorLog error={error} /> : null}

        {/* PO header fields */}
        <div className="panel">
          <div className="panel-header">
            <div><p className="lookbook-kicker">Order Header</p><h3>Production Order Details</h3></div>
          </div>
          <div className="form-grid">
            <div className="field"><label>PO Number</label><input value={builderPo.po_number} onChange={(e) => updatePurchaseOrder("po_number", e.target.value)} /></div>
            <div className="field"><label>Order Date</label><input type="date" value={builderPo.order_date} onChange={(e) => updatePurchaseOrder("order_date", e.target.value)} /></div>
            <div className="field"><label>Req. Ship Date</label><input type="date" value={builderPo.start_ship_date} onChange={(e) => updatePurchaseOrder("start_ship_date", e.target.value)} /></div>
            <div className="field">
              <label>Vendor / Manufacturer</label>
              <select value={builderPo.vendor_id} onChange={(e) => updatePurchaseOrder("vendor_id", e.target.value)}>
                <option value="">No vendor selected</option>
                {builderData.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div className="field field-wide">
              <label>Internal Notes</label>
              <textarea rows={2} value={builderPo.notes} onChange={(e) => updatePurchaseOrder("notes", e.target.value)} placeholder="Internal production notes" />
            </div>
          </div>
        </div>

        {/* Two-column: scrollable grid left, sticky rail right */}
        <div className="mfr-layout">
          <div>
            <ManufacturerOrderGrid
              lines={mfrLines}
              sockCards={localSockCards}
              catalogOptions={builderData.catalogOptions}
              onUpdate={updateMfrLine}
              onRemove={removeMfrLine}
              onAddBlank={addBlankMfrLine}
              onOpenNewDesign={() => setShowNewDesignModal(true)}
            />
          </div>

          <div className="mfr-rail">
            {/* Totals */}
            <div className="panel">
              <div className="panel-header">
                <div><p className="lookbook-kicker">Summary</p><h3>Totals</h3></div>
              </div>
              <div className="mfr-tline"><span className="mfr-tline-label">SKUs</span><span>{mfrLines.length}</span></div>
              <div className="mfr-tline"><span className="mfr-tline-label">Total pairs</span><span>{mfrTotalPairs}</span></div>
              <div className="mfr-tline"><span className="mfr-tline-label">Sock cards used</span><span>{mfrTotalCards}</span></div>
              <div className="mfr-tline"><span className="mfr-tline-label">Goods (EXW)</span><span>${mfrTotalGoods.toFixed(2)}</span></div>
              <div className="mfr-tline mfr-tline-grand">
                <span className="mfr-tline-label">Grand total (EXW)</span>
                <strong className="mfr-tline-val">${mfrTotalGoods.toFixed(2)}</strong>
              </div>
            </div>

            <SockCardDrawPanel lines={mfrLines} sockCards={localSockCards} onUpdateCard={handleUpdateSockCard} />
            <ManufacturerOrderCheckPanel lines={mfrLines} sockCards={localSockCards} />
          </div>
        </div>

        <SendToTinaPreview
          purchaseOrder={mfrPreviewPo}
          lines={mfrLines as PoLineItem[]}
          sockCards={localSockCards}
        />
      </div>
    );
  }

  // ── Existing retailer / standard PO builder ────────────────────────────────
  return (
    <div className="section-stack po-builder-shell">
      {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}
      <PageHeader
        title={isEditMode ? `Edit ${builderPo.po_number}` : "Purchase Order Builder"}
        description="Fill the real SickFit PO document directly, pull products from the catalog, and keep creation fast enough for live ops."
        actions={(
          <div className="btn-row">
            <Link className="btn btn-ghost" to={builderPo.id ? `/purchase-orders/${builderPo.id}` : "/purchase-orders"}>
              Cancel
            </Link>
            <div className="field field-half" style={{ margin: 0 }}>
              <select
                value={builderPo.po_type}
                onChange={(e) => updatePurchaseOrder("po_type", e.target.value as PurchaseOrder["po_type"])}
                style={{ fontSize: 13 }}
              >
                <option value="Manufacturer PO">Manufacturer PO</option>
                <option value="Retailer PO">Retailer PO</option>
                <option value="Customer Reorder">Customer Reorder</option>
                <option value="Work Order">Work Order</option>
              </select>
            </div>
            <button className="btn btn-secondary" disabled={saving} onClick={() => void savePurchaseOrder("Draft")}>
              {saving ? "Saving..." : "Save Draft"}
            </button>
            <button className="btn btn-primary" disabled={saving} onClick={() => void savePurchaseOrder("Pending")}>
              {saving ? "Saving..." : isEditMode ? "Save PO" : "Create PO"}
            </button>
          </div>
        )}
      />
      {error ? <InlineErrorLog error={error} /> : null}
      <div className="panel po-builder-preview-panel">
        <div className="panel-header"><div><p className="lookbook-kicker">Live Preview</p><h3>SickFit Purchase Order</h3></div></div>
        <PurchaseOrderDocumentView purchaseOrder={previewPurchaseOrder} lineItems={normalizedLines as PoLineItem[]} />
      </div>
      <div className="section-stack">
          <div className="panel">
            <div className="panel-header">
              <div>
                <p className="lookbook-kicker">Retailer Template</p>
                <h3>Start With An Account Profile</h3>
              </div>
              <div className="btn-row">
                {recentRetailerIds.slice(0, 3).map((retailerId) => {
                  const retailer = builderData.retailers.find((entry) => entry.id === retailerId);
                  if (!retailer) return null;
                  return <button key={retailer.id} className="btn btn-ghost btn-small" onClick={() => applyRetailer(retailer.id)}>{retailer.name}</button>;
                })}
              </div>
            </div>
            <div className="form-grid">
              <div className="field field-half">
                <label>Retailer Template</label>
                <select value={builderPo.retailer_id} onChange={(event) => applyRetailer(event.target.value)}>
                  <option value="">Select retailer...</option>
                  {builderData.retailers.map((retailer) => <option key={retailer.id} value={retailer.id}>{retailer.name}</option>)}
                </select>
              </div>
              <div className="field field-half">
                <label>Buyer Template</label>
                <select value={builderPo.buyer_id} onChange={(event) => applyBuyer(event.target.value)}>
                  <option value="">Select buyer...</option>
                  {buyersForRetailer.map((buyer) => <option key={buyer.id} value={buyer.id}>{buyer.buyer_name} | {buyer.company_name}</option>)}
                </select>
              </div>
              <div className="field field-half">
                <label>Ship To Location</label>
                <select value={builderPo.location_id} onChange={(event) => applyLocation(event.target.value)}>
                  <option value="">Select location...</option>
                  {locationsForRetailer.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                </select>
              </div>
              <div className="field field-half">
                <label>Vendor / Manufacturer</label>
                <select value={builderPo.vendor_id} onChange={(event) => updatePurchaseOrder("vendor_id", event.target.value)}>
                  <option value="">No vendor selected</option>
                  {builderData.vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <p className="lookbook-kicker">Header</p>
                <h3>PO Header</h3>
              </div>
            </div>
            <div className="form-grid">
              <div className="field"><label>PO Number</label><input value={builderPo.po_number} onChange={(event) => updatePurchaseOrder("po_number", event.target.value)} /></div>
              <div className="field"><label>Order Date</label><input type="date" value={builderPo.order_date} onChange={(event) => updatePurchaseOrder("order_date", event.target.value)} /></div>
              <div className="field"><label>Start Ship Date</label><input type="date" value={builderPo.start_ship_date} onChange={(event) => updatePurchaseOrder("start_ship_date", event.target.value)} /></div>
              <div className="field"><label>Ship Complete Date</label><input type="date" value={builderPo.ship_complete_date} onChange={(event) => updatePurchaseOrder("ship_complete_date", event.target.value)} /></div>
              <div className="field">
                <label>Currency</label>
                <select value={builderPo.currency_code} onChange={(event) => updatePurchaseOrder("currency_code", event.target.value)}>
                  <option value="USD">USD</option>
                  <option value="CAD">CAD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>
          </div>

          <div className="po-builder-two-up">
            <div className="panel">
              <div className="panel-header"><div><p className="lookbook-kicker">Bill To</p><h3>Billing Information</h3></div></div>
              <div className="form-grid">
                <div className="field field-half"><label>Company Name</label><input value={builderPo.bill_to_company_name} onChange={(event) => updatePurchaseOrder("bill_to_company_name", event.target.value)} /></div>
                <div className="field field-half"><label>Contact Name</label><input value={builderPo.bill_to_contact_name} onChange={(event) => updatePurchaseOrder("bill_to_contact_name", event.target.value)} /></div>
                <div className="field field-wide"><label>Street Address</label><input value={builderPo.bill_to_street} onChange={(event) => updatePurchaseOrder("bill_to_street", event.target.value)} /></div>
                <div className="field field-half"><label>City</label><input value={builderPo.bill_to_city} onChange={(event) => updatePurchaseOrder("bill_to_city", event.target.value)} /></div>
                <div className="field"><label>State</label><input value={builderPo.bill_to_state} onChange={(event) => updatePurchaseOrder("bill_to_state", event.target.value)} /></div>
                <div className="field"><label>ZIP Code</label><input value={builderPo.bill_to_zip} onChange={(event) => updatePurchaseOrder("bill_to_zip", event.target.value)} /></div>
                <div className="field field-half"><label>Phone</label><input value={builderPo.bill_to_phone} onChange={(event) => updatePurchaseOrder("bill_to_phone", event.target.value)} /></div>
                <div className="field field-half"><label>Email</label><input value={builderPo.bill_to_email} onChange={(event) => updatePurchaseOrder("bill_to_email", event.target.value)} /></div>
              </div>
            </div>
            <div className="panel">
              <div className="panel-header">
                <div><p className="lookbook-kicker">Ship To</p><h3>Shipping Information</h3></div>
                <button className="btn btn-ghost btn-small" onClick={copyBillToShipTo}>Copy From Bill To</button>
              </div>
              <div className="form-grid">
                <div className="field field-half"><label>Company Name</label><input value={builderPo.ship_to_company_name} onChange={(event) => updatePurchaseOrder("ship_to_company_name", event.target.value)} /></div>
                <div className="field field-half"><label>Attention</label><input value={builderPo.ship_to_attention} onChange={(event) => updatePurchaseOrder("ship_to_attention", event.target.value)} /></div>
                <div className="field field-wide"><label>Street Address</label><input value={builderPo.ship_to_street} onChange={(event) => updatePurchaseOrder("ship_to_street", event.target.value)} /></div>
                <div className="field field-half"><label>City</label><input value={builderPo.ship_to_city} onChange={(event) => updatePurchaseOrder("ship_to_city", event.target.value)} /></div>
                <div className="field"><label>State</label><input value={builderPo.ship_to_state} onChange={(event) => updatePurchaseOrder("ship_to_state", event.target.value)} /></div>
                <div className="field"><label>ZIP Code</label><input value={builderPo.ship_to_zip} onChange={(event) => updatePurchaseOrder("ship_to_zip", event.target.value)} /></div>
                <div className="field field-half"><label>Phone</label><input value={builderPo.ship_to_phone} onChange={(event) => updatePurchaseOrder("ship_to_phone", event.target.value)} /></div>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header"><div><p className="lookbook-kicker">Payment</p><h3>Terms And Approval</h3></div></div>
            <div className="form-grid">
              <div className="field">
                <label>Payment Terms</label>
                <input list="po-payment-terms" value={builderPo.payment_terms_snapshot} onChange={(event) => updatePurchaseOrder("payment_terms_snapshot", event.target.value)} />
                <datalist id="po-payment-terms">
                  {DEFAULT_PAYMENT_TERMS.map((term) => <option key={term} value={term} />)}
                </datalist>
              </div>
              <div className="field"><label>Buyer</label><input value={builderPo.buyer_name_snapshot} onChange={(event) => updatePurchaseOrder("buyer_name_snapshot", event.target.value)} /></div>
              <div className="field"><label>Approver</label><input value={builderPo.approver_name_snapshot} onChange={(event) => updatePurchaseOrder("approver_name_snapshot", event.target.value)} /></div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div><p className="lookbook-kicker">Line Items</p><h3>Catalog-Driven Product Builder</h3></div>
              <div className="btn-row">
                <button className="btn btn-secondary btn-small" onClick={() => addProductsByIds(filteredProducts.slice(0, 1).map((product) => product.id))}>Quick Add Top Result</button>
                <button className="btn btn-primary btn-small" onClick={() => addProductsByIds(selectedProductIds)}>Add Selected Products</button>
              </div>
            </div>
            <div className="po-line-grid-scroll">
            <div className="po-line-grid">
              <div className="po-line-grid-head">
                <span>Line</span><span>SKU</span><span>Description</span><span>UPC</span><span>Unit</span><span>Qty</span><span>Unit Cost</span><span>Ext Cost</span><span><strong>Suggested</strong> <strong>Retail</strong></span><span>Ext Retail</span><span>Actions</span>
              </div>
              {normalizedLines.map((item, index) => (
                <div key={item.id ?? item.tempId} className="po-line-grid-row">
                  <span>{index + 1}</span>
                  <input value={String(item.sku ?? "")} onChange={(event) => setLineItems((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, sku: event.target.value } : line))} />
                  <input value={String(item.description ?? item.product_name ?? "")} onChange={(event) => setLineItems((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, description: event.target.value, product_name: event.target.value } : line))} />
                  <input value={String(item.upc ?? "")} onChange={(event) => setLineItems((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, upc: event.target.value } : line))} />
                  <input value={String(item.unit ?? "EA")} onChange={(event) => setLineItems((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, unit: event.target.value } : line))} />
                  <input type="number" min="0" value={String(item.quantity_ordered ?? 0)} onChange={(event) => setLineItems((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, quantity_ordered: Number(event.target.value) } : line))} />
                  <input type="number" min="0" step="0.01" value={String(item.unit_cost ?? 0)} onChange={(event) => setLineItems((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, unit_cost: Number(event.target.value) } : line))} />
                  <strong>{formatCurrency(Number(item.extended_cost ?? 0))}</strong>
                  <input type="number" min="0" step="0.01" value={String(item.unit_retail ?? 0)} onChange={(event) => setLineItems((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, unit_retail: Number(event.target.value) } : line))} />
                  <strong>{formatCurrency(Number(item.extended_retail ?? 0))}</strong>
                  <div className="btn-row">
                    <button className="btn btn-ghost btn-small" onClick={() => duplicateLine(index)}>Duplicate</button>
                    <button className="btn btn-ghost btn-small" disabled={index === 0} onClick={() => moveLine(index, -1)}>Up</button>
                    <button className="btn btn-ghost btn-small" disabled={index === normalizedLines.length - 1} onClick={() => moveLine(index, 1)}>Down</button>
                    <button className="btn btn-danger btn-small" onClick={() => setLineItems((current) => current.filter((_, lineIndex) => lineIndex !== index))}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
            </div>
            <div className="po-totals-bar">
              <div className="detail-card"><span>Total Units</span><strong>{totalUnits}</strong></div>
              <div className="detail-card"><span>Total Gross Cost</span><strong>{formatCurrency(totalCost)}</strong></div>
              <div className="detail-card"><span>Total Cost</span><strong>{formatCurrency(totalCost)}</strong></div>
              <div className="detail-card"><span>Total Suggested Retail</span><strong>{formatCurrency(totalRetail)}</strong></div>
            </div>
            <div className="po-builder-search">
              <div className="field field-wide">
                <label>Search By Product Name, SKU, UPC, Barcode, Collection, Category, Color, Size, Or Variant</label>
                <input
                  value={productSearch}
                  placeholder="Start typing to search the barcode book and product catalog..."
                  onChange={(event) => {
                    setProductSearch(event.target.value);
                    setActiveProductIndex(0);
                  }}
                  onKeyDown={(event) => {
                    if (!filteredProducts.length) return;
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setActiveProductIndex((current) => Math.min(current + 1, filteredProducts.length - 1));
                    }
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setActiveProductIndex((current) => Math.max(current - 1, 0));
                    }
                    if (event.key === "Enter") {
                      event.preventDefault();
                      const product = filteredProducts[activeProductIndex];
                      if (product) addProductsByIds([product.id]);
                    }
                  }}
                />
              </div>
              {recentProducts.length ? (
                <div className="btn-row">
                  {recentProducts.map((barcode) => <button key={barcode.id} className="btn btn-ghost btn-small" onClick={() => addProductsByIds([barcode.id])}>Recent: {barcode.sku}</button>)}
                </div>
              ) : null}
              <div className="po-product-results">
                {filteredProducts.map((barcode, index) => {
                  const linkedProduct = getLinkedBarcodeProduct(barcode);
                  const selected = selectedProductIds.includes(barcode.id);
                  return (
                    <div key={barcode.id} className={`po-product-card${index === activeProductIndex ? " po-product-card-active" : ""}`}>
                      <label className="po-product-card-select">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(event) => {
                            setSelectedProductIds((current) =>
                              event.target.checked ? [...current, barcode.id] : current.filter((id) => id !== barcode.id),
                            );
                          }}
                        />
                      </label>
                      <div className="product-thumb-shell">
                        {linkedProduct?.image_url ? <img className="product-thumb" src={linkedProduct.image_url} alt={barcode.product_name} /> : <span className="product-thumb-fallback">PO</span>}
                      </div>
                      <div className="cell-stack"><strong>{barcode.product_name}</strong><span className="helper-text">{barcode.collection ?? linkedProduct?.category ?? "Barcode catalog row"}{barcode.size ? ` | ${barcode.size}` : ""}</span></div>
                      <div className="cell-stack"><strong>{barcode.sku}</strong><span className="helper-text">{barcode.barcode_upc ?? linkedProduct?.upc ?? "No UPC"}</span></div>
                      <div className="cell-stack"><strong>{formatCurrency(linkedProduct?.wholesale_price || linkedProduct?.unit_cost || 0)}</strong><span className="helper-text">Wholesale</span></div>
                      <div className="cell-stack"><strong>{formatCurrency(linkedProduct?.unit_price || linkedProduct?.msrp || 0)}</strong><span className="helper-text">Retail</span></div>
                      <button className="btn btn-secondary btn-small" onClick={() => addProductsByIds([barcode.id])}>Add</button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header"><div><p className="lookbook-kicker">Notes</p><h3>Notes / Special Instructions</h3></div></div>
            <div className="form-grid">
              <div className="field field-wide">
                <label>Operational Notes</label>
                <textarea rows={6} value={builderPo.notes} onChange={(event) => updatePurchaseOrder("notes", event.target.value)} placeholder="Shipping instructions, vendor comments, internal notes, or anything the PO should carry forward." />
              </div>
            </div>
          </div>
      </div>
    </div>
  );
}
