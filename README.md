# AInvoice

**Simple billing for every business. Serious controls when you need them.**

AInvoice is an open-source, offline-first billing app for independent shops, retailers, wholesalers and large dealers. The interface is designed for non-technical users; the data model is designed to grow with the business.

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](./LICENSE)

## Open source

AInvoice is licensed under **Apache License 2.0**. You may use it commercially, inspect the source, modify it, redistribute it and build private or public services from it, subject to the license terms. Contributions are made under the same license unless explicitly agreed otherwise. See [LICENSE](./LICENSE) and [CONTRIBUTING.md](./CONTRIBUTING.md).

## Product principles

1. **Start billing immediately** — first-run setup should take minutes, not a training session.
2. **Offline by default** — core sales workflows work without an internet connection; data is stored locally on the device.
3. **Simple by default, capable on demand** — Quick Bill for a small shop; optional advanced workflows for larger dealers.
4. **Your language** — English, Hindi and Marathi are the first interface locales, with a structure for more.
5. **Private by design** — no advertising SDKs or analytics by default; explicit export, backup and sync controls.
6. **Trustworthy records** — immutable invoice snapshots, clear audit events, backups and tested calculations.

## First release scope

- Guided business setup and local device lock (4–6 digit PIN; optional pattern unlock).
- Products/services, customers and suppliers.
- Fast GST / non-GST billing with discounts, configurable tax modes, payment mode and round-off.
- Invoice list, print-ready invoice, PDF export and share.
- Payment collection, due/credit book and simple sales summaries.
- Optional stock quantities and low-stock warnings.
- Installable offline application shell and local IndexedDB storage.
- English, Hindi and Marathi UI dictionaries.
- Backup/restore with clear warnings and validation.

## Technology direction

The first client is an installable Progressive Web App (PWA): React + TypeScript + Vite, Dexie/IndexedDB for local data, and a service worker for offline app assets. Billing rules live outside UI components. A future sync service or native shell must not be required for core billing.

## Security status — read before real business use

The PIN is an app-entry convenience gate, not a substitute for operating-system security or audited encryption. Browser IndexedDB is not automatically encrypted by this design. Do not store production-sensitive financial data in an unreviewed build. Encrypted backups, recovery, multi-user permissions, key management and independent security testing are release gates, not claims of the current prototype. See [SECURITY.md](./SECURITY.md).

## Development

Requires Node.js 20+ and pnpm.

    pnpm install
    pnpm dev
    pnpm test
    pnpm build

See [docs/PRODUCT_SPEC.md](./docs/PRODUCT_SPEC.md), [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md), [docs/ROADMAP.md](./docs/ROADMAP.md), [SECURITY.md](./SECURITY.md) and [DEEPSEEK_HARNESS.md](./DEEPSEEK_HARNESS.md).

## Project status

Early development. This repository is a product foundation, not production-ready accounting or tax software. Tax calculations, invoice formats and regulatory integrations must be validated against applicable rules and reviewed by qualified professionals before commercial release.

## License

Apache-2.0. Third-party dependencies and optional integrations keep their own licenses.
