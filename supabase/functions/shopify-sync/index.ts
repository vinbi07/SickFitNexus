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
    measurement: {
      weight: {
        value: number;
        unit: string;
      } | null;
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
  image: {
    url: string;
  } | null;
  product: {
    id: string;
    title: string;
    handle: string;
    status: string;
    featuredImage: {
      url: string;
    } | null;
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
        variant: {
          id: string;
        } | null;
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
          image {
            url
          }
          inventoryItem {
            id
            sku
            unitCost {
              amount
              currencyCode
            }
            measurement {
              weight {
                value
                unit
              }
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
            featuredImage {
              url
            }
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
                variant {
                  id
                }
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

const SHOPIFY_VARIANT_LOOKUP_QUERY = `
  query VariantLookup($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        sku
        inventoryQuantity
        product {
          id
          title
          status
          handle
        }
      }
    }
  }
`;

const LOOKUP_MAX_SKUS = 40;

// Read-only diagnostic: for each SKU, compares what Nexus has stored with what Shopify returns, both
// by the stored variant id and by a fresh SKU search. Writes nothing, to Nexus or to Shopify.
async function lookupSkus({
  supabaseAdmin,
  storeDomain,
  adminToken,
  skus,
}: {
  supabaseAdmin: SupabaseClient;
  storeDomain: string;
  adminToken: string;
  skus: string[];
}) {
  const nexusProducts = await selectInChunks<ProductRow>(
    supabaseAdmin,
    "products",
    "sku",
    skus,
    "id, sku, shopify_variant_id, shopify_product_id, current_inventory, last_shopify_sync_at",
  );
  const nexusBySku = new Map(nexusProducts.map((row) => [row.sku, row]));

  const variantIds = nexusProducts
    .map((row) => row.shopify_variant_id)
    .filter((id): id is string => Boolean(id));
  const byVariantId = new Map<string, {
    id: string;
    sku: string | null;
    inventoryQuantity: number | null;
    product: { id: string; title: string; status: string; handle: string };
  } | null>();
  if (variantIds.length) {
    const payload = await fetchShopifyGraphql({
      storeDomain,
      adminToken,
      query: SHOPIFY_VARIANT_LOOKUP_QUERY,
      variables: { ids: variantIds },
    });
    (payload.data.nodes as Array<Record<string, unknown> | null>).forEach((node, index) => {
      byVariantId.set(variantIds[index], node && node.id ? (node as never) : null);
    });
  }

  const skuPayload = await fetchShopifyGraphql({
    storeDomain,
    adminToken,
    query: SHOPIFY_VARIANTS_QUERY,
    variables: {
      first: 50,
      after: null,
      query: skus.map((sku) => `sku:"${sku.replace(/"/g, "")}"`).join(" OR "),
    },
  });
  const shopifyBySku = new Map<string, ShopifyVariantNode[]>();
  for (const edge of skuPayload.data.productVariants.edges as Array<{ node: ShopifyVariantNode }>) {
    const found = edge.node.inventoryItem?.sku?.trim();
    if (!found) continue;
    shopifyBySku.set(found, [...(shopifyBySku.get(found) ?? []), edge.node]);
  }

  return skus.map((sku) => {
    const nexus = nexusBySku.get(sku) ?? null;
    const storedVariant = nexus?.shopify_variant_id ? byVariantId.get(nexus.shopify_variant_id) ?? null : null;
    const bySkuMatches = shopifyBySku.get(sku) ?? [];
    const verdict = !nexus
      ? "not_in_nexus"
      : storedVariant
        ? `variant_exists_${storedVariant.product.status.toLowerCase()}`
        : bySkuMatches.length
          ? "variant_id_gone_but_sku_exists"
          : "gone_from_shopify";
    return {
      sku,
      verdict,
      nexus: nexus
        ? {
            variantId: nexus.shopify_variant_id,
            currentInventory: nexus.current_inventory,
            lastShopifySyncAt: nexus.last_shopify_sync_at,
          }
        : null,
      shopifyByStoredVariantId: storedVariant
        ? {
            productTitle: storedVariant.product.title,
            productStatus: storedVariant.product.status,
            quantity: storedVariant.inventoryQuantity,
          }
        : null,
      shopifyBySku: bySkuMatches.map((variant) => ({
        variantId: variant.id,
        productTitle: variant.product.title,
        productStatus: variant.product.status,
        quantity: variant.inventoryQuantity,
      })),
    };
  });
}

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

function getNormalizedVariantTitle(variantTitle: string) {
  const trimmed = variantTitle.trim();
  return trimmed && trimmed !== "Default Title" ? trimmed : null;
}

function getVariantDisplayLabel(variant: ShopifyVariantNode) {
  return getNormalizedVariantTitle(variant.title) ?? variant.product.title;
}

function formatShopifyWeight(
  weight: ShopifyVariantNode["inventoryItem"]["measurement"]["weight"] | null | undefined,
) {
  if (!weight || typeof weight.value !== "number" || !Number.isFinite(weight.value)) return null;

  const normalizedUnit = weight.unit.toLowerCase();
  return `${weight.value} ${normalizedUnit}`;
}

type ProductRow = {
  id: string;
  sku: string;
  shopify_variant_id: string | null;
  [key: string]: unknown;
};

type SkuOwner = {
  id: string | null;
  shopifyVariantId: string | null;
};

const LOOKUP_CHUNK_SIZE = 100;
const INVENTORY_LOOKUP_CHUNK_SIZE = 25;
const UPSERT_CHUNK_SIZE = 200;

async function selectInChunks<T>(
  supabaseAdmin: SupabaseClient,
  table: string,
  column: string,
  values: string[],
  select = "*",
  chunkSize = LOOKUP_CHUNK_SIZE,
) {
  const rows: T[] = [];
  for (const chunk of chunkArray([...new Set(values)], chunkSize)) {
    const { data, error } = await supabaseAdmin.from(table).select(select).in(column, chunk);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
  }
  return rows;
}

// Rows with an id upsert on the primary key; rows without one upsert on `newRowConflict`
// so the column default generates the id.
async function upsertRows<T>(
  supabaseAdmin: SupabaseClient,
  table: string,
  rows: Array<Record<string, unknown>>,
  options: { newRowConflict: string; select?: string },
) {
  const saved: T[] = [];
  const existingRows = rows.filter((row) => row.id);
  const newRows = rows.filter((row) => !row.id).map(({ id: _id, ...rest }) => rest);

  const runBatches = async (batch: Array<Record<string, unknown>>, onConflict?: string) => {
    for (const chunk of chunkArray(batch, UPSERT_CHUNK_SIZE)) {
      const query = supabaseAdmin.from(table).upsert(chunk, onConflict ? { onConflict } : undefined);
      const { data, error } = options.select ? await query.select(options.select) : await query;
      if (error) throw error;
      if (data) saved.push(...(data as T[]));
    }
  };

  await runBatches(existingRows);
  await runBatches(newRows, options.newRowConflict);
  return saved;
}

function resolveVariantSku(
  variant: ShopifyVariantNode,
  existingVariantProduct: ProductRow | null,
  skuOwners: Map<string, SkuOwner>,
) {
  const rawSku = variant.inventoryItem?.sku?.trim() ?? "";
  const variantTail = shortenShopifyGid(variant.id);

  if (!rawSku) {
    const fallbackSku = `SHOPIFY-${variantTail}`;
    logInfo("sync_variant_generated_missing_sku", {
      productTitle: variant.product.title,
      variantTitle: variant.title,
      variantId: variant.id,
      generatedSku: fallbackSku,
    });
    return fallbackSku;
  }

  const owner = skuOwners.get(rawSku);

  if (
    !owner ||
    owner.shopifyVariantId === variant.id ||
    (owner.id !== null && owner.id === existingVariantProduct?.id)
  ) {
    skuOwners.set(rawSku, { id: existingVariantProduct?.id ?? owner?.id ?? null, shopifyVariantId: variant.id });
    return rawSku;
  }

  const fallbackSku = `${rawSku}--${variantTail}`;
  logInfo("sync_variant_generated_duplicate_sku", {
    rawSku,
    variantId: variant.id,
    conflictingVariantId: owner.shopifyVariantId,
    generatedSku: fallbackSku,
  });
  return fallbackSku;
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

async function ensureLocations(
  supabaseAdmin: SupabaseClient,
  locationNames: string[],
) {
  const locationsByName = new Map<string, { id: string }>();
  const uniqueNames = [...new Set(locationNames)];
  if (!uniqueNames.length) return locationsByName;

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("locations")
    .select("id, name");
  if (existingError) throw existingError;
  for (const location of (existing ?? []) as Array<{ id: string; name: string }>) {
    if (!locationsByName.has(location.name)) locationsByName.set(location.name, location);
  }

  const missingNames = uniqueNames.filter((name) => !locationsByName.has(name));
  if (missingNames.length) {
    const { data: created, error: createdError } = await supabaseAdmin
      .from("locations")
      .insert(missingNames.map((name) => ({
        name,
        type: "Shopify Fulfillment Location",
        address: null,
      })))
      .select("id, name");
    if (createdError) throw createdError;
    for (const location of (created ?? []) as Array<{ id: string; name: string }>) {
      locationsByName.set(location.name, location);
    }
    logInfo("ensure_locations_created", { count: missingNames.length });
  }

  return locationsByName;
}

async function cleanupSyntheticStyleProducts(
  supabaseAdmin: SupabaseClient,
  shopifyProductIds: string[],
) {
  for (const chunk of chunkArray(shopifyProductIds, LOOKUP_CHUNK_SIZE)) {
    const { error } = await supabaseAdmin
      .from("products")
      .delete()
      .in("shopify_product_id", chunk)
      .is("shopify_variant_id", null)
      .in("sku", chunk.map((id) => `STYLE-${shortenShopifyGid(id)}`));
    if (error) throw error;
  }
}

async function syncProductsAndInventory(
  supabaseAdmin: SupabaseClient,
  storeDomain: string,
  variantsByShopifyProductId: Map<string, ShopifyVariantNode[]>,
) {
  const productsByShopifyVariantId = new Map<string, { id: string }>();
  const productsBySku = new Map<string, { id: string }>();
  const allVariants = [...variantsByShopifyProductId.values()].flat();
  if (!allVariants.length) {
    return { productsSynced: 0, inventoryRecordsSynced: 0, productsByShopifyVariantId, productsBySku };
  }

  // Prefetch existing rows once instead of querying per variant.
  const existingByVariantId = new Map<string, ProductRow>();
  for (const row of await selectInChunks<ProductRow>(
    supabaseAdmin,
    "products",
    "shopify_variant_id",
    allVariants.map((variant) => variant.id),
  )) {
    if (row.shopify_variant_id) existingByVariantId.set(row.shopify_variant_id, row);
  }

  const existingBySku = new Map<string, ProductRow>();
  const loadProductsBySku = async (skus: string[]) => {
    const missing = skus.filter((sku) => !existingBySku.has(sku));
    for (const row of await selectInChunks<ProductRow>(supabaseAdmin, "products", "sku", missing)) {
      existingBySku.set(row.sku, row);
    }
  };
  await loadProductsBySku(
    allVariants.map((variant) => variant.inventoryItem?.sku?.trim() ?? "").filter(Boolean),
  );

  const skuOwners = new Map<string, SkuOwner>();
  for (const row of existingBySku.values()) {
    skuOwners.set(row.sku, { id: row.id, shopifyVariantId: row.shopify_variant_id });
  }

  // Resolve SKUs in the same order the sequential sync used, so duplicate handling is unchanged.
  const planned: Array<{
    variant: ShopifyVariantNode;
    sku: string;
    isAnchorVariant: boolean;
    variantSortOrder: number;
  }> = [];
  for (const productVariants of variantsByShopifyProductId.values()) {
    productVariants.forEach((variant, index) => {
      planned.push({
        variant,
        sku: resolveVariantSku(variant, existingByVariantId.get(variant.id) ?? null, skuOwners),
        isAnchorVariant: index === 0,
        variantSortOrder: index + 1,
      });
    });
  }
  await loadProductsBySku(planned.map((entry) => entry.sku));

  const findExistingProduct = (entry: (typeof planned)[number]) =>
    existingByVariantId.get(entry.variant.id) ?? existingBySku.get(entry.sku) ?? null;

  const buildProductPayload = (
    entry: (typeof planned)[number],
    parentProductId: string | null,
  ) => {
    const { variant, sku, variantSortOrder } = entry;
    const existingProduct = findExistingProduct(entry);
    const normalizedVariantTitle = getNormalizedVariantTitle(variant.title);
    const inventoryLevels = variant.inventoryItem?.inventoryLevels.edges ?? [];
    const totalInventory = inventoryLevels.reduce((sum, level) => sum + getAvailableQuantity(level.node), 0);

    return {
      id: existingProduct?.id,
      sku,
      name: variant.product.title,
      category: existingProduct?.category ?? "Shopify",
      description: existingProduct?.description ?? `Synced from Shopify product ${variant.product.title}.`,
      vendor_id: existingProduct?.vendor_id ?? null,
      unit_cost: Number(variant.inventoryItem?.unitCost?.amount ?? existingProduct?.unit_cost ?? 0),
      unit_price: Number(variant.price ?? existingProduct?.unit_price ?? 0),
      current_inventory: totalInventory,
      // Same formula as deriveInventoryAvailable in src/utils/lookbook.ts. inventory_allocated is
      // owned by Nexus and not written here, so the stored available count stays correct after a sync.
      inventory_available: Math.max(totalInventory - Number(existingProduct?.inventory_allocated ?? 0), 0),
      safety_stock: existingProduct?.safety_stock ?? 0,
      weight: formatShopifyWeight(variant.inventoryItem?.measurement?.weight) ?? existingProduct?.weight ?? null,
      image_url: variant.image?.url ?? variant.product.featuredImage?.url ?? existingProduct?.image_url ?? null,
      no_bundles: existingProduct?.no_bundles ?? false,
      shopify_product_id: variant.product.id,
      shopify_variant_id: variant.id,
      shopify_handle: variant.product.handle,
      shopify_admin_url: `https://admin.shopify.com/store/${storeDomain.replace(".myshopify.com", "")}/products/${variant.product.id.split("/").pop()}`,
      shopify_storefront_url: `https://${storeDomain}/products/${variant.product.handle}`,
      is_shopify_synced: true,
      last_shopify_sync_at: new Date().toISOString(),
      ancillary_category: existingProduct?.ancillary_category ?? null,
      parent_product_id: parentProductId,
      variant_title: normalizedVariantTitle,
      variant_sort_order: normalizedVariantTitle
        ? Number(existingProduct?.variant_sort_order ?? variantSortOrder)
        : 0,
    };
  };

  // Anchor variants first so their ids are available as parent_product_id for the rest.
  const savedProductFields = "id, sku, shopify_variant_id";
  const anchors = planned.filter((entry) => entry.isAnchorVariant);
  const savedAnchors = await upsertRows<ProductRow>(
    supabaseAdmin,
    "products",
    anchors.map((entry) => buildProductPayload(entry, null)),
    { newRowConflict: "sku", select: savedProductFields },
  );
  const savedAnchorIdByVariantId = new Map(
    savedAnchors.map((row) => [row.shopify_variant_id as string, row.id]),
  );
  const anchorProductIds = new Map<string, string>();
  for (const entry of anchors) {
    const anchorId = savedAnchorIdByVariantId.get(entry.variant.id);
    if (anchorId) anchorProductIds.set(entry.variant.product.id, anchorId);
  }

  const children = planned.filter((entry) => !entry.isAnchorVariant);
  const savedChildren = await upsertRows<ProductRow>(
    supabaseAdmin,
    "products",
    children.map((entry) => buildProductPayload(entry, anchorProductIds.get(entry.variant.product.id) ?? null)),
    { newRowConflict: "sku", select: savedProductFields },
  );

  const savedRows = [...savedAnchors, ...savedChildren];
  for (const row of savedRows) {
    productsBySku.set(row.sku, { id: row.id });
    if (row.shopify_variant_id) productsByShopifyVariantId.set(row.shopify_variant_id, { id: row.id });
  }

  // Inventory levels, batched.
  const locationsByName = await ensureLocations(
    supabaseAdmin,
    allVariants.flatMap((variant) =>
      (variant.inventoryItem?.inventoryLevels.edges ?? []).map((level) => level.node.location.name)
    ),
  );

  type ExistingInventoryItem = {
    id: string;
    product_id: string;
    location_id: string;
    reorder_point: number | null;
    target_stock: number | null;
    inventory_category: string | null;
    notes: string | null;
  };
  const existingItems = new Map<string, ExistingInventoryItem>();
  for (const item of await selectInChunks<ExistingInventoryItem>(
    supabaseAdmin,
    "inventory_items",
    "product_id",
    savedRows.map((row) => row.id),
    "id, product_id, location_id, reorder_point, target_stock, inventory_category, notes",
    INVENTORY_LOOKUP_CHUNK_SIZE,
  )) {
    existingItems.set(`${item.product_id}:${item.location_id}`, item);
  }

  const inventoryRows = new Map<string, Record<string, unknown>>();
  for (const entry of planned) {
    const productId = productsByShopifyVariantId.get(entry.variant.id)?.id;
    if (!productId) continue;
    const ancillaryCategory = findExistingProduct(entry)?.ancillary_category as string | null | undefined;

    for (const level of entry.variant.inventoryItem?.inventoryLevels.edges ?? []) {
      const location = locationsByName.get(level.node.location.name);
      if (!location) continue;
      const key = `${productId}:${location.id}`;
      const existingItem = existingItems.get(key);

      inventoryRows.set(key, {
        id: existingItem?.id,
        product_id: productId,
        location_id: location.id,
        quantity_on_hand: getAvailableQuantity(level.node),
        reorder_point: existingItem?.reorder_point ?? 0,
        target_stock: existingItem?.target_stock ?? 0,
        inventory_category:
          existingItem?.inventory_category ??
          getInventoryCategoryFromAncillaryCategory(ancillaryCategory),
        notes: existingItem?.notes ?? "Synced from Shopify inventory levels.",
      });
    }
  }

  await upsertRows(supabaseAdmin, "inventory_items", [...inventoryRows.values()], {
    newRowConflict: "product_id,location_id",
  });

  const multiVariantProductIds = [...variantsByShopifyProductId.entries()]
    .filter(([, productVariants]) => productVariants.length > 1)
    .map(([shopifyProductId]) => shopifyProductId);
  if (multiVariantProductIds.length) {
    await cleanupSyntheticStyleProducts(supabaseAdmin, multiVariantProductIds);
  }

  return {
    productsSynced: savedRows.length,
    inventoryRecordsSynced: inventoryRows.size,
    productsByShopifyVariantId,
    productsBySku,
  };
}

async function syncShopifyOrderUsageEvents({
  supabaseAdmin,
  orders,
  productsByShopifyVariantId,
  productsBySku,
  skuFilter,
}: {
  supabaseAdmin: SupabaseClient;
  orders: ShopifyOrderNode[];
  productsByShopifyVariantId: Map<string, { id: string }>;
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
      if (skuFilter && normalizedSku !== skuFilter) continue;

      const product = (lineItem.variant?.id
        ? productsByShopifyVariantId.get(lineItem.variant.id)
        : null) ?? (normalizedSku ? productsBySku.get(normalizedSku) : null);
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

  for (const sourceReferenceChunk of chunkArray(sourceReferences, 200)) {
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
    if (body.mode === "lookup") {
      stage = "lookup";
      const skus = (Array.isArray(body.skus) ? body.skus : [])
        .filter((value: unknown): value is string => typeof value === "string" && value.trim() !== "")
        .map((value: string) => value.trim())
        .slice(0, LOOKUP_MAX_SKUS);
      if (!skus.length) {
        return jsonResponse(400, { ok: false, stage, error: "Provide a non-empty skus array." });
      }
      const results = await lookupSkus({ supabaseAdmin, storeDomain, adminToken, skus });
      return jsonResponse(200, { ok: true, stage, mode: "lookup", results });
    }

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
    const variantsByShopifyProductId = new Map<string, ShopifyVariantNode[]>();
    for (const variant of variants) {
      const current = variantsByShopifyProductId.get(variant.product.id) ?? [];
      current.push(variant);
      variantsByShopifyProductId.set(variant.product.id, current);
    }

    const {
      productsSynced,
      inventoryRecordsSynced,
      productsByShopifyVariantId,
      productsBySku,
    } = await syncProductsAndInventory(supabaseAdmin, storeDomain, variantsByShopifyProductId);
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
      productsByShopifyVariantId,
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
