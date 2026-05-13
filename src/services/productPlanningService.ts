import type { InventoryEvent, Product, Vendor } from "@/types/domain";
import { calculateRecommendedSafetyStock } from "@/utils/forecasting";

export function applyCalculatedSafetyStock(
  products: Product[],
  vendors: Vendor[],
  events: InventoryEvent[],
) {
  const vendorsById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
  const eventsByProductId = new Map<string, InventoryEvent[]>();

  events.forEach((event) => {
    if (!event.product_id) return;
    const current = eventsByProductId.get(event.product_id) ?? [];
    current.push(event);
    eventsByProductId.set(event.product_id, current);
  });

  return products.map((product) => {
    const vendorLeadTimeDays = product.vendor_id ? vendorsById.get(product.vendor_id)?.lead_time_days ?? 0 : 0;
    return {
      ...product,
      safety_stock: calculateRecommendedSafetyStock(
        product,
        eventsByProductId.get(product.id) ?? [],
        vendorLeadTimeDays,
      ),
    };
  });
}
