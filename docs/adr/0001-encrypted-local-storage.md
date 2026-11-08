# ADR 0001: Encrypted local business-data storage

- **Status:** Initial IndexedDB encryption prototype implemented on draft PR #9; not approved for production
- **Date:** 8 November 2026
- **Scope:** Shared Dexie/IndexedDB layer used by browser/PWA and Tauri WebView builds

## Context and release boundary

The main branch and currently published preview releases still use the earlier plaintext live database. The prototype described here is confined to the security/live-encryption-poc branch and draft PR #9. It must not be described as a protection already present in released installers.

The app PIN remains an app-entry control and is not an encryption key. Exported backup files use their own password-based AES-256-GCM format; that backup password is separate from the live database recovery key.

## Prototype decision

The prototype encrypts each business-record payload synchronously in the Dexie DBCore write path using the public-domain TweetNaCl implementation of XSalsa20-Poly1305 secretbox.

- A cryptographically random 256-bit key is generated with the platform CSPRNG when the encrypted database is first initialized.
- The key is displayed once as 64 hexadecimal characters. The user must save it separately and enter it whenever AInvoice starts. It is not persisted alongside the database, derived from the short PIN, or recoverable by the application.
- Each record write receives a new random 192-bit nonce. Secretbox authenticates ciphertext, so modified or incorrect-key records fail closed.
- All persisted visible primary/relationship/status fields are included in the authenticated payload metadata. For an IndexedDB-generated inline primary key, the middleware performs the initial insert and then re-encrypts the record with the assigned key in the same transaction before it can commit; changing that row ID later is detected as tampering.
- The decrypted key is held in process memory only and zeroed on explicit lock, inactivity/background lock, and database close. JavaScript memory wiping is best-effort; garbage-collected copies and runtime snapshots cannot be guaranteed erased.
- The encrypted database is named ainvoice-secure-v1. A key-verifier record is stored separately from business tables to detect a wrong key before the app opens its workspace.
- There is no plaintext fallback. A missing verifier in a database that already contains records, a missing record envelope, malformed data, wrong key, or failed authentication stops access.

### What remains visible in IndexedDB

Only each row's primary key and the fields needed for non-identifying relationship/status queries remain outside the encrypted payload. The v6 encrypted schema removes searchable indexes for invoice/purchase numbers, names, SKU, dates, phone, email, address, tax ID, notes and other business text. Technical IDs and a limited set of status/method/type enum values remain visible for IndexedDB indexing and referential operations.

This is record-payload encryption, not an encrypted database engine. It does not hide record counts, row relationships or the existence of local business data. It is not a substitute for SQLCipher or an operating-system secure key store.

## Migration from the legacy database

The encrypted database is separate from the legacy ainvoice-local database. Migration is intended to be non-destructive:

1. Before starting, the user should create and verify a password-encrypted backup using the existing app where possible, and save the new live-database recovery key separately.
2. The migration connection upgrades the legacy Dexie schema from v5 to v6 without changing its table content. That version change fences older v5 app windows; IndexedDB version-change handling requires them to close before the upgrade continues.
3. Once the upgrade is complete, a single read-only transaction snapshots all ten legacy business tables.
4. The snapshot is imported into the encrypted database through the same synchronous encryption middleware used for normal writes.
5. The app reads the encrypted database back, compares every supported table record to the source snapshot, closes and reopens the encrypted database with the supplied key, and compares the records again.
6. Only after those checks pass does the app request deletion of the legacy database. The new workspace stays locked if deletion is blocked or cannot complete.
7. If migration fails before the final deletion, the previous database is retained. Existing non-empty encrypted data that does not match the legacy snapshot is never silently overwritten.

The migration code is covered by synthetic-data tests for copying legacy invoices/settings, verifying the encrypted copy, removing the old database, and waiting for a pre-existing v5 connection to close. Power-loss, disk-full, browser shutdown, simultaneous device tabs and large real-business datasets still require manual testing.

## Why the live-record cipher is synchronous

