import { db as defaultDb, type AInvoiceDatabase } from "./db";

/**
 * Everything the app shell renders, read in one consistent pass. Keeping the
 * queries here (rather than inline in the React component) lets tests run them
 * against fresh and upgraded databases, because Dexie's `orderBy` rejects when
 * the sorted property is not an index in the current schema.
 */
export async function loadWorkspace(database: AInvoiceDatabase = defaultDb) {
  const [invoices, products, customers, payments, suppliers, purchases, supplierPayments, stockMovements, events, settings] =
    await Promise.all([
      database.invoices.orderBy("createdAt").reverse().toArray(),
      database.products.orderBy("name").toArray(),
      database.customers.orderBy("name").toArray(),
      database.payments.orderBy("paidAt").reverse().toArray(),
      database.suppliers.orderBy("name").toArray(),
      database.purchases.orderBy("createdAt").reverse().toArray(),
      database.supplierPayments.orderBy("paidAt").reverse().toArray(),
      database.stockMovements.orderBy("createdAt").reverse().toArray(),
      database.auditEvents.orderBy("createdAt").reverse().limit(20).toArray(),
      database.settings.get("main")
    ]);
  return { invoices, products, customers, payments, suppliers, purchases, supplierPayments, stockMovements, events, settings };
}
