import { assertSupabase } from "@/lib/supabase";
import { deleteFromTable, upsertTable } from "@/services/baseService";
import type { PurchaseOrder, Retailer } from "@/types/domain";
import { addDays, toDateInput } from "@/utils/date";

function calculateCadence(purchaseOrders: PurchaseOrder[]) {
  const ordered = purchaseOrders
    .map((po) => po.order_date)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => left.localeCompare(right));

  if (ordered.length < 2) return null;

  const deltas: number[] = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = new Date(ordered[index - 1]);
    const current = new Date(ordered[index]);
    deltas.push(Math.round((current.getTime() - previous.getTime()) / 86400000));
  }

  return Math.round(deltas.reduce((sum, value) => sum + value, 0) / deltas.length);
}

export const retailerService = {
  async list() {
    const supabase = assertSupabase();
    const { data, error } = await supabase.from("retailers").select("*").order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Retailer[];
  },

  async upsert(payload: Partial<Retailer>) {
    const [saved] = (await upsertTable<Retailer>("retailers", payload)) as Retailer[];
    return saved;
  },

  remove: (id: string) => deleteFromTable("retailers", id),

  async getSnapshots() {
    const supabase = assertSupabase();
    const [retailersResponse, purchaseOrdersResponse, locationsResponse, requirementsResponse] = await Promise.all([
      supabase.from("retailers").select("*").order("name", { ascending: true }),
      supabase.from("purchase_orders").select("*").not("retailer_id", "is", null),
      supabase.from("locations").select("*"),
      supabase.from("retailer_compliance_requirements").select("*"),
    ]);

    if (retailersResponse.error) throw retailersResponse.error;
    if (purchaseOrdersResponse.error) throw purchaseOrdersResponse.error;
    if (locationsResponse.error) throw locationsResponse.error;
    if (requirementsResponse.error) throw requirementsResponse.error;

    const retailers = (retailersResponse.data ?? []) as Retailer[];
    const purchaseOrders = (purchaseOrdersResponse.data ?? []) as PurchaseOrder[];
    const locations = (locationsResponse.data ?? []) as Array<{ id: string; retailer_id: string | null }>;
    const requirements = (requirementsResponse.data ?? []) as Array<{ retailer_id: string; status: string }>;

    return retailers.map((retailer) => {
      const retailerOrders = purchaseOrders.filter((po) => po.retailer_id === retailer.id);
      const cadence = retailer.ordering_cadence_days ?? calculateCadence(retailerOrders);
      const lastOrderDate = retailerOrders
        .map((po) => po.order_date)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1);

      const reorderStart = cadence && lastOrderDate ? toDateInput(addDays(new Date(lastOrderDate), cadence - 4)) : retailer.next_reorder_start;
      const reorderEnd = cadence && lastOrderDate ? toDateInput(addDays(new Date(lastOrderDate), cadence + 3)) : retailer.next_reorder_end;

      return {
        ...retailer,
        ordering_cadence_days: cadence,
        next_reorder_start: reorderStart,
        next_reorder_end: reorderEnd,
        totalPos: retailerOrders.length,
        totalSpend: retailerOrders.reduce((sum, po) => sum + po.total_cost, 0),
        activeLocations: locations.filter((location) => location.retailer_id === retailer.id).length,
        compliantRequirements: requirements.filter((requirement) => requirement.retailer_id === retailer.id && requirement.status === "Compliant").length,
        atRiskRequirements: requirements.filter((requirement) => requirement.retailer_id === retailer.id && requirement.status !== "Compliant").length,
      };
    });
  },
};
