# Security policy

AInvoice handles commercially sensitive business records. It remains an early-development product; do not use an unreviewed build as a hardened accounting system or the only copy of important business records.

## Current release status

- The main/default branch and existing preview installers still store live IndexedDB/WebView business records without at-rest encryption.
- Draft PR #9 (security/live-encryption-poc) contains an initial encrypted-record prototype. It is not merged, independently reviewed or distributed. Do not infer that a currently installed release has this protection.
- The app PIN is a 4–6 digit entry gate hashed with PBKDF2; it is not the live database key.
- Existing encrypted backup exports use AES-256-GCM with a password-derived PBKDF2-SHA256 key. The backup password is separate from the live database recovery key. Losing it means the backup cannot be recovered.
- Local-only use is the default; no cloud sync or telemetry is enabled by default. Tauri packaging alone does not encrypt WebView storage.

## Draft live-storage prototype (PR #9)

The draft encrypts non-indexed business-record fields in the shared Dexie/IndexedDB layer using TweetNaCl XSalsa20-Poly1305 secretbox. It generates a random 256-bit recovery key, displays it once, and requires the user to save it separately and enter it every time AInvoice starts. The app does not store or recover this key. It is not the PIN or the backup password.

Each record write receives a fresh 192-bit nonce. Ciphertext authentication fails closed for wrong keys or modified records. Only primary/technical relationship keys and a limited set of status/method/type enums remain visible for database indexing; names, phone, email, address, tax IDs, SKU, document numbers, dates, notes and the other non-indexed payload are encrypted.

The migration creates a separate encrypted database, upgrades the legacy Dexie schema to fence off older v5 writers, reads a transactional legacy snapshot, imports and compares every table, closes/reopens the encrypted database, verifies it again, and only then requests deletion of the legacy database. The app remains locked when legacy cleanup cannot complete. Users should create a password-encrypted backup before starting migration where possible.

This is a prototype, not an independent security review. It currently has no OS-backed key store, key wrapping, recovery escrow or automated rotation. Losing the recovery key makes the live database unrecoverable unless a separate encrypted backup can be restored using its own password. The user-held recovery key must never be stored beside the device or shared.

## Known limitations and threats

- The draft protects stored record payloads from casual offline reading of a closed IndexedDB profile without the key; it does not protect data while the app is unlocked.
- XSS, malicious renderer code, compromised updates, browser extensions, malware, root/admin access, debugger/memory inspection or a compromised OS can expose plaintext or keys.
- Numeric row IDs, relationship IDs, limited enum/status fields, record counts and the existence of the database remain observable.
- JavaScript memory clearing is best-effort; the runtime may retain copies.
- Browser/WebView caches, crash dumps, backups, deleted-page remnants, SSD wear-leveling and forensic recovery require platform-specific review.
- Real-device raw-profile scans, abrupt-shutdown/disk-full/migration-interruption tests, key rotation/recovery, multi-platform verification and independent cryptographic review remain open gates.

## Do not do this

- Do not use an unreviewed build as the sole production record.
- Do not commit recovery keys, backup passwords, keystores, API tokens, certificates or provisioning profiles.
- Do not send real customer, supplier, tax-ID, bank or payment details to coding agents or issue trackers.
- Do not claim GST, statutory invoicing, encrypted-at-rest certification, audited security or enterprise readiness from this preview.

## Reporting a vulnerability

Please do not publish exploitable details in a public issue.

Use GitHub's private vulnerability reporting for this repository:
https://github.com/artclass11/ainvoice/security/advisories/new

Include a concise description and impact, affected commit/release/environment, synthetic-data reproduction steps and any suggested mitigation.

## Production security release gates

- Independent threat model, cryptographic review and penetration test.
- Approved recovery, rotation and device-replacement plan; OS secure-key storage where supported and reviewed.
- Raw-storage scans and encrypted persistence/migration/restore tests on supported browsers and all shipped OS/device targets.
- Rate-limited app authentication and secure reset/recovery.
- Encrypted backup format, integrity verification, restore drills and recovery documentation.
- Multi-user roles, server-side authorization and tenant/branch isolation before cloud sync.
- Tamper-evident audit history and safe invoice correction workflow.
- Content Security Policy, dependency scanning, signed release artifacts and update signature management.
- Privacy review of every network request, update check and optional integration.
