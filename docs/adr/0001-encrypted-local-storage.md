# ADR 0001: Encrypted local business-data storage

- **Status:** Proposed; proof-of-concept and cross-platform verification required
- **Date:** 8 November 2026
- **Scope:** Desktop, Android, iOS and browser/PWA builds

## Context

AInvoice currently uses Dexie/IndexedDB for its live business records. Those records are not encrypted at rest. The app PIN is an entry lock and retry deterrent, not a database key. AES-256-GCM protects exported backup files only; it does not protect the live database.

This is a release-blocking risk for invoices, customer contact information, tax identifiers, payment history and supplier records. Adding a generic "encrypt" flag or storing a database password beside the database would not close it.

## Decision direction

Do not ship a partial encryption implementation or silently fall back to plaintext storage. First prove a storage-provider design on all target platforms.

### Native Tauri builds

1. Evaluate SQLCipher as the encrypted SQLite engine. SQLCipher documents whole-database AES-256 encryption, integrity protection and key derivation. Its Community Edition is open source under a BSD-style license with attribution obligations; licensing must be reviewed and the required notice included before shipping.
2. Do not assume the official Tauri SQL plugin encrypts data. It is an SQLx interface to SQLite/MySQL/PostgreSQL; the plugin documentation does not claim SQLCipher-backed encryption.
3. Keep key management separate from the database engine. Evaluate the official Tauri Stronghold plugin for protected key material and Argon2-based password derivation, and compare it with native platform stores (Android Keystore, Apple Keychain, Windows Credential Manager/DPAPI and Linux Secret Service). Do not describe Stronghold itself as hardware-backed unless the platform implementation proves that property.
4. If the native SQLCipher bridge is implemented in Rust, verify the cipher is actually present at runtime and fail closed when it is not. A normal SQLite build can ignore an unknown `PRAGMA cipher_version` or `PRAGMA key`; successful database open alone is not evidence of encryption.
5. A 4–6 digit app PIN must never be the sole encryption secret. Keep the PIN as a convenience lock only after a high-entropy storage key has been safely unlocked.

### Browser / PWA builds

The PWA cannot depend on native Tauri plugins. It needs a separately reviewed WebCrypto storage provider using authenticated encryption (AES-GCM), per-install random data keys, a memory-hard password-based key-encryption key, fresh nonces, explicit key versioning and a recovery/rotation plan. A 4–6 digit PIN is not an acceptable wrapping password.

The browser implementation must not advertise "encrypted at rest" until ciphertext—not plaintext business fields—is what is persisted in IndexedDB, and key material is not stored beside it. Browsers do not provide identical OS-key-store guarantees across all platforms; that limitation must be explained.

## Options reviewed

| Option | Decision | Reason |
|---|---|---|
| Tauri SQL plugin alone | Reject as encryption solution | Provides SQL database access, but does not document transparent database encryption. |
| Tauri Stronghold | Evaluate for secret/key storage | Official plugin for secrets and keys, with documented Argon2 initialization and Windows, Linux, macOS, Android and iOS targets. It is not itself a drop-in SQLCipher driver or proof of hardware-backed storage. |
| SQLCipher + a reviewed native key manager | Preferred native proof-of-concept | Full database-file encryption and integrity checks; requires a Rust bridge and real builds on every platform. |
| `tauri-plugin-rusqlite2` | Do not adopt without further validation | Its published platform table identifies Android and iOS as untested. |
| Unreviewed/early-stage libsql encryption wrapper | Spike only, not production path | A plugin claim of cross-platform support or AES encryption is not a substitute for license, cryptographic, maintenance and device testing. |

## Required migration behavior

The existing IndexedDB data must never be deleted or overwritten until a verified encrypted migration has completed.

1. Create a verified encrypted backup before migration.
2. Create a new encrypted database using a new random data-encryption key.
3. Import from a read-only snapshot of the legacy Dexie tables.
4. Reconcile counts and totals: invoices, issued amounts, collections, customer balances, supplier purchases/payables, product stock and audit events.
5. Run application-level invariants and a close/reopen verification using the new key.
6. Commit a migration marker only after every verification passes. Preserve the old data and offer a clear rollback path on failure.
7. Re-encrypt or wrap keys on password change, device replacement and restore. Never log keys or plaintext records.

## Security verification gates

- Prove database files and their journal/WAL/temp files do not reveal known customer names, phone numbers, tax IDs, invoice numbers or notes in a raw string scan.
- Prove wrong keys and modified ciphertext fail closed; no empty-database fallback.
- Prove fresh nonces, key separation, key versioning, rotation and recovery behavior.
- Test abrupt shutdown, low disk space, backup/restore, migration interruption and rollback.
- Test latest supported Windows, macOS Intel/Apple Silicon, Linux, Android ARM64 and iOS device/simulator builds, plus supported browser engines for PWA.
- Threat-model local device compromise, unlocked-device access, backups, logs, crash dumps, clipboard/print/export flows and malicious renderer input.
- Obtain independent cryptographic review before the product is marketed as protected or enterprise-ready.

## Release policy until this ADR is implemented

- Keep the warning visible: the app PIN is not database encryption and live IndexedDB/WebView business records are currently plaintext at rest.
- Do not use AInvoice as the sole repository for sensitive production or statutory records.
- Do not describe the current build as secure, encrypted-at-rest, audited or enterprise-ready.
- Continue to recommend frequent password-encrypted backup exports and separate backup-password storage.

## References

- Tauri SQL plugin: https://v2.tauri.app/plugin/sql/
- Tauri Stronghold plugin: https://tauri.app/plugin/stronghold/
- SQLCipher source and feature description: https://github.com/sqlcipher/sqlcipher
- SQLCipher documentation and community licensing: https://www.zetetic.net/sqlcipher/documentation/ and https://www.zetetic.net/sqlcipher/license/
- Tauri rusqlite2 alternative platform table: https://docs.rs/crate/tauri-plugin-rusqlite2/latest
