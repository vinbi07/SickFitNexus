import { assertSupabase } from "@/lib/supabase";
import { applyCalculatedSafetyStock } from "@/services/productPlanningService";
import type {
  ActivityEvent,
  Alert,
  CsvImport,
  DashboardSnapshot,
  InventoryEvent,
  InventoryItem,
  PoLineItem,
  Product,
  PurchaseOrder,
  Retailer,
  ShopifyOrder,
  ShopifyOrderLineItem,
  Sop,
  Vendor,
} from "@/types/domain";
import { calculateForecastMetric, calculateVendorReliability } from "@/utils/forecasting";
import { getAverageTimelineDays, getProductionTimelineExceptionCount, getProductionTimelineRows, getProductionTimelineTrend } from "@/utils/productionTimeline";
import {
  buildSkuReorderWindow,
  getDaysLate,
  getIncomingQuantityForProduct,
  getInventoryHealthTone,
  getInvoiceStatus,
  getShipmentStatus,
  isInventoryDanger,
} from "@/utils/operations";
import { daysBetween } from "@/utils/date";

const SHOPIFY_DASHBOARD_SYNC_FUNCTION = "shopify-dashboard-sync";

function normalizeChannelName(channel: string | null | undefined) {
  const value = (channel ?? "").trim().toLowerCase();
  if (!value) return "";
  if (value.includes("shopify") || value.includes("dtc")) return "DTC + Shopify";
  return channel?.trim() ?? "";
}

function endOfWindow(start: string | null, end: string | null) {
  if (start && end) return `${start} to ${end}`;
  if (start) return `Starts ${start}`;
  if (end) return `Ends ${end}`;
  return "Window not set";
}

function isWholesaleChannel(channel: string | null | undefined) {
  return normalizeChannelName(channel) !== "DTC + Shopify";
}

function getMonthLabel(index: number) {
  return new Date(new Date().getFullYear(), index, 1).toLocaleString("en-US", { month: "short" });
}

function getMonthPeriod(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleString("en-US", { month: "short" });
}

function toDateOnly(value: string) {
  return value.slice(0, 10);
}

function dateOnlyDaysAgo(daysAgo: number) {
  return new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
}

function getManufacturingStatus(po: PurchaseOrder): "Draft" | "Ordered" | "In Production" | "Shipped" | "Received" | "Delayed" {
  if (po.status === "Delayed") return "Delayed";
  if (po.status === "Draft") return "Draft";
  if (["Received", "Partially Received", "Closed", "Fulfilled"].includes(po.status)) return "Received";
  if (po.status === "In Transit" || po.ship_date || po.tracking_number) return "Shipped";
  // TODO: "In Production" is inferred from paid-but-unshipped; add a dedicated production_status field for accuracy.
  if (po.invoice_paid_at) return "In Production";
  return "Ordered";
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .padEnd(2, "X")
    .slice(0, 2);
}

