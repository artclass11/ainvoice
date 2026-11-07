# AInvoice

**Simple billing for every business. Serious controls when you need them.**

AInvoice is an offline-first billing and business app for independent shops, retailers, wholesalers and large dealers. The interface is designed for non-technical users; the data model and security boundaries are designed to grow with the business.

## Product principles

1. **Start billing immediately** — first-run setup should take minutes, not a training session.
2. **Offline by default** — invoices and business data are stored on the device; core workflows do not require an internet connection.
3. **Simple by default, capable on demand** — Quick Bill for a small shop; optional advanced workflows for dealers.
4. **Your language** — English, Hindi and Marathi are the first interface locales, with a structure for more.
5. **Private by design** — no advertising SDKs or analytics by default; explicit export, backup and sync controls.
6. **Trustworthy records** — immutable invoice snapshots, clear audit events, backups and tested calculations.

## Status

This repository starts the product foundation and implementation plan. It is not yet production-ready accounting or tax software. Tax calculations, invoice formats and regulatory integrations must be validated against applicable rules before commercial release.

## First release scope

- Guided business setup and local device lock (4–6 digit PIN; optional pattern unlock).
- Products/services, customers and suppliers.
- Fast GST / non-GST sales billing with discounts, tax modes, payment mode and round-off.
- Invoice list, print-ready invoice, PDF export and share.
- Payment collection, due/credit book and simple sales summaries.
- Optional stock quantities and low-stock warnings.
- Offline application shell and local IndexedDB storage.
- English, Hindi and Marathi UI dictionaries.
- Backup/restore with clear warnings and validation.

## Architecture direction

The first client is an installable Progressive Web App (PWA): React + TypeScript + Vite, Dexie/IndexedDB for local data, and a service worker for offline app assets. The domain layer is isolated from UI components so a future native shell or encrypted multi-device sync can be added without rewriting billing logic.

**Security distinction:** a 4-digit PIN is a convenient local app lock, not strong encryption by itself. The PIN must never be treated as the only protection for a backup or as a cryptographic key. Production-grade device encryption, recovery and multi-user access require a separately reviewed key-management design. See SECURITY.md.

## Development

    pnpm install
    pnpm dev
    pnpm test
    pnpm build

See docs/PRODUCT_SPEC.md, docs/ARCHITECTURE.md, SECURITY.md, and DEEPSEEK_HARNESS.md.

## License

The project license will be selected before public distribution. Third-party dependencies retain their own licenses.
