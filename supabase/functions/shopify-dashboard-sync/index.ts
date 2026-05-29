import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ShopifyOrderNode = {
  id: string;
  name: string;
  createdAt: string;
  cancelledAt: string | null;
  sourceName: string | null;
  currentTotalPriceSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  } | null;
  lineItems: {
    edges: Array<{
      node: {
        id: string;
        sku: string | null;
        quantity: number;
        title: string;
        originalUnitPriceSet: {
          shopMoney: {
            amount: string;
            currencyCode: string;
          };
        } | null;
        discountedTotalSet: {
          shopMoney: {
            amount: string;
            currencyCode: string;
          };
        } | null;
      };
    }>;
  };
};

const SHOPIFY_API_VERSION = "2025-01";

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
          sourceName
          currentTotalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          lineItems(first: 100) {
            edges {
              node {
                id
                sku
                quantity
                title
                originalUnitPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                discountedTotalSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
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

  return payload;
}

async function fetchShopifyOrders({
  storeDomain,
  adminToken,
  queryFilter,
}: {
  storeDomain: string;
  adminToken: string;
  queryFilter: string;
}) {
  const orders: ShopifyOrderNode[] = [];
  let after: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const payload = await fetchShopifyGraphql({
      storeDomain,
      adminToken,
      query: SHOPIFY_ORDERS_QUERY,
      variables: {
        first: 50,
        after,
        query: queryFilter,
      },
    });

    const connection = payload.data.orders;
    const batch = connection.edges.map((edge: { node: ShopifyOrderNode }) => edge.node);
    orders.push(...batch);
    hasNextPage = connection.pageInfo.hasNextPage;
    after = connection.pageInfo.endCursor;

    logInfo("fetch_orders_page", {
      fetchedThisPage: batch.length,
      totalFetched: orders.length,
      hasNextPage,
    });
  }

  return orders;
}

type SyncRequestBody = {
  mode?: "year" | "lookback";
  lookbackDays?: number;
  startDate?: string;
  endDate?: string;
};

function getUtcDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildOrderQueryWindow(body: SyncRequestBody | null | undefined) {
  const now = new Date();
  const mode = body?.mode ?? "lookback";
  const explicitStartDate = body?.startDate?.trim();
  const explicitEndDate = body?.endDate?.trim();

  if (explicitStartDate || explicitEndDate) {
    const parts = [
      explicitStartDate ? `created_at:>=${explicitStartDate}` : null,
      explicitEndDate ? `created_at:<=${explicitEndDate}` : null,
    ].filter(Boolean);
    return {
      mode: explicitStartDate && explicitEndDate ? "custom_range" : "custom_boundary",
      lookbackDays: null,
      queryFilter: parts.join(" "),
      rangeStart: explicitStartDate ?? null,
      rangeEnd: explicitEndDate ?? null,
    };
  }

  if (mode === "year") {
    const lookbackDays = 365;
    const rangeStart = getUtcDateString(new Date(now.getTime() - lookbackDays * 86400000));
    const rangeEnd = getUtcDateString(now);
    return {
      mode,
      lookbackDays,
      queryFilter: `created_at:>=${rangeStart} created_at:<=${rangeEnd}`,
      rangeStart,
      rangeEnd,
    };
  }

  const lookbackDays = Number(body?.lookbackDays ?? Deno.env.get("SHOPIFY_DASHBOARD_LOOKBACK_DAYS") ?? "365");
  const rangeStart = getUtcDateString(new Date(now.getTime() - lookbackDays * 86400000));
  const rangeEnd = getUtcDateString(now);
  return {
    mode,
    lookbackDays,
    queryFilter: `created_at:>=${rangeStart}`,
    rangeStart,
    rangeEnd,
  };
}

async function syncShopifyOrdersData({
  supabaseAdmin,
  orders,
}: {
  supabaseAdmin: ReturnType<typeof createClient>;
  orders: ShopifyOrderNode[];
}) {
  logInfo("sync_shopify_orders_start", { ordersCount: orders.length });

  const orderPayload = orders.map((order) => ({
    shopify_order_id: order.id,
    order_name: order.name,
    source_name: order.sourceName,
    currency_code: order.currentTotalPriceSet?.shopMoney.currencyCode ?? "USD",
    order_created_at: order.createdAt,
    cancelled_at: order.cancelledAt,
    current_total_price: Number(order.currentTotalPriceSet?.shopMoney.amount ?? 0),
  }));

  for (const orderChunk of chunkArray(orderPayload, 100)) {
    const { error } = await supabaseAdmin
      .from("shopify_orders")
      .upsert(orderChunk, { onConflict: "shopify_order_id" });
    if (error) {
      logError("sync_shopify_orders_upsert_orders", error, {
        chunkSize: orderChunk.length,
        sample: orderChunk[0],
      });
      throw error;
    }
  }

  const orderIds = orders.map((order) => order.id);
  const savedOrdersByShopifyId = new Map<string, string>();
  for (const orderIdChunk of chunkArray(orderIds, 100)) {
    const { data, error } = await supabaseAdmin
      .from("shopify_orders")
      .select("id, shopify_order_id")
      .in("shopify_order_id", orderIdChunk);
    if (error) {
      logError("sync_shopify_orders_lookup_orders", error, {
        chunkSize: orderIdChunk.length,
      });
      throw error;
    }

    ((data ?? []) as Array<{ id: string; shopify_order_id: string }>).forEach((item) => {
      savedOrdersByShopifyId.set(item.shopify_order_id, item.id);
    });
  }

  const { data: products, error: productsError } = await supabaseAdmin
    .from("products")
    .select("id, sku")
    .not("sku", "is", null);
  if (productsError) {
    logError("sync_shopify_orders_lookup_products", productsError);
    throw productsError;
  }

  const productsBySku = new Map(
    ((products ?? []) as Array<{ id: string; sku: string | null }>)
      .filter((product): product is { id: string; sku: string } => Boolean(product.sku))
      .map((product) => [product.sku.trim(), { id: product.id }]),
  );

  const linePayload = orders.flatMap((order) => {
    const orderRecordId = savedOrdersByShopifyId.get(order.id);
    if (!orderRecordId) return [];

    return order.lineItems.edges.map((edge) => {
      const lineItem = edge.node;
      const normalizedSku = lineItem.sku?.trim() ?? null;
      return {
        shopify_line_item_id: lineItem.id,
        shopify_order_record_id: orderRecordId,
        product_id: normalizedSku ? productsBySku.get(normalizedSku)?.id ?? null : null,
        sku: normalizedSku,
        title: lineItem.title,
        quantity: Number(lineItem.quantity ?? 0),
        unit_price: Number(lineItem.originalUnitPriceSet?.shopMoney.amount ?? 0),
        line_total: Number(lineItem.discountedTotalSet?.shopMoney.amount ?? 0),
      };
    });
  });

  for (const lineChunk of chunkArray(linePayload, 200)) {
    const { error } = await supabaseAdmin
      .from("shopify_order_line_items")
      .upsert(lineChunk, { onConflict: "shopify_line_item_id" });
    if (error) {
      logError("sync_shopify_orders_upsert_lines", error, {
        chunkSize: lineChunk.length,
        sample: lineChunk[0],
      });
      throw error;
    }
  }

  logInfo("sync_shopify_orders_complete", {
    ordersSynced: orderPayload.length,
    lineItemsSynced: linePayload.length,
  });

  return {
    ordersSynced: orderPayload.length,
    lineItemsSynced: linePayload.length,
  };
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
    const requestBody = request.method === "POST" ? ((await request.json().catch(() => ({}))) as SyncRequestBody) : {};
    const orderWindow = buildOrderQueryWindow(requestBody);

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

    stage = "fetch_orders";
    const orders = await fetchShopifyOrders({
      storeDomain,
      adminToken,
      queryFilter: orderWindow.queryFilter,
    });
    logInfo("orders_fetched", {
      count: orders.length,
      mode: orderWindow.mode,
      lookbackDays: orderWindow.lookbackDays,
      rangeStart: orderWindow.rangeStart,
      rangeEnd: orderWindow.rangeEnd,
      queryFilter: orderWindow.queryFilter,
    });

    stage = "sync_shopify_orders";
    const { ordersSynced, lineItemsSynced } = await syncShopifyOrdersData({
      supabaseAdmin,
      orders,
    });

    stage = "complete";
    return jsonResponse(200, {
      ok: true,
      stage,
      mode: orderWindow.mode,
      lookbackDays: orderWindow.lookbackDays,
      rangeStart: orderWindow.rangeStart,
      rangeEnd: orderWindow.rangeEnd,
      matchedOrders: orders.length,
      ordersSynced,
      lineItemsSynced,
    });
  } catch (error) {
    logError(stage, error);
    return jsonResponse(500, {
      ok: false,
      stage,
      error: error instanceof Error ? error.message : "Unexpected Shopify dashboard sync error.",
    });
  }
});
