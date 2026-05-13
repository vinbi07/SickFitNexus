import { supabase } from "@/lib/supabase";
import { listTable } from "@/services/baseService";
import type { Product } from "@/types/domain";

const SHOPIFY_SYNC_FUNCTION = "shopify-sync";

function assertSupabaseFunctions() {
  if (!supabase) {
    throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to continue.");
  }

  return supabase;
}

export const shopifyService = {
  listProducts: () => listTable<Product>("products", "name", true),

  async syncProduct(product: Product) {
    const client = assertSupabaseFunctions();
    const { data, error } = await client.functions.invoke(SHOPIFY_SYNC_FUNCTION, {
      body: {
        mode: "product",
        sku: product.sku,
      },
    });

    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error ?? "Shopify sync failed.");
    return data;
  },

  async syncAllProducts() {
    const client = assertSupabaseFunctions();
    const { data, error } = await client.functions.invoke(SHOPIFY_SYNC_FUNCTION, {
      body: {
        mode: "all",
      },
    });

    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error ?? "Shopify catalog sync failed.");
    return data;
  },
};
