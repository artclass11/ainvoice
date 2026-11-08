import { db } from "./db";
import { calculateInvoiceTotals, getPaymentStatus } from "./billing";

const BACKUP_FORMAT = "AINVOICE-ENCRYPTED-BACKUP";
const BACKUP_VERSION = 1;
const ITERATIONS = 600_000;
const MAX_BACKUP_BYTES = 250 * 1024 * 1024;
const TABLE_NAMES = [
  "settings",
  "invoices",
  "products",
  "customers",
  "payments",
  "stockMovements",
  "auditEvents"
] as const;

type BackupTableName = typeof TABLE_NAMES[number];
type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw new Error("Backup validation failed: " + message);
}

function requireString(value: unknown, label: string, maxLength = 4096): string {
  if (typeof value !== "string" || value.length > maxLength) {
    fail(label + " is invalid.");
  }
  return value;
}

function requireSafeInteger(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    fail(label + " is invalid.");
  }
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") fail(label + " is invalid.");
  return value;
}

function requireArray(value: unknown, label: string, maxLength: number): unknown[] {
  if (!Array.isArray(value) || value.length > maxLength) {
    fail(label + " list is invalid or exceeds the supported record limit.");
  }
  return value;
}

function requireUniqueId(record: UnknownRecord, label: string, seen: Set<number>): number {
  const id = requireSafeInteger(record.id, label + " ID", 1);
  if (seen.has(id)) fail("Duplicate " + label + " ID.");
  seen.add(id);
  return id;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("Backup encoding is invalid.");
  }
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  if (password.length < 12) throw new Error("Use a backup password with at least 12 characters.");
  if (!globalThis.crypto?.subtle) throw new Error("Secure cryptography requires HTTPS or a native app.");
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: toArrayBuffer(salt), iterations: ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function validateBackupTables(rawTables: unknown): asserts rawTables is Record<BackupTableName, unknown[]> {
  if (!isRecord(rawTables)) fail("Tables are missing.");
  const tables = rawTables as Record<string, unknown>;
  const settingsRows = requireArray(tables.settings, "Settings", 1);
  const invoiceRows = requireArray(tables.invoices, "Invoice", 100_000);
  const productRows = requireArray(tables.products, "Product", 200_000);
  const customerRows = requireArray(tables.customers, "Customer", 200_000);
  const paymentRows = requireArray(tables.payments, "Payment", 500_000);
  const movementRows = requireArray(tables.stockMovements, "Stock movement", 1_000_000);
  const auditRows = requireArray(tables.auditEvents, "Audit event", 1_000_000);

  if (settingsRows.length !== 1 || !isRecord(settingsRows[0])) {
    fail("Exactly one business profile is required.");
  }
  const settings = settingsRows[0];
  if (settings.id !== "main") fail("Business profile identifier is invalid.");
  if (!requireString(settings.businessName, "Business name", 160).trim()) fail("Business name is empty.");
  if (!["en", "hi", "mr"].includes(requireString(settings.locale, "Language", 8))) fail("Language is unsupported.");
  if (!/^[A-Z]{3}$/.test(requireString(settings.currencyCode, "Currency", 3))) fail("Currency code is invalid.");
  if (!/^[A-Z]{2}$/.test(requireString(settings.countryCode, "Country", 2))) fail("Country code is invalid.");
  if (!/^[A-Z0-9][A-Z0-9-]{0,9}$/.test(requireString(settings.invoicePrefix, "Invoice prefix", 10))) fail("Invoice prefix is invalid.");
  requireSafeInteger(settings.invoiceSequence, "Invoice sequence");
  requireSafeInteger(settings.createdAt, "Business creation time");
  requireSafeInteger(settings.updatedAt, "Business update time");
  requireString(settings.address, "Business address", 1000);
  requireString(settings.phone, "Business phone", 40);
  requireString(settings.taxId, "Business tax ID", 80);
  if ((settings.pinSalt === undefined) !== (settings.pinHash === undefined)) {
    fail("PIN credentials are incomplete.");
  }
  if (settings.pinSalt !== undefined && settings.pinHash !== undefined) {
    const pinSalt = fromBase64(requireString(settings.pinSalt, "PIN salt", 128));
    const pinHash = fromBase64(requireString(settings.pinHash, "PIN hash", 256));
    if (pinSalt.byteLength !== 16 || pinHash.byteLength !== 32) fail("PIN credentials are malformed.");
  }

  const productIds = new Set<number>();
  const productSkus = new Set<string>();
  for (const value of productRows) {
    if (!isRecord(value)) fail("Product record is malformed.");
    const id = requireUniqueId(value, "Product", productIds);
    const name = requireString(value.name, "Product name", 160);
    const sku = requireString(value.sku, "Product SKU", 64).trim().toUpperCase();
    const unit = requireString(value.unit, "Product unit", 24);
    if (!name.trim() || !sku || !unit.trim()) fail("Product name, SKU and unit are required.");
    if (productSkus.has(sku)) fail("Duplicate product SKU.");
    productSkus.add(sku);
    requireSafeInteger(value.salePriceMinor, "Product sale price");
    requireSafeInteger(value.purchasePriceMinor, "Product purchase price");
    requireSafeInteger(value.taxRateBps, "Product tax rate");
    if ((value.taxRateBps as number) > 10000) fail("Product tax rate is outside the supported range.");
    requireSafeInteger(value.stockQuantityMilli, "Product stock");
    requireSafeInteger(value.reorderLevelMilli, "Product reorder level");
    requireBoolean(value.trackStock, "Product stock tracking");
    requireBoolean(value.active, "Product active flag");
    requireSafeInteger(value.createdAt, "Product creation time");
    requireSafeInteger(value.updatedAt, "Product update time");
    void id;
  }

  const customerIds = new Set<number>();
  for (const value of customerRows) {
    if (!isRecord(value)) fail("Customer record is malformed.");
    requireUniqueId(value, "Customer", customerIds);
    if (!requireString(value.name, "Customer name", 160).trim()) fail("Customer name is empty.");
    requireString(value.phone, "Customer phone", 40);
    requireString(value.email, "Customer email", 254);
    requireString(value.address, "Customer address", 1000);
    requireString(value.taxId, "Customer tax ID", 80);
    requireSafeInteger(value.creditLimitMinor, "Customer credit limit");
    requireSafeInteger(value.openingBalanceMinor, "Customer opening balance");
    requireBoolean(value.active, "Customer active flag");
    requireSafeInteger(value.createdAt, "Customer creation time");
    requireSafeInteger(value.updatedAt, "Customer update time");
  }

  const invoiceIds = new Set<number>();
  const invoiceNos = new Set<string>();
  const invoiceById = new Map<number, UnknownRecord>();
  for (const value of invoiceRows) {
    if (!isRecord(value)) fail("Invoice record is malformed.");
    const id = requireUniqueId(value, "Invoice", invoiceIds);
    const invoiceNo = requireString(value.invoiceNo, "Invoice number", 64);
    if (!invoiceNo.trim() || invoiceNos.has(invoiceNo)) fail("Invoice number is empty or duplicated.");
    invoiceNos.add(invoiceNo);
    requireSafeInteger(value.createdAt, "Invoice creation time");
    const dateISO = requireString(value.dateISO, "Invoice date", 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO) || Number.isNaN(Date.parse(dateISO + "T12:00:00"))) {
      fail("Invoice date is invalid.");
    }
    requireString(value.customerName, "Invoice customer name", 160);
    if (value.customerId !== undefined) {
      const customerId = requireSafeInteger(value.customerId, "Invoice customer ID", 1);
      if (!customerIds.has(customerId)) fail("An invoice refers to a missing customer.");
    }
    if (!Array.isArray(value.lines) || value.lines.length === 0 || value.lines.length > 500) {
      fail("Invoice lines are missing or exceed the limit.");
    }

    const draftLines = value.lines.map((rawLine) => {
      if (!isRecord(rawLine)) fail("Invoice line is malformed.");
      requireString(rawLine.description, "Invoice item description", 200);
      if (rawLine.productId !== undefined) {
        const productId = requireSafeInteger(rawLine.productId, "Invoice product ID", 1);
        if (!productIds.has(productId)) fail("An invoice refers to a missing product.");
      }
      if (rawLine.stockTracked !== undefined) requireBoolean(rawLine.stockTracked, "Invoice stock snapshot");
      if (rawLine.sku !== undefined) requireString(rawLine.sku, "Invoice item SKU", 64);
      requireString(rawLine.unit, "Invoice item unit", 24);
      requireSafeInteger(rawLine.unitPriceMinor, "Invoice unit price");
      requireSafeInteger(rawLine.discountMinor, "Invoice line discount");
      return {
        productId: rawLine.productId as number | undefined,
        sku: rawLine.sku as string | undefined,
        description: rawLine.description as string,
        unit: rawLine.unit as string,
        quantity: rawLine.quantity as number,
        unitPriceMinor: rawLine.unitPriceMinor as number,
        discountMinor: rawLine.discountMinor as number,
        taxRateBps: requireSafeInteger(rawLine.taxRateBps, "Invoice tax rate")
      };
    });

    const calculated = calculateInvoiceTotals(draftLines);
    const lineValues = value.lines as UnknownRecord[];
    for (let index = 0; index < calculated.lines.length; index += 1) {
      const expected = calculated.lines[index];
      const actual = lineValues[index];
      if (
        actual.taxableMinor !== expected.taxableMinor ||
        actual.taxMinor !== expected.taxMinor ||
        actual.totalMinor !== expected.totalMinor
      ) fail("Invoice line totals do not match the stored calculation.");
    }

    const subtotalMinor = requireSafeInteger(value.subtotalMinor, "Invoice subtotal");
    const discountMinor = requireSafeInteger(value.discountMinor, "Invoice discount");
    const taxMinor = requireSafeInteger(value.taxMinor, "Invoice tax");
    const totalMinor = requireSafeInteger(value.totalMinor, "Invoice total");
    if (
      subtotalMinor !== calculated.subtotalMinor ||
      discountMinor !== calculated.discountMinor ||
      taxMinor !== calculated.taxMinor ||
      totalMinor !== calculated.totalMinor
    ) fail("Invoice totals do not match the invoice lines.");

    const paidMinor = requireSafeInteger(value.paidMinor, "Invoice paid amount");
    if (paidMinor > totalMinor) fail("Invoice payments exceed the bill total.");
    if (value.paymentStatus !== getPaymentStatus(paidMinor, totalMinor)) fail("Invoice payment status is inconsistent.");
    if (value.status !== "issued" && value.status !== "void") fail("Invoice status is invalid.");
    if (value.status === "void" && paidMinor > 0) fail("A void invoice cannot contain unrefunded payments.");
    if (!/^[A-Z]{3}$/.test(requireString(value.currencyCode, "Invoice currency", 3))) fail("Invoice currency code is invalid.");
    if (value.schemaVersion !== 1 && value.schemaVersion !== 2) fail("Invoice schema version is unsupported.");
    if (value.schemaVersion === 2) {
      requireString(value.businessNameSnapshot, "Invoice seller name", 160);
      requireString(value.businessPhoneSnapshot, "Invoice seller phone", 40);
      requireString(value.businessAddressSnapshot, "Invoice seller address", 1000);
      requireString(value.businessTaxIdSnapshot, "Invoice seller tax ID", 80);
    }
    if (value.notes !== undefined) requireString(value.notes, "Invoice notes", 2000);
    invoiceById.set(id, value);
  }

  const paymentMethods = ["cash", "upi", "bank", "card", "other"];
  const paymentIds = new Set<number>();
  const paymentSums = new Map<number, number>();
  for (const value of paymentRows) {
    if (!isRecord(value)) fail("Payment record is malformed.");
    requireUniqueId(value, "Payment", paymentIds);
    const invoiceId = requireSafeInteger(value.invoiceId, "Payment invoice ID", 1);
    const invoice = invoiceById.get(invoiceId);
    if (!invoice) fail("A payment refers to a missing invoice.");
    const amount = requireSafeInteger(value.amountMinor, "Payment amount", 1);
    if (typeof value.method !== "string" || !paymentMethods.includes(value.method)) fail("Payment method is invalid.");
    requireString(value.invoiceNo, "Payment invoice number", 64);
    requireString(value.customerName, "Payment customer name", 160);
    requireString(value.reference, "Payment reference", 160);
    requireString(value.note, "Payment note", 1000);
    requireSafeInteger(value.paidAt, "Payment timestamp");
    if (value.customerId !== undefined) {
      const customerId = requireSafeInteger(value.customerId, "Payment customer ID", 1);
      if (!customerIds.has(customerId)) fail("A payment refers to a missing customer.");
    }
    if (value.invoiceNo !== invoice.invoiceNo) fail("Payment invoice number does not match its invoice.");
    const sum = (paymentSums.get(invoiceId) ?? 0) + amount;
    requireSafeInteger(sum, "Payment history total");
    paymentSums.set(invoiceId, sum);
  }
  for (const [id, invoice] of invoiceById) {
    if ((paymentSums.get(id) ?? 0) !== invoice.paidMinor) {
      fail("Payment history does not reconcile with an invoice.");
    }
  }

  const movementIds = new Set<number>();
  for (const value of movementRows) {
    if (!isRecord(value)) fail("Stock movement is malformed.");
    requireUniqueId(value, "Stock movement", movementIds);
    const productId = requireSafeInteger(value.productId, "Stock movement product ID", 1);
    if (!productIds.has(productId)) fail("A stock movement refers to a missing product.");
    requireString(value.productName, "Stock movement product name", 160);
    if (!["sale", "purchase", "return", "adjustment"].includes(String(value.type))) fail("Stock movement type is invalid.");
    if (value.referenceType !== "invoice" && value.referenceType !== "manual") fail("Stock movement reference type is invalid.");
    if (value.referenceId !== undefined) {
      const referenceId = requireSafeInteger(value.referenceId, "Stock movement reference ID", 1);
      if (value.referenceType === "invoice" && !invoiceIds.has(referenceId)) fail("A stock movement refers to a missing invoice.");
    }
    if (typeof value.quantityDeltaMilli !== "number" || !Number.isSafeInteger(value.quantityDeltaMilli) || value.quantityDeltaMilli === 0) {
      fail("Stock movement quantity is invalid.");
    }
    requireString(value.note, "Stock movement note", 200);
    requireSafeInteger(value.createdAt, "Stock movement timestamp");
  }

  const auditIds = new Set<number>();
  const auditTypes = ["invoice", "product", "customer", "payment", "stock", "backup", "settings"];
  for (const value of auditRows) {
    if (!isRecord(value)) fail("Audit record is malformed.");
    requireUniqueId(value, "Audit event", auditIds);
    if (typeof value.entityType !== "string" || !auditTypes.includes(value.entityType)) fail("Audit entity type is invalid.");
    if (value.entityId !== undefined) requireSafeInteger(value.entityId, "Audit entity ID", 1);
    requireString(value.action, "Audit action", 80);
    requireString(value.summary, "Audit summary", 1000);
    requireString(value.actorLabel, "Audit actor", 120);
    requireSafeInteger(value.createdAt, "Audit timestamp");
  }
}

