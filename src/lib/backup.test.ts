import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, type DeviceSettings } from "./db";
import { createInvoice, createPurchase, saveProduct, saveSupplier } from "./billing";
import { createEncryptedBackup, restoreEncryptedBackup } from "./backup";

const PASSWORD = "correct-horse-battery-staple";

const settings: DeviceSettings = {
  id: "main",
  businessName: "Backup Store",
  locale: "en",
  currencyCode: "INR",
  countryCode: "IN",
  address: "Market Road",
  phone: "",
  taxId: "",
  invoicePrefix: "AI",
  invoiceSequence: 0,
  createdAt: 1,
  updatedAt: 1
};

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.settings.put({ ...settings });
});

afterEach(async () => {
  await db.delete();
});

async function makeBackupFile(password = PASSWORD): Promise<File> {
  const backup = await createEncryptedBackup(password);
  return new File([backup], "store.ainvoice-backup.json", {
    type: "application/vnd.ainvoice.backup+json"
  });
}


async function makeLegacyV1BackupFile(password = PASSWORD): Promise<File> {
  const current = JSON.parse(await (await createEncryptedBackup(password)).text()) as {
    salt: string;
    iv: string;
    ciphertext: string;
    version: number;
    [key: string]: unknown;
  };
  const fromBase64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  const toBase64 = (value: Uint8Array) => {
    let binary = "";
    for (const byte of value) binary += String.fromCharCode(byte);
    return btoa(binary);
  };
  const salt = fromBase64(current.salt);
  const oldIv = fromBase64(current.iv);
  const cipherBytes = fromBase64(current.ciphertext);
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 600000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: oldIv }, key, cipherBytes);
  const legacy = JSON.parse(new TextDecoder().decode(plaintext)) as {
    schemaVersion: number;
    tables: Record<string, any[]>;
    [key: string]: unknown;
  };
  legacy.schemaVersion = 1;
  for (const table of ["suppliers", "purchases", "supplierPayments"]) delete legacy.tables[table];
  const settingsRow = legacy.tables.settings[0] as Record<string, unknown>;
  delete settingsRow.purchasePrefix;
  delete settingsRow.purchaseSequence;
  for (const movement of legacy.tables.stockMovements as Array<Record<string, unknown>>) {
    if (movement.referenceType === "invoice") delete movement.referenceId;
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(legacy))
  );
  const envelope = {
    format: "AINVOICE-ENCRYPTED-BACKUP",
    version: 1,
    kdf: "PBKDF2-SHA256",
    iterations: 600000,
    cipher: "AES-256-GCM",
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext))
  };
  return new File([JSON.stringify(envelope)], "legacy-v1.ainvoice-backup.json", {
    type: "application/vnd.ainvoice.backup+json"
  });
}

async function seedInvoice(paidMinor = 500): Promise<void> {
  const productId = await saveProduct({
    name: "Notebook",
    sku: "NOTE-001",
    unit: "pcs",
    salePriceMinor: 10000,
    purchasePriceMinor: 7000,
    taxRateBps: 1800,
    stockQuantityMilli: 3000,
    reorderLevelMilli: 500,
    trackStock: true,
    active: true
  });
  await createInvoice({
    customerName: "Test customer",
    lines: [{ productId, description: "Notebook", sku: "NOTE-001", unit: "pcs", quantity: 1, unitPriceMinor: 10000, taxRateBps: 1800 }],
    paidMinor
  });
}

