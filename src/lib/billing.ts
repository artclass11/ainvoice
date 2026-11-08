import {
  addAuditEvent,
  db,
  type Customer,
  type Invoice,
  type InvoiceLine,
  type Payment,
  type PaymentMethod,
  type PaymentStatus,
  type Product,
  type Purchase,
  type PurchaseLine,
  type Supplier,
  type SupplierPayment
} from "./db";

export interface DraftLineInput {
  productId?: number;
  sku?: string;
  description: string;
  unit?: string;
  quantity: number;
  unitPriceMinor: number;
  discountMinor?: number;
  taxRateBps: number;
}

export interface CreateInvoiceInput {
  customerId?: number;
  customerName: string;
  lines: DraftLineInput[];
  paidMinor?: number;
  paymentMethod?: PaymentMethod;
  paymentReference?: string;
  notes?: string;
}

export interface CreatePurchaseInput {
  supplierId?: number;
  supplierName: string;
  lines: DraftLineInput[];
  paidMinor?: number;
  paymentMethod?: PaymentMethod;
  paymentReference?: string;
  notes?: string;
}

export interface InvoiceTotals {
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  lines: InvoiceLine[];
}

const PAYMENT_METHODS: readonly PaymentMethod[] = ["cash", "upi", "bank", "card", "other"];

function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && PAYMENT_METHODS.includes(value as PaymentMethod);
}

function assertSafeNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(label + " must be a non-negative safe integer.");
  }
}

function divideRounded(numerator: bigint, denominator: bigint): number {
  const result = (numerator + denominator / 2n) / denominator;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("This bill is too large to calculate safely.");
  }
  return Number(result);
}

/**
 * Inventory is stored in thousandths of a unit. All bill quantities use the
 * same precision so displayed, billed and deducted quantities cannot diverge.
 */
export function quantityToMilli(quantity: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) {
    throw new Error("Quantity must be greater than zero and no more than 1,000,000.");
  }
  const quantityMilli = Math.round(quantity * 1000);
  if (
    !Number.isSafeInteger(quantityMilli) ||
    Math.abs(quantity - quantityMilli / 1000) > 1e-9
  ) {
    throw new Error("Quantity can have up to 3 decimal places.");
  }
  return quantityMilli;
}

export function calculateInvoiceTotals(lines: DraftLineInput[]): InvoiceTotals {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error("Add at least one item.");
  }

  let subtotalMinor = 0;
  let discountMinor = 0;
  let taxMinor = 0;

  const calculatedLines = lines.map((line) => {
    if (!line || typeof line.description !== "string" || !line.description.trim()) {
      throw new Error("Every item needs a name.");
    }
    const description = line.description.trim();
    if (description.length > 200) throw new Error("Item description must be 200 characters or fewer.");
    if (line.sku !== undefined && (typeof line.sku !== "string" || line.sku.trim().length > 64)) {
      throw new Error("Item code must be 64 characters or fewer.");
    }
    if (line.unit !== undefined && (typeof line.unit !== "string" || line.unit.trim().length > 24)) {
      throw new Error("Unit must be 24 characters or fewer.");
    }
    const quantityMilli = quantityToMilli(line.quantity);
    if (line.productId !== undefined && (!Number.isSafeInteger(line.productId) || line.productId <= 0)) {
      throw new Error("Invalid item reference.");
    }
    if (!Number.isSafeInteger(line.unitPriceMinor) || line.unitPriceMinor < 0) {
      throw new Error("Enter a valid price.");
    }
    if (!Number.isSafeInteger(line.taxRateBps) || line.taxRateBps < 0 || line.taxRateBps > 10000) {
      throw new Error("Enter a valid tax rate.");
    }

    const gross = divideRounded(
      BigInt(quantityMilli) * BigInt(line.unitPriceMinor),
      1000n
    );
    const discount = line.discountMinor ?? 0;
    if (!Number.isSafeInteger(discount) || discount < 0 || discount > gross) {
      throw new Error("Discount cannot exceed the item amount.");
    }

    const taxable = gross - discount;
    const lineTax = divideRounded(
      BigInt(taxable) * BigInt(line.taxRateBps),
      10000n
    );
    const total = taxable + lineTax;

    subtotalMinor += gross;
    discountMinor += discount;
    taxMinor += lineTax;
    assertSafeNonNegativeInteger(subtotalMinor, "Subtotal");
    assertSafeNonNegativeInteger(discountMinor, "Discount");
    assertSafeNonNegativeInteger(taxMinor, "Tax");

    return {
      productId: line.productId,
      sku: line.sku?.trim() || undefined,
      description,
      unit: line.unit?.trim() || "pcs",
      quantity: quantityMilli / 1000,
      unitPriceMinor: line.unitPriceMinor,
      discountMinor: discount,
      taxRateBps: line.taxRateBps,
      taxableMinor: taxable,
      taxMinor: lineTax,
      totalMinor: total
    };
  });

  const totalMinor = subtotalMinor - discountMinor + taxMinor;
  assertSafeNonNegativeInteger(totalMinor, "Total");

  return {
    subtotalMinor,
    discountMinor,
    taxMinor,
    totalMinor,
    lines: calculatedLines
  };
}

