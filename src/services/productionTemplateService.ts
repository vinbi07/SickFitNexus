import { assertSupabase } from "@/lib/supabase";
import { deleteFromTable, upsertTable } from "@/services/baseService";
import type { ProductionPlan, ProductionPlanItem, ProductionPlanTemplate, ProductionPlanTemplateItem } from "@/types/domain";

export const productionTemplateService = {
  async list() {
    const supabase = assertSupabase();
    const [templateResponse, itemsResponse] = await Promise.all([
      supabase.from("production_plan_templates").select("*, vendors(*)").order("name", { ascending: true }),
      supabase
        .from("production_plan_template_items")
        .select("*, products(*)")
        .order("sort_order", { ascending: true }),
    ]);
    if (templateResponse.error) throw templateResponse.error;
    if (itemsResponse.error) throw itemsResponse.error;

    const items = (itemsResponse.data ?? []) as ProductionPlanTemplateItem[];
    return ((templateResponse.data ?? []) as ProductionPlanTemplate[]).map((template) => ({
      ...template,
      items: items.filter((item) => item.template_id === template.id),
    }));
  },

  async getById(id: string) {
    const supabase = assertSupabase();
    const [templateResponse, itemsResponse] = await Promise.all([
      supabase.from("production_plan_templates").select("*, vendors(*)").eq("id", id).single(),
      supabase
        .from("production_plan_template_items")
        .select("*, products(*)")
        .eq("template_id", id)
        .order("sort_order", { ascending: true }),
    ]);
    if (templateResponse.error) throw templateResponse.error;
    if (itemsResponse.error) throw itemsResponse.error;
    return {
      ...(templateResponse.data as ProductionPlanTemplate),
      items: (itemsResponse.data ?? []) as ProductionPlanTemplateItem[],
    };
  },

  async upsert(template: Partial<ProductionPlanTemplate>, items: Array<Partial<ProductionPlanTemplateItem>>) {
    // vendors/items are joined/attached fields from list()/getById(), not real columns —
    // strip them before spreading into the upsert payload or PostgREST rejects the write.
    const { vendors: _vendors, items: _templateItems, ...templatePayload } = template;
    const [savedTemplate] = (await upsertTable<ProductionPlanTemplate>("production_plan_templates", {
      ...templatePayload,
      name: templatePayload.name ? String(templatePayload.name) : "Untitled Template",
      description: templatePayload.description ? String(templatePayload.description) : null,
      is_active: templatePayload.is_active ?? true,
      default_horizon_days: templatePayload.default_horizon_days ?? 60,
      default_lead_time_buffer_days: templatePayload.default_lead_time_buffer_days ?? 7,
      default_coverage_target_days: templatePayload.default_coverage_target_days ?? 30,
      cost_assumptions: templatePayload.cost_assumptions ?? {},
      milestones: templatePayload.milestones ?? [],
    })) as ProductionPlanTemplate[];

    const supabase = assertSupabase();
    const { data: existingRows, error: existingError } = await supabase
      .from("production_plan_template_items")
      .select("id")
      .eq("template_id", savedTemplate.id);
    if (existingError) throw existingError;

    const existingIds = new Set(((existingRows ?? []) as Array<{ id: string }>).map((row) => row.id));
    const submittedIds = new Set(items.map((item) => item.id).filter((id): id is string => Boolean(id)));

    await Promise.all(
      [...existingIds].filter((id) => !submittedIds.has(id)).map((id) => deleteFromTable("production_plan_template_items", id)),
    );

    if (items.length) {
      await upsertTable<ProductionPlanTemplateItem>(
        "production_plan_template_items",
        items.map((item, index) => ({
          id: item.id || crypto.randomUUID(),
          template_id: savedTemplate.id,
          product_id: item.product_id,
          mix_mode: item.mix_mode ?? "fixed",
          fixed_quantity: item.fixed_quantity ?? null,
          percent_of_mix: item.percent_of_mix ?? null,
          min_quantity: item.min_quantity ?? null,
          max_quantity: item.max_quantity ?? null,
          moq: item.moq ?? null,
          order_increment: item.order_increment ?? null,
          unit_cost: item.unit_cost ?? null,
          spec_snapshot: item.spec_snapshot ?? {},
          pack_pairs: Number(item.pack_pairs ?? 1),
          sock_size: item.sock_size ?? null,
          construction: item.construction ?? null,
          sort_order: Number(item.sort_order ?? index),
        })),
      );
    }

    return this.getById(savedTemplate.id);
  },

  remove: (id: string) => deleteFromTable("production_plan_templates", id),

  /**
   * Produces an unsaved, fully editable plan+items draft from a template.
   * Nothing is written until the caller passes this to productionPlanService.upsert —
   * the resulting plan carries source_template_id for provenance only, not a live link.
   */
  applyTemplateToNewPlan(
    template: ProductionPlanTemplate,
    overrides: Partial<ProductionPlan> = {},
  ): { plan: Partial<ProductionPlan>; items: Array<Partial<ProductionPlanItem>> } {
    const today = new Date();
    const horizonStart = today.toISOString().slice(0, 10);
    const horizonEnd = new Date(today.getTime() + (template.default_horizon_days ?? 60) * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const plan: Partial<ProductionPlan> = {
      name: `${template.name} Plan`,
      goal: "restock",
      status: "Draft",
      vendor_id: template.default_vendor_id,
      horizon_start: horizonStart,
      horizon_end: horizonEnd,
      coverage_target_days: template.default_coverage_target_days,
      demand_method: "avg_daily_usage",
      include_allocated: true,
      include_existing_incoming: true,
      source_type: "template",
      source_template_id: template.id,
      ...overrides,
    };

    const items: Array<Partial<ProductionPlanItem>> = (template.items ?? []).map((templateItem, index) => ({
      product_id: templateItem.product_id,
      // Fixed-mode items copy their quantity directly. Percent-mode items have no
      // total run size to distribute against yet (the template doesn't define one),
      // so they seed at their minimum floor and the user sets the real split in the
      // plan builder's editable quantity column.
      planned_quantity: templateItem.mix_mode === "percent" ? templateItem.min_quantity ?? 0 : templateItem.fixed_quantity ?? 0,
      moq: templateItem.moq,
      order_increment: templateItem.order_increment,
      unit_cost: templateItem.unit_cost,
      spec_snapshot: templateItem.spec_snapshot,
      pack_pairs: templateItem.pack_pairs,
      sock_size: templateItem.sock_size,
      construction: templateItem.construction,
      sort_order: templateItem.sort_order ?? index,
    }));

    return { plan, items };
  },
};
