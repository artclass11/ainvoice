import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { AInvoiceDatabase, LEGACY_DATABASE_NAME, db, lockEncryptedDatabase, unlockEncryptedDatabase } from "./db";

const RECOVERY_KEY = "2b7e151628aed2a6abf7158809cf4f3c762e7160b3c5d1a98f0e2c4b6d8a0f13";

afterEach(async () => {
  lockEncryptedDatabase();
  await db.delete();
  const oldDatabase = new Dexie(LEGACY_DATABASE_NAME);
  await oldDatabase.delete();
});

describe("plaintext-to-encrypted database migration", () => {
  it("copies legacy business records, verifies the encrypted copy, and removes the plaintext database", async () => {
    const legacy = new AInvoiceDatabase(LEGACY_DATABASE_NAME, false);
    await legacy.open();
    await legacy.settings.put({
      id: "main", businessName: "Legacy Trading House", locale: "en",
      currencyCode: "INR", countryCode: "IN", address: "Old Market Road",
      phone: "9999911111", taxId: "LEGACY-GSTIN", invoicePrefix: "OLD",
      invoiceSequence: 14, purchasePrefix: "PUR", purchaseSequence: 3,
      createdAt: 10, updatedAt: 11
    });
    await legacy.invoices.put({
      id: 14, invoiceNo: "OLD-2026-00014", createdAt: 20, dateISO: "2026-11-08",
      customerName: "Legacy Customer", lines: [{
        description: "Legacy Item", unit: "pcs", quantity: 2, unitPriceMinor: 5000,
        discountMinor: 0, taxRateBps: 0, taxableMinor: 10000, taxMinor: 0, totalMinor: 10000
      }],
      subtotalMinor: 10000, discountMinor: 0, taxMinor: 0, totalMinor: 10000,
      paidMinor: 0, paymentStatus: "due", status: "issued", currencyCode: "INR",
      schemaVersion: 2
    } as any);
    legacy.close();

    const legacyRemoved = await unlockEncryptedDatabase(RECOVERY_KEY);
    expect(legacyRemoved).toBe(true);
    expect((await db.settings.get("main"))?.businessName).toBe("Legacy Trading House");
    expect((await db.settings.get("main"))?.taxId).toBe("LEGACY-GSTIN");
    const invoice = await db.invoices.get(14);
    expect(invoice?.invoiceNo).toBe("OLD-2026-00014");
    expect(invoice?.customerName).toBe("Legacy Customer");
    expect(invoice?.lines[0].description).toBe("Legacy Item");
    expect(await Dexie.exists(LEGACY_DATABASE_NAME)).toBe(false);
  });

  it("forces an older v5 writer to close before it takes the migration snapshot", async () => {
    const oldWindow = new AInvoiceDatabase(LEGACY_DATABASE_NAME, false);
    await oldWindow.open();
    await oldWindow.settings.put({
      id: "main", businessName: "Before close", locale: "en", currencyCode: "INR",
      countryCode: "IN", address: "", phone: "", taxId: "", invoicePrefix: "AI",
      invoiceSequence: 0, createdAt: 1, updatedAt: 1
    });
    await oldWindow.settings.update("main", { businessName: "Final legacy state" });

    const migration = unlockEncryptedDatabase(RECOVERY_KEY);
    await new Promise(resolve => setTimeout(resolve, 0));
    oldWindow.close();

    expect(await migration).toBe(true);
    expect((await db.settings.get("main"))?.businessName).toBe("Final legacy state");
    expect(await Dexie.exists(LEGACY_DATABASE_NAME)).toBe(false);
  });
});