export function getPaymentStatus(paidMinor: number, totalMinor: number): PaymentStatus {
  assertSafeNonNegativeInteger(paidMinor, "Payment");
  assertSafeNonNegativeInteger(totalMinor, "Bill total");
  if (paidMinor > totalMinor) {
    throw new Error("Payments cannot exceed the bill total.");
  }
  if (paidMinor === totalMinor) return "paid";
  if (paidMinor === 0) return "due";
  return "partial";
}

function sumPayments(payments: Payment[]): number {
  let total = 0;
  for (const payment of payments) {
    assertSafeNonNegativeInteger(payment.amountMinor, "Payment");
    if (payment.amountMinor === 0) {
      throw new Error("Payment history contains a zero-value entry.");
    }
    total += payment.amountMinor;
    assertSafeNonNegativeInteger(total, "Payment history total");
  }
  return total;
}

function assertInvoicePaymentIntegrity(invoice: Invoice, payments: Payment[]): void {
  assertSafeNonNegativeInteger(invoice.totalMinor, "Bill total");
  assertSafeNonNegativeInteger(invoice.paidMinor, "Paid amount");
  if (invoice.paidMinor > invoice.totalMinor) {
    throw new Error("Bill payment data is inconsistent. Restore a verified backup or contact support.");
  }
  const ledgerPaid = sumPayments(payments);
  if (ledgerPaid !== invoice.paidMinor) {
    throw new Error("Payment history does not match this bill. Further changes have been blocked to protect your records.");
  }
  if (invoice.paymentStatus !== getPaymentStatus(invoice.paidMinor, invoice.totalMinor)) {
    throw new Error("Bill payment status is inconsistent. Further changes have been blocked to protect your records.");
  }
}

