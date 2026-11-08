# Security policy

AInvoice is intended to handle commercially sensitive business records. This project is in early development; do not treat an unreviewed build as a hardened accounting system or the only copy of important business records.

## Current controls

- Local-only use is the default; no cloud sync or telemetry is enabled by default.
- A 4–6 digit PIN is hashed with PBKDF2 for an app-entry gate. It is not strong protection against a person with access to the unlocked device, WebView profile or developer tools.
- Browser/WebView IndexedDB is not encrypted automatically. **Live business records are not yet encrypted at rest.**
- Backup export uses AES-256-GCM with a password-derived PBKDF2-SHA256 key. Use a long unique backup password and store it separately. Losing the password means the backup cannot be recovered.
- Backups contain sensitive customer, invoice and payment information. Treat the file like the business's original books.
- The native shell uses Tauri v2. Native packaging does not, by itself, encrypt local application storage.

## Do not do this

- Do not use an unreviewed build as the sole production record.
- Do not commit passwords, keystores, API tokens, certificates or provisioning profiles.
- Do not send real customer, supplier, tax-ID, bank or payment details to coding agents or issue trackers.
- Do not claim GST, statutory invoicing or audited enterprise-security compliance from this preview.

## Reporting a vulnerability

Please do not publish exploitable details in a public issue.

Use GitHub's private vulnerability reporting for this repository:
https://github.com/artclass11/ainvoice/security/advisories/new

Include:

- A concise description and impact.
- Affected commit, release or environment.
- Reproduction steps using synthetic data.
- Any suggested mitigation.

## Production security release gates

- Threat model and independent security review.
- Encryption at rest with authenticated encryption and a platform secure-key store; reviewed recovery, rotation and device replacement.
- Rate-limited app authentication and secure reset/recovery.
- Encrypted backup format, integrity verification, restore drills and recovery documentation.
- Multi-user roles, server-side authorization and tenant/branch isolation before cloud sync.
- Tamper-evident audit history and safe invoice correction workflow.
- Content Security Policy, dependency scanning, signed release artifacts and update signature management.
- Privacy review of every network request, update check and optional integration.
- Independent penetration test and documented vulnerability response process.
