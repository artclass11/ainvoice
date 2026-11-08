import Dexie, { type Table } from "dexie";

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

  constructor(databaseName = "ainvoice-local") {
    super(databaseName);
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
  }
}

export const db = new AInvoiceDatabase();

export async function getDeviceSettings(): Promise<DeviceSettings | undefined> {
  return db.settings.get("main");
}

export async function saveDeviceSettings(settings: DeviceSettings): Promise<void> {
  await db.settings.put(settings);
}

export function addAuditEvent(event: Omit<AuditEvent, "id" | "createdAt" | "actorLabel"> & { actorLabel?: string }): Promise<number> {
  return db.auditEvents.add({ ...event, actorLabel: event.actorLabel ?? "Local user", createdAt: Date.now() });
}
