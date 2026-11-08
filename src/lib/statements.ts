import type {
  Customer,
  Invoice,
  Payment,
  Purchase,
  Supplier,
  SupplierPayment
} from "./db";

type StatementRow = {
  timestamp: number;
  date: string;
  kind: string;
  reference: string;
  description: string;
  debitMinor: number;
  creditMinor: number;
  priority: number;
};

function requireMinor(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(label + " is invalid. Reconcile the account before exporting a statement.");
  }
}

function localDate(timestamp: number): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("A statement contains an invalid transaction date.");
  }
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function cell(value: string | number): string {
  const stringValue = String(value);
  const safe = /^[\s]*[=+@-]/.test(stringValue) ? "'" + stringValue : stringValue;
  return '"' + safe.replace(/"/g, '""') + '"';
}

function decimal(minor: number): string {
  requireMinor(minor, "Statement amount");
  return (Math.floor(minor / 100)).toString() + "." + String(minor % 100).padStart(2, "0");
}

function buildCsv(
  accountType: "customer" | "supplier",
  accountName: string,
  currencyCode: string,
  rows: StatementRow[]
): string {
  const ordered = [...rows].sort((left, right) =>
    left.timestamp - right.timestamp || left.priority - right.priority ||
    left.reference.localeCompare(right.reference)
  );
  const data: Array<Array<string | number>> = [[
    "account_type", "account_name", "date", "entry_type", "reference",
    "description", "currency", "debit", "credit", "running_balance"
  ]];
  let balance = 0;
  let totalDebit = 0;
  let totalCredit = 0;

  for (const row of ordered) {
    requireMinor(row.debitMinor, "Statement debit");
    requireMinor(row.creditMinor, "Statement credit");
    if (row.debitMinor > 0 && row.creditMinor > 0) {
      throw new Error("A statement entry cannot be both a debit and a credit.");
    }
    balance += row.debitMinor - row.creditMinor;
    totalDebit += row.debitMinor;
    totalCredit += row.creditMinor;
    requireMinor(balance, "Running account balance");
    requireMinor(totalDebit, "Statement debit total");
    requireMinor(totalCredit, "Statement credit total");
    data.push([
      accountType,
      accountName,
      row.date,
      row.kind,
      row.reference,
      row.description,
      currencyCode,
      decimal(row.debitMinor),
      decimal(row.creditMinor),
      decimal(balance)
    ]);
  }

  data.push([
    accountType,
    accountName,
    "",
    "closing",
    "",
    "Closing balance",
    currencyCode,
    decimal(totalDebit),
    decimal(totalCredit),
    decimal(balance)
  ]);
  return data.map(row => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function createCustomerStatementCsv(
  customer: Customer,
  invoices: readonly Invoice[],
  payments: readonly Payment[],
  currencyCode = "INR"
): string {
  requireMinor(customer.openingBalanceMinor, "Customer opening balance");
  const relatedInvoices = invoices.filter(invoice => invoice.customerId === customer.id);
  const invoiceIds = new Set(relatedInvoices.map(invoice => invoice.id));
  const relatedPayments = payments.filter(payment => invoiceIds.has(payment.invoiceId));
  const paymentsByInvoice = new Map<number, Payment[]>();
  for (const payment of relatedPayments) {
    const group = paymentsByInvoice.get(payment.invoiceId) ?? [];
    group.push(payment);
    paymentsByInvoice.set(payment.invoiceId, group);
  }

  const rows: StatementRow[] = [{
    timestamp: Number.isFinite(customer.createdAt) ? customer.createdAt : 0,
    date: "Opening",
    kind: "opening",
    reference: "",
    description: "Opening balance",
    debitMinor: customer.openingBalanceMinor,
    creditMinor: 0,
    priority: -1
  }];

  for (const invoice of relatedInvoices) {
    const invoicePayments = paymentsByInvoice.get(invoice.id ?? -1) ?? [];
    const paidTotal = invoicePayments.reduce((sum, payment) => {
      requireMinor(payment.amountMinor, "Customer payment");
      const next = sum + payment.amountMinor;
      requireMinor(next, "Customer payment total");
      return next;
    }, 0);
    requireMinor(invoice.paidMinor, "Invoice paid amount");
    if (paidTotal !== invoice.paidMinor) {
      throw new Error("Payment history does not reconcile for invoice " + invoice.invoiceNo + ".");
    }
    if (invoice.status !== "issued") continue;
    requireMinor(invoice.totalMinor, "Invoice total");
    rows.push({
      timestamp: invoice.createdAt,
      date: invoice.dateISO,
      kind: "invoice",
      reference: invoice.invoiceNo,
      description: "Sales invoice",
      debitMinor: invoice.totalMinor,
      creditMinor: 0,
      priority: 0
    });
    for (const payment of invoicePayments) {
      rows.push({
        timestamp: payment.paidAt,
        date: localDate(payment.paidAt),
        kind: "receipt",
        reference: payment.reference || payment.invoiceNo,
        description: "Payment received (" + payment.method + ")",
        debitMinor: 0,
        creditMinor: payment.amountMinor,
        priority: 1
      });
    }
  }
  return buildCsv("customer", customer.name, currencyCode, rows);
}

export function createSupplierStatementCsv(
  supplier: Supplier,
  purchases: readonly Purchase[],
  payments: readonly SupplierPayment[],
  currencyCode = "INR"
): string {
  const relatedPurchases = purchases.filter(purchase => purchase.supplierId === supplier.id);
  const purchaseIds = new Set(relatedPurchases.map(purchase => purchase.id));
  const relatedPayments = payments.filter(payment => purchaseIds.has(payment.purchaseId));
  const paymentsByPurchase = new Map<number, SupplierPayment[]>();
  for (const payment of relatedPayments) {
    const group = paymentsByPurchase.get(payment.purchaseId) ?? [];
    group.push(payment);
    paymentsByPurchase.set(payment.purchaseId, group);
  }

  const rows: StatementRow[] = [];
  for (const purchase of relatedPurchases) {
    const purchasePayments = paymentsByPurchase.get(purchase.id ?? -1) ?? [];
    const paidTotal = purchasePayments.reduce((sum, payment) => {
      requireMinor(payment.amountMinor, "Supplier payment");
      const next = sum + payment.amountMinor;
      requireMinor(next, "Supplier payment total");
      return next;
    }, 0);
    requireMinor(purchase.paidMinor, "Purchase paid amount");
    if (paidTotal !== purchase.paidMinor) {
      throw new Error("Payment history does not reconcile for purchase " + purchase.purchaseNo + ".");
    }
    if (purchase.status !== "received") continue;
    requireMinor(purchase.totalMinor, "Purchase total");
    rows.push({
      timestamp: purchase.createdAt,
      date: purchase.dateISO,
      kind: "purchase",
      reference: purchase.purchaseNo,
      description: "Supplier purchase",
      debitMinor: purchase.totalMinor,
      creditMinor: 0,
      priority: 0
    });
    for (const payment of purchasePayments) {
      rows.push({
        timestamp: payment.paidAt,
        date: localDate(payment.paidAt),
        kind: "payment",
        reference: payment.reference || payment.purchaseNo,
        description: "Payment to supplier (" + payment.method + ")",
        debitMinor: 0,
        creditMinor: payment.amountMinor,
        priority: 1
      });
    }
  }
  return buildCsv("supplier", supplier.name, currencyCode, rows);
}
