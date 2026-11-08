import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { AInvoiceDatabase } from "./db";
import { createRecoveryKey } from "./db-encryption";

const databaseName = "ainvoice-encryption-test";
let database: AInvoiceDatabase | undefined;

async function readRawRows(storeName: string): Promise<Record<string, unknown>[]> {
  const raw = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const transaction = raw.transaction([storeName], "readonly");
      const request = transaction.objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result as Record<string, unknown>[]);
      request.onerror = () => reject(request.error);
    });
  } finally {
    raw.close();
  }
}

async function writeRawRow(storeName: string, value: Record<string, unknown>): Promise<void> {
  const raw = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = raw.transaction([storeName], "readwrite");
      transaction.objectStore(storeName).put(value);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error("Raw write aborted."));
    });
  } finally {
    raw.close();
  }
}

afterEach(async () => {
  database?.close();
  database = undefined;
  const cleanup = new Dexie(databaseName);
  await cleanup.delete();
});

describe("live IndexedDB record encryption", () => {
  it("encrypts sensitive values before persistence and decrypts them for application reads", async () => {
    const key = new Uint8Array(32).fill(7);
    database = new AInvoiceDatabase(databaseName, true, () => key, () => true);
    await database.open();

    await database.settings.put({
      id: "main",
      businessName: "Secret Business Name",
      locale: "en",
      currencyCode: "INR",
      countryCode: "IN",
      address: "17 Private Market Road",
      phone: "9876543210",
      taxId: "PRIVATE-GSTIN-123",
      invoicePrefix: "SECRET-PREFIX",
      invoiceSequence: 21,
      createdAt: 1,
      updatedAt: 1
    });
    await database.invoices.put({
      id: 1,
      invoiceNo: "SECRET-INVOICE-00021",
      createdAt: 1,
      dateISO: "2026-11-08",
      customerId: 12,
      customerName: "Confidential Customer",
      lines: [{
        description: "Private consultation service",
        quantity: 1,
        unit: "service",
        unitPriceMinor: 125000,
        discountMinor: 0,
        taxRateBps: 1800,
        taxableMinor: 125000,
        taxMinor: 22500,
        totalMinor: 147500
      }],
      subtotalMinor: 125000,
      discountMinor: 0,
      taxMinor: 22500,
      totalMinor: 147500,
      paidMinor: 0,
      paymentStatus: "due",
      status: "issued",
      notes: "Sensitive customer note",
      currencyCode: "INR",
      businessNameSnapshot: "Secret Business Name",
      businessPhoneSnapshot: "9876543210",
      businessAddressSnapshot: "17 Private Market Road",
      businessTaxIdSnapshot: "PRIVATE-GSTIN-123",
      schemaVersion: 2
    });

    const business = await database.settings.get("main");
    const invoice = await database.invoices.get(1);
    expect(business?.businessName).toBe("Secret Business Name");
    expect(invoice?.invoiceNo).toBe("SECRET-INVOICE-00021");
    expect(invoice?.customerName).toBe("Confidential Customer");
    expect(invoice?.lines[0].description).toBe("Private consultation service");

    const [rawSettings, rawInvoices] = await Promise.all([
      readRawRows("settings"),
      readRawRows("invoices")
    ]);
    const persisted = JSON.stringify({ rawSettings, rawInvoices });
    for (const secret of [
      "Secret Business Name", "17 Private Market Road", "9876543210",
      "PRIVATE-GSTIN-123", "SECRET-PREFIX", "SECRET-INVOICE-00021",
      "Confidential Customer", "Private consultation service", "Sensitive customer note"
    ]) {
      expect(persisted).not.toContain(secret);
    }
    expect((rawInvoices[0].__encryptedData as { ciphertext?: Uint8Array }).ciphertext).toBeInstanceOf(Uint8Array);
    expect(rawInvoices[0]).toMatchObject({ id: 1, customerId: 12, paymentStatus: "due", status: "issued" });
    expect(rawInvoices[0]).not.toHaveProperty("invoiceNo");
    expect(rawInvoices[0]).not.toHaveProperty("customerName");
  });

  it("rejects a wrong key without deleting or replacing existing ciphertext", async () => {
    const key = new Uint8Array(32).fill(11);
    database = new AInvoiceDatabase(databaseName, true, () => key, () => true);
    await database.open();
    await database.invoices.put({
      id: 1, invoiceNo: "PRIVATE-001", createdAt: 1, dateISO: "2026-11-08",
      customerName: "Private Person", lines: [], subtotalMinor: 0, discountMinor: 0,
      taxMinor: 0, totalMinor: 0, paidMinor: 0, paymentStatus: "paid",
      status: "issued", currencyCode: "INR", schemaVersion: 2
    } as any);
    const before = await readRawRows("invoices");
    database.close();

    const wrongKey = new Uint8Array(32).fill(12);
    const wrongDatabase = new AInvoiceDatabase(databaseName, true, () => wrongKey, () => true);
    await expect(wrongDatabase.open()).rejects.toThrow(/recovery key|verifier/i);
    wrongDatabase.close();

    const after = await readRawRows("invoices");
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    database = new AInvoiceDatabase(databaseName, true, () => key, () => true);
    await database.open();
    expect((await database.invoices.get(1))?.invoiceNo).toBe("PRIVATE-001");
  });

  it("authenticates record ciphertext and fails closed after tampering", async () => {
    const key = new Uint8Array(32).fill(19);
    database = new AInvoiceDatabase(databaseName, true, () => key, () => true);
    await database.open();
    await database.settings.put({
      id: "main", businessName: "Tamper Test", locale: "en", currencyCode: "INR",
      countryCode: "IN", address: "", phone: "", taxId: "", invoicePrefix: "AI",
      invoiceSequence: 0, createdAt: 1, updatedAt: 1
    });
    const [raw] = await readRawRows("settings");
    const envelope = raw.__encryptedData as { nonce: Uint8Array; ciphertext: Uint8Array; version: number };
    const tampered = { ...raw, __encryptedData: { ...envelope, ciphertext: new Uint8Array(envelope.ciphertext) } };
    (tampered.__encryptedData as typeof envelope).ciphertext[0] ^= 1;
    await writeRawRow("settings", tampered);
    await expect(database.settings.get("main")).rejects.toThrow(/authentication/i);
  });

  it("supports indexed key-only lookups and collection modifications without leaking plaintext", async () => {
    const key = new Uint8Array(32).fill(31);
    database = new AInvoiceDatabase(databaseName, true, () => key, () => true);
    await database.open();
    await database.invoices.put({
      id: 8, invoiceNo: "PRIVATE-008", createdAt: 1, dateISO: "2026-11-08",
      customerName: "Sensitive Customer", lines: [], subtotalMinor: 0, discountMinor: 0,
      taxMinor: 0, totalMinor: 0, paidMinor: 0, paymentStatus: "due",
      status: "issued", currencyCode: "INR", notes: "Original private note", schemaVersion: 2
    } as any);

    const keys = await database.invoices.where("paymentStatus").equals("due").primaryKeys();
    expect(keys).toEqual([8]);
    expect((await database.invoices.where("paymentStatus").equals("due").toArray())[0].customerName)
      .toBe("Sensitive Customer");

    await database.invoices.where("paymentStatus").equals("due").modify(invoice => {
      invoice.notes = "Changed private note";
    });
    expect((await database.invoices.get(8))?.notes).toBe("Changed private note");

    const raw = JSON.stringify(await readRawRows("invoices"));
    expect(raw).not.toContain("Sensitive Customer");
    expect(raw).not.toContain("PRIVATE-008");
    expect(raw).not.toContain("Original private note");
    expect(raw).not.toContain("Changed private note");
  });

  it("uses a fresh nonce for every record write and generates a 256-bit recovery key", async () => {
    const key = new Uint8Array(32).fill(23);
    database = new AInvoiceDatabase(databaseName, true, () => key, () => true);
    await database.open();
    const row = {
      id: 4, invoiceNo: "PRIVATE-004", createdAt: 1, dateISO: "2026-11-08",
      customerName: "Nonce Test", lines: [], subtotalMinor: 0, discountMinor: 0,
      taxMinor: 0, totalMinor: 0, paidMinor: 0, paymentStatus: "paid",
      status: "issued", currencyCode: "INR", schemaVersion: 2
    };
    await database.invoices.put(row as any);
    const [first] = await readRawRows("invoices");
    await database.invoices.put(row as any);
    const [second] = await readRawRows("invoices");
    const nonceA = (first.__encryptedData as { nonce: Uint8Array }).nonce;
    const nonceB = (second.__encryptedData as { nonce: Uint8Array }).nonce;
    expect(nonceA).toHaveLength(24);
    expect(nonceB).toHaveLength(24);
    expect(Array.from(nonceA)).not.toEqual(Array.from(nonceB));
    expect(createRecoveryKey()).toMatch(/^[0-9a-f]{64}$/);
  });
});
