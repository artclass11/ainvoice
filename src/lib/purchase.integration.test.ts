import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, lockEncryptedDatabase, unlockEncryptedDatabase, type DeviceSettings } from "./db";
import {
  createInvoice,
  createPurchase,
  recordSupplierPayment,
  saveProduct,
  saveSupplier,
  voidPurchase
} from "./billing";

const settings: DeviceSettings = {
  id: "main",
  businessName: "Test Store",
  locale: "en",
  currencyCode: "INR",
  countryCode: "IN",
  address: "",
  phone: "",
  taxId: "",
  invoicePrefix: "AI",
  invoiceSequence: 0,
  purchasePrefix: "PUR",
  purchaseSequence: 0,
  createdAt: 1,
  updatedAt: 1
};

beforeEach(async () => {
  lockEncryptedDatabase();
  await db.delete();
  await unlockEncryptedDatabase("8f2d54a1c7e9036b5d0a4e8c2f719b6d3a5e0c8f1b4d7a926e3f5c0b8a1d4e7f", false);
  await db.settings.put({ ...settings });
});

afterEach(async () => {
  lockEncryptedDatabase();
  await db.delete();
});

async function makeProduct(stockQuantityMilli = 1000, trackStock = true): Promise<number> {
  return saveProduct({
    name: "Purchase item",
    sku: "PUR-ITEM-1",
    unit: "pcs",
    salePriceMinor: 10000,
    purchasePriceMinor: 5000,
    taxRateBps: 0,
    stockQuantityMilli,
    reorderLevelMilli: 0,
    trackStock,
    active: true
  });
}

async function makeSupplier(): Promise<number> {
  return saveSupplier({
    name: "Reliable Supplies",
    phone: "",
    email: "",
    address: "",
    taxId: "",
    active: true
  });
}

