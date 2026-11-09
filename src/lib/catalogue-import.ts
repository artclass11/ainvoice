import { db, type Product } from "./db";
import type { ProductImportRecord } from "./catalogue-csv";

export const MAX_CATALOGUE_IMPORT = 5000;

/**
 * Commit an already-previewed CSV batch in one IndexedDB transaction.
 * SKU conflicts are rechecked here so a catalogue change between preview and
 * confirmation cannot create partial imports or overwrite existing products.
 */
export async function importProductCatalogue(
  records: readonly ProductImportRecord[]
): Promise<number> {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("There are no valid catalogue rows to import.");
  }
  if (records.length > MAX_CATALOGUE_IMPORT) {
    throw new Error("Catalogue import exceeds the supported row limit.");
  }

  const normalized = records.map((record) => {
    const name = record.name.trim();
    const sku = record.sku.trim().toUpperCase();
    const unit = record.unit.trim();
    if (!name || name.length > 160 || !sku || sku.length > 64 || !unit || unit.length > 24) {
      throw new Error("A product name, SKU or unit is invalid. Rebuild the CSV preview.");
    }
    for (const [value, label] of [
      [record.salePriceMinor, "Sale price"],
      [record.purchasePriceMinor, "Purchase price"],
      [record.taxRateBps, "Tax rate"],
      [record.stockQuantityMilli, "Stock quantity"],
      [record.reorderLevelMilli, "Reorder level"]
    ] as const) {
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(label + " is invalid. Rebuild the CSV preview.");
      }
    }
    if (record.taxRateBps > 10_000 || typeof record.trackStock !== "boolean" ||
        typeof record.active !== "boolean") {
      throw new Error("A product tax or status value is invalid. Rebuild the CSV preview.");
    }
    return {
      ...record,
      name,
      sku,
      unit,
      stockQuantityMilli: record.trackStock ? record.stockQuantityMilli : 0
    };
  });

  const seen = new Set<string>();
  for (const product of normalized) {
    if (seen.has(product.sku)) throw new Error("A SKU is repeated in the import batch: " + product.sku + ".");
    seen.add(product.sku);
  }

  return db.transaction(
    "rw",
    [db.products, db.stockMovements, db.auditEvents],
    async () => {
      const existing = await db.products.toArray();
      const existingSkus = new Set(existing.map(product => product.sku.trim().toUpperCase()));
      const conflict = normalized.find(product => existingSkus.has(product.sku));
      if (conflict) {
        throw new Error("SKU " + conflict.sku + " was added after the preview. Reopen the CSV preview.");
      }

      const now = Date.now();
      for (const product of normalized) {
        const id = await db.products.add({
          ...product,
          createdAt: now,
          updatedAt: now
        } as Omit<Product, "id">);
        if (product.trackStock && product.stockQuantityMilli > 0) {
          await db.stockMovements.add({
            productId: id,
            productName: product.name,
            type: "adjustment",
            quantityDeltaMilli: product.stockQuantityMilli,
            referenceType: "manual",
            note: "CSV catalogue import opening stock",
            createdAt: now
          });
        }
      }

      await db.auditEvents.add({
        entityType: "product",
        action: "catalogue_csv_import",
        summary: "Imported " + normalized.length + " products from CSV",
        actorLabel: "Local user",
        createdAt: now
      });
      return normalized.length;
    }
  );
}
