import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { AInvoiceDatabase } from "./db";

const databaseName = "ainvoice-v1-migration-test";

afterEach(async () => {
  const cleanup = new Dexie(databaseName);
  await cleanup.delete();
});

describe("database schema migrations", () => {
  it("upgrades version 1 invoices and paid totals without losing history", async () => {
    const legacy = new Dexie(databaseName);
    legacy.version(1).stores({
      invoices: "++id,&invoiceNo,dateISO,customerName,paymentStatus,status",
      settings: "id"
    });
    await legacy.open();

    await legacy.table("settings").put({
      id: "main",
      businessName: "Legacy Shop",
      locale: "en",
      pinSalt: "legacy-salt",
      pinHash: "legacy-hash",
      createdAt: 100,
      updatedAt: 100
    });
    await legacy.table("invoices").put({
      id: 1,
      invoiceNo: "AI-2601-00001",
      createdAt: 200,
      dateISO: "2026-01-15",
      customerName: "Old Customer",
      lines: [{
        description: "Pen",
        quantity: 1,
        unitPriceMinor: 1000,
        taxRateBps: 0,
        taxableMinor: 1000,
        taxMinor: 0,
        totalMinor: 1000
      }],
      subtotalMinor: 1000,
      taxMinor: 0,
      totalMinor: 1000,
      paidMinor: 1000,
      paymentStatus: "paid",
      status: "issued"
    });
    legacy.close();

    const current = new AInvoiceDatabase(databaseName);
    await current.open();

    const invoice = await current.invoices.get(1);
    expect(invoice).toBeDefined();
    expect(invoice?.invoiceNo).toBe("AI-2601-00001");
    expect(invoice?.lines[0].unit).toBe("pcs");
    expect(invoice?.lines[0].discountMinor).toBe(0);
    expect(invoice?.currencyCode).toBe("INR");
    expect(invoice?.businessNameSnapshot).toBe("Legacy Shop");
    expect(invoice?.businessTaxIdSnapshot).toBe("");
    expect(invoice?.schemaVersion).toBe(2);

    const payments = await current.payments.where("invoiceId").equals(1).toArray();
    expect(payments).toHaveLength(1);
    expect(payments[0].amountMinor).toBe(1000);
    expect(payments[0].method).toBe("cash");
    expect((await current.settings.get("main"))?.invoiceSequence).toBe(1);

    current.close();
  });
  it("backfills invoice IDs on historical stock-sale movements", async () => {
    const legacy = new Dexie(databaseName);
    legacy.version(3).stores({
      invoices: "++id,&invoiceNo,dateISO,customerName,customerId,paymentStatus,status",
      settings: "id",
      products: "++id,&sku,name,active,trackStock",
      customers: "++id,name,phone,active",
      payments: "++id,invoiceId,invoiceNo,customerId,paidAt,method",
      stockMovements: "++id,productId,type,referenceType,referenceId,createdAt",
      auditEvents: "++id,entityType,entityId,action,createdAt"
    });
    await legacy.open();
    await legacy.table("invoices").put({ id: 7, invoiceNo: "AI-2611-00007" });
    await legacy.table("stockMovements").put({
      id: 4, productId: 9, productName: "Legacy item", type: "sale",
      quantityDeltaMilli: -1000, referenceType: "invoice",
      note: "AI-2611-00007", createdAt: 101
    });
    await legacy.table("stockMovements").put({
      id: 5, productId: 9, productName: "Manual adjustment", type: "adjustment",
      quantityDeltaMilli: 1000, referenceType: "manual",
      note: "Opening balance", createdAt: 102
    });
    legacy.close();

    const current = new AInvoiceDatabase(databaseName);
    await current.open();
    expect((await current.stockMovements.get(4))?.referenceId).toBe(7);
    expect((await current.stockMovements.get(5))?.referenceId).toBeUndefined();
    current.close();
  });
  it("adds supplier and purchase ledgers in version 5 without changing existing settings", async () => {
    const legacy = new Dexie(databaseName);
    legacy.version(4).stores({
      invoices: "++id,&invoiceNo,dateISO,customerName,customerId,paymentStatus,status",
      settings: "id",
      products: "++id,&sku,name,active,trackStock",
      customers: "++id,name,phone,active",
      payments: "++id,invoiceId,invoiceNo,customerId,paidAt,method",
      stockMovements: "++id,productId,type,referenceType,referenceId,createdAt",
      auditEvents: "++id,entityType,entityId,action,createdAt"
    });
    await legacy.open();
    await legacy.table("settings").put({
      id: "main",
      businessName: "Legacy Shop",
      locale: "en",
      currencyCode: "INR",
      countryCode: "IN",
      address: "",
      phone: "",
      taxId: "",
      invoicePrefix: "AI",
      invoiceSequence: 12,
      createdAt: 100,
      updatedAt: 100
    });
    legacy.close();

    const current = new AInvoiceDatabase(databaseName);
    await current.open();
    const settings = await current.settings.get("main");
    expect(settings?.invoiceSequence).toBe(12);
    expect(settings?.purchasePrefix).toBe("PUR");
    expect(settings?.purchaseSequence).toBe(0);
    expect(await current.suppliers.count()).toBe(0);
    expect(await current.purchases.count()).toBe(0);
    expect(await current.supplierPayments.count()).toBe(0);
    current.close();
  });

});