describe("encrypted business backups", () => {
  it("round-trips invoices, stock, payments and settings", async () => {
    await seedInvoice();
    const file = await makeBackupFile();

    await db.settings.update("main", { businessName: "Changed Store" });
    await createInvoice({
      customerName: "Second customer",
      lines: [{ description: "Service", quantity: 1, unitPriceMinor: 1000, taxRateBps: 0 }]
    });

    await restoreEncryptedBackup(file, PASSWORD);

    expect((await db.settings.get("main"))?.businessName).toBe("Backup Store");
    expect(await db.invoices.count()).toBe(1);
    expect(await db.products.count()).toBe(1);
    expect(await db.payments.count()).toBe(1);
    expect((await db.invoices.toArray())[0].paidMinor).toBe(500);
    expect((await db.products.toArray())[0].stockQuantityMilli).toBe(2000);
  });

  it("restores version-1 backups and reconstructs invoice movement references", async () => {
    await seedInvoice(500);
    const legacyFile = await makeLegacyV1BackupFile();

    await db.settings.update("main", { businessName: "Newer Store" });
    await db.invoices.clear();
    await db.stockMovements.clear();
    await db.products.clear();

    await restoreEncryptedBackup(legacyFile, PASSWORD);

    const restoredSettings = await db.settings.get("main");
    expect(restoredSettings?.businessName).toBe("Backup Store");
    expect(restoredSettings?.purchasePrefix).toBe("PUR");
    expect(restoredSettings?.purchaseSequence).toBe(0);
    expect(await db.suppliers.count()).toBe(0);
    expect(await db.purchases.count()).toBe(0);
    const invoice = (await db.invoices.toArray())[0];
    const movement = (await db.stockMovements.where("type").equals("sale").toArray())[0];
    expect(movement.referenceType).toBe("invoice");
    expect(movement.referenceId).toBe(invoice.id);
  });

  it("does not change existing data when the backup password is incorrect", async () => {
    await seedInvoice();
    const file = await makeBackupFile();
    await db.settings.update("main", { businessName: "Keep This Store" });

    await expect(restoreEncryptedBackup(file, "wrong-password-value")).rejects.toThrow(/could not be decrypted/);
    expect((await db.settings.get("main"))?.businessName).toBe("Keep This Store");
    expect(await db.invoices.count()).toBe(1);
  });

  it("round-trips supplier purchases, supplier payments and purchase stock movements", async () => {
    const supplierId = await saveSupplier({
      name: "Backup Supplier",
      phone: "",
      email: "",
      address: "",
      taxId: "",
      active: true
    });
    const productId = await saveProduct({
      name: "Backup Item",
      sku: "BACKUP-ITEM",
      unit: "pcs",
      salePriceMinor: 10000,
      purchasePriceMinor: 5000,
      taxRateBps: 0,
      stockQuantityMilli: 1000,
      reorderLevelMilli: 0,
      trackStock: true,
      active: true
    });
    const purchase = await createPurchase({
      supplierId,
      supplierName: "",
      lines: [{
        productId,
        description: "Backup Item",
        sku: "BACKUP-ITEM",
        unit: "pcs",
        quantity: 2,
        unitPriceMinor: 5000,
        taxRateBps: 0
      }],
      paidMinor: 2500,
      paymentMethod: "bank",
      paymentReference: "BACKUP-REF"
    });
    const file = await makeBackupFile();

    await db.suppliers.clear();
    await db.purchases.clear();
    await db.supplierPayments.clear();
    await db.stockMovements.clear();
    await db.products.update(productId, { stockQuantityMilli: 0 });

    await restoreEncryptedBackup(file, PASSWORD);

    expect(await db.suppliers.count()).toBe(1);
    expect((await db.purchases.get(purchase.id!))?.purchaseNo).toBe(purchase.purchaseNo);
    expect((await db.purchases.get(purchase.id!))?.paidMinor).toBe(2500);
    expect(await db.supplierPayments.where("purchaseId").equals(purchase.id!).count()).toBe(1);
    expect((await db.products.get(productId))?.stockQuantityMilli).toBe(3000);
    const movement = (await db.stockMovements.where("referenceId").equals(purchase.id!).toArray())[0];
    expect(movement).toMatchObject({
      type: "purchase",
      referenceType: "purchase",
      quantityDeltaMilli: 2000,
      note: purchase.purchaseNo
    });
  });

  it("round-trips a voided supplier purchase with reversing stock movement", async () => {
    const supplierId = await saveSupplier({
      name: "Void Test Supplier",
      phone: "",
      email: "",
      address: "",
      taxId: "",
      active: true
    });
    const productId = await saveProduct({
      name: "Void Test Item",
      sku: "VOID-ITEM",
      unit: "pcs",
      salePriceMinor: 10000,
      purchasePriceMinor: 4000,
      taxRateBps: 0,
      stockQuantityMilli: 0,
      reorderLevelMilli: 0,
      trackStock: true,
      active: true
    });
    const purchase = await createPurchase({
      supplierId,
      supplierName: "",
      lines: [{
        productId,
        description: "Void Test Item",
        unit: "pcs",
        quantity: 2,
        unitPriceMinor: 4000,
        taxRateBps: 0
      }]
    });
    const { voidPurchase } = await import("./billing");
    await voidPurchase(purchase.id!, "Duplicate receipt");
    const file = await makeBackupFile();

    await db.suppliers.clear();
    await db.purchases.clear();
    await db.supplierPayments.clear();
    await db.stockMovements.clear();
    await db.products.update(productId, { stockQuantityMilli: 9999 });
    await restoreEncryptedBackup(file, PASSWORD);

    expect((await db.purchases.get(purchase.id!))?.status).toBe("void");
    expect((await db.products.get(productId))?.stockQuantityMilli).toBe(0);
    const movements = await db.stockMovements.where("referenceId").equals(purchase.id!).toArray();
    expect(movements.filter((x) => x.type === "purchase").reduce((sum, x) => sum + x.quantityDeltaMilli, 0)).toBe(2000);
    expect(movements.filter((x) => x.type === "return").reduce((sum, x) => sum + x.quantityDeltaMilli, 0)).toBe(-2000);
  });

  it("rejects payment records reassigned to a different customer", async () => {
    const originalCustomerId = await db.customers.add({
      name: "Original Customer", phone: "", email: "", address: "", taxId: "",
      creditLimitMinor: 0, openingBalanceMinor: 0, active: true, createdAt: 1, updatedAt: 1
    });
    const otherCustomerId = await db.customers.add({
      name: "Other Customer", phone: "", email: "", address: "", taxId: "",
      creditLimitMinor: 0, openingBalanceMinor: 0, active: true, createdAt: 1, updatedAt: 1
    });
    await createInvoice({
      customerId: originalCustomerId,
      customerName: "Ignored",
      lines: [{ description: "Service", quantity: 1, unitPriceMinor: 1000, taxRateBps: 0 }],
      paidMinor: 500
    });
    const payment = (await db.payments.toArray())[0];
    await db.payments.update(payment.id!, { customerId: otherCustomerId });

    const inconsistent = await makeBackupFile();
    await expect(restoreEncryptedBackup(inconsistent, PASSWORD)).rejects.toThrow(/customer assignment/);
    expect(await db.invoices.count()).toBe(1);
  });

  it("rejects a stock-sale quantity that differs from the invoice item quantity", async () => {
    await seedInvoice();
    const movement = (await db.stockMovements.where("type").equals("sale").toArray())[0];
    await db.stockMovements.update(movement.id!, { quantityDeltaMilli: -2500 });

    const inconsistent = await makeBackupFile();
    await expect(restoreEncryptedBackup(inconsistent, PASSWORD)).rejects.toThrow(/quantity does not match the invoice items/);
    expect(await db.invoices.count()).toBe(1);
  });

  it("round-trips fully reversed stock movements for a voided invoice", async () => {
    await seedInvoice(0);
    const invoice = (await db.invoices.toArray())[0];
    const { voidInvoice } = await import("./billing");
    await voidInvoice(invoice.id!, "Customer cancelled");
    const file = await makeBackupFile();

    await db.invoices.clear();
    await db.stockMovements.clear();
    await restoreEncryptedBackup(file, PASSWORD);

    expect((await db.invoices.get(invoice.id!))?.status).toBe("void");
    const movements = await db.stockMovements.where("referenceId").equals(invoice.id!).toArray();
    expect(movements.filter((movement) => movement.type === "sale").reduce((sum, x) => sum + x.quantityDeltaMilli, 0)).toBe(-1000);
    expect(movements.filter((movement) => movement.type === "return").reduce((sum, x) => sum + x.quantityDeltaMilli, 0)).toBe(1000);
  });

  it("rejects invoice stock movements without a source invoice reference", async () => {
    await seedInvoice();
    const movement = (await db.stockMovements.where("type").equals("sale").toArray())[0];
    await db.stockMovements.update(movement.id!, { referenceId: undefined });

    const inconsistent = await makeBackupFile();
    await expect(restoreEncryptedBackup(inconsistent, PASSWORD)).rejects.toThrow(/missing its source document reference/);
    expect(await db.invoices.count()).toBe(1);
  });

  it("rejects a tampered ciphertext without changing business data", async () => {
    await seedInvoice();
    const backup = await createEncryptedBackup(PASSWORD);
    const envelope = JSON.parse(await backup.text()) as { ciphertext: string };
    envelope.ciphertext = (envelope.ciphertext[0] === "A" ? "B" : "A") + envelope.ciphertext.slice(1);
    const tampered = new File([JSON.stringify(envelope)], "tampered.ainvoice-backup.json");
    await db.settings.update("main", { businessName: "Untouched Store" });

    await expect(restoreEncryptedBackup(tampered, PASSWORD)).rejects.toThrow(/could not be decrypted/);
    expect((await db.settings.get("main"))?.businessName).toBe("Untouched Store");
    expect(await db.invoices.count()).toBe(1);
  });

  it("rejects unsupported or malformed backup envelopes before decrypting", async () => {
    const malformed = new File([JSON.stringify({
      format: "AINVOICE-ENCRYPTED-BACKUP",
      version: 1,
      kdf: "PBKDF2-SHA256",
      iterations: 600000,
      cipher: "AES-256-GCM",
      salt: "AA==",
      iv: "AA==",
      ciphertext: "AA=="
    })], "malformed.ainvoice-backup.json");

    await expect(restoreEncryptedBackup(malformed, PASSWORD)).rejects.toThrow(/encryption parameters are invalid/);
    expect((await db.settings.get("main"))?.businessName).toBe("Backup Store");
    expect(await db.invoices.count()).toBe(0);
  });

  it("rejects files over the documented restore size limit", async () => {
    const oversized = {
      size: 250 * 1024 * 1024 + 1,
      text: async () => "{}"
    } as File;

    await expect(restoreEncryptedBackup(oversized, PASSWORD)).rejects.toThrow(/250 MB/);
    expect((await db.settings.get("main"))?.businessName).toBe("Backup Store");
  });
});
