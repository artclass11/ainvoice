# AInvoice roadmap

Roadmap items are targets, not claims that every feature is already released.

## Major release target — AInvoice 2.0.0

The 2.0.0 target is a production-readiness milestone, not the current app version. The repository remains on 0.1.1 Early Access until the acceptance criteria in [RELEASE_2.0.md](./RELEASE_2.0.md) are complete. The main blockers are independent review and cross-platform validation of live storage encryption, migration/recovery, accounting/tax correctness, signed device releases and operational security.

## Foundation — implemented in the current source milestone

- [x] Public Apache-2.0 repository and contributor policy.
- [x] React/TypeScript interface and black minimal visual system.
- [x] English, Hindi and Marathi interface dictionaries for principal workflows.
- [x] Local PIN entry gate, separate from database encryption.
- [x] Dexie/IndexedDB schema with invoices, products, customers, payments, stock movements and audit events.
- [x] Multi-item invoice creation, discount, tax snapshot, payment capture and partial-payment status.
- [x] Tracked stock decrement and low-stock warnings.
- [x] Customer/product maintenance, payment book, reports and invoice print view.
- [x] Supplier book, purchase records, transactional stock receipts, supplier payments, supplier balances and restricted purchase voids.
- [x] AES-256-GCM password-encrypted backup export/restore.
- [x] Tauri v2 native app project and platform release workflows.

## Stage 0 — security foundation (release blocker)

- [x] Record encrypted-storage architecture and migration requirements in [ADR 0001](./adr/0001-encrypted-local-storage.md).
- [x] Draft PR #9: implement an authenticated XSalsa20-Poly1305 record-encryption prototype for live Dexie/IndexedDB storage shared by PWA and Tauri WebViews.
- [x] Draft PR #9: remove PII/text indexes, add a separate 256-bit recovery-key gate, wrong-key/tamper/plaintext-leakage/nonce tests, and legacy v5 writer fencing with verified migration.
- [ ] Obtain independent cryptographic review of DBCore middleware and key lifecycle.
- [ ] Verify raw IndexedDB/WebView profile contents and old database remnants on real browser/platform builds.
- [ ] Complete migration tests for interruption, disk-full, multiple tabs, crash/restart and rollback.
- [ ] Design an approved recovery, key-rotation and OS secure-key-store integration path; prototype currently requires user-held key entry at every app start.
- [ ] Merge and ship an approved encryption release. Main/default branch and existing preview installers remain plaintext until this is done.

## Stage 1 — reliable shop billing

- [ ] Run encrypted-persistence, migration and upgrade tests on Windows, macOS, Linux, Android and iOS devices.
- [ ] Add barcode scanner and thermal printer workflows.
- [ ] Add invoice sequence and print-template settings, receipts and customer statements.
- [ ] Add CSV imports with preview, validation and duplicate resolution.
- [ ] Test backup/restore with large data sets and migration from every released schema.
- [x] Add the first supplier/purchase ledger, stock receipts and purchase-linked supplier payments.
- [ ] Add supplier opening balances, purchase returns/refunds, debit notes and settlement across multiple purchase documents.
- [ ] Add sales returns, refunds and credit notes.

## Stage 2 — accounting and tax depth

- [ ] Versioned tax engine by jurisdiction, effective date and place of supply.
- [ ] India GST workflow after official rule verification and qualified review.
- [ ] Tax reports, invoice export formats and reconciliation controls.
- [ ] Receivables/payables ledger and cash/bank reconciliation.
- [ ] Accounting period close, audit exports and immutable issued document revisions.

## Stage 3 — retailer/wholesaler operations

- [ ] Multiple warehouses, stock transfers and batch/serial/expiry tracking.
- [ ] Purchase pricing, sales price lists and customer-specific pricing.
- [ ] Staff users, permissions, approval limits and shift/cashier close.
- [ ] Bulk product and customer tools.

## Stage 4 — dealer/enterprise deployments

- [ ] Multi-branch and multi-tenant model.
- [ ] Encrypted synchronization with idempotent writes and conflict resolution.
- [ ] Server-side authorization and branch-scoped roles.
- [ ] Consolidated reporting, API integrations and controlled data exports.
- [ ] Recovery, retention, deletion and disaster-recovery procedures.

## Release gates

- No production release until sensitive local data storage is independently reviewed, encrypted, migrated safely, and tested on supported devices; backup/restore and billing invariants must also pass.
- iOS and Android packages must be signed with the correct platform credentials before distribution.
- Tax or statutory features require current official-source verification and qualified review.
