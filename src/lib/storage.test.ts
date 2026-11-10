// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { getStorageStatus, requestPersistentStorage } from "./storage";

function stubStorage(manager: Partial<StorageManager> | undefined) {
  vi.stubGlobal("navigator", manager === undefined ? {} : { storage: manager });
}

afterEach(() => vi.unstubAllGlobals());

describe("storage durability", () => {
  it("reports unsupported when the Storage API is missing", async () => {
    stubStorage(undefined);
    expect((await getStorageStatus()).durability).toBe("unsupported");
    expect((await requestPersistentStorage()).durability).toBe("unsupported");
  });

  it("requests persistence once when storage is best-effort and reports the result", async () => {
    let persisted = false;
    const persist = vi.fn(async () => { persisted = true; return true; });
    stubStorage({
      persisted: async () => persisted,
      persist,
      estimate: async () => ({ usage: 1024, quota: 1_000_000 })
    });
    const status = await requestPersistentStorage();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(status).toEqual({ durability: "persisted", usageBytes: 1024, quotaBytes: 1_000_000 });
  });

  it("does not prompt again when storage is already persistent", async () => {
    const persist = vi.fn(async () => true);
    stubStorage({ persisted: async () => true, persist });
    expect((await requestPersistentStorage()).durability).toBe("persisted");
    expect(persist).not.toHaveBeenCalled();
  });

  it("stays best-effort when the browser refuses and never throws", async () => {
    stubStorage({ persisted: async () => false, persist: async () => false });
    expect((await requestPersistentStorage()).durability).toBe("best-effort");

    stubStorage({
      persisted: async () => { throw new Error("denied"); },
      persist: async () => { throw new Error("denied"); }
    });
    expect((await requestPersistentStorage()).durability).toBe("unsupported");
  });

  it("ignores a failing usage estimate", async () => {
    stubStorage({
      persisted: async () => false,
      estimate: async () => { throw new Error("nope"); }
    });
    expect(await getStorageStatus()).toEqual({ durability: "best-effort" });
  });
});
