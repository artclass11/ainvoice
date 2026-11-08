import Dexie, { type Table } from "dexie";
import {
  createKeyCheck,
  installRecordEncryption,
  parseRecoveryKey,
  verifyKeyCheck,
  type EncryptedEnvelope
} from "./db-encryption";

export type PaymentMethod = "cash" | "upi" | "bank" | "card" | "other";
export type PaymentStatus = "paid" | "partial" | "due";
export type InvoiceStatus = "issued" | "void";
export type StockMovementType = "sale" | "purchase" | "return" | "adjustment";
export type PurchaseStatus = "received" | "void";

export interface InvoiceLine {
  productId?: number;
  sku?: string;
  description: string;
  unit: string;
  quantity: number;
  unitPriceMinor: number;
  discountMinor: number;
  taxRateBps: number;
  taxableMinor: number;
  taxMinor: number;
  totalMinor: number;
  /** Whether stock was deducted when this invoice was issued. */
  stockTracked?: boolean;
}

export interface Invoice {
  id?: number;
  invoiceNo: string;
  createdAt: number;
  dateISO: string;
  customerId?: number;
  customerName: string;
  lines: InvoiceLine[];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  paidMinor: number;
  paymentStatus: PaymentStatus;
  status: InvoiceStatus;
  notes?: string;
  currencyCode: string;
  businessNameSnapshot?: string;
  businessPhoneSnapshot?: string;
  businessAddressSnapshot?: string;
  businessTaxIdSnapshot?: string;
  schemaVersion: 1 | 2;
}

