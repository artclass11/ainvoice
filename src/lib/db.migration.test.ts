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
});
