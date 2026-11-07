import Dexie, { type Table } from "dexie";

export type PaymentStatus = "paid" | "partial" | "due";
export type InvoiceStatus = "issued" | "void";

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPriceMinor: number;
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
  customerName: string;
  lines: InvoiceLine[];
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  paidMinor: number;
  paymentStatus: PaymentStatus;
  status: InvoiceStatus;
}

export interface DeviceSettings {
  id: "main";
  businessName: string;
  locale: "en" | "hi" | "mr";
  pinSalt?: string;
  pinHash?: string;
  createdAt: number;
  updatedAt: number;
}

class AInvoiceDatabase extends Dexie {
  invoices!: Table<Invoice, number>;
  settings!: Table<DeviceSettings, string>;

  constructor() {
    super("ainvoice-local");
    this.version(1).stores({
      invoices: "++id,&invoiceNo,dateISO,customerName,paymentStatus,status",
      settings: "id"
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
