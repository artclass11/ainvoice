# AInvoice 2.0.0 — release acceptance plan

**Target:** AInvoice 2.0.0 production-readiness milestone  
**Current released version:** 0.1.1 Early Access  
**Status:** Not release-ready. This document is an acceptance plan, not a claim that 2.0.0 has shipped.

AInvoice 2.0.0 is intended to be the first release that can responsibly move beyond the current early-access prototype. A major version number will be assigned only after all applicable gates below pass on the final release commit.

## 1. Security and private data

- [ ] Replace the prototype's user-entered recovery key with a reviewed, documented key-wrapping and recovery design. Use operating-system key stores where available; clearly explain browser/PWA limits and make recovery portable.
- [ ] Independent cryptographic review of encryption, authentication, nonce generation, key lifecycle, error paths and Dexie middleware or its replacement.
- [ ] Prove that every persisted sensitive business field and searchable index is protected. Review record IDs, relationship metadata, counts, audit summaries, caches, logs, crash dumps, print/export flows and temporary storage.
- [ ] Test raw database/profile and forensic-oriented string scans on current supported Chromium, Firefox and WebKit environments and all released Tauri targets.
- [ ] Wrong keys, modified ciphertext, missing envelopes and incompatible schemas must fail closed. No automatic plaintext fallback, silent empty database, or destructive reset.
- [ ] Provide key recovery, key rotation, device replacement, backup/restore, secure wipe and lost-key documentation.
- [ ] Complete threat model, penetration test and independent security review; resolve all critical/high findings before release.

## 2. Existing-data migration

- [ ] Create a verified password-encrypted safety backup before migration, with a clear confirmation and test restore.
- [ ] Migrate every supported released Dexie schema, not only the latest v0.1.1 schema.
- [ ] Test interrupted migration, browser/app termination, power loss, low disk, quota errors, multiple tabs/windows, app upgrades and rollback.
- [ ] Reconcile invoice/payment totals, receivables, payables, stock, product/customer/supplier counts and audit history before deleting legacy plaintext records.
- [ ] Preserve source data until encrypted-copy verification and restore checks succeed; do not unlock the workspace while an older plaintext writer remains active.
- [ ] Exercise recovery from an independent device using only documented backups and recovery material.

## 3. Billing and accounting correctness

- [ ] Complete the double-entry accounting model and trial-balance reconciliation.
- [ ] Complete sales and purchase returns, refunds, credit/debit notes, supplier opening balances and multi-document payment allocation.
- [ ] Complete cash/bank/UPI reconciliation, controlled period close and immutable correction/audit workflows.
- [ ] Review India GST calculations, invoice content and numbering against current official rules with a qualified accounting/tax reviewer. Do not claim statutory compliance before written sign-off.
- [ ] Add property-based, boundary, currency, quantity, rounding and concurrency tests covering the full ledger lifecycle.

## 4. Platform quality and distribution

- [ ] Windows: signed installer, upgrade/uninstall test, encrypted persistence and migration test.
- [ ] macOS Intel and Apple Silicon: signed/notarized builds, install/upgrade and key-store tests.
- [ ] Linux: supported package formats, key-store availability/fallback policy and persistence tests.
- [ ] Android: permanent private release signing, Keystore integration where supported, physical-device migration and upgrade tests.
- [ ] iOS/iPadOS: signed TestFlight/App Store build, Keychain integration, device migration and restore tests.
- [ ] PWA: Chromium, Firefox and WebKit browser matrix, install/update tests, quota/interruption behavior and recovery-key UX.
- [ ] Automated end-to-end tests for onboarding, invoice, payment, stock, purchase, supplier, reports, backup, restore, lock/unlock and interrupted migration.
- [ ] Accessibility, printer/PDF, large-catalogue performance and offline/low-storage testing.

## 5. Operational and release discipline

- [ ] CI, production build, native compile, CodeQL, dependency audit and platform build workflows pass on the exact release tag.
- [ ] Publish SBOM and third-party notices; verify licenses for the full release dependency set.
- [ ] Sign release artifacts and updates, document checksums, publish vulnerability disclosure and incident-response procedures.
- [ ] Complete user documentation, backup/recovery guide, privacy disclosures and migration notice.
- [ ] Run release-candidate testing on a clean device and on a copy of representative existing user data.
- [ ] Update the package version, Tauri version, Rust crate version, changelog, release notes and tags together on the approved release commit; publish only after sign-off.

## Version policy

Do not change package metadata to 2.0.0 merely to indicate that work is underway. Keep the current published version at 0.1.1 while this remains an early-access branch. When the acceptance gates are complete, create a release-candidate branch, freeze the schema and migration plan, and then update all version metadata in one release commit.

## Current encryption work

The live IndexedDB encryption proof of concept is developed on the separate branch [security/live-encryption-poc](https://github.com/artclass11/ainvoice/tree/security/live-encryption-poc) and draft [PR #9](https://github.com/artclass11/ainvoice/pull/9). It is not merged or released. Its green checks, where present, are necessary engineering checks only; they do not replace the production gates in this document.
