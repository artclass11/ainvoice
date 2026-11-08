# AInvoice product specification

## 1. Product promise

AInvoice helps a business owner create a correct, readable bill quickly, then understand what was sold, what was collected and what is still due. The default interface must feel like a simple billing counter, not an ERP control room.

## 2. Users and operating modes

### Small shop — Quick mode
- Owner or one cashier.
- Few hundred to a few thousand products.
- Fast item lookup, barcode-ready flow, simple payment capture and daily sales total.
- Hide purchase, warehouse, approval and accounting controls until needed.

### Growing retailer / wholesaler — Business mode
- Multiple price lists, customer credit, purchases, stock, returns, supplier balances, payment tracking and staff roles.
- Optional tax and stock modules.
- Bulk product import/export.

### Large dealer — Advanced mode
- Branches, warehouses, multi-user roles, approval limits, audit history, batch/serial tracking, inter-branch transfers, customer/supplier credit limits and consolidated reporting.
- Multi-device synchronization only after explicit enrollment and conflict-resolution design.

Users can move between modes without migrating or losing records.

## 3. First-run experience

1. Choose interface language.
2. Enter business name and currency; country/jurisdiction defaults are suggestions, not legal conclusions.
3. Choose "GST billing" or "Non-GST / simple billing". The choice can be changed later with a warning and audit trail.
4. Set an app-entry PIN (4–6 digits); explain that this is not device encryption.
5. Add the first item or select "Add items later".
6. Create the first bill.

No account, email, phone number, cloud signup or payment card is required for local-only use.

## 4. Core workflows

### Sales invoice
- Search/select customer or use walk-in customer.
- Add items by name, SKU or barcode.
- Change quantity, unit, price, discount and applicable tax.
- Show subtotal, discount, tax breakdown, round-off and payable amount before confirmation.
- Record cash, card, UPI, bank transfer, credit or split payment.
- Save a draft or issue an invoice.
- Print, save PDF or share through the operating system.
- Preserve the issued invoice snapshot even if product details change later.

### Customer and supplier book
- Name, phone/email (optional), address and business tax number (optional and jurisdiction-aware).
- Outstanding balance and transaction history.
- Credit limit and due date are optional controls. A positive credit limit includes the opening receivable and all unpaid issued invoices; zero means no limit is configured. A sale that increases exposure beyond the limit is blocked inside the invoice transaction.

### Supplier purchase
- Maintain supplier name, phone, email, address, tax ID and active status.
- Record supplier purchase documents with product/service lines, quantity, unit cost, discounts, tax snapshot, supplier identity and a unique purchase number.
- Receive tracked stock in the same transaction as the purchase record; record supplier payments against purchase balances and retain an immutable purchase snapshot.
- Only unpaid purchases can currently be voided, and only when all received stock remains available. Voiding adds a linked reversing stock movement.
- First-stage limitation: no supplier opening balances, purchase returns to suppliers, supplier refunds, debit notes or supplier settlement across multiple bills yet.

### Inventory
- Optional from setup; do not block billing when stock is not enabled.
- SKU/barcode, unit, purchase price, sale price, tax category and reorder threshold.
- Stock movements must be traceable to purchase, sale, return or adjustment events; purchase receipts and permitted purchase voids are linked to source documents.
- Prevent silent negative stock; allow a configurable warning/permission.

### Reporting
- Today / date-range sales, payment collection, receivables, top items, tax summary and stock alerts.
- Explain whether values include drafts, voids, returns and taxes.
- Export CSV/PDF. Filters must be understandable.

## 5. Multi-language

Initial locales: English (en), Hindi (hi) and Marathi (mr). User-facing copy must be translated, reviewed by native speakers and written in plain language. Preserve standard invoice terminology and legally required labels where applicable. Locale changes must not alter stored records or tax calculations.

## 6. Privacy and security

- Local-only use is the default.
- Explain local backup and restore in plain language.
- App lock may use a 4–6 digit PIN or optional pattern for convenience.
- Do not market a local PIN as encryption.
- Sensitive data encryption, recovery, role-based access and secure multi-device synchronization must receive independent design and security review before release.
- No tracking, ads or invisible data collection.

## 7. Accessibility and UI principles

- Minimal modern black / charcoal interface with restrained neutral surfaces and one clear accent.
- 44px minimum touch targets, visible focus, keyboard support and semantic labels.
- No icon-only critical actions; pair icons with text or accessible names.
- Use plain-language errors with a clear next action.
- Show one primary action per screen.
- Empty states explain how to begin.
- Use progressive disclosure: hide advanced settings until the owner asks for them.
- Never use color as the only way to communicate payment or invoice status.

## 8. India-ready considerations (not a compliance claim)

The data model should be capable of storing GSTIN, HSN/SAC, place of supply, tax components, reverse-charge indicator and configurable invoice fields. CGST/SGST/IGST selection, e-invoicing, IRN, QR codes and e-way bills must be implemented only after current official rules, thresholds, applicability and integration requirements are verified. Support non-GST and non-India businesses without forcing GST fields.

Tax rules need versioned configuration by jurisdiction and effective date. A qualified tax professional must review calculations and document formats before production claims.

## 9. Acceptance criteria for the first usable release

- A new user can create a local business profile without signing up.
- A bill can be created, saved, reopened and printed while offline.
- A browser refresh does not lose committed records.
- Monetary arithmetic uses integer minor units and has unit tests.
- The interface can switch among English, Hindi and Marathi without changing data.
- No customer data is sent to a server by the local-only build.
- Backup and restore are validated before the app is recommended for real business use.
- Clear warnings identify prototype and compliance limitations.
