import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type SupabaseClient = ReturnType<typeof createClient>;

type ShopifyVariantNode = {
  id: string;
  title: string;
  price: string;
  inventoryQuantity: number | null;
  inventoryItem: {
    id: string;
    sku: string | null;
    unitCost: {
      amount: string;
      currencyCode: string;
    } | null;
    inventoryLevels: {
      edges: Array<{
        node: {
          location: { name: string };
          quantities: Array<{ name: string; quantity: number }>;
        };
      }>;
    };
  } | null;
  product: {
    id: string;
    title: string;
    handle: string;
    status: string;
  };
};

type ShopifyOrderNode = {
  id: string;
  name: string;
  createdAt: string;
  cancelledAt: string | null;
  lineItems: {
    edges: Array<{
      node: {
        id: string;
        sku: string | null;
        quantity: number;
        title: string;
      };
    }>;
  };
};

const SHOPIFY_API_VERSION = "2025-01";

const SHOPIFY_VARIANTS_QUERY = `
  query ProductVariants($first: Int!, $after: String, $query: String) {
    productVariants(first: $first, after: $after, query: $query) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          title
          price
          inventoryQuantity
          inventoryItem {
            id
            sku
            unitCost {
              amount
              currencyCode
            }
            inventoryLevels(first: 20) {
              edges {
                node {
                  location {
                    name
                  }
                  quantities(names: ["available"]) {
                    name
                    quantity
                  }
                }
              }
            }
          }
          product {
            id
            title
            handle
            status
          }
        }
      }
    }
  }
`;

const SHOPIFY_ORDERS_QUERY = `
  query Orders($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          name
          createdAt
          cancelledAt
          lineItems(first: 100) {
            edges {
              node {
                id
                sku
                quantity
                title
              }
            }
          }
        }
      }
    }
  }
`;

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function logInfo(stage: string, details?: Record<string, unknown>) {
  console.log(JSON.stringify({ level: "info", stage, ...details }));
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      name: error.name,
    };
  }

  if (error && typeof error === "object") {
    const maybeError = error as Record<string, unknown>;
    return {
      message: typeof maybeError.message === "string" ? maybeError.message : JSON.stringify(maybeError),
      details: maybeError.details,
      hint: maybeError.hint,
      code: maybeError.code,
      raw: maybeError,
    };
  }

  return {
    message: String(error),
  };
}

