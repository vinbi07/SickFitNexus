import { useMemo } from "react";
import { assertSupabase } from "@/lib/supabase";
import { useAsyncData } from "@/hooks/useAsyncData";
import {
  adaptComplianceToEvents,
  adaptInventoryToEvents,
  adaptInvoicesToEvents,
  adaptLookbookAccessToEvents,
  adaptManualEventsToEvents,
  adaptProductionPlansToEvents,
  adaptPurchaseOrdersToEvents,
  adaptRetailersToEvents,
} from "@/lib/calendar/calendarAdapters";
import type { CalendarEvent } from "@/lib/calendar/calendarTypes";
import { calendarService } from "@/services/calendarService";
import { complianceService } from "@/services/complianceService";
import { invoiceService } from "@/services/invoiceService";
import { productionPlanService } from "@/services/productionPlanService";
import { purchaseOrderService } from "@/services/purchaseOrderService";
import { retailerService } from "@/services/retailerService";
import { buyerService } from "@/services/buyerService";
import { vendorService } from "@/services/vendorService";
import type { InventoryEvent, Product, Retailer, Vendor } from "@/types/domain";
import { toDateInput } from "@/utils/date";

async function loadAllCalendarSourceData() {
  const supabase = assertSupabase();

  const [
    purchaseOrders,
    invoices,
    productionPlans,
    retailers,
    complianceRequirements,
    complianceDocuments,
    buyers,
    manualEvents,
    vendors,
    productsResponse,
    inventoryEventsResponse,
  ] = await Promise.all([
    purchaseOrderService.list(),
    invoiceService.list(),
    productionPlanService.list(),
    retailerService.list(),
    complianceService.listRequirements(),
    complianceService.listDocuments(),
    buyerService.list(),
    calendarService.listManualEvents(),
    vendorService.list(),
    supabase.from("products").select("*"),
    supabase.from("inventory_events").select("*"),
  ]);

  if (productsResponse.error) throw productsResponse.error;
  if (inventoryEventsResponse.error) throw inventoryEventsResponse.error;

  const products = (productsResponse.data ?? []) as Product[];
  const inventoryEvents = (inventoryEventsResponse.data ?? []) as InventoryEvent[];

  const inventoryEventsByProductId = new Map<string, InventoryEvent[]>();
  for (const event of inventoryEvents) {
    if (!event.product_id) continue;
    const bucket = inventoryEventsByProductId.get(event.product_id) ?? [];
    bucket.push(event);
    inventoryEventsByProductId.set(event.product_id, bucket);
  }

  const vendorsById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
  const retailersById = new Map(retailers.map((retailer) => [retailer.id, retailer]));
  const productsById = new Map(products.map((product) => [product.id, product]));

  return {
    purchaseOrders,
    invoices,
    productionPlans,
    retailers,
    complianceRequirements,
    complianceDocuments,
    buyers,
    manualEvents,
    products,
    inventoryEventsByProductId,
    vendorsById,
    retailersById,
    productsById,
  };
}

export function useCalendarEvents() {
  const { data, loading, error, reload } = useAsyncData(loadAllCalendarSourceData, []);

  const events = useMemo<CalendarEvent[]>(() => {
    if (!data) return [];
    const today = toDateInput(new Date());

    return [
      ...adaptPurchaseOrdersToEvents(data.purchaseOrders, today),
      ...adaptInvoicesToEvents(data.invoices, today),
      ...adaptProductionPlansToEvents(data.productionPlans, today),
      ...adaptInventoryToEvents(data.products, data.inventoryEventsByProductId, data.vendorsById, today),
      ...adaptRetailersToEvents(data.retailers, today),
      ...adaptComplianceToEvents(data.complianceRequirements, data.complianceDocuments, today),
      ...adaptLookbookAccessToEvents(data.buyers, today),
      ...adaptManualEventsToEvents(data.manualEvents, data.retailersById, data.vendorsById, data.productsById),
    ].filter((event) => Boolean(event.date));
  }, [data]);

  const retailerOptions = useMemo<Retailer[]>(() => data?.retailers ?? [], [data]);
  const manufacturerOptions = useMemo<Vendor[]>(() => (data ? [...data.vendorsById.values()] : []), [data]);
  const productOptions = useMemo<Product[]>(() => data?.products ?? [], [data]);

  return { events, loading, error, reload, retailerOptions, manufacturerOptions, productOptions };
}
