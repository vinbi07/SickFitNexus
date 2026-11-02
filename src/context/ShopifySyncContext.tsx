import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from "react";
import { shopifyService } from "@/services/shopifyService";

/** Stock older than this triggers the once-per-session automatic sync. */
export const SHOPIFY_SYNC_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const SESSION_CHECKED_KEY = "nexus-shopify-auto-sync-checked";
const LOCK_KEY = "nexus-shopify-sync-lock";
// A full sync takes a few minutes; a lock older than this is treated as abandoned.
const LOCK_TTL_MS = 10 * 60 * 1000;

type SyncResult = Awaited<ReturnType<typeof shopifyService.syncAllProducts>>;

interface ShopifySyncState {
  /** A full catalog + stock sync is running (automatic or manual). */
  running: boolean;
  /** Most recent completed sync we know of. */
  lastSyncedAt: string | null;
  /** Bumps after every successful sync so pages can reload their data. */
  completedCount: number;
  /** "auto" when the running/last sync started itself at session start. */
  trigger: "auto" | "manual" | null;
  error: string | null;
  /** Manual resync; resolves with the sync result. */
  syncNow: () => Promise<SyncResult>;
}

const ShopifySyncContext = createContext<ShopifySyncState | null>(null);

function readStorage(storage: Storage | undefined, key: string) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(storage: Storage | undefined, key: string, value: string | null) {
  try {
    if (value === null) storage?.removeItem(key);
    else storage?.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the worst case is an extra check next load.
  }
}

/** True when another tab started a sync recently. */
function isLockedElsewhere() {
  const startedAt = Number(readStorage(globalThis.localStorage, LOCK_KEY) ?? 0);
  return Boolean(startedAt) && Date.now() - startedAt < LOCK_TTL_MS;
}

/**
 * Keeps Shopify stock fresh without surprise syncs: the first time a session
 * starts, sync only if the last sync is over a day old. Inside that day,
 * syncing is manual (Sync now).
 */
export function ShopifySyncProvider({ children }: PropsWithChildren) {
  const [running, setRunning] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [completedCount, setCompletedCount] = useState(0);
  const [trigger, setTrigger] = useState<"auto" | "manual" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<Promise<SyncResult> | null>(null);

  const runSync = useCallback(async (source: "auto" | "manual") => {
    if (inFlight.current) return inFlight.current;
    setRunning(true);
    setTrigger(source);
    setError(null);
    writeStorage(globalThis.localStorage, LOCK_KEY, String(Date.now()));
    const job = (async () => {
      try {
        const result = await shopifyService.syncAllProducts();
        setLastSyncedAt(new Date().toISOString());
        setCompletedCount((count) => count + 1);
        return result;
      } catch (syncError) {
        setError(syncError instanceof Error ? syncError.message : "Shopify sync failed.");
        throw syncError;
      } finally {
        writeStorage(globalThis.localStorage, LOCK_KEY, null);
        setRunning(false);
        inFlight.current = null;
      }
    })();
    inFlight.current = job;
    return job;
  }, []);

  useEffect(() => {
    // Once per browser session (survives reloads in the same tab).
    if (readStorage(globalThis.sessionStorage, SESSION_CHECKED_KEY)) return;
    writeStorage(globalThis.sessionStorage, SESSION_CHECKED_KEY, "1");

    let cancelled = false;
    void (async () => {
      try {
        const latest = await shopifyService.getLatestSyncAt();
        if (cancelled) return;
        setLastSyncedAt(latest);
        const isFresh = latest && Date.now() - new Date(latest).getTime() < SHOPIFY_SYNC_MAX_AGE_MS;
        if (isFresh || isLockedElsewhere()) return;
        await runSync("auto");
      } catch {
        // Auto-sync is best effort; the stale banner and Sync now still work.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runSync]);

  const syncNow = useCallback(() => runSync("manual"), [runSync]);

  return (
    <ShopifySyncContext.Provider value={{ running, lastSyncedAt, completedCount, trigger, error, syncNow }}>
      {children}
    </ShopifySyncContext.Provider>
  );
}

export function useShopifySync() {
  const context = useContext(ShopifySyncContext);
  if (!context) throw new Error("useShopifySync must be used inside ShopifySyncProvider");
  return context;
}

/** Calls `reload` whenever a Shopify sync finishes (automatic or manual). */
export function useReloadOnShopifySync(reload: () => unknown) {
  const { completedCount } = useShopifySync();
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  useEffect(() => {
    if (completedCount > 0) void reloadRef.current();
  }, [completedCount]);
}
