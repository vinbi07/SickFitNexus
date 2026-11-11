import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { DataTable } from "@/components/DataTable";
import { Disclosure } from "@/components/Disclosure";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { StatusBadge } from "@/components/StatusBadge";
import type { BarcodeFixItem } from "@/components/products/BarcodeFixPanel";
import { SalesChart } from "@/components/products/SalesChart";
import { VariantStockTable, type VariantRow } from "@/components/products/VariantStockTable";
import { useReloadOnShopifySync } from "@/context/ShopifySyncContext";
import { useAsyncData } from "@/hooks/useAsyncData";
import { shopifyService } from "@/services/shopifyService";
import { supportService } from "@/services/supportService";
import type { InventoryEvent, Product } from "@/types/domain";
import { assessProductBarcode, findDuplicateBarcodes, normalizeBarcode } from "@/utils/barcode";
import { planBarcodeFix } from "@/utils/barcodeFix";
import { formatCurrency, formatDate, formatDateOnly, formatNumber } from "@/utils/format";
import { getProductVariantLabel } from "@/utils/lookbook";
import { getInventoryHealthLabel, getMarginMetrics, getSockTypeFromName, isIgnoredProduct, isRetiredFromShopify } from "@/utils/operations";
import { groupProductFamilies } from "@/utils/productFamilies";
import { dailySalesRate, daysOfStock, incomingOrders, isSaleEvent, unitsSold, weeklySalesSeries } from "@/utils/productSales";

type SalesWindow = 30 | 90;

function formatMoney(value: number) {
  return Number.isInteger(value) ? formatCurrency(value) : `$${value.toFixed(2)}`;
}

function priceRange(min: number, max: number) {
  if (!max) return null;
  return min === max ? formatMoney(min) : `${formatMoney(min)} – ${formatMoney(max)}`;
}

function shopifyBadge(products: Product[]) {
  if (products.every(isRetiredFromShopify)) {
    return products.some((product) => product.shopify_removed_at)
      ? { label: "Removed from Shopify", className: "status-danger" }
      : { label: "Archived", className: "status-neutral" };
  }
  const status = products.find((product) => product.shopify_status)?.shopify_status;
  if (status === "draft") return { label: "Draft", className: "status-warning" };
  if (status === "active") return { label: "Active", className: "status-success" };
  return null;
}

function variantStatus(available: number, events: InventoryEvent[], safetyStock: number): VariantRow["status"] {
  if (available < 0) return { label: "Oversold", tone: "danger" };
  if (available === 0) return { label: "Out of stock", tone: "danger" };
  const health = getInventoryHealthLabel(available, events, safetyStock);
  if (health === "Danger") return { label: "Low stock", tone: "danger" };
  if (health === "Low") return { label: "Below safety stock", tone: "warning" };
  if (health === "Slow Mover") return { label: "Slow mover", tone: "neutral" };
  return null;
}

/**
 * One product the way Shopify shows it: every variant with its stock, sales
 * pace and UPC up front; POs, reservations, history and specs tucked below.
 */
