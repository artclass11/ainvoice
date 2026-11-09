# AInvoice platform verification

**Scope:** Pro feature branch compatibility checks  
**Workflow:** [Platform compatibility](../.github/workflows/platform-checks.yml)  
**Not a certification:** CI builds prove that platform-specific artifacts compile; they do not prove runtime behavior on every OS release, device, browser, printer, filesystem or WebView.

## Automated checks required on each pull request

| Platform | Automated check | What the result proves | What it does not prove |
|---|---|---|---|
| Web / PWA | Production Vite build, manifest/service-worker/icon verification | Installable PWA assets are emitted and internally consistent | Browser installation, offline use, IndexedDB retention after browser updates, service-worker upgrade behavior |
| Windows x64 | Tauri native executable build on Windows runner | Rust/Win32/WebView2 app compiles | Signed installer, Windows SmartScreen, physical machine WebView2 runtime, suspend/resume and file export |
| macOS | Tauri native executable build on macOS runner | macOS native app compiles for the runner architecture | Intel/Apple Silicon installer variants, signing, notarization, Gatekeeper and real-device data persistence |
| Linux x64 | Tauri native executable build on Ubuntu with WebKitGTK dependencies | Linux native app compiles and links | AppImage/DEB/RPM installation on supported distributions, package signatures, desktop environments and WebKitGTK versions |
| Android ARM64 | Tauri Android debug APK, ZIP integrity check | Android project and ARM64 APK compile without a release signing secret | Install/launch on a physical phone, Android API coverage, keyboard, back navigation, lifecycle/storage persistence and release keystore |
| iOS Simulator | Tauri debug Simulator build on macOS | iOS project and simulator target compile without an Apple distribution profile | Signed device IPA, App Store/TestFlight, iPhone/iPad launch, WKWebView persistence and physical-device lifecycle |

The workflow does not publish installers. It produces temporary Android debug and iOS Simulator artifacts for inspection. Desktop jobs compile the native executable without packaging or signing.

## Manual release-candidate device matrix

Before a platform can be described as "working properly" or a release can be published, run the following against the exact release-candidate commit and record device/OS/browser versions:

- Fresh install, first-run setup, PIN lock/unlock, app restart and update.
- Create/edit/search customers, suppliers and products; issue an invoice; record partial/final payments; receive a purchase; adjust and reconcile stock.
- Export backup, close app, restore on a clean profile, verify invoices, payments, opening balances, purchases, audit history and stock.
- Confirm IndexedDB data survives force-quit, OS reboot, low-memory process termination, WebView/browser update and app update.
- Confirm no data loss after storage quota/permission failures; export and download files to the expected OS location.
- Validate screen sizes, touch targets, keyboard focus, screen readers, locale input and date/currency formatting.
- Print or share invoice output on supported devices.

## Data protection warning

A passing compile does not change the application's live-data encryption status. The released 0.1.1 baseline and this Pro preview do not yet have the unfinished encrypted-live-storage PR #9 merged. Keep password-encrypted backups, test restores and do not use a preview as the sole copy of business or statutory records.

## Platform distribution constraints

- Windows and macOS public distribution should use trusted publisher signing; macOS direct distribution also needs notarization.
- Android production distribution must use the permanent private upload keystore; never use the debug APK from the compatibility workflow for production.
- iOS device/App Store distribution requires Apple Developer signing and provisioning; the Simulator artifact is not installable on an iPhone.
- Linux release packages must be tested on supported distributions and their required WebKitGTK versions.
