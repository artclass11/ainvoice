# AInvoice architecture

## Product delivery model

AInvoice shares one React/TypeScript application across two hosts:

- PWA browser host: Vite output and Workbox service worker.
- Native host: Tauri v2 desktop/mobile shell using the platform WebView.

The Tauri shell embeds the built frontend and does not require an internet server at app startup. The current persistence adapter uses Dexie and IndexedDB in the app's local WebView/browser origin. This is suitable for the local-first prototype, but it is not yet the final encrypted enterprise storage layer.

## Layers

1. **Presentation** — React screens, accessible controls, locale dictionaries and print layout.
2. **Application services** — create invoice, record payment, manage products/customers, void unpaid invoice and export/restore backup.
3. **Domain** — money arithmetic, invoice state, payment status, inventory validation and audit event creation.
4. **Persistence** — Dexie/IndexedDB, versioned migrations and atomic transactions.
5. **Platform** — PWA service worker, Tauri desktop/mobile packaging, print, file export and platform signing.

UI components should call application services rather than directly modifying business records.

## Current domain entities

- Business settings
- Product / Unit / tax rate / SKU / stock flags
- Customer / contact / credit limit / opening balance
- Invoice / InvoiceLine / tax and discount snapshots
- Payment / allocation / method / receipt reference
- StockMovement
- AuditEvent
- Encrypted Backup envelope

Future entities include suppliers, purchase invoices, credit notes, refunds, users/roles, branches, warehouses, price lists, approvals, device enrollment and sync metadata.

## Data integrity

- Currency is stored as integer minor units (paise/cents).
- Quantity is decimal but stock quantities are represented as thousandths in the current schema.
- A sales invoice writes invoice lines, payments, stock movements and the invoice sequence in a single IndexedDB transaction.
- Tracked stock is decremented on issue.
- An unpaid invoice can be voided and its tracked stock restored. An invoice with received payments is blocked from voiding until a refund/reconciliation workflow is available.
- Issued financial records are not silently deleted.
- Historical line descriptions, unit prices, tax rate and discount are stored on the invoice snapshot.

## Schema migrations

Dexie schema version 2 adds products, customers, payments, stock movements and audit events. The migration backfills fields introduced for invoices and moves existing paid totals into payment history. All future schema changes must include forward migration tests and sample legacy data.

## Offline behavior

- The PWA service worker caches the application shell and static assets.
- The Tauri shell embeds frontend assets for offline startup.
- IndexedDB is the local source of truth.
- Local data is not automatically backed up; the app provides a password-encrypted export/restore workflow.
- Restore replaces the local business tables only after the encrypted backup has been decrypted and checked for required tables.

## Native platforms

Tauri targets Windows, macOS, Linux, Android and iOS. Desktop release builds use GitHub Actions on Windows, macOS and Ubuntu runners. Mobile builds require their respective SDKs and signing materials. iOS needs Apple signing infrastructure; Android needs a private keystore for signed distribution.

## Security architecture and remaining work

- Local PIN credential uses PBKDF2 hashing but is only an app-entry lock.
- Exported backups use AES-256-GCM with PBKDF2-SHA256 password derivation.
- The live IndexedDB store is not encrypted at rest.
- Future native releases should move sensitive records to an independently reviewed encrypted SQLite/SQLCipher storage adapter and a platform secure-key store.
- Multi-user/branch deployments need server-side authorization, tenant isolation, signed sessions, conflict resolution, retention/deletion controls and tamper-evident audit logs.
- No cloud sync or telemetry is enabled by default.

## Tax and accounting

Tax rules must be jurisdiction-specific, versioned and effective-dated. Each issued invoice stores the applied rate snapshot. The current UI's selectable rate is a simple configurable input and is **not** a statutory GST engine. Do not claim GST compliance, e-invoice/IRN or e-way bill support until current official requirements and qualified tax review are complete.