function logError(stage: string, error: unknown, details?: Record<string, unknown>) {
  const serialized = serializeError(error);
  console.error(
    JSON.stringify({
      level: "error",
      stage,
      ...serialized,
      ...details,
    }),
  );
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function shortenShopifyGid(gid: string) {
  return gid.split("/").pop() ?? gid;
}

function getInventoryCategoryFromAncillaryCategory(ancillaryCategory: string | null | undefined) {
  if (!ancillaryCategory) return "Core";
  const normalized = ancillaryCategory.toLowerCase();
  if (normalized.includes("pack")) return "Packaging";
  return "Ancillary";
}

async function fetchShopifyGraphql({
  storeDomain,
  adminToken,
  query,
  variables,
}: {
  storeDomain: string;
  adminToken: string;
  query: string;
  variables: Record<string, unknown>;
}) {
  logInfo("shopify_graphql_request", {
    queryType: query.includes("orders(") ? "orders" : "variants",
    hasQueryFilter: Boolean(variables.query),
  });

  const response = await fetch(`https://${storeDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": adminToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = await response.json();
  if (!response.ok || payload.errors) {
    logError("shopify_graphql_failed", payload.errors?.[0]?.message ?? "request_failed", {
      status: response.status,
      response: payload,
    });
    throw new Error(payload.errors?.[0]?.message ?? "Shopify Admin API request failed.");
  }

  logInfo("shopify_graphql_success", {
    queryType: query.includes("orders(") ? "orders" : "variants",
  });
  return payload;
}

function getAvailableQuantity(levelNode: ShopifyVariantNode["inventoryItem"]["inventoryLevels"]["edges"][number]["node"]) {
  return levelNode.quantities.find((quantity) => quantity.name === "available")?.quantity ?? 0;
}

async function fetchShopifyVariants({
  storeDomain,
  adminToken,
  sku,
}: {
  storeDomain: string;
  adminToken: string;
  sku?: string;
}) {
  const variants: ShopifyVariantNode[] = [];
  let after: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const payload = await fetchShopifyGraphql({
      storeDomain,
      adminToken,
      query: SHOPIFY_VARIANTS_QUERY,
      variables: {
        first: sku ? 10 : 50,
        after,
        query: sku ? `sku:${sku}` : undefined,
      },
    });

    const connection = payload.data.productVariants;
    variants.push(...connection.edges.map((edge: { node: ShopifyVariantNode }) => edge.node));
    hasNextPage = !sku && connection.pageInfo.hasNextPage;
    after = connection.pageInfo.endCursor;

    if (sku) break;
  }

  return variants;
}

async function fetchShopifyOrders({
  storeDomain,
  adminToken,
  lookbackDays,
}: {
  storeDomain: string;
  adminToken: string;
  lookbackDays: number;
}) {
  const orders: ShopifyOrderNode[] = [];
  let after: string | null = null;
  let hasNextPage = true;
  const sinceDate = new Date(Date.now() - lookbackDays * 86400000).toISOString();

  while (hasNextPage) {
    const payload = await fetchShopifyGraphql({
      storeDomain,
      adminToken,
      query: SHOPIFY_ORDERS_QUERY,
      variables: {
        first: 50,
        after,
        query: `created_at:>=${sinceDate}`,
      },
    });

    const connection = payload.data.orders;
    orders.push(...connection.edges.map((edge: { node: ShopifyOrderNode }) => edge.node));
    hasNextPage = connection.pageInfo.hasNextPage;
    after = connection.pageInfo.endCursor;
  }

  return orders;
}

async function ensureLocation(
  supabaseAdmin: SupabaseClient,
  locationName: string,
) {
  logInfo("ensure_location_start", { locationName });
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("locations")
    .select("*")
    .eq("name", locationName)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    logInfo("ensure_location_existing", { locationName, locationId: existing.id });
    return existing;
  }

  const { data: created, error: createdError } = await supabaseAdmin
    .from("locations")
    .insert({
      name: locationName,
      type: "Shopify Fulfillment Location",
      address: null,
    })
    .select("*")
    .single();
  if (createdError) throw createdError;
  logInfo("ensure_location_created", { locationName, locationId: created.id });
  return created;
}

async function syncVariant(
  supabaseAdmin: SupabaseClient,
  storeDomain: string,
  variant: ShopifyVariantNode,
) {
  const sku = variant.inventoryItem?.sku?.trim();
  if (!sku) return { productSynced: false, inventorySynced: 0, productId: null as string | null, sku: null as string | null };

  logInfo("sync_variant_start", {
    sku,
    productTitle: variant.product.title,
    variantId: variant.id,
  });

  const productName =
    variant.title && variant.title !== "Default Title"
      ? `${variant.product.title} - ${variant.title}`
      : variant.product.title;

  const storefrontUrl = `https://${storeDomain}/products/${variant.product.handle}`;
  const adminUrl = `https://admin.shopify.com/store/${storeDomain.replace(".myshopify.com", "")}/products/${variant.product.id.split("/").pop()}`;
  const inventoryLevels = variant.inventoryItem?.inventoryLevels.edges ?? [];
  const totalInventory = inventoryLevels.reduce((sum, level) => sum + getAvailableQuantity(level.node), 0);

  const { data: existingProduct, error: existingProductError } = await supabaseAdmin
    .from("products")
    .select("*")
    .eq("sku", sku)
    .maybeSingle();
  if (existingProductError) throw existingProductError;

  const productPayload = {
    id: existingProduct?.id,
    sku,
    name: productName,
    category: existingProduct?.category ?? "Shopify",
    description: existingProduct?.description ?? `Synced from Shopify product ${variant.product.title}.`,
    vendor_id: existingProduct?.vendor_id ?? null,
    unit_cost: Number(variant.inventoryItem?.unitCost?.amount ?? existingProduct?.unit_cost ?? 0),
    unit_price: Number(variant.price ?? existingProduct?.unit_price ?? 0),
    current_inventory: totalInventory,
    safety_stock: existingProduct?.safety_stock ?? 0,
    shopify_product_id: variant.product.id,
    shopify_variant_id: variant.id,
    shopify_handle: variant.product.handle,
    shopify_admin_url: adminUrl,
    shopify_storefront_url: storefrontUrl,
    is_shopify_synced: true,
    last_shopify_sync_at: new Date().toISOString(),
    ancillary_category: existingProduct?.ancillary_category ?? null,
  };

  const { data: savedProduct, error: savedProductError } = await supabaseAdmin
    .from("products")
    .upsert(productPayload)
    .select("*")
    .single();
  if (savedProductError) throw savedProductError;

  let inventorySynced = 0;
  for (const level of inventoryLevels) {
    const available = getAvailableQuantity(level.node);
    const location = await ensureLocation(supabaseAdmin, level.node.location.name);

    const { data: existingItem, error: existingItemError } = await supabaseAdmin
      .from("inventory_items")
      .select("*")
      .eq("product_id", savedProduct.id)
      .eq("location_id", location.id)
      .maybeSingle();
    if (existingItemError) throw existingItemError;

    const { error: inventoryError } = await supabaseAdmin
      .from("inventory_items")
      .upsert({
        id: existingItem?.id,
        product_id: savedProduct.id,
        location_id: location.id,
        quantity_on_hand: available,
        reorder_point: existingItem?.reorder_point ?? 0,
        target_stock: existingItem?.target_stock ?? 0,
        inventory_category:
          existingItem?.inventory_category ??
          getInventoryCategoryFromAncillaryCategory(savedProduct.ancillary_category),
        notes: existingItem?.notes ?? "Synced from Shopify inventory levels.",
      });
    if (inventoryError) throw inventoryError;
    inventorySynced += 1;
  }

  logInfo("sync_variant_complete", {
    sku,
    productId: savedProduct.id,
    inventorySynced,
  });
  return { productSynced: true, inventorySynced, productId: savedProduct.id as string, sku };
}

async function syncShopifyOrderUsageEvents({
  supabaseAdmin,
  orders,
  productsBySku,
  skuFilter,
}: {
  supabaseAdmin: SupabaseClient;
  orders: ShopifyOrderNode[];
  productsBySku: Map<string, { id: string }>;
  skuFilter?: string;
}) {
  logInfo("sync_usage_events_start", {
    ordersCount: orders.length,
    skuFilter: skuFilter ?? null,
  });
  const usageEvents: Array<Record<string, unknown>> = [];

  for (const order of orders) {
    if (order.cancelledAt) continue;

    for (const edge of order.lineItems.edges) {
      const lineItem = edge.node;
      const normalizedSku = lineItem.sku?.trim();
      if (!normalizedSku) continue;
      if (skuFilter && normalizedSku !== skuFilter) continue;

      const product = productsBySku.get(normalizedSku);
      if (!product) continue;

      usageEvents.push({
        product_id: product.id,
        location_id: null,
        related_po_id: null,
        event_type: "Usage",
        quantity_change: Number(lineItem.quantity) * -1,
        event_date: order.createdAt.slice(0, 10),
        notes: `Shopify order ${order.name} - ${lineItem.title}`,
        source_system: "shopify",
        source_reference: `${shortenShopifyGid(order.id)}:${shortenShopifyGid(lineItem.id)}`,
      });
    }
  }

  if (!usageEvents.length) return 0;

  logInfo("sync_usage_events_built", {
    usageEventsCount: usageEvents.length,
  });

  const sourceReferences = usageEvents
    .map((event) => String(event.source_reference ?? ""))
    .filter(Boolean);

  const existingReferences = new Set(
    [] as string[],
  );

  for (const sourceReferenceChunk of chunkArray(sourceReferences, 25)) {
    const { data: existingEvents, error: existingEventsError } = await supabaseAdmin
      .from("inventory_events")
      .select("source_reference")
      .eq("source_system", "shopify")
      .in("source_reference", sourceReferenceChunk);
    if (existingEventsError) {
      logError("sync_usage_events_existing_lookup", existingEventsError, {
        chunkSize: sourceReferenceChunk.length,
      });
      throw existingEventsError;
    }

    ((existingEvents ?? []) as Array<{ source_reference: string | null }>)
      .map((event) => event.source_reference)
      .filter((value): value is string => Boolean(value))
      .forEach((value) => existingReferences.add(value));
  }

  const newEvents = usageEvents.filter(
    (event) => !existingReferences.has(String(event.source_reference ?? "")),
  );

  if (!newEvents.length) {
    logInfo("sync_usage_events_skipped_all_existing", {
      existingCount: existingReferences.size,
    });
    return 0;
  }

  let insertedCount = 0;
  for (const eventChunk of chunkArray(newEvents, 100)) {
    const { error } = await supabaseAdmin.from("inventory_events").insert(eventChunk);
    if (error) {
      logError("sync_usage_events_insert", error, {
        chunkSize: eventChunk.length,
        sample: eventChunk[0],
      });
      throw error;
    }
    insertedCount += eventChunk.length;
  }

  logInfo("sync_usage_events_complete", {
    insertedCount,
  });
  return insertedCount;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let stage = "init";
  try {
    const storeDomain = Deno.env.get("SHOPIFY_STORE_DOMAIN");
    const adminToken = Deno.env.get("SHOPIFY_ADMIN_ACCESS_TOKEN");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const lookbackDays = Number(Deno.env.get("SHOPIFY_ORDER_LOOKBACK_DAYS") ?? "120");

    stage = "validate_secrets";
    if (!storeDomain || !adminToken || !supabaseUrl || !serviceRoleKey) {
      logError(stage, "missing_secrets", {
        hasStoreDomain: Boolean(storeDomain),
        hasAdminToken: Boolean(adminToken),
        hasSupabaseUrl: Boolean(supabaseUrl),
        hasServiceRoleKey: Boolean(serviceRoleKey),
      });
      return jsonResponse(500, {
        ok: false,
        stage,
        error: "Missing Shopify or Supabase function secrets. Set SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY.",
      });
    }

    stage = "create_supabase_client";
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    stage = "parse_request";
    const body = await request.json().catch(() => ({}));
    const mode = body.mode === "product" ? "product" : "all";
    const sku = typeof body.sku === "string" ? body.sku.trim() : "";
    logInfo("request_parsed", { mode, sku: sku || null, lookbackDays });

    stage = "fetch_variants";
    const variants = await fetchShopifyVariants({
      storeDomain,
      adminToken,
      sku: mode === "product" ? sku : undefined,
    });
    logInfo("variants_fetched", { count: variants.length });

    stage = "sync_products_and_inventory";
    let productsSynced = 0;
    let inventoryRecordsSynced = 0;
    const productsBySku = new Map<string, { id: string }>();

    for (const variant of variants) {
      const result = await syncVariant(supabaseAdmin, storeDomain, variant);
      if (result.productSynced) productsSynced += 1;
      inventoryRecordsSynced += result.inventorySynced;
      if (result.sku && result.productId) {
        productsBySku.set(result.sku, { id: result.productId });
      }
    }
    logInfo("products_and_inventory_complete", {
      productsSynced,
      inventoryRecordsSynced,
      matchedProductSkus: productsBySku.size,
    });

    stage = "fetch_orders";
    const orders = await fetchShopifyOrders({
      storeDomain,
      adminToken,
      lookbackDays,
    });
    logInfo("orders_fetched", { count: orders.length });

    stage = "sync_usage_events";
    const usageEventsSynced = await syncShopifyOrderUsageEvents({
      supabaseAdmin,
      orders,
      productsBySku,
      skuFilter: mode === "product" ? sku : undefined,
    });

    stage = "complete";
    logInfo("shopify_sync_complete", {
      mode,
      productsSynced,
      inventoryRecordsSynced,
      usageEventsSynced,
      matchedVariants: variants.length,
      matchedOrders: orders.length,
      lookbackDays,
    });
    return jsonResponse(200, {
      ok: true,
      stage,
      mode,
      productsSynced,
      inventoryRecordsSynced,
      usageEventsSynced,
      matchedVariants: variants.length,
      matchedOrders: orders.length,
      lookbackDays,
    });
  } catch (error) {
    logError(stage, error);
    return jsonResponse(500, {
      ok: false,
      stage,
      error: error instanceof Error ? error.message : "Unexpected Shopify sync error.",
    });
  }
});
