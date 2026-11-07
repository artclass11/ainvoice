import { db, type Invoice, type InvoiceLine, type PaymentStatus } from "./db";

export interface DraftLineInput {
  description: string;
  quantity: number;
  unitPriceMinor: number;
  taxRateBps: number;
}

export interface CreateInvoiceInput {
  customerName: string;
  lines: DraftLineInput[];
  paidInFull: boolean;
}

export interface InvoiceTotals {
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  lines: InvoiceLine[];
}

export function calculateInvoiceTotals(lines: DraftLineInput[]): InvoiceTotals {
  if (lines.length === 0) throw new Error("Add at least one item.");
  let subtotalMinor = 0;
  let taxMinor = 0;

  const calculatedLines = lines.map((line) => {
    if (!line.description.trim()) throw new Error("Every item needs a name.");
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) throw new Error("Quantity must be greater than zero.");
    if (!Number.isSafeInteger(line.unitPriceMinor) || line.unitPriceMinor < 0) throw new Error("Enter a valid price.");
    if (!Number.isSafeInteger(line.taxRateBps) || line.taxRateBps < 0 || line.taxRateBps > 10000) {
      throw new Error("Enter a valid tax rate.");
    }

    const taxableMinor = Math.round(line.quantity * line.unitPriceMinor);
    const lineTaxMinor = Math.round((taxableMinor * line.taxRateBps) / 10000);
    const lineTotalMinor = taxableMinor + lineTaxMinor;

    subtotalMinor += taxableMinor;
    taxMinor += lineTaxMinor;

    return {
      description: line.description.trim(),
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      taxRateBps: line.taxRateBps,
      taxableMinor,
      taxMinor: lineTaxMinor,
      totalMinor: lineTotalMinor
    };
  });

  return {
    subtotalMinor,
    taxMinor,
    totalMinor: subtotalMinor + taxMinor,
    lines: calculatedLines
  };
}

export async function createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
  const customerName = input.customerName.trim();
  if (!customerName) throw new Error("Enter a customer name.");

  const totals = calculateInvoiceTotals(input.lines);
  const now = new Date();
  const dateISO = now.toISOString();
  const prefix =
    "AI-" +
    String(now.getFullYear()).slice(-2) +
    String(now.getMonth() + 1).padStart(2, "0") +
    "-";

  return db.transaction("rw", db.invoices, async () => {
    const count = await db.invoices.where("invoiceNo").startsWith(prefix).count();
    const invoiceNo = prefix + String(count + 1).padStart(4, "0");
    const paidMinor = input.paidInFull ? totals.totalMinor : 0;
    const paymentStatus: PaymentStatus = paidMinor >= totals.totalMinor ? "paid" : "due";

    const invoice: Invoice = {
      invoiceNo,
      createdAt: Date.now(),
      dateISO,
      customerName,
      lines: totals.lines,
      subtotalMinor: totals.subtotalMinor,
      taxMinor: totals.taxMinor,
      totalMinor: totals.totalMinor,
      paidMinor,
      paymentStatus,
      status: "issued"
    };

    const id = await db.invoices.add(invoice);
    return { ...invoice, id };
  });
}

export function parseMoneyToMinor(value: string): number {
  const normalized = value.trim();
  if (!/^(?:\d+)(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Enter an amount with up to two decimal places.");
  }
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Enter a valid amount.");
  const minor = Math.round(amount * 100);
  if (!Number.isSafeInteger(minor)) throw new Error("Amount is too large.");
  return minor;
}
