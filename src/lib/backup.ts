import { db } from "./db";
import { calculateInvoiceTotals, getPaymentStatus, quantityToMilli } from "./billing";

const BACKUP_FORMAT = "AINVOICE-ENCRYPTED-BACKUP";
const BACKUP_VERSION = 2;
const ITERATIONS = 600_000;
const MAX_BACKUP_BYTES = 250 * 1024 * 1024;
const TABLE_NAMES = [
  "settings",
  "invoices",
  "products",
  "customers",
  "payments",
  "suppliers",
  "purchases",
  "supplierPayments",
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

function validateBackupTables(rawTables: unknown, schemaVersion: number): asserts rawTables is Record<BackupTableName, unknown[]> {
  if (!isRecord(rawTables)) fail("Tables are missing.");
  const tables = rawTables as Record<string, unknown>;
  const settingsRows = requireArray(tables.settings, "Settings", 1);
  const invoiceRows = requireArray(tables.invoices, "Invoice", 100_000);
  const productRows = requireArray(tables.products, "Product", 200_000);
  const customerRows = requireArray(tables.customers, "Customer", 200_000);
  const paymentRows = requireArray(tables.payments, "Payment", 500_000);
  const supplierRows = requireArray(tables.suppliers ?? (schemaVersion === 1 ? [] : undefined), "Supplier", 200_000);
  const purchaseRows = requireArray(tables.purchases ?? (schemaVersion === 1 ? [] : undefined), "Purchase", 100_000);
  const supplierPaymentRows = requireArray(tables.supplierPayments ?? (schemaVersion === 1 ? [] : undefined), "Supplier payment", 500_000);
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
  if (schemaVersion >= 2) {
    if (!/^[A-Z0-9][A-Z0-9-]{0,9}$/.test(requireString(settings.purchasePrefix, "Purchase prefix", 10))) {
      fail("Purchase prefix is invalid.");
    }
    requireSafeInteger(settings.purchaseSequence, "Purchase sequence");
  } else {
    if (settings.purchasePrefix !== undefined && !/^[A-Z0-9][A-Z0-9-]{0,9}$/.test(requireString(settings.purchasePrefix, "Purchase prefix", 10))) fail("Purchase prefix is invalid.");
    if (settings.purchaseSequence !== undefined) requireSafeInteger(settings.purchaseSequence, "Purchase sequence");
  }
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
  if (settings.pinFailedAttempts !== undefined) {
    requireSafeInteger(settings.pinFailedAttempts, "Failed PIN attempt count");
    if ((settings.pinFailedAttempts as number) > 1_000_000) fail("Failed PIN attempt count is outside the supported range.");
  }
  if (settings.pinLockedUntil !== undefined) {
    requireSafeInteger(settings.pinLockedUntil, "PIN lockout expiry");
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

  const supplierIds = new Set<number>();
  for (const value of supplierRows) {
    if (!isRecord(value)) fail("Supplier record is malformed.");
    requireUniqueId(value, "Supplier", supplierIds);
    if (!requireString(value.name, "Supplier name", 160).trim()) fail("Supplier name is empty.");
    requireString(value.phone, "Supplier phone", 40);
    requireString(value.email, "Supplier email", 254);
    requireString(value.address, "Supplier address", 1000);
    requireString(value.taxId, "Supplier tax ID", 80);
    requireBoolean(value.active, "Supplier active flag");
    requireSafeInteger(value.createdAt, "Supplier creation time");
    requireSafeInteger(value.updatedAt, "Supplier update time");
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
    if (value.customerId !== invoice.customerId || value.customerName !== invoice.customerName) {
      fail("Payment customer assignment does not match its invoice.");
    }
    const sum = (paymentSums.get(invoiceId) ?? 0) + amount;
    requireSafeInteger(sum, "Payment history total");
    paymentSums.set(invoiceId, sum);
  }
  for (const [id, invoice] of invoiceById) {
    if ((paymentSums.get(id) ?? 0) !== invoice.paidMinor) {
      fail("Payment history does not reconcile with an invoice.");
    }
  }

  const purchaseIds = new Set<number>();
  const purchaseNos = new Set<string>();
  const purchaseById = new Map<number, UnknownRecord>();
  for (const value of purchaseRows) {
    if (!isRecord(value)) fail("Purchase record is malformed.");
    const id = requireUniqueId(value, "Purchase", purchaseIds);
    const purchaseNo = requireString(value.purchaseNo, "Purchase number", 64);
    if (!purchaseNo.trim() || purchaseNos.has(purchaseNo)) fail("Purchase number is empty or duplicated.");
    purchaseNos.add(purchaseNo);
    requireSafeInteger(value.createdAt, "Purchase creation time");
    const dateISO = requireString(value.dateISO, "Purchase date", 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO) || Number.isNaN(Date.parse(dateISO + "T12:00:00"))) {
      fail("Purchase date is invalid.");
    }
    requireString(value.supplierName, "Purchase supplier name", 160);
    if (!String(value.supplierName).trim()) fail("Purchase supplier name is empty.");
    if (value.supplierId !== undefined) {
      const supplierId = requireSafeInteger(value.supplierId, "Purchase supplier ID", 1);
      if (!supplierIds.has(supplierId)) fail("A purchase refers to a missing supplier.");
    }
    if (!Array.isArray(value.lines) || value.lines.length === 0 || value.lines.length > 500) {
      fail("Purchase lines are missing or exceed the limit.");
    }
    const draftLines = value.lines.map((rawLine) => {
      if (!isRecord(rawLine)) fail("Purchase line is malformed.");
      requireString(rawLine.description, "Purchase item description", 200);
      if (rawLine.productId !== undefined) {
        const productId = requireSafeInteger(rawLine.productId, "Purchase product ID", 1);
        if (!productIds.has(productId)) fail("A purchase refers to a missing product.");
      }
      if (rawLine.stockReceived !== undefined) requireBoolean(rawLine.stockReceived, "Purchase stock snapshot");
      if (schemaVersion >= 2 && rawLine.stockReceived === undefined) fail("Purchase stock snapshot is missing.");
      if (rawLine.sku !== undefined) requireString(rawLine.sku, "Purchase item SKU", 64);
      requireString(rawLine.unit, "Purchase item unit", 24);
      requireSafeInteger(rawLine.unitCostMinor, "Purchase unit cost");
      requireSafeInteger(rawLine.discountMinor, "Purchase line discount");
      return {
        productId: rawLine.productId as number | undefined,
        sku: rawLine.sku as string | undefined,
        description: rawLine.description as string,
        unit: rawLine.unit as string,
        quantity: rawLine.quantity as number,
        unitPriceMinor: rawLine.unitCostMinor as number,
        discountMinor: rawLine.discountMinor as number,
        taxRateBps: requireSafeInteger(rawLine.taxRateBps, "Purchase tax rate")
      };
    });
    const calculated = calculateInvoiceTotals(draftLines);
    const actualLines = value.lines as UnknownRecord[];
    for (let index = 0; index < calculated.lines.length; index += 1) {
      const expected = calculated.lines[index];
      const actual = actualLines[index];
      if (actual.taxableMinor !== expected.taxableMinor || actual.taxMinor !== expected.taxMinor ||
          actual.totalMinor !== expected.totalMinor) {
        fail("Purchase line totals do not match the stored calculation.");
      }
    }
    const subtotalMinor = requireSafeInteger(value.subtotalMinor, "Purchase subtotal");
    const discountMinor = requireSafeInteger(value.discountMinor, "Purchase discount");
    const taxMinor = requireSafeInteger(value.taxMinor, "Purchase tax");
    const totalMinor = requireSafeInteger(value.totalMinor, "Purchase total");
    if (subtotalMinor !== calculated.subtotalMinor || discountMinor !== calculated.discountMinor ||
        taxMinor !== calculated.taxMinor || totalMinor !== calculated.totalMinor) {
      fail("Purchase totals do not match the purchase lines.");
    }
    const paidMinor = requireSafeInteger(value.paidMinor, "Purchase paid amount");
    if (paidMinor > totalMinor) fail("Supplier payments exceed the purchase total.");
    if (value.paymentStatus !== getPaymentStatus(paidMinor, totalMinor)) fail("Purchase payment status is inconsistent.");
    if (value.status !== "received" && value.status !== "void") fail("Purchase status is invalid.");
    if (value.status === "void" && paidMinor > 0) fail("A void purchase cannot contain unreconciled supplier payments.");
    if (!/^[A-Z]{3}$/.test(requireString(value.currencyCode, "Purchase currency", 3))) fail("Purchase currency code is invalid.");
    if (value.schemaVersion !== 1) fail("Purchase schema version is unsupported.");
    if (value.businessNameSnapshot !== undefined) requireString(value.businessNameSnapshot, "Purchase seller name", 160);
    if (value.businessPhoneSnapshot !== undefined) requireString(value.businessPhoneSnapshot, "Purchase seller phone", 40);
    if (value.businessAddressSnapshot !== undefined) requireString(value.businessAddressSnapshot, "Purchase seller address", 1000);
    if (value.businessTaxIdSnapshot !== undefined) requireString(value.businessTaxIdSnapshot, "Purchase seller tax ID", 80);
    if (value.notes !== undefined) requireString(value.notes, "Purchase notes", 2000);
    purchaseById.set(id, value);
  }

  const supplierPaymentIds = new Set<number>();
  const supplierPaymentSums = new Map<number, number>();
  for (const value of supplierPaymentRows) {
    if (!isRecord(value)) fail("Supplier payment record is malformed.");
    requireUniqueId(value, "Supplier payment", supplierPaymentIds);
    const purchaseId = requireSafeInteger(value.purchaseId, "Supplier payment purchase ID", 1);
    const purchase = purchaseById.get(purchaseId);
    if (!purchase) fail("A supplier payment refers to a missing purchase.");
    if (purchase.status === "void") fail("A void purchase cannot contain supplier payments.");
    const amount = requireSafeInteger(value.amountMinor, "Supplier payment amount", 1);
    if (typeof value.method !== "string" || !paymentMethods.includes(value.method)) fail("Supplier payment method is invalid.");
    requireString(value.purchaseNo, "Supplier payment purchase number", 64);
    requireString(value.supplierName, "Supplier payment supplier name", 160);
    requireString(value.reference, "Supplier payment reference", 160);
    requireString(value.note, "Supplier payment note", 1000);
    requireSafeInteger(value.paidAt, "Supplier payment timestamp");
    if (value.purchaseNo !== purchase.purchaseNo || value.supplierName !== purchase.supplierName ||
        value.supplierId !== purchase.supplierId) {
      fail("Supplier payment assignment does not match its purchase.");
    }
    if (value.supplierId !== undefined && !supplierIds.has(requireSafeInteger(value.supplierId, "Supplier payment supplier ID", 1))) {
      fail("A supplier payment refers to a missing supplier.");
    }
    const sum = (supplierPaymentSums.get(purchaseId) ?? 0) + amount;
    requireSafeInteger(sum, "Supplier payment history total");
    supplierPaymentSums.set(purchaseId, sum);
  }
  for (const [id, purchase] of purchaseById) {
    if ((supplierPaymentSums.get(id) ?? 0) !== purchase.paidMinor) {
      fail("Supplier payment history does not reconcile with a purchase.");
    }
  }

  const movementIds = new Set<number>();
  const stockFlowByInvoice = new Map<number, { sales: Map<number, number>; returns: Map<number, number> }>();
  const stockFlowByPurchase = new Map<number, { receipts: Map<number, number>; returns: Map<number, number> }>();
  for (const value of movementRows) {
    if (!isRecord(value)) fail("Stock movement is malformed.");
    requireUniqueId(value, "Stock movement", movementIds);
    const productId = requireSafeInteger(value.productId, "Stock movement product ID", 1);
    if (!productIds.has(productId)) fail("A stock movement refers to a missing product.");
    requireString(value.productName, "Stock movement product name", 160);
    if (!["sale", "purchase", "return", "adjustment"].includes(String(value.type))) fail("Stock movement type is invalid.");
    if (!["invoice", "purchase", "manual"].includes(String(value.referenceType))) fail("Stock movement reference type is invalid.");
    if (value.referenceType !== "manual" && value.referenceId === undefined) {
      fail("A linked stock movement is missing its source document reference.");
    }
    if (value.referenceId !== undefined) {
      const referenceId = requireSafeInteger(value.referenceId, "Stock movement reference ID", 1);
      if (value.referenceType === "invoice") {
        if (!invoiceIds.has(referenceId)) fail("A stock movement refers to a missing invoice.");
        const sourceInvoice = invoiceById.get(referenceId);
        const sourceLines = sourceInvoice?.lines;
        if (!Array.isArray(sourceLines) || !sourceLines.some((line) => isRecord(line) && line.productId === productId)) {
          fail("A stock movement product does not match its invoice.");
        }
        if (value.note !== sourceInvoice?.invoiceNo) fail("A stock movement number does not match its invoice.");
      } else if (value.referenceType === "purchase") {
        if (!purchaseIds.has(referenceId)) fail("A stock movement refers to a missing purchase.");
        const sourcePurchase = purchaseById.get(referenceId);
        const sourceLines = sourcePurchase?.lines;
        if (!Array.isArray(sourceLines) || !sourceLines.some((line) => isRecord(line) && line.productId === productId && line.stockReceived === true)) {
          fail("A stock movement product does not match its stock-received purchase.");
        }
        if (value.note !== sourcePurchase?.purchaseNo) fail("A stock movement number does not match its purchase.");
      }
    }
    if (typeof value.quantityDeltaMilli !== "number" || !Number.isSafeInteger(value.quantityDeltaMilli) || value.quantityDeltaMilli === 0) {
      fail("Stock movement quantity is invalid.");
    }
    if (value.type === "sale" && (value.quantityDeltaMilli as number) >= 0) {
      fail("A sale stock movement must reduce stock.");
    }
    if (value.type === "purchase" && (value.quantityDeltaMilli as number) <= 0) {
      fail("A purchase stock movement must increase stock.");
    }
    if (value.type === "return" && value.referenceType === "invoice" && (value.quantityDeltaMilli as number) <= 0) {
      fail("An invoice return stock movement must increase stock.");
    }
    if (value.type === "return" && value.referenceType === "purchase" && (value.quantityDeltaMilli as number) >= 0) {
      fail("A supplier return stock movement must reduce stock.");
    }
    if (value.type === "sale" && value.referenceType !== "invoice") fail("Sales movements must refer to an invoice.");
    if (value.type === "purchase" && value.referenceType !== "purchase") fail("Purchase movements must refer to a purchase.");
    if (value.referenceType === "invoice" && (value.type === "sale" || value.type === "return")) {
      const invoiceId = value.referenceId as number;
      const flow = stockFlowByInvoice.get(invoiceId) ?? { sales: new Map<number, number>(), returns: new Map<number, number>() };
      const bucket = value.type === "sale" ? flow.sales : flow.returns;
      const amount = Math.abs(value.quantityDeltaMilli as number);
      const sum = (bucket.get(productId) ?? 0) + amount;
      requireSafeInteger(sum, "Stock movement quantity total");
      bucket.set(productId, sum);
      stockFlowByInvoice.set(invoiceId, flow);
    }
    if (value.referenceType === "purchase" && (value.type === "purchase" || value.type === "return")) {
      const purchaseId = value.referenceId as number;
      const flow = stockFlowByPurchase.get(purchaseId) ?? { receipts: new Map<number, number>(), returns: new Map<number, number>() };
      const bucket = value.type === "purchase" ? flow.receipts : flow.returns;
      const amount = Math.abs(value.quantityDeltaMilli as number);
      const sum = (bucket.get(productId) ?? 0) + amount;
      requireSafeInteger(sum, "Purchase stock movement quantity total");
      bucket.set(productId, sum);
      stockFlowByPurchase.set(purchaseId, flow);
    }
    requireString(value.note, "Stock movement note", 200);
    requireSafeInteger(value.createdAt, "Stock movement timestamp");
  }

  // Reconcile invoice-linked inventory movement totals with the issued bill.
  // Older invoice lines without stockTracked metadata are checked when a sale
  // movement exists; explicit false/true snapshots are always authoritative.
  for (const [invoiceId, invoice] of invoiceById) {
    const flow = stockFlowByInvoice.get(invoiceId) ?? { sales: new Map<number, number>(), returns: new Map<number, number>() };
    const expected = new Map<number, number>();
    for (const rawLine of invoice.lines as unknown[]) {
      if (!isRecord(rawLine) || rawLine.productId === undefined) continue;
      const productId = requireSafeInteger(rawLine.productId, "Invoice product ID", 1);
      const sold = flow.sales.get(productId) ?? 0;
      if (rawLine.stockTracked === false) {
        if (sold > 0) fail("An untracked invoice item has a stock-sale movement.");
        continue;
      }
      if (rawLine.stockTracked === true || sold > 0) {
        const amount = quantityToMilli(rawLine.quantity as number);
        expected.set(productId, (expected.get(productId) ?? 0) + amount);
      }
    }
    const productIdsToCheck = new Set<number>([
      ...expected.keys(),
      ...flow.sales.keys(),
      ...flow.returns.keys()
    ]);
    for (const productId of productIdsToCheck) {
      const sold = flow.sales.get(productId) ?? 0;
      const returned = flow.returns.get(productId) ?? 0;
      const expectedSold = expected.get(productId) ?? 0;
      if (sold !== expectedSold) fail("Stock-sale quantity does not match the invoice items.");
      const expectedReturned = invoice.status === "void" ? sold : 0;
      if (returned !== expectedReturned) fail("Stock-return quantity does not match the invoice status.");
    }
  }

  // Match received/returned stock to each purchase document.
  for (const [purchaseId, purchase] of purchaseById) {
    const flow = stockFlowByPurchase.get(purchaseId) ?? { receipts: new Map<number, number>(), returns: new Map<number, number>() };
    const expected = new Map<number, number>();
    for (const rawLine of purchase.lines as unknown[]) {
      if (!isRecord(rawLine) || rawLine.productId === undefined || rawLine.stockReceived === false) continue;
      const productId = requireSafeInteger(rawLine.productId, "Purchase product ID", 1);
      expected.set(productId, (expected.get(productId) ?? 0) + quantityToMilli(rawLine.quantity as number));
    }
    const productIdsToCheck = new Set<number>([...expected.keys(), ...flow.receipts.keys(), ...flow.returns.keys()]);
    for (const productId of productIdsToCheck) {
      const received = flow.receipts.get(productId) ?? 0;
      const returned = flow.returns.get(productId) ?? 0;
      const expectedReceived = expected.get(productId) ?? 0;
      if (received !== expectedReceived) fail("Purchase stock quantity does not match the received purchase items.");
      const expectedReturned = purchase.status === "void" ? received : 0;
      if (returned !== expectedReturned) fail("Purchase return quantity does not match the purchase status.");
    }
  }

  const auditIds = new Set<number>();
  const auditTypes = ["invoice", "product", "customer", "payment", "supplier", "purchase", "supplierPayment", "stock", "backup", "settings"];
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

function validateBackupPayload(value: unknown, expectedVersion: number): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("Decrypted backup contents are not a valid object.");
  if (value.format !== BACKUP_FORMAT || value.schemaVersion !== expectedVersion) {
    throw new Error("Backup contents are invalid or use an unsupported schema version.");
  }
  const exportedAt = requireString(value.exportedAt, "Backup export time", 40);
  if (Number.isNaN(Date.parse(exportedAt))) fail("Backup export time is invalid.");
  validateBackupTables(value.tables, expectedVersion);
  return value;
}

export async function createEncryptedBackup(password: string): Promise<Blob> {
  const data = await db.transaction(
    "r",
    [db.settings, db.invoices, db.products, db.customers, db.payments, db.suppliers, db.purchases, db.supplierPayments, db.stockMovements, db.auditEvents],
    async () => ({
      format: BACKUP_FORMAT,
      schemaVersion: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      tables: {
        settings: (await db.settings.toArray()).map((settings) => ({
          ...settings,
          purchasePrefix: settings.purchasePrefix ?? "PUR",
          purchaseSequence: settings.purchaseSequence ?? 0
        })),
        invoices: await db.invoices.toArray(),
        products: await db.products.toArray(),
        customers: await db.customers.toArray(),
        payments: await db.payments.toArray(),
        suppliers: await db.suppliers.toArray(),
        purchases: await db.purchases.toArray(),
        supplierPayments: await db.supplierPayments.toArray(),
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
    (envelope.version !== 1 && envelope.version !== BACKUP_VERSION) ||
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
  if (!isRecord(parsed) || (parsed.schemaVersion !== 1 && parsed.schemaVersion !== 2) ||
      parsed.schemaVersion !== envelope.version || !isRecord(parsed.tables)) {
    throw new Error("Backup contents are invalid or use an unsupported schema version.");
  }
  const rawTables = parsed.tables as Record<string, unknown>;
  if (parsed.schemaVersion === 1) {
    // Legacy exports predate purchase ledgers and stored only invoice numbers
    // on stock-sale rows, not the source invoice IDs.
    rawTables.suppliers = [];
    rawTables.purchases = [];
    rawTables.supplierPayments = [];
    if (Array.isArray(rawTables.settings) && isRecord(rawTables.settings[0])) {
      rawTables.settings[0].purchasePrefix = rawTables.settings[0].purchasePrefix ?? "PUR";
      rawTables.settings[0].purchaseSequence = rawTables.settings[0].purchaseSequence ?? 0;
    }
    const invoiceIdsByNumber = new Map<string, number>();
    if (Array.isArray(rawTables.invoices)) {
      for (const invoice of rawTables.invoices) {
        if (isRecord(invoice) && Number.isSafeInteger(invoice.id) && typeof invoice.invoiceNo === "string") {
          invoiceIdsByNumber.set(invoice.invoiceNo, invoice.id as number);
        }
      }
    }
    if (Array.isArray(rawTables.stockMovements)) {
      for (const movement of rawTables.stockMovements) {
        if (!isRecord(movement) || movement.referenceType !== "invoice" ||
            movement.referenceId !== undefined || typeof movement.note !== "string") continue;
        const invoiceId = invoiceIdsByNumber.get(movement.note);
        if (invoiceId !== undefined) movement.referenceId = invoiceId;
      }
    }
  }
  const validated = validateBackupPayload(parsed, envelope.version as number);

  const tables = validated.tables as Record<BackupTableName, unknown[]>;
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
    [db.settings, db.invoices, db.products, db.customers, db.payments, db.suppliers, db.purchases, db.supplierPayments, db.stockMovements, db.auditEvents],
    async () => {
      for (const name of TABLE_NAMES) {
        await db.table(name).clear();
        const records = tables[name] as object[];
        if (records.length > 0) await db.table(name).bulkPut(records);
      }
    }
  );
}
