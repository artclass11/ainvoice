# AInvoice

**Easy billing. Smarter business.**

AInvoice is an open-source, offline-first billing application for independent shops, retailers, wholesalers and large dealers. The default workflow is designed for non-technical users; the underlying data model is being expanded for larger operations.

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](./LICENSE)

## Open source

AInvoice is licensed under **Apache License 2.0**. You may use it commercially, inspect the source, modify it, redistribute it and build services from it, subject to the license terms. See [LICENSE](./LICENSE) and [CONTRIBUTING.md](./CONTRIBUTING.md).

## Project poster

![AInvoice project poster](./assets/ainvoice-project-poster.svg)

Download the [AInvoice project poster (SVG)](./assets/ainvoice-project-poster.svg).

## Supported platforms

AInvoice has two delivery options:

- **Installable PWA:** Windows, macOS, Linux, Android and iOS/iPadOS through supported browsers.
- **Tauri native application:** native build targets for Windows, macOS, Linux, Android and iOS from the shared frontend.

Native packaging and signing requirements vary by platform. Windows/macOS/Linux installers are built on version tags. Android requires a private upload keystore in GitHub Actions secrets. iOS requires Apple signing certificates and provisioning. Do not mistake a shared codebase for completed platform certification.

See [PLATFORMS.md](./docs/PLATFORMS.md) for platform details and installation/build steps.

## Current application features

- Guided local business setup and a 4–6 digit app-entry PIN.
- English, Hindi and Marathi interface foundations.
- Local product catalogue with SKU uniqueness, unit, sale/purchase prices, tax category and optional stock tracking.
- Customer book with contact details, tax ID, opening balance and credit limit.
- Multi-item sales invoices with quantity, line discount, configurable tax rate, notes and payment capture.
- Partial payments, cash/UPI/bank/card/other payment methods and a cash-book view.
- Stock decrement on tracked-item sales; stock restoration when an unpaid invoice is voided.
- Invoice search, print layout, basic sales/collections reports and low-stock count.
- Audit events for core local business changes.
- Password-encrypted backup export and restore using AES-256-GCM.

## Promotional video — Hindi

A 25-second vertical Hindi promotional cut has been created for AInvoice. The repository contains its [production notes](./marketing/hindi-promo-2026-11/README.md), [Hindi subtitles](./marketing/hindi-promo-2026-11/ainvoice_promo_hindi.srt), [voiceover script](./marketing/hindi-promo-2026-11/hindi_voiceover_script.md), [shot manifest](./marketing/hindi-promo-2026-11/shot_manifest.json) and [technical QC report](./marketing/hindi-promo-2026-11/QC_REPORT.json).

The encoded MP4 master was delivered separately and is not stored in this Git commit. The current master includes original instrumental music and Hindi on-screen text, but does not yet include spoken narration; human creative review is also pending. See the QC report before using it publicly.

## Development

Requires Node.js 22+, pnpm 9+ and Rust stable for native builds.

    pnpm install
    pnpm dev
    pnpm test
    pnpm typecheck
    pnpm build

Run as a native desktop app:

    pnpm tauri dev

Build a native desktop installer on the current OS:

    pnpm tauri build

Initialize and build Android:

    pnpm tauri android init
    pnpm tauri android build --apk --split-per-abi

Initialize and build iOS on macOS with Xcode and Apple signing:

    pnpm tauri ios init
    pnpm tauri ios build

## Web app for phones and tablets

A GitHub Pages deployment workflow is included for a browser-installable PWA. After enabling **Settings → Pages → Build and deployment → GitHub Actions** once, open https://artclass11.github.io/ainvoice/ on Android or Safari on iPhone/iPad and use the browser's Install / Add to Home Screen option. The web app is also useful on desktop browsers.

## Platform downloads — AInvoice v0.1.0 early access

Choose the installer for your device. These are **early-access preview builds**, not yet a production-certified accounting release.

