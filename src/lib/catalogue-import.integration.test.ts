import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { importProductCatalogue } from "./catalogue-import";
import type { ProductImportRecord } from "./catalogue-csv";

const sample = (sku: string, stockQuantityMilli = 0): ProductImportRecord => ({
  name: "Item " + sku,
  sku,
  unit: "pcs",
  salePriceMinor: 1250,
  purchasePriceMinor: 900,
  taxRateBps: 500,
  stockQuantityMilli,
  reorderLevelMilli: 250,
  trackStock: true,
  active: true
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

describe("atomic product catalogue import", () => {
  it("imports products, writes opening stock movements and creates one audit event", async () => {
    const count = await importProductCatalogue([sample("NEW-1", 2250), sample("NEW-2")]);
    expect(count).toBe(2);
    const products = await db.products.toArray();
    expect(products).toHaveLength(2);
    const first = products.find(product => product.sku === "NEW-1");
    expect(first?.stockQuantityMilli).toBe(2250);
    expect(first?.createdAt).toBeGreaterThan(0);

    const movements = await db.stockMovements.toArray();
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      productId: first?.id,
      type: "adjustment",
      quantityDeltaMilli: 2250,
      referenceType: "manual",
      note: "CSV catalogue import opening stock"
    });
    const events = await db.auditEvents.toArray();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      entityType: "product",
      action: "catalogue_csv_import",
      summary: "Imported 2 products from CSV"
    });
  });

  it("rejects a SKU added after preview without partially importing the rest of the batch", async () => {
    const now = Date.now();
    await db.products.add({
      ...sample("TAKEN-1"),
      createdAt: now,
      updatedAt: now
    });
    await expect(importProductCatalogue([sample("FRESH-1"), sample("TAKEN-1")]))
      .rejects.toThrow(/added after the preview/);
    expect(await db.products.where("sku").equals("FRESH-1").count()).toBe(0);
    expect(await db.stockMovements.count()).toBe(0);
    expect(await db.auditEvents.count()).toBe(0);
  });

  it("rejects duplicate rows in a batch and invalid record values before writing", async () => {
    await expect(importProductCatalogue([sample("DUP-1"), sample("DUP-1")]))
      .rejects.toThrow(/repeated in the import batch/);
    await expect(importProductCatalogue([{ ...sample("BAD-1"), salePriceMinor: -1 }]))
      .rejects.toThrow(/Sale price is invalid/);
    expect(await db.products.count()).toBe(0);
  });

  it("normalizes SKUs and disables stock balance when stock tracking is off", async () => {
    const count = await importProductCatalogue([{
      ...sample("mixed-1", 4000),
      trackStock: false
    }]);
    expect(count).toBe(1);
    const product = await db.products.toCollection().first();
    expect(product?.sku).toBe("MIXED-1");
    expect(product?.stockQuantityMilli).toBe(0);
    expect(await db.stockMovements.count()).toBe(0);
  });
});