export async function createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
  if (input.customerId !== undefined && (!Number.isSafeInteger(input.customerId) || input.customerId <= 0)) {
    throw new Error("Select a valid customer.");
  }
  if (input.notes !== undefined && (typeof input.notes !== "string" || input.notes.length > 2000)) {
    throw new Error("Notes must be 2,000 characters or fewer.");
  }
  if (input.paymentReference !== undefined &&
      (typeof input.paymentReference !== "string" || input.paymentReference.length > 160)) {
    throw new Error("Payment reference must be 160 characters or fewer.");
  }

  const totals = calculateInvoiceTotals(input.lines);
  const paidMinor = input.paidMinor ?? 0;
  assertSafeNonNegativeInteger(paidMinor, "Payment");
  if (paidMinor > totals.totalMinor) {
    throw new Error("Payment must be between zero and the bill total.");
  }
  const paymentMethod = input.paymentMethod ?? "cash";
  if (!isPaymentMethod(paymentMethod)) {
    throw new Error("Choose a valid payment method.");
  }

  const now = new Date();
  const dateISO = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");

  return db.transaction(
    "rw",
    [db.settings, db.invoices, db.customers, db.products, db.payments, db.stockMovements, db.auditEvents],
    async () => {
      const settings = await db.settings.get("main");
      if (!settings) {
        throw new Error("Set up the business profile before creating a bill.");
      }

      const prefix = settings.invoicePrefix.trim().toUpperCase();
      if (!/^[A-Z0-9][A-Z0-9-]{0,9}$/.test(prefix)) {
        throw new Error("Invoice prefix must be 1–10 letters, numbers or hyphens.");
      }
      const currentSequence = settings.invoiceSequence;
      if (!Number.isSafeInteger(currentSequence) || currentSequence < 0 || currentSequence >= Number.MAX_SAFE_INTEGER) {
        throw new Error("Invoice number sequence is invalid. Contact support before issuing another bill.");
      }
      const sequence = currentSequence + 1;
      const invoiceNo =
        prefix +
        "-" +
        String(now.getFullYear()).slice(-2) +
        String(now.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(sequence).padStart(5, "0");

      let customer: Customer | undefined;
      if (input.customerId !== undefined) {
        customer = await db.customers.get(input.customerId);
        if (!customer || !customer.active) {
          throw new Error("The selected customer no longer exists or is inactive. Refresh the customer list.");
        }
      }
      const customerName = customer?.name ?? input.customerName.trim();
      if (!customerName) {
        throw new Error("Enter a customer name.");
      }
      if (customerName.length > 160) {
        throw new Error("Customer name must be 160 characters or fewer.");
      }

      // A positive credit limit is active. A zero limit keeps this optional
      // control disabled. Opening receivables and all issued invoice balances
      // are included in the same transaction as the new invoice.
      if (customer) {
        assertSafeNonNegativeInteger(customer.creditLimitMinor, "Customer credit limit");
        assertSafeNonNegativeInteger(customer.openingBalanceMinor, "Customer opening balance");
        if (customer.creditLimitMinor > 0) {
          const existingInvoices = await db.invoices.where("customerId").equals(customer.id!).toArray();
          let currentOutstandingMinor = customer.openingBalanceMinor;
          for (const existing of existingInvoices) {
            if (existing.status !== "issued") continue;
            assertSafeNonNegativeInteger(existing.totalMinor, "Existing bill total");
            assertSafeNonNegativeInteger(existing.paidMinor, "Existing paid amount");
            if (existing.paidMinor > existing.totalMinor) {
              throw new Error("An existing bill has inconsistent payment data. Reconcile it before issuing another credit bill.");
            }
            currentOutstandingMinor += existing.totalMinor - existing.paidMinor;
            assertSafeNonNegativeInteger(currentOutstandingMinor, "Customer outstanding balance");
          }
          const newOutstandingMinor = totals.totalMinor - paidMinor;
          const projectedOutstandingMinor = currentOutstandingMinor + newOutstandingMinor;
          assertSafeNonNegativeInteger(projectedOutstandingMinor, "Projected customer outstanding balance");
          if (newOutstandingMinor > 0 && projectedOutstandingMinor > customer.creditLimitMinor) {
            throw new Error("Customer credit limit exceeded. Receive a payment or increase the credit limit before issuing this bill.");
          }
        }
      }

      const lineSnapshots: InvoiceLine[] = [];
      const stockMovementIds: number[] = [];
      for (const line of totals.lines) {
        if (!line.productId) {
          lineSnapshots.push({ ...line, stockTracked: false });
          continue;
        }

        const product = await db.products.get(line.productId);
        if (!product || !product.active) {
          throw new Error("Item not found or inactive: " + line.description);
        }
        if (!product.trackStock) {
          lineSnapshots.push({ ...line, stockTracked: false });
          continue;
        }
        if (!Number.isSafeInteger(product.stockQuantityMilli) || product.stockQuantityMilli < 0) {
          throw new Error("Stock data is invalid for " + product.name + ". The bill was not issued.");
        }

        const used = quantityToMilli(line.quantity);
        if (product.stockQuantityMilli < used) {
          throw new Error(
            "Insufficient stock for " +
            product.name +
            ". Available: " +
            (product.stockQuantityMilli / 1000).toFixed(3) +
            "."
          );
        }

        await db.products.update(product.id!, {
          stockQuantityMilli: product.stockQuantityMilli - used,
          updatedAt: Date.now()
        });
        const movementId = await db.stockMovements.add({
          productId: product.id!,
          productName: product.name,
          type: "sale",
          quantityDeltaMilli: -used,
          referenceType: "invoice",
          note: invoiceNo,
          createdAt: Date.now()
        });
        stockMovementIds.push(movementId);
        lineSnapshots.push({ ...line, stockTracked: true });
      }

      const invoice: Invoice = {
        invoiceNo,
        createdAt: Date.now(),
        dateISO,
        customerId: customer?.id,
        customerName,
        lines: lineSnapshots,
        subtotalMinor: totals.subtotalMinor,
        discountMinor: totals.discountMinor,
        taxMinor: totals.taxMinor,
        totalMinor: totals.totalMinor,
        paidMinor,
        paymentStatus: getPaymentStatus(paidMinor, totals.totalMinor),
        status: "issued",
        notes: input.notes?.trim() || undefined,
        currencyCode: settings.currencyCode || "INR",
        businessNameSnapshot: settings.businessName,
        businessPhoneSnapshot: settings.phone,
        businessAddressSnapshot: settings.address,
        businessTaxIdSnapshot: settings.taxId,
        schemaVersion: 2
      };

      const invoiceId = await db.invoices.add(invoice);
      for (const movementId of stockMovementIds) {
        await db.stockMovements.update(movementId, { referenceId: invoiceId });
      }
      if (paidMinor > 0) {
        await db.payments.add({
          invoiceId,
          invoiceNo,
          customerId: customer?.id,
          customerName,
          amountMinor: paidMinor,
          method: paymentMethod,
          reference: input.paymentReference?.trim() ?? "",
          note: "Payment at billing",
          paidAt: Date.now()
        });
      }

      await db.settings.update("main", {
        invoicePrefix: prefix,
        invoiceSequence: sequence,
        updatedAt: Date.now()
      });
      await addAuditEvent({
        entityType: "invoice",
        entityId: invoiceId,
        action: "issued",
        summary: "Issued " + invoiceNo + " for " + invoice.totalMinor + " minor units"
      });

      return { ...invoice, id: invoiceId };
    }
  );
}

