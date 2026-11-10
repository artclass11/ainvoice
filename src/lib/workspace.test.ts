import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { AInvoiceDatabase } from "./db";
import { loadWorkspace } from "./workspace";

const names = ["ainvoice-workspace-fresh", "ainvoice-workspace-v5"];
afterEach(async () => {
  for (const name of names) await new Dexie(name).delete();
});

describe("loadWorkspace (the app shell's data load)", () => {
  it("loads from a brand-new database without a schema error", async () => {
    const database = new AInvoiceDatabase(names[0]);
    const data = await loadWorkspace(database);
    expect(data.invoices).toEqual([]);
    expect(data.purchases).toEqual([]);
    expect(data.settings).toBeUndefined();
    database.close();
  });

  it("loads from a database created by schema version 5 and sorts newest first", async () => {
    // Exact version-5 stores: no createdAt index on invoices or purchases.
    const legacy = new Dexie(names[1]);
    legacy.version(5).stores({
      invoices: "++id,&invoiceNo,dateISO,customerName,customerId,paymentStatus,status",
      settings: "id",
      products: "++id,&sku,name,active,trackStock",
      customers: "++id,name,phone,active",
      payments: "++id,invoiceId,invoiceNo,customerId,paidAt,method",
      suppliers: "++id,name,phone,active",
      purchases: "++id,&purchaseNo,dateISO,supplierName,supplierId,paymentStatus,status",
      supplierPayments: "++id,purchaseId,purchaseNo,supplierId,paidAt,method",
      stockMovements: "++id,productId,type,referenceType,referenceId,createdAt",
      auditEvents: "++id,entityType,entityId,action,createdAt"
    });
    await legacy.open();
    await legacy.table("invoices").bulkAdd([
      { invoiceNo: "AI-2611-00001", createdAt: 100, dateISO: "2026-11-01", customerName: "A" },
      { invoiceNo: "AI-2611-00002", createdAt: 300, dateISO: "2026-11-03", customerName: "B" },
      { invoiceNo: "AI-2611-00003", createdAt: 200, dateISO: "2026-11-02", customerName: "C" }
    ]);
    await legacy.table("purchases").bulkAdd([
      { purchaseNo: "PUR-2611-00001", createdAt: 10, dateISO: "2026-11-01", supplierName: "S1" },
      { purchaseNo: "PUR-2611-00002", createdAt: 20, dateISO: "2026-11-02", supplierName: "S2" }
    ]);
    legacy.close();

    const upgraded = new AInvoiceDatabase(names[1]);
    const data = await loadWorkspace(upgraded);
    expect(data.invoices.map((x) => x.invoiceNo)).toEqual(["AI-2611-00002", "AI-2611-00003", "AI-2611-00001"]);
    expect(data.purchases.map((x) => x.purchaseNo)).toEqual(["PUR-2611-00002", "PUR-2611-00001"]);
    upgraded.close();
  });
});
