# AInvoice enterprise readiness plan

This document distinguishes what is implemented from what remains a release gate. "Enterprise-grade" is a quality target, not a claim that this early-access build is already audited or compliant.

## Implemented foundation in this milestone

- Local-first invoice, product and customer records using versioned IndexedDB schema.
- One-transaction invoice issue, stock decrement and payment record.
- Payment collection with balance checks and partial-payment statuses.
- Invoice void workflow that requires zero collected payment and restores tracked stock.
- Product SKU uniqueness checks and low-stock thresholds.
- Audit events for invoice issue, payment receipt, product/customer maintenance and settings changes.
- AES-256-GCM encrypted export/import backup with password-derived key.
- Database migration that preserves older invoices and carries forward existing paid amounts into payment history.
- Three interface locales: English, Hindi and Marathi.
- Native Tauri project foundation and desktop/mobile package workflows.

## Release blockers before using real production books

1. **Storage security:** browser/WebView IndexedDB is not automatically encrypted at rest. Replace or protect the current data layer with an independently reviewed encrypted SQLite / SQLCipher or equivalent storage architecture on native platforms. Define key creation, device unlock, recovery, key rotation, backup and data wipe.
2. **Multi-user security:** user accounts, role-based permissions, branch/tenant isolation, server-enforced authorization, staff PINs, owner recovery and tamper-evident audit exports.
3. **Accounting integrity:** credit notes, refunds, sales returns, purchase bills, supplier ledgers, payment allocations, debit/credit controls, reconciliation and immutable issued documents.
4. **Tax correctness:** jurisdiction-specific versioned tax engine, effective dates, place-of-supply rules, invoice schema and professional review. Do not claim GST, e-invoice, IRN or e-way bill compliance until the relevant rules and integrations are tested against current official sources.
5. **Data portability:** round-trip migrations, encrypted backups, scheduled reminder prompts, restore drills, CSV imports with previews and duplicate detection, and export to interoperable formats.
6. **Reliability:** crash-safe persistence, offline recovery tests, duplicate-submit protection, unique invoice identifiers across branches/devices, idempotent sync, conflict resolution and disaster-recovery exercises.
7. **Security assurance:** threat model, dependency scanning, signed builds, vulnerability response, access logs, penetration test and privacy review.
8. **Quality:** automated domain tests, browser and device tests, accessibility checks, localization review by native speakers, printer testing and load tests for large catalogues.

## Planned stages

### Stage A — shop-ready local billing
- Complete product/customer forms and searchable lists.
- Sales bills with multi-line quantities, discount, tax snapshot and payment capture.
- Stock movements, receivables, receipts and print layouts.
- Encrypted backups and tested migrations.
- PWA and native shell verification on each supported platform.

### Stage B — retailer and wholesaler operations
- Purchases, supplier ledger, returns and purchase returns.
- Stock adjustments, multiple units, barcode scanning, batch/serial and expiry workflows.
- Customer price lists, credit limits, statements and payment allocation.
- GST configuration, tax reports and jurisdiction validation.

### Stage C — dealer / enterprise operations
- Multiple users, roles and approval limits.
- Multiple branches and warehouses.
- Encrypted synchronization, server-side tenant isolation and conflict management.
- Append-only audit logs, consolidated reports and controlled exports.
- Organization identity only when the deployment needs it.

### Stage D — audited release
- External security review and penetration test.
- Independent accounting/tax validation.
- Signed installers, update signature lifecycle and release rollback.
- Backup restore drill and documented support / incident response.

## Non-negotiable financial data rules

- Money is stored in integer minor units, never binary floating point.
- Issued invoices are not silently edited or deleted.
- Corrections use traceable void, return, refund or credit-note records.
- Every payment must have a method, amount, timestamp and allocation.
- Stock changes are represented by movements, not unexplained overwrites.
- Tax rates and tax rules are snapshotted on the issued invoice.
- Local-only data is never described as cloud-backed or as automatically backed up.
