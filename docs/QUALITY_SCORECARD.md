# AInvoice quality scorecard — 8 November 2026

This scorecard is an engineering assessment of the current repository state, not a certification, accounting opinion, security audit or guarantee of suitability for live financial records.

## Overall rating: 6.5 / 10 — improving early-access MVP

| Area | Rating | Assessment |
|---|---:|---|
| Core billing logic | 8/10 | Integer paise calculations, quantity precision, invoice/payment transactions, stock movements, payment reconciliation and invoice snapshots; still needs broader accounting workflows. |
| Data integrity and recovery | 8/10 | Versioned migrations, encrypted backup files, strict restore validation and regression coverage; real-device recovery drills and larger data tests remain. |
| User experience | 6.5/10 | Simple local-first workflow and English/Hindi/Marathi foundations; usability studies, accessibility and full translation QA remain. |
| Security and privacy | 3.5/10 | PIN hash and retry lockout are app-entry controls only. Local IndexedDB/WebView records are not encrypted at rest. No independent threat review. |
| Accounting and tax | 4/10 | Basic sales and collections only. Not a full double-entry ledger; supplier purchases, credit notes, returns, refunds, reconciliation and statutory tax validation are incomplete. |
| Platform readiness | 4/10 | Windows/macOS/Linux early-access builds exist. Android ARM64 debug APK is built, verified and published for preview; permanent Android signing and physical-device QA remain. iOS signed distribution is not published. Store review, notarization and signing are outstanding. |
| Automated testing | 8/10 | Domain, IndexedDB transaction, backup and legacy migration regression tests; no complete Playwright flow, printer matrix, physical-device or performance suite yet. |

## Recent improvements

- Billing calculations now use exact thousandth quantities and integer minor units with bounded arithmetic.
- Stock, invoice numbering, first payments and audit events commit in one IndexedDB transaction.
- Existing payment history is reconciled before receiving another payment.
- Supplier purchase documents, stock receipts, supplier payment allocations, and restricted purchase voiding now share transaction, audit and restore-validation rules.
- Positive customer credit limits are enforced transactionally against opening balances and unpaid issued invoices; fully paid sales do not increase exposure.
- Invoice records retain the seller identity used when they were issued.
- Database version migration upgrades older invoices, preserves historical paid totals, and backfills stock-sale movement links to the originating invoice.
- New stock-sale movements now retain the source invoice ID; encrypted backup validation checks payment/customer identity and requires invoice-linked stock movements to resolve correctly.
- Backup imports validate invoice calculations, references and payment reconciliation before replacing data.
- Restore offers an encrypted pre-restore safety copy.
- PIN retry delays escalate after repeated failures; an unattended app locks after ten minutes of inactivity or when the app moves to the background.
- CI now tests the domain, persistence, backup and migration cases, installs from a committed frozen pnpm lockfile, and builds/verifies a debug ARM64 Android APK without requesting the removed legacy tools package.

## Mandatory production gates

1. Replace local IndexedDB as the authoritative native store with an audited encrypted database (for example SQLCipher) and hardware-backed key management where supported. Define PIN/key recovery, rotation, wipe and backup compatibility first.
2. Build and test the Android release with a permanent private signing key. Test installs, upgrades and data persistence on physical Android devices.
3. Build, sign, notarize and install test Windows/macOS releases. Publish iOS through TestFlight/App Store after certificates, provisioning, entitlements, privacy disclosures and device QA.
4. Extend the first-stage supplier/purchase ledger with opening supplier balances, supplier returns/refunds and debit notes; add sales returns, credit notes, payment allocation across multiple documents, bank/UPI reconciliation and controlled period close.
5. Implement a versioned tax rules engine with India GST review, invoice numbering/legal content review and negative/edge case test fixtures. No compliance claim until qualified review.
6. Add user roles, approval controls, multi-branch data separation, auditable exports and secure sync before multi-user/multi-device claims.
7. Add end-to-end browser tests, platform device tests, accessibility checks, print/PDF tests, large-catalogue performance tests and restore drills from an independent machine.
8. Add dependency/SBOM review, automated vulnerability monitoring, signed update verification, incident response and external penetration testing.

## Release decision

**Not production-ready for sole or statutory business books yet.** Safe to use for controlled demos and test data. Before any pilot with live records, create frequent encrypted backups and verify a restore on a separate device. Keep the existing accounting system as the official ledger until the mandatory gates above have passed.
