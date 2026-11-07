# AInvoice architecture

## Architectural choice

Start with an installable Progressive Web App (PWA), built with React and TypeScript. Keep the application domain independent from the UI and storage implementation so a future desktop/mobile shell or optional synchronization service can reuse the same billing rules.

## High-level layers

1. **Presentation** — React screens, accessible controls, locale dictionaries and print layout.
2. **Application services** — use cases: create invoice, record payment, receive stock, export backup.
3. **Domain** — money arithmetic, invoice state transitions, tax calculation interfaces, numbering and validation.
4. **Persistence** — Dexie over IndexedDB for device-local records, schema versions and transactions.
5. **Platform** — service worker, install prompt, file export, printing and optional device capabilities.

UI components must not query IndexedDB directly for complex workflows; use application services so rules can be tested without a browser.

## Data model direction

Core entities:
- BusinessProfile
- User / Role / Permission (when multi-user support ships)
- Customer and Supplier
- Product / Unit / TaxCategory / PriceList
- Invoice / InvoiceLine / Payment / CreditNote
- Purchase / PurchaseLine
- StockMovement / Warehouse / Branch
- AuditEvent
- AppPreference / BackupMetadata

Use stable UUIDs for cross-device-ready entity identity. Store money as integer minor units with an explicit currency code. Store tax-rate snapshots and item descriptions on each issued invoice so historical records do not change when a product is edited.

## Offline-first behavior

- The service worker caches the application shell and versioned static assets.
- IndexedDB is the primary source of truth for a local-only installation.
- A committed invoice is written in one IndexedDB transaction with its lines and payment allocations.
- Show a clear "On this device" / "Offline" indicator; never imply that local data is backed up.
- Backup/export must be user initiated and include a schema version, checksum and validation step.
- Restore should validate the whole file before replacing data, create a recovery snapshot and report conflicts.

## Future synchronization

Do not introduce background synchronization until the following are designed and tested:
- Explicit opt-in and visible sync status.
- Per-business tenant isolation and authenticated access.
- Stable IDs, idempotent commands and conflict resolution.
- Server-side authorization on every request.
- Encrypted transport, at-rest controls, retention and deletion workflows.
- Audit events and recoverable backup/restore.

A sync service must not silently overwrite an invoice that has been edited on another device. Issued financial documents should use append-only correction workflows.

## Money and tax

Use integer paise/cents for stored money. Convert to display strings only at the presentation edge. Quantity precision and rounding policy must be explicit per unit. Tax calculation must use versioned jurisdiction rules and retain an invoice-time snapshot. Do not assume that every customer is subject to the same tax regime.

## Security boundaries

A local app lock is not a security boundary against a device owner or developer-tools access. IndexedDB can be inspected by anyone with access to the browser profile. A production release needs a reviewed encryption-at-rest and key-recovery design, hardened device authentication, secure backup format, role permissions, audit controls and independent testing. See SECURITY.md.

## Architecture decision records

Record material decisions under docs/decisions/ with context, options, decision and consequences. Do not replace local-only architecture with a cloud-first design for convenience.