export async function recordPayment(input: {
  invoiceId: number;
  amountMinor: number;
  method: PaymentMethod;
  reference?: string;
  note?: string;
}): Promise<Invoice> {
  assertSafeNonNegativeInteger(input.amountMinor, "Payment");
  if (input.amountMinor <= 0) {
    throw new Error("Enter a payment greater than zero.");
  }
  if (!Number.isSafeInteger(input.invoiceId) || input.invoiceId <= 0) {
    throw new Error("Select a valid bill.");
  }
  if (!isPaymentMethod(input.method)) {
    throw new Error("Choose a valid payment method.");
  }
  if (input.reference !== undefined &&
      (typeof input.reference !== "string" || input.reference.length > 160)) {
    throw new Error("Payment reference must be 160 characters or fewer.");
  }
  if (input.note !== undefined &&
      (typeof input.note !== "string" || input.note.length > 1000)) {
    throw new Error("Payment note must be 1,000 characters or fewer.");
  }

  return db.transaction("rw", db.invoices, db.payments, db.auditEvents, async () => {
    const invoice = await db.invoices.get(input.invoiceId);
    if (!invoice) throw new Error("Bill not found.");
    if (invoice.status !== "issued") throw new Error("Voided bills cannot receive payments.");

    const existingPayments = await db.payments.where("invoiceId").equals(input.invoiceId).toArray();
    assertInvoicePaymentIntegrity(invoice, existingPayments);

    const balance = invoice.totalMinor - invoice.paidMinor;
    if (input.amountMinor > balance) {
      throw new Error("Payment cannot exceed the amount due.");
    }

    const payment: Omit<Payment, "id"> = {
      invoiceId: invoice.id!,
      invoiceNo: invoice.invoiceNo,
      customerId: invoice.customerId,
      customerName: invoice.customerName,
      amountMinor: input.amountMinor,
      method: input.method,
      reference: input.reference?.trim() ?? "",
      note: input.note?.trim() ?? "",
      paidAt: Date.now()
    };
    await db.payments.add(payment);

    const paidMinor = invoice.paidMinor + input.amountMinor;
    const updated = {
      ...invoice,
      paidMinor,
      paymentStatus: getPaymentStatus(paidMinor, invoice.totalMinor)
    };
    await db.invoices.put(updated);
    await addAuditEvent({
      entityType: "payment",
      entityId: input.invoiceId,
      action: "received",
      summary: "Received payment for " + invoice.invoiceNo
    });
    return updated;
  });
}

export async function voidInvoice(invoiceId: number, reason: string): Promise<void> {
  const note = reason.trim();
  if (note.length < 3) throw new Error("Enter a short reason for voiding this bill.");
  if (!Number.isSafeInteger(invoiceId) || invoiceId <= 0) throw new Error("Select a valid bill.");

  await db.transaction("rw", db.invoices, db.payments, db.products, db.stockMovements, db.auditEvents, async () => {
    const invoice = await db.invoices.get(invoiceId);
    if (!invoice) throw new Error("Bill not found.");
    if (invoice.status === "void") throw new Error("This bill is already void.");

    const payments = await db.payments.where("invoiceId").equals(invoiceId).toArray();
    assertInvoicePaymentIntegrity(invoice, payments);
    if (invoice.paidMinor > 0 || payments.length > 0) {
      throw new Error("Refund or reconcile received payments before voiding this bill.");
    }

    for (const line of invoice.lines) {
      if (!line.productId || line.stockTracked === false) continue;
      const product = await db.products.get(line.productId);
      if (!product) {
        throw new Error("A linked item is missing. The bill was not voided; contact support.");
      }
      // For legacy invoices without stockTracked, fall back to the current item setting.
      const shouldRestoreStock = line.stockTracked ?? product.trackStock;
      if (!shouldRestoreStock) continue;

      const quantity = quantityToMilli(line.quantity);
      const restoredStock = product.stockQuantityMilli + quantity;
      assertSafeNonNegativeInteger(restoredStock, "Restored stock");
      await db.products.update(product.id!, {
        stockQuantityMilli: restoredStock,
        updatedAt: Date.now()
      });
      await db.stockMovements.add({
        productId: product.id!,
        productName: product.name,
        type: "return",
        quantityDeltaMilli: quantity,
        referenceType: "invoice",
        referenceId: invoiceId,
        note: invoice.invoiceNo,
        createdAt: Date.now()
      });
    }

    await db.invoices.update(invoiceId, { status: "void" });
    await addAuditEvent({
      entityType: "invoice",
      entityId: invoiceId,
      action: "voided",
      summary: "Voided " + invoice.invoiceNo + ": " + note
    });
  });
}

