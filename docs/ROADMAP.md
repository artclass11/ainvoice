# AInvoice roadmap

Roadmap items are targets, not claims that features already exist.

## Phase 0 — Open foundation
- [x] Public source repository initialized.
- [x] Apache-2.0 project license and contribution policy.
- [x] Product, architecture, security and agent instructions.
- [ ] Build and verify first installable local app.

## Phase 1 — Dependable local billing
- Guided first-run setup and local app lock.
- Product/customer directory.
- Fast invoice creation and print layout.
- Payment status and receivable book.
- English, Hindi and Marathi localization.
- IndexedDB schema migrations and offline shell.
- Unit tests for money, rounding, numbering and persistence.

## Phase 2 — Shop-ready operations
- Barcode input and thermal/standard printer workflows.
- Purchase entries, supplier balances and returns.
- Optional stock movements and low-stock alert.
- CSV import/export and validated backup/restore.
- GST/non-GST invoice configuration after professional review.

## Phase 3 — Dealer-grade operations
- Multiple users, roles and approval rules.
- Branches, warehouses, price lists and customer-specific pricing.
- Batch/serial number and expiry tracking where relevant.
- Immutable audit trail and consolidated reports.
- Bulk data tools and migration utilities.

## Phase 4 — Optional connected features
- Encrypted multi-device sync with explicit enrollment.
- Server-side tenant isolation and permission enforcement.
- Device recovery and key management.
- Verified integrations such as e-invoicing/e-way bills where applicable.
- Independent penetration test, privacy review and disaster-recovery test.

## Release gates

No phase is complete until tests pass, migrations are tested, accessibility is reviewed, backup/restore is verified and user-facing documentation describes limitations honestly. Tax or statutory features require current official-source verification and qualified review.
