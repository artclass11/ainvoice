import Dexie, { type Table } from "dexie";

export type PaymentMethod = "cash" | "upi" | "bank" | "card" | "other";
export type PaymentStatus = "paid" | "partial" | "due";
export type InvoiceStatus = "issued" | "void";
export type StockMovementType = "sale" | "purchase" | "return" | "adjustment";

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
  schemaVersion: 1;
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

export interface StockMovement {
  id?: number;
  productId: number;
  productName: string;
  type: StockMovementType;
  quantityDeltaMilli: number;
  referenceType: "invoice" | "manual";
  referenceId?: number;
  note: string;
  createdAt: number;
}

export interface AuditEvent {
  id?: number;
  entityType: "invoice" | "product" | "customer" | "payment" | "stock" | "backup" | "settings";
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
  pinSalt?: string;
  pinHash?: string;
  createdAt: number;
  updatedAt: number;
}

class AInvoiceDatabase extends Dexie {
  invoices!: Table<Invoice, number>;
  settings!: Table<DeviceSettings, string>;
  products!: Table<Product, number>;
  customers!: Table<Customer, number>;
  payments!: Table<Payment, number>;
  stockMovements!: Table<StockMovement, number>;
  auditEvents!: Table<AuditEvent, number>;

  constructor() {
    super("ainvoice-local");
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
