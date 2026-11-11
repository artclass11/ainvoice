/**
 * Browser storage durability.
 *
 * AInvoice keeps live records in IndexedDB. Browsers may evict "best-effort"
 * origin storage under disk pressure (and Safari can purge script-writable
 * storage for sites that are not used regularly), which would silently delete
 * a shop's books. `navigator.storage.persist()` asks the browser to exempt this
 * origin from automatic eviction. The browser may still refuse, so the UI must
 * keep telling users to export encrypted backups.
 */
export type StorageDurability = "persisted" | "best-effort" | "unsupported";

export interface StorageStatus {
  durability: StorageDurability;
  usageBytes?: number;
  quotaBytes?: number;
}

function storageManager(): StorageManager | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.storage;
}

async function readEstimate(manager: StorageManager): Promise<Pick<StorageStatus, "usageBytes" | "quotaBytes">> {
  if (typeof manager.estimate !== "function") return {};
  try {
    const { usage, quota } = await manager.estimate();
    return {
      usageBytes: Number.isFinite(usage) ? usage : undefined,
      quotaBytes: Number.isFinite(quota) ? quota : undefined
    };
  } catch {
    return {};
  }
}

/** Read the current durability without prompting the user. */
export async function getStorageStatus(): Promise<StorageStatus> {
  const manager = storageManager();
  if (!manager || typeof manager.persisted !== "function") return { durability: "unsupported" };
  try {
    const persisted = await manager.persisted();
    return { durability: persisted ? "persisted" : "best-effort", ...(await readEstimate(manager)) };
  } catch {
    return { durability: "unsupported" };
  }
}

/**
 * Ask the browser to protect this origin's storage. Call it from a user
 * gesture (for example after PIN entry) because some browsers prompt.
 * Never throws: failure simply leaves storage best-effort.
 */
export async function requestPersistentStorage(): Promise<StorageStatus> {
  const manager = storageManager();
  if (!manager || typeof manager.persist !== "function" || typeof manager.persisted !== "function") {
    return { durability: "unsupported" };
  }
  try {
    if (!(await manager.persisted())) await manager.persist();
  } catch {
    // Fall through and report whatever state the browser is actually in.
  }
  return getStorageStatus();
}

/** Native (Tauri) builds use the OS WebView profile, not evictable browser storage. */
export function isNativeApp(): boolean {
  return typeof window !== "undefined" &&
    Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}
