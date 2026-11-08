import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, lockEncryptedDatabase, unlockEncryptedDatabase, type DeviceSettings } from "./db";
import {
  createInvoice,
  recordPayment,
  saveCustomer,
  saveProduct,
  voidInvoice
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

async function makeProduct(stockQuantityMilli = 5000): Promise<number> {
  return saveProduct({
    name: "Test item",
    sku: "TEST-001",
    unit: "pcs",
    salePriceMinor: 10000,
    purchasePriceMinor: 7000,
    taxRateBps: 0,
    stockQuantityMilli,
    reorderLevelMilli: 500,
    trackStock: true,
    active: true
  });
}

async function makeCustomer(): Promise<number> {
  return saveCustomer({
    name: "Walk-in trade customer",
    phone: "",
    email: "",
    address: "",
    taxId: "",
    creditLimitMinor: 100000,
    openingBalanceMinor: 0,
    active: true
  });
}

describe("transactional billing workflows", () => {
  it("issues a bill, decrements fractional stock, records the first payment and allocates later payments", async () => {
    const productId = await makeProduct(5000);
    const customerId = await makeCustomer();

    const invoice = await createInvoice({
      customerId,
      customerName: "ignored when customer is selected",
      lines: [
        { productId, sku: "TEST-001", description: "Test item", unit: "pcs", quantity: 1.5, unitPriceMinor: 10000, taxRateBps: 0 },
        { productId, sku: "TEST-001", description: "Test item", unit: "pcs", quantity: 2, unitPriceMinor: 10000, taxRateBps: 0 }
      ],
      paidMinor: 5000,
      paymentMethod: "upi",
      paymentReference: "UPI-REF-1"
    });

    expect(invoice.customerName).toBe("Walk-in trade customer");
    expect(invoice.businessNameSnapshot).toBe("Test Store");
    expect(invoice.businessAddressSnapshot).toBe("");
    await db.settings.update("main", { businessName: "Renamed Store", address: "New Address" });
    expect((await db.invoices.get(invoice.id!))?.businessNameSnapshot).toBe("Test Store");
    expect(invoice.totalMinor).toBe(35000);
    expect(invoice.paidMinor).toBe(5000);
    expect(invoice.paymentStatus).toBe("partial");
    expect(invoice.lines.every((line) => line.stockTracked)).toBe(true);
    expect((await db.products.get(productId))?.stockQuantityMilli).toBe(1500);
    const saleMovements = await db.stockMovements.where("type").equals("sale").toArray();
    expect(saleMovements).toHaveLength(2);
    expect(saleMovements.every((movement) => (
      movement.referenceType === "invoice" && movement.referenceId === invoice.id
    ))).toBe(true);

    const updated = await recordPayment({ invoiceId: invoice.id!, amountMinor: 30000, method: "cash" });
    expect(updated.paidMinor).toBe(35000);
    expect(updated.paymentStatus).toBe("paid");
    const paymentRows = await db.payments.where("invoiceId").equals(invoice.id!).toArray();
    expect(paymentRows.reduce((sum, payment) => sum + payment.amountMinor, 0)).toBe(35000);
    await expect(recordPayment({ invoiceId: invoice.id!, amountMinor: 1, method: "cash" })).rejects.toThrow(/amount due/);
  });

  it("serializes simultaneous sales so the final stock unit is never oversold", async () => {
    const productId = await makeProduct(1000);
    const input = {
      customerName: "Concurrent buyer",
      lines: [{
        productId,
        sku: "TEST-001",
        description: "Test item",
        quantity: 1,
        unitPriceMinor: 10000,
        taxRateBps: 0
      }]
    };

    const outcomes = await Promise.allSettled([
      createInvoice(input),
      createInvoice(input)
    ]);

    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await db.invoices.count()).toBe(1);
    expect((await db.settings.get("main"))?.invoiceSequence).toBe(1);
    expect((await db.products.get(productId))?.stockQuantityMilli).toBe(0);
    expect(await db.stockMovements.where("type").equals("sale").count()).toBe(1);
  });

  it("serializes simultaneous payments and allocates no more than the remaining balance", async () => {
    const invoice = await createInvoice({
      customerName: "Concurrent payer",
      lines: [{ description: "Service", quantity: 1, unitPriceMinor: 10000, taxRateBps: 0 }]
    });

    const outcomes = await Promise.allSettled([
      recordPayment({ invoiceId: invoice.id!, amountMinor: 7000, method: "upi", reference: "UPI-1" }),
      recordPayment({ invoiceId: invoice.id!, amountMinor: 7000, method: "upi", reference: "UPI-2" })
    ]);

    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);
    const saved = await db.invoices.get(invoice.id!);
    expect(saved?.paidMinor).toBe(7000);
    expect(saved?.paymentStatus).toBe("partial");
    expect(await db.payments.where("invoiceId").equals(invoice.id!).count()).toBe(1);
  });

  it("enforces customer credit limits against opening balances and unpaid invoices", async () => {
    const customerId = await saveCustomer({
      name: "Credit customer",
      phone: "",
      email: "",
      address: "",
      taxId: "",
      creditLimitMinor: 10000,
      openingBalanceMinor: 2500,
      active: true
    });

    const first = await createInvoice({
      customerId,
      customerName: "Ignored",
      lines: [{ description: "Goods", quantity: 1, unitPriceMinor: 10000, taxRateBps: 0 }],
      paidMinor: 2500
    });
    expect(first.totalMinor - first.paidMinor).toBe(7500);

    // A fully paid cash sale does not increase the customer's credit exposure.
    const cashSale = await createInvoice({
      customerId,
      customerName: "Ignored",
      lines: [{ description: "Cash goods", quantity: 1, unitPriceMinor: 1000, taxRateBps: 0 }],
      paidMinor: 1000
    });
    expect(cashSale.paymentStatus).toBe("paid");

    await expect(createInvoice({
      customerId,
      customerName: "Ignored",
      lines: [{ description: "Credit goods", quantity: 1, unitPriceMinor: 1, taxRateBps: 0 }]
    })).rejects.toThrow(/credit limit exceeded/i);

    expect(await db.invoices.count()).toBe(2);
    expect((await db.settings.get("main"))?.invoiceSequence).toBe(2);
  });

  it("treats a zero customer credit limit as not configured", async () => {
    const customerId = await saveCustomer({
      name: "Unrestricted customer",
      phone: "",
      email: "",
      address: "",
      taxId: "",
      creditLimitMinor: 0,
      openingBalanceMinor: 500000,
      active: true
    });

    const invoice = await createInvoice({
      customerId,
      customerName: "Ignored",
      lines: [{ description: "Credit goods", quantity: 1, unitPriceMinor: 10000, taxRateBps: 0 }]
    });

    expect(invoice.paymentStatus).toBe("due");
  });

  it("rolls back invoice number, stock and ledger writes when stock is insufficient", async () => {
    const productId = await makeProduct(2000);

    await expect(createInvoice({
      customerName: "Customer",
      lines: [
        { productId, description: "Test item", quantity: 2.001, unitPriceMinor: 10000, taxRateBps: 0 }
      ]
    })).rejects.toThrow(/Insufficient stock/);

    expect(await db.invoices.count()).toBe(0);
    expect((await db.products.get(productId))?.stockQuantityMilli).toBe(2000);
    expect(await db.stockMovements.where("type").equals("sale").count()).toBe(0);
    expect((await db.settings.get("main"))?.invoiceSequence).toBe(0);
    expect(await db.payments.count()).toBe(0);
  });

  it("rejects over-length records before creating data that encrypted backups cannot restore", async () => {
    const validLine = [{ description: "Service", quantity: 1, unitPriceMinor: 1000, taxRateBps: 0 }];

    await expect(createInvoice({ customerName: "x".repeat(161), lines: validLine }))
      .rejects.toThrow(/Customer name must be 160 characters/);
    await expect(createInvoice({ customerName: "Customer", notes: "x".repeat(2001), lines: validLine }))
      .rejects.toThrow(/Notes must be 2,000 characters/);
    await expect(createInvoice({
      customerName: "Customer",
      lines: validLine,
      paidMinor: 100,
      paymentReference: "x".repeat(161)
    })).rejects.toThrow(/Payment reference must be 160 characters/);
    await expect(saveProduct({
      name: "x".repeat(161), sku: "LONG-NAME", unit: "pcs", salePriceMinor: 100,
      purchasePriceMinor: 50, taxRateBps: 0, stockQuantityMilli: 0,
      reorderLevelMilli: 0, trackStock: true, active: true
    })).rejects.toThrow(/Item name must be 160 characters/);

    expect(await db.invoices.count()).toBe(0);
    expect(await db.products.count()).toBe(0);
  });

  it("rejects over-length payment details before writing to the payment ledger", async () => {
    const invoice = await createInvoice({
      customerName: "Customer",
      lines: [{ description: "Service", quantity: 1, unitPriceMinor: 10000, taxRateBps: 0 }]
    });

    await expect(recordPayment({
      invoiceId: invoice.id!, amountMinor: 100, method: "cash", reference: "x".repeat(161)
    })).rejects.toThrow(/Payment reference must be 160 characters/);
    await expect(recordPayment({
      invoiceId: invoice.id!, amountMinor: 100, method: "cash", note: "x".repeat(1001)
    })).rejects.toThrow(/Payment note must be 1,000 characters/);

    expect(await db.payments.count()).toBe(0);
    expect((await db.invoices.get(invoice.id!))?.paidMinor).toBe(0);
  });

  it("blocks a bill when its selected customer is missing or inactive", async () => {
    const customerId = await makeCustomer();
    await db.customers.update(customerId, { active: false });

    await expect(createInvoice({
      customerId,
      customerName: "Customer",
      lines: [{ description: "Service", quantity: 1, unitPriceMinor: 100, taxRateBps: 0 }]
    })).rejects.toThrow(/inactive/);
    expect(await db.invoices.count()).toBe(0);
  });

  it("blocks payments when the payment ledger no longer reconciles to the invoice", async () => {
    const invoice = await createInvoice({
      customerName: "Customer",
      lines: [{ description: "Service", quantity: 1, unitPriceMinor: 10000, taxRateBps: 0 }]
    });
    await db.invoices.update(invoice.id!, { paidMinor: 500, paymentStatus: "partial" });

    await expect(recordPayment({ invoiceId: invoice.id!, amountMinor: 100, method: "cash" }))
      .rejects.toThrow(/Payment history does not match/);
    expect(await db.payments.where("invoiceId").equals(invoice.id!).count()).toBe(0);
  });

  it("restores only stock actually deducted when an unpaid bill is voided", async () => {
    const productId = await makeProduct(3000);
    const invoice = await createInvoice({
      customerName: "Customer",
      lines: [{ productId, description: "Test item", quantity: 1.25, unitPriceMinor: 10000, taxRateBps: 0 }]
    });

    expect((await db.products.get(productId))?.stockQuantityMilli).toBe(1750);
    await voidInvoice(invoice.id!, "Duplicate bill");
    expect((await db.products.get(productId))?.stockQuantityMilli).toBe(3000);
    expect((await db.invoices.get(invoice.id!))?.status).toBe("void");

    const movements = await db.stockMovements.where("productId").equals(productId).toArray();
    expect(movements.some((movement) => movement.quantityDeltaMilli === -1250)).toBe(true);
    expect(movements.some((movement) => movement.quantityDeltaMilli === 1250)).toBe(true);
  });

  it("does not void a paid bill or create a refund implicitly", async () => {
    const productId = await makeProduct(3000);
    const invoice = await createInvoice({
      customerName: "Customer",
      lines: [{ productId, description: "Test item", quantity: 1, unitPriceMinor: 10000, taxRateBps: 0 }],
      paidMinor: 10000
    });

    await expect(voidInvoice(invoice.id!, "Wrong bill")).rejects.toThrow(/Refund or reconcile/);
    expect((await db.products.get(productId))?.stockQuantityMilli).toBe(2000);
    expect((await db.invoices.get(invoice.id!))?.status).toBe("issued");
  });

  it("rejects stale product and customer edits instead of recreating records", async () => {
    await expect(saveProduct({
      name: "Missing", sku: "MISSING-1", unit: "pcs", salePriceMinor: 100, purchasePriceMinor: 50,
      taxRateBps: 0, stockQuantityMilli: 0, reorderLevelMilli: 0, trackStock: true, active: true
    }, 999)).rejects.toThrow(/no longer exists/);

    await expect(saveCustomer({
      name: "Missing", phone: "", email: "", address: "", taxId: "", creditLimitMinor: 0,
      openingBalanceMinor: 0, active: true
    }, 999)).rejects.toThrow(/no longer exists/);
  });

  it("rejects negative credit limits and invalid product tax or stock values", async () => {
    await expect(saveCustomer({
      name: "Bad customer", phone: "", email: "", address: "", taxId: "", creditLimitMinor: -1,
      openingBalanceMinor: 0, active: true
    })).rejects.toThrow(/Credit limit/);

    await expect(saveProduct({
      name: "Bad item", sku: "BAD-1", unit: "pcs", salePriceMinor: 100, purchasePriceMinor: 50,
      taxRateBps: 10001, stockQuantityMilli: 0, reorderLevelMilli: 0, trackStock: true, active: true
    })).rejects.toThrow(/tax rate/);
  });
});
