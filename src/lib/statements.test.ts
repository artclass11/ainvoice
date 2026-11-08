import { describe, expect, it } from "vitest";
import { createCustomerStatementCsv, createSupplierStatementCsv } from "./statements";
import type { Customer, Invoice, Payment, Purchase, Supplier, SupplierPayment } from "./db";

const customer: Customer = {
  id: 1, name: "Retail customer", phone: "", email: "", address: "", taxId: "",
  creditLimitMinor: 100000, openingBalanceMinor: 2500, active: true,
  createdAt: new Date("2026-01-01T08:00:00Z").getTime(), updatedAt: 1
};
const supplier: Supplier = {
  id: 7, name: "Wholesale supplier", phone: "", email: "", address: "", taxId: "",
  active: true, createdAt: 1, updatedAt: 1
};

describe("Pro account statements", () => {
  it("exports customer opening balance, invoices and allocated receipts with a running balance", () => {
    const invoices: Invoice[] = [
      {
        id: 10, invoiceNo: "AI-2601-00010", createdAt: new Date("2026-01-02T08:00:00Z").getTime(),
        dateISO: "2026-01-02", customerId: 1, customerName: customer.name,
        lines: [], subtotalMinor: 10000, discountMinor: 0, taxMinor: 0, totalMinor: 10000,
        paidMinor: 3000, paymentStatus: "partial", status: "issued", currencyCode: "INR",
        schemaVersion: 2
      },
      {
        id: 11, invoiceNo: "AI-2601-00011", createdAt: new Date("2026-01-03T08:00:00Z").getTime(),
        dateISO: "2026-01-03", customerId: 2, customerName: "Other customer",
        lines: [], subtotalMinor: 50000, discountMinor: 0, taxMinor: 0, totalMinor: 50000,
        paidMinor: 0, paymentStatus: "due", status: "issued", currencyCode: "INR",
        schemaVersion: 2
      }
    ];
    const payments: Payment[] = [
      {
        id: 1, invoiceId: 10, invoiceNo: "AI-2601-00010", customerId: 1, customerName: customer.name,
        amountMinor: 1000, method: "cash", reference: "R-1", note: "", paidAt: new Date("2026-01-02T09:00:00Z").getTime()
      },
      {
        id: 2, invoiceId: 10, invoiceNo: "AI-2601-00010", customerId: 1, customerName: customer.name,
        amountMinor: 2000, method: "upi", reference: "R-2", note: "", paidAt: new Date("2026-01-04T09:00:00Z").getTime()
      }
    ];
    const csv = createCustomerStatementCsv(customer, invoices, payments, "INR");
    expect(csv).toContain('"opening"');
    expect(csv).toContain('"AI-2601-00010"');
    expect(csv).not.toContain('"AI-2601-00011"');
    expect(csv).toContain('"closing"');
    expect(csv).toContain('"95.00"');
  });

  it("exports supplier purchases and payments and reconciles to the remaining payable", () => {
    const purchases: Purchase[] = [{
      id: 20, purchaseNo: "PUR-2601-00020", createdAt: new Date("2026-01-02T08:00:00Z").getTime(),
      dateISO: "2026-01-02", supplierId: 7, supplierName: supplier.name,
      lines: [], subtotalMinor: 20000, discountMinor: 0, taxMinor: 0, totalMinor: 20000,
      paidMinor: 8000, paymentStatus: "partial", status: "received", currencyCode: "INR",
      schemaVersion: 1
    }];
    const payments: SupplierPayment[] = [
      {
        id: 1, purchaseId: 20, purchaseNo: "PUR-2601-00020", supplierId: 7, supplierName: supplier.name,
        amountMinor: 3000, method: "bank", reference: "BANK-1", note: "", paidAt: new Date("2026-01-03T09:00:00Z").getTime()
      },
      {
        id: 2, purchaseId: 20, purchaseNo: "PUR-2601-00020", supplierId: 7, supplierName: supplier.name,
        amountMinor: 5000, method: "upi", reference: "UPI-2", note: "", paidAt: new Date("2026-01-04T09:00:00Z").getTime()
      }
    ];
    const csv = createSupplierStatementCsv(supplier, purchases, payments, "INR");
    expect(csv).toContain('"PUR-2601-00020"');
    expect(csv).toContain('"payment"');
    expect(csv).toContain('"120.00"');
  });

  it("refuses to export a statement when payment history does not match the invoice", () => {
    const invoice: Invoice = {
      id: 30, invoiceNo: "AI-2601-00030", createdAt: 1, dateISO: "2026-01-01",
      customerId: 1, customerName: customer.name, lines: [],
      subtotalMinor: 1000, discountMinor: 0, taxMinor: 0, totalMinor: 1000,
      paidMinor: 500, paymentStatus: "partial", status: "issued", currencyCode: "INR",
      schemaVersion: 2
    };
    expect(() => createCustomerStatementCsv(customer, [invoice], [], "INR"))
      .toThrow(/Payment history does not reconcile/);
  });

  it("neutralizes formula-leading account names in spreadsheet exports", () => {
    const unsafe = { ...customer, name: "=HYPERLINK(\"https://unsafe.example\")" };
    const csv = createCustomerStatementCsv(unsafe, [], [], "INR");
    expect(csv).toContain(""'=HYPERLINK");
  });
});
