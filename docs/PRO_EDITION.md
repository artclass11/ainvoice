# AInvoice Pro — product direction and delivery status

**Workstream:** `feature/ainvoice-pro-catalogue`  
**Status:** Pro preview work in progress; not merged or released  
**Released baseline:** 0.1.1 Early Access

## Product position

AInvoice Pro is the professional workflow track for retailers, wholesalers and dealers. It builds on the same offline-first, open-source AInvoice application. The Pro label does not introduce a proprietary lock, subscription check, account requirement or paid API dependency. The repository remains Apache-2.0.

"Pro" is a capability target, not a claim that all advanced accounting, security or statutory requirements are complete. Features are marked implemented only after code, tests and user-facing behavior are present.

## Implemented in this Pro preview

### Product catalogue bulk operations

- Download a CSV template with the supported column headers.
- Export the current product catalogue, including SKU, units, sale/purchase prices, tax percentage, stock/reorder quantities and active/tracking flags.
- Import CSV with a validation preview before any database writes.
- Accept quoted fields, commas, escaped quotes, UTF-8 BOM and multi-line quoted values.
- Enforce 5 MB and 5,000-row file limits.
- Convert currency amounts to integer minor units and quantities to thousandths without using floating-point money storage.
- Normalize SKUs and reject duplicates already in the catalogue or repeated within the import batch.
- Show row-level issues; valid unique rows can still be imported without discarding the entire file.
- Never overwrite existing catalogue records from CSV.
- Commit the accepted batch atomically; recheck SKU conflicts at commit time.
- Record opening stock as stock movements and create an audit event in the same transaction.
- Neutralize formula-leading text during CSV export to reduce spreadsheet formula-injection risk.

## Pro acceptance roadmap

### Retailer / wholesaler operations

- [ ] Customer and supplier statements with opening balance, dated transactions, receipts/payments and closing balance.
- [ ] Quotes/estimates with expiry and traceable conversion to issued invoices.
- [ ] Customer-specific price lists and controlled discount/approval limits.
- [ ] Barcode lookup and label printing.
- [ ] Thermal printer profiles and verified PDF/print layouts.
- [ ] Sales returns, customer refunds and credit notes; supplier returns, supplier refunds and debit notes.
- [ ] Payment allocation across multiple invoices/purchases.
- [ ] Stock adjustments with reasons, stock counts and reconciliation reports.
- [ ] Multiple warehouses, transfers and batch/serial/expiry tracking.

### Accounting and tax

- [ ] Double-entry ledger, trial balance and control-account reconciliation.
- [ ] Receivables/payables aging, cash/bank/UPI reconciliation and controlled period close.
- [ ] Versioned tax rules by jurisdiction and effective date.
- [ ] India GST workflows only after current official-source verification and qualified accounting/tax review. No statutory compliance claim without sign-off.

### Organization and security

- [ ] Named users, roles, approval limits and separation of duties.
- [ ] Branch and tenant isolation before any multi-organization synchronization.
- [ ] Independently reviewed encrypted live storage, a verified pre-migration safety backup, recovery and rotation design, and real-device testing.
- [ ] Encrypted sync with server-side authorization, idempotency, conflict handling and audit trails.
- [ ] Signed installers and updates, SBOM, vulnerability response and documented recovery procedures.

## Data safety and release policy

- Do not use an unreviewed Pro preview as the only copy of real business or statutory records.
- Keep frequent password-encrypted backups and test a restore independently.
- Never overwrite product records or stock quantities silently during a CSV import.
- Financial changes must go through the existing transactional billing/stock services; CSV tools are for master-data catalogue setup only.
- Keep package metadata at the currently released version until the exact release commit passes the full product, security, accounting, platform and signing gates.
- The unfinished live-encryption work in PR #9 is separate and remains a release blocker; this Pro preview does not claim to resolve it.

## First Pro-preview acceptance tests

- [x] CSV import/export has dedicated unit tests for quoting, decimals, duplicate SKUs, malformed data, row/file limits and formula neutralization.
- [x] Import transaction tests cover atomicity, race-time duplicate checks, opening stock movements and audit logging.
- [ ] Run full repository CI and CodeQL on the Pro branch head.
- [ ] Manual browser review of the preview/import/export workflow with large catalogues and keyboard/screen-reader navigation.
- [ ] Manual regression of invoice creation, purchase receipt, stock changes, backup and restore after catalogue import.