export function ProductDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAsyncData(() => supportService.getProductFamilyDetail(id), [id]);
  useReloadOnShopifySync(reload);
  const [salesWindow, setSalesWindow] = useState<SalesWindow>(30);
  const [syncing, setSyncing] = useState(false);
  const [recheckingId, setRecheckingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  if (loading && !data) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load product detail"} />;

  const { products, events, inventoryItems, reservations, poLineItems, sharedUpcProducts, requestedId } = data;

  const eventsByProduct = new Map<string, InventoryEvent[]>();
  for (const event of events) {
    if (!event.product_id) continue;
    eventsByProduct.set(event.product_id, [...(eventsByProduct.get(event.product_id) ?? []), event]);
  }
  // Ignored rows and variants retired in Shopify keep old codes; like the list, they don't count as duplicates.
  const liveBarcodeHolders = [...products, ...sharedUpcProducts].filter((product) => !isIgnoredProduct(product));
  const duplicates = findDuplicateBarcodes(liveBarcodeHolders.map((product) => ({ owner: product.sku, code: product.upc })));
  const bookCodesOf = (product: Product) =>
    (product.product_barcode_links ?? []).map((link) => link.product_barcodes?.barcode_upc ?? "").filter(Boolean);
  const barcodeOf = (product: Product) => assessProductBarcode(product.upc, bookCodesOf(product), duplicates, product.sku);
  /** Shopify admin page for one variant, where its Barcode field lives. */
  const shopifyVariantUrl = (product: Pick<Product, "shopify_admin_url" | "shopify_variant_id">) =>
    product.shopify_admin_url && product.shopify_variant_id
      ? `${product.shopify_admin_url}/variants/${product.shopify_variant_id.split("/").pop()}`
      : product.shopify_admin_url ?? null;

  const families = groupProductFamilies(products, {
    healthOf: (product) =>
      getInventoryHealthLabel(product.current_inventory, eventsByProduct.get(product.id) ?? [], product.safety_stock),
    hasBarcodeProblem: (product) => barcodeOf(product).isProblem,
  });
  const family =
    families.find((candidate) => candidate.variants.some((variant) => variant.id === requestedId) || candidate.root.id === requestedId) ??
    families[0];
  if (!family) return <ErrorState message="Product not found." />;

  const variants = family.variants;
  const variantIds = new Set(variants.map((variant) => variant.id));
  const familyEvents = events.filter((event) => event.product_id && variantIds.has(event.product_id));
  const incoming = incomingOrders(poLineItems.filter((line) => line.product_id && variantIds.has(line.product_id)));
  const incomingOf = (productId: string) => incoming.reduce((sum, order) => sum + (order.units.get(productId) ?? 0), 0);

  const rows: VariantRow[] = variants.map((variant) => {
    const variantEvents = eventsByProduct.get(variant.id) ?? [];
    const items = inventoryItems.filter((item) => item.product_id === variant.id);
    const onHand = items.length ? items.reduce((sum, item) => sum + Number(item.quantity_on_hand ?? 0), 0) : Number(variant.current_inventory ?? 0);
    const available = items.length
      ? items.reduce((sum, item) => sum + Number(item.quantity_available ?? item.quantity_on_hand ?? 0), 0)
      : Number(variant.current_inventory ?? 0);
    const rate = dailySalesRate(variantEvents, salesWindow);
    return {
      product: variant,
      onHand,
      available,
      committed: items.reduce((sum, item) => sum + Number(item.quantity_committed ?? 0), 0),
      incoming: incomingOf(variant.id),
      sold: unitsSold(variantEvents, salesWindow),
      daysLeft: daysOfStock(available, rate),
      status: variantStatus(available, variantEvents, Number(variant.safety_stock ?? 0)),
      barcode: barcodeOf(variant),
      locations: items
        .filter((item) => item.quantity_on_hand || item.quantity_available)
        .map((item) => ({
          name: item.locations?.name ?? "Unknown location",
          onHand: Number(item.quantity_on_hand ?? 0),
          available: Number(item.quantity_available ?? item.quantity_on_hand ?? 0),
        })),
      recentSales: variantEvents.filter(isSaleEvent).slice(0, 5),
    };
  });

  const totalOnHand = rows.reduce((sum, row) => sum + row.onHand, 0);
  const totalAvailable = rows.reduce((sum, row) => sum + row.available, 0);
  const totalIncoming = incoming.reduce((sum, order) => sum + order.total, 0);
  const sold = unitsSold(familyEvents, salesWindow);
  const rate = dailySalesRate(familyEvents, salesWindow);
  const familyDaysLeft = daysOfStock(totalAvailable, rate);
  const series = weeklySalesSeries(familyEvents, salesWindow === 30 ? 6 : 13);
  const hasSales = series.some((point) => point.units > 0);

  const root = family.root;
  const isFamily = variants.length > 1;
  const focusId = variantIds.has(requestedId) && isFamily ? requestedId : null;
  const badge = shopifyBadge(variants);
  const adminUrl = variants.find((variant) => variant.shopify_admin_url)?.shopify_admin_url ?? root.shopify_admin_url;
  const storefrontUrl = variants.find((variant) => variant.shopify_storefront_url)?.shopify_storefront_url ?? root.shopify_storefront_url;
  const lastSync = variants.map((variant) => variant.last_shopify_sync_at).filter((value): value is string => Boolean(value)).sort().pop();
  const prices = priceRange(family.minPrice, family.maxPrice);
  const showVariantPrice = family.minPrice !== family.maxPrice;
  const category = getSockTypeFromName(root.name) ?? root.category;
  const editTarget = isFamily ? root : variants[0];
  const pricingSource = variants.find((variant) => variant.id === requestedId) ?? variants[0];
  const margin = getMarginMetrics(pricingSource.unit_cost, pricingSource.unit_price);
  const familyLines = poLineItems.filter((line) => line.product_id && variantIds.has(line.product_id));
  const familyReservations = reservations.filter((reservation) => variantIds.has(reservation.product_id));
  const skuOf = (productId: string | null) => variants.find((variant) => variant.id === productId)?.sku ?? "";

  const fixItems: BarcodeFixItem[] = variants.flatMap((variant) => {
    if (isIgnoredProduct(variant)) return [];
    const assessment = barcodeOf(variant);
    const code = normalizeBarcode(variant.upc);
    const conflicts = liveBarcodeHolders
      .filter((other) => other.id !== variant.id && code && normalizeBarcode(other.upc) === code)
      .map((other) => ({ id: other.id, sku: other.sku, name: other.name, adminUrl: shopifyVariantUrl(other) }));
    const plan = planBarcodeFix({ upc: variant.upc, assessment, bookCodes: bookCodesOf(variant), conflicts });
    return plan ? [{ variant, assessment, plan, shopifyUrl: shopifyVariantUrl(variant) }] : [];
  });

  // Pull this variant back from Shopify so its barcode is checked again.
  const recheck = async (variant: Product) => {
    setRecheckingId(variant.id);
    try {
      if (variant.shopify_variant_id) await shopifyService.syncProduct(variant);
      await reload();
    } catch (err) {
      setNotice({ tone: "error", message: err instanceof Error ? err.message : "Couldn't re-check with Shopify." });
    } finally {
      setRecheckingId(null);
    }
  };

  // Inline variant edits patch only the fields on the form; stock stays with inventory records.
  const saveVariant = async (variant: Product, patch: Partial<Product>) => {
    await supportService.bulkUpdateProducts([variant.id], patch);
    await reload();
    setNotice({ tone: "success", message: `${getProductVariantLabel({ ...variant, ...patch })} saved.` });
  };

  const syncWithShopify = async () => {
    setSyncing(true);
    try {
      for (const variant of variants) await shopifyService.syncProduct(variant);
      await reload();
      setNotice({ tone: "success", message: `${family.name} synced with Shopify.` });
    } catch (err) {
      setNotice({ tone: "error", message: err instanceof Error ? err.message : "Failed to sync with Shopify." });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="section-stack pd-page">
      <Link className="pd-back" to="/products">
        <ArrowLeft size={16} aria-hidden="true" />
        Products
      </Link>
      <PageHeader
        title={family.name}
        badge={badge ? <span className={`status-badge ${badge.className}`}>{badge.label}</span> : undefined}
        primaryAction={
          adminUrl ? (
            <a className="btn btn-primary" href={adminUrl} target="_blank" rel="noreferrer">
              Open in Shopify
            </a>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => navigate(`/products?edit=${editTarget.id}`)}>
              Edit product
            </button>
          )
        }
        secondaryActions={[
          ...(adminUrl ? [{ label: "Edit product", onClick: () => navigate(`/products?edit=${editTarget.id}`) }] : []),
          { label: syncing ? "Syncing…" : "Sync with Shopify", disabled: syncing, onClick: () => void syncWithShopify() },
          ...(storefrontUrl ? [{ label: "View in store", onClick: () => window.open(storefrontUrl, "_blank", "noreferrer") }] : []),
        ]}
      />

      {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}

      <div className="pd-layout">
        <div className="pd-main">
          <Section>
            <div className="pd-summary">
              {root.image_url ? (
                <img className="pd-image" src={root.image_url} alt="" />
              ) : (
                <span className="pd-image pd-image-empty" aria-hidden="true">
                  {family.name.slice(0, 2).toUpperCase()}
                </span>
              )}
              <div>
                <p className="pd-summary-meta">{[root.vendors?.name, category].filter(Boolean).join(" · ") || "No vendor or category yet"}</p>
                <p className="pd-summary-line">
                  <strong>{formatNumber(totalAvailable)}</strong> available
                  {isFamily ? ` across ${variants.length} variants` : ""}
                  {totalIncoming ? <> · {formatNumber(totalIncoming)} incoming</> : null}
                  {prices ? <> · {prices}</> : null}
                  {family.marginPercent != null ? <> · {family.marginPercent}% margin</> : null}
                </p>
                {totalOnHand !== totalAvailable ? (
                  <p className="pd-quiet">{formatNumber(totalOnHand)} on hand; the rest is committed to open orders.</p>
                ) : null}
              </div>
            </div>
          </Section>

          <Section
            title="Sales"
            action={
              <div className="map-view-toggle" role="group" aria-label="Sales window">
                {([30, 90] as const).map((days) => (
                  <button
                    key={days}
                    type="button"
                    aria-pressed={salesWindow === days}
                    onClick={() => setSalesWindow(days)}
                  >
                    {days} days
                  </button>
                ))}
              </div>
            }
          >
            <div className="pd-sales-stats">
              <div>
                <span>Sold</span>
                <strong>{formatNumber(sold)}</strong>
              </div>
              <div>
                <span>Per day</span>
                <strong>{formatNumber(rate, rate > 0 && rate < 10 ? 1 : 0)}</strong>
              </div>
              <div>
                <span>Stock lasts</span>
                <strong>{familyDaysLeft == null ? "—" : `${formatNumber(familyDaysLeft)} days`}</strong>
              </div>
            </div>
            {hasSales ? (
              <SalesChart series={series} />
            ) : (
              <p className="pd-quiet">No Shopify sales in the last {salesWindow} days.</p>
            )}
          </Section>

          <Section title={isFamily ? `Variants (${variants.length})` : "Stock"} hint={
              fixItems.length
                ? "Select a row for stock by location, latest sales, or to edit it. Press a red barcode tag to see how to fix it."
                : "Select a row for stock by location, latest sales, or to edit it."
            }
          >
            <VariantStockTable rows={rows} soldLabel={`Sold ${salesWindow}d`} showPrice={showVariantPrice} focusId={focusId}
              fixOf={(productId) => fixItems.find((item) => item.variant.id === productId)}
              recheckingId={recheckingId}
              onRecheck={(variant) => void recheck(variant)}
              onSaveVariant={saveVariant}
            />
          </Section>

          <Section>
            <div className="pd-disclosures">
              <Disclosure summary={`Purchase orders (${new Set(familyLines.map((line) => line.purchase_order_id)).size})`} openSummary="Purchase orders">
                <DataTable
                  emptyMessage="No purchase orders include this product yet."
                  columns={[
                    {
                      key: "purchase_orders",
                      title: "PO",
                      render: (row) =>
                        row.purchase_orders?.id ? (
                          <Link className="table-link" to={`/purchase-orders/${row.purchase_orders.id}`}>
                            {row.purchase_orders.po_number}
                          </Link>
                        ) : (
                          "—"
                        ),
                    },
                    { key: "sku", title: "Variant", render: (row) => getProductVariantLabel(variants.find((variant) => variant.id === row.product_id) ?? root) },
                    { key: "status", title: "Status", render: (row) => (row.purchase_orders ? <StatusBadge label={row.purchase_orders.status} /> : "—") },
                    { key: "quantity_ordered", title: "Ordered", render: (row) => formatNumber(row.quantity_ordered) },
                    { key: "quantity_received", title: "Received", render: (row) => formatNumber(Number(row.quantity_received ?? 0)) },
                    { key: "unit_cost", title: "Unit cost", render: (row) => formatCurrency(row.unit_cost) },
                  ]}
                  rows={familyLines}
                />
              </Disclosure>
              <Disclosure summary={`Reservations (${familyReservations.length})`} openSummary="Reservations">
                <DataTable
                  emptyMessage="Nothing is reserved for this product."
                  columns={[
                    {
                      key: "purchase_order_id",
                      title: "PO",
                      render: (row) => (
                        <Link className="table-link" to={`/purchase-orders/${row.purchase_order_id}`}>
                          {row.purchase_order_id.slice(0, 8)}
                        </Link>
                      ),
                    },
                    { key: "product_id", title: "SKU", render: (row) => skuOf(row.product_id) },
                    { key: "reserved_units", title: "Units", render: (row) => formatNumber(row.reserved_units) },
                    { key: "status", title: "Status", render: (row) => <StatusBadge label={row.status} /> },
                    { key: "updated_at", title: "Updated", render: (row) => formatDate(row.updated_at) },
                  ]}
                  rows={familyReservations}
                />
              </Disclosure>
              <Disclosure summary={`Stock history (${familyEvents.length})`} openSummary="Stock history">
                <DataTable
                  emptyMessage="No stock changes recorded yet."
                  columns={[
                    { key: "event_date", title: "Date", render: (row) => formatDateOnly(row.event_date) },
                    { key: "product_id", title: "SKU", render: (row) => skuOf(row.product_id) },
                    { key: "event_type", title: "Event", render: (row) => row.event_type },
                    { key: "quantity_change", title: "Units", render: (row) => (row.quantity_change > 0 ? `+${row.quantity_change}` : row.quantity_change) },
                    { key: "notes", title: "Notes", render: (row) => row.notes ?? "—" },
                  ]}
                  rows={familyEvents.slice(0, 100)}
                />
              </Disclosure>
              <Disclosure summary="Product details" openSummary="Product details">
                <dl className="pd-specs">
                  <div><dt>Weight</dt><dd>{pricingSource.weight ?? "—"}</dd></div>
                  <div><dt>Dimensions</dt><dd>{pricingSource.dimensions ?? "—"}</dd></div>
                  <div><dt>Case pack</dt><dd>{pricingSource.case_pack_quantity ?? "—"}</dd></div>
                  <div><dt>Safety stock</dt><dd>{formatNumber(Number(pricingSource.safety_stock ?? 0))}</dd></div>
                  <div><dt>Bundles</dt><dd>{pricingSource.no_bundles ? "Not allowed" : "Allowed"}</dd></div>
                  <div><dt>Compliance</dt><dd>{pricingSource.compliance_docs_status ?? "—"}</dd></div>
                  <div className="pd-specs-wide">
                    <dt>Compliance docs required</dt>
                    <dd>{pricingSource.compliance_docs_required?.join(", ") || "None"}</dd>
                  </div>
                  <div className="pd-specs-wide">
                    <dt>Shopify product</dt>
                    <dd>{root.shopify_product_id ?? pricingSource.shopify_product_id ?? "Not linked"}</dd>
                  </div>
                </dl>
              </Disclosure>
            </div>
          </Section>
        </div>

        <aside className="pd-side">
          <Section title="Shopify">
            <p className="pd-side-line">
              {badge?.label ?? "Not linked to Shopify"}
              {lastSync ? <span className="pd-quiet">Synced {formatDate(lastSync)}</span> : null}
            </p>
          </Section>

          <Section title="Incoming">
            {incoming.length ? (
              <ul className="pd-plain-list">
                {incoming.slice(0, 4).map((order) => {
                  const arrival = order.purchaseOrder.eta_date ?? order.purchaseOrder.expected_delivery_date;
                  return (
                    <li key={order.purchaseOrder.id}>
                      <Link className="table-link" to={`/purchase-orders/${order.purchaseOrder.id}`}>
                        {order.purchaseOrder.po_number}
                      </Link>
                      <span>
                        {formatNumber(order.total)} units{arrival ? ` · ${formatDateOnly(arrival)}` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="pd-quiet">Nothing on order.</p>
            )}
          </Section>

          <Section title="Pricing" hint={isFamily && focusId ? getProductVariantLabel(pricingSource) : undefined}>
            <dl className="pd-price-list">
              <div><dt>Retail</dt><dd>{prices ?? "—"}</dd></div>
              <div><dt>Wholesale</dt><dd>{pricingSource.wholesale_price ? formatMoney(Number(pricingSource.wholesale_price)) : "—"}</dd></div>
              <div><dt>MSRP</dt><dd>{pricingSource.msrp ? formatMoney(Number(pricingSource.msrp)) : "—"}</dd></div>
              <div><dt>Cost</dt><dd>{pricingSource.unit_cost ? formatMoney(Number(pricingSource.unit_cost)) : "—"}</dd></div>
              {Number(pricingSource.unit_price ?? 0) > 0 ? (
                <div>
                  <dt>Margin</dt>
                  <dd>
                    {formatMoney(margin.marginDollars)} · {margin.marginPercent.toFixed(0)}%
                  </dd>
                </div>
              ) : null}
            </dl>
          </Section>
        </aside>
      </div>
    </div>
  );
}
