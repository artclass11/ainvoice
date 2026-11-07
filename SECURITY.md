# Security policy

AInvoice is intended to handle commercially sensitive business records. Security defects are treated as high priority.

## Current security status

This project is in early development. Do not treat it as a hardened, audited accounting system or use an unreviewed build as the only copy of important business records.

- Local-first storage reduces routine server exposure, but browser IndexedDB is not encrypted automatically.
- A 4–6 digit PIN or pattern is a convenience lock. It does not provide strong protection against a person with developer-tools access or a copy of the device profile.
- A PIN must never be used directly as an encryption key.
- Backups must be treated as sensitive files. Encrypted backup and tested recovery are release gates.
- No cloud sync is enabled by default. Any future sync must use explicit opt-in, tenant isolation, transport encryption, access control and auditable deletion/export paths.

## Reporting a vulnerability

Please do not publish exploitable details in a public issue. Contact the repository owner through the GitHub profile's private contact method and include:

- A concise description and impact.
- Affected commit, release or environment.
- Reproduction steps using synthetic data.
- Any suggested mitigation.

Do not attach actual customer or financial records.

## Security requirements before production

- Threat model and independent security review.
- Strong device authentication integration where available.
- Authenticated encryption for local sensitive data and exported backups, with versioned key derivation and recovery design.
- Rate limits and secure handling for PIN attempts; secure reset/recovery that does not silently erase or expose data.
- Strict content security policy, dependency scanning and reproducible release checks.
- Role-based permissions and audit trail for multi-user / dealer deployments.
- Tested backup integrity, restore, export, deletion and disaster recovery.
- Privacy review of every network request, update check and optional integration.

Security reports are acknowledged and assessed as soon as maintainers can review them. Please do not assume a particular response time.