export async function saveProduct(
  input: Omit<Product, "id" | "createdAt" | "updatedAt">,
  id?: number
): Promise<number> {
  const name = input.name.trim();
  const sku = input.sku.trim().toUpperCase();
  const unit = input.unit.trim();

  if (!name) throw new Error("Enter an item name.");
  if (name.length > 160) throw new Error("Item name must be 160 characters or fewer.");
  if (!sku || sku.length > 64) throw new Error("Enter an item code up to 64 characters.");
  if (!unit || unit.length > 24) throw new Error("Enter a valid unit.");
  if (![input.salePriceMinor, input.purchasePriceMinor].every(Number.isSafeInteger) ||
      input.salePriceMinor < 0 || input.purchasePriceMinor < 0) {
    throw new Error("Enter valid item prices.");
  }
  if (!Number.isSafeInteger(input.taxRateBps) || input.taxRateBps < 0 || input.taxRateBps > 10000) {
    throw new Error("Enter a valid tax rate.");
  }
  assertSafeNonNegativeInteger(input.stockQuantityMilli, "Stock quantity");
  assertSafeNonNegativeInteger(input.reorderLevelMilli, "Reorder level");
  if (typeof input.trackStock !== "boolean" || typeof input.active !== "boolean") {
    throw new Error("Item tracking and active status must be selected.");
  }
  if (id !== undefined && (!Number.isSafeInteger(id) || id <= 0)) {
    throw new Error("Select a valid item.");
  }

  return db.transaction("rw", db.products, db.stockMovements, db.auditEvents, async () => {
    const old = id !== undefined ? await db.products.get(id) : undefined;
    if (id !== undefined && !old) throw new Error("The item no longer exists. Refresh and try again.");

    const duplicate = await db.products.where("sku").equals(sku).first();
    if (duplicate && duplicate.id !== id) throw new Error("That item code is already in use.");

    const now = Date.now();
    const previousTrackedStock = old?.trackStock ? old.stockQuantityMilli : 0;
    const nextTrackedStock = input.trackStock ? input.stockQuantityMilli : 0;
    const stockDelta = nextTrackedStock - previousTrackedStock;
    const saved = await db.products.put({
      ...input,
      name,
      sku,
      unit,
      stockQuantityMilli: nextTrackedStock,
      id,
      createdAt: old?.createdAt ?? now,
      updatedAt: now
    });

    if (stockDelta !== 0) {
      await db.stockMovements.add({
        productId: saved,
        productName: name,
        type: "adjustment",
        quantityDeltaMilli: stockDelta,
        referenceType: "manual",
        note: old?.trackStock ? "Manual stock adjustment" : "Opening stock / tracking change",
        createdAt: now
      });
    }
    await addAuditEvent({
      entityType: "product",
      entityId: saved,
      action: id === undefined ? "created" : "updated",
      summary: (id === undefined ? "Created" : "Updated") + " item " + name
    });
    return saved;
  });
}


function sumSupplierPayments(payments: SupplierPayment[]): number {
  let total = 0;
  for (const payment of payments) {
    assertSafeNonNegativeInteger(payment.amountMinor, "Supplier payment");
    if (payment.amountMinor === 0) throw new Error("Supplier payment history contains a zero-value entry.");
    total += payment.amountMinor;
    assertSafeNonNegativeInteger(total, "Supplier payment history total");
  }
  return total;
}

function assertPurchasePaymentIntegrity(purchase: Purchase, payments: SupplierPayment[]): void {
  assertSafeNonNegativeInteger(purchase.totalMinor, "Purchase total");
  assertSafeNonNegativeInteger(purchase.paidMinor, "Purchase paid amount");
  if (purchase.paidMinor > purchase.totalMinor) {
    throw new Error("Purchase payment data is inconsistent. Restore a verified backup or contact support.");
  }
  if (sumSupplierPayments(payments) !== purchase.paidMinor) {
    throw new Error("Supplier payment history does not match this purchase. Further changes have been blocked.");
  }
  if (purchase.paymentStatus !== getPaymentStatus(purchase.paidMinor, purchase.totalMinor)) {
    throw new Error("Purchase payment status is inconsistent. Further changes have been blocked.");
  }
}

