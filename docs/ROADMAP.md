# AInvoice roadmap

Roadmap items are targets, not claims that all features are already complete.

## Foundation — implemented in the current source milestone

- [x] Public Apache-2.0 repository and contributor policy.
- [x] React/TypeScript interface and black minimal visual system.
- [x] English, Hindi and Marathi interface dictionaries for principal workflows.
- [x] Local PIN entry gate.
- [x] Dexie/IndexedDB schema with invoices, products, customers, payments, stock movements and audit events.
- [x] Multi-item invoice creation, discount, tax snapshot, payment capture and partial-payment status.
- [x] Tracked stock decrement and low-stock warnings.
- [x] Customer/product maintenance, payment book, reports and invoice print view.
- [x] AES-256-GCM password-encrypted backup export/restore.
- [x] Tauri v2 native app project for desktop/mobile targets.
- [x] Desktop tagged-release pipeline and manually signed mobile build workflows.

## Stage 1 — reliable shop billing

- [ ] Run platform-specific build and persistence tests on Windows, macOS, Linux, Android and iOS.
- [ ] Add barcode scanner and thermal printer workflows.
- [ ] Add invoice sequence and print-template settings, receipts and customer statements.
- [ ] Add CSV imports with preview, validation and duplicate resolution.
- [ ] Test backup/restore with large data sets and migration from each released schema.
- [ ] Add purchase entries, supplier book, stock receipts and supplier balances.
- [ ] Add sales returns, purchase returns, refunds and credit notes.

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

- No production release until sensitive local data storage is reviewed and encrypted, backup/restore has been tested, invoice/payment/stock invariants have comprehensive tests, platform persistence is tested, and independent tax/accounting and security reviews are complete.
- iOS and Android packages must be signed with the correct platform credentials before distribution.
- Tax or statutory features require current official-source verification and qualified review.
