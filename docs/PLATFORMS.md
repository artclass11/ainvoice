# AInvoice platform support and downloads

AInvoice uses one React/TypeScript frontend with two delivery paths:

- **PWA:** install from a secure website in a supported browser. Useful for a quick start and the easiest distribution.
- **Tauri native shell:** packages the same frontend as Windows, macOS, Linux, Android and iOS applications.

The native shell embeds the frontend assets, so the core screen does not need a web server or internet connection at startup. Browser IndexedDB is used by the current local data layer inside the WebView. This is an initial native wrapper and must pass platform QA, storage persistence tests, and restore/recovery tests before it is promoted as a production release.

## Build status

| Platform | Target package | Build pipeline | Signing / distribution requirement |
|---|---|---|---|
| Windows 10/11 | NSIS .exe, MSI .msi | Tag-triggered native release workflow | Code signing recommended for trusted public distribution |
| macOS | .dmg | Tag-triggered native release workflow | Apple Developer certificate and notarization for normal direct distribution |
| Linux | .AppImage, .deb, .rpm | Tag-triggered native release workflow | Package signing recommended; dependencies vary by distribution |
| Android | .apk, .aab | Manual signing workflow | A private upload keystore is required; Play publishing requires Play Console setup |
| iOS / iPadOS | .ipa / App Store | Native project can be initialized and built on macOS | Apple Developer membership, certificate and provisioning profile required |

**A release link is not shown as available until an artifact exists.** The source-code ZIP is available immediately, but it is not a platform installer: https://github.com/artclass11/ainvoice/archive/refs/heads/main.zip

The native installer download page is:

https://github.com/artclass11/ainvoice/releases

When a tagged release completes, its assets will appear there. The latest-release endpoint becomes a direct download source only after the first release has been published.

## Install the PWA

The planned GitHub Pages web URL is https://artclass11.github.io/ainvoice/ . To publish it, enable **Settings → Pages → Build and deployment → GitHub Actions** once; the repository workflow then deploys the browser app from `main`.

1. Open the deployed AInvoice website in Chrome or Edge on desktop, or a supported browser on Android.
2. Use the browser's Install app / Add to Home Screen command.
3. On iPhone or iPad, open the website in Safari, tap Share, then Add to Home Screen.
4. Launch AInvoice from the installed app icon.

PWA behavior and installation menus differ by browser and OS version. Safari on iOS has a different installation path; this is not the same as an App Store native installation.

## Build native desktop installers locally

Prerequisites are platform-specific: Rust stable, Node.js, pnpm, and the native WebView/build dependencies from the official Tauri v2 prerequisite guide.

https://v2.tauri.app/start/prerequisites/

    pnpm install
    pnpm tauri dev
    pnpm tauri build

Expected outputs appear under src-tauri/target/release/bundle/:

- Windows: nsis/ and msi/
- macOS: dmg/ and macos/
- Linux: appimage/, deb/, and rpm/ when the runner has the required packaging dependencies

## Build Android

Install Android Studio, JDK 17 or the currently supported JDK, Android SDK Platform, SDK Platform Tools, Android SDK Build Tools and NDK. Configure JAVA_HOME and Android SDK environment variables.

    pnpm install
    pnpm tauri android init
    pnpm tauri android build --apk --split-per-abi

Before running the Android workflow, create an upload keystore and configure repository Actions secrets `ANDROID_KEY_BASE64`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`. The signing key must be backed up securely. Configure the Android signing key in src-tauri/gen/android/keystore.properties and the generated Gradle signingConfigs.release block. Never commit the keystore or properties file. The signing workflow expects GitHub Actions secrets named ANDROID_KEY_BASE64, ANDROID_KEY_ALIAS and ANDROID_KEY_PASSWORD.

## Prepare iOS signing secrets

For the manual signing path in this repository's GitHub Actions workflow, configure repository Actions secrets `IOS_CERTIFICATE` (base64 `.p12` export), `IOS_CERTIFICATE_PASSWORD`, and `IOS_MOBILE_PROVISION` (base64 profile). An Apple Developer program membership and registered App ID are required; iOS installs and App Store distribution require signing. See the official [Tauri iOS signing guide](https://v2.tauri.app/distribute/sign/ios/).

## Build iOS

iOS builds require macOS, Xcode and Apple's signing infrastructure.

    pnpm install
    pnpm tauri ios init
    pnpm tauri ios build

An installable IPA / App Store submission requires an App ID, Apple Developer program membership, distribution certificate and provisioning profile. Store distribution and signing are not created by merely compiling the frontend.

## Native data and privacy notes

- Current local records live in the WebView IndexedDB store for the AInvoice app origin.
- Do not clear app/browser data until a backup has been exported and verified.
- Encrypted backup files are AES-256-GCM protected and use a password-derived key; losing the password means the backup cannot be recovered.
- The PIN is an app-entry lock only. It does not encrypt the live IndexedDB database.
- Do not use this early-access build as the only record of production transactions.

## Reference documentation

- Tauri platforms and project model: https://tauri.app/
- Tauri distribution formats: https://v2.tauri.app/distribute/
- Android signing: https://v2.tauri.app/distribute/sign/android/
- iOS signing: https://v2.tauri.app/distribute/sign/ios/