export async function saveSupplier(
  input: Omit<Supplier, "id" | "createdAt" | "updatedAt">,
  id?: number
): Promise<number> {
  const name = input.name.trim();
  const phone = input.phone.trim();
  const email = input.email.trim();
  const address = input.address.trim();
  const taxId = input.taxId.trim();
  if (!name) throw new Error("Enter a supplier name.");
  if (name.length > 160 || phone.length > 40 || email.length > 254 || address.length > 1000 || taxId.length > 80) {
    throw new Error("Supplier details exceed the supported length.");
  }
  if (email && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
    throw new Error("Enter a valid supplier email address.");
  }
  if (typeof input.active !== "boolean") throw new Error("Supplier active status must be selected.");
  if (id !== undefined && (!Number.isSafeInteger(id) || id <= 0)) throw new Error("Select a valid supplier.");

  return db.transaction("rw", db.suppliers, db.auditEvents, async () => {
    const old = id !== undefined ? await db.suppliers.get(id) : undefined;
    if (id !== undefined && !old) throw new Error("The supplier no longer exists. Refresh and try again.");
    const now = Date.now();
    const saved = await db.suppliers.put({
      ...input, name, phone, email, address, taxId, id,
      createdAt: old?.createdAt ?? now,
      updatedAt: now
    });
    await addAuditEvent({
      entityType: "supplier",
      entityId: saved,
      action: id === undefined ? "created" : "updated",
      summary: (id === undefined ? "Created" : "Updated") + " supplier " + name
    });
    return saved;
  });
}

export async function createPurchase(input: CreatePurchaseInput): Promise<Purchase> {
  if (input.supplierId !== undefined && (!Number.isSafeInteger(input.supplierId) || input.supplierId <= 0)) {
    throw new Error("Select a valid supplier.");
  }
  if (input.notes !== undefined && (typeof input.notes !== "string" || input.notes.length > 2000)) {
    throw new Error("Purchase notes must be 2,000 characters or fewer.");
  }
  if (input.paymentReference !== undefined &&
      (typeof input.paymentReference !== "string" || input.paymentReference.length > 160)) {
    throw new Error("Payment reference must be 160 characters or fewer.");
  }

  const totals = calculateInvoiceTotals(input.lines);
  const paidMinor = input.paidMinor ?? 0;
  assertSafeNonNegativeInteger(paidMinor, "Supplier payment");
  if (paidMinor > totals.totalMinor) throw new Error("Payment must be between zero and the purchase total.");
  const paymentMethod = input.paymentMethod ?? "cash";
  if (!isPaymentMethod(paymentMethod)) throw new Error("Choose a valid supplier payment method.");
  const now = new Date();
  const dateISO = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");

  return db.transaction(
    "rw",
    [db.settings, db.suppliers, db.purchases, db.supplierPayments, db.products, db.stockMovements, db.auditEvents],
    async () => {
      const settings = await db.settings.get("main");
      if (!settings) throw new Error("Set up the business profile before recording a purchase.");
      const prefix = (settings.purchasePrefix ?? "PUR").trim().toUpperCase();
      if (!/^[A-Z0-9][A-Z0-9-]{0,9}$/.test(prefix)) {
        throw new Error("Purchase prefix must be 1–10 letters, numbers or hyphens.");
      }
      const currentSequence = settings.purchaseSequence ?? 0;
      if (!Number.isSafeInteger(currentSequence) || currentSequence < 0 || currentSequence >= Number.MAX_SAFE_INTEGER) {
        throw new Error("Purchase number sequence is invalid. Contact support before recording another purchase.");
      }
      const sequence = currentSequence + 1;
      const purchaseNo = prefix + "-" + String(now.getFullYear()).slice(-2) +
        String(now.getMonth() + 1).padStart(2, "0") + "-" + String(sequence).padStart(5, "0");

      let supplier: Supplier | undefined;
      if (input.supplierId !== undefined) {
        supplier = await db.suppliers.get(input.supplierId);
        if (!supplier || !supplier.active) throw new Error("The selected supplier no longer exists or is inactive.");
      }
      const supplierName = supplier?.name ?? input.supplierName.trim();
      if (!supplierName) throw new Error("Enter a supplier name.");
      if (supplierName.length > 160) throw new Error("Supplier name must be 160 characters or fewer.");

      const purchaseLines: PurchaseLine[] = [];
      const stockMovementIds: number[] = [];
      for (const line of totals.lines) {
        if (!line.productId) {
          purchaseLines.push({
            productId: undefined,
            sku: line.sku,
            description: line.description,
            unit: line.unit,
            quantity: line.quantity,
            unitCostMinor: line.unitPriceMinor,
            discountMinor: line.discountMinor,
            taxRateBps: line.taxRateBps,
            taxableMinor: line.taxableMinor,
            taxMinor: line.taxMinor,
            totalMinor: line.totalMinor,
            stockReceived: false
          });
          continue;
        }

        const product = await db.products.get(line.productId);
        if (!product || !product.active) throw new Error("Item not found or inactive: " + line.description);
        const quantityMilli = quantityToMilli(line.quantity);
        const stockReceived = product.trackStock;
        if (stockReceived) {
          assertSafeNonNegativeInteger(product.stockQuantityMilli, "Current product stock");
          const nextStock = product.stockQuantityMilli + quantityMilli;
          assertSafeNonNegativeInteger(nextStock, "Received stock");
          await db.products.update(product.id!, {
            stockQuantityMilli: nextStock,
            purchasePriceMinor: line.unitPriceMinor,
            updatedAt: Date.now()
          });
          const movementId = await db.stockMovements.add({
            productId: product.id!,
            productName: product.name,
            type: "purchase",
            quantityDeltaMilli: quantityMilli,
            referenceType: "purchase",
            note: purchaseNo,
            createdAt: Date.now()
          });
          stockMovementIds.push(movementId);
        } else {
          await db.products.update(product.id!, {
            purchasePriceMinor: line.unitPriceMinor,
            updatedAt: Date.now()
          });
        }
        const snapshot: PurchaseLine = {
          productId: line.productId,
          sku: line.sku,
          description: line.description,
          unit: line.unit,
          quantity: line.quantity,
          unitCostMinor: line.unitPriceMinor,
          discountMinor: line.discountMinor,
          taxRateBps: line.taxRateBps,
          taxableMinor: line.taxableMinor,
          taxMinor: line.taxMinor,
          totalMinor: line.totalMinor,
          stockReceived
        };
        purchaseLines.push(snapshot);
      }

      const purchase: Purchase = {
        purchaseNo,
        createdAt: Date.now(),
        dateISO,
        supplierId: supplier?.id,
        supplierName,
        lines: purchaseLines,
        subtotalMinor: totals.subtotalMinor,
        discountMinor: totals.discountMinor,
        taxMinor: totals.taxMinor,
        totalMinor: totals.totalMinor,
        paidMinor,
        paymentStatus: getPaymentStatus(paidMinor, totals.totalMinor),
        status: "received",
        notes: input.notes?.trim() || "",
        currencyCode: settings.currencyCode,
        businessNameSnapshot: settings.businessName,
        businessPhoneSnapshot: settings.phone,
        businessAddressSnapshot: settings.address,
        businessTaxIdSnapshot: settings.taxId,
        schemaVersion: 1
      };
      const purchaseId = await db.purchases.add(purchase);
      for (const movementId of stockMovementIds) {
        await db.stockMovements.update(movementId, { referenceId: purchaseId });
      }
      if (paidMinor > 0) {
        await db.supplierPayments.add({
          purchaseId,
          purchaseNo,
          supplierId: supplier?.id,
          supplierName,
          amountMinor: paidMinor,
          method: paymentMethod,
          reference: input.paymentReference?.trim() ?? "",
          note: "Initial payment for " + purchaseNo,
          paidAt: Date.now()
        });
      }
      await db.settings.update("main", { purchaseSequence: sequence });
      await addAuditEvent({
        entityType: "purchase",
        entityId: purchaseId,
        action: "received",
        summary: "Received purchase " + purchaseNo + " from " + supplierName
      });
      return { ...purchase, id: purchaseId };
    }
  );
}