function validateBackupPayload(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("Decrypted backup contents are not a valid object.");
  if (value.format !== BACKUP_FORMAT || value.schemaVersion !== BACKUP_VERSION) {
    throw new Error("Backup contents are invalid or use an unsupported schema version.");
  }
  const exportedAt = requireString(value.exportedAt, "Backup export time", 40);
  if (Number.isNaN(Date.parse(exportedAt))) fail("Backup export time is invalid.");
  validateBackupTables(value.tables);
  return value;
}

export async function createEncryptedBackup(password: string): Promise<Blob> {
  const data = await db.transaction(
    "r",
    [db.settings, db.invoices, db.products, db.customers, db.payments, db.stockMovements, db.auditEvents],
    async () => ({
      format: BACKUP_FORMAT,
      schemaVersion: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      tables: {
        settings: await db.settings.toArray(),
        invoices: await db.invoices.toArray(),
        products: await db.products.toArray(),
        customers: await db.customers.toArray(),
        payments: await db.payments.toArray(),
        stockMovements: await db.stockMovements.toArray(),
        auditEvents: await db.auditEvents.toArray()
      }
    })
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    plaintext
  );
  const envelope = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    kdf: "PBKDF2-SHA256",
    iterations: ITERATIONS,
    cipher: "AES-256-GCM",
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(encrypted))
  };
  return new Blob([JSON.stringify(envelope, null, 2)], {
    type: "application/vnd.ainvoice.backup+json"
  });
}