IndexedDB transactions can auto-close while asynchronous WebCrypto operations are pending. The prototype therefore uses a synchronous JavaScript cryptographic implementation inside Dexie's low-level write middleware. This is an implementation trade-off, not a claim that synchronous JavaScript crypto is faster or stronger than a reviewed native database engine. The exact dependency version and upstream source commit are recorded in the repository's vendored license/provenance files.

## Threat boundary and limitations

This prototype is intended to prevent a person who only obtains the closed browser/WebView IndexedDB files from reading the encrypted business-record payloads without the recovery key. It does not protect data while AInvoice is unlocked or from:

- malicious JavaScript, XSS, a compromised app update, browser extension or renderer compromise;
- malware, administrator/root access, a debugger, memory inspection or a compromised operating system;
- the recovery key being copied, photographed, pasted into an unsafe location or stored beside the device;
- browser/WebView caches, crash dumps, old storage snapshots, backups, SSD wear-leveling or forensic recovery of deleted legacy database pages;
- plaintext deliberately exported, printed, copied, displayed or included in logs.

The prototype does not yet provide key wrapping, recovery by a second factor, key rotation, remote escrow, device replacement automation, hardware-backed storage, or automatic encrypted backup before migration. If the recovery key is lost, the live database is unrecoverable; a separate encrypted backup can only be restored using its own backup password.

## Verification completed in the draft PR

- Raw fake-IndexedDB inspection asserts that customer names, invoice numbers, phone, tax ID, item descriptions and notes are not stored as plaintext business fields.
- Wrong-key verification and ciphertext-tamper tests fail closed and preserve existing ciphertext.
- Tests check 24-byte nonce size and fresh nonces on repeated writes.
- Tests exercise indexed key-only reads and collection modifications.
- Migration tests verify source/copy equality and legacy-writer fencing.
- At encryption commit 5bc68fd993de7b3b60a6f62f98710dc2ef1428b8, GitHub CI passed typecheck, the full unit/integration suite, production build, dependency audit and native Linux/Tauri compile. CodeQL also passed. These checks establish code/build behavior only; they do not constitute a cryptographic audit or device-level security verification.

## Production release gates

- Independent review of the DBCore middleware, TweetNaCl integration, nonce lifecycle, key handling and error paths.
- Raw-storage and forensic-oriented scans of IndexedDB/WebView profiles on Chromium, Firefox, Safari/WebKit, Windows, macOS, Linux, Android and iOS; include old DB remnants, cache, crash and backup files.
- Real-device migration tests for existing AInvoice versions, multiple open tabs, interrupted migration, low disk, browser/app termination and restore/rollback.
- An approved recovery and key-rotation design, preferably integrating OS-supported secure key storage where available without claiming identical guarantees on every platform.
- Full end-to-end workflows for billing, purchasing, search, reports, backups, restore, print and all database write/query/update/delete paths.
- Independent security/cryptographic review before any public claim of encrypted-at-rest or enterprise security.

## Release policy

- This branch is a draft prototype, not the released security posture. Do not merge or ship it as production-ready until the release gates above are completed and reviewed.
- Main/default branch and existing preview installers must continue to be treated as having plaintext live local records until an approved encryption release is built and distributed.
- Keep the warning visible; do not use an unreviewed build as the only copy of statutory or production books.
- Maintain frequent password-encrypted backup exports, store their password separately, and verify restore on a separate device.

## References

- TweetNaCl.js upstream source: https://github.com/dchest/tweetnacl-js
- TweetNaCl public-domain licence: https://github.com/dchest/tweetnacl-js/blob/master/LICENSE
- Dexie DBCore API: https://dexie.org/docs/DBCore/DBCore
- Dexie middleware: https://dexie.org/docs/Dexie/Dexie.use()
- Tauri SQL plugin: https://v2.tauri.app/plugin/sql/
- Tauri Stronghold plugin: https://tauri.app/plugin/stronghold/
- SQLCipher source and feature description: https://github.com/sqlcipher/sqlcipher