export async function recordSupplierPayment(input: {
  purchaseId: number;
  amountMinor: number;
  method: PaymentMethod;
  reference?: string;
  note?: string;
}): Promise<Purchase> {
  if (!Number.isSafeInteger(input.purchaseId) || input.purchaseId <= 0) throw new Error("Select a valid purchase.");
  assertSafeNonNegativeInteger(input.amountMinor, "Supplier payment");
  if (input.amountMinor === 0) throw new Error("Enter a supplier payment greater than zero.");
  if (!isPaymentMethod(input.method)) throw new Error("Choose a valid supplier payment method.");
  if (input.reference !== undefined && input.reference.length > 160) throw new Error("Payment reference is too long.");
  if (input.note !== undefined && input.note.length > 1000) throw new Error("Payment note is too long.");

  return db.transaction("rw", db.purchases, db.supplierPayments, db.auditEvents, async () => {
    const purchase = await db.purchases.get(input.purchaseId);
    if (!purchase || purchase.status !== "received") throw new Error("The purchase is missing or no longer payable.");
    const payments = await db.supplierPayments.where("purchaseId").equals(input.purchaseId).toArray();
    assertPurchasePaymentIntegrity(purchase, payments);
    const due = purchase.totalMinor - purchase.paidMinor;
    if (input.amountMinor > due) throw new Error("Supplier payment cannot exceed the purchase balance.");
    const paidMinor = purchase.paidMinor + input.amountMinor;
    const paymentStatus = getPaymentStatus(paidMinor, purchase.totalMinor);
    const updated: Purchase = { ...purchase, paidMinor, paymentStatus };
    await db.purchases.put(updated);
    await db.supplierPayments.add({
      purchaseId: input.purchaseId,
      purchaseNo: purchase.purchaseNo,
      supplierId: purchase.supplierId,
      supplierName: purchase.supplierName,
      amountMinor: input.amountMinor,
      method: input.method,
      reference: input.reference?.trim() ?? "",
      note: input.note?.trim() ?? "",
      paidAt: Date.now()
    });
    await addAuditEvent({
      entityType: "supplierPayment",
      entityId: input.purchaseId,
      action: "recorded",
      summary: "Recorded supplier payment " + input.amountMinor + " for " + purchase.purchaseNo
    });
    return updated;
  });
}

