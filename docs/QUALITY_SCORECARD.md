# AInvoice quality scorecard — 8 November 2026

This scorecard is an engineering assessment of the repository, not a certification, accounting opinion, security audit or guarantee of suitability for live financial records.

## Overall rating: 6.5 / 10 — improving early-access MVP

| Area | Rating | Assessment |
|---|---:|---|
| Core billing logic | 8/10 | Integer minor-unit calculations, quantity precision, invoice/payment transactions, stock movements, payment reconciliation and invoice snapshots; broader accounting workflows remain. |
| Data integrity and recovery | 8/10 | Versioned migrations, encrypted backup files, strict restore validation and regression coverage; real-device recovery drills and larger data tests remain. |
| User experience | 6.5/10 | Simple local-first workflow and English/Hindi/Marathi foundations; usability studies, accessibility and complete translation QA remain. |
| Security and privacy | 4.5/10 on draft branch; 3.5/10 on main | Draft PR #9 adds an authenticated IndexedDB record-encryption prototype, key verification, wrong-key/tamper checks and migration fencing. It is not merged or released, has no independent cryptographic review or hardware-backed key store, and real-device/raw-profile testing remains. Main and existing preview releases remain plaintext at rest. |
| Accounting and tax | 4.5/10 | Sales and collections plus a first-stage supplier/purchase ledger and payables. Not a double-entry ledger; supplier opening balances, returns/refunds, credit/debit notes, cross-document allocation, bank reconciliation and statutory tax validation remain incomplete. |
| Platform readiness | 4/10 | Windows/macOS/Linux early-access builds exist. Android ARM64 debug APK is a preview; permanent signing and physical-device QA remain. iOS signed distribution is not published. |
| Automated testing | 8/10 | Domain, IndexedDB transaction, backup, migration and encryption regression coverage. Full Playwright flows, printer matrix, physical-device and performance suites remain. |

## 2.0 readiness snapshot — 8 November 2026

- **Released baseline:** 0.1.1 Early Access on `main`; its live IndexedDB/WebView records remain unencrypted at rest.
- **Encryption candidate:** draft [PR #9](https://github.com/artclass11/ainvoice/pull/9), branch `security/live-encryption-poc`; 13 commits ahead of `main`, with no behind commits at review time. The PR is open, unmerged and has no submitted review.
- **Latest verified candidate commit:** [`9231e866ec9a`](https://github.com/artclass11/ainvoice/commit/9231e866ec9a0c1a467dc82f4befb7d3b1af176e).
- **Latest CI:** [run 42491034843](https://github.com/artclass11/ainvoice/actions/runs/42491034843) passed type-checking, unit/integration tests, production build, production dependency audit and native Linux/Tauri compilation.
- **Latest CodeQL:** [run 42491034844](https://github.com/artclass11/ainvoice/actions/runs/42491034844) passed JavaScript/TypeScript analysis.
- **What these checks do not prove:** no independent cryptographic audit, penetration test, raw browser/WebView profile scan, physical-device migration/restore exercise or signed cross-platform 2.0 release has been completed.
- **Release decision:** keep PR #9 in draft and keep the public version at 0.1.1. Do not merge or publish 2.0 until the acceptance gates in [RELEASE_2.0.md](./RELEASE_2.0.md) pass.

## Recent improvements

- Billing uses exact thousandth quantities and integer minor units with bounded arithmetic.
- Stock, invoice numbering, first payments and audit events commit in one IndexedDB transaction.
- Concurrent-sale, concurrent-payment, credit-limit, supplier purchase, stock-receipt, supplier-payment and purchase-void regression tests are included.
- Encrypted backup schema v2 includes supplier and purchase data and normalizes supported v1 backups during restore.
- Supplier purchase documents, stock receipts, supplier payment allocations and restricted purchase voiding share transaction, audit and restore-validation rules.
- Positive customer credit limits are enforced transactionally against opening balances and unpaid issued invoices.
- Invoice records retain the seller identity used when they were issued.
- Restore offers an encrypted pre-restore safety copy.
- PIN retry delays escalate after repeated failures; an unattended app locks after ten minutes or when it moves to the background.
- Draft PR #9 vendors the public-domain TweetNaCl implementation and encrypts non-indexed fields in every live Dexie business table with XSalsa20-Poly1305, a random 256-bit recovery key and a fresh 192-bit nonce per record write.
- The draft removes indexes containing customer, supplier, product, invoice and other sensitive business text; only primary/technical relationships and limited enum/status fields remain indexed.
- The draft adds a recovery-key gate separate from the app PIN, fail-closed key verification, raw IndexedDB plaintext-leakage assertions, wrong-key/tamper/nonce tests and a v6 legacy-writer fencing migration.
- On encryption commit 5bc68fd993de7b3b60a6f62f98710dc2ef1428b8, CI passed TypeScript, the full unit/integration suite, the production web build, dependency audit and native Linux/Tauri compilation; CodeQL passed. This is not independent security certification.

## Mandatory production gates

1. Review and complete draft PR #9: independent cryptographic review, real browser/WebView raw-profile scans, migration interruption/rollback tests, key recovery/rotation design and physical-device testing. Do not treat the draft as production-secure until these pass.
2. Build and test signed Windows/macOS/Linux/Android/iOS releases on supported devices and operating systems; test data persistence, upgrade and encrypted migration.
3. Extend the supplier/purchase ledger with opening balances, supplier returns/refunds and debit notes; add sales returns, credit notes, payment allocation, bank/UPI reconciliation and controlled period close.
4. Implement a versioned tax rules engine with India GST review, invoice numbering/legal content review and edge-case fixtures. No compliance claim without qualified review.
5. Add roles, approvals, multi-branch data separation, auditable exports and secure sync before multi-user/multi-device claims.
6. Add end-to-end browser tests, accessibility checks, print/PDF tests, large-catalogue performance tests, restore drills and independent penetration testing.
7. Add dependency/SBOM review, signed update verification, incident response and security disclosure procedures.

## Release decision

**Not production-ready for sole or statutory business books yet.** PR #9 is a draft prototype. Main and existing preview installers have not been updated with this encryption work. Keep the existing accounting system as the official ledger; create frequent password-encrypted backup exports and verify restores independently.