export const dashboardService = {
  async syncShopifyDashboard() {
    const supabase = assertSupabase();
    const { data, error } = await supabase.functions.invoke(SHOPIFY_DASHBOARD_SYNC_FUNCTION, {
      body: { mode: "year" },
    });

    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error ?? "Shopify dashboard sync failed.");
    return data as {
      ok: true;
      mode: string;
      lookbackDays: number | null;
      rangeStart: string | null;
      rangeEnd: string | null;
      matchedOrders: number;
      ordersSynced: number;
      lineItemsSynced: number;
    };
  },

  async getSnapshot(): Promise<DashboardSnapshot> {
    const supabase = assertSupabase();
    const [
      purchaseOrdersResponse,
      productsResponse,
      alertsResponse,
      importsResponse,
      activityResponse,
      sopsResponse,
      vendorsResponse,
      retailersResponse,
      eventsResponse,
      lineItemsResponse,
      inventoryItemsResponse,
      shopifyOrdersResponse,
      shopifyOrderLineItemsResponse,
      settingsResponse,
    ] = await Promise.all([
      supabase.from("purchase_orders").select("*"),
      supabase.from("products").select("*"),
      supabase.from("alerts").select("*").eq("is_resolved", false).order("created_at", { ascending: false }).limit(6),
      supabase.from("csv_imports").select("*, vendors(*)").order("created_at", { ascending: false }).limit(5),
      supabase.from("activity_events").select("*").order("created_at", { ascending: false }).limit(8),
      supabase.from("sops").select("*").order("is_favorite", { ascending: false }).order("updated_at", { ascending: false }).limit(5),
      supabase.from("vendors").select("*"),
      supabase.from("retailers").select("*"),
      supabase.from("inventory_events").select("*"),
      supabase.from("po_line_items").select("*"),
      supabase.from("inventory_items").select("*"),
      supabase.from("shopify_orders").select("*"),
      supabase.from("shopify_order_line_items").select("*"),
      supabase
        .from("app_settings")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    [
      purchaseOrdersResponse,
      productsResponse,
      alertsResponse,
      importsResponse,
      activityResponse,
      sopsResponse,
      vendorsResponse,
      retailersResponse,
      eventsResponse,
      lineItemsResponse,
      inventoryItemsResponse,
      shopifyOrdersResponse,
      shopifyOrderLineItemsResponse,
      settingsResponse,
    ].forEach((response) => {
      if (response.error) throw response.error;
    });

    const purchaseOrders = (purchaseOrdersResponse.data ?? []) as PurchaseOrder[];
    const rawProducts = (productsResponse.data ?? []) as Product[];
    const alerts = (alertsResponse.data ?? []) as Alert[];
    const imports = (importsResponse.data ?? []) as CsvImport[];
    const activity = (activityResponse.data ?? []) as ActivityEvent[];
    const sops = (sopsResponse.data ?? []) as Sop[];
    const vendors = (vendorsResponse.data ?? []) as Vendor[];
    const retailers = (retailersResponse.data ?? []) as Retailer[];
    const events = (eventsResponse.data ?? []) as InventoryEvent[];
    const lineItems = (lineItemsResponse.data ?? []) as PoLineItem[];
    const inventoryItems = (inventoryItemsResponse.data ?? []) as InventoryItem[];
    const shopifyOrders = (shopifyOrdersResponse.data ?? []) as ShopifyOrder[];
    const shopifyOrderLineItems = (shopifyOrderLineItemsResponse.data ?? []) as ShopifyOrderLineItem[];
    const settings = settingsResponse.data;
    const products = applyCalculatedSafetyStock(rawProducts, vendors, events);

    const vendorById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
    const retailerById = new Map(retailers.map((retailer) => [retailer.id, retailer]));
    const productById = new Map(products.map((product) => [product.id, product]));
    const eventsByProductId = new Map<string, InventoryEvent[]>();
    events.forEach((event) => {
      if (!event.product_id) return;
      const current = eventsByProductId.get(event.product_id) ?? [];
      current.push(event);
      eventsByProductId.set(event.product_id, current);
    });
    const lineItemsByPo = new Map<string, PoLineItem[]>();
    lineItems.forEach((item) => {
      const current = lineItemsByPo.get(item.purchase_order_id) ?? [];
      current.push(item);
      lineItemsByPo.set(item.purchase_order_id, current);
    });

    const vendorRiskCount = vendors.filter((vendor) => {
      const vendorPos = purchaseOrders.filter((po) => po.vendor_id === vendor.id);
      return calculateVendorReliability(vendor, vendorPos, lineItemsByPo) < 65;
    }).length;

    const manufacturerOrders = purchaseOrders.filter((po) => po.po_type === "Manufacturer PO");
    const retailerOrders = purchaseOrders.filter((po) => po.po_type === "Retailer PO");
    const openOrders = purchaseOrders.filter((po) => !["Closed", "Received", "Cancelled"].includes(po.status));
    const activeManufacturerOrders = manufacturerOrders.filter((po) => !["Received", "Closed", "Cancelled"].includes(po.status));
    const wholesaleOrders = retailerOrders.filter((po) => normalizeChannelName(po.source_channel) !== "DTC + Shopify" && po.status !== "Cancelled");
    const openRetailerOrders = retailerOrders.filter((po) => !["Closed", "Received", "Cancelled"].includes(po.status));
    const activeWholesalePipelineOrders = openRetailerOrders.filter((po) => normalizeChannelName(po.source_channel) !== "DTC + Shopify");

    const today = new Date().toISOString().slice(0, 10);
    const twentySevenDaysAgo = dateOnlyDaysAgo(27);
    const currentYear = new Date().getFullYear();
    const currentYearStart = `${currentYear}-01-01`;
    const priorYearStart = `${currentYear - 1}-01-01`;
    const priorYearCutoff = `${currentYear - 1}-${today.slice(5)}`;
    const trailingYearStart = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
    const wholesaleOrdersYtd = wholesaleOrders.filter((po) => {
      const effectiveDate = po.submitted_at ?? po.order_date ?? toDateOnly(po.created_at);
      return effectiveDate >= currentYearStart;
    });
    const retailerOrdersYtd = retailerOrders.filter((po) => {
      const effectiveDate = po.submitted_at ?? po.order_date ?? toDateOnly(po.created_at);
      return effectiveDate >= currentYearStart && po.status !== "Cancelled";
    });
    const retailerOrdersPriorYtd = retailerOrders.filter((po) => {
      const effectiveDate = po.submitted_at ?? po.order_date ?? toDateOnly(po.created_at);
      return effectiveDate >= priorYearStart && effectiveDate <= priorYearCutoff && po.status !== "Cancelled";
    });
    const retailerOrdersTrailingYear = retailerOrders.filter((po) => {
      const effectiveDate = po.submitted_at ?? po.order_date ?? toDateOnly(po.created_at);
      return effectiveDate >= trailingYearStart && po.status !== "Cancelled";
    });
    const getWholesaleRevenue = (po: PurchaseOrder) =>
      (lineItemsByPo.get(po.id) ?? []).reduce((sum, item) => {
        const product = item.product_id ? productById.get(item.product_id) : null;
        const price = Number(product?.unit_price ?? 0) > 0 ? Number(product?.unit_price ?? 0) : Number(item.unit_cost ?? 0);
        return sum + price * Number(item.quantity_ordered ?? 0);
      }, 0);
    const wholesaleRevenueTotal = wholesaleOrdersYtd.reduce((sum, po) => sum + getWholesaleRevenue(po), 0);
    const getRetailRevenue = (po: PurchaseOrder) =>
      (lineItemsByPo.get(po.id) ?? []).reduce((sum, item) => {
        const product = item.product_id ? productById.get(item.product_id) : null;
        const price = Number(product?.unit_price ?? 0) > 0 ? Number(product?.unit_price ?? 0) : Number(item.unit_cost ?? 0);
        return sum + price * Number(item.quantity_ordered ?? 0);
      }, 0);

    const poMapPoints = activeWholesalePipelineOrders
      .map((po) => ({
        poId: po.id,
        poNumber: po.po_number,
        account: retailerById.get(po.retailer_id ?? "")?.name ?? po.ship_to_company_name ?? "Unassigned account",
        city: po.ship_to_city ?? po.bill_to_city,
        state: po.ship_to_state ?? po.bill_to_state,
        status: po.status,
        sourceChannel: po.source_channel,
        value: getRetailRevenue(po),
        units: Number(po.total_units ?? 0),
      }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 24);

    const openWholesalePipelineLedger = activeWholesalePipelineOrders
      .map((po) => ({
        poId: po.id,
        poNumber: po.po_number,
        partner: retailerById.get(po.retailer_id ?? "")?.name ?? vendorById.get(po.vendor_id ?? "")?.name ?? po.ship_to_company_name ?? "Unassigned",
        value: Number(po.total_cost ?? 0),
        status: po.status,
      }))
      .sort((left, right) => right.value - left.value);

    const poStatusCounts = activeWholesalePipelineOrders
      .reduce<Map<string, number>>((acc, po) => {
        acc.set(po.status, (acc.get(po.status) ?? 0) + 1);
        return acc;
      }, new Map<string, number>());

    const missingPoLocationCount = activeWholesalePipelineOrders.filter((po) => !(po.ship_to_state ?? po.bill_to_state)).length;

    const latePurchaseOrders = [...activeWholesalePipelineOrders, ...activeManufacturerOrders]
      .filter((po) => {
        const dueDate = po.eta_date ?? po.expected_delivery_date;
        return po.status === "Delayed" || (!!dueDate && dueDate < today);
      })
      .map((po) => {
        const etaDate = po.eta_date ?? po.expected_delivery_date;
        return {
          poId: po.id,
          poNumber: po.po_number,
          partner: retailerById.get(po.retailer_id ?? "")?.name ?? vendorById.get(po.vendor_id ?? "")?.name ?? "Unassigned",
          etaDate,
          status: po.status === "Delayed" ? po.status : getShipmentStatus(po),
          // TODO: replace with a dedicated delay_reason field once available
          reason: po.notes?.trim() || "No delay reason logged yet",
          daysLate: getDaysLate(etaDate),
        };
      })
      .sort((left, right) => (left.etaDate ?? "9999-12-31").localeCompare(right.etaDate ?? "9999-12-31"));

    const getPoUnits = (po: PurchaseOrder) => {
      const lineUnits = (lineItemsByPo.get(po.id) ?? []).reduce((sum, item) => sum + Number(item.quantity_ordered ?? 0), 0);
      return lineUnits > 0 ? lineUnits : Number(po.total_units ?? 0);
    };

    const shippedUnitsLedgerStart = dateOnlyDaysAgo(400);
    const shippedUnitsLedger = purchaseOrders
      .filter((po) => po.status !== "Cancelled")
      .map((po) => {
        const shipDate = po.ship_date ?? po.actual_delivery_date;
        if (shipDate) return { po, date: shipDate, source: "shipped" as const };
        if (po.status !== "Draft") {
          const orderDate = po.order_date ?? po.submitted_at ?? toDateOnly(po.created_at);
          return { po, date: orderDate, source: "ordered" as const };
        }
        return null;
      })
      .filter((entry): entry is { po: PurchaseOrder; date: string; source: "shipped" | "ordered" } =>
        !!entry && !!entry.date && entry.date >= shippedUnitsLedgerStart && entry.date <= today,
      )
      .map(({ po, date, source }) => ({
        poId: po.id,
        poNumber: po.po_number,
        partner:
          retailerById.get(po.retailer_id ?? "")?.name ??
          vendorById.get(po.vendor_id ?? "")?.name ??
          po.ship_to_company_name ??
          po.bill_to_company_name ??
          "Unassigned",
        shipDate: date,
        source,
        units: getPoUnits(po),
      }));

    const incomingByProduct = new Map<string, number>();
    products.forEach((product) => {
      incomingByProduct.set(product.id, getIncomingQuantityForProduct(product.id, activeManufacturerOrders, lineItemsByPo));
    });

    const incomingInventoryByManufacturer = activeManufacturerOrders
      .reduce<Map<string, number>>((acc, po) => {
        const manufacturer = vendorById.get(po.vendor_id ?? "")?.name ?? "Unassigned";
        const incomingUnits = (lineItemsByPo.get(po.id) ?? []).reduce(
          (sum, item) => sum + Math.max(Number(item.quantity_ordered ?? 0) - Number(item.quantity_received ?? 0), 0),
          0,
        );
        acc.set(manufacturer, (acc.get(manufacturer) ?? 0) + incomingUnits);
        return acc;
      }, new Map<string, number>())
      .entries();

    const skuReorderWindows = products
      .map((product) => {
        const incomingQuantity = incomingByProduct.get(product.id) ?? 0;
        const vendorLeadTimeDays = vendorById.get(product.vendor_id ?? "")?.lead_time_days ?? 0;
        const forecast = calculateForecastMetric(
          product,
          eventsByProductId.get(product.id) ?? [],
          vendorLeadTimeDays,
        );
        const reorderWindow = buildSkuReorderWindow({
          product,
          vendor: vendorById.get(product.vendor_id ?? ""),
          events: eventsByProductId.get(product.id) ?? [],
          incomingQuantity,
        });
        const currentQuantity = product.current_inventory;
        const isOversold = currentQuantity < 0;
        const oversoldQuantity = Math.max(-currentQuantity, 0);
        const shortageQuantity = isOversold ? 0 : Math.max(Number(product.safety_stock ?? 0) - currentQuantity, 0);
        const statusLabel = isOversold
          ? `Oversold by ${oversoldQuantity} pairs`
          : reorderWindow.recommendation === "Reorder now"
            ? "Reorder Now"
            : reorderWindow.recommendation.startsWith("Reorder within")
              ? "Reorder Soon"
              : reorderWindow.recommendation;
        return {
          sku: product.sku,
          productName: product.name,
          recommendation: reorderWindow.recommendation,
          reorderByDate: reorderWindow.reorderByDate,
          currentQuantity,
          incomingQuantity,
          projectedDaysRemaining: forecast.projectedDaysRemaining,
          variantTitle: product.variant_title,
          shortageQuantity,
          oversoldQuantity,
          isOversold,
          statusLabel,
        };
      })
      .sort((left, right) => left.currentQuantity - right.currentQuantity);

    const reorderNowItems = skuReorderWindows
      .filter((item) => item.recommendation.toLowerCase().includes("reorder") || item.currentQuantity <= 25)
      .slice()
      .sort((left, right) => {
        if (left.isOversold !== right.isOversold) return left.isOversold ? -1 : 1;
        return left.currentQuantity - right.currentQuantity;
      });

    const inventoryAlerts = products
      .map((product) => {
        const currentQuantity = product.current_inventory;
        const incomingQuantity = incomingByProduct.get(product.id) ?? 0;
        const status = getInventoryHealthTone(currentQuantity, product.safety_stock);
        const riskStatus =
          currentQuantity < 0
            ? ("Oversold" as const)
            : status === "danger"
              ? ("Low Stock" as const)
              : status === "warning"
                ? ("Reorder Soon" as const)
                : incomingQuantity > 0
                  ? ("Incoming Shipment" as const)
                  : ("Safe" as const);
        return {
          sku: product.sku,
          productName: product.name,
          currentQuantity,
          incomingQuantity,
          status,
          committedQuantity: product.inventory_allocated,
          riskStatus,
        };
      })
      .filter((item) => item.status !== "healthy" || item.incomingQuantity > 0)
      .sort((left, right) => left.currentQuantity - right.currentQuantity)
      .slice(0, 8);

    const dangerProducts = products.filter((product) => isInventoryDanger(product.current_inventory));
    const riskyProducts90d = skuReorderWindows.filter((item) => item.projectedDaysRemaining !== null && item.projectedDaysRemaining <= 90);
    const openInvoices = activeManufacturerOrders.filter((po) => getInvoiceStatus(po) === "Open");
    const shippedInvoices = activeManufacturerOrders.filter((po) => getInvoiceStatus(po) === "Shipped");
    const inventoryInRoute = activeManufacturerOrders.filter((po) => ["In Route", "Inventory in Route"].includes(getInvoiceStatus(po)));
    const atRiskManufacturerPo = manufacturerOrders.find(
      (po) => po.invoice_paid_at && !po.tracking_number && !["Received", "Closed"].includes(po.status),
    );

    const manufacturingSnapshotRows = activeManufacturerOrders
      .map((po) => {
        const poLineItems = lineItemsByPo.get(po.id) ?? [];
        const incomingUnits = poLineItems.reduce((sum, item) => sum + Math.max(Number(item.quantity_ordered ?? 0) - Number(item.quantity_received ?? 0), 0), 0);
        const uniqueSkuCount = new Set(poLineItems.map((item) => item.sku)).size;
        const reorderWindowSummary = poLineItems
          .slice(0, 2)
          .map((item) => {
            const product = item.product_id ? productById.get(item.product_id) : null;
            if (!product) return item.sku;
            const entry = skuReorderWindows.find((window) => window.sku === product.sku);
            return entry ? `${entry.sku}: ${entry.recommendation}` : item.sku;
          })
          .join(" | ");

        return {
          poId: po.id,
          poNumber: po.po_number,
          manufacturer: vendorById.get(po.vendor_id ?? "")?.name ?? "Unassigned",
          invoiceStatus: getInvoiceStatus(po),
          shipmentStatus: getShipmentStatus(po),
          etaDate: po.eta_date ?? po.expected_delivery_date,
          shipDate: po.ship_date,
          skuCount: uniqueSkuCount,
          incomingUnits,
          reorderWindowSummary: reorderWindowSummary || "No reorder recommendation yet",
        };
      })
      .sort((left, right) => (left.etaDate ?? "9999-12-31").localeCompare(right.etaDate ?? "9999-12-31"));

    const manufacturingIncoming = activeManufacturerOrders
      .flatMap((po) => {
        const manufacturer = vendorById.get(po.vendor_id ?? "")?.name ?? "Unassigned";
        const orderedDate = po.order_date ?? po.submitted_at;
        const paymentStatus: "Paid" | "Unpaid" = po.invoice_paid_at ? "Paid" : "Unpaid";
        const shipDate = po.ship_date;
        const arrivalDate = po.eta_date ?? po.expected_delivery_date ?? po.actual_delivery_date;
        const manufacturingStatus = getManufacturingStatus(po);
        return (lineItemsByPo.get(po.id) ?? [])
          .filter((item) => Number(item.quantity_ordered ?? 0) - Number(item.quantity_received ?? 0) > 0)
          .map((item) => ({
            id: `${po.id}-${item.id}`,
            poId: po.id,
            poNumber: po.po_number,
            manufacturer,
            productName: item.product_name || item.sku,
            sku: item.sku,
            quantityOrdered: Number(item.quantity_ordered ?? 0) - Number(item.quantity_received ?? 0),
            orderedDate,
            paymentStatus,
            shipDate,
            arrivalDate,
            manufacturingStatus,
          }));
      })
      .sort((left, right) => (left.arrivalDate ?? "9999-12-31").localeCompare(right.arrivalDate ?? "9999-12-31"));

    const activeSkusInRoute = new Set(
      inventoryInRoute.flatMap((po) => (lineItemsByPo.get(po.id) ?? []).map((item) => item.sku)),
    ).size;

    const wholesaleAccounts = retailers
      .map((retailer) => {
        const accountOrders = wholesaleOrders.filter((po) => po.retailer_id === retailer.id);
        return {
          retailerId: retailer.id,
          retailer: retailer.name,
          openInvoices: accountOrders.filter((po) => getInvoiceStatus(po) === "Open").length,
          shippedInvoices: accountOrders.filter((po) => ["Shipped", "In Route", "Inventory in Route"].includes(getInvoiceStatus(po))).length,
          recentPoCount: accountOrders.slice(0, 90).length,
          nextWindow: endOfWindow(retailer.next_reorder_start, retailer.next_reorder_end),
        };
      })
      .filter((item) => item.openInvoices > 0 || item.shippedInvoices > 0 || item.recentPoCount > 0)
      .slice(0, 8);

    const behindPaceAccounts = retailers
      .map((retailer) => {
        const accountOrders = wholesaleOrders.filter((po) => po.retailer_id === retailer.id);
        const recentSubmittedOrders = accountOrders.filter((po) => {
          const date = po.submitted_at ?? po.order_date ?? toDateOnly(po.created_at);
          return date >= trailingYearStart;
        }).length;
        const windowEnd = retailer.next_reorder_end;
        const windowStart = retailer.next_reorder_start;
        const windowExpired = !!windowEnd && windowEnd < today;
        const windowOpen = !!windowStart && windowStart <= today && (!windowEnd || windowEnd >= today);
        const hasOpenOrder = accountOrders.some((po) => !["Closed", "Received", "Cancelled"].includes(po.status));
        const status: "danger" | "warning" | "healthy" = windowExpired && !hasOpenOrder ? "danger" : windowOpen && !hasOpenOrder ? "warning" : "healthy";
        return {
          retailerId: retailer.id,
          retailer: retailer.name,
          currentPace: `${recentSubmittedOrders} PO${recentSubmittedOrders === 1 ? "" : "s"} trailing year`,
          comparison: endOfWindow(windowStart, windowEnd),
          status,
        };
      })
      .filter((item) => item.status !== "healthy")
      .sort((left, right) => left.status === "danger" && right.status !== "danger" ? -1 : 1)
      .slice(0, 8);

    const priorityFeed: DashboardSnapshot["priorityFeed"] = [
      ...dangerProducts.slice(0, 3).map((product) => ({
        id: `danger-${product.id}`,
        title: `${product.name} is in danger`,
        detail: `${product.current_inventory} units on hand. Incoming: ${incomingByProduct.get(product.id) ?? 0}`,
        severity: "danger" as const,
        actionLabel: "Reorder immediately",
      })),
      ...(atRiskManufacturerPo ? [{
        id: `po-${atRiskManufacturerPo.id}`,
        title: `PO ${atRiskManufacturerPo.po_number} is paid with no tracking`,
        detail: `Invoice paid ${atRiskManufacturerPo.invoice_paid_at}; follow up with manufacturer`,
        severity: "warning" as const,
        actionLabel: "Message vendor",
      }] : openInvoices.slice(0, 2).map((po) => ({
        id: `open-${po.id}`,
        title: `Open invoice ${po.po_number}`,
        detail: `${vendorById.get(po.vendor_id ?? "")?.name ?? "Manufacturer"} has not shipped yet.`,
        severity: "warning" as const,
        actionLabel: "Follow up on shipment timing",
      }))),
      ...wholesaleAccounts.slice(0, 2).map((account) => ({
        id: `account-${account.retailerId}`,
        title: `${account.retailer} reorder window`,
        detail: account.nextWindow,
        severity: "info" as const,
        actionLabel: "Review account profile",
      })),
    ];

    const productionTimelineRows = getProductionTimelineRows(manufacturerOrders);
    const avgOrderToArrivalDays = getAverageTimelineDays(productionTimelineRows, "orderToArrivalDays");
    const avgPaidToArrivalDays = getAverageTimelineDays(productionTimelineRows, "paidToArrivalDays");
    const productionTimelineExceptionCount = getProductionTimelineExceptionCount(productionTimelineRows);
    const productionTimelineTrend = getProductionTimelineTrend(productionTimelineRows);

    const dueIn14DaysCount = purchaseOrders.filter((po) => {
      if (!po.expected_delivery_date) return false;
      const delta = daysBetween(today, po.expected_delivery_date);
      return delta >= 0 && delta <= 14;
    }).length;
    const pendingIntakeCount = purchaseOrders.filter((po) => po.status === "Pending").length;
    const weightedForecastValue = retailerOrders.reduce((sum, po) => sum + Number(po.total_cost ?? 0) * 0.65, 0);
    const activePipelineValue = openOrders.reduce((sum, po) => sum + Number(po.total_cost ?? 0), 0);

    const pipelineByRetailer = retailers
      .map((retailer) => ({
        retailer: retailer.name,
        value: retailerOrders
          .filter((po) => po.retailer_id === retailer.id && !["Received", "Closed", "Cancelled"].includes(po.status))
          .reduce((sum, po) => sum + Number(po.total_cost ?? 0), 0),
      }))
      .filter((item) => item.value > 0)
      .sort((left, right) => right.value - left.value)
      .slice(0, 6);

    const reorderWindows = retailers
      .filter((retailer) => retailer.next_reorder_start || retailer.next_reorder_end)
      .slice(0, 5)
      .map((retailer) => ({
        retailer: retailer.name,
        window: endOfWindow(retailer.next_reorder_start, retailer.next_reorder_end),
        productHint: retailerOrders.find((po) => po.retailer_id === retailer.id)?.notes ?? "Use recent top-selling SKU mix",
      }));

    const shopifyOrderById = new Map(shopifyOrders.map((order) => [order.id, order]));
    const shopifyOrdersYtd = shopifyOrders.filter(
      (order) => !order.cancelled_at && toDateOnly(order.order_created_at) >= currentYearStart,
    );
    const shopifyOrdersPriorYtd = shopifyOrders.filter((order) => {
      const orderDate = toDateOnly(order.order_created_at);
      return !order.cancelled_at && orderDate >= priorYearStart && orderDate <= priorYearCutoff;
    });
    const shopifyOrdersTrailingYear = shopifyOrders.filter((order) => {
      const orderDate = toDateOnly(order.order_created_at);
      return !order.cancelled_at && orderDate >= trailingYearStart;
    });
    const shopifyRevenueYtd = shopifyOrdersYtd.reduce((sum, order) => sum + Number(order.current_total_price ?? 0), 0);
    const shopifyRevenuePriorYtd = shopifyOrdersPriorYtd.reduce((sum, order) => sum + Number(order.current_total_price ?? 0), 0);
    const shopifyRevenueTrailingYear = shopifyOrdersTrailingYear.reduce((sum, order) => sum + Number(order.current_total_price ?? 0), 0);
    const dtcRetailRevenueTrailingYear = retailerOrdersTrailingYear
      .filter((po) => normalizeChannelName(po.source_channel) === "DTC + Shopify")
      .reduce((sum, po) => sum + getRetailRevenue(po), 0);
    const dtcShopifyRevenueTrailingYear = dtcRetailRevenueTrailingYear + shopifyRevenueTrailingYear;

    const revenueYtd = retailerOrdersYtd.reduce((sum, po) => sum + getRetailRevenue(po), 0) + shopifyRevenueYtd;
    const derivedPriorRevenueYtd = retailerOrdersPriorYtd.reduce((sum, po) => sum + getRetailRevenue(po), 0) + shopifyRevenuePriorYtd;
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const endOfYear = new Date(now.getFullYear(), 11, 31);
    const elapsedDays = Math.max(Math.floor((now.getTime() - startOfYear.getTime()) / 86400000) + 1, 1);
    const totalDaysInYear = Math.floor((endOfYear.getTime() - startOfYear.getTime()) / 86400000) + 1;
    const priorRevenueYtd = Number(settings?.prior_ytd_revenue ?? derivedPriorRevenueYtd ?? 0);
    const priorRevenuePaceToDate = priorRevenueYtd > 0 ? (priorRevenueYtd / totalDaysInYear) * elapsedDays : 0;
    const revenueYtdDeltaPercent =
      priorRevenuePaceToDate > 0
        ? Math.round(((revenueYtd - priorRevenuePaceToDate) / priorRevenuePaceToDate) * 100)
        : 0;
    const projectedRevenueYearEnd = revenueYtd > 0 ? Math.round((revenueYtd / elapsedDays) * totalDaysInYear) : 0;
    const revenuePaceDeltaPercent =
      priorRevenuePaceToDate > 0
        ? Math.round(((revenueYtd - priorRevenuePaceToDate) / priorRevenuePaceToDate) * 100)
        : 0;

    const defaultChannels = [
      "DTC + Shopify",
      "CVS Health",
      "Navy Exchange",
      "Paradies Lagardere",
      "Scheels",
      "Dallas Wings",
      "Fundraisers",
    ];
    const revenueByChannelMap = new Map<string, number>(defaultChannels.map((channel) => [channel, 0]));
    retailerOrdersYtd.forEach((po) => {
      const normalizedSource = normalizeChannelName(po.source_channel);
      const retailerName = retailerById.get(po.retailer_id ?? "")?.name ?? "";
      const channel = retailerName || normalizedSource;
      if (!channel) return;
      revenueByChannelMap.set(channel, (revenueByChannelMap.get(channel) ?? 0) + getRetailRevenue(po));
    });
    revenueByChannelMap.set("DTC + Shopify", (revenueByChannelMap.get("DTC + Shopify") ?? 0) + shopifyRevenueYtd);
    const revenueByChannelYtd = [...revenueByChannelMap.entries()]
      .map(([channel, value]) => ({ channel, value }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 7);

    const wholesaleChannelRows = [...wholesaleOrdersYtd
      .reduce<Map<string, { channel: string; count: number; value: number }>>((acc, po) => {
        if (!isWholesaleChannel(po.source_channel)) return acc;
        const retailerName = retailerById.get(po.retailer_id ?? "")?.name;
        const channel = (po.source_channel && po.source_channel.trim()) || retailerName || "Wholesale";
        const current = acc.get(channel) ?? { channel, count: 0, value: 0 };
        current.count += 1;
        current.value += getRetailRevenue(po);
        acc.set(channel, current);
        return acc;
      }, new Map<string, { channel: string; count: number; value: number }>())
      .values()]
      .sort((left, right) => right.value - left.value)
      .slice(0, 6);

    const purchaserVelocityBase = retailers
      .map((retailer) => {
        const accountOrders = wholesaleOrders
          .filter((po) => po.retailer_id === retailer.id)
          .map((po) => ({
            date: po.submitted_at ?? po.order_date ?? toDateOnly(po.created_at),
            units: getPoUnits(po),
          }))
          .filter((entry) => entry.units > 0)
          .sort((left, right) => left.date.localeCompare(right.date));

        if (!accountOrders.length) return null;

        const recentPairs = accountOrders
          .filter((entry) => entry.date >= twentySevenDaysAgo)
          .reduce((sum, entry) => sum + entry.units, 0);
        const monthlyPeaks = accountOrders.reduce<Map<string, number>>((acc, entry) => {
          const monthKey = entry.date.slice(0, 7);
          acc.set(monthKey, (acc.get(monthKey) ?? 0) + entry.units);
          return acc;
        }, new Map<string, number>());
        const best = [...monthlyPeaks.entries()]
          .map(([monthKey, units]) => ({
            pairsPerWeek: Math.round(units / 4.345),
            period: getMonthPeriod(`${monthKey}-01`),
          }))
          .sort((left, right) => right.pairsPerWeek - left.pairsPerWeek)[0];

        return {
          retailerId: retailer.id,
          purchaser: retailer.name,
          initials: getInitials(retailer.name),
          pairsPerWeek: Math.round(recentPairs / 4),
          bestPairsPerWeek: best?.pairsPerWeek ?? null,
          bestPeriod: best?.period ?? null,
          recentPairs,
          orderCount: accountOrders.length,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
    const purchaserVelocityAverage = purchaserVelocityBase.length
      ? Math.round(purchaserVelocityBase.reduce((sum, row) => sum + row.pairsPerWeek, 0) / purchaserVelocityBase.length)
      : 0;
    const purchaserVelocityRowsWithDelta = purchaserVelocityBase.map((row) => {
      const deltaVsAverage = row.pairsPerWeek - purchaserVelocityAverage;
      const status: "moving" | "steady" | "stalling" =
        row.pairsPerWeek === 0 || deltaVsAverage < -Math.max(5, Math.round(purchaserVelocityAverage * 0.25))
          ? "stalling"
          : deltaVsAverage > Math.max(5, Math.round(purchaserVelocityAverage * 0.15))
            ? "moving"
            : "steady";
      return {
        ...row,
        deltaVsAverage,
        status,
      };
    });
    const purchaserVelocityRows = [
      ...purchaserVelocityRowsWithDelta
        .sort((left, right) => right.pairsPerWeek - left.pairsPerWeek)
        .slice(0, 3),
      ...purchaserVelocityRowsWithDelta
        .filter((row) => row.deltaVsAverage < 0)
        .sort((left, right) => left.deltaVsAverage - right.deltaVsAverage)
        .slice(0, 2),
    ]
      .filter((row, index, rows) => rows.findIndex((candidate) => candidate.retailerId === row.retailerId) === index)
      .slice(0, 5);

    const topSkusMap = new Map<string, { sku: string; label: string; value: number; units: number }>();
    retailerOrdersYtd.forEach((po) => {
      (lineItemsByPo.get(po.id) ?? []).forEach((item) => {
        const product = item.product_id ? productById.get(item.product_id) : null;
        const price = Number(product?.unit_price ?? 0) > 0 ? Number(product?.unit_price ?? 0) : Number(item.unit_cost ?? 0);
        const key = item.sku || item.product_name;
        const current = topSkusMap.get(key) ?? {
          sku: item.sku,
          label: item.product_name,
          value: 0,
          units: 0,
        };
        current.value += price * Number(item.quantity_ordered ?? 0);
        current.units += Number(item.quantity_ordered ?? 0);
        topSkusMap.set(key, current);
      });
    });
    shopifyOrderLineItems.forEach((item) => {
      const order = shopifyOrderById.get(item.shopify_order_record_id);
      if (!order || order.cancelled_at || order.order_created_at.slice(0, 10) < currentYearStart) return;
      const key = item.sku ?? item.title;
      const current = topSkusMap.get(key) ?? {
        sku: item.sku ?? "",
        label: item.title,
        value: 0,
        units: 0,
      };
      current.value += Number(item.line_total ?? 0);
      current.units += Number(item.quantity ?? 0);
      topSkusMap.set(key, current);
    });
    const topSkusYtd = [...topSkusMap.values()]
      .sort((left, right) => right.value - left.value)
      .slice(0, 6);

    const dtcOrdersToday = shopifyOrders.filter(
      (order) => !order.cancelled_at && order.order_created_at.slice(0, 10) === today,
    );
    const dtcOrdersTodayValue = dtcOrdersToday.reduce((sum, order) => sum + Number(order.current_total_price ?? 0), 0);

    const revenueEvents = [
      ...retailerOrdersYtd.map((po) => ({
        date: po.submitted_at ?? po.order_date ?? po.created_at,
        value: getRetailRevenue(po),
      })),
      ...shopifyOrdersYtd.map((order) => ({
        date: order.order_created_at,
        value: Number(order.current_total_price ?? 0),
      })),
    ];
    const actualRevenueByMonth = Array.from({ length: 12 }, (_, index) => {
      const monthEnd = new Date(now.getFullYear(), index + 1, 0);
      if (monthEnd > now) return null;
      return revenueEvents
        .filter((entry) => new Date(entry.date).getMonth() <= index)
        .reduce((sum, entry) => sum + entry.value, 0);
    });
    const revenueProjectionTrend = Array.from({ length: 12 }, (_, index) => {
      const monthEnd = new Date(now.getFullYear(), index + 1, 0);
      const daysIntoMonthTarget = Math.min(
        Math.floor((monthEnd.getTime() - startOfYear.getTime()) / 86400000) + 1,
        totalDaysInYear,
      );
      return {
        label: getMonthLabel(index),
        actualRevenue: actualRevenueByMonth[index],
        projectedRevenue: revenueYtd > 0 ? Math.round((revenueYtd / elapsedDays) * daysIntoMonthTarget) : 0,
        priorBaselineRevenue: priorRevenueYtd > 0 ? Math.round((priorRevenueYtd / totalDaysInYear) * daysIntoMonthTarget) : 0,
      };
    });

    const stockTrend = Array.from(
      inventoryItems.reduce<Map<string, number>>((acc, item) => {
        const date = item.updated_at?.slice(0, 10) ?? item.created_at?.slice(0, 10);
        if (!date) return acc;
        acc.set(date, (acc.get(date) ?? 0) + Number(item.quantity_on_hand ?? 0));
        return acc;
      }, new Map<string, number>()),
    )
      .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
      .slice(-8)
      .map(([date, inventory]) => ({ date, inventory }));
    const inventoryStatusBreakdown = [
      {
        label: "Healthy",
        value: products.filter((product) => getInventoryHealthTone(product.current_inventory, product.safety_stock) === "healthy").length,
        color: "#1f8f63",
      },
      {
        label: "Warning",
        value: products.filter((product) => getInventoryHealthTone(product.current_inventory, product.safety_stock) === "warning").length,
        color: "#f2a93b",
      },
      {
        label: "Danger",
        value: products.filter((product) => getInventoryHealthTone(product.current_inventory, product.safety_stock) === "danger").length,
        color: "#e72027",
      },
    ];

    return {
      openPoCount: openOrders.length,
      delayedPoCount: purchaseOrders.filter((po) => po.status === "Delayed").length,
      lowStockCount: products.filter((product) => product.current_inventory <= product.safety_stock).length,
      projectedStockoutCount: alerts.filter((alert) => alert.alert_type === "Projected Stockout").length,
      vendorRiskCount,
      inventoryValue: products.reduce((sum, product) => sum + Number(product.current_inventory ?? 0) * Number(product.unit_cost ?? 0), 0),
      weightedForecastValue,
      activePipelineValue,
      dueIn14DaysCount,
      pendingIntakeCount,
      avgOrderToArrivalDays,
      avgPaidToArrivalDays,
      productionTimelineExceptionCount,
      productionTimelineTrend,
      recentImports: imports,
      recentAlerts: alerts,
      recentActivity: activity,
      quickSops: sops,
      stockTrend,
      inventoryStatusBreakdown,
      spendByVendor: purchaseOrders
        .reduce<Array<{ vendor: string; spend: number }>>((acc, po) => {
          const vendorName = vendorById.get(po.vendor_id ?? "")?.name ?? "Unassigned";
          const current = acc.find((entry) => entry.vendor === vendorName);
          if (current) current.spend += Number(po.total_cost ?? 0);
          else acc.push({ vendor: vendorName, spend: Number(po.total_cost ?? 0) });
          return acc;
        }, [])
        .sort((left, right) => right.spend - left.spend)
        .slice(0, 6),
      incomingInventoryByManufacturer: [...incomingInventoryByManufacturer]
        .map(([manufacturer, units]) => ({ manufacturer, units }))
        .filter((entry) => entry.units > 0)
        .sort((left, right) => right.units - left.units)
        .slice(0, 6),
      revenueYtd,
      revenueYtdDeltaPercent,
      activeWholesalePipelineValue: activeWholesalePipelineOrders.reduce((sum, po) => sum + Number(po.total_cost ?? 0), 0),
      activeWholesalePipelineCount: activeWholesalePipelineOrders.length,
      awaitingActionCount: openInvoices.length + dangerProducts.length,
      awaitingPoSubmissionCount: purchaseOrders.filter((po) => po.status === "Draft").length,
      skuOosRisk90dCount: riskyProducts90d.length,
      skuOosRiskCriticalCount: riskyProducts90d.filter((item) => (item.projectedDaysRemaining ?? Number.POSITIVE_INFINITY) <= 30).length,
      productionPosInFlightCount: activeManufacturerOrders.length,
      productionNextLandDate: manufacturingSnapshotRows[0]?.etaDate ?? null,
      dtcOrdersTodayCount: dtcOrdersToday.length,
      dtcOrdersTodayValue,
      dtcShopifyRevenueTrailingYear,
      priorRevenueYtd,
      projectedRevenueYearEnd,
      revenuePaceDeltaPercent,
      revenueByChannelYtd,
      wholesaleChannelRows,
      poMapPoints,
      openWholesalePipelineLedger,
      poStatusCounts: [...poStatusCounts.entries()]
        .map(([status, count]) => ({ status, count }))
        .sort((left, right) => right.count - left.count),
      missingPoLocationCount,
      latePurchaseOrders,
      behindPaceAccounts,
      shippedUnitsLedger,
      purchaserVelocityAverage,
      purchaserVelocityRows,
      topSkusYtd,
      revenueProjectionTrend,
      priorityFeed,
      pipelineByRetailer,
      reorderWindows,
      wholesaleRevenueTotal,
      dangerSkuCount: dangerProducts.length,
      incomingInventoryUnits: [...incomingByProduct.values()].reduce((sum, value) => sum + value, 0),
      openInvoiceCount: openInvoices.length,
      shippedInvoiceCount: shippedInvoices.length,
      inventoryInRouteCount: inventoryInRoute.length,
      activeSkusInRoute,
      manufacturingSnapshotRows,
      manufacturingIncoming,
      wholesaleAccounts,
      inventoryAlerts,
      skuReorderWindows,
      reorderNowItems,
    };
  },
};
