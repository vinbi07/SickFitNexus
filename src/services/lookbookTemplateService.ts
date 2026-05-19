import { assertSupabase } from "@/lib/supabase";
import { deleteFromTable, upsertTable } from "@/services/baseService";
import type { LookbookTemplate, LookbookTemplateItem, Product } from "@/types/domain";

async function attachParentProductsToItems(items: LookbookTemplateItem[]) {
  const parentIds = [
    ...new Set(
      items
        .map((item) => item.products?.parent_product_id)
        .filter(Boolean),
    ),
  ] as string[];

  if (!parentIds.length) {
    return items.map((item) => ({
      ...item,
      products: item.products ? { ...item.products, parent_products: null } : item.products,
    }));
  }

  const supabase = assertSupabase();
  const { data: parentRows, error: parentError } = await supabase
    .from("products")
    .select("*")
    .in("id", parentIds);
  if (parentError) throw parentError;

  const parentsById = new Map(((parentRows ?? []) as Product[]).map((product) => [product.id, product]));
  return items.map((item) => ({
    ...item,
    products: item.products
      ? {
          ...item.products,
          parent_products: item.products.parent_product_id
            ? parentsById.get(item.products.parent_product_id) ?? null
            : null,
        }
      : item.products,
  }));
}

export const lookbookTemplateService = {
  async list() {
    const supabase = assertSupabase();
    const [templateResponse, itemsResponse] = await Promise.all([
      supabase.from("lookbook_templates").select("*").order("name", { ascending: true }),
      supabase
        .from("lookbook_template_items")
        .select("*, products(*)")
        .order("sort_order", { ascending: true }),
    ]);
    if (templateResponse.error) throw templateResponse.error;
    if (itemsResponse.error) throw itemsResponse.error;

    const items = await attachParentProductsToItems((itemsResponse.data ?? []) as LookbookTemplateItem[]);
    return ((templateResponse.data ?? []) as LookbookTemplate[]).map((template) => ({
      ...template,
      items: items.filter((item) => item.template_id === template.id),
    }));
  },

  async getById(id: string) {
    const supabase = assertSupabase();
    const [templateResponse, itemsResponse] = await Promise.all([
      supabase.from("lookbook_templates").select("*").eq("id", id).single(),
      supabase
        .from("lookbook_template_items")
        .select("*, products(*)")
        .eq("template_id", id)
        .order("sort_order", { ascending: true }),
    ]);
    if (templateResponse.error) throw templateResponse.error;
    if (itemsResponse.error) throw itemsResponse.error;
    return {
      ...(templateResponse.data as LookbookTemplate),
      items: await attachParentProductsToItems((itemsResponse.data ?? []) as LookbookTemplateItem[]),
    };
  },

  async upsert(template: Partial<LookbookTemplate>, items: Array<Partial<LookbookTemplateItem>>) {
    const [savedTemplate] = (await upsertTable<LookbookTemplate>("lookbook_templates", {
      ...template,
      description: template.description ? String(template.description) : null,
      is_active: template.is_active ?? true,
    })) as LookbookTemplate[];

    const supabase = assertSupabase();
    const { data: existingRows, error: existingError } = await supabase
      .from("lookbook_template_items")
      .select("id")
      .eq("template_id", savedTemplate.id);
    if (existingError) throw existingError;

    const existingIds = new Set(((existingRows ?? []) as Array<{ id: string }>).map((row) => row.id));
    const submittedIds = new Set(items.map((item) => item.id).filter((id): id is string => Boolean(id)));

    await Promise.all(
      [...existingIds].filter((id) => !submittedIds.has(id)).map((id) => deleteFromTable("lookbook_template_items", id)),
    );

    if (items.length) {
      await upsertTable<LookbookTemplateItem>(
        "lookbook_template_items",
        items.map((item, index) => ({
          ...item,
          template_id: savedTemplate.id,
          sort_order: Number(item.sort_order ?? index),
          featured: Boolean(item.featured),
        })),
      );
    }

    return this.getById(savedTemplate.id);
  },

  remove: (id: string) => deleteFromTable("lookbook_templates", id),
};