describe("purchase and supplier ledger workflows", () => {
  it("receives tracked stock, snapshots the supplier and records the first supplier payment", async () => {
    const productId = await makeProduct(1000);
    const supplierId = await makeSupplier();

    const purchase = await createPurchase({
      supplierId,
      supplierName: "Ignored supplier name",
      lines: [{
        productId,
        sku: "PUR-ITEM-1",
        description: "Purchase item",
        unit: "pcs",
        quantity: 1.5,
        unitPriceMinor: 5000,
        taxRateBps: 0
      }],
      paidMinor: 2000,
      paymentMethod: "bank",
      paymentReference: "BANK-REF-1"
    });

    expect(purchase.purchaseNo).toMatch(/^PUR-\d{4}-00001$/);
    expect(purchase.supplierName).toBe("Reliable Supplies");
    expect(purchase.totalMinor).toBe(7500);
    expect(purchase.paidMinor).toBe(2000);
    expect(purchase.paymentStatus).toBe("partial");
    expect(purchase.lines[0].unitCostMinor).toBe(5000);
    expect(purchase.lines[0].stockReceived).toBe(true);
    expect((await db.products.get(productId))?.stockQuantityMilli).toBe(2500);

    const movement = (await db.stockMovements.where("type").equals("purchase").toArray())[0];
    expect(movement).toMatchObject({
      productId,
      quantityDeltaMilli: 1500,
      referenceType: "purchase",
      referenceId: purchase.id,
      note: purchase.purchaseNo
    });
    const payment = (await db.supplierPayments.where("purchaseId").equals(purchase.id!).toArray())[0];
    expect(payment).toMatchObject({
      purchaseNo: purchase.purchaseNo,
      supplierId,
      supplierName: "Reliable Supplies",
      amountMinor: 2000,
      method: "bank",
      reference: "BANK-REF-1"
    });

    // Issued purchase documents retain their supplier, item and cost snapshots
    // even when the live master records are later edited.
    await db.suppliers.update(supplierId, { name: "Renamed Supplier" });
    await db.products.update(productId, { name: "Renamed Item", purchasePriceMinor: 9000 });
    const savedPurchase = await db.purchases.get(purchase.id!);
    expect(savedPurchase?.supplierName).toBe("Reliable Supplies");
    expect(savedPurchase?.lines[0].description).toBe("Purchase item");
    expect(savedPurchase?.lines[0].unitCostMinor).toBe(5000);
    expect(savedPurchase?.totalMinor).toBe(7500);
  });

  it("reconciles supplier payments and blocks overpayment", async () => {
    const supplierId = await makeSupplier();
    const purchase = await createPurchase({
      supplierId,
      supplierName: "",
      lines: [{ description: "Packaging", quantity: 1, unitPriceMinor: 10000, taxRateBps: 0 }],
      paidMinor: 3000
    });

    const updated = await recordSupplierPayment({
      purchaseId: purchase.id!,
      amountMinor: 7000,
      method: "upi",
      reference: "UPI-SETTLEMENT"
    });
    expect(updated.paidMinor).toBe(10000);
    expect(updated.paymentStatus).toBe("paid");
    expect(await db.supplierPayments.where("purchaseId").equals(purchase.id!).count()).toBe(2);

    await expect(recordSupplierPayment({
      purchaseId: purchase.id!,
      amountMinor: 1,
      method: "cash"
    })).rejects.toThrow(/balance/);
    expect((await db.purchases.get(purchase.id!))?.paidMinor).toBe(10000);
  });

  it("voids an unpaid purchase only by reversing stock that remains available", async () => {
    const productId = await makeProduct(1000);
    const purchase = await createPurchase({
      supplierName: "Cash supplier",
      lines: [{
        productId,
        description: "Purchase item",
        quantity: 1,
        unitPriceMinor: 5000,
        taxRateBps: 0
      }]
    });

    expect((await db.products.get(productId))?.stockQuantityMilli).toBe(2000);
    await voidPurchase(purchase.id!, "Duplicate supplier bill");
    expect((await db.products.get(productId))?.stockQuantityMilli).toBe(1000);
    expect((await db.purchases.get(purchase.id!))?.status).toBe("void");
    const movements = await db.stockMovements.where("referenceId").equals(purchase.id!).toArray();
    expect(movements.filter((x) => x.type === "purchase").reduce((sum, x) => sum + x.quantityDeltaMilli, 0)).toBe(1000);
    expect(movements.filter((x) => x.type === "return").reduce((sum, x) => sum + x.quantityDeltaMilli, 0)).toBe(-1000);
  });

  it("does not void a receipt after the received stock has been sold", async () => {
    const productId = await makeProduct(0);
    const purchase = await createPurchase({
      supplierName: "Cash supplier",
      lines: [{
        productId,
        description: "Purchase item",
        quantity: 1,
        unitPriceMinor: 5000,
        taxRateBps: 0
      }]
    });
    await createInvoice({
      customerName: "Buyer",
      lines: [{
        productId,
        description: "Purchase item",
        quantity: 1,
        unitPriceMinor: 10000,
        taxRateBps: 0
      }]
    });

    await expect(voidPurchase(purchase.id!, "Duplicate receipt")).rejects.toThrow(/already been used/);
    expect((await db.purchases.get(purchase.id!))?.status).toBe("received");
    expect((await db.products.get(productId))?.stockQuantityMilli).toBe(0);
  });

  it("updates last purchase price without creating stock movements for non-stock products", async () => {
    const productId = await makeProduct(0, false);
    const purchase = await createPurchase({
      supplierName: "Service provider",
      lines: [{
        productId,
        description: "Non-stock item",
        quantity: 1,
        unitPriceMinor: 8500,
        taxRateBps: 0
      }]
    });

    expect(purchase.lines[0].stockReceived).toBe(false);
    expect((await db.products.get(productId))?.purchasePriceMinor).toBe(8500);
    expect(await db.stockMovements.where("referenceId").equals(purchase.id!).count()).toBe(0);
  });

  it("serializes purchase numbers and stock receipts under concurrent entry", async () => {
    const productId = await makeProduct(0);
    const input = {
      supplierName: "Supplier",
      lines: [{
        productId,
        description: "Purchase item",
        quantity: 1,
        unitPriceMinor: 5000,
        taxRateBps: 0
      }]
    };
    const purchases = await Promise.all([createPurchase(input), createPurchase(input)]);
    expect(new Set(purchases.map((x) => x.purchaseNo)).size).toBe(2);
    expect((await db.settings.get("main"))?.purchaseSequence).toBe(2);
    expect((await db.products.get(productId))?.stockQuantityMilli).toBe(2000);
    expect(await db.stockMovements.where("type").equals("purchase").count()).toBe(2);
  });
});