export async function voidPurchase(purchaseId: number, reason: string): Promise<void> {
  const note = reason.trim();
  if (note.length < 3 || note.length > 500) throw new Error("Enter a reason up to 500 characters.");
  if (!Number.isSafeInteger(purchaseId) || purchaseId <= 0) throw new Error("Select a valid purchase.");

  await db.transaction("rw", db.purchases, db.supplierPayments, db.products, db.stockMovements, db.auditEvents, async () => {
    const purchase = await db.purchases.get(purchaseId);
    if (!purchase || purchase.status !== "received") throw new Error("Purchase not found or already void.");
    const payments = await db.supplierPayments.where("purchaseId").equals(purchaseId).toArray();
    assertPurchasePaymentIntegrity(purchase, payments);
    if (purchase.paidMinor > 0 || payments.length > 0) {
      throw new Error("Reconcile supplier payments before voiding this purchase.");
    }

    const quantities = new Map<number, number>();
    for (const line of purchase.lines) {
      if (!line.productId || line.stockReceived === false) continue;
      const quantity = quantityToMilli(line.quantity);
      quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + quantity);
    }
    for (const [productId, quantity] of quantities) {
      const product = await db.products.get(productId);
      if (!product) throw new Error("A linked item is missing. The purchase was not voided.");
      if (product.stockQuantityMilli < quantity) {
        throw new Error("Received stock has already been used. The purchase cannot be voided; record a supplier return instead.");
      }
      await db.products.update(productId, {
        stockQuantityMilli: product.stockQuantityMilli - quantity,
        updatedAt: Date.now()
      });
      await db.stockMovements.add({
        productId,
        productName: product.name,
        type: "return",
        quantityDeltaMilli: -quantity,
        referenceType: "purchase",
        referenceId: purchaseId,
        note: purchase.purchaseNo,
        createdAt: Date.now()
      });
    }

    await db.purchases.update(purchaseId, { status: "void" });
    await addAuditEvent({
      entityType: "purchase",
      entityId: purchaseId,
      action: "voided",
      summary: "Voided purchase " + purchase.purchaseNo + ": " + note
    });
  });
}

export async function saveCustomer(
  input: Omit<Customer, "id" | "createdAt" | "updatedAt">,
  id?: number
): Promise<number> {
  const name = input.name.trim();
  const phone = input.phone.trim();
  const email = input.email.trim();
  if (!name) throw new Error("Enter a customer name.");
  if (name.length > 160 || phone.length > 40 || email.length > 254) {
    throw new Error("Customer details exceed the supported length.");
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }
  assertSafeNonNegativeInteger(input.creditLimitMinor, "Credit limit");
  assertSafeNonNegativeInteger(input.openingBalanceMinor, "Opening balance");
  if (id !== undefined && (!Number.isSafeInteger(id) || id <= 0)) {
    throw new Error("Select a valid customer.");
  }

  return db.transaction("rw", db.customers, db.auditEvents, async () => {
    const old = id !== undefined ? await db.customers.get(id) : undefined;
    if (id !== undefined && !old) throw new Error("The customer no longer exists. Refresh and try again.");
    const now = Date.now();
    const saved = await db.customers.put({
      ...input,
      name,
      phone,
      email,
      id,
      createdAt: old?.createdAt ?? now,
      updatedAt: now
    });
    await addAuditEvent({
      entityType: "customer",
      entityId: saved,
      action: id === undefined ? "created" : "updated",
      summary: (id === undefined ? "Created" : "Updated") + " customer " + name
    });
    return saved;
  });
}

export function parseMoneyToMinor(value: string): number {
  const normalized = value.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) {
    throw new Error("Enter an amount with up to two decimal places.");
  }
  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] ?? "").padEnd(2, "0"));
  const minor = whole * 100n + fraction;
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Amount is too large.");
  }
  return Number(minor);
}