| Platform | Download | Build status |
|---|---|---|
| Windows 10/11 (64-bit) | [Download .exe installer](https://github.com/artclass11/ainvoice/releases/download/app-v0.1.0/AInvoice_0.1.0_x64-setup.exe) · [Download .msi](https://github.com/artclass11/ainvoice/releases/download/app-v0.1.0/AInvoice_0.1.0_x64_en-US.msi) | Available |
| macOS Apple Silicon (M1/M2/M3/M4) | [Download .dmg](https://github.com/artclass11/ainvoice/releases/download/app-v0.1.0/AInvoice_0.1.0_aarch64.dmg) | Available |
| macOS Intel | [Download .dmg](https://github.com/artclass11/ainvoice/releases/download/app-v0.1.0/AInvoice_0.1.0_x64.dmg) | Available |
| Android (ARM64) | [Download debug preview APK](https://github.com/artclass11/ainvoice/releases/download/app-v0.1.0/AInvoice_0.1.0_android_arm64_debug.apk) | Available — debug-signed preview |
| iPhone / iPad (iOS) | [iOS build workflow](https://github.com/artclass11/ainvoice/actions/workflows/ios.yml) | No installable IPA published yet; Apple signing and provisioning are required |
| Linux (64-bit) | [AppImage](https://github.com/artclass11/ainvoice/releases/download/app-v0.1.0/AInvoice_0.1.0_amd64.AppImage) · [Debian/Ubuntu .deb](https://github.com/artclass11/ainvoice/releases/download/app-v0.1.0/AInvoice_0.1.0_amd64.deb) · [RPM](https://github.com/artclass11/ainvoice/releases/download/app-v0.1.0/AInvoice-0.1.0-1.x86_64.rpm) | Available |

[Open all AInvoice releases](https://github.com/artclass11/ainvoice/releases) · [Source code](https://github.com/artclass11/ainvoice)

**Install notes:** Windows and macOS packages are currently unsigned early-access builds, so the operating system may show an unknown-publisher warning. Android debug APKs are for device testing only and cannot be treated as an upgrade path for a future release signed with a private production key. The Android preview is a 124 MB debug-signed test build, not the production signing key; uninstall it before moving to a separately signed production release. Do not use the preview APK as the only copy of live business data. An iOS IPA will only be published after Apple developer signing is configured; the workflow link above is not an App Store download.

## Direct downloads

Native desktop installers are published to GitHub Releases after a version tag build completes:

**[Download AInvoice releases](https://github.com/artclass11/ainvoice/releases)** — the early-access release includes Windows, macOS and Linux installers.

[Download the current source ZIP](https://github.com/artclass11/ainvoice/archive/refs/heads/main.zip) — this is source code, not a ready-to-install app.

The repository does not yet claim that a signed installer exists for every operating system. Download only files that appear as assets on a published release. Android and iOS distribution require the platform signing configuration described in PLATFORMS.md.

## Important security and compliance status

AInvoice is in **early development**, not yet a production-ready accounting or tax system.

- The PIN is an app-entry gate, not database encryption.
- Live browser/WebView IndexedDB data is not automatically encrypted at rest.
- Exported backup files are encrypted, but losing the backup password makes the backup unrecoverable.
- Multi-user permissions, branch/tenant isolation, encrypted multi-device sync, supplier/purchase ledgers, refunds/credit notes, full accounting controls and independent security testing are not complete.
- GST, e-invoicing, IRN, e-way bills and other statutory features must not be treated as compliant until current official rules and qualified review are incorporated.

Read [SECURITY.md](./SECURITY.md) and [ENTERPRISE_READINESS.md](./docs/ENTERPRISE_READINESS.md) before entering live business records.

## Product and engineering documents

- [Product specification](./docs/PRODUCT_SPEC.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Platform builds and downloads](./docs/PLATFORMS.md)
- [Enterprise readiness plan](./docs/ENTERPRISE_READINESS.md)
- [Engineering quality scorecard and production gates](./docs/QUALITY_SCORECARD.md)
- [Roadmap](./docs/ROADMAP.md)
- [DeepSeek Harness workflow](./DEEPSEEK_HARNESS.md)
- [Agent instructions](./AGENTS.md)

## License

Apache-2.0. Third-party dependencies and optional integrations retain their own licenses.
