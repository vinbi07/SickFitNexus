import { RefreshCw } from "lucide-react";
import { SHOPIFY_SYNC_MAX_AGE_MS, useShopifySync } from "@/context/ShopifySyncContext";
import type { Product } from "@/types/domain";

/** Most recent Shopify sync across products, or null if nothing has synced. */
export function latestShopifySync(products: Array<Pick<Product, "last_shopify_sync_at">>) {
  let latest: string | null = null;
  for (const product of products) {
    const at = product.last_shopify_sync_at;
    if (at && (!latest || at > latest)) latest = at;
  }
  return latest;
}

function describeAge(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * Stock comes from Shopify when a sync runs. Nexus syncs on its own when a
 * session starts and the last sync is over a day old; otherwise syncing is
 * manual. This bar says how fresh the numbers are and offers Sync now.
 */
export function ShopifySyncStatus({
  lastSyncedAt: loadedSyncedAt,
  onSynced,
  onError,
}: {
  /** Latest sync time from the page's loaded data. */
  lastSyncedAt: string | null;
  onSynced?: (message: string) => void;
  onError?: (message: string) => void;
}) {
  const { running, trigger, lastSyncedAt: contextSyncedAt, syncNow } = useShopifySync();
  const candidates = [loadedSyncedAt, contextSyncedAt].filter((value): value is string => Boolean(value));
  const lastSyncedAt = candidates.sort().pop() ?? null;
  const stale = !lastSyncedAt || Date.now() - new Date(lastSyncedAt).getTime() > SHOPIFY_SYNC_MAX_AGE_MS;
  const when = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  const handleSync = async () => {
    try {
      const result = await syncNow();
      const removed = Number((result as { removedVariants?: number }).removedVariants ?? 0);
      onSynced?.(
        `Shopify sync completed. ${result.productsSynced ?? 0} products and ${result.inventoryRecordsSynced ?? 0} stock records updated${
          removed ? `, ${removed} removed from Shopify` : ""
        }.`,
      );
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Shopify sync failed.");
    }
  };

  if (running) {
    return (
      <div className="sync-status" role="status">
        <span>
          <RefreshCw size={14} aria-hidden="true" className="sync-spin" />{" "}
          {trigger === "auto"
            ? "Updating stock from Shopify. The last sync was over a day old, so this runs automatically."
            : "Syncing stock from Shopify…"}
        </span>
      </div>
    );
  }

  return (
    <div className={`sync-status${stale ? " is-stale" : ""}`} role="status">
      <span>
        {lastSyncedAt ? (
          <>
            Stock from Shopify, synced <strong>{when}</strong> ({describeAge(lastSyncedAt)})
            {stale ? ". Numbers may be out of date." : ""}
          </>
        ) : (
          "Stock hasn't been synced from Shopify yet."
        )}
      </span>
      <button type="button" className={`btn btn-small ${stale ? "btn-primary" : "btn-ghost"}`} onClick={() => void handleSync()}>
        <RefreshCw size={14} aria-hidden="true" />
        Sync now
      </button>
    </div>
  );
}