export interface Product {
  id?: number;
  name: string;
  sku: string;
  unit: string;
  salePriceMinor: number;
  purchasePriceMinor: number;
  taxRateBps: number;
  stockQuantityMilli: number;
  reorderLevelMilli: number;
  trackStock: boolean;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Customer {
  id?: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  taxId: string;
  creditLimitMinor: number;
  openingBalanceMinor: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Payment {
  id?: number;
  invoiceId: number;
  invoiceNo: string;
  customerId?: number;
  customerName: string;
  amountMinor: number;
  method: PaymentMethod;
  reference: string;
  note: string;
  paidAt: number;
}

export interface Supplier {
  id?: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  taxId: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface PurchaseLine {
  productId?: number;
  sku?: string;
  description: string;
  unit: string;
  quantity: number;
  unitCostMinor: number;
  discountMinor: number;
  taxRateBps: number;
  taxableMinor: number;
  taxMinor: number;
  totalMinor: number;
  /** Whether inventory was received for this line when the document was posted. */
  stockReceived?: boolean;
}

export interface Purchase {
  id?: number;
  purchaseNo: string;
  createdAt: number;
  dateISO: string;
  supplierId?: number;
  supplierName: string;
  lines: PurchaseLine[];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  paidMinor: number;
  paymentStatus: PaymentStatus;
  status: PurchaseStatus;
  notes?: string;
  currencyCode: string;
  businessNameSnapshot?: string;
  businessPhoneSnapshot?: string;
  businessAddressSnapshot?: string;
  businessTaxIdSnapshot?: string;
  schemaVersion: 1;
}

export interface SupplierPayment {
  id?: number;
  purchaseId: number;
  purchaseNo: string;
  supplierId?: number;
  supplierName: string;
  amountMinor: number;
  method: PaymentMethod;
  reference: string;
  note: string;
  paidAt: number;
}

export interface StockMovement {
  id?: number;
  productId: number;
  productName: string;
  type: StockMovementType;
  quantityDeltaMilli: number;
  referenceType: "invoice" | "purchase" | "manual";
  referenceId?: number;
  note: string;
  createdAt: number;
}

export interface AuditEvent {
  id?: number;
  entityType: "invoice" | "product" | "customer" | "payment" | "supplier" | "purchase" | "supplierPayment" | "stock" | "backup" | "settings";
  entityId?: number;
  action: string;
  summary: string;
  actorLabel: string;
  createdAt: number;
}

export interface DeviceSettings {
  id: "main";
  businessName: string;
  locale: "en" | "hi" | "mr";
  currencyCode: string;
  countryCode: string;
  address: string;
  phone: string;
  taxId: string;
  invoicePrefix: string;
  invoiceSequence: number;
  purchasePrefix?: string;
  purchaseSequence?: number;
  pinSalt?: string;
  pinHash?: string;
  pinFailedAttempts?: number;
  pinLockedUntil?: number;
  createdAt: number;
  updatedAt: number;
}

export interface VaultMetaRecord extends EncryptedEnvelope {
  id: "main";
}

const ENCRYPTED_TABLES = [
  "invoices", "settings", "products", "customers", "payments",
  "suppliers", "purchases", "supplierPayments", "stockMovements", "auditEvents"
] as const;
export const ENCRYPTED_DATABASE_NAME = "ainvoice-secure-v1";
export const LEGACY_DATABASE_NAME = "ainvoice-local";

const runtimeEncryptionKey = new Uint8Array(32);
let runtimeEncryptionKeyUnlocked = false;

export class AInvoiceDatabase extends Dexie {
  invoices!: Table<Invoice, number>;
  settings!: Table<DeviceSettings, string>;
  products!: Table<Product, number>;
  customers!: Table<Customer, number>;
  payments!: Table<Payment, number>;
  suppliers!: Table<Supplier, number>;
  purchases!: Table<Purchase, number>;
  supplierPayments!: Table<SupplierPayment, number>;
  stockMovements!: Table<StockMovement, number>;
  auditEvents!: Table<AuditEvent, number>;
  vaultMeta!: Table<VaultMetaRecord, string>;

  constructor(
    databaseName = LEGACY_DATABASE_NAME,
    encrypted = false,
    keyProvider: () => Uint8Array = () => runtimeEncryptionKey,
    keyIsUnlocked: () => boolean = () => runtimeEncryptionKeyUnlocked
  ) {
    super(databaseName);
    if (encrypted) {
      installRecordEncryption(this, keyProvider, ENCRYPTED_TABLES);
      this.on("ready", async () => {
        if (!keyIsUnlocked()) throw new Error("Unlock the AInvoice encrypted database before reading business data.");
        const verifier = await this.vaultMeta.get("main");
        if (!verifier) {
          const counts = await Promise.all([
            this.invoices.count(), this.settings.count(), this.products.count(), this.customers.count(),
            this.payments.count(), this.suppliers.count(), this.purchases.count(), this.supplierPayments.count(),
            this.stockMovements.count(), this.auditEvents.count()
          ]);
          if (counts.some(count => count > 0)) {
            throw new Error("The encrypted database is missing its key verifier. No plaintext fallback is allowed.");
          }
          await this.vaultMeta.add({ id: "main", ...createKeyCheck(keyProvider()) });
          return;
        }
        verifyKeyCheck(verifier, keyProvider());
      });
    }
    this.version(1).stores({
      invoices: "++id,&invoiceNo,dateISO,customerName,paymentStatus,status",
      settings: "id"
    });
    this.version(2).stores({
      invoices: "++id,&invoiceNo,dateISO,customerName,customerId,paymentStatus,status",
      settings: "id",
      products: "++id,&sku,name,active,trackStock",
      customers: "++id,name,phone,active",
      payments: "++id,invoiceId,invoiceNo,customerId,paidAt,method",
      stockMovements: "++id,productId,type,referenceType,referenceId,createdAt",
      auditEvents: "++id,entityType,entityId,action,createdAt"
    }).upgrade(async (tx) => {
      const migratedPayments: Omit<Payment, "id">[] = [];
      await tx.table("invoices").toCollection().modify((invoice: Record<string, any>) => {
        invoice.discountMinor = invoice.discountMinor ?? 0;
        invoice.currencyCode = invoice.currencyCode ?? "INR";
        invoice.schemaVersion = 1;
        invoice.lines = (invoice.lines ?? []).map((line: Record<string, any>) => ({
          ...line,
          unit: line.unit ?? "pcs",
          discountMinor: line.discountMinor ?? 0,
          sku: line.sku ?? undefined
        }));
        if (invoice.paidMinor > 0 && invoice.id) {
          migratedPayments.push({
            invoiceId: invoice.id,
            invoiceNo: invoice.invoiceNo,
            customerId: invoice.customerId,
            customerName: invoice.customerName,
            amountMinor: invoice.paidMinor,
            method: "cash",
            reference: "",
            note: "Migrated payment from earlier AInvoice version",
            paidAt: invoice.createdAt ?? Date.now()
          });
        }
      });
      if (migratedPayments.length) await tx.table("payments").bulkAdd(migratedPayments);
      const existingInvoices = await tx.table("invoices").toArray() as Array<{ invoiceNo?: string }>;
      const highestExistingSequence = existingInvoices.reduce((highest, invoice) => {
        const match = invoice.invoiceNo?.match(/-(\d+)$/);
        return Math.max(highest, match ? Number(match[1]) : 0);
      }, 0);
      await tx.table("settings").toCollection().modify((value: Record<string, any>) => {
        value.currencyCode = value.currencyCode ?? "INR";
        value.countryCode = value.countryCode ?? "IN";
        value.address = value.address ?? "";
        value.phone = value.phone ?? "";
        value.taxId = value.taxId ?? "";
        value.invoicePrefix = value.invoicePrefix ?? "AI";
        value.invoiceSequence = Math.max(value.invoiceSequence ?? 0, highestExistingSequence);
      });
    });

    this.version(3).stores({
      invoices: "++id,&invoiceNo,dateISO,customerName,customerId,paymentStatus,status",
      settings: "id",
      products: "++id,&sku,name,active,trackStock",
      customers: "++id,name,phone,active",
      payments: "++id,invoiceId,invoiceNo,customerId,paidAt,method",
      stockMovements: "++id,productId,type,referenceType,referenceId,createdAt",
      auditEvents: "++id,entityType,entityId,action,createdAt"
    }).upgrade(async (tx) => {
      const business = await tx.table("settings").get("main") as Record<string, unknown> | undefined;
      await tx.table("invoices").toCollection().modify((invoice: Record<string, any>) => {
        invoice.businessNameSnapshot = invoice.businessNameSnapshot ?? business?.businessName ?? "";
        invoice.businessPhoneSnapshot = invoice.businessPhoneSnapshot ?? business?.phone ?? "";
        invoice.businessAddressSnapshot = invoice.businessAddressSnapshot ?? business?.address ?? "";
        invoice.businessTaxIdSnapshot = invoice.businessTaxIdSnapshot ?? business?.taxId ?? "";
        invoice.schemaVersion = 2;
      });
    });
    this.version(4).stores({
      invoices: "++id,&invoiceNo,dateISO,customerName,customerId,paymentStatus,status",
      settings: "id",
      products: "++id,&sku,name,active,trackStock",
      customers: "++id,name,phone,active",
      payments: "++id,invoiceId,invoiceNo,customerId,paidAt,method",
      stockMovements: "++id,productId,type,referenceType,referenceId,createdAt",
      auditEvents: "++id,entityType,entityId,action,createdAt"
    }).upgrade(async (tx) => {
      const invoices = await tx.table("invoices").toArray() as Array<{ id?: number; invoiceNo?: string }>;
      const invoiceIdsByNumber = new Map<string, number>();
      for (const invoice of invoices) {
        if (Number.isSafeInteger(invoice.id) && typeof invoice.invoiceNo === "string" && invoice.invoiceNo.length > 0) {
          invoiceIdsByNumber.set(invoice.invoiceNo, invoice.id as number);
        }
      }
      // Older builds kept only the invoice number in movement.note.
      await tx.table("stockMovements").toCollection().modify((movement: Record<string, any>) => {
        if (movement.type !== "sale" || movement.referenceType !== "invoice" ||
            movement.referenceId !== undefined || typeof movement.note !== "string") return;
        const invoiceId = invoiceIdsByNumber.get(movement.note);
        if (invoiceId !== undefined) movement.referenceId = invoiceId;
      });
    });
    this.version(5).stores({
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
    }).upgrade(async (tx) => {
      await tx.table("settings").toCollection().modify((settings: Record<string, any>) => {
        settings.purchasePrefix = settings.purchasePrefix ?? "PUR";
        settings.purchaseSequence = settings.purchaseSequence ?? 0;
      });
    });

    if (encrypted) {
      // Keep only technical/relationship indexes outside the encrypted record
      // payload. Names, phone numbers, SKUs, document numbers, dates and notes
      // are intentionally not searchable through persisted IndexedDB indexes.
      this.version(6).stores({
        invoices: "++id,customerId,paymentStatus,status",
        settings: "id",
        products: "++id",
        customers: "++id",
        payments: "++id,invoiceId,customerId,method",
        suppliers: "++id",
        purchases: "++id,supplierId,paymentStatus,status",
        supplierPayments: "++id,purchaseId,supplierId,method",
        stockMovements: "++id,productId,type,referenceType,referenceId",
        auditEvents: "++id,entityType,entityId",
        vaultMeta: "id"
      });
    }
  }
}

class LegacyMigrationDatabase extends AInvoiceDatabase {
  constructor() {
    super(LEGACY_DATABASE_NAME, false);
    // Opening v6 forces older v5 AInvoice windows to receive a versionchange
    // event and close before the migration snapshot is taken. The stores and
    // indexes are intentionally unchanged: this is a writer-fencing upgrade,
    // not a data transformation.
    this.version(6).stores({
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
  }
}

export const db = new AInvoiceDatabase(ENCRYPTED_DATABASE_NAME, true);

type LegacySnapshot = {
  invoices: Invoice[];
  settings: DeviceSettings[];
  products: Product[];
  customers: Customer[];
  payments: Payment[];
  suppliers: Supplier[];
  purchases: Purchase[];
  supplierPayments: SupplierPayment[];
  stockMovements: StockMovement[];
  auditEvents: AuditEvent[];
};

const SNAPSHOT_TABLES = [
  "invoices", "settings", "products", "customers", "payments",
  "suppliers", "purchases", "supplierPayments", "stockMovements", "auditEvents"
] as const;

function snapshotHasRecords(snapshot: LegacySnapshot): boolean {
  return SNAPSHOT_TABLES.some(name => snapshot[name].length > 0);
}

async function readSnapshot(database: AInvoiceDatabase): Promise<LegacySnapshot> {
  return database.transaction(
    "r",
    [
      database.invoices, database.settings, database.products, database.customers, database.payments,
      database.suppliers, database.purchases, database.supplierPayments, database.stockMovements, database.auditEvents
    ],
    async () => {
      const [
        invoices, settings, products, customers, payments, suppliers, purchases,
        supplierPayments, stockMovements, auditEvents
      ] = await Promise.all([
        database.invoices.toArray(), database.settings.toArray(), database.products.toArray(),
        database.customers.toArray(), database.payments.toArray(), database.suppliers.toArray(),
        database.purchases.toArray(), database.supplierPayments.toArray(),
        database.stockMovements.toArray(), database.auditEvents.toArray()
      ]);
      return {
        invoices, settings, products, customers, payments, suppliers, purchases,
        supplierPayments, stockMovements, auditEvents
      };
    }
  );
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return "{" + Object.keys(record).filter(key => record[key] !== undefined).sort()
      .map(key => JSON.stringify(key) + ":" + canonical(record[key])).join(",") + "}";
  }
  return JSON.stringify(value) ?? "undefined";
}

function equalSnapshots(left: LegacySnapshot, right: LegacySnapshot): boolean {
  return SNAPSHOT_TABLES.every(name => {
    const a = left[name].map(canonical).sort();
    const b = right[name].map(canonical).sort();
    return a.length === b.length && a.every((item, index) => item === b[index]);
  });
}

async function importSnapshot(snapshot: LegacySnapshot): Promise<void> {
  await db.transaction(
    "rw",
    [
      db.invoices, db.settings, db.products, db.customers, db.payments,
      db.suppliers, db.purchases, db.supplierPayments, db.stockMovements, db.auditEvents
    ],
    async () => {
      if (snapshot.invoices.length) await db.invoices.bulkAdd(snapshot.invoices);
      if (snapshot.settings.length) await db.settings.bulkAdd(snapshot.settings);
      if (snapshot.products.length) await db.products.bulkAdd(snapshot.products);
      if (snapshot.customers.length) await db.customers.bulkAdd(snapshot.customers);
      if (snapshot.payments.length) await db.payments.bulkAdd(snapshot.payments);
      if (snapshot.suppliers.length) await db.suppliers.bulkAdd(snapshot.suppliers);
      if (snapshot.purchases.length) await db.purchases.bulkAdd(snapshot.purchases);
      if (snapshot.supplierPayments.length) await db.supplierPayments.bulkAdd(snapshot.supplierPayments);
      if (snapshot.stockMovements.length) await db.stockMovements.bulkAdd(snapshot.stockMovements);
      if (snapshot.auditEvents.length) await db.auditEvents.bulkAdd(snapshot.auditEvents);
    }
  );
}

async function deleteLegacyDatabase(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(LEGACY_DATABASE_NAME);
    let settled = false;
    request.onblocked = () => {
      // Do not hold the opening screen indefinitely because an older tab is
      // still connected. Keep the verified encrypted copy and report the
      // incomplete cleanup so the user can close that tab and retry later.
      if (!settled) { settled = true; resolve(false); }
    };
    request.onsuccess = () => {
      if (!settled) { settled = true; resolve(true); }
    };
    request.onerror = () => {
      if (!settled) {
        settled = true;
        reject(request.error ?? new Error("Could not remove the old local database."));
      }
    };
  });
}

async function reconcileLegacyDatabase(): Promise<boolean> {
  const legacy = new LegacyMigrationDatabase();
  try {
    await legacy.open();
    const source = await readSnapshot(legacy);
    let target = await readSnapshot(db);
    if (snapshotHasRecords(source)) {
      if (!snapshotHasRecords(target)) {
        await importSnapshot(source);
        target = await readSnapshot(db);
      }
      if (!equalSnapshots(source, target)) {
        throw new Error("The encrypted copy does not match the older local records. The original database has been preserved.");
      }
    }
    db.close();
    await db.open();
    const reopened = await readSnapshot(db);
    if (snapshotHasRecords(source) && !equalSnapshots(source, reopened)) {
      throw new Error("The encrypted database failed its close-and-reopen reconciliation. The original database has been preserved.");
    }
    legacy.close();
    return await deleteLegacyDatabase();
  } finally {
    legacy.close();
  }
}

function unlockRuntimeKey(recoveryKey: string): void {
  const parsed = parseRecoveryKey(recoveryKey);
  runtimeEncryptionKey.set(parsed);
  parsed.fill(0);
  runtimeEncryptionKeyUnlocked = true;
}

function clearRuntimeKey(): void {
  runtimeEncryptionKey.fill(0);
  runtimeEncryptionKeyUnlocked = false;
}

export async function detectEncryptedDatabase(): Promise<"new" | "existing" | "unrecognized"> {
  if (typeof indexedDB === "undefined") throw new Error("IndexedDB is unavailable in this environment.");
  return new Promise((resolve, reject) => {
    let created = false;
    const request = indexedDB.open(ENCRYPTED_DATABASE_NAME);
    request.onupgradeneeded = () => {
      created = true;
      request.transaction?.abort();
    };
    request.onsuccess = () => {
      const storeNames = Array.from(request.result.objectStoreNames);
      request.result.close();
      resolve(storeNames.length === 0 ? "new" : storeNames.includes("vaultMeta") ? "existing" : "unrecognized");
    };
    request.onerror = () => {
      if (created && request.error?.name === "AbortError") resolve("new");
      else reject(request.error ?? new Error("Could not inspect encrypted local storage."));
    };
  });
}

export async function setupEncryptedDatabase(recoveryKey: string): Promise<boolean> {
  unlockRuntimeKey(recoveryKey);
  try {
    await db.open();
    return await reconcileLegacyDatabase();
  } catch (error) {
    db.close();
    await db.delete().catch(() => undefined);
    clearRuntimeKey();
    throw error;
  }
}

export async function unlockEncryptedDatabase(
  recoveryKey: string,
  reconcileLegacy = true
): Promise<boolean> {
  unlockRuntimeKey(recoveryKey);
  try {
    await db.open();
    return reconcileLegacy ? await reconcileLegacyDatabase() : true;
  } catch (error) {
    db.close();
    clearRuntimeKey();
    throw error;
  }
}

export function lockEncryptedDatabase(): void {
  db.close();
  clearRuntimeKey();
}

export async function getDeviceSettings(): Promise<DeviceSettings | undefined> {
  return db.settings.get("main");
}

export async function saveDeviceSettings(settings: DeviceSettings): Promise<void> {
  await db.settings.put(settings);
}

export function addAuditEvent(event: Omit<AuditEvent, "id" | "createdAt" | "actorLabel"> & { actorLabel?: string }): Promise<number> {
  return db.auditEvents.add({ ...event, actorLabel: event.actorLabel ?? "Local user", createdAt: Date.now() });
}