export async function restoreEncryptedBackup(file: File, password: string): Promise<void> {
  if (file.size > MAX_BACKUP_BYTES) {
    throw new Error("Backup file is larger than the 250 MB restore limit.");
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(await file.text()) as unknown;
  } catch {
    throw new Error("Backup file is not valid JSON.");
  }
  if (
    !isRecord(envelope) ||
    envelope.format !== BACKUP_FORMAT ||
    envelope.version !== BACKUP_VERSION ||
    envelope.kdf !== "PBKDF2-SHA256" ||
    envelope.iterations !== ITERATIONS ||
    envelope.cipher !== "AES-256-GCM" ||
    typeof envelope.salt !== "string" ||
    typeof envelope.iv !== "string" ||
    typeof envelope.ciphertext !== "string"
  ) {
    throw new Error("This is not a supported AInvoice encrypted backup.");
  }

  let salt: Uint8Array;
  let iv: Uint8Array;
  let ciphertext: Uint8Array;
  try {
    salt = fromBase64(envelope.salt);
    iv = fromBase64(envelope.iv);
    ciphertext = fromBase64(envelope.ciphertext);
    if (salt.byteLength !== 16 || iv.byteLength !== 12 || ciphertext.byteLength < 16) {
      throw new Error("Backup encryption parameters are invalid.");
    }
  } catch {
    throw new Error("Backup encryption parameters are invalid.");
  }

  let clear: ArrayBuffer;
  try {
    const key = await deriveKey(password, salt);
    clear = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv) },
      key,
      toArrayBuffer(ciphertext)
    );
  } catch {
    throw new Error("Backup could not be decrypted. Check the password and file.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(clear)) as unknown;
  } catch {
    throw new Error("Decrypted backup contents are not valid JSON.");
  }
  validateBackupPayload(parsed);

  const tables = parsed.tables as Record<BackupTableName, unknown[]>;
  const business = tables.settings[0] as UnknownRecord;
  // Upgrade older valid backup records to the current immutable invoice snapshot shape.
  tables.invoices = tables.invoices.map((rawInvoice) => {
    const invoice = rawInvoice as UnknownRecord;
    return {
      ...invoice,
      businessNameSnapshot: invoice.businessNameSnapshot ?? business.businessName,
      businessPhoneSnapshot: invoice.businessPhoneSnapshot ?? business.phone,
      businessAddressSnapshot: invoice.businessAddressSnapshot ?? business.address,
      businessTaxIdSnapshot: invoice.businessTaxIdSnapshot ?? business.taxId,
      schemaVersion: 2
    };
  });
  await db.transaction(
    "rw",
    [db.settings, db.invoices, db.products, db.customers, db.payments, db.stockMovements, db.auditEvents],
    async () => {
      for (const name of TABLE_NAMES) {
        await db.table(name).clear();
        const records = tables[name] as object[];
        if (records.length > 0) await db.table(name).bulkPut(records);
      }
    }
  );
}
