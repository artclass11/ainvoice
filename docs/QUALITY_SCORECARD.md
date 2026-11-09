# AInvoice quality scorecard — 9 November 2026

This scorecard is an engineering assessment of the repository state at the date below, not a certification, accounting opinion, security audit or guarantee of suitability for live financial records.

**Assessed `main` commit:** [`9975412`](https://github.com/artclass11/ainvoice/commit/9975412c6fa1669ae54e1d807ff27469c267ed48)  
**Overall rating: 6.6 / 10 — improving early-access MVP**

The rating is a qualitative project-readiness judgment, not a weighted test result. It reflects the documented implementation and available GitHub evidence. I did not run the repository's test, lint, type-check or build commands as part of this update.

| Area | Rating | Assessment |
|---|---:|---|
| Core billing logic | 8/10 | Integer minor-unit money, precise quantities, transactional invoice/payment/stock workflows and historical snapshots are documented, with regression tests. Broader accounting workflows remain incomplete. |
| Data integrity and recovery | 8.2/10 | Versioned migrations, encrypted backup/restore validation, transaction coverage and append-only audit events are strong for an MVP. The latest `main` change adds printable purchase details and a regression check that supplier, item and cost snapshots survive edits to master records. Real-device recovery drills and larger-data tests remain. |
| User experience | 6.6/10 | Local billing and purchase workflows are broadening, and English/Hindi/Marathi foundations exist. Usability studies, full translation review and systematic accessibility validation are still needed. |
| Security and privacy | 3.5/10 | Local-only use and encrypted backup exports are positive. The PIN is only an entry gate; live IndexedDB/WebView records are not encrypted at rest. No independent threat review is documented. |
| Accounting and tax | 4.5/10 | Sales/collections and a first-stage supplier/purchase ledger exist. This is not double-entry accounting or a statutory tax-compliance implementation; returns, credits/debits, supplier opening balances and other workflows remain incomplete. |
| Platform readiness | 4/10 | PWA and Tauri targets are documented, and preview artifacts exist for some platforms. Buildability is not equivalent to signed, notarized, device-tested distribution. Android release signing and physical-device QA, iOS device distribution, and desktop release verification remain gates. |
| Automated testing | 8/10 | Domain, persistence, backup and migration regression coverage is documented. Complete end-to-end, printer, physical-device, accessibility and performance suites are not yet documented. |

## Evidence and latest changes

- The latest `main` commit adds a printable purchase-detail view, including payment and stock-receipt history, and checks that issued purchase snapshots retain supplier, item and cost details when live master records are subsequently edited.
- The latest scheduled security-analysis run on `main` completed successfully: [run 42612178820](https://github.com/artclass11/ainvoice/actions/runs/42612178820). This is not evidence that every CI workflow or release gate passed on `main`.
- Draft [PR #10](https://github.com/artclass11/ainvoice/pull/10) reports passing application CI, security analysis and six-target platform compatibility checks on its feature branch. Its application CI reports 67 tests across 10 files. These results are **PR-branch evidence, not merged `main` evidence**; the PR is still a draft and has not been merged.
- The draft PR's platform checks compile/build outputs but do not establish signed installers, production signing, notarization, physical-device behavior or user acceptance. The PR description explicitly lists these limitations.
- Repository package metadata declares React 18.3.1, TypeScript 5.9.3, Vite 6.4.5, Dexie 4.4.7, Vitest 2.1.9 and Tauri CLI 2.12.4. No dependency was added for this documentation update.

## Mandatory production gates

1. Complete the encrypted local-storage design and migration described in [ADR 0001](./adr/0001-encrypted-local-storage.md), including authenticated-encryption verification, secure-key handling, migration/recovery tests and independent security review. Do not describe the current PIN as encryption.
2. Test data-preserving upgrades and recovery on real supported devices. Keep fixtures for every prior IndexedDB schema version and run restore drills from an independent device or installation.
3. Prepare and verify signed Windows/macOS/Linux installers, a permanently signed Android release and signed iOS device distribution. Complete installation, upgrade, persistence, backup/restore, file sharing, printing and accessibility checks on physical devices where applicable.
4. Extend the supplier/purchase ledger with supplier opening balances, supplier returns/refunds and debit notes; implement sales returns, credit notes and multi-document payment allocation with immutable, auditable correction workflows.
5. Implement versioned, jurisdiction-specific, effective-dated tax rules and obtain qualified review of calculations, invoice numbering and legal invoice content. Do not claim GST or statutory compliance before review.
6. Add complete browser end-to-end, accessibility, printer/PDF, offline, large-catalogue performance and slow-device coverage. Verify keyboard-only workflows, small screens and accessible empty/error states.
7. Complete dependency/SBOM review, vulnerability monitoring, signed-update verification, incident response planning and independent penetration testing before production positioning.
8. Keep cloud sync, telemetry and automatic upload out of the product unless an explicit, documented product decision and privacy/security design are approved.

## Release decision

**Not production-ready for sole or statutory business books.** Suitable for controlled demos and synthetic/test data. Any evaluation with live records carries material risk because live local data is not encrypted at rest and the accounting, tax, platform and independent-review gates above remain open. If a limited pilot is considered, use frequent password-encrypted backups and verify restoration independently; do not make AInvoice the only copy of business records.
